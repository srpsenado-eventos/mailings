import { coerenciasVisiveis, textoCoerencia } from "@/lib/tratamento";
import { excessoDoNumero, LIMITE_NUMERO, rotuloAchadoEndereco } from "@/lib/endereco";
import { normalizarTexto } from "@/lib/normalize";
import type {
  AchadoEndereco,
  AuditoriaEndereco,
  ComparacaoCampo,
  EnderecoEstruturado,
  PessoaSite,
  ResultadoAnalise,
  ResultadoContato,
  ResultadoGrupo,
  ResumoAnalise,
  Retrato,
  SituacaoEndereco,
} from "@/lib/types";

/**
 * O que o painel mostra, decidido fora do JSX: etiquetas por campo, situação da linha,
 * motivo, cartões do detalhe. Os componentes só renderizam o que sai daqui.
 * Ver docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md, §6 e §7.
 */

export type Tom = "ok" | "atencao" | "ruim" | "neutro";
export type CampoEtiqueta = "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte";

export interface Etiqueta {
  campo: CampoEtiqueta;
  texto: string;
  tom: Tom;
  /** Uma frase, mostrada ao passar o cursor: o que a etiqueta quer dizer e por quê. */
  explicacao: string;
}

const EXPLICACAO = {
  confereSite: "Igual ao que o site do órgão publica",
  divergeSite: "O site do órgão publica outro valor; veja no detalhe",
  naoVerificado: "A fonte oficial não pôde ser lida nesta varredura",
  confereProtocolo: "Igual ao que a tabela de protocolo manda para este cargo",
  divergeProtocolo: "Diferente do que a tabela de protocolo manda, ou incoerente com o cargo; veja no detalhe",
  cargoVazio: "O cadastro não informa o cargo; sem ele não há regra de protocolo",
  semParNaFonte: "Ninguém com este nome na composição oficial; confirmar se saiu",
} as const;

/** Explicação da etiqueta "Pessoa da fonte sem par na planilha" (linha de proposta de inclusão). */
export const EXPLICACAO_NOVO = "Pessoa publicada pela fonte, sem par na planilha";

function explicacaoSemRegra(cargo: string | undefined): string {
  if ((cargo ?? "").trim().length === 0) return EXPLICACAO.cargoVazio;
  return `O cargo "${cargo ?? ""}" não foi encontrado na tabela de protocolo; nada foi conferido`;
}

type CampoComparado = "nome" | "cargo" | "tratamento" | "enderecamento";

const ROTULO_CAMPO: Record<CampoComparado, string> = {
  nome: "Nome",
  cargo: "Cargo",
  tratamento: "Tratamento",
  enderecamento: "Endereçamento",
};

const ETIQUETA_ENDERECO: Record<Exclude<SituacaoEndereco, "sem_base" | "pendente" | "a_completar">, { texto: string; tom: Tom; explicacao: string }> = {
  completo: { texto: "Endereço completo", tom: "ok", explicacao: "Logradouro, número, bairro, CEP, cidade e UF presentes no relatório de endereços" },
  nao_verificado: { texto: "Endereço não verificado", tom: "neutro", explicacao: "Nome ambíguo no relatório: mais de um contato com este nome; endereço não atribuído" },
};

/** A comparação de VALOR do campo (site ou protocolo). Coerência é diagnóstico, não valor. */
function comparacaoDeValor(c: ResultadoContato, campo: CampoComparado): ComparacaoCampo | undefined {
  return c.comparacoes.find((x) => x.campo === campo && x.origemValor !== "coerencia");
}

function coerenciasDo(c: ResultadoContato, campo: CampoComparado): ComparacaoCampo[] {
  return coerenciasVisiveis(c.comparacoes).filter((x) => x.campo === campo);
}

/**
 * Etiqueta de um campo comparado. Coerência divergente (Camadas A e C) e valor divergente
 * (Camada 1 ou B) viram o mesmo "diverge": para quem lê a linha, o campo precisa de revisão.
 * `fonte_nao_informa` some; `sem_regra` fica neutro, porque não é divergência.
 */
