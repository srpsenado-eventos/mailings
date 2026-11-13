import { normalizarTexto } from "@/lib/normalize";
import type { OcorrenciaRepetida } from "@/lib/repetidos-base";

/**
 * Regra do GT de 13/11: ministro que também está no TSE é convidado pelo tribunal de origem
 * (STF ou STJ), salvo a presidência do TSE, que segue a Nominata. Função pura.
 */

export const GRUPO_TSE = "Ministros do TSE";
export const GRUPOS_DE_ORIGEM: readonly string[] = ["Ministros do STF", "Ministros do STJ"];
export const MOTIVO_ORIGEM_TSE = "Membro do TSE convidado pelo tribunal de origem (regra do GT de 13/11)";

/** Mesma régua de `nivelDoCargo`: "Vice-Presidente" não começa por "presidente". */
const PRESIDENTE = /^(ministr[oa][- ])?president[ea]\b/;

export function semTseQuandoHaOrigem(
  ocorrencias: readonly OcorrenciaRepetida[],
): { ocorrencias: OcorrenciaRepetida[]; aplicada: boolean } {
  const tse = ocorrencias.find((o) => o.grupoRegra === GRUPO_TSE);
  const temOrigem = ocorrencias.some((o) => GRUPOS_DE_ORIGEM.includes(o.grupoRegra));
  if (!tse || !temOrigem || PRESIDENTE.test(normalizarTexto(tse.cargo))) {
    return { ocorrencias: [...ocorrencias], aplicada: false };
  }
  return { ocorrencias: ocorrencias.filter((o) => o.grupoRegra !== GRUPO_TSE), aplicada: true };
}
