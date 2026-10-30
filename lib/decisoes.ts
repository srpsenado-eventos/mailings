import { GRUPO_DEPUTADOS_FEDERAIS } from "@/data/grupos-posse";
import { grupoDoAgrupador } from "@/lib/agrupador";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";

/**
 * Registro das decisões do GT sobre os casos a conferir (spec 2026-10-30 §4.1).
 * Funções puras: recebem o histórico e devolvem um novo; nunca mutam a entrada nem leem arquivo.
 * As datas são `AAAA-MM-DD`, passadas por quem chama.
 */

export type TipoDecisao = "mesma_pessoa" | "pessoas_diferentes" | "nao_recebe_convite" | "ajustar_contatos";
export type SituacaoNoContatos = "tratado" | "pendente" | "reaberto" | "sem_efeito";

export interface RegistroManual {
  tipo: TipoDecisao;
  /** AAAA-MM-DD */
  data: string;
  quem: string;
  observacao: string;
  validacao: "validado" | "a_validar";
  convidaPor?: string;
  outraPessoa?: string[];
  grupos: string[];
}

export interface RegistroColeta {
  tipo: "coleta";
  data: string;
  situacao: SituacaoNoContatos;
  grupos: string[];
}

export type Registro = RegistroManual | RegistroColeta;

export interface CasoDecidido {
  id: string;
  nome: string;
  chaves: string[];
  registros: Registro[];
}

export interface HistoricoDecisoes {
  versao: 1;
  casos: CasoDecidido[];
}

export const HISTORICO_VAZIO: HistoricoDecisoes = Object.freeze({
  versao: 1,
  casos: Object.freeze([]) as unknown as CasoDecidido[],
});

/** Registro que não identifica a pessoa (nome vazio depois de `normalizarNome`). */
export class DecisaoInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecisaoInvalidaError";
  }
}

/**
 * Forma equivalente do grupo de uma ocorrência (spec §4.1.1): rótulo do Contatos vira o rótulo
 * oficial do agrupador quando casa; a planilha da Câmara vale como "Deputados Federais"; o eleito
 * vale como o seu grupo de destino.
 */
export function grupoEquivalente(
  grupo: string,
  origem: "contatos" | "camara" | "eleicao",
  grupoDestino?: string,
): string {
  if (origem === "camara") return GRUPO_DEPUTADOS_FEDERAIS;
  const destino = grupoDestino?.trim() ? grupoDestino : undefined;
  const rotulo = origem === "eleicao" ? (destino ?? grupo) : grupo;
  return grupoDoAgrupador(rotulo)?.rotulo ?? rotulo.trim();
}

function chavesDe(nomes: readonly string[]): string[] {
  return [...new Set(nomes.map(normalizarNome).filter((c) => c.length > 0))];
}

function conjuntoDeGrupos(grupos: readonly string[]): Set<string> {
  return new Set(grupos.map(normalizarTexto).filter((g) => g.length > 0));
}

/** Grupos do caso: os do registro manual vigente. */
function gruposDoCaso(c: CasoDecidido): Set<string> {
  return conjuntoDeGrupos(vigente(c)?.grupos ?? []);
}

function intersecao(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  return [...a].filter((g) => b.has(g)).length;
}

/** `a` contém todos os elementos de `b`. */
function contem(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return intersecao(b, a) === b.size;
}

function mesmoConjunto(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && contem(a, b);
}

/**
 * Caso de mesma identidade (spec §4.1.1: nomes + grupos). Entre os casos com alguma chave de nome
 * em comum, vale o de mesmo conjunto de grupos; senão o de maior interseção de grupos; empate ou
 * interseção zero não acham nada. Sem `grupos`, só por nome e só quando um único caso casa.
 */
export function acharCaso(
  h: HistoricoDecisoes,
  nomes: readonly string[],
  grupos?: readonly string[],
): CasoDecidido | undefined {
  const procuradas = new Set(chavesDe(nomes));
  const candidatos = h.casos.filter((c) => c.chaves.some((ch) => procuradas.has(ch)));
  if (grupos === undefined) return candidatos.length === 1 ? candidatos[0] : undefined;
  const alvo = conjuntoDeGrupos(grupos);
  const exato = candidatos.find((c) => mesmoConjunto(gruposDoCaso(c), alvo));
  if (exato) return exato;
  const pontuados = candidatos.map((c) => ({ c, pontos: intersecao(gruposDoCaso(c), alvo) }));
  const maior = Math.max(0, ...pontuados.map((p) => p.pontos));
  const melhores = pontuados.filter((p) => p.pontos === maior);
  return maior > 0 && melhores.length === 1 ? melhores[0].c : undefined;
}

/**
 * Todos os casos com decisão da pessoa, para a tela e o painel: alguma chave de nome em comum e os
 * grupos do registro vigente contidos em `gruposEquivalentes`. `acharCaso` continua escolhendo um só
 * caso, para registrar.
 */
export function casosDaPessoa(
  h: HistoricoDecisoes,
  nomes: readonly string[],
  gruposEquivalentes: readonly string[],
): CasoDecidido[] {
  const procuradas = new Set(chavesDe(nomes));
  const alvo = conjuntoDeGrupos(gruposEquivalentes);
  return h.casos.filter((c) =>
    c.chaves.some((ch) => procuradas.has(ch)) && vigente(c) !== undefined && contem(alvo, gruposDoCaso(c)));
}

