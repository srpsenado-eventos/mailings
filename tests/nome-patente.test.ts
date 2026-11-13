import { describe, expect, test } from "vitest";
import { mesmaPatente, nomeConfereComPatente, nomeEsperadoDaPagina, patenteDoNome } from "@/lib/nome-patente";

describe("patenteDoNome", () => {
  test.each([
    ["Gen Ex Fulano de Tal", "gen ex"],
    ["Gen. Ex. Fulano", "gen ex"],
    ["General de Exército Fulano", "general de exercito"],
    ["Ministro Alte Esq Fulano", "alte esq"],
    ["Ten Brig do Ar Fulano", "ten brig do ar"],
    ["Dra. Fulana", ""],
    ["Fulano", ""],
  ])("patenteDoNome(%s)", (nome, patente) => expect(patenteDoNome(nome)).toBe(patente));
});

describe("mesmaPatente", () => {
  test("por extenso × abreviada não é a mesma patente", () => expect(mesmaPatente("General de Exército X", "Gen Ex X")).toBe(false));
  test("sem patente × com patente não é a mesma", () => expect(mesmaPatente("Fulano de Tal", "Gen Ex Fulano de Tal")).toBe(false));
  test("ponto e caixa não separam", () => expect(mesmaPatente("GEN. EX. X", "Gen Ex X")).toBe(true));
});

describe("nomeEsperadoDaPagina", () => {
  test("tira Dra. no STM e mantém a patente", () => {
    const c = { nome: "X", grupo: "Ministros do STM" };
    expect(nomeEsperadoDaPagina(c, "Ministros do STM", "Dra. Fulana de Tal")).toBe("Fulana de Tal");
    expect(nomeEsperadoDaPagina(c, "Ministros do STM", "Gen Ex Fulano")).toBe("Gen Ex Fulano");
  });
  test("grupo sem a regra devolve a página como veio", () => {
    expect(nomeEsperadoDaPagina({ nome: "X", grupo: "G" }, "Ministros do STF", "Dr. Fulano")).toBe("Dr. Fulano");
  });
});

describe("nomeConfereComPatente", () => {
  test("só exige patente nos grupos com a regra", () => {
    expect(nomeConfereComPatente("General de Exército X", "Gen Ex X", { patenteComoNoSite: true })).toBe(false);
    expect(nomeConfereComPatente("General de Exército X", "Gen Ex X", undefined)).toBe(true);
    expect(nomeConfereComPatente("Gen X", "Gen X", { patenteComoNoSite: true })).toBe(true);
  });
});
