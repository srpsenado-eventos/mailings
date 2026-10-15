import { PRECEDENCIA, type NivelPrecedencia, type RegraPrecedencia } from "@/data/precedencia";
import { casaSegmento, segmentarGrupo } from "@/lib/catalogo";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import type { ResultadoContato, ResultadoGrupo } from "@/lib/types";

/** Grupos fora deste eixo: os de eleitos (Eleição 2026, Ata 14) e o piloto de eventos. */
const GRUPO_FORA = /\beleit[oa]s?\b|piloto/;

/**
 * Regra de precedência de um segmento (já normalizado) do rótulo "Grupo" do Contatos.
 * Exata primeiro; por contenção só quando uma regra única casa — segmento que casa duas
 * fica de fora em vez de cair na primeira da tabela.
 */
export function regraDoSegmento(segmento: string): RegraPrecedencia | undefined {
  if (GRUPO_FORA.test(segmento)) return undefined;
  const exata = PRECEDENCIA.find((r) => normalizarTexto(r.grupo) === segmento);
  if (exata) return exata;
  const contidas = PRECEDENCIA.filter((r) => casaSegmento(normalizarTexto(r.grupo), segmento));
  return contidas.length === 1 ? contidas[0] : undefined;
}

const PRESIDENTE = /^(ministr[oa][- ])?president[ea]\b/;
const PRESIDENCIA_DE_ORGAO_INTERNO = /\b(turma|secao|comissao|conselho)\b/;

/** Nível da Nominata para o cargo dentro do grupo da regra; `undefined` = fora da Nominata. */
export function nivelDoCargo(regra: RegraPrecedencia, cargo: string): NivelPrecedencia | undefined {
  const c = normalizarTexto(cargo);
  if (regra.presidente && PRESIDENTE.test(c) && !PRESIDENCIA_DE_ORGAO_INTERNO.test(c)) return regra.presidente;
  if (regra.distritoFederal && c.includes("distrito federal")) return regra.distritoFederal;
  return regra.nivel;
}

