/** Remove acentos, baixa a caixa, colapsa espaços e faz trim. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove marcas de combinação (acentos)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tratamentos e títulos que precedem o nome de uma autoridade. */
const TRATAMENTOS = [
  "exmo.", "exma.", "excelentíssimo", "excelentíssima",
  "sr.", "sra.", "dr.", "dra.",
  "senador", "senadora", "deputado", "deputada",
  "ministro", "ministra", "presidente", "governador", "governadora",
  "vereador", "vereadora", "prefeito", "prefeita", "desembargador", "desembargadora",
];

/**
 * Patentes militares que os tribunais militares (STM) publicam grudadas ao nome,
 * por extenso ou abreviadas: "Gen Ex Fulano", "General de Exército Fulano",
 * "Alte Esq Fulano", "Ten Brig Ar Fulano". Sem isto o nome do site nunca casa o
 * nome da planilha, que vem sem patente.
 */
const PATENTES = [
  "general de exército", "general de divisão", "general de brigada", "general",
  "almirante de esquadra", "vice-almirante", "contra-almirante", "almirante",
  "tenente-brigadeiro do ar", "tenente-brigadeiro ar", "tenente-brigadeiro",
  "brigadeiro do ar", "brigadeiro", "marechal", "coronel",
  "gen ex", "gen div", "gen bda", "alte esq", "ten brig ar", "cel",
];

/**
 * Forma comparável de um token de prefixo: sem acento, sem caixa, sem pontuação
 * e sem a flexão de gênero entre parênteses ("Ministro(a)" → "ministro").
 */
function chaveToken(token: string): string {
  return normalizarTexto(token)
    .replace(/\((?:a|o|as|os)\)$/, "")
    .replace(/[.,;:]/g, "");
}

/** Prefixos removíveis já em tokens, do mais longo para o mais curto. */
const PREFIXOS_REMOVIVEIS: readonly string[][] = [...TRATAMENTOS, ...PATENTES]
  .map((prefixo) => prefixo.split(" ").map(chaveToken))
  .sort((a, b) => b.length - a.length);

/** Remove prefixos de tratamento e patente do início do nome, preservando a caixa original. */
export function removerTratamentos(nome: string): string {
  let tokens = nome.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  let mudou = true;
  while (mudou && tokens.length > 0) {
    mudou = false;
    for (const prefixo of PREFIXOS_REMOVIVEIS) {
      if (prefixo.length > tokens.length) continue;
      if (!prefixo.every((parte, i) => chaveToken(tokens[i]) === parte)) continue;
      tokens = tokens.slice(prefixo.length);
      mudou = true;
      break;
    }
  }
  return tokens.join(" ");
}

/**
 * Rótulos de ficha que alguns portais grudam no fim da linha do nome
 * ("Fulano de Tal Data de nomeação: 21/03/2018").
 */
const SUFIXOS_DE_FICHA = /\b(data d[ae] |nomead[oa] em |posse em |nascid[oa] em )/;

/**
 * Reduz uma linha do site ao que nela é nome próprio: corta o rótulo de ficha do
 * fim e o tratamento/patente do começo. Devolve string vazia ou o complemento do
 * cargo quando a linha não tem nome (ex.: "Presidente do Conselho Nacional de
 * Justiça" → "do Conselho Nacional de Justiça"); quem chama decide o que fazer.
 */
export function nucleoDeNome(linha: string): string {
  const compacta = linha.replace(/\s+/g, " ").trim();
  const sufixo = SUFIXOS_DE_FICHA.exec(normalizarTexto(compacta));
  const semSufixo = sufixo ? compacta.slice(0, sufixo.index) : compacta;
  return removerTratamentos(semSufixo.trim().replace(/[,;]+$/, ""));
}

/** Pipeline padrão para comparar nomes: sem tratamento + normalizado. */
export function normalizarNome(nome: string): string {
  return normalizarTexto(removerTratamentos(nome));
}
