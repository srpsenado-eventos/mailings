import { describe, expect, test } from "vitest";
import { comparacaoCargoExPresidente, OBSERVACAO_PERIODO, PERIODO_PRESIDENCIA } from "@/lib/regras-cargo";
import { REGRAS_NOME } from "@/data/regras-nome";
import { rotuloAchado, textoCoerencia } from "@/lib/tratamento";
import type { ContatoPlanilha } from "@/lib/types";

const SENADO = "Ex-Presidentes do Senado";
const REPUBLICA = "Ex-Presidentes da República";

const exPresidente = (cargo: string, grupo = SENADO): ContatoPlanilha => ({ nome: "Rui Fictício", grupo, cargo });

describe("REGRAS_NOME: cargo com período dos ex-presidentes", () => {
  test("os dois grupos de ex-presidentes têm o cargo do formato do GT", () => {
    // Assert
    expect(REGRAS_NOME[SENADO]?.cargoComPeriodo).toBe("Presidente do Senado Federal");
    expect(REGRAS_NOME[REPUBLICA]?.cargoComPeriodo).toBe("Presidente da República Federativa do Brasil");
  });
});

describe("PERIODO_PRESIDENCIA", () => {
  test.each(["de 2019 a 2021", "de 1995 a 1997 e de 2009 a 2011", "de 1995 a 1997, de 2003 a 2005 e de 2009 a 2011"])(
    "aceita %s",
    (periodo) => {
      // Assert
      expect(PERIODO_PRESIDENCIA.test(periodo)).toBe(true);
    },
  );

  test.each(["de AAAA a AAAA", "de 19 a 21", "2019 a 2021", "de 2019 a 2021 e", "de 2019"])("recusa %s", (periodo) => {
    // Assert
    expect(PERIODO_PRESIDENCIA.test(periodo)).toBe(false);
  });
});

describe("comparacaoCargoExPresidente", () => {
  test('"Ex-Presidente do Senado Federal" diverge, com o formato do GT como esperado', () => {
    // Act
    const [c, ...resto] = comparacaoCargoExPresidente(exPresidente("Ex-Presidente do Senado Federal"), SENADO);

    // Assert
    expect(resto).toEqual([]);
    expect(c).toEqual({
      campo: "cargo",
      valorPlanilha: "Ex-Presidente do Senado Federal",
      valorEsperado: "Presidente do Senado Federal de AAAA a AAAA",
      situacao: "divergente",
      origemValor: "coerencia",
      achado: "cargo_ex_presidente",
      observacao: OBSERVACAO_PERIODO,
    });
    expect(OBSERVACAO_PERIODO).toBe("Informar o período da presidência");
  });

  test.each(["ex presidente do Senado", "EX-PRESIDENTE DO SENADO FEDERAL", "Ex-Presidenta do Senado", "  Ex - Presidente do Senado"])(
    '"%s" também diverge',
    (cargo) => {
      // Act
      const r = comparacaoCargoExPresidente(exPresidente(cargo), SENADO);

      // Assert
      expect(r.map((x) => x.achado)).toEqual(["cargo_ex_presidente"]);
    },
  );

  test("na República o esperado é o cargo da República", () => {
    // Act
    const [c] = comparacaoCargoExPresidente(exPresidente("Ex-Presidente da República", REPUBLICA), REPUBLICA);

    // Assert
    expect(c.valorEsperado).toBe("Presidente da República Federativa do Brasil de AAAA a AAAA");
  });

  test.each([
    "Presidente do Senado Federal de 2019 a 2021",
    "presidente do senado federal de 2019 a 2019",
    "Presidente do Senado Federal de 1995 a 1997 e de 2009 a 2011",
    "Presidente do Senado Federal de 1995 a 1997, de 2003 a 2005 e de 2009 a 2011",
  ])('cargo no formato do GT não gera achado: "%s"', (cargo) => {
    // Assert
    expect(comparacaoCargoExPresidente(exPresidente(cargo), SENADO)).toEqual([]);
  });

  test.each([
    "Presidente do Senado Federal de AAAA a AAAA",
    "Presidente do Senado Federal de 2021 a 2019",
    "Presidente do Senado Federal de 1995 a 1997 e de 2011 a 2009",
    "Presidente do Senado Federal de 2019",
  ])('período fora do formato diverge: "%s"', (cargo) => {
    // Act
    const r = comparacaoCargoExPresidente(exPresidente(cargo), SENADO);

    // Assert
    expect(r.map((x) => x.achado)).toEqual(["cargo_ex_presidente"]);
    expect(r[0].valorEsperado).toBe("Presidente do Senado Federal de AAAA a AAAA");
  });

  test("cargo sem \"Ex\" e sem período não é desta regra", () => {
    // Assert
    expect(comparacaoCargoExPresidente(exPresidente("Presidente do Senado Federal"), SENADO)).toEqual([]);
    expect(comparacaoCargoExPresidente(exPresidente("Senador"), SENADO)).toEqual([]);
  });

  test("cargo vazio não é desta regra", () => {
    // Assert
    expect(comparacaoCargoExPresidente(exPresidente(""), SENADO)).toEqual([]);
    expect(comparacaoCargoExPresidente({ nome: "Rui Fictício", grupo: SENADO }, SENADO)).toEqual([]);
  });

  test("outro grupo, ou sem grupo canônico, não é acusado", () => {
    // Assert
    expect(comparacaoCargoExPresidente(exPresidente("Ex-Senador"), "Senadores")).toEqual([]);
    expect(comparacaoCargoExPresidente(exPresidente("Ex-Presidente do Senado Federal"), undefined)).toEqual([]);
  });

  test("não muta o contato", () => {
    // Arrange
    const contato = Object.freeze(exPresidente("Ex-Presidente do Senado Federal"));

    // Act + Assert
    expect(() => comparacaoCargoExPresidente(contato, SENADO)).not.toThrow();
    expect(contato.cargo).toBe("Ex-Presidente do Senado Federal");
  });
});

describe("texto do achado cargo_ex_presidente", () => {
  test("leva o cargo esperado e a observação, para a tela e o export", () => {
    // Arrange
    const [c] = comparacaoCargoExPresidente(exPresidente("Ex-Presidente do Senado Federal"), SENADO);

    // Act
    const texto = textoCoerencia(c);

    // Assert
    expect(rotuloAchado("cargo_ex_presidente")).toBe("Cargo de ex-presidente fora do formato do GT");
    expect(texto).toBe(
      "Cargo de ex-presidente fora do formato do GT (Presidente do Senado Federal de AAAA a AAAA). Informar o período da presidência",
    );
  });
});
