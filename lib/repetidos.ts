import { NIVEIS_ELEITOS, PRECEDENCIA, type NivelPrecedencia } from "@/data/precedencia";
import { grupoEquivalente, type HistoricoDecisoes } from "@/lib/decisoes";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import { NOME_GRUPO_DEPUTADOS, temGrupoDeputados } from "@/lib/painel-deputados";
import { aplicarDecisoes, marcaDaDecisao, type MarcaDeRepeticao } from "@/lib/repetidos-decisoes";
import {
  entradasDoGrupo, escolherComEleito, escolherGrupo, MOTIVO_PARCIAL, semRepeticao,
  type AutoridadeRepetida, type Entrada, type OcorrenciaRepetida, type OrigemOcorrencia, type SituacaoRepetida,
} from "@/lib/repetidos-base";
import type {
  ContatoDoEleito, DestinoEleito, DestinoGoverno, ResultadoContato, ResultadoEleicao, ResultadoGrupo,
} from "@/lib/types";

export {
  compararNivel, equivalenteDaOcorrencia, escolherGrupo, MOTIVO_ELEICAO, MOTIVO_ELEITO_SEM_CARGO_ATUAL, MOTIVO_PARCIAL,
  MOTIVO_SEM_NIVEL, nivelDoCargo, regraDoSegmento, rotuloOrigem,
} from "@/lib/repetidos-base";
export type {
  AutoridadeRepetida, Escolha, OcorrenciaRepetida, OrigemOcorrencia, SituacaoRepetida,
} from "@/lib/repetidos-base";
export type { MarcaDeRepeticao } from "@/lib/repetidos-decisoes";

/** Uma pessoa das listas de fora do Contatos, com os dois nomes dela. */
export interface PessoaDeFora {
  nomes: string[];
  /** `nomes` normalizados, sem repetição nem vazios (calculados uma vez só). */
  nomesNormalizados: string[];
  ocorrencia: OcorrenciaRepetida;
}

const NIVEL_DEPUTADOS = PRECEDENCIA.find((r) => r.grupo === NOME_GRUPO_DEPUTADOS)?.nivel;

function pessoaDeFora(
  nomes: readonly string[], grupoDaLista: string, cargo: string, origem: OrigemOcorrencia, nivel: NivelPrecedencia | undefined,
): PessoaDeFora[] {
  const normalizados = nomes.map(normalizarNome);
  const chave = normalizados.find(Boolean);
  if (!chave) return [];
  const nomesNormalizados = [...new Set(normalizados.filter(Boolean))];
  return [{
    nomes: [...nomes],
    nomesNormalizados,
    ocorrencia: {
      grupo: grupoDaLista, grupoRegra: grupoDaLista, chave, cargo,
      ...(nivel ? { nivel } : {}),
      ex: false, possivelSaida: false, origem,
    },
  }];
}

/**
 * Deputados atuais da planilha da Câmara (spec 2026-10-27 §4.2), só enquanto o grupo não existe
 * no Contatos. Casam com o Contatos pelo nome, exato ou parcial.
 */
export function ocorrenciasDeFora(eleicao: ResultadoEleicao | undefined): PessoaDeFora[] {
  if (!eleicao || !temGrupoDeputados(eleicao)) return [];
  return (eleicao.deputadosAtuais ?? []).flatMap((d) =>
    pessoaDeFora([d.nomeParlamentar, d.nomeCivil], NOME_GRUPO_DEPUTADOS, "Deputado Federal", "camara", NIVEL_DEPUTADOS));
}

/** Eleito de 2026 já ligado pelo eixo da Eleição a linhas do Contatos (spec 2026-10-28 §8). */
export interface EleitoLigado {
  ocorrencia: OcorrenciaRepetida;
  contatos: readonly ContatoDoEleito[];
  /** Destino que o eixo da Eleição deu ao eleito. */
  destino: DestinoEleito | DestinoGoverno;
  motivo?: string;
}

const MOTIVO_ELEICAO_SEM_MOTIVO = "Eleição 2026: conferir no eixo da eleição";
export const MOTIVO_ELEICAO_NOVO = "Eleição 2026: mandato novo de quem já está no Contatos";

