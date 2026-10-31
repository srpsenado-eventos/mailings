import { normalizarTexto } from "@/lib/normalize";
import { generoDoCargo, neutralizarGenero, PREFIXOS_NEGANTES, tokensSignificativos } from "@/lib/cargos";
import { ehGrupoDeTribunal, FUNCOES_DE_TRIBUNAL } from "@/data/cargos-tribunal";
import type { SituacaoCampo } from "@/lib/types";

/**
 * Cargo nos tribunais e gênero neutro da página (spec 2026-10-30 §3.2). Funções puras usadas
 * por `situacaoCampo` (`lib/match.ts`); as listas ficam em `data/cargos-tribunal.ts`.
 */

/** Contexto do grupo na comparação de cargo. */
export interface ContextoCargo {
  /** Grupo de tribunal (`data/cargos-tribunal.ts`): as funções de tribunal valem como "Ministro". */
  tribunal?: boolean;
}

/** O contexto de cargo do grupo canônico (nome do catálogo). */
export function contextoCargoDoGrupo(grupoCanonico: string | undefined): ContextoCargo {
  return { tribunal: ehGrupoDeTribunal(grupoCanonico) };
}

/** "Ministro(a)", "Corregedor(a)-Geral", "Ministro/Ministra": a página não diz o gênero (texto normalizado). */
const MARCA_GENERO_NEUTRO = /\(a\)|\b([a-z]+?)o?\/\1a\b/;

export function temGeneroNeutro(valor: string): boolean {
  return MARCA_GENERO_NEUTRO.test(normalizarTexto(valor));
}

/** Normaliza, descarta o "(a)" e põe os femininos do léxico no masculino. */
export function semGenero(valor: string): string {
  return neutralizarGenero(normalizarTexto(valor).replace(/\(a\)/g, ""));
}

/** Uma expressão por função de tribunal: o hífen também casa com espaço, e o "o" final também com "a" ("decana"). */
const REGEX_FUNCOES: ReadonlyMap<string, RegExp> = new Map(
  FUNCOES_DE_TRIBUNAL.map((f) => {
    const corpo = f.replace(/o$/, "[oa]").replace(/-/g, "[- ]");
    return [f, new RegExp(`(^|[^a-z])${corpo}($|[^a-z])`)];
  }),
);
const REGEX_VICE_PRESIDENTE = /(^|[^a-z])vice[- ]?presidente($|[^a-z])/g;

function temFuncao(texto: string, funcao: string): boolean {
  return REGEX_FUNCOES.get(funcao)?.test(texto) ?? false;
}

/** "Presidente" que não é "Vice-Presidente" (texto já sem gênero). */
function temPresidenciaPropria(texto: string): boolean {
  return temFuncao(texto.replace(REGEX_VICE_PRESIDENTE, " "), "presidente");
}

/** Só a função genérica "Ministro(a)", sem nenhuma função específica. */
function soMinistro(texto: string): boolean {
  return temFuncao(texto, "ministro") && FUNCOES_DE_TRIBUNAL.every((f) => f === "ministro" || !temFuncao(texto, f));
}

/** Prefixos que negam a função, menos o "vice", que nos tribunais é função própria. */
const NEGANTES_NO_TRIBUNAL = PREFIXOS_NEGANTES.filter((x) => x !== "vice");

/** Cargo "Ministro(a) do …" do Contatos (sem presidência própria). */
function ehMinistroSemPresidencia(cargoNormalizado: string): boolean {
  return !temPresidenciaPropria(cargoNormalizado) && temFuncao(cargoNormalizado, "ministro");
}

/**
 * Só decide para o "Ministro(a) do …" e o "Presidente do …" do Contatos; outro cargo (o
 * convocado) devolve `undefined` e segue a comparação de sempre. Ministro: qualquer função
 * de tribunal da página confirma, menos "Presidente" (troca de presidência). Presidente: a
 * página confirma com "Presidente" ou só com "Ministro(a)" (o STF não marca a presidência).
 * Um gênero explícito na página não confirma o outro no Contatos, nem na função
 * ("Ministra" × "Corregedor-Geral" diverge), e "Substituto", "Interino" e "Ex-" continuam negando.
 */
export function situacaoCargoTribunal(valorPlanilha: string, valorEsperado: string): SituacaoCampo | undefined {
  const p = semGenero(valorPlanilha);
  const s = semGenero(valorEsperado);
  const presidente = temPresidenciaPropria(p);
  if (!presidente && !temFuncao(p, "ministro")) return undefined;
  const gp = generoDoCargo(valorPlanilha);
  const gs = generoDoCargo(valorEsperado);
  if (gp !== "indeterminado" && gs !== "indeterminado" && gp !== gs) return "divergente";
  const tp = tokensSignificativos(p);
  const ts = tokensSignificativos(s);
  if (NEGANTES_NO_TRIBUNAL.some((x) => tp.includes(x) !== ts.includes(x))) return "divergente";
  if (presidente) return temPresidenciaPropria(s) || soMinistro(s) ? "confere" : "divergente";
  if (temPresidenciaPropria(s)) return "divergente";
  return FUNCOES_DE_TRIBUNAL.some((f) => temFuncao(s, f)) ? "confere" : "divergente";
}

/** "Ministro", "Ministra", "Ministro(a)" no cargo do Contatos, para virar "Presidente". */
const REGEX_MINISTRO_NO_CARGO = /\bministr[oa](\(a\))?(?![a-z])/i;

/**
 * Valor esperado do cargo (spec §3.2, item 3). Na troca de presidência — grupo de tribunal,
 * contato "Ministro(a) do <tribunal>" e página com presidência própria ("Presidente",
 * "(Presidente)", "PRESIDENTE:") — o esperado é o cargo do Contatos com "Presidente" no lugar
 * de "Ministro(a)" ("Presidente do Tribunal Superior Eleitoral"). Fora desse caso, o da página.
 */
export function cargoEsperadoNoTribunal(
  cargoContato: string,
  cargoPagina: string | undefined,
  contexto: ContextoCargo,
): string | undefined {
  if (!contexto.tribunal || cargoPagina === undefined) return cargoPagina;
  if (!ehMinistroSemPresidencia(semGenero(cargoContato))) return cargoPagina;
  if (!temPresidenciaPropria(semGenero(cargoPagina))) return cargoPagina;
  return cargoContato.replace(REGEX_MINISTRO_NO_CARGO, "Presidente");
}