function etiquetaDoCampo(c: ResultadoContato, campo: CampoComparado): Etiqueta | undefined {
  const rotulo = ROTULO_CAMPO[campo];
  const doSite = campo === "nome" || campo === "cargo";
  const comp = comparacaoDeValor(c, campo);
  if (coerenciasDo(c, campo).length > 0 || comp?.situacao === "divergente") {
    return { campo, texto: `${rotulo} diverge`, tom: "atencao", explicacao: doSite ? EXPLICACAO.divergeSite : EXPLICACAO.divergeProtocolo };
  }
  if (!comp) return { campo, texto: `${rotulo} não verificado`, tom: "neutro", explicacao: EXPLICACAO.naoVerificado };
  if (comp.situacao === "confere") {
    return { campo, texto: `${rotulo} confere`, tom: "ok", explicacao: doSite ? EXPLICACAO.confereSite : EXPLICACAO.confereProtocolo };
  }
  if (comp.situacao === "sem_regra") {
    return { campo, texto: `${rotulo} sem regra`, tom: "neutro", explicacao: explicacaoSemRegra(c.contato.cargo) };
  }
  return undefined; // fonte_nao_informa
}

function cargoEstaVazio(c: ResultadoContato): boolean {
  return (c.contato.cargo ?? "").trim().length === 0;
}

export function etiquetasDoContato(c: ResultadoContato, _g: ResultadoGrupo): Etiqueta[] {
  const lista: Etiqueta[] = [];
  const semCargo = cargoEstaVazio(c);
  if (c.possivelSaida) {
    // Não há com o que comparar nome e cargo; só a Camada C (nome) ainda pode acusar.
    lista.push({ campo: "fonte", texto: "Sem par na fonte", tom: "ruim", explicacao: EXPLICACAO.semParNaFonte });
    const nome = etiquetaDoCampo(c, "nome");
    if (nome?.tom === "atencao") lista.push(nome);
  } else {
    const nome = etiquetaDoCampo(c, "nome");
    if (nome) lista.push(nome);
    if (!semCargo) {
      const cargo = etiquetaDoCampo(c, "cargo");
      if (cargo) lista.push(cargo);
    }
  }
  if (semCargo) {
    // Cadastro sem cargo é dado faltante que a Posse precisa. Sem cargo não há regra de protocolo a
    // procurar (as etiquetas neutras somem), mas os achados da Camada A não dependem do cargo e ficam.
    lista.push({ campo: "cargo", texto: "Cargo vazio", tom: "atencao", explicacao: EXPLICACAO.cargoVazio });
  }
  for (const campo of ["tratamento", "enderecamento"] as const) {
    const e = etiquetaDoCampo(c, campo);
    if (e && (!semCargo || e.tom === "atencao")) lista.push(e);
  }
  const endereco = etiquetaDeEndereco(c);
  if (endereco) lista.push(endereco);
  const numero = etiquetaDoNumero(c);
  if (numero) lista.push(numero);
  return lista;
}

const NOTA_CONTAGEM = "contando espaços e sinais";

function numeroDoEndereco(c: ResultadoContato): string | undefined {
  return c.endereco?.endereco?.numero;
}

/**
 * Medido no valor do relatório, não no achado `numero_longo`: assim o painel acusa também
 * num retrato gravado antes de a regra existir.
 */
function numeroAcimaDoLimite(c: ResultadoContato): boolean {
  return excessoDoNumero(numeroDoEndereco(c)) > 0;
}

function etiquetaDoNumero(c: ResultadoContato): Etiqueta | undefined {
  if (!numeroAcimaDoLimite(c)) return undefined;
  const tamanho = (numeroDoEndereco(c) ?? "").length;
  return {
    campo: "endereco",
    texto: `Número: ${tamanho} de ${LIMITE_NUMERO}`,
    tom: "atencao",
    explicacao: `O campo Número do endereço tem ${tamanho} caracteres, ${NOTA_CONTAGEM}; o máximo é ${LIMITE_NUMERO}`,
  };
}

/** Etiqueta do endereço, sozinha: o bloco de endereço do detalhe a mostra de novo. */
export function etiquetaDeEndereco(c: ResultadoContato): Etiqueta | undefined {
  const a = c.endereco;
  if (!a || a.situacao === "sem_base") return undefined;
  if (a.situacao === "pendente") {
    const motivos = a.achados.map(rotuloAchadoEndereco).join("; ");
    return { campo: "endereco", texto: "Endereço a confirmar", tom: "atencao", explicacao: `Precisa de confirmação por telefone: ${motivos}` };
  }
  if (a.situacao === "a_completar") {
    const motivos = a.achados.map(rotuloAchadoEndereco).join("; ");
    return { campo: "endereco", texto: "Endereço a completar", tom: "neutro", explicacao: `Pode ser completado na conferência dos Correios (Fase 2): ${motivos}` };
  }
  return { campo: "endereco", ...ETIQUETA_ENDERECO[a.situacao] };
}

