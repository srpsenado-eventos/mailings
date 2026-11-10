import { normalizarTexto } from "@/lib/normalize";

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

/**
 * Feminino → masculino, só para ENCONTRAR a regra de protocolo (Camada B): a tabela
 * escreve os cargos no masculino ("Senador / Deputado Federal"), e "Senadora" não chegava
 * nela por similaridade. Serve só para a busca da regra; a Camada A continua exigindo
 * gênero coerente entre tratamento e cargo, e a comparação com o site não muda.
 * Só palavras da lista mudam, para "mesa" não virar "meso" e "secretaria" (órgão) ficar.
 * Ver docs/superpowers/specs/2026-10-02-ajustes-do-painel-genero-tcu-publicacao.md §4.2
 */
const FEMININO_PARA_MASCULINO: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(CARGOS_FEMININOS.map((f, i) => [f, CARGOS_MASCULINOS[i]])),
  presidenta: "presidente",
});

/** Recebe texto já normalizado (minúsculas, sem acento) e devolve o mesmo texto com os femininos do léxico no masculino. */
export function neutralizarGenero(cargoNormalizado: string): string {
  return cargoNormalizado.replace(/[a-z]+/g, (palavra) => (Object.hasOwn(FEMININO_PARA_MASCULINO, palavra) ? FEMININO_PARA_MASCULINO[palavra] : palavra));
}

/** Prefixos que mudam o sentido de um cargo de 1 token (ex.: "Presidente" ≠ "Vice-Presidente"). */
export const PREFIXOS_NEGANTES: readonly string[] = Object.freeze(["vice", "ex", "sub", "adjunto", "interino", "substituto"]);

/** Tokens significativos (sem acento, sem pontuação, sem palavras de 1 letra). */
export function tokensSignificativos(valor: string): string[] {
  return normalizarTexto(valor)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length > 1);
}

export type Genero = "masculino" | "feminino" | "indeterminado";

/** Marcador de forma genérica: `(a)`, `(o)`, `(as)`, `(os)` em qualquer posição. */
export const MARCADOR_GENERICO = /\((?:a|o|as|os)\)/i;

/**
 * Gênero de um texto pelo léxico recebido. Separa em palavras quebrando também no hífen,
 * para que "advogado-geral" entregue "advogado".
 *
 * Devolve `indeterminado` — que nunca vira acusação — em três casos: nenhuma palavra do
 * léxico, palavras dos dois gêneros no mesmo texto (sinal ambíguo é sinal nenhum, o que
 * cobre "Ministro/Ministra"), ou forma genérica, cujo "Senhor(a)" traz "senhor" sem de fato
 * afirmar o masculino.
 */
export function generoPorLexico(
  valor: string | undefined,
  masculinos: readonly string[],
  femininos: readonly string[],
): Genero {
  if ((valor ?? "").trim().length === 0 || MARCADOR_GENERICO.test(valor ?? "")) return "indeterminado";
  const palavras = new Set(normalizarTexto(valor ?? "").split(/[^a-z]+/).filter(Boolean));
  const temMasculino = masculinos.some((p) => palavras.has(p));
  const temFeminino = femininos.some((p) => palavras.has(p));
  if (temMasculino === temFeminino) return "indeterminado";
  return temMasculino ? "masculino" : "feminino";
}

/** Gênero do cargo pelo léxico de `CARGOS_MASCULINOS` e `CARGOS_FEMININOS`. */
export function generoDoCargo(valor?: string): Genero {
  return generoPorLexico(valor, CARGOS_MASCULINOS, CARGOS_FEMININOS);
}
