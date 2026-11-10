import { grupoEquivalente } from "@/lib/decisoes";
import { normalizarTexto } from "@/lib/normalize";

/** Dois rótulos de grupo são o mesmo grupo quando coincidem depois da forma equivalente do Contatos e da normalização. */
export function mesmoGrupo(a: string, b: string): boolean {
  return normalizarTexto(grupoEquivalente(a, "contatos")) === normalizarTexto(grupoEquivalente(b, "contatos"));
}
