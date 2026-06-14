/**
 * Léxico de cargos/funções de autoridade — normalizado (minúsculas, sem acento).
 * Usado por `lib/scrape.ts` (detectar linha-cargo na segmentação) e por
 * `lib/match.ts` (comparar o papel declarado na planilha com o da fonte).
 */
export const CARGOS = [
  "presidente", "vice-presidente", "corregedor", "corregedora",
  "conselheiro", "conselheira", "ministro", "ministra",
  "secretario", "secretaria", "diretor", "diretora",
  "procurador", "procuradora", "defensor", "defensora",
  "governador", "governadora", "senador", "senadora",
  "deputado", "deputada", "embaixador", "embaixadora",
  "prefeito", "prefeita", "desembargador", "desembargadora",
];
