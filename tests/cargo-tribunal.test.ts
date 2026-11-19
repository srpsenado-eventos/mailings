import { describe, expect, test } from "vitest";
import { cargoEsperadoNoTribunal, contextoCargoDoGrupo } from "@/lib/cargo-tribunal";

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

  test("o contexto do grupo marca só os tribunais", () => {
    expect(contextoCargoDoGrupo("Ministros do TCU")).toEqual({ tribunal: true });
    expect(contextoCargoDoGrupo(undefined)).toEqual({ tribunal: false });
  });
});