/** Negativo quando `a` vem antes de `b` na Nominata ("4.9" antes de "4.10", "4.10" antes de "4.10.1"). */
export function compararNivel(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

export interface OcorrenciaRepetida {
  /** Grupo do retrato (`ResultadoGrupo.grupo`), como aparece no painel. */
  grupo: string;
  /** Grupo da tabela de precedência que o rótulo casou. */
  grupoRegra: string;
  /** `normalizarNome` do nome no cadastro. */
  chave: string;
  cargo: string;
  nivel?: NivelPrecedencia;
  ex: boolean;
  possivelSaida: boolean;
}

export type SituacaoRepetida = "decidido" | "conferir";

export interface AutoridadeRepetida {
  nome: string;
  ocorrencias: OcorrenciaRepetida[];
  situacao: SituacaoRepetida;
  /** Só quando decidido. */
  convidaPor?: OcorrenciaRepetida;
  motivo: string;
}

export interface Escolha {
  situacao: SituacaoRepetida;
  convidaPor?: OcorrenciaRepetida;
  motivo: string;
}

export const MOTIVO_PARCIAL = "Nome parecido em grupos diferentes: conferir se é a mesma pessoa";
export const MOTIVO_SEM_NIVEL = "Nenhum dos cargos está na Nominata: decidir à mão";

const rotulo = (o: OcorrenciaRepetida): string => `${o.grupoRegra} (${o.nivel ? o.nivel.nivel : "fora da Nominata"})`;

/** Com nível antes de sem nível; entre os com nível, a ordem da Nominata. */
function ordemDePrecedencia(a: OcorrenciaRepetida, b: OcorrenciaRepetida): number {
  if (a.nivel && b.nivel) return compararNivel(a.nivel.nivel, b.nivel.nivel);
  if (a.nivel) return -1;
  if (b.nivel) return 1;
  return 0;
}

/** Uma ocorrência por grupo da tabela (rótulos repetidos do mesmo grupo não disputam entre si): a de melhor nível. */
function melhorPorGrupoRegra(ocorrencias: readonly OcorrenciaRepetida[]): OcorrenciaRepetida[] {
  const melhores = new Map<string, OcorrenciaRepetida>();
  for (const o of ocorrencias) {
    const atual = melhores.get(o.grupoRegra);
    if (!atual || ordemDePrecedencia(o, atual) < 0) melhores.set(o.grupoRegra, o);
  }
  return [...melhores.values()];
}

/**
 * Regra do Clovis (2026-10-13): cargo atual vence cargo de "ex-"; entre os que restam,
 * vence o nível mais alto da Nominata. Empate, nenhum nível, nome parcial ou possível
 * saída no vencedor ficam para decidir à mão.
 */
export function escolherGrupo(ocorrencias: readonly OcorrenciaRepetida[], parcial: boolean): Escolha {
  if (parcial) return { situacao: "conferir", motivo: MOTIVO_PARCIAL };
  const atuais = ocorrencias.filter((o) => !o.ex);
  const disputa = melhorPorGrupoRegra(atuais.length > 0 ? atuais : ocorrencias);
  let vencedor: OcorrenciaRepetida;
  let motivo: string;
  if (disputa.length === 1) {
    vencedor = disputa[0];
    const exs = [...new Set(ocorrencias.filter((o) => o.ex).map((o) => o.grupoRegra))].join(", ");
    motivo = `Cargo atual (${vencedor.grupoRegra}) vence cargo de ex- (${exs})`;
  } else {
    const [primeira, segunda] = [...disputa].sort(ordemDePrecedencia);
    if (!primeira.nivel) return { situacao: "conferir", motivo: MOTIVO_SEM_NIVEL };
    if (segunda.nivel && compararNivel(primeira.nivel.nivel, segunda.nivel.nivel) === 0) {
      return { situacao: "conferir", motivo: `Mesmo nível na Nominata (${primeira.nivel.nivel}): decidir à mão` };
    }
    vencedor = primeira;
    motivo = `${rotulo(primeira)} antes de ${rotulo(segunda)}`;
  }
  if (vencedor.possivelSaida) {
    return { situacao: "conferir", motivo: `Possível saída em ${vencedor.grupoRegra}: confirmar o cargo antes de decidir` };
  }
  return { situacao: "decidido", convidaPor: vencedor, motivo };
}

interface Entrada { nome: string; ocorrencia: OcorrenciaRepetida }

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);
const MIN_PALAVRAS_PARCIAL = 2;

function palavrasDoNome(chave: string): string[] {
  return chave.split(" ").filter((p) => p.length > 1 && !LIGACOES.has(p));
}

/** Uma entrada por segmento do rótulo que casa uma regra (célula "A; B" vira duas). */
function entradasDoGrupo(g: ResultadoGrupo): Entrada[] {
  const regras = segmentarGrupo(g.grupo)
    .map(regraDoSegmento)
    .filter((r): r is RegraPrecedencia => r !== undefined)
    .filter((r, i, todas) => todas.findIndex((x) => x.grupo === r.grupo) === i);
  return g.contatos.flatMap((c) => {
    const chave = normalizarNome(c.contato.nome);
    if (!chave) return [];
    const cargo = c.contato.cargo ?? "";
    return regras.map((regra) => {
      const nivel = nivelDoCargo(regra, cargo);
      return {
        nome: c.contato.nome,
        ocorrencia: {
          grupo: g.grupo, grupoRegra: regra.grupo, chave, cargo,
          ...(nivel ? { nivel } : {}),
          ex: regra.ex, possivelSaida: Boolean(c.possivelSaida),
        },
      };
    });
  });
}

function contido(a: readonly string[], b: readonly string[]): boolean {
  return a.length >= MIN_PALAVRAS_PARCIAL && a.every((p) => b.includes(p));
}