function eleitoLigado(
  nomes: readonly string[], contatos: readonly ContatoDoEleito[], destino: DestinoEleito | DestinoGoverno, motivo: string | undefined,
  grupoDaLista: string, cargo: string, nivel: NivelPrecedencia | undefined, grupoDestino: string | undefined,
): EleitoLigado[] {
  if (contatos.length === 0) return [];
  const [pessoa] = pessoaDeFora(nomes, grupoDaLista, cargo, "eleicao", nivel);
  if (!pessoa) return [];
  const ocorrencia = grupoDestino?.trim()
    ? { ...pessoa.ocorrencia, grupoEquivalente: grupoEquivalente(grupoDaLista, "eleicao", grupoDestino) }
    : pessoa.ocorrencia;
  return [{ ocorrencia, contatos, destino, ...(motivo ? { motivo } : {}) }];
}

/**
 * Eleitos de 2026 (Senado, Câmara, governos) com ligação a linhas do Contatos. O eleito nunca casa por
 * nome: sem ligação, não entra.
 */
export function eleitosLigados(eleicao: ResultadoEleicao | undefined): EleitoLigado[] {
  if (!eleicao) return [];
  const parlamentares = eleicao.eleitos.flatMap(({ eleito, contatos, destino, motivo, grupoDestino }) =>
    eleito.casa === "senado"
      ? eleitoLigado([eleito.nomeUrna, eleito.nomeCompleto], contatos, destino, motivo, "Senadores Eleitos", "Senador eleito", NIVEIS_ELEITOS.senado, grupoDestino)
      : eleitoLigado([eleito.nomeUrna, eleito.nomeCompleto], contatos, destino, motivo, "Deputados Federais Eleitos", "Deputado federal eleito", NIVEIS_ELEITOS.camara, grupoDestino));
  const governadores = (eleicao.governadores?.eleitos ?? []).flatMap(({ eleito, contatos, destino, motivo, grupoDestino }) =>
    eleitoLigado(
      [eleito.nomeUrna, eleito.nomeCompleto], contatos, destino, motivo, "Governadores Eleitos", "Governador eleito",
      eleito.uf.trim().toUpperCase() === "DF" ? NIVEIS_ELEITOS.governadorDistritoFederal : NIVEIS_ELEITOS.governador, grupoDestino,
    ));
  return [...parlamentares, ...governadores];
}

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);
const MIN_PALAVRAS_PARCIAL = 2;

function palavrasDoNome(chave: string): string[] {
  return chave.split(" ").filter((p) => p.length > 1 && !LIGACOES.has(p));
}

function contido(a: readonly string[], b: readonly string[]): boolean {
  return a.length >= MIN_PALAVRAS_PARCIAL && a.every((p) => b.includes(p));
}

/**
 * Junta as chaves de nome parcial (uma contida na outra) que estão em grupos diferentes.
 * Chave só de fora do Contatos se liga apenas a chaves do Contatos, por qualquer dos nomes
 * da pessoa; duas chaves de fora nunca se ligam entre si.
 */
