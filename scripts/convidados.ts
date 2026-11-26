import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { armazemDecisoesEmArquivo, CAMINHO_DECISOES_PADRAO } from "../lib/armazem-decisoes";
import {
  formatarData,
  formatarDataHora,
  grupoConhecido,
  linhasDasContagens,
  MOTIVO_SEM_PLANILHA_DA_CAMARA,
  motivoSemDivergencias,
  textoDaOrigem,
  textoDasContagensDeDivergencias,
  textoDasDecisoes,
  textoDoComando,
  textoDoProtocolo,
} from "../lib/convidados/comando";
import { compararComSite } from "../lib/convidados/divergencias";
import type { ReferenciasEleicao } from "../lib/convidados/duplicidade";
import { lerLista, type ListaDeEntrada } from "../lib/convidados/lista";
import { maisRecente, nomeConferencia, nomeDaPastaDaRodada, nomeDivergencias, nomeImportacao, sufixoDaData } from "../lib/convidados/rodada-nomes";
import { gerarConferencia, gerarImportacao } from "../lib/convidados/saida";
import { gerarDivergencias } from "../lib/convidados/saida-divergencias";
import type { MetaRodada, Rodada } from "../lib/convidados/tipos";
import { tratarLista } from "../lib/convidados/tratar";
import type { HistoricoDecisoes } from "../lib/decisoes";
import { ColunaFaltanteError, lerPlanilha } from "../lib/planilha";
import { lerPlanilhaEnderecos } from "../lib/planilha-enderecos";
import { lerPlanilhaEleicao, PlanilhaEleicaoDesconhecidaError } from "../lib/planilha-eleitos";
import type { ContatoPlanilha, DeputadoAtual, EleitoPlanilha, EnderecoEstruturado, GovernadorPlanilha } from "../lib/types";

const PASTA_BASES = "Bases de comparação -PLANILHAS CONTATOS";
const ELEITOS_PADRAO = "../GT Posse/Eleitos 2026";
const SAIDA_PADRAO = "../GT Posse/Contatos/Tratamento - Lista de Convidados";
const NOME_MODELO = "Modelo_Importacao_Contatos_PRODASEN.xlsx";

const USO = [
  `Uso: npm run convidados -- "<lista.xlsx | deputado.xls da Câmara>" --grupo "<rótulo do grupo>"`,
  "  [--base <xlsx>] [--enderecos <xlsx>] [--eleitos <pasta>] [--saida <pasta>] [--modelo <xlsx>]",
  "  [--preencher-protocolo]   preenche Tratamento e Endereçamento vazios pela regra (só depois do aval do GT)",
  "  [--camara <deputado.xls>] planilha do site da Câmara do dia, para a planilha de divergências (Deputados Federais)",
  `  [--decisoes <json>]       registro de decisões do GT (padrão: ${CAMINHO_DECISOES_PADRAO})`,
].join("\n");

interface Opcoes {
  lista: string;
  grupo: string;
  base?: string;
  enderecos?: string;
  eleitos: string;
  saida: string;
  modelo?: string;
  preencherProtocolo: boolean;
  camara?: string;
  decisoes: string;
}

class FalhaDeUso extends Error {}

/** Arquivo de entrada com colunas faltando; a mensagem já diz qual arquivo. */
class FalhaDeLeitura extends Error {}

const PREFIXO_TEMPORARIO_DO_EXCEL = "~$";
const TAMANHO_DO_MOTIVO = 80;

function lerArgumentos(argv: string[]): Opcoes {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      grupo: { type: "string" },
      base: { type: "string" },
      enderecos: { type: "string" },
      eleitos: { type: "string" },
      saida: { type: "string" },
      modelo: { type: "string" },
      "preencher-protocolo": { type: "boolean" },
      camara: { type: "string" },
      decisoes: { type: "string" },
    },
  });
  const lista = positionals[0];
  if (!lista || !values.grupo) throw new FalhaDeUso(USO);
  return {
    lista,
    grupo: values.grupo,
    base: values.base,
    enderecos: values.enderecos,
    eleitos: values.eleitos ?? ELEITOS_PADRAO,
    saida: values.saida ?? SAIDA_PADRAO,
    modelo: values.modelo,
    preencherProtocolo: values["preencher-protocolo"] ?? false,
    camara: values.camara,
    decisoes: values.decisoes ?? CAMINHO_DECISOES_PADRAO,
  };
}

