import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import { grupoEquivalente, vigente, type HistoricoDecisoes, type Registro, type RegistroManual, type TipoDecisao } from "@/lib/decisoes";
import { diaDaColeta } from "@/lib/decisoes-coleta";
import { casosDoEleito, GRUPOS_DA_ELEICAO_DA_CASA, GRUPOS_DA_ELEICAO_DO_GOVERNO } from "@/lib/eleitos-decisoes";
import { descreverOcorrencia } from "@/lib/export-repetidos";
import { normalizarTexto } from "@/lib/normalize";
import type { AutoridadeRepetida } from "@/lib/repetidos-base";
import { equivalenteDaOcorrencia } from "@/lib/repetidos-base";
import { dataDaDecisao, TEXTO_TIPO, textoDecisao, textoNoContatos } from "@/lib/repetidos-decisoes";
import type { CasaLegislativa, ContatoDoEleito, EleitoClassificado, GovernadorClassificado } from "@/lib/types";

/**
 * Formulário "Registrar decisão" e histórico do caso (spec 2026-10-30 §4.1.1 e §4.1.3), em `/repetidos`
 * e nas seções de eleitos do painel. Funções puras: o componente só renderiza e chama `/api/decisoes`.
 */

export interface FormularioDecisao {
  tipo: TipoDecisao | "";
  convidaPor: string;
  /** Valores de `OcorrenciaDoCaso.valor` marcados como outra pessoa. */
  outraPessoa: string[];
  observacao: string;
  quem: string;
  validacao: "validado" | "a_validar";
}

/** Formulário novo. A validação começa em "A validar": "Validado" é escolha explícita de quem registra. */
export const FORMULARIO_VAZIO: Readonly<FormularioDecisao> = Object.freeze({
  tipo: "", convidaPor: "", outraPessoa: [], observacao: "", quem: "", validacao: "a_validar",
});

/** Tipos na ordem do formulário, com o nome que a tela mostra. */
export const TIPOS_DO_FORMULARIO: readonly { valor: TipoDecisao; rotulo: string }[] = (
  ["mesma_pessoa", "pessoas_diferentes", "nao_recebe_convite", "ajustar_contatos"] as const
).map((valor) => ({ valor, rotulo: TEXTO_TIPO[valor] }));

/** O tipo leva o grupo do convite: obrigatório em `mesma_pessoa`, opcional em `ajustar_contatos`. */
export function pedeConvite(tipo: TipoDecisao | ""): boolean {
  return tipo === "mesma_pessoa" || tipo === "ajustar_contatos";
}

export function errosDoFormulario(f: FormularioDecisao): string[] {
  return [
    ...(f.tipo === "" ? ["Escolha o tipo da decisão."] : []),
    ...(f.tipo === "mesma_pessoa" && !f.convidaPor.trim() ? ["Escolha o grupo do convite."] : []),
    ...(!f.quem.trim() ? ["Informe quem decidiu."] : []),
  ];
}

/** Registro manual do formulário, com a data `hoje` (AAAA-MM-DD) e os grupos do caso. Formulário com erro lança. */
export function paraRegistro(f: FormularioDecisao, grupos: readonly string[], hoje: string): RegistroManual {
  const erros = errosDoFormulario(f);
  if (f.tipo === "" || erros.length > 0) throw new Error(`Formulário incompleto: ${erros.join(" ")}`);
  const convite = pedeConvite(f.tipo) ? f.convidaPor.trim() : "";
  return {
    tipo: f.tipo,
    data: hoje,
    quem: f.quem.trim(),
    observacao: f.observacao.trim(),
    validacao: f.validacao,
    ...(convite ? { convidaPor: convite } : {}),
    ...(f.outraPessoa.length > 0 ? { outraPessoa: [...f.outraPessoa] } : {}),
    grupos: [...grupos],
  };
}

const TEXTO_VALIDACAO: Record<RegistroManual["validacao"], string> = { validado: "Validado", a_validar: "A validar" };

/**
 * Linha do histórico: "26/10 · Mesma pessoa: convidar pelo grupo X (Marina e Clóvis) · Validado", com
 * a decisão no mesmo texto da coluna "Decisão do GT" (`textoDecisao`); depois, quando há, "Outra
 * pessoa em Y" e a observação.
 */
