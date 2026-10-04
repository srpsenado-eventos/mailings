/**
 * Sessão do modo web (spec 2026-09-04 §4 e 2026-10-02 §6.4): cookie com `expira.assinatura`,
 * assinatura HMAC-SHA256 do próprio `expira` com `APP_SEGREDO_COOKIE`. Sem estado no servidor
 * e sem identidade: a senha é única e compartilhada. WebCrypto, porque o middleware roda no
 * edge, onde não existe `node:crypto`.
 */
export const COOKIE_SESSAO = "fiscal_sessao";
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

const codificador = new TextEncoder();

function paraBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function assinar(texto: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", codificador.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return paraBase64Url(await crypto.subtle.sign("HMAC", chave, codificador.encode(texto)));
}

/** Comparação em tempo constante de duas strings ASCII do mesmo alfabeto. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export async function criarToken(segredo: string, agoraMs: number, duracaoMs: number = DURACAO_SESSAO_MS): Promise<string> {
  const expira = paraBase64Url(codificador.encode(String(agoraMs + duracaoMs)));
  return `${expira}.${await assinar(expira, segredo)}`;
}

export async function validarToken(token: string | undefined, segredo: string, agoraMs: number): Promise<boolean> {
  if (!token || !segredo) return false;
  const partes = token.split(".");
  if (partes.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(partes[0]) || !/^[A-Za-z0-9_-]+$/.test(partes[1])) return false;
  const [expira, assinatura] = partes;
  if (!iguais(assinatura, await assinar(expira, segredo))) return false;
  const expiraMs = Number(atob(expira.replace(/-/g, "+").replace(/_/g, "/")));
  return Number.isFinite(expiraMs) && agoraMs < expiraMs;
}
