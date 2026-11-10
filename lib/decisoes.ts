import { GRUPO_DEPUTADOS_FEDERAIS } from "@/data/grupos-posse";
import { grupoDoAgrupador } from "@/lib/agrupador";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";

/**
 * Registro das decisões do GT sobre os casos a conferir (spec 2026-10-30 §4.1).
 * Funções puras: recebem o histórico e devolvem um novo; nunca mutam a entrada nem leem arquivo.
 * As datas são `AAAA-MM-DD`, passadas por quem chama.
 */

export type TipoDecisao = "mesma_pessoa" | "pessoas_diferentes" | "nao_recebe_convite" | "ajustar_contatos";
export const TIPOS_DECISAO: readonly TipoDecisao[] = ["mesma_pessoa", "pessoas_diferentes", "nao_recebe_convite", "ajustar_contatos"];
export type SituacaoNoContatos = "tratado" | "pendente" | "reaberto" | "sem_efeito";
/** O que falta fazer num caso decidido (spec 2026-11-04 §3.1); a ordem desta lista é a ordem do texto. */
export type Pendencia = "bloqueio" | "cadastrar_convite" | "desbloquear_convite";

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
  /** Ausente (e `[]`) quando não há pendência; coleta antiga não traz o campo. */
  pendencias?: Pendencia[];
}

/** Bloqueio (ou o desfazer) da pessoa num grupo do Posse. Só registra: nunca decide o convite. */
export interface RegistroBloqueio {
  tipo: "bloqueio" | "desbloqueio";
  grupo: string;
  /** AAAA-MM-DD */
  data: string;
  quem: string;
  observacao: string;
}

export type Registro = RegistroManual | RegistroColeta | RegistroBloqueio;

export interface CasoDecidido {
  id: string;
  nome: string;
  chaves: string[];
  registros: Registro[];
}

/** Corpo de `POST /api/decisoes`: montado pelo formulário e validado pela rota. */
export interface PedidoDeDecisao {
  nome: string;
  nomes: string[];
  registro: RegistroManual;
}

/** Corpo de `POST /api/decisoes` com bloqueio: identifica o caso pelos nomes e grupos, como o de decisão. */
export interface PedidoDeBloqueio {
  nome: string;
  nomes: string[];
  grupos: string[];
  bloqueio: RegistroBloqueio;
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

/**
 * O que a decisão decide, para comparar duas decisões da mesma pessoa: o grupo do convite (forma
 * equivalente) quando há; senão o tipo. Duas decisões com a mesma chave não são conflito.
 */
export function chaveDoQueDecide(r: RegistroManual): string {
  const convite = conviteNormalizado(r);
  return convite ? `convite:${convite}` : `tipo:${r.tipo}`;
}

/** Grupo do convite do registro na forma equivalente e normalizada; `undefined` sem convite. */
function conviteNormalizado(r: RegistroManual): string | undefined {
  const convite = r.convidaPor?.trim();
  return convite ? normalizarTexto(grupoEquivalente(convite, "contatos")) : undefined;
}

/** `AAAA-MM-DD` → `DD/MM` (ou `DD/MM/AAAA` com `comAno`). Data fora do formato volta como veio. */
export function dataDaDecisao(data: string, comAno = false): string {
  const [ano, mes, dia] = data.split("-");
  if (!ano || !mes || !dia) return data;
  return comAno ? `${dia}/${mes}/${ano}` : `${dia}/${mes}`;
}

/** Bloqueio pedido para pessoa sem decisão do GT registrada no caso. */
export class BloqueioSemDecisaoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BloqueioSemDecisaoError";
  }
}

export const MOTIVO_DUAS_DECISOES = "Duas decisões do GT para a mesma pessoa: conferir";

function chavesDe(nomes: readonly string[]): string[] {
  return [...new Set(nomes.map(normalizarNome).filter((c) => c.length > 0))];
}