export function textoDoRegistro(r: Registro): string {
  const dia = dataDaDecisao(r.data);
  if (r.tipo === "coleta") return `${dia} · Coleta: ${textoNoContatos(r.situacao) || "Sem efeito"}`;
  const outras = (r.outraPessoa ?? []).filter((g) => g.trim());
  const observacao = r.observacao.trim();
  return [
    dia, textoDecisao(r),
    ...(outras.length > 0 ? [`Outra pessoa em ${outras.join(", ")}`] : []),
    TEXTO_VALIDACAO[r.validacao],
    ...(observacao ? [observacao] : []),
  ].join(" · ");
}

/** Do mais recente para o mais antigo pela data; no empate, o gravado depois vem antes. */
export function registrosDoMaisRecente(registros: readonly Registro[]): Registro[] {
  return registros
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.data === b.r.data ? b.i - a.i : a.r.data < b.r.data ? 1 : -1))
    .map(({ r }) => r);
}

/** Dia de hoje (AAAA-MM-DD) no fuso de Brasília, a data do registro. */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return diaDaColeta(agora.toISOString());
}

/** Ocorrência do caso que pode ser marcada como outra pessoa. `valor` é o grupo gravado em `outraPessoa`. */
export interface OcorrenciaDoCaso {
  valor: string;
  rotulo: string;
  /** Formas do nome nessa ocorrência; saem do pedido quando ela é outra pessoa. */
  nomes: string[];
}

/** O caso visto pelo formulário: quem é, os grupos gravados no registro e as opções da tela. */
export interface AlvoDeDecisao {
  nome: string;
  nomes: string[];
  /** Grupos do caso no momento do registro (forma equivalente). Nunca vazio. */
  grupos: string[];
  /** Opções do "convidar pelo grupo". */
  convites: string[];
  ocorrencias: OcorrenciaDoCaso[];
}

