import { coerenciasVisiveis, textoCoerencia } from "@/lib/tratamento";
import type { ComparacaoCampo } from "@/lib/types";

/**
 * Linha de uma comparação de valor (protocolo ou site): "campo: planilha → esperado".
 * Usada só pela tela — o export tem colunas próprias para planilha e referência.
 */
function linhaValor(d: ComparacaoCampo): string {
  const base = `${d.campo}: ${d.valorPlanilha || "(vazio)"} → ${d.valorEsperado ?? "sem referência"}`;
  return d.origemValor === "conhecimento" ? `${base} (via IA — confira)` : base;
}

/** Linha de um achado da Camada A, com o valor da planilha ao lado quando houver. */
function linhaCoerencia(d: ComparacaoCampo): string {
  const texto = textoCoerencia(d);
  return d.valorPlanilha ? `${texto} — ${d.valorPlanilha}` : texto;
}

/**
 * Monta o texto da célula "Divergências" da tela de resultado.
 *
 * Decisão vinculante da Task 5 (ledger de 2026-08-13, Clovis 2026-09-16): um contato que é
 * possível saída e também está com o gênero (ou outro achado de coerência) errado precisa
 * mostrar as duas coisas. O marcador de possível saída é por isso o **primeiro** item da
 * lista, nunca um substituto dela — os achados de valor e de coerência sempre se somam.
 */
export function celulaDivergencias(
  comparacoes: readonly ComparacaoCampo[],
  possivelSaida: boolean | undefined,
): string {
  const valores = comparacoes
    .filter((c) => c.situacao === "divergente" && c.origemValor !== "coerencia")
    .map(linhaValor);
  const coerencias = coerenciasVisiveis(comparacoes).map(linhaCoerencia);
  const itens = [...(possivelSaida ? ["não consta na fonte"] : []), ...valores, ...coerencias];
  return itens.length === 0 ? "—" : itens.join("; ");
}
