import { describe, expect, test } from "vitest";
import { comparacoesProtocoloFixo, GRUPO_CHEFES_DE_ESTADO, protocoloFixo } from "@/lib/protocolo-fixo";
import { comparacoesTratamento } from "@/lib/match";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
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

  test("Presidente de tribunal só é alcançado no grupo do tribunal e grupo sem nome vale pelo cargo", () => {
    // Act + Assert
    expect(protocoloFixo(contato({ cargo: "Presidente do Supremo Tribunal Federal" }), undefined)).toBeUndefined();
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

describe("Chefes de Estado (spec 2026-11-13 §3.5)", () => {
  const COMBINADO = `${GRUPO_CHEFES_DE_ESTADO}; Delegações estrangeiras e organismos intern - 2027`;

  test("todo contato do grupo leva Excelentíssimo Senhor e A Sua Excelência o Senhor, seja qual for o cargo", () => {
    for (const cargo of ["Presidente da República do Chile", "Primeiro-Ministro", "Rei", "Presidente do Parlamento Europeu", undefined]) {
      // Act
      const fixo = protocoloFixo(contato({ grupo: GRUPO_CHEFES_DE_ESTADO, cargo }), undefined);

      // Assert
      expect(fixo).toEqual({ tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
    }
  });

  test("feminino pelo cadastro vira Excelentíssima Senhora e A Sua Excelência a Senhora", () => {
    // Act
    const fixo = protocoloFixo(contato({ grupo: GRUPO_CHEFES_DE_ESTADO, cargo: "Rainha", tratamento: "Excelentíssima Senhora" }), undefined);

    // Assert
    expect(fixo).toEqual({ tratamento: "Excelentíssima Senhora", enderecamento: "A Sua Excelência a Senhora" });
  });

  test("rótulo combinado vale pelo segmento", () => {
    // Act + Assert
    expect(protocoloFixo(contato({ grupo: COMBINADO, cargo: "Rei" }), undefined)?.tratamento).toBe("Excelentíssimo Senhor");
  });

  test("comparacoesProtocoloFixo acusa 'Senhor' no grupo, com origemValor regra_gt", () => {
    // Arrange
    const c = contato({ grupo: GRUPO_CHEFES_DE_ESTADO, cargo: "Rei", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });

    // Act
    const r = comparacoesProtocoloFixo(c, undefined);

    // Assert
    expect(r?.map((x) => [x.campo, x.situacao, x.valorEsperado, x.origemValor])).toEqual([
      ["tratamento", "divergente", "Excelentíssimo Senhor", "regra_gt"],
      ["enderecamento", "confere", "A Sua Excelência o Senhor", "regra_gt"],
    ]);
  });

  test("comparacoesTratamento sem grupo canônico aplica a regra pelo grupo do contato", () => {
    // Act
    const r = comparacoesTratamento(contato({ grupo: GRUPO_CHEFES_DE_ESTADO, cargo: "Rei", tratamento: "Senhor" }), undefined);

    // Assert
    expect(r.find((x) => x.campo === "tratamento")?.valorEsperado).toBe("Excelentíssimo Senhor");
  });

  test("fora do grupo nada muda", () => {
    // Act + Assert
    expect(protocoloFixo(contato({ grupo: "Senadores", cargo: "Senador" }), undefined)).toBeUndefined();
  });
});

describe("protocolo fixo dos eleitos e dos presidentes de tribunal (spec 2026-11-19 §2.1 e §2.2)", () => {
  test.each([
    [GRUPO_SENADORES_ELEITOS, "Senador eleito"],
    [GRUPO_DEPUTADOS_ELEITOS, "Deputado Federal eleito"],
    [GRUPO_GOVERNADORES_ELEITOS, "Governador eleito do estado de Goiás"],
  ])("eleito no grupo %s leva Senhor e Ao Senhor", (grupo, cargo) => {
    expect(protocoloFixo(contato({ grupo, cargo }), undefined)).toEqual({ tratamento: "Senhor", enderecamento: "Ao Senhor" });
  });
  test("eleita (tratamento Senhora no cadastro) leva Senhora e À Senhora", () => {
    const c = contato({ grupo: GRUPO_SENADORES_ELEITOS, cargo: "Senadora eleita", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" });
    expect(comparacoesProtocoloFixo(c, undefined)).toEqual([
      { campo: "tratamento", valorPlanilha: "Senhora", valorEsperado: "Senhora", situacao: "confere", origemValor: "regra_gt" },
      { campo: "enderecamento", valorPlanilha: "A Sua Excelência a Senhora", valorEsperado: "À Senhora", situacao: "divergente", origemValor: "regra_gt" },
    ]);
  });
  test("rótulo com dois segmentos casa o eleito pelo segmento", () => {
    expect(protocoloFixo(contato({ grupo: `Senadores; ${GRUPO_SENADORES_ELEITOS}`, cargo: "Senador eleito" }), "Senadores")?.enderecamento).toBe("Ao Senhor");
  });
  test("presidente do STF leva Excelentíssimo Senhor; presidenta, Excelentíssima Senhora", () => {
    expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Presidente do Supremo Tribunal Federal" }), "Ministros do STF"))
      .toEqual({ tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
    expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Presidenta do Supremo Tribunal Federal", tratamento: "Senhora" }), "Ministros do STF"))
      .toEqual({ tratamento: "Excelentíssima Senhora", enderecamento: "A Sua Excelência a Senhora" });
  });
  test.each(["Ministros do STJ", "Ministros do STM", "Ministros do TCU", "Ministros do TSE", "Ministros do TST"])(
    "presidente em %s leva Senhor e A Sua Excelência o Senhor", (grupo) => {
      expect(protocoloFixo(contato({ grupo, cargo: "Presidente do Tribunal" }), grupo)).toEqual({ tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });
    });
  test("Excelentíssimo Senhor no presidente do STJ diverge, esperado Senhor", () => {
    const c = contato({ grupo: "Ministros do STJ", cargo: "Presidente do Superior Tribunal de Justiça", tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
    expect(comparacoesTratamento(c, "Ministros do STJ").filter((x) => x.campo === "tratamento")).toEqual([
      { campo: "tratamento", valorPlanilha: "Excelentíssimo Senhor", valorEsperado: "Senhor", situacao: "divergente", origemValor: "regra_gt" },
    ]);
  });
  test("Vice-Presidente de tribunal e ministro comum ficam fora do fixo", () => {
    expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Vice-Presidente do Supremo Tribunal Federal" }), "Ministros do STF")).toBeUndefined();
    expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Ministro do Supremo Tribunal Federal" }), "Ministros do STF")).toBeUndefined();
  });
  test("Senador em exercício e governador atual não recebem o fixo dos eleitos", () => {
    expect(protocoloFixo(contato({ grupo: "Senadores", cargo: "Senador" }), "Senadores (Acre a Goiás)")).toBeUndefined();
    expect(protocoloFixo(contato({ grupo: "Governadores", cargo: "Governador do Estado de Goiás" }), "Governadores")).toBeUndefined();
  });
});
