/**
 * Cargo nos tribunais (spec 2026-10-30 §3.2). Nos grupos de tribunal, as funções que a
 * página publica ("Vice-Presidente", "Corregedor-Geral …", "Diretor-Geral da ENFAM",
 * "(Corregedor-Geral)", "Decano") valem como "Ministro" e confirmam o cargo
 * "Ministro(a) do <tribunal>" do Contatos. A regra fica em `lib/cargo-tribunal.ts`.
 */

/** Segmentos do catálogo (`GrupoCatalogo.nome`) que são tribunais. */
export const GRUPOS_DE_TRIBUNAL: readonly string[] = Object.freeze([
  "Ministros do STF",
  "Ministros do STJ",
  "Ministros do TSE",
  "Ministros do TST",
  "Ministros do STM",
  "Ministros do TCU",
]);

/**
 * Funções de tribunal, normalizadas (minúsculas, sem acento) e no masculino: o feminino
 * da página chega aqui por `neutralizarGenero`, e "decana" pela comparação em `lib/cargo-tribunal.ts`.
 * A forma com hífen também casa com espaço ("vice presidente").
 */
export const FUNCOES_DE_TRIBUNAL: readonly string[] = Object.freeze([
  "ministro",
  "presidente",
  "vice-presidente",
  "corregedor-geral",
  "corregedor",
  "diretor-geral",
  "diretor",
  "decano",
  "ouvidor",
]);

export function ehGrupoDeTribunal(grupoCanonico: string | undefined): boolean {
  return grupoCanonico !== undefined && GRUPOS_DE_TRIBUNAL.includes(grupoCanonico);
}
