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
  "competencia",
  "direito",
  "orgao",
]);

/** Ordinal que abre o rótulo ("Primeira Turma", "1ª Seção"): pulado antes de olhar o termo. */
const ORDINAIS_INICIAIS: ReadonlySet<string> = new Set([
  "primeira", "primeiro", "segunda", "segundo", "terceira", "terceiro",
  "quarta", "quarto", "quinta", "quinto", "sexta", "sexto",
  "1a", "2a", "3a", "4a", "5a", "6a",
  "1ª", "2ª", "3ª", "4ª", "5ª", "6ª",
]);

/**
 * Rótulo institucional da página ("Câmara de Direito Público", "Plenário"): não é pessoa
 * e não pode virar proposta de inclusão. Só o primeiro termo conta (depois de um ordinal inicial, se houver), para "Ana Câmara" e
 * "João Corte Real" seguirem como pessoas (spec 2026-11-05 §2.6).
 */
export function ehItemInstitucional(nome: string): boolean {
  const [primeiro = "", segundo = ""] = normalizarTexto(nome).split(/\s+/);
  return INICIOS_INSTITUCIONAIS.has(ORDINAIS_INICIAIS.has(primeiro) ? segundo : primeiro);
}