/** Junta as chaves de nome parcial (uma contida na outra) que estão em grupos diferentes. */
function componentesDeNome(porChave: ReadonlyMap<string, Entrada[]>): string[][] {
  const chaves = [...porChave.keys()];
  const pai = new Map(chaves.map((k) => [k, k]));
  const raiz = (k: string): string => (pai.get(k) === k ? k : raiz(pai.get(k) as string));
  const grupos = (k: string) => new Set((porChave.get(k) ?? []).map((e) => e.ocorrencia.grupoRegra));
  for (let i = 0; i < chaves.length; i++) {
    for (let j = i + 1; j < chaves.length; j++) {
      const [a, b] = [chaves[i], chaves[j]];
      const [pa, pb] = [palavrasDoNome(a), palavrasDoNome(b)];
      if (!contido(pa, pb) && !contido(pb, pa)) continue;
      if (new Set([...grupos(a), ...grupos(b)]).size < 2) continue;
      pai.set(raiz(a), raiz(b));
    }
  }
  const porRaiz = new Map<string, string[]>();
  for (const k of chaves) porRaiz.set(raiz(k), [...(porRaiz.get(raiz(k)) ?? []), k]);
  return [...porRaiz.values()];
}

/** Autoridades em dois ou mais grupos do retrato, com o grupo do convite. "Conferir" primeiro. */
export function autoridadesRepetidas(grupos: readonly ResultadoGrupo[]): AutoridadeRepetida[] {
  const entradas = grupos.flatMap(entradasDoGrupo);
  const porChave = new Map<string, Entrada[]>();
  for (const e of entradas) porChave.set(e.ocorrencia.chave, [...(porChave.get(e.ocorrencia.chave) ?? []), e]);

  const lista = componentesDeNome(porChave).flatMap((chaves): AutoridadeRepetida[] => {
    const doComponente = chaves.flatMap((k) => porChave.get(k) ?? []);
    const ocorrencias = doComponente
      .map((e) => e.ocorrencia)
      .filter((o, i, todas) => todas.findIndex((x) => x.grupo === o.grupo && x.grupoRegra === o.grupoRegra && x.chave === o.chave) === i);
    if (new Set(ocorrencias.map((o) => o.grupoRegra)).size < 2) return [];
    return [{ nome: doComponente[0].nome, ocorrencias, ...escolherGrupo(ocorrencias, chaves.length > 1) }];
  });

  return lista.sort((a, b) =>
    a.situacao !== b.situacao ? (a.situacao === "conferir" ? -1 : 1) : a.nome.localeCompare(b.nome, "pt-BR"),
  );
}

/** Etiqueta da linha do contato no painel; fora de `etiquetasDoContato`, não pinta a situação. */
export function etiquetaDeRepeticao(
  repetidas: readonly AutoridadeRepetida[],
  c: ResultadoContato,
  grupo: string,
): Etiqueta | undefined {
  const chave = normalizarNome(c.contato.nome);
  const a = repetidas.find((r) => r.ocorrencias.some((o) => o.grupo === grupo && o.chave === chave));
  if (!a) return undefined;
  const convidaPor = a.convidaPor;
  if (a.situacao === "conferir" || !convidaPor) {
    return { campo: "grupo", tom: "atencao", texto: "Em mais de um grupo: conferir", explicacao: a.motivo };
  }
  if (convidaPor.grupo === grupo) {
    const outros = [...new Set(a.ocorrencias.filter((o) => o.grupoRegra !== convidaPor.grupoRegra).map((o) => o.grupoRegra))].join(", ");
    return { campo: "grupo", tom: "neutro", texto: `Convidada por este grupo; também em ${outros}`, explicacao: a.motivo };
  }
  return { campo: "grupo", tom: "ruim", texto: `Autoridade a ser convidada pelo grupo ${convidaPor.grupoRegra}`, explicacao: a.motivo };
}

export type FiltroRepetidas = "todas" | "decidido" | "conferir";

export function filtrarRepetidas(lista: readonly AutoridadeRepetida[], busca: string, filtro: FiltroRepetidas): AutoridadeRepetida[] {
  const termo = normalizarTexto(busca);
  return lista.filter((a) => (filtro === "todas" || a.situacao === filtro) && (!termo || normalizarTexto(a.nome).includes(termo)));
}

export function textoRepetidas(n: number): string {
  return n === 1 ? "1 autoridade em mais de um grupo" : `${n} autoridades em mais de um grupo`;
}