function idDoCaso(nome: string, grupos: readonly string[]): string {
  return `${normalizarNome(nome)}#${[...conjuntoDeGrupos(grupos)].sort().join("|")}`;
}

function copiarRegistro(r: RegistroManual): RegistroManual {
  return {
    ...r,
    grupos: [...r.grupos],
    ...(r.outraPessoa ? { outraPessoa: [...r.outraPessoa] } : {}),
  };
}

/**
 * Acrescenta o registro ao caso de mesma identidade (`acharCaso` com os grupos do registro),
 * unindo as chaves de nome, ou cria um caso novo. Nunca funde dois casos.
 */
export function registrar(
  h: HistoricoDecisoes,
  nome: string,
  nomes: readonly string[],
  r: RegistroManual,
): HistoricoDecisoes {
  if (normalizarNome(nome).length === 0) {
    throw new DecisaoInvalidaError("O nome da pessoa do caso está vazio.");
  }
  const novas = chavesDe([nome, ...nomes]);
  const achado = acharCaso(h, [nome, ...nomes], r.grupos);
  // Só acrescenta quando o registro cobre todos os grupos do caso (mesmo caso, ou reabertura com
  // grupo novo); interseção parcial é outro caso (Jader Barbalho × Ex-Presidentes e × Jader Filho).
  const existente = achado && contem(conjuntoDeGrupos(r.grupos), gruposDoCaso(achado)) ? achado : undefined;
  if (!existente) {
    const caso: CasoDecidido = {
      id: idDoCaso(nome, r.grupos),
      nome,
      chaves: novas,
      registros: [copiarRegistro(r)],
    };
    return { versao: 1, casos: [...h.casos, caso] };
  }
  const atualizado: CasoDecidido = {
    ...existente,
    chaves: chavesDe([...existente.chaves, ...novas]),
    registros: [...existente.registros, copiarRegistro(r)],
  };
  return { versao: 1, casos: h.casos.map((c) => (c === existente ? atualizado : c)) };
}

function ehManual(r: Registro): r is RegistroManual {
  return r.tipo !== "coleta";
}

/** Registro manual mais recente pela data; no empate, o último na ordem. */
export function vigente(c: CasoDecidido): RegistroManual | undefined {
  return c.registros.filter(ehManual).reduce<RegistroManual | undefined>(
    (melhor, r) => (melhor === undefined || r.data >= melhor.data ? r : melhor),
    undefined,
  );
}

/** Situação do caso no Contatos (spec §4.1.4); `gruposAtuais` já na forma equivalente. */
export function situacaoDoCaso(c: CasoDecidido, gruposAtuais: readonly string[]): SituacaoNoContatos {
  const decisao = vigente(c);
  if (!decisao) return "sem_efeito";
  const daDecisao = conjuntoDeGrupos(decisao.grupos);
  const atuais = [...conjuntoDeGrupos(gruposAtuais)];
  const convite = decisao.convidaPor?.trim() ? normalizarTexto(decisao.convidaPor) : undefined;
  // O grupo do convite nunca reabre, mesmo fora dos grupos do registro (Contatos corrigido).
  if (atuais.some((g) => g !== convite && !daDecisao.has(g))) return "reaberto";
  const soNoConvite = convite !== undefined && atuais.every((g) => g === convite);
  switch (decisao.tipo) {
    case "mesma_pessoa":
      return soNoConvite && atuais.length > 0 ? "tratado" : "pendente";
    case "ajustar_contatos":
      if (convite === undefined) return atuais.length <= 1 ? "tratado" : "pendente";
      return soNoConvite ? "tratado" : "pendente";
    case "nao_recebe_convite":
      return atuais.length === 0 ? "tratado" : "pendente";
    case "pessoas_diferentes":
      return "sem_efeito";
    default:
      return "sem_efeito";
  }
}

function ultimaColetaDepoisDoVigente(c: CasoDecidido, decisao: RegistroManual): RegistroColeta | undefined {
  const posicao = c.registros.indexOf(decisao);
  return c.registros
    .slice(posicao + 1)
    .filter((r): r is RegistroColeta => r.tipo === "coleta")
    .at(-1);
}

/**
 * Acrescenta uma entrada `coleta` a cada caso com decisão vigente cuja situação mudou desde a
 * última coleta posterior à decisão. "Sem efeito" não gera entrada.
 */
export function registrarColetas(
  h: HistoricoDecisoes,
  gruposPorCaso: (c: CasoDecidido) => string[],
  data: string,
): HistoricoDecisoes {
  const casos = h.casos.map((c) => {
    const decisao = vigente(c);
    if (!decisao) return c;
    const grupos = [...gruposPorCaso(c)];
    const situacao = situacaoDoCaso(c, grupos);
    if (situacao === "sem_efeito") return c;
    if (ultimaColetaDepoisDoVigente(c, decisao)?.situacao === situacao) return c;
    const entrada: RegistroColeta = { tipo: "coleta", data, situacao, grupos };
    return { ...c, registros: [...c.registros, entrada] };
  });
  return { versao: 1, casos };
}