function semRepetir(valores: readonly string[]): string[] {
  const vistos = new Set<string>();
  return valores.filter((v) => {
    const chave = normalizarTexto(v);
    if (chave === "" || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/** Junta as ocorrências de mesmo `valor` (comparado por `normalizarTexto`) numa só marcação. */
function juntarOcorrencias(lista: readonly OcorrenciaDoCaso[]): OcorrenciaDoCaso[] {
  const porValor = new Map<string, OcorrenciaDoCaso>();
  for (const o of lista) {
    const chave = normalizarTexto(o.valor);
    const ja = porValor.get(chave);
    porValor.set(chave, ja
      ? { valor: ja.valor, rotulo: `${ja.rotulo} · ${o.rotulo}`, nomes: semRepetir([...ja.nomes, ...o.nomes]) }
      : { valor: o.valor, rotulo: o.rotulo, nomes: [...o.nomes] });
  }
  return [...porValor.values()];
}

/**
 * Caso de `/repetidos`: os grupos (e os convites) são os do caso já decidido (registro vigente) mais
 * as formas equivalentes das ocorrências de hoje. Assim o registro novo cobre o caso e entra no
 * mesmo histórico, mesmo quando a pessoa já saiu de um dos grupos (Nunes Marques) ou de todos.
 */
export function alvoDoRepetido(a: AutoridadeRepetida): AlvoDeDecisao {
  const ocorrencias = juntarOcorrencias(a.ocorrencias.map((o) => ({
    valor: equivalenteDaOcorrencia(o), rotulo: descreverOcorrencia(o), nomes: [o.chave],
  })));
  const doCaso = a.caso ? (vigente(a.caso)?.grupos ?? []) : [];
  const grupos = semRepetir([...doCaso, ...ocorrencias.map((o) => o.valor)]);
  return { nome: a.nome, nomes: semRepetir(a.ocorrencias.map((o) => o.chave)), grupos, convites: [...grupos], ocorrencias };
}

const ELEITOS_DA_CASA: Record<CasaLegislativa, string> = { senado: GRUPO_SENADORES_ELEITOS, camara: GRUPO_DEPUTADOS_ELEITOS };

/** Convites possíveis do eleito: os grupos da eleição da Casa, sem o grupo de eleitos da outra Casa. */
function convitesDaCasa(casa: CasaLegislativa): string[] {
  const outra = ELEITOS_DA_CASA[casa === "senado" ? "camara" : "senado"];
  return GRUPOS_DA_ELEICAO_DA_CASA.filter((g) => g !== outra);
}

const ocorrenciaDoContato = (c: ContatoDoEleito): OcorrenciaDoCaso =>
  ({ valor: grupoEquivalente(c.grupo, "contatos"), rotulo: `${c.grupo}: ${c.nome}`, nomes: [c.nome] });

interface DadosDoEleito {
  nomeUrna: string;
  nomeCompleto: string;
  /** Grupo de destino calculado, ou o grupo de eleitos quando o eleito está a conferir. */
  destino: string;
  convites: readonly string[];
  ocorrencias: readonly OcorrenciaDoCaso[];
}

/** Os grupos do registro nunca ficam vazios: o destino (ou o grupo de eleitos) vem sempre primeiro. */
function alvoDeEleito(d: DadosDoEleito): AlvoDeDecisao {
  const ocorrencias = juntarOcorrencias(d.ocorrencias);
  return {
    nome: d.nomeUrna,
    nomes: semRepetir([d.nomeCompleto, ...ocorrencias.flatMap((o) => o.nomes)]),
    grupos: semRepetir([d.destino, ...ocorrencias.map((o) => o.valor)]),
    convites: [...d.convites],
    ocorrencias,
  };
}

/** Senador ou deputado eleito: grupo de destino (ou o de eleitos da Casa) e os grupos dos contatos ligados. */
export function alvoDoEleito(x: EleitoClassificado): AlvoDeDecisao {
  const { casa, nomeUrna, nomeCompleto } = x.eleito;
  return alvoDeEleito({
    nomeUrna, nomeCompleto,
    destino: x.grupoDestino?.trim() ? x.grupoDestino : ELEITOS_DA_CASA[casa],
    convites: convitesDaCasa(casa),
    ocorrencias: x.contatos.map(ocorrenciaDoContato),
  });
}

/** Governador eleito: como o eleito; a lista da Câmara vale como o grupo "Deputados Federais". */
export function alvoDoGovernador(x: GovernadorClassificado): AlvoDeDecisao {
  const camara: OcorrenciaDoCaso[] = x.deputadoAtual
    ? [{ valor: GRUPO_DEPUTADOS_FEDERAIS, rotulo: `Planilha da Câmara: ${x.deputadoAtual.nomeParlamentar}`, nomes: [x.deputadoAtual.nomeParlamentar] }]
    : [];
  return alvoDeEleito({
    nomeUrna: x.eleito.nomeUrna, nomeCompleto: x.eleito.nomeCompleto,
    destino: x.grupoDestino?.trim() ? x.grupoDestino : GRUPO_GOVERNADORES_ELEITOS,
    convites: GRUPOS_DA_ELEICAO_DO_GOVERNO,
    ocorrencias: [...x.contatos.map(ocorrenciaDoContato), ...camara],
  });
}

/**
 * Histórico do eleito: os registros dos casos que a classificação aplica a ele (`casosDoEleito`, pelo
 * nome de urna ou completo, no eixo da eleição), do mais recente para o mais antigo. O homônimo
 * ligado por nome (Jader Filho e o pai, Jader Barbalho) não traz o caso do outro.
 */
export function historicoDoEleito(decisoes: HistoricoDecisoes | undefined, x: EleitoClassificado): Registro[] {
  return registrosDoMaisRecente(casosDoEleito(x.eleito, decisoes, GRUPOS_DA_ELEICAO_DA_CASA).flatMap((c) => c.registros));
}

/** Histórico do governador eleito, pela mesma regra da classificação dele. */
export function historicoDoGovernador(decisoes: HistoricoDecisoes | undefined, x: GovernadorClassificado): Registro[] {
  return registrosDoMaisRecente(casosDoEleito(x.eleito, decisoes, GRUPOS_DA_ELEICAO_DO_GOVERNO).flatMap((c) => c.registros));
}

export interface PedidoDeDecisao {
  nome: string;
  nomes: string[];
  registro: RegistroManual;
}

/**
 * Corpo de `POST /api/decisoes`. Os nomes que só aparecem em ocorrências marcadas como outra pessoa
 * saem: não podem virar chave do caso.
 */
export function corpoDoPedido(alvo: AlvoDeDecisao, f: FormularioDecisao, hoje: string): PedidoDeDecisao {
  const marcadas = new Set(f.outraPessoa.map(normalizarTexto));
  const outras = alvo.ocorrencias.filter((o) => marcadas.has(normalizarTexto(o.valor)));
  const mantidas = new Set(alvo.ocorrencias.filter((o) => !outras.includes(o)).flatMap((o) => o.nomes));
  const deOutraPessoa = new Set(outras.flatMap((o) => o.nomes).filter((n) => !mantidas.has(n)));
  return {
    nome: alvo.nome,
    nomes: alvo.nomes.filter((n) => !deOutraPessoa.has(n)),
    registro: paraRegistro(f, alvo.grupos, hoje),
  };
}
