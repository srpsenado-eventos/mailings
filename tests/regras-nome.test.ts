import { describe, expect, test } from "vitest";
import { comparacaoRegraNome, rotuloAchado, textoCoerencia } from "@/lib/tratamento";
import type { ContatoPlanilha } from "@/lib/types";

const GRUPO_STM = "Ministros do STM";

/** Contato mínimo; cada teste sobrescreve só os campos que a verificação usa. Nome fictício. */
function contato(campos: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Joaquim Bezerra Vilaça", grupo: "Grupo de Teste", ...campos };
}

describe("comparacaoRegraNome — Camada C, ministros do STM", () => {
  test("acusa 'Dr.' no nome de um contato do STM", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça" });

    // Act
    const resultado = comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(resultado).toEqual([
      {
        campo: "nome",
        valorPlanilha: "Dr. Joaquim Bezerra Vilaça",
        valorEsperado: "Joaquim Bezerra Vilaça",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "nome_tratamento_academico",
      },
    ]);
  });

  test("não acusa quando o cadastro já está limpo", () => {
    // Arrange
    const c = contato({ nome: "Joaquim Bezerra Vilaça" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test.each([
    ["Dra. Luiza Meireles Prado", "Luiza Meireles Prado"],
    ["DRA LUIZA MEIRELES PRADO", "LUIZA MEIRELES PRADO"],
    ["Doutor Joaquim Bezerra Vilaça", "Joaquim Bezerra Vilaça"],
    ["Doutora Luiza Meireles Prado", "Luiza Meireles Prado"],
    ["Dr Joaquim Bezerra Vilaça", "Joaquim Bezerra Vilaça"],
    ["dra. Luiza Meireles Prado", "Luiza Meireles Prado"],
  ])("acusa e corrige a forma '%s'", (nome, corrigido) => {
    // Arrange
    const c = contato({ nome });

    // Act
    const resultado = comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(resultado).toHaveLength(1);
    expect(resultado[0].achado).toBe("nome_tratamento_academico");
    expect(resultado[0].valorEsperado).toBe(corrigido);
  });

  test("acusa tratamento acadêmico no meio do nome, não só no início", () => {
    // Arrange
    const c = contato({ nome: "Ministra Dra. Luiza Meireles Prado" });

    // Act
    const resultado = comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(resultado).toHaveLength(1);
    expect(resultado[0].valorEsperado).toBe("Ministra Luiza Meireles Prado");
  });

  test("não acusa 'Coronel Tadeu Silva' — patente é nome parlamentar, não tratamento", () => {
    // Arrange
    const c = contato({ nome: "Coronel Tadeu Silva" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test("não casa por substring: 'Adroaldo' não é 'Dr'", () => {
    // Arrange
    const c = contato({ nome: "Marcos Adroaldo Ferreira" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test("não casa por substring: 'Andrade' e 'Dracena' não disparam", () => {
    // Arrange
    const c = contato({ nome: "Ana Dracena Andrade" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test("não acusa contato de outro grupo com 'Dr.' no nome — a regra é por grupo", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça", grupo: "Ministros do STF" });

    // Act / Assert
    expect(comparacaoRegraNome(c, "Ministros do STF")).toEqual([]);
  });

  test("não acusa quando não há grupo canônico resolvido", () => {
    // Arrange — grupo desconhecido na planilha, sem casamento no catálogo
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça" });

    // Act / Assert
    expect(comparacaoRegraNome(c, undefined)).toEqual([]);
  });

  test("não muta o contato recebido", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça" });
    const antes = JSON.parse(JSON.stringify(c));

    // Act
    comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(c).toEqual(antes);
  });
});

describe("rotuloAchado e textoCoerencia — nome_tratamento_academico", () => {
  test("rotuloAchado descreve o problema em português", () => {
    // Act
    const rotulo = rotuloAchado("nome_tratamento_academico");

    // Assert
    expect(rotulo.length).toBeGreaterThan(0);
    expect(rotulo).not.toBe(rotuloAchado("campo_vazio"));
  });

  test("textoCoerencia traz o nome corrigido entre parênteses, para o usuário copiar", () => {
    // Arrange
    const achado = comparacaoRegraNome(
      contato({ nome: "Dr. Joaquim Bezerra Vilaça" }),
      GRUPO_STM,
    )[0];

    // Act
    const texto = textoCoerencia(achado);

    // Assert
    expect(texto).toContain("Joaquim Bezerra Vilaça");
    expect(texto.endsWith("(Joaquim Bezerra Vilaça)")).toBe(true);
  });
});