function lerBuffer(caminho: string): ArrayBuffer {
  const b = readFileSync(caminho);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function baseMaisRecente(raiz: string, prefixo: string, rotulo: string): string {
  const pasta = join(raiz, PASTA_BASES);
  const nome = existsSync(pasta) ? maisRecente(readdirSync(pasta), prefixo) : undefined;
  if (!nome) throw new Error(`${rotulo} não encontrada em "${pasta}" (prefixo "${prefixo}"). Informe o caminho com a opção correspondente.`);
  return join(pasta, nome);
}

function exigirArquivo(caminho: string, rotulo: string): string {
  if (!existsSync(caminho)) throw new Error(`${rotulo} não encontrado: ${caminho}`);
  return caminho;
}

/** `arquivosDeputados`: caminhos das planilhas do site da Câmara (tipo `atuais`) achadas na pasta. */
interface ReferenciasLidas {
  referencias: ReferenciasEleicao;
  nomes: string[];
  arquivosDeputados: string[];
}

function lerReferencias(pasta: string): ReferenciasLidas {
  const deputados: DeputadoAtual[] = [];
  const eleitos: EleitoPlanilha[] = [];
  const governadores: GovernadorPlanilha[] = [];
  const nomes: string[] = [];
  const arquivosDeputados: string[] = [];
  if (!existsSync(pasta)) return { referencias: { deputados, eleitos, governadores }, nomes, arquivosDeputados };
  for (const nome of readdirSync(pasta)) {
    if (![".xlsx", ".xls"].includes(extname(nome).toLowerCase())) continue;
    // Arquivo de trava do Excel aberto ("~$Planilha.xlsx"): não é planilha.
    if (nome.startsWith(PREFIXO_TEMPORARIO_DO_EXCEL)) continue;
    const caminho = join(pasta, nome);
    try {
      const arquivo = lerPlanilhaEleicao(lerBuffer(caminho));
      if (arquivo.tipo === "atuais") {
        deputados.push(...arquivo.deputados);
        arquivosDeputados.push(caminho);
      } else if (arquivo.tipo === "governo") governadores.push(...arquivo.governadores.eleitos);
      else eleitos.push(...arquivo.eleitos);
      nomes.push(nome);
    } catch (e) {
      if (e instanceof PlanilhaEleicaoDesconhecidaError || e instanceof ColunaFaltanteError) continue;
      // Arquivo que a leitura de planilha não consegue abrir: a rodada segue sem ele.
      console.log(`Referência ignorada: ${nome} (${motivoCurto(e)})`);
    }
  }
  return { referencias: { deputados, eleitos, governadores }, nomes, arquivosDeputados };
}

/** Primeira linha da mensagem do erro, curta; a mensagem da leitura de planilha é técnica, sem dado da planilha. */
function motivoCurto(e: unknown): string {
  const mensagem = (e instanceof Error ? e.message : String(e)).split(/\r?\n/)[0].trim();
  if (mensagem === "") return "não foi possível ler a planilha";
  return mensagem.length > TAMANHO_DO_MOTIVO ? `${mensagem.slice(0, TAMANHO_DO_MOTIVO)}…` : mensagem;
}

/** Lê um arquivo de entrada e troca a falta de colunas por uma mensagem que diz qual arquivo. */
function lerOuFalhar<T>(ler: () => T, rotulo: string): T {
  try {
    return ler();
  } catch (e) {
    if (e instanceof ColunaFaltanteError) throw new FalhaDeLeitura(`${rotulo} não reconhecida: ${e.message}`);
    throw e;
  }
}

/** A planilha de `--camara` tem que ser a dos deputados em exercício do site (tipo `atuais`); outra planilha é erro claro. */
function lerDeputadosDoSite(caminho: string): DeputadoAtual[] {
  const rotulo = "Planilha da Câmara";
  try {
    const arquivo = lerPlanilhaEleicao(lerBuffer(caminho));
    if (arquivo.tipo === "atuais") return arquivo.deputados;
    throw new FalhaDeLeitura(`${rotulo} não reconhecida: ${basename(caminho)} não traz as colunas dos deputados em exercício do site.`);
  } catch (e) {
    if (e instanceof ColunaFaltanteError || e instanceof PlanilhaEleicaoDesconhecidaError) {
      throw new FalhaDeLeitura(`${rotulo} não reconhecida: ${e.message}`);
    }
    throw e;
  }
}

/**
 * Arquivo ausente, ilegível (`DecisoesIlegiveisError`) ou com outro erro de leitura vira aviso e `null`:
 * a coluna do GT diz "registro de decisões não lido" e a rodada segue (§16.6).
 */
async function lerDecisoes(caminho: string): Promise<HistoricoDecisoes | null> {
  const aviso = (motivo: string): null => {
    console.log(`Aviso: registro de decisões não lido (${motivo})`);
    return null;
  };
  if (!existsSync(caminho)) return aviso(`arquivo não encontrado: ${basename(caminho)}`);
  try {
    return await armazemDecisoesEmArquivo(caminho).ler();
  } catch (e) {
    return aviso(motivoCurto(e));
  }
}

interface Caminhos {
  lista: string;
  base: string;
  enderecos: string;
  modelo: string;
  saida: string;
  decisoes: string;
}

function resolverCaminhos(opcoes: Opcoes, raiz: string): Caminhos {
  const saida = resolve(raiz, opcoes.saida);
  return {
    lista: exigirArquivo(resolve(raiz, opcoes.lista), "Lista"),
    base: exigirArquivo(opcoes.base ? resolve(raiz, opcoes.base) : baseMaisRecente(raiz, "BASE GRUPOS POSSE", "Base de grupos"), "Base de grupos"),
    enderecos: exigirArquivo(opcoes.enderecos ? resolve(raiz, opcoes.enderecos) : baseMaisRecente(raiz, "BASE ENDERECO", "Base de endereços"), "Base de endereços"),
    modelo: exigirArquivo(resolve(raiz, opcoes.modelo ?? join(saida, NOME_MODELO)), "Modelo de importação"),
    saida,
    decisoes: resolve(raiz, opcoes.decisoes),
  };
}

/** Planilha do site da Câmara usada nas divergências: a de `--camara` ou, sem a opção, a única reconhecida em `--eleitos`. */
interface FonteDaCamara {
  caminho: string;
  deputados: readonly DeputadoAtual[];
}

/** `planilhas` conta as planilhas do site com deputados; `fonte` só existe quando é exatamente uma. */
interface PlanilhasDaCamara {
  planilhas: number;
  fonte?: FonteDaCamara;
}

function planilhasDaCamara(opcoes: Opcoes, raiz: string, lidas: ReferenciasLidas): PlanilhasDaCamara {
  if (opcoes.camara !== undefined) {
    const caminho = exigirArquivo(resolve(raiz, opcoes.camara), "Planilha da Câmara");
    const deputados = lerDeputadosDoSite(caminho);
    return deputados.length > 0 ? { planilhas: 1, fonte: { caminho, deputados } } : { planilhas: 0 };
  }
  const { arquivosDeputados, referencias } = lidas;
  if (arquivosDeputados.length !== 1 || referencias.deputados.length === 0) return { planilhas: arquivosDeputados.length };
  return { planilhas: 1, fonte: { caminho: arquivosDeputados[0], deputados: referencias.deputados } };
}

interface Entradas {
  lida: ListaDeEntrada;
  base: ContatoPlanilha[];
  enderecos: EnderecoEstruturado[];
  referencias: ReferenciasEleicao;
  nomesRef: string[];
  camara: PlanilhasDaCamara;
  decisoes: HistoricoDecisoes | null;
}

async function lerEntradas(opcoes: Opcoes, raiz: string, caminhos: Caminhos): Promise<Entradas> {
  const lida = lerOuFalhar(() => lerLista(lerBuffer(caminhos.lista), { protocoloOpcional: opcoes.preencherProtocolo }), "Lista");
  const lidas = lerReferencias(resolve(raiz, opcoes.eleitos));
  // A lista da Câmara é a própria referência dos deputados em exercício: "Consta na lista da Câmara" não se calcula.
  const referencias = lida.origem === "camara" ? { ...lidas.referencias, deputados: [] } : lidas.referencias;
  const base = lerOuFalhar(() => lerPlanilha(lerBuffer(caminhos.base)), "Base do Contatos");
  const enderecos = lerOuFalhar(() => lerPlanilhaEnderecos(lerBuffer(caminhos.enderecos)), "Base de endereços");
  const camara = planilhasDaCamara(opcoes, raiz, lidas);
  const decisoes = await lerDecisoes(caminhos.decisoes);
  return { lida, base, enderecos, referencias, nomesRef: lidas.nomes, camara, decisoes };
}

type Divergencias =
  | { gerada: true; nome: string; buffer: ArrayBuffer; resumo: string }
  | { gerada: false; motivo: string };

interface ContextoDivergencias {
  listaNome: string;
  grupo: string;
  sufixo: string;
}

async function montarDivergencias(rodada: Rodada, fonte: FonteDaCamara, ctx: ContextoDivergencias): Promise<Divergencias> {
  const arquivoCamara = basename(fonte.caminho);
  const dataCamara = formatarData(statSync(fonte.caminho).mtime);
  const d = compararComSite(rodada.linhas, fonte.deputados);
  const buffer = await gerarDivergencias(d, { listaNome: ctx.listaNome, arquivoCamara, dataCamara, grupo: ctx.grupo });
  const resumo = `Divergências com o site da Câmara (${arquivoCamara}, ${dataCamara}): ${textoDasContagensDeDivergencias(d.contagens)}`;
  return { gerada: true, nome: nomeDivergencias(ctx.sufixo), buffer, resumo };
}

/** Gera a planilha de divergências só para "Deputados Federais", lista do modelo Padrão e uma única planilha do site (§16.5). */
async function divergenciasDaRodada(rodada: Rodada, entradas: Entradas, ctx: ContextoDivergencias): Promise<Divergencias> {
  const { planilhas, fonte } = entradas.camara;
  const motivo = motivoSemDivergencias(ctx.grupo, entradas.lida.origem, planilhas);
  if (motivo !== undefined || fonte === undefined) return { gerada: false, motivo: motivo ?? MOTIVO_SEM_PLANILHA_DA_CAMARA };
  return montarDivergencias(rodada, fonte, ctx);
}

interface ArquivoDeSaida {
  nome: string;
  buffer: ArrayBuffer;
}

/** Cria a pasta da rodada (nunca sobrescreve a de outra rodada do dia) e grava os arquivos nela. */
function gravarArquivos(saida: string, sufixo: string, arquivos: readonly ArquivoDeSaida[]): string {
  mkdirSync(saida, { recursive: true });
  const pasta = join(saida, nomeDaPastaDaRodada(sufixo, readdirSync(saida)));
  mkdirSync(pasta);
  for (const a of arquivos) writeFileSync(join(pasta, a.nome), Buffer.from(a.buffer));
  return pasta;
}

function imprimirCabecalho(opcoes: Opcoes, entradas: Entradas, rodada: Rodada, meta: MetaRodada, caminhoDecisoes: string): void {
  console.log(`Lista: ${meta.listaNome} (${rodada.contagens.linhas} linhas)`);
  console.log(textoDaOrigem(entradas.lida));
  console.log(`Grupo: ${opcoes.grupo}`);
  console.log(textoDoProtocolo(opcoes.preencherProtocolo));
  console.log(`Base: ${meta.baseNome}`);
  console.log(`Endereços: ${meta.enderecosNome}`);
  console.log(`Referências: ${entradas.nomesRef.length > 0 ? entradas.nomesRef.join(", ") : "nenhuma"}`);
  console.log(textoDasDecisoes(entradas.decisoes, basename(caminhoDecisoes)));
}

function imprimirRelatorio(rodada: Rodada, divergencias: Divergencias, pasta: string, nomes: readonly string[]): void {
  console.log("");
  for (const linha of linhasDasContagens(rodada.contagens)) console.log(linha);
  console.log("");
  console.log(divergencias.gerada ? divergencias.resumo : `Planilha de divergências: não gerada (${divergencias.motivo})`);
  console.log("");
  console.log(`Gravado em ${pasta}:`);
  for (const nome of nomes) console.log(nome);
}

async function executar(opcoes: Opcoes): Promise<void> {
  const raiz = process.cwd();
  const caminhos = resolverCaminhos(opcoes, raiz);
  const entradas = await lerEntradas(opcoes, raiz, caminhos);
  if (!grupoConhecido(opcoes.grupo, entradas.base)) {
    console.log(`Aviso: o grupo "${opcoes.grupo}" não está entre os grupos da Posse nem na base; toda pessoa já cadastrada sairá como "em outro grupo".`);
  }
  const rodada = tratarLista({
    linhas: entradas.lida.linhas, grupo: opcoes.grupo, base: entradas.base, enderecos: entradas.enderecos,
    referencias: entradas.referencias, preencherProtocolo: opcoes.preencherProtocolo, decisoes: entradas.decisoes,
  });

  const agora = new Date();
  const sufixo = sufixoDaData(agora);
  const listaNome = basename(caminhos.lista);
  const divergencias = await divergenciasDaRodada(rodada, entradas, { listaNome, grupo: opcoes.grupo, sufixo });
  const linhas = entradas.lida.linhas;
  const meta: MetaRodada = {
    listaNome,
    primeiraLinha: linhas.length > 0 ? linhas[0].linha : 0,
    ultimaLinha: linhas.length > 0 ? linhas[linhas.length - 1].linha : 0,
    baseNome: basename(caminhos.base),
    enderecosNome: basename(caminhos.enderecos),
    referencias: entradas.nomesRef,
    geradoEm: formatarDataHora(agora),
    origem: entradas.lida.origem,
    aba: entradas.lida.aba,
    comando: textoDoComando({
      lista: listaNome, grupo: opcoes.grupo, preencherProtocolo: opcoes.preencherProtocolo,
      ...(opcoes.camara !== undefined ? { camara: basename(opcoes.camara) } : {}),
    }),
    divergencias: divergencias.gerada ? divergencias.nome : `não gerada: ${divergencias.motivo}`,
  };
  const arquivos: ArquivoDeSaida[] = [
    { nome: nomeImportacao(opcoes.grupo, sufixo), buffer: await gerarImportacao(rodada, lerBuffer(caminhos.modelo)) },
    { nome: nomeConferencia(sufixo), buffer: await gerarConferencia(rodada, meta) },
    ...(divergencias.gerada ? [{ nome: divergencias.nome, buffer: divergencias.buffer }] : []),
  ];
  const pasta = gravarArquivos(caminhos.saida, sufixo, arquivos);

  imprimirCabecalho(opcoes, entradas, rodada, meta, caminhos.decisoes);
  imprimirRelatorio(rodada, divergencias, pasta, arquivos.map((a) => a.nome));
}

async function principal(): Promise<number> {
  try {
    await executar(lerArgumentos(process.argv.slice(2)));
    return 0;
  } catch (e) {
    if (e instanceof FalhaDeUso) {
      console.error(e.message);
      return 2;
    }
    if (e instanceof FalhaDeLeitura) {
      console.error(e.message);
      return 1;
    }
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

principal().then((codigo) => {
  process.exitCode = codigo;
});
