import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { lerLista } from "../lib/convidados/lista";
import { tratarLista } from "../lib/convidados/tratar";
import { gerarConferencia, gerarImportacao } from "../lib/convidados/saida";
import { maisRecente, nomeConferencia, nomeDaPastaDaRodada, nomeImportacao, sufixoDaData } from "../lib/convidados/rodada-nomes";
import { mesmoGrupo, type ReferenciasEleicao } from "../lib/convidados/duplicidade";
import type { MetaRodada, Rodada } from "../lib/convidados/tipos";
import { ColunaFaltanteError, lerPlanilha } from "../lib/planilha";
import { lerPlanilhaEnderecos } from "../lib/planilha-enderecos";
import { lerPlanilhaEleicao, PlanilhaEleicaoDesconhecidaError } from "../lib/planilha-eleitos";
import type { ContatoPlanilha, DeputadoAtual, EleitoPlanilha, GovernadorPlanilha } from "../lib/types";
import { GRUPOS_POSSE } from "../data/grupos-posse";

const PASTA_BASES = "Bases de comparação -PLANILHAS CONTATOS";
const ELEITOS_PADRAO = "../GT Posse/Eleitos 2026";
const SAIDA_PADRAO = "../GT Posse/Contatos/Tratamento - Lista de Convidados";
const NOME_MODELO = "Modelo_Importacao_Contatos_PRODASEN.xlsx";

const USO = `Uso: npm run convidados -- "<lista.xlsx | deputado.xls da Câmara>" --grupo "<rótulo do grupo>" [--base <xlsx>] [--enderecos <xlsx>] [--eleitos <pasta>] [--saida <pasta>] [--modelo <xlsx>]`;

const ROTULOS_CONTAGEM: readonly (readonly [keyof Rodada["contagens"], string])[] = [
  ["linhas", "Linhas lidas"],
  ["novos", "Novo: importar"],
  ["novosAlterados", "Novo: com campo alterado"],
  ["novosValidar", "Novo: a validar"],
  ["novosRevisar", "Novo: a revisar"],
  ["jaGrupoEscolhido", "Já no Contatos: no grupo escolhido"],
  ["jaOutroGrupo", "Já no Contatos: em outro grupo"],
  ["repetidas", "Repetida na própria lista"],
  ["semProtocolo", "Sem tratamento ou endereçamento"],
  ["enderecoNovo", "Endereço novo para contato já cadastrado"],
];