function componentesDeNome(porChave: ReadonlyMap<string, Entrada[]>, doContatos: ReadonlySet<string>): string[][] {
  const chaves = [...porChave.keys()];
  const pai = new Map(chaves.map((k) => [k, k]));
  const raiz = (k: string): string => (pai.get(k) === k ? k : raiz(pai.get(k) as string));
  // Pré-cálculo por chave (uma vez só): palavras de cada nome e grupos. Na chave do Contatos só contam
  // os grupos do Contatos: a pessoa da Câmara casada exata não liga dois nomes do mesmo grupo.
  const perfil = new Map(chaves.map((k) => {
    const entradas = porChave.get(k) ?? [];
    const nomes = doContatos.has(k) ? [k] : [...new Set(entradas.flatMap((e) => e.nomes ?? [k]))];
    const grupos = new Set(entradas
      .filter((e) => !doContatos.has(k) || e.ocorrencia.origem === "contatos")
      .map((e) => e.ocorrencia.grupoRegra));
    return [k, { palavras: nomes.map(palavrasDoNome), grupos }] as const;
  }));
  const gruposDistintos = (x: ReadonlySet<string>, y: ReadonlySet<string>): boolean => {
    const juntos = new Set(x);
    for (const g of y) juntos.add(g);
    return juntos.size >= 2;
  };
  const parcialEntrePerfis = (x: readonly string[][], y: readonly string[][]): boolean =>
    x.some((pa) => y.some((pb) => contido(pa, pb) || contido(pb, pa)));
  // Nome parcial exige palavra em comum: só as chaves que dividem alguma palavra são comparadas.
  const porPalavra = new Map<string, number[]>();
  chaves.forEach((k, i) => {
    for (const palavra of new Set((perfil.get(k)?.palavras ?? []).flat())) {
      const indices = porPalavra.get(palavra);
      if (indices) indices.push(i); else porPalavra.set(palavra, [i]);
    }
  });
  chaves.forEach((a, i) => {
    const pa = perfil.get(a);
    if (!pa) return;
    const candidatas = new Set(pa.palavras.flat().flatMap((palavra) => porPalavra.get(palavra) ?? []));
    for (const j of candidatas) {
      const [b, pb] = [chaves[j], perfil.get(chaves[j])];
      if (j <= i || !pb) continue;
      if (!doContatos.has(a) && !doContatos.has(b)) continue;
      if (!parcialEntrePerfis(pa.palavras, pb.palavras)) continue;
      if (!gruposDistintos(pa.grupos, pb.grupos)) continue;
      pai.set(raiz(a), raiz(b));
    }
  });
  const porRaiz = new Map<string, string[]>();
  for (const k of chaves) {
    const membros = porRaiz.get(raiz(k));
    if (membros) membros.push(k); else porRaiz.set(raiz(k), [k]);
  }
  return [...porRaiz.values()];
}

/**
 * Entrada da pessoa de fora. Casa exata com o Contatos quando qualquer dos nomes é igual a uma
 * chave do Contatos (fica sob essa chave); senão, fica sob a própria chave e só se liga por nome parcial.
 */
function entradaDeFora(p: PessoaDeFora, doContatos: ReadonlySet<string>): { chave: string; entrada: Entrada } | undefined {
  const nomes = p.nomesNormalizados;
  if (nomes.length === 0) return undefined;
  const exata = nomes.find((n) => doContatos.has(n));
  return { chave: exata ?? p.ocorrencia.chave, entrada: { nome: p.nomes.find((n) => n.trim()) ?? p.nomes[0], ocorrencia: p.ocorrencia, nomes } };
}

/** Um caso em formação: chaves de nome ligadas, se há nome parcial entre elas, e os eleitos ligados pelo eixo. */
interface Componente {
  chaves: string[];
  parcial: boolean;
  eleitos: EleitoLigado[];
}

/** Eleito cujo destino o eixo da Eleição deixou para o GT decidir: o app não decide no lugar dele. */
function motivoDoEixo(eleitos: readonly EleitoLigado[]): string | undefined {
  const pendente = eleitos.find((e) => e.destino === "conferir" || e.destino === "novo");
  if (!pendente) return undefined;
  if (pendente.destino === "novo") return MOTIVO_ELEICAO_NOVO;
  return pendente.motivo ? `Eleição 2026: ${pendente.motivo}` : MOTIVO_ELEICAO_SEM_MOTIVO;
}

function autoridadeDoComponente(c: Componente, porChave: ReadonlyMap<string, Entrada[]>): AutoridadeRepetida[] {
  const doComponente = c.chaves.flatMap((k) => porChave.get(k) ?? []);
  const doCadastro = doComponente.find((e) => e.ocorrencia.origem === "contatos");
  if (!doCadastro) return [];
  const ocorrencias = semRepeticao([...doComponente.map((e) => e.ocorrencia), ...c.eleitos.map((e) => e.ocorrencia)]);
  if (new Set(ocorrencias.map((o) => o.grupoRegra)).size < 2) return [];
  const nome = doCadastro.nome;
  if (c.eleitos.length === 0) return [{ nome, ocorrencias, ...escolherGrupo(ocorrencias, c.parcial) }];
  const doEixo = motivoDoEixo(c.eleitos);
  if (doEixo) {
    const motivo = c.parcial ? `${doEixo} · ${MOTIVO_PARCIAL}` : doEixo;
    return [{ nome, ocorrencias, situacao: "conferir", motivo, eleicao: true }];
  }
  const escolha = c.parcial ? escolherGrupo(ocorrencias, true) : escolherComEleito(ocorrencias);
  return [{ nome, ocorrencias, ...escolha, eleicao: true }];
}

