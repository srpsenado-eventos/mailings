import { describe, expect, test } from "vitest";
import { celulaDivergencias } from "@/lib/celula-divergencias";
import type { ComparacaoCampo } from "@/lib/types";

const coerenciaGenero: ComparacaoCampo = {
  campo: "tratamento",
  valorPlanilha: "Doutor",
  situacao: "divergente",
  origemValor: "coerencia",
  achado: "genero_cargo_tratamento",
};

const valorDivergente: ComparacaoCampo = {
  campo: "tratamento",
  valorPlanilha: "Vossa Excelência",
  valorEsperado: "Senhor(a) Ministro(a)",
  situacao: "divergente",
  origemValor: "protocolo",
};

describe("celulaDivergencias — contrato de exibição da tela", () => {
  test("sem comparações e sem possível saída, devolve o traço", () => {
    // Arrange / Act
    const texto = celulaDivergencias([], false);

    // Assert
    expect(texto).toBe("—");
  });

  test("possível saída sem nenhum achado de coerência continua só o marcador", () => {
    // Arrange / Act
    const texto = celulaDivergencias([], true);

    // Assert
    expect(texto).toBe("não consta na fonte");
  });

  test("possível saída com achado de coerência mostra as duas coisas, marcador primeiro", () => {
    // Regressão do item 1 da revisão final: o ternário antigo descartava `detalhes` inteiro
    // quando o contato era possível saída, escondendo o achado de gênero na tela (ele
    // continuava saindo no export). Decisão vinculante da Task 5: as duas informações se
    // somam, nunca uma substitui a outra.

    // Arrange / Act
    const texto = celulaDivergencias([coerenciaGenero], true);

    // Assert
    expect(texto).toBe("não consta na fonte; gênero do Cargo discorda do Tratamento — Doutor");
  });

  test("achado de coerência sem valor de planilha não duplica o traço", () => {
    // Arrange
    const campoVazio: ComparacaoCampo = {
      campo: "enderecamento",
      valorPlanilha: "",
      situacao: "divergente",
      origemValor: "coerencia",
      achado: "campo_vazio",
    };

    // Act
    const texto = celulaDivergencias([campoVazio], false);

    // Assert
    expect(texto).toBe("campo vazio (Endereçamento)");
  });

  test("comparação de valor divergente aparece como campo: planilha → esperado", () => {
    // Arrange / Act
    const texto = celulaDivergencias([valorDivergente], false);

    // Assert
    expect(texto).toBe("tratamento: Vossa Excelência → Senhor(a) Ministro(a)");
  });

  test("comparação vinda da IA ganha o aviso 'via IA — confira'", () => {
    // Arrange
    const viaIa: ComparacaoCampo = {
      campo: "cargo",
      valorPlanilha: "Ministro",
      valorEsperado: "Ministro de Estado",
      situacao: "divergente",
      origemValor: "conhecimento",
    };

    // Act
    const texto = celulaDivergencias([viaIa], false);

    // Assert
    expect(texto).toBe("cargo: Ministro → Ministro de Estado (via IA — confira)");
  });

  test("achados de valor e de coerência se somam na mesma célula, separados por ponto e vírgula", () => {
    // Arrange / Act
    const texto = celulaDivergencias([valorDivergente, coerenciaGenero], false);

    // Assert
    expect(texto).toBe(
      "tratamento: Vossa Excelência → Senhor(a) Ministro(a); gênero do Cargo discorda do Tratamento — Doutor",
    );
  });

  test("comparação sem_regra ou confere não vira linha de divergência", () => {
    // Arrange
    const semRegra: ComparacaoCampo = {
      campo: "tratamento",
      valorPlanilha: "Senhor",
      situacao: "sem_regra",
      origemValor: "protocolo",
    };
    const confere: ComparacaoCampo = {
      campo: "nome",
      valorPlanilha: "Ana",
      valorEsperado: "Ana",
      situacao: "confere",
      origemValor: "pagina",
    };

    // Act
    const texto = celulaDivergencias([semRegra, confere], false);

    // Assert
    expect(texto).toBe("—");
  });
});