function conjuntoDeGrupos(grupos: readonly string[]): Set<string> {
  // Pela forma equivalente, para que o apelido de um grupo renomeado (Ex-Presidentes do Senado)
  // continue valendo para a decisão gravada com o nome antigo.
  return new Set(grupos.map((g) => normalizarTexto(grupoEquivalente(g, "contatos"))).filter((g) => g.length > 0));
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
 * Todos os casos com decisão da pessoa, para a tela e o painel: alguma chave de nome em comum e ao
 * menos um grupo do registro vigente em `gruposEquivalentes`. A pessoa que saiu de um grupo do caso
 * continua com o caso (que pode reabrir); o nome já identifica a pessoa. `acharCaso` continua
 * escolhendo um só caso, para registrar.
 */
export function casosDaPessoa(
  h: HistoricoDecisoes,
  nomes: readonly string[],
  gruposEquivalentes: readonly string[],
): CasoDecidido[] {
  const procuradas = new Set(chavesDe(nomes));
  const alvo = conjuntoDeGrupos(gruposEquivalentes);
  return h.casos.filter((c) =>
    c.chaves.some((ch) => procuradas.has(ch)) && vigente(c) !== undefined && intersecao(gruposDoCaso(c), alvo) > 0);
}

/**
 * Grupos atuais que contam para a situação deste caso (tela e coleta usam esta mesma regra): sai o
 * grupo que não está nos `grupos` do vigente deste caso, mas está nos de outro caso da mesma pessoa
 * (outro caso de `casos` com alguma chave de nome em comum). Jader Barbalho em Ex-Presidentes do
 * Senado é do caso "Ex-Presidentes × Senadores" e não reabre o caso "Senadores × Jader Filho".
 */
export function gruposAtuaisParaOCaso(
  caso: CasoDecidido,
  gruposAtuais: readonly string[],
  casos: readonly CasoDecidido[],
): string[] {
  const chaves = new Set(caso.chaves);
  const proprios = gruposDoCaso(caso);
  const dosOutros = new Set(casos
    .filter((c) => c !== caso && c.chaves.some((ch) => chaves.has(ch)))
    .flatMap((c) => [...gruposDoCaso(c)]));
  return gruposAtuais.filter((g) => {
    const chave = normalizarTexto(g);
    return proprios.has(chave) || !dosOutros.has(chave);
  });
}

function idDoCaso(nome: string, grupos: readonly string[]): string {
  return `${normalizarNome(nome)}#${[...new Set(grupos.map(normalizarTexto).filter((g) => g.length > 0))].sort().join("|")}`;
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
  return (TIPOS_DECISAO as readonly string[]).includes(r.tipo);
}

function ehBloqueio(r: Registro): r is RegistroBloqueio {
  return r.tipo === "bloqueio" || r.tipo === "desbloqueio";
}

/** Registro manual mais recente pela data; no empate, o último na ordem. */
export function vigente(c: CasoDecidido): RegistroManual | undefined {
  return c.registros.filter(ehManual).reduce<RegistroManual | undefined>(
    (melhor, r) => (melhor === undefined || r.data >= melhor.data ? r : melhor),
    undefined,
  );
}

/** Reaberto: pessoa em grupo que a decisão não cobre (o grupo do convite nunca reabre). `atuais` já normalizados. */
function ehReaberto(decisao: RegistroManual, atuais: readonly string[]): boolean {
  const daDecisao = conjuntoDeGrupos(decisao.grupos);
  const convite = conviteNormalizado(decisao);
  return atuais.some((g) => g !== convite && !daDecisao.has(g));
}

/** Situação do caso no Contatos (spec §4.1.4); `gruposAtuais` já na forma equivalente. */
export function situacaoDoCaso(c: CasoDecidido, gruposAtuais: readonly string[]): SituacaoNoContatos {
  const decisao = vigente(c);
  if (!decisao) return "sem_efeito";
  const atuais = [...conjuntoDeGrupos(gruposAtuais)];
  if (ehReaberto(decisao, atuais)) return "reaberto";
  const convite = conviteNormalizado(decisao);
  switch (decisao.tipo) {
    case "mesma_pessoa":
      if (convite === undefined) return "pendente";
      return quadroDeBloqueio(c, gruposAtuais).pendencias.length > 0 ? "pendente" : "tratado";
    case "nao_recebe_convite":
      return quadroDeBloqueio(c, gruposAtuais).pendencias.length > 0 ? "pendente" : "tratado";
    case "ajustar_contatos":
      if (convite === undefined) return atuais.length <= 1 ? "tratado" : "pendente";
      return atuais.every((g) => g === convite) ? "tratado" : "pendente";
    default:
      return "sem_efeito";
  }
}

/**
 * Grupos atuais em que a pessoa deve ser bloqueada no Posse: em `mesma_pessoa`, todos menos o do
 * convite; em `nao_recebe_convite`, todos; nos outros tipos (e `mesma_pessoa` sem convite), nenhum.
 * Devolve os grupos como vieram, sem repetir por `normalizarTexto`.
 */
export function gruposABloquear(decisao: RegistroManual, gruposAtuais: readonly string[]): string[] {
  if (decisao.tipo !== "mesma_pessoa" && decisao.tipo !== "nao_recebe_convite") return [];
  // O convite só existe em mesma_pessoa; em nao_recebe_convite todos os grupos atuais são a bloquear.
  const convite = decisao.tipo === "mesma_pessoa" ? conviteNormalizado(decisao) : undefined;
  if (decisao.tipo === "mesma_pessoa" && convite === undefined) return [];
  const vistos = new Set<string>();
  return gruposAtuais.filter((g) => {
    const chave = normalizarTexto(g);
    if (chave.length === 0 || vistos.has(chave) || chave === convite) return false;
    vistos.add(chave);
    return true;
  });
}

/** Chave do grupo para comparar bloqueios: forma equivalente do Contatos, normalizada. */
function chaveDoGrupo(grupo: string): string {
  return normalizarTexto(grupoEquivalente(grupo.trim(), "contatos"));
}

/**
 * Bloqueio vigente no grupo: vale o último registro de bloqueio ou desbloqueio na ordem de gravação
 * do caso (a data digitada é só informativa), se for `bloqueio`.
 */
export function bloqueioVigente(c: CasoDecidido, grupo: string): RegistroBloqueio | undefined {
  const chave = chaveDoGrupo(grupo);
  const ultimo = c.registros.filter(ehBloqueio).filter((r) => chaveDoGrupo(r.grupo) === chave).at(-1);
  return ultimo?.tipo === "bloqueio" ? ultimo : undefined;
}

export interface BloqueioDoGrupo {
  grupo: string;
  bloqueado: boolean;
  data?: string;
  /** Bloqueio registrado no grupo do convite: está errado e pede desbloqueio. */
  grupoDoConvite?: true;
}

export interface QuadroDeBloqueio {
  aBloquear: string[];
  bloqueios: BloqueioDoGrupo[];
  pendencias: Pendencia[];
}

/** O que falta bloquear, cadastrar ou desbloquear no caso (spec 2026-11-04 §3.1.2). Caso reaberto não tem quadro. */
export function quadroDeBloqueio(c: CasoDecidido, gruposAtuais: readonly string[]): QuadroDeBloqueio {
  const vazio = (): QuadroDeBloqueio => ({ aBloquear: [], bloqueios: [], pendencias: [] });
  const decisao = vigente(c);
  if (!decisao || (decisao.tipo !== "mesma_pessoa" && decisao.tipo !== "nao_recebe_convite")) return vazio();
  const atuais = [...conjuntoDeGrupos(gruposAtuais)];
  if (ehReaberto(decisao, atuais)) return vazio();
  const aBloquear = gruposABloquear(decisao, gruposAtuais);
  const bloqueios: BloqueioDoGrupo[] = aBloquear.map((grupo) => {
    const b = bloqueioVigente(c, grupo);
    return b ? { grupo, bloqueado: true, data: b.data } : { grupo, bloqueado: false };
  });
  const ehMesmaPessoa = decisao.tipo === "mesma_pessoa";
  const convite = ehMesmaPessoa ? conviteNormalizado(decisao) : undefined;
  const grupoDoConvite = ehMesmaPessoa && decisao.convidaPor?.trim() ? grupoEquivalente(decisao.convidaPor.trim(), "contatos") : undefined;
  const bloqueioNoConvite = grupoDoConvite ? bloqueioVigente(c, grupoDoConvite) : undefined;
  if (grupoDoConvite && bloqueioNoConvite) {
    bloqueios.push({ grupo: grupoDoConvite, bloqueado: true, data: bloqueioNoConvite.data, grupoDoConvite: true });
  }
  const pendencias: Pendencia[] = [];
  if (bloqueios.some((b) => !b.grupoDoConvite && !b.bloqueado)) pendencias.push("bloqueio");
  if (convite !== undefined && !atuais.includes(convite)) pendencias.push("cadastrar_convite");
  if (bloqueioNoConvite) pendencias.push("desbloquear_convite");
  return { aBloquear, bloqueios, pendencias };
}

export const TEXTO_PENDENCIA: Readonly<Record<Pendencia, string>> = {
  bloqueio: "Pendente de bloqueio no Posse",
  cadastrar_convite: "Pendente: a cadastrar no grupo do convite",
  desbloquear_convite: "Pendente: bloqueio no grupo do convite, desbloquear",
};

export function textoDasPendencias(pendencias: readonly Pendencia[]): string {
  return pendencias.map((p) => TEXTO_PENDENCIA[p]).join(" · ");
}

/**
 * Acrescenta o bloqueio (ou desbloqueio) ao caso dos grupos informados, sem mexer nas chaves. Exige
 * caso com decisão do GT: o bloqueio nunca decide nada.
 */
export function registrarBloqueio(
  h: HistoricoDecisoes,
  nome: string,
  nomes: readonly string[],
  grupos: readonly string[],
  r: RegistroBloqueio,
): HistoricoDecisoes {
  if (r.grupo.trim().length === 0) throw new DecisaoInvalidaError("O grupo do bloqueio está vazio.");
  const caso = acharCaso(h, [nome, ...nomes], grupos);
  if (!caso || !vigente(caso)) {
    throw new BloqueioSemDecisaoError("Registre a decisão do GT antes de marcar o bloqueio.");
  }
  const atualizado: CasoDecidido = { ...caso, registros: [...caso.registros, { ...r }] };
  return { versao: 1, casos: h.casos.map((x) => (x === caso ? atualizado : x)) };
}

function ultimaColetaDepoisDoVigente(c: CasoDecidido, decisao: RegistroManual): RegistroColeta | undefined {
  const posicao = c.registros.indexOf(decisao);
  return c.registros
    .slice(posicao + 1)
    .filter((r): r is RegistroColeta => r.tipo === "coleta")
    .at(-1);
}

function mesmasPendencias(a: readonly Pendencia[] | undefined, b: readonly Pendencia[]): boolean {
  const antes = a ?? [];
  return antes.length === b.length && antes.every((p, i) => p === b[i]);
}

/**
 * Acrescenta uma entrada `coleta` a cada caso com decisão vigente cuja situação ou pendências mudaram
 * desde a última coleta posterior à decisão. "Sem efeito" não gera entrada. Sem mudança em nenhum
 * caso, devolve o próprio histórico.
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
    const pendencias = quadroDeBloqueio(c, grupos).pendencias;
    const ultima = ultimaColetaDepoisDoVigente(c, decisao);
    if (ultima?.situacao === situacao && mesmasPendencias(ultima.pendencias, pendencias)) return c;
    const entrada: RegistroColeta = {
      tipo: "coleta", data, situacao, grupos, ...(pendencias.length > 0 ? { pendencias } : {}),
    };
    return { ...c, registros: [...c.registros, entrada] };
  });
  return casos.every((c, i) => c === h.casos[i]) ? h : { versao: 1, casos };
}