/**
 * Liga cada eleito (pela ligação do eixo da Eleição 2026, nunca pelo nome) ao caso da pessoa do Contatos
 * que ele aponta. Várias linhas com o mesmo nome (Senadores e Presidente do Senado) ficam no mesmo caso.
 * Eleito ligado a nomes distintos é ambíguo (o painel da Eleição já mostra) e não entra; ligação a linha
 * que não é ocorrência do cálculo (grupo de eleitos, PILOTO, grupo fora da Nominata) não conta, e sem
 * nenhuma ligação o eleito também não entra.
 */
function ligarEleitos(
  componentes: readonly string[][], eleitos: readonly EleitoLigado[], porChave: ReadonlyMap<string, Entrada[]>,
): Componente[] {
  const indiceDaChave = new Map(componentes.flatMap((chaves, i) => chaves.map((k) => [k, i] as const)));
  const casoDoEleito = (e: EleitoLigado): number | undefined => {
    const chaves = new Set(e.contatos.map((l) => normalizarNome(l.nome)));
    if (chaves.size !== 1) return undefined;
    const [chave] = chaves;
    const naLinha = e.contatos.some((l) => (porChave.get(chave) ?? [])
      .some((x) => x.ocorrencia.origem === "contatos" && x.ocorrencia.grupo === l.grupo));
    return naLinha ? indiceDaChave.get(chave) : undefined;
  };
  const eleitosDoCaso = new Map<number, EleitoLigado[]>();
  for (const e of eleitos) {
    const caso = casoDoEleito(e);
    if (caso !== undefined) eleitosDoCaso.set(caso, [...(eleitosDoCaso.get(caso) ?? []), e]);
  }
  return componentes.map((chaves, i) => ({
    chaves: [...chaves], parcial: chaves.length > 1, eleitos: eleitosDoCaso.get(i) ?? [],
  }));
}

const ORDEM_SITUACAO: Record<SituacaoRepetida, number> = { conferir: 0, decidido: 1, decidido_gt: 2, tratado: 3 };

/**
 * Autoridades em dois ou mais grupos do retrato, com o grupo do convite. "Conferir" primeiro.
 * Com `eleicao`, entram também os deputados atuais da planilha da Câmara (pelo nome) e os eleitos de
 * 2026 (pela ligação do eixo da Eleição, spec 2026-10-28 §8); só conta quem tem ocorrência no Contatos.
 * Com `decisoes`, a decisão vigente do GT vale sobre a regra (spec 2026-10-30 §4.1.3), e os casos
 * decididos cuja pessoa já não está repetida entram também.
 */
