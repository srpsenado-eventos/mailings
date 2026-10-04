import { describe, expect, test } from "vitest";
import { criarToken, validarToken, DURACAO_SESSAO_MS } from "@/lib/sessao";

const SEGREDO = "segredo-de-teste-com-tamanho-razoavel";
const AGORA = Date.parse("2026-10-04T10:00:00.000Z");

describe("sessão assinada", () => {
  test("token criado agora é válido agora e um pouco antes de vencer", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    expect(await validarToken(t, SEGREDO, AGORA)).toBe(true);
    expect(await validarToken(t, SEGREDO, AGORA + DURACAO_SESSAO_MS - 1)).toBe(true);
  });
  test("vencido é inválido", async () => {
    const t = await criarToken(SEGREDO, AGORA, 1000);
    expect(await validarToken(t, SEGREDO, AGORA + 1001)).toBe(false);
  });
  test("assinatura adulterada, segredo diferente, formato estranho ou ausente são inválidos", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    const [expira, assinatura] = t.split(".");
    const trocada = assinatura.slice(0, -1) + (assinatura.endsWith("A") ? "B" : "A");
    expect(await validarToken(`${expira}.${trocada}`, SEGREDO, AGORA)).toBe(false);
    expect(await validarToken(t, "outro-segredo", AGORA)).toBe(false);
    expect(await validarToken("lixo", SEGREDO, AGORA)).toBe(false);
    expect(await validarToken("", SEGREDO, AGORA)).toBe(false);
    expect(await validarToken(undefined, SEGREDO, AGORA)).toBe(false);
  });
  test("o token não carrega o segredo nem a senha, só expiração e assinatura em base64url", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(t).not.toContain(SEGREDO);
  });
});
