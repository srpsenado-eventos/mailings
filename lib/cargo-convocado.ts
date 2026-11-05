import { normalizarTexto } from "@/lib/normalize";

const CONVOCADO = /^desembargador(?:a)? convocad[oa] d[oa] (.+)$/i;

/**
 * Convocado de tribunal segue o critério dos ministros (spec 2026-11-05 §2.7): devolve o cargo
 * de Ministro do mesmo tribunal ("Desembargadora convocada do Superior Tribunal de Justiça" →
 * "Ministro do Superior Tribunal de Justiça"), usado só para achar a regra de protocolo e os
 * pares. Cargo que não é de convocado devolve `undefined`.
 */
export function cargoDeMinistroDoConvocado(cargo: string): string | undefined {
  const texto = cargo.trim().replace(/\s+/g, " ");
  if (normalizarTexto(texto) === "") return undefined;
  const achado = texto.match(CONVOCADO);
  return achado ? `Ministro do ${achado[1]}` : undefined;
}