interface Opcoes {
  lista: string;
  grupo: string;
  base?: string;
  enderecos?: string;
  eleitos: string;
  saida: string;
  modelo?: string;
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

function lerReferencias(pasta: string): { referencias: ReferenciasEleicao; nomes: string[] } {
  const deputados: DeputadoAtual[] = [];
  const eleitos: EleitoPlanilha[] = [];
  const governadores: GovernadorPlanilha[] = [];
  const nomes: string[] = [];
  if (!existsSync(pasta)) return { referencias: { deputados, eleitos, governadores }, nomes };
  for (const nome of readdirSync(pasta)) {
    if (![".xlsx", ".xls"].includes(extname(nome).toLowerCase())) continue;
    // Arquivo de trava do Excel aberto ("~$Planilha.xlsx"): não é planilha.
    if (nome.startsWith(PREFIXO_TEMPORARIO_DO_EXCEL)) continue;
    try {
      const arquivo = lerPlanilhaEleicao(lerBuffer(join(pasta, nome)));
      if (arquivo.tipo === "atuais") deputados.push(...arquivo.deputados);
      else if (arquivo.tipo === "governo") governadores.push(...arquivo.governadores.eleitos);
      else eleitos.push(...arquivo.eleitos);
      nomes.push(nome);
    } catch (e) {
      if (e instanceof PlanilhaEleicaoDesconhecidaError || e instanceof ColunaFaltanteError) continue;
      // Arquivo que a leitura de planilha não consegue abrir: a rodada segue sem ele.
      console.log(`Referência ignorada: ${nome} (${motivoCurto(e)})`);
    }
  }
  return { referencias: { deputados, eleitos, governadores }, nomes };
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

/** O grupo escolhido casa algum dos 28 grupos da Posse (rótulo ou apelido) ou algum grupo da base. */
function grupoConhecido(grupo: string, base: readonly ContatoPlanilha[]): boolean {
  const daPosse = GRUPOS_POSSE.flatMap((g) => [g.rotulo, ...(g.apelidos ?? [])]);
  const daBase = base.flatMap((c) => c.grupo.split(";").map((g) => g.trim()).filter(Boolean));
  return [...daPosse, ...daBase].some((rotulo) => mesmoGrupo(rotulo, grupo));
}

function dataHora(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function imprimirContagens(rodada: Rodada): void {
  for (const [campo, rotulo] of ROTULOS_CONTAGEM) console.log(`${rotulo}: ${rodada.contagens[campo]}`);
}

async function executar(opcoes: Opcoes): Promise<void> {
  const raiz = process.cwd();
  const caminhoLista = exigirArquivo(resolve(raiz, opcoes.lista), "Lista");
  const saida = resolve(raiz, opcoes.saida);
  const caminhoBase = exigirArquivo(opcoes.base ? resolve(raiz, opcoes.base) : baseMaisRecente(raiz, "BASE GRUPOS POSSE", "Base de grupos"), "Base de grupos");
  const caminhoEnderecos = exigirArquivo(opcoes.enderecos ? resolve(raiz, opcoes.enderecos) : baseMaisRecente(raiz, "BASE ENDERECO", "Base de endereços"), "Base de endereços");
  const caminhoModelo = exigirArquivo(resolve(raiz, opcoes.modelo ?? join(saida, NOME_MODELO)), "Modelo de importação");

  const lida = lerOuFalhar(() => lerLista(lerBuffer(caminhoLista)), "Lista");
  const linhas = lida.linhas;
  const lidas = lerReferencias(resolve(raiz, opcoes.eleitos));
  const nomesRef = lidas.nomes;
  // A lista da Câmara é a própria referência dos deputados em exercício: "Consta na lista da Câmara" não se calcula.
  const referencias = lida.origem === "camara" ? { ...lidas.referencias, deputados: [] } : lidas.referencias;
  const base = lerOuFalhar(() => lerPlanilha(lerBuffer(caminhoBase)), "Base do Contatos");
  const enderecos = lerOuFalhar(() => lerPlanilhaEnderecos(lerBuffer(caminhoEnderecos)), "Base de endereços");
  if (!grupoConhecido(opcoes.grupo, base)) {
    console.log(`Aviso: o grupo "${opcoes.grupo}" não está entre os 28 grupos da Posse nem na base; toda pessoa já cadastrada sairá como "em outro grupo".`);
  }
  const rodada = tratarLista({ linhas, grupo: opcoes.grupo, base, enderecos, referencias });

  const agora = new Date();
  const sufixo = sufixoDaData(agora);
  const meta: MetaRodada = {
    listaNome: basename(caminhoLista),
    primeiraLinha: linhas.length > 0 ? linhas[0].linha : 0,
    ultimaLinha: linhas.length > 0 ? linhas[linhas.length - 1].linha : 0,
    baseNome: basename(caminhoBase),
    enderecosNome: basename(caminhoEnderecos),
    referencias: nomesRef,
    geradoEm: dataHora(agora),
    origem: lida.origem,
    aba: lida.aba,
    comando: `comando: npm run convidados -- "${basename(caminhoLista)}" --grupo "${opcoes.grupo}"`,
  };
  const importacao = await gerarImportacao(rodada, lerBuffer(caminhoModelo));
  const conferencia = await gerarConferencia(rodada, meta);

  mkdirSync(saida, { recursive: true });
  const pasta = join(saida, nomeDaPastaDaRodada(sufixo, readdirSync(saida)));
  mkdirSync(pasta);
  const arquivoImportacao = nomeImportacao(opcoes.grupo, sufixo);
  const arquivoConferencia = nomeConferencia(sufixo);
  writeFileSync(join(pasta, arquivoImportacao), Buffer.from(importacao));
  writeFileSync(join(pasta, arquivoConferencia), Buffer.from(conferencia));

  console.log(`Lista: ${meta.listaNome} (${rodada.contagens.linhas} linhas)`);
  console.log(
    lida.origem === "camara"
      ? "Origem: planilha do site da Câmara (deputados em exercício)"
      : `Origem: modelo Padrão (aba '${lida.aba}')`,
  );
  console.log(`Grupo: ${opcoes.grupo}`);
  console.log(`Base: ${meta.baseNome}`);
  console.log(`Endereços: ${meta.enderecosNome}`);
  console.log(`Referências: ${nomesRef.length > 0 ? nomesRef.join(", ") : "nenhuma"}`);
  console.log("");
  imprimirContagens(rodada);
  console.log("");
  console.log(`Gravado em ${pasta}:`);
  console.log(arquivoImportacao);
  console.log(arquivoConferencia);
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
