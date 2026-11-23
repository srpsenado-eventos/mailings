import { describe, expect, test } from "vitest";
import { cargoEsperadoNoTribunal, contextoCargoDoGrupo, semExPresidente } from "@/lib/cargo-tribunal";

describe("cargoEsperadoNoTribunal (spec 2026-10-30 §3.2)", () => {
  const TRIBUNAL = { tribunal: true };

  test("troca de presidência devolve o cargo do Contatos com Presidente no lugar de Ministro(a)", () => {
    expect(cargoEsperadoNoTribunal("Ministro do Tribunal Superior Eleitoral", "Presidente", TRIBUNAL)).toBe("Presidente do Tribunal Superior Eleitoral");
    expect(cargoEsperadoNoTribunal("Ministra do Superior Tribunal Militar", "(Presidente)", TRIBUNAL)).toBe("Presidente do Superior Tribunal Militar");
    expect(cargoEsperadoNoTribunal("Ministro(a) do STF", "PRESIDENTE:", TRIBUNAL)).toBe("Presidente do STF");
  });

  test("fora da troca de presidência devolve o cargo da página", () => {
    expect(cargoEsperadoNoTribunal("Ministro do STJ", "Vice-Presidente", TRIBUNAL)).toBe("Vice-Presidente");
    expect(cargoEsperadoNoTribunal("Ministro do STJ", "Vice Presidente", TRIBUNAL)).toBe("Vice Presidente");
    expect(cargoEsperadoNoTribunal("Presidente do STF", "Presidente", TRIBUNAL)).toBe("Presidente");
    expect(cargoEsperadoNoTribunal("Desembargador Convocado do STJ", "Presidente", TRIBUNAL)).toBe("Presidente");
    expect(cargoEsperadoNoTribunal("Ministro do STJ", undefined, TRIBUNAL)).toBeUndefined();
  });

  test("fora de tribunal devolve o cargo da página", () => {
    expect(cargoEsperadoNoTribunal("Ministro do TSE", "Presidente", {})).toBe("Presidente");
    expect(cargoEsperadoNoTribunal("Ministro do TSE", "Presidente", contextoCargoDoGrupo("Ministros de Estado"))).toBe("Presidente");
  });

  test("o contexto do grupo marca os tribunais e os grupos de ex-presidentes", () => {
    expect(contextoCargoDoGrupo("Ministros do TCU")).toEqual({ tribunal: true, exPresidente: false });
    expect(contextoCargoDoGrupo("Ex-Presidentes da República")).toEqual({ tribunal: false, exPresidente: true });
    expect(contextoCargoDoGrupo("Ex-Presidentes do Congresso")).toEqual({ tribunal: false, exPresidente: true });
    expect(contextoCargoDoGrupo("Senadores")).toEqual({ tribunal: false, exPresidente: false });
    expect(contextoCargoDoGrupo(undefined)).toEqual({ tribunal: false, exPresidente: false });
  });

  test.each([
    ["Ex-Presidente da República", "Presidente da República"],
    ["ex presidente do Senado Federal", "presidente do Senado Federal"],
    ["EX-PRESIDENTA DA REPÚBLICA", "PRESIDENTA DA REPÚBLICA"],
    ["Ex - Presidente do Congresso", "Presidente do Congresso"],
    ["Presidente da República Federativa do Brasil no período de 2011 a 2016", "Presidente da República Federativa do Brasil no período de 2011 a 2016"],
    ["Ex-Senador", "Ex-Senador"],
    ["Vice-Presidente do Senado Federal", "Vice-Presidente do Senado Federal"],
  ])('semExPresidente("%s") → "%s" (spec 2026-11-22 §2.1)', (entrada, saida) => {
    expect(semExPresidente(entrada)).toBe(saida);
  });
});
