import type { PredicadoDeLinha, Tom } from "@/lib/painel";
import { etiquetaDeRepeticao, type AutoridadeRepetida } from "@/lib/repetidos";
import type { ResultadoGrupo } from "@/lib/types";

export const ROTULO_CARTAO_BLOQUEIO = "A bloquear no Posse";

export interface ContagemDeBloqueio { aBloquear: number; bloqueadas: number }

/** Conta, no grupo, as linhas a bloquear no Posse e as já bloqueadas (bloqueio no grupo do convite não conta). */
export function contarBloqueiosDoGrupo(repetidas: readonly AutoridadeRepetida[], g: ResultadoGrupo): ContagemDeBloqueio {
  let aBloquear = 0;
  let bloqueadas = 0;
  for (const c of g.contatos) {
    const acao = etiquetaDeRepeticao(repetidas, c, g.grupo)?.acao;
    if (!acao) continue;
    if (!acao.bloqueado) aBloquear += 1;
    else if (!acao.grupoDoConvite) bloqueadas += 1;
  }
  return { aBloquear, bloqueadas };
}

export function textosDeBloqueioDoGrupo(n: ContagemDeBloqueio): { texto: string; tom: Tom }[] {
  const textos: { texto: string; tom: Tom }[] = [];
  if (n.aBloquear > 0) textos.push({ texto: `${n.aBloquear} a bloquear no Posse ao autorizar este grupo`, tom: "atencao" });
  if (n.bloqueadas > 0) textos.push({ texto: n.bloqueadas === 1 ? "1 bloqueada no Posse" : `${n.bloqueadas} bloqueadas no Posse`, tom: "neutro" });
  return textos;
}

export function totalABloquear(repetidas: readonly AutoridadeRepetida[], grupos: readonly ResultadoGrupo[]): number {
  return grupos.reduce((soma, g) => soma + contarBloqueiosDoGrupo(repetidas, g).aBloquear, 0);
}

export function ehLinhaABloquear(repetidas: readonly AutoridadeRepetida[]): PredicadoDeLinha {
  return (c, g) => {
    const acao = etiquetaDeRepeticao(repetidas, c, g.grupo)?.acao;
    return acao !== undefined && !acao.bloqueado;
  };
}