export function autoridadesRepetidas(
  grupos: readonly ResultadoGrupo[], eleicao?: ResultadoEleicao, decisoes?: HistoricoDecisoes,
): AutoridadeRepetida[] {
  const porChave = new Map<string, Entrada[]>();
  const juntar = (chave: string, e: Entrada) => porChave.set(chave, [...(porChave.get(chave) ?? []), e]);
  for (const e of grupos.flatMap(entradasDoGrupo)) juntar(e.ocorrencia.chave, e);
  const doContatos = new Set(porChave.keys());
  for (const p of ocorrenciasDeFora(eleicao)) {
    const fora = entradaDeFora(p, doContatos);
    if (fora) juntar(fora.chave, fora.entrada);
  }

  const casos = ligarEleitos(componentesDeNome(porChave, doContatos), eleitosLigados(eleicao), porChave);
  const pelaRegra = casos.flatMap((c) => autoridadeDoComponente(c, porChave));
  const lista = decisoes ? aplicarDecisoes(pelaRegra, decisoes, grupos, eleicao) : pelaRegra;

  return lista.sort((a, b) =>
    a.situacao !== b.situacao ? ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] : a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Etiqueta pela regra da Nominata (sem decisão do GT, ou caso reaberto). */
function etiquetaDaRegra(a: AutoridadeRepetida, grupo: string): Etiqueta | undefined {
  const convidaPor = a.convidaPor;
  if (a.situacao === "conferir" || !convidaPor) {
    return { campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: a.motivo };
  }
  // Eleito decidido: a linha do grupo que convida já tem a etiqueta da Eleição 2026; as outras seguem a regra normal.
  if (a.eleicao && convidaPor.origem === "contatos" && convidaPor.grupo === grupo) return undefined;
  if (convidaPor.origem === "contatos" && convidaPor.grupo === grupo) {
    const outros = [...new Set(a.ocorrencias.filter((o) => o.grupoRegra !== convidaPor.grupoRegra).map((o) => o.grupoRegra))].join(", ");
    return { campo: "grupo", tom: "neutro", texto: `Convidada por este grupo; também em ${outros}`, explicacao: a.motivo };
  }
  return { campo: "grupo", tom: "ruim", texto: `Autoridade a ser convidada pelo grupo ${convidaPor.grupoRegra}`, explicacao: a.motivo };
}

/** Etiqueta da linha do contato no painel; fora de `etiquetasDoContato`, não pinta a situação. */
export function etiquetaDeRepeticao(
  repetidas: readonly AutoridadeRepetida[],
  c: ResultadoContato,
  grupo: string,
): MarcaDeRepeticao | undefined {
  const chave = normalizarNome(c.contato.nome);
  const a = repetidas.find((r) => r.ocorrencias.some((o) => o.origem === "contatos" && o.grupo === grupo && o.chave === chave));
  if (!a) return undefined;
  if (a.decisao && (a.situacao === "decidido_gt" || a.situacao === "tratado")) return marcaDaDecisao(a, a.decisao, grupo);
  const etiqueta = etiquetaDaRegra(a, grupo);
  return etiqueta ? { etiqueta, fosca: false } : undefined;
}

export type FiltroRepetidas = "todas" | "conferir" | "decidido" | "decidido_gt" | "tratado";

export function filtrarRepetidas(lista: readonly AutoridadeRepetida[], busca: string, filtro: FiltroRepetidas): AutoridadeRepetida[] {
  const termo = normalizarTexto(busca);
  return lista.filter((a) => (filtro === "todas" || a.situacao === filtro) && (!termo || normalizarTexto(a.nome).includes(termo)));
}

/** Texto do link; `n` conta só as autoridades sem `eleicao` (as de eleito vão em `textoEleitosRepetidos`). */
export function textoRepetidas(n: number): string {
  return n === 1 ? "1 autoridade em mais de um grupo" : `${n} autoridades em mais de um grupo`;
}

export function textoEleitosRepetidos(n: number): string {
  return n === 1 ? "1 eleito já no Contatos" : `${n} eleitos já no Contatos`;
}

/** Divide a lista em eleitos de 2026 (seção própria da tela) e demais, mantendo a ordem. */
export function separarRepetidas(lista: readonly AutoridadeRepetida[]): { demais: AutoridadeRepetida[]; eleitos: AutoridadeRepetida[] } {
  return {
    demais: lista.filter((a) => !a.eleicao),
    eleitos: lista.filter((a) => a.eleicao),
  };
}

/** A pessoa está em dois ou mais grupos (as tratadas e as não encontradas, fora do cálculo, não estão). */
export function emMaisDeUmGrupo(a: AutoridadeRepetida): boolean {
  return new Set(a.ocorrencias.map((o) => o.grupoRegra)).size >= 2;
}

/** Texto do link do painel: as demais e, quando há, o contador de eleitos já no Contatos; só quem está em 2+ grupos. */
export function textoLinkRepetidas(lista: readonly AutoridadeRepetida[]): string {
  const { demais, eleitos } = separarRepetidas(lista.filter(emMaisDeUmGrupo));
  if (eleitos.length === 0) return textoRepetidas(demais.length);
  if (demais.length === 0) return textoEleitosRepetidos(eleitos.length);
  return `${textoRepetidas(demais.length)} · ${textoEleitosRepetidos(eleitos.length)}`;
}
