import { normalizarTexto } from "@/lib/normalize";

/** Primeiros termos de rótulos de página (órgão, colegiado, seção) que nunca são pessoa. */
const INICIOS_INSTITUCIONAIS: ReadonlySet<string> = new Set([
  "camara",
  "turma",
  "secao",
  "secretaria",
  "incidentes",
  "incidente",
  "composicao",
  "plenario",
  "conselho",
  "tribunal",
  "corte",
  "gabinete",
  "presidencia",
  "coordenadoria",
  "diretoria",
]);

/**
 * Rótulo institucional da página ("Câmara de Direito Público", "Plenário"): não é pessoa
 * e não pode virar proposta de inclusão. Só o primeiro termo conta, para "Ana Câmara" e
 * "João Corte Real" seguirem como pessoas (spec 2026-11-05 §2.6).
 */
export function ehItemInstitucional(nome: string): boolean {
  const primeiro = normalizarTexto(nome).split(/\s+/)[0] ?? "";
  return INICIOS_INSTITUCIONAIS.has(primeiro);
}
