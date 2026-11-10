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

describe("teto do registro de IPs", () => {
  test("com 1001 IPs distintos, o mais antigo é esquecido e o último responde certo", () => {
    const a = criarAtrasador();
    for (let i = 0; i <= 1000; i++) a.registrarErro(`ip-${i}`, i);
    expect(a.esperaAntes("ip-0", 1000)).toBe(0);
    expect(a.esperaAntes("ip-1000", 1000)).toBe(ATRASO_INICIAL_MS);
    expect(a.esperaAntes("ip-1", 1000)).toBe(ATRASO_INICIAL_MS);
  });
  test("ao atingir o teto, os registros vencidos saem primeiro", () => {
    const a = criarAtrasador();
    for (let i = 0; i < 1000; i++) a.registrarErro(`ip-${i}`, 0);
    const duasHoras = 2 * 60 * 60 * 1000;
    a.registrarErro("novo", duasHoras);
    expect(a.esperaAntes("novo", duasHoras)).toBe(ATRASO_INICIAL_MS);
    expect(a.esperaAntes("ip-0", duasHoras)).toBe(0);
    expect(a.esperaAntes("ip-999", duasHoras)).toBe(0);
  });
});