const PRECISA_REVISAR: readonly Tom[] = ["atencao", "ruim"];

export interface Situacao { texto: string; tom: Tom; explicacao: string }

export function situacaoDoContato(c: ResultadoContato, g: ResultadoGrupo): Situacao {
  if (c.possivelSaida) return { texto: "Possível saída", tom: "ruim", explicacao: EXPLICACAO.semParNaFonte };
  if (g.semFonte) return { texto: "Sem fonte", tom: "neutro", explicacao: "O grupo não tem fonte oficial cadastrada; nome e cargo não foram conferidos" };
  if (c.semaforo === "indeterminado") return { texto: "Não verificado", tom: "neutro", explicacao: EXPLICACAO.naoVerificado };
  const etiquetas = etiquetasDoContato(c, g);
  const aRevisar = etiquetas.filter((e) => PRECISA_REVISAR.includes(e.tom)).length;
  if (aRevisar > 0) return { texto: `${aRevisar} a revisar`, tom: "atencao", explicacao: "Campos em atenção pedem revisão; veja as etiquetas e o detalhe" };
  if (etiquetas.some((e) => e.tom === "neutro")) {
    return { texto: "Nada a revisar", tom: "neutro", explicacao: "Nenhum campo pede revisão; os campos neutros não puderam ser conferidos" };
  }
  return { texto: "Tudo confere", tom: "ok", explicacao: "Todos os campos conferidos batem com as referências" };
}

export function motivoDoContato(c: ResultadoContato, g: ResultadoGrupo): string | undefined {
  if (c.possivelSaida) return "Não consta na fonte: confirmar se saiu";
  if (g.semFonte) return "Sem fonte cadastrada";
  if (g.fonteInacessivel) return "Fonte fora do ar: confira à mão";
  if (c.semaforo === "indeterminado") return "Não verificado: uma fonte não respondeu";
  return undefined;
}

export interface DetalheCampo {
  campo: CampoComparado;
  rotulo: string;
  etiqueta?: Etiqueta;
  valorPlanilha: string;
  origem: string;
  valorReferencia: string;
  copiavel?: string;
  coerencias: string[];
}

const TEXTO_FONTE_NAO_INFORMA = "o site não informa";
const TEXTO_SEM_REGRA = "sem regra de protocolo para este cargo";
const SUFIXO_VIA_IA = " (via IA — confira)";

function origemDe(campo: CampoComparado): string {
  return campo === "nome" || campo === "cargo" ? "Site do órgão diz" : "Tabela de protocolo diz";
}

function valorReferenciaDe(comp: ComparacaoCampo | undefined): string {
  if (!comp) return "";
  if (comp.situacao === "fonte_nao_informa") return TEXTO_FONTE_NAO_INFORMA;
  if (comp.situacao === "sem_regra") return TEXTO_SEM_REGRA;
  const valor = comp.valorEsperado ?? "";
  return valor && comp.origemValor === "conhecimento" ? `${valor}${SUFIXO_VIA_IA}` : valor;
}

/** Um cartão por campo fiscalizado, sempre os quatro e na ordem fixa: o detalhe mostra o que foi preenchido, com ou sem comparação. */
export function detalhesDoContato(c: ResultadoContato, _g: ResultadoGrupo): DetalheCampo[] {
  const cartoes: DetalheCampo[] = [];
  for (const campo of ["nome", "cargo", "tratamento", "enderecamento"] as const) {
    const comp = comparacaoDeValor(c, campo);
    const coerencias = coerenciasDo(c, campo);
    const valorPlanilha = campo === "nome" ? c.contato.nome : (comp?.valorPlanilha ?? coerencias[0]?.valorPlanilha ?? c.contato[campo] ?? "");
    const copiavel = comp?.situacao === "divergente" && comp.valorEsperado ? comp.valorEsperado : undefined;
    cartoes.push({
      campo,
      rotulo: ROTULO_CAMPO[campo],
      etiqueta: etiquetaDoCampo(c, campo),
      valorPlanilha,
      origem: origemDe(campo),
      valorReferencia: valorReferenciaDe(comp),
      ...(copiavel ? { copiavel } : {}),
      coerencias: coerencias.map(textoCoerencia),
    });
  }
  return cartoes;
}

export type Filtro = "tudo" | "ressalva" | "endereco" | "numero" | "saida" | "inclusao";

