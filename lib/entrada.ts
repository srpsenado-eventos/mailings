/**
 * Entrada do modo web: senha única comparada em tempo constante, e atraso progressivo por IP
 * contra tentativa em massa (spec 2026-09-04 §4: 1 s, 2 s, 4 s, teto 30 s). O registro vive na
 * memória da instância; em função serverless cada instância tem o seu, o que o spec aceita.
 */
export const ATRASO_INICIAL_MS = 1000;
export const ATRASO_TETO_MS = 30_000;
/** Erro mais velho que isto é esquecido. */
const JANELA_MS = 60 * 60 * 1000;

export function senhaConfere(informada: string, esperada: string): boolean {
  if (esperada.length === 0 || informada.length !== esperada.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperada.length; i++) diferenca |= informada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diferenca === 0;
}

export interface Atrasador {
  /** Quanto esperar antes de responder a este IP, em ms. */
  esperaAntes(ip: string, agoraMs: number): number;
  registrarErro(ip: string, agoraMs: number): void;
  registrarAcerto(ip: string): void;
}

interface Registro { erros: number; ultimoMs: number }

export function criarAtrasador(): Atrasador {
  const registros = new Map<string, Registro>();
  const vivo = (ip: string, agoraMs: number): Registro | undefined => {
    const r = registros.get(ip);
    if (!r) return undefined;
    if (agoraMs - r.ultimoMs > JANELA_MS) {
      registros.delete(ip);
      return undefined;
    }
    return r;
  };
  return {
    esperaAntes(ip, agoraMs) {
      const r = vivo(ip, agoraMs);
      if (!r) return 0;
      return Math.min(ATRASO_TETO_MS, ATRASO_INICIAL_MS * 2 ** (r.erros - 1));
    },
    registrarErro(ip, agoraMs) {
      const r = vivo(ip, agoraMs);
      registros.set(ip, { erros: (r?.erros ?? 0) + 1, ultimoMs: agoraMs });
    },
    registrarAcerto(ip) {
      registros.delete(ip);
    },
  };
}
