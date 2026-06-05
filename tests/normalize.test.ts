import { describe, expect, test } from "vitest";
import { normalizarTexto, removerTratamentos, normalizarNome } from "@/lib/normalize";

describe("normalizarTexto", () => {
  test("remove acentos e baixa a caixa", () => {
    expect(normalizarTexto("José Antônio")).toBe("jose antonio");
  });

  test("colapsa espaços e faz trim", () => {
    expect(normalizarTexto("  Maria   da  Silva ")).toBe("maria da silva");
  });

  test("retorna string vazia para entrada vazia", () => {
    expect(normalizarTexto("")).toBe("");
  });
});

describe("removerTratamentos", () => {
  test("remove prefixos de tratamento comuns", () => {
    expect(removerTratamentos("Dr. João Souza")).toBe("João Souza");
    expect(removerTratamentos("Exmo. Sr. Ministro Carlos Lima")).toBe("Carlos Lima");
    expect(removerTratamentos("Senadora Ana Paula")).toBe("Ana Paula");
  });

  test("mantém o nome quando não há tratamento", () => {
    expect(removerTratamentos("Pedro Alves")).toBe("Pedro Alves");
  });
});

describe("normalizarNome", () => {
  test("combina remoção de tratamento + normalização", () => {
    expect(normalizarNome("Dr. José Antônio")).toBe("jose antonio");
  });
});