export const FILTROS: readonly { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "ressalva", rotulo: "Só o que tem ressalva" },
  { id: "endereco", rotulo: "Endereço a confirmar" },
  { id: "numero", rotulo: `Número acima de ${LIMITE_NUMERO} caracteres` },
  { id: "saida", rotulo: "Possível saída" },
  { id: "inclusao", rotulo: "Propostas de inclusão" },
];

/** Ressalva: tudo que não é verde com o endereço em ordem (completo, a completar ou sem base). */
function temRessalva(c: ResultadoContato): boolean {
  const e = c.endereco?.situacao;
  return c.semaforo !== "verde" || cargoEstaVazio(c) || e === "pendente" || e === "nao_verificado" || numeroAcimaDoLimite(c);
}

function passaFiltro(c: ResultadoContato, filtro: Filtro): boolean {
  switch (filtro) {
    case "tudo": return true;
    case "ressalva": return temRessalva(c);
    case "endereco": return c.endereco?.situacao === "pendente";
    case "numero": return numeroAcimaDoLimite(c);
    case "saida": return c.possivelSaida === true;
    case "inclusao": return false;
  }
}

const FILTROS_COM_NOVOS: readonly Filtro[] = ["tudo", "ressalva", "inclusao"];

function casa(valor: string | undefined, busca: string): boolean {
  return valor !== undefined && normalizarTexto(valor).includes(busca);
}

function contatoCasaBusca(c: ResultadoContato, busca: string): boolean {
  return busca === "" || casa(c.contato.nome, busca) || casa(c.contato.cargo, busca) || casa(c.contato.orgao, busca);
}

function novoCasaBusca(n: PessoaSite, busca: string): boolean {
  return busca === "" || casa(n.nome, busca) || casa(n.cargo, busca);
}

/** Filtro e busca no navegador. Grupo que fica sem linha some. Não muta a entrada. */
export function filtrarGrupos(grupos: readonly ResultadoGrupo[], filtro: Filtro, busca: string, grupo?: string): ResultadoGrupo[] {
  const b = normalizarTexto(busca.trim());
  return grupos
    .filter((g) => !grupo || g.grupo === grupo)
    .map((g) => ({
      ...g,
      contatos: g.contatos.filter((c) => passaFiltro(c, filtro) && contatoCasaBusca(c, b)),
      novos: FILTROS_COM_NOVOS.includes(filtro) ? g.novos.filter((n) => novoCasaBusca(n, b)) : [],
    }))
    .filter((g) => g.contatos.length > 0 || g.novos.length > 0);
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Linha do cabeçalho do grupo, lida com o grupo recolhido. Contagem zerada some. */
export function resumoDoGrupo(g: ResultadoGrupo): string {
  const aRevisar = g.contatos.filter((c) => situacaoDoContato(c, g).tom === "atencao").length;
  const saidas = g.contatos.filter((c) => c.possivelSaida === true).length;
  return [
    plural(g.contatos.length, "contato", "contatos"),
    aRevisar > 0 ? `${aRevisar} a revisar` : "",
    saidas > 0 ? plural(saidas, "possível saída", "possíveis saídas") : "",
    g.novos.length > 0 ? `${g.novos.length} a incluir` : "",
  ].filter((p) => p.length > 0).join(" · ");
}

export function contarContatos(grupos: readonly ResultadoGrupo[]): number {
  return grupos.reduce((soma, g) => soma + g.contatos.length, 0);
}

/**
 * Os seis cartões do mockup. Recebe `Partial` de propósito: um retrato gravado por uma
 * versão anterior do código pode não ter os contadores mais novos, e o painel não pode
 * mostrar NaN por isso.
 */
export function cartoesDoResumo(r: Partial<ResumoAnalise>): { rotulo: string; valor: number }[] {
  const n = (v: number | undefined) => v ?? 0;
  return [
    { rotulo: "Conferem", valor: n(r.verde) },
    { rotulo: "Com divergência", valor: n(r.amarelo) },
    { rotulo: "Possível saída", valor: n(r.possivelSaida) },
    { rotulo: "Não verificados", valor: n(r.indeterminado) + n(r.contatosSemFonte) },
    { rotulo: "Propostas de inclusão", valor: n(r.novo) },
    { rotulo: "Endereços a confirmar", valor: n(r.enderecosAConfirmar) },
  ];
}

/**
 * As três linhas do bloco de endereço e do botão Copiar. Não é o `formatado` da Fase 1
 * (que só existe em `completo`): aqui o CEP sai como está no relatório, sem formatar nem
 * propor zero à esquerda, porque isto é o que o relatório diz, não o que o app conclui.
 */
export function linhasDoEndereco(e: EnderecoEstruturado): string[] {
  const primeira = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ");
  const segunda = e.bairro ?? "";
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join(" - ");
  const terceira = [e.cep, cidadeUf].filter(Boolean).join(" ");
  return [primeira, segunda, terceira].filter((l) => l.length > 0);
}

export interface CampoEndereco {
  rotulo: string;
  valor: string;
  tom?: Tom;
  /** Por que o campo está marcado. */
  nota?: string;
  /** Só no Número acima do limite: o fim do valor, que não cabe no cadastro. */
  excedente?: string;
}

function marcaDoAchado(achados: readonly AchadoEndereco[], candidatos: readonly AchadoEndereco[], tom: Tom): Pick<CampoEndereco, "tom" | "nota"> {
  const achado = candidatos.find((a) => achados.includes(a));
  return achado ? { tom, nota: rotuloAchadoEndereco(achado) } : {};
}

function campoNumero(a: AuditoriaEndereco, numero: string): CampoEndereco {
  const excesso = excessoDoNumero(numero);
  if (excesso === 0) return { rotulo: "Número", valor: numero, ...marcaDoAchado(a.achados, ["sem_numero"], "atencao") };
  return {
    rotulo: "Número",
    valor: numero,
    tom: "atencao",
    nota: `${numero.length} caracteres, ${NOTA_CONTAGEM}; o máximo é ${LIMITE_NUMERO} (${excesso} a mais)`,
    excedente: numero.slice(LIMITE_NUMERO),
  };
}

/**
 * O endereço escolhido, campo a campo, como está no relatório: é onde se vê o ponto de
 * ajuste. Campo com achado leva tom e nota; sem linha escolhida não há o que listar.
 */
export function camposDoEndereco(a: AuditoriaEndereco): CampoEndereco[] {
  const e = a.endereco;
  if (!e) return [];
  return [
    { rotulo: "Logradouro", valor: e.logradouro ?? "", ...marcaDoAchado(a.achados, ["sem_logradouro"], "atencao") },
    campoNumero(a, e.numero ?? ""),
    { rotulo: "Complemento", valor: e.complemento ?? "" },
    { rotulo: "Bairro", valor: e.bairro ?? "", ...marcaDoAchado(a.achados, ["sem_bairro"], "neutro") },
    { rotulo: "Cidade / UF", valor: [e.cidade, e.uf].filter(Boolean).join(" - ") },
    {
      rotulo: "CEP",
      valor: e.cep ?? "",
      ...marcaDoAchado(a.achados, ["cep_ausente", "cep_invalido"], "atencao"),
      ...marcaDoAchado(a.achados, ["cep_recuperavel"], "neutro"),
    },
  ];
}

export function textoEnderecoParaCopiar(e: EnderecoEstruturado): string {
  return linhasDoEndereco(e).join("\n");
}

const FORMATO_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  timeZone: "America/Sao_Paulo",
});

