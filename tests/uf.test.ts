import { describe, expect, test } from "vitest";
import { siglaDaUf, UF_POR_EXTENSO } from "@/lib/uf";

describe("siglaDaUf", () => {
  test("reconhece o nome por extenso do Departamento, com ou sem acento e caixa", () => {
    expect(siglaDaUf("MARANHÃO")).toBe("MA");
    expect(siglaDaUf("maranhao")).toBe("MA");
    expect(siglaDaUf("Distrito Federal")).toBe("DF");
  });

  test("aceita a própria sigla", () => {
    expect(siglaDaUf("sp")).toBe("SP");
  });

  test("devolve undefined para vazio ou texto que não é UF", () => {
    expect(siglaDaUf(undefined)).toBeUndefined();
    expect(siglaDaUf("")).toBeUndefined();
    expect(siglaDaUf("Senado Federal")).toBeUndefined();
  });

  test("tem as 27 UFs", () => {
    expect(Object.keys(UF_POR_EXTENSO)).toHaveLength(27);
  });
});
