import { describe, expect, test } from "vitest";
import { siglaDaUf, UF_POR_EXTENSO, ufDoContato, ufNoTexto } from "@/lib/uf";

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

describe("ufNoTexto", () => {
  test.each([
    ["Governador do Estado de Mato Grosso do Sul", "MS"],
    ["Governador do Estado de Mato Grosso", "MT"],
    ["Governo do Distrito Federal", "DF"],
    ["Governadora do Estado da Paraíba", "PB"],
    ["Governador do Estado do Rio Grande do Norte", "RN"],
    ["Governador do Estado do Rio Grande do Sul", "RS"],
    ["Governador do Estado do Pará", "PA"],
    ["Governador do Estado do Paraná", "PR"],
  ])("%s devolve %s", (texto, sigla) => {
    expect(ufNoTexto(texto)).toBe(sigla);
  });

  test("texto sem UF ou vazio devolve undefined", () => {
    expect(ufNoTexto("Governadora")).toBeUndefined();
    expect(ufNoTexto("")).toBeUndefined();
    expect(ufNoTexto(undefined)).toBeUndefined();
  });
});

describe("ufDoContato", () => {
  test("Departamento por extenso vence; depois o Cargo; depois o Órgão", () => {
    expect(ufDoContato({ departamento: "GOIÁS", cargo: "Governador do Estado de Minas Gerais" })).toBe("GO");
    expect(ufDoContato({ departamento: "", cargo: "Governador do Estado de Minas Gerais" })).toBe("MG");
    expect(ufDoContato({ departamento: "", cargo: "Governador em Exercício", orgao: "Governo do Estado do Rio de Janeiro" })).toBe("RJ");
    expect(ufDoContato({ departamento: "", cargo: "Ministro de Estado da Fazenda" })).toBeUndefined();
  });
});