/** Linha "Nome e cargo" do rodapé de procedência. Sem URL http não há página: a composição veio do conhecimento da IA. */
export function procedenciaNomeCargo(g: ResultadoGrupo): { texto: string; url?: string } | undefined {
  if (g.semFonte) return undefined;
  if (g.fonteUrl && g.fonteUrl.startsWith("http")) return { texto: g.fonteUrl, url: g.fonteUrl };
  return { texto: "conhecimento da IA, confira" };
}

/** "01/10, 14h12", no fuso de Brasília, como o cabeçalho do mockup. */
export function textoDataHora(iso: string): string {
  const partes = FORMATO_DATA_HORA.formatToParts(new Date(iso));
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}, ${p("hour")}h${p("minute")}`;
}

/** Cabeçalho do painel publicado: quando a máquina do GT varreu e quando publicou (spec 2026-10-02 §6.2). */
export function textoCabecalhoWeb(geradoEm: string, publicadoEm?: string): string {
  const base = `Varredura feita na máquina do GT em ${textoDataHora(geradoEm)}.`;
  return publicadoEm ? `${base} Publicada em ${textoDataHora(publicadoEm)}.` : base;
}

export function montarRetrato(
  resultado: ResultadoAnalise,
  planilhas: { contatos: { nome: string; linhas: number }; enderecos?: { nome: string; linhas: number } },
  agora: Date,
): Retrato {
  return {
    ...resultado,
    geradoEm: agora.toISOString(),
    planilhaContatos: planilhas.contatos,
    ...(planilhas.enderecos ? { planilhaEnderecos: planilhas.enderecos } : {}),
  };
}
