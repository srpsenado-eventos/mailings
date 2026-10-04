import { describe, expect, test } from "vitest";
import { senhaConfere, criarAtrasador, ATRASO_INICIAL_MS, ATRASO_TETO_MS } from "@/lib/entrada";

describe("senhaConfere", () => {
  test("igual confere; diferente, vazia ou com tamanho diferente não confere", () => {
    expect(senhaConfere("abc123", "abc123")).toBe(true);
    expect(senhaConfere("abc124", "abc123")).toBe(false);
    expect(senhaConfere("", "abc123")).toBe(false);
    expect(senhaConfere("abc1234", "abc123")).toBe(false);
  });
  test("esperada vazia nunca confere (ambiente sem senha não abre)", () => {
    expect(senhaConfere("", "")).toBe(false);
  });
});

describe("atraso progressivo por IP", () => {
  test("sem erro não espera; cada erro dobra: 1 s, 2 s, 4 s; teto 30 s", () => {
    const a = criarAtrasador();
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(0);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(ATRASO_INICIAL_MS);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(2 * ATRASO_INICIAL_MS);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(4 * ATRASO_INICIAL_MS);
    for (let i = 0; i < 10; i++) a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(ATRASO_TETO_MS);
  });
  test("acerto zera; outro IP não é afetado", () => {
    const a = criarAtrasador();
    a.registrarErro("1.1.1.1", 0);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("2.2.2.2", 0)).toBe(0);
    a.registrarAcerto("1.1.1.1");
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(0);
  });
  test("erros com mais de uma hora são esquecidos", () => {
    const a = criarAtrasador();
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 61 * 60 * 1000)).toBe(0);
  });
});
