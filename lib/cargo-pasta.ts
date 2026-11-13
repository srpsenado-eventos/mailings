import { CARGOS, neutralizarGenero, tokensSignificativos } from "@/lib/cargos";
import { normalizarTexto } from "@/lib/normalize";
import { situacaoCampo, tokensDistintivos } from "@/lib/match";
import type { SituacaoCampo } from "@/lib/types";

/**
 * Grupos cujo cargo se confere pela pasta (denominação do ministério) que a página oficial
 * grava, e não pelo papel. GT de 13/11, spec 2026-11-13 §3.2.
 */
export const GRUPOS_CARGO_PELA_PASTA: readonly string[] = ["Ministros de Estado"];

/** "Advogado-Geral" (cargo) e "Advocacia-Geral" (órgão) nomeiam a mesma pasta. */
const EQUIVALENTES: Readonly<Record<string, string>> = { advogado: "advocacia", advogada: "advocacia" };

/** Conjunto de tokens que distinguem a pasta, sem ordem e com as equivalências aplicadas. */
function pastaDe(valor: string): string[] {
  const tokens = tokensDistintivos(valor).map((t) => EQUIVALENTES[t] ?? t);
  return [...new Set(tokens)].sort();
}

/** O valor da página traz um papel de autoridade ("Ministro", "Ministra"...)? */
function temPapel(valor: string): boolean {
  return tokensSignificativos(valor).some((t) => CARGOS.includes(t));
}

/**
 * Cargo do Contatos contra o cargo que a página do Planalto grava para a pasta. Confere quando
 * a pasta é a mesma (mesmos tokens distintivos, em qualquer ordem, "Ministro" e "Ministra"
 * indiferentes) e o papel também confere, ou a página só traz o órgão (caso CGU e AGU). Pasta
 * diferente, ou com palavras a mais ou a menos, diverge. Sem token distintivo em algum lado,
 * usa a régua comum (`situacaoCampo`).
 *
 * Limitação conhecida (13/11): a régua "só órgão" está pronta, mas a extração da página do Planalto
 * hoje não entrega o órgão como cargo para CGU e AGU; até a extração mudar, esses dois saem
 * `fonte_nao_informa` (neutro, nunca divergente nem saída).
 */
export function situacaoCargoPelaPasta(valorPlanilha: string, valorEsperado: string): SituacaoCampo {
  const planilha = pastaDe(valorPlanilha);
  const pagina = pastaDe(valorEsperado);
  if (planilha.length === 0 || pagina.length === 0) return situacaoCampo(valorPlanilha, valorEsperado);
  if (planilha.join(" ") !== pagina.join(" ")) return "divergente";
  if (!temPapel(valorEsperado)) return "confere";
  // Gênero do cargo não conta aqui: a pasta é que se confere (Ministro × Ministra da mesma pasta).
  const semGenero = (v: string) => neutralizarGenero(normalizarTexto(v));
  return situacaoCampo(semGenero(valorPlanilha), semGenero(valorEsperado)) === "confere" ? "confere" : "divergente";
}
