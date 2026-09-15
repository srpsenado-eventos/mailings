import { describe, expect, test } from "vitest";
import {
  normalizarTexto,
  removerTratamentos,
  normalizarNome,
  nucleoDeNome,
} from "@/lib/normalize";

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

  test("remove patente militar do começo do nome", () => {
    expect(removerTratamentos("Gen Ex Lourival Carvalho Silva")).toBe("Lourival Carvalho Silva");
    expect(removerTratamentos("Alte Esq Cláudio Portugal de Viveiros")).toBe(
      "Cláudio Portugal de Viveiros",
    );
    expect(removerTratamentos("General de Exército Guido Amin Naves")).toBe("Guido Amin Naves");
    expect(removerTratamentos("Almirante de Esquadra Leonardo Puntel")).toBe("Leonardo Puntel");
  });

  test("remove título e patente combinados", () => {
    expect(removerTratamentos("Ministro Ten Brig Ar Francisco Joseli Parente Camelo")).toBe(
      "Francisco Joseli Parente Camelo",
    );
    expect(removerTratamentos("Ministra Dra. Maria Elizabeth Guimarães Teixeira Rocha")).toBe(
      "Maria Elizabeth Guimarães Teixeira Rocha",
    );
  });
});

describe("nucleoDeNome", () => {
  test("corta rótulo de ficha grudado no fim da linha", () => {
    // Arrange
    const linha = "Ministro(a) General de Exército Anisio David de Oliveira Junior Data de nomeação: 21/03/2018";

    // Act
    const nucleo = nucleoDeNome(linha);

    // Assert
    expect(nucleo).toBe("Anisio David de Oliveira Junior");
  });

  test("devolve a linha intacta quando não há título nem rótulo", () => {
    expect(nucleoDeNome("Mauro Campbell Marques")).toBe("Mauro Campbell Marques");
  });

  test("não confunde cargo com nome: sobra o complemento do cargo", () => {
    expect(nucleoDeNome("Presidente do Conselho Nacional de Justiça")).toBe(
      "do Conselho Nacional de Justiça",
    );
  });
});

describe("normalizarNome", () => {
  test("combina remoção de tratamento + normalização", () => {
    expect(normalizarNome("Dr. José Antônio")).toBe("jose antonio");
  });
});
