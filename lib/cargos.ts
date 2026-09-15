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

/**
 * Palavras de cargo que **distinguem** gênero — normalizadas, uma lista por gênero.
 * Usadas pela Camada A da auditoria de tratamento (`lib/tratamento.ts`) para checar se o
 * `Cargo` contradiz o `Tratamento` cadastrado.
 *
 * As duas listas não são espelho uma da outra, e isso é proposital. O que fica de fora:
 *
 * - **Palavras de dois gêneros** — "presidente", "consul", "chefe", "analista", "gerente",
 *   "assistente", "suplente". Não distinguem gênero, logo não produzem sinal nenhum.
 * - **"embaixatriz"**, que não é o feminino de "embaixador" (é título da cônjuge) e cujo
 *   uso no cadastro é ambíguo demais para virar acusação.
 * - **"secretaria"**, que na planilha aparece como nome de órgão ("Secretaria-Geral da
 *   Presidência da República") e não como feminino de "secretário". O masculino
 *   "secretario" continua na lista, porque não carrega esse duplo sentido.
 *
 * Palavra composta com hífen entra pela primeira parte ("advogado-geral" → "advogado"),
 * porque a comparação separa o cargo em palavras quebrando também no hífen.
 */
export const CARGOS_MASCULINOS = [
  "ministro", "embaixador", "governador", "encarregado",
  "senador", "deputado", "procurador", "defensor",
  "desembargador", "conselheiro", "diretor", "prefeito",
  "corregedor", "ouvidor", "controlador", "advogado",
  "delegado", "reitor", "juiz", "secretario",
];

export const CARGOS_FEMININOS = [
  "ministra", "embaixadora", "governadora", "encarregada",
  "senadora", "deputada", "procuradora", "defensora",
  "desembargadora", "conselheira", "diretora", "prefeita",
  "corregedora", "ouvidora", "controladora", "advogada",
  "delegada", "reitora", "juiza",
];
