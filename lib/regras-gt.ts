import { REGRAS_GT, type RegraGt } from "@/data/regras-gt";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { modoDoGrupo } from "@/lib/agrupador";
import { dataDaDecisao } from "@/lib/decisoes";
import { normalizarTexto } from "@/lib/normalize";

export const TITULO_REGRAS_GT = "Regras do GT em vigor";

/**
 * Regras que também aparecem no cabeçalho do grupo: as do grupo canônico do rótulo do Contatos e,
 * para os grupos do agrupador sem canônico (eleitos, indicados), as que citam algum segmento do rótulo.
 * Grupo `neutro` ou `lista` do agrupador não lê página: o canônico que o rótulo resolve por contenção
 * (ex.: "Ministros de Estado" no rótulo dos indicados) não soma regra. Cada regra aparece uma vez, na ordem do quadro.
 */
export function regrasDoGrupo(rotuloDoContatos: string, regras: readonly RegraGt[] = REGRAS_GT): RegraGt[] {
  const canonico = modoDoGrupo(rotuloDoContatos) === "fonte" ? resolverGrupoEFonte(rotuloDoContatos).grupoCanonico : undefined;
  const alvos = new Set(rotuloDoContatos.split(";").map((s) => normalizarTexto(s.trim())).filter(Boolean));
  if (canonico) alvos.add(normalizarTexto(canonico));
  return regras.filter((r) => r.grupos?.some((g) => alvos.has(normalizarTexto(g))));
}

/** "Regra do GT de DD/MM: título", para o cabeçalho do grupo. */
export function textoCurto(r: RegraGt): string {
  return `Regra do GT de ${dataDaDecisao(r.data)}: ${r.titulo}`;
}

/** "DD/MM/AAAA · título — texto", para o quadro. */
export function textoLongo(r: RegraGt): string {
  return `${dataDaDecisao(r.data, true)} · ${r.titulo} — ${r.texto}`;
}
