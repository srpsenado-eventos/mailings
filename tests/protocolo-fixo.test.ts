import { describe, expect, test } from "vitest";
import { comparacoesProtocoloFixo, protocoloFixo } from "@/lib/protocolo-fixo";
import { comparacoesTratamento } from "@/lib/match";
import type { ContatoPlanilha } from "@/lib/types";

const EX = "Ex-Presidentes do Congresso";

const contato = (p: Partial<ContatoPlanilha>): ContatoPlanilha => ({ nome: "Rui Fictício", grupo: "Senadores", ...p });

describe("protocoloFixo (spec 2026-11-05 §7.3)", () => {
  test.each([
    "Presidente do Congresso Nacional",
    "Presidente do Senado Federal",
    "Presidente da Câmara dos Deputados",
    "presidente da camara dos deputados",
  ])('cargo ativo "%s" leva Excelentíssimo Senhor, em qualquer grupo', (cargo) => {
    // Act
    const fixo = protocoloFixo(contato({ cargo }), "Senadores (Acre a Goiás)");

    // Assert
    expect(fixo).toEqual({ tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
  });

  test("feminino pelo cadastro vira Excelentíssima Senhora", () => {
    // Act
    const fixo = protocoloFixo(contato({ cargo: "Presidente do Senado Federal", tratamento: "Excelentíssima Senhora" }), "Senadores");

    // Assert
    expect(fixo).toEqual({ tratamento: "Excelentíssima Senhora", enderecamento: "A Sua Excelência a Senhora" });
  });

  test('"Presidenta da Câmara dos Deputados" é cargo ativo e confere com Excelentíssima Senhora', () => {
    // Arrange
    const c = contato({ cargo: "Presidenta da Câmara dos Deputados", tratamento: "Excelentíssima Senhora", enderecamento: "A Sua Excelência a Senhora" });

    // Act
    const comparacoes = comparacoesProtocoloFixo(c, "Presidente da Câmara dos Deputados");

    // Assert
    expect(comparacoes?.map((x) => x.situacao)).toEqual(["confere", "confere"]);
  });

  test("a comparação do protocolo fixo carrega a origem 'regra_gt', não a da tabela", () => {
    // Act
    const comparacoes = comparacoesProtocoloFixo(contato({ cargo: "Presidente do Senado Federal" }), "Senadores");

    // Assert
    expect(comparacoes?.map((x) => x.origemValor)).toEqual(["regra_gt", "regra_gt"]);
  });

  test("Ex-Presidentes do Congresso é sempre inativo, seja qual for o cargo", () => {
    // Act + Assert
    expect(protocoloFixo(contato({ cargo: "Presidente do Congresso Nacional no período de 2017 a 2019" }), EX)).toEqual({
      tratamento: "Senhor",
      enderecamento: "A Sua Excelência o Senhor",
    });
    expect(protocoloFixo(contato({ cargo: "Senador", enderecamento: "A Sua Excelência a Senhora" }), EX)).toEqual({
      tratamento: "Senhora",
      enderecamento: "A Sua Excelência a Senhora",
    });
  });

  test.each(["Vice-Presidente do Senado Federal", "1º Vice-Presidente da Câmara dos Deputados", "Senador", "Presidente do Senado Federal de 2019 a 2021", undefined])(
    'não vale para "%s" fora do grupo de ex-presidentes',
    (cargo) => {
      // Act + Assert
      expect(protocoloFixo(contato({ cargo }), "Senadores")).toBeUndefined();
    },
  );

  test("Vice-Presidente no grupo dos ex-presidentes continua sendo ex", () => {
    // Act + Assert
    expect(protocoloFixo(contato({ cargo: "Vice-Presidente" }), EX)?.tratamento).toBe("Senhor");
  });

  test("Presidente de tribunal não é alcançado e grupo sem nome vale pelo cargo", () => {
    // Act + Assert
    expect(protocoloFixo(contato({ cargo: "Presidente do Supremo Tribunal Federal" }), "Ministros do STF")).toBeUndefined();
    expect(protocoloFixo(contato({ cargo: "Presidente do Senado Federal" }), undefined)?.tratamento).toBe("Excelentíssimo Senhor");
  });
});

describe("comparacoesProtocoloFixo", () => {
  test("campos iguais ao fixo conferem, comparados por normalizarTexto", () => {
    // Arrange
    const c = contato({ cargo: "Presidente do Senado Federal", tratamento: "EXCELENTISSIMO senhor", enderecamento: "A Sua Excelência o Senhor" });

    // Act
    const r = comparacoesProtocoloFixo(c, "Senadores");

    // Assert
    expect(r?.map((x) => [x.campo, x.situacao, x.origemValor])).toEqual([
      ["tratamento", "confere", "regra_gt"],
      ["enderecamento", "confere", "regra_gt"],
    ]);
  });

  test("o que não bate diverge, com o valor fixo como esperado", () => {
    // Arrange
    const c = contato({ cargo: "Presidente da Câmara dos Deputados", tratamento: "Senhor", enderecamento: "Ao Senhor" });

    // Act
    const r = comparacoesProtocoloFixo(c, "Presidente da Câmara dos Deputados");

    // Assert
    expect(r?.map((x) => [x.situacao, x.valorEsperado])).toEqual([
      ["divergente", "Excelentíssimo Senhor"],
      ["divergente", "A Sua Excelência o Senhor"],
    ]);
  });

  test("ex-presidente com Excelentíssimo diverge para Senhor", () => {
    // Arrange
    const c = contato({
      cargo: "Presidente do Congresso Nacional no período de 2017 a 2019",
      tratamento: "Excelentíssimo Senhor",
      enderecamento: "A Sua Excelência o Senhor",
    });

    // Act
    const r = comparacoesProtocoloFixo(c, EX);

    // Assert
    expect(r?.map((x) => [x.campo, x.situacao, x.valorEsperado])).toEqual([
      ["tratamento", "divergente", "Senhor"],
      ["enderecamento", "confere", "A Sua Excelência o Senhor"],
    ]);
  });

  test("fora do alcance devolve undefined", () => {
    // Act + Assert
    expect(comparacoesProtocoloFixo(contato({ cargo: "Senador" }), "Senadores")).toBeUndefined();
  });
});

describe("comparacoesTratamento usa o protocolo fixo antes da tabela", () => {
  test("Presidente do Senado com Excelentíssimo Senhor não diverge do protocolo", () => {
    // Arrange
    const c = contato({ cargo: "Presidente do Senado Federal", tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });

    // Act
    const r = comparacoesTratamento(c, "Senadores (Acre a Goiás)");

    // Assert
    expect(r.filter((x) => x.situacao === "divergente")).toEqual([]);
    expect(r.find((x) => x.campo === "tratamento")?.situacao).toBe("confere");
  });

  test("ex-presidente com Senhor confere e com Excelentíssimo diverge", () => {
    // Arrange
    const cargo = "Presidente do Congresso Nacional no período de 2017 a 2019";
    const ok = contato({ cargo, tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });
    const errado = { ...ok, tratamento: "Excelentíssimo Senhor" };

    // Act
    const a = comparacoesTratamento(ok, EX);
    const b = comparacoesTratamento(errado, EX);

    // Assert
    expect(a.filter((x) => x.situacao === "divergente")).toEqual([]);
    expect(b.filter((x) => x.campo === "tratamento" && x.situacao === "divergente").map((x) => x.valorEsperado)).toEqual(["Senhor"]);
  });
});
