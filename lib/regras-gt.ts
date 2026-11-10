import { REGRAS_GT, type RegraGt } from "@/data/regras-gt";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { dataDaDecisao } from "@/lib/decisoes";
import { normalizarTexto } from "@/lib/normalize";

export const TITULO_REGRAS_GT = "Regras do GT em vigor";

/** Regras que também aparecem no cabeçalho do grupo; o grupo é o canônico do rótulo do Contatos. */
export function regrasDoGrupo(rotuloDoContatos: string, regras: readonly RegraGt[] = REGRAS_GT): RegraGt[] {
  const canonico = resolverGrupoEFonte(rotuloDoContatos).grupoCanonico;
  if (!canonico) return [];
  const alvo = normalizarTexto(canonico);
  return regras.filter((r) => r.grupos?.some((g) => normalizarTexto(g) === alvo));
}

/** "Regra do GT de DD/MM: título", para o cabeçalho do grupo. */
export function textoCurto(r: RegraGt): string {
  return `Regra do GT de ${dataDaDecisao(r.data)}: ${r.titulo}`;
}

/** "DD/MM/AAAA · título — texto", para o quadro. */
export function textoLongo(r: RegraGt): string {
  return `${dataDaDecisao(r.data, true)} · ${r.titulo} — ${r.texto}`;
}
