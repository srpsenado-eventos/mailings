import { describe, expect, test } from "vitest";
import { classificarCep, formatarCep, normalizarCep } from "@/lib/cep";

describe("normalizarCep", () => {
  test("mantém só os dígitos", () => {
    expect(normalizarCep("70070-030")).toBe("70070030");
    expect(normalizarCep(" 01.049-000 ")).toBe("01049000");
    expect(normalizarCep(undefined)).toBe("");
  });
});

describe("classificarCep", () => {
  test("oito dígitos é válido", () => {
    expect(classificarCep("70070-030", "DF")).toEqual({ situacao: "valido", digitos: "70070030" });
  });

  test("sete dígitos em SP é recuperável: o zero à esquerda caiu na exportação", () => {
    expect(classificarCep("1049000", "SP")).toEqual({ situacao: "recuperavel", proposto: "01049000" });
    expect(classificarCep("4531003", "SP")).toEqual({ situacao: "recuperavel", proposto: "04531003" });
  });

  test("vazio é ausente, não inválido", () => {
    expect(classificarCep("", "DF").situacao).toBe("ausente");
    expect(classificarCep(undefined, undefined).situacao).toBe("ausente");
  });

  test("qualquer outro tamanho é inválido", () => {
    expect(classificarCep("700989000", "DF").situacao).toBe("invalido");
    expect(classificarCep("70070", "DF").situacao).toBe("invalido");
    expect(classificarCep("7007003", "DF").situacao).toBe("invalido");
  });

  test("sete dígitos fora de SP é inválido, nunca proposta — só SP tem CEP com zero à esquerda", () => {
    expect(classificarCep("1049000", "DF")).toEqual({ situacao: "invalido" });
    expect(classificarCep("1049000", "RJ")).toEqual({ situacao: "invalido" });
    expect(classificarCep("1049000", undefined)).toEqual({ situacao: "invalido" });
  });
});

describe("formatarCep", () => {
  test("põe o hífen em oito dígitos e devolve o resto como veio", () => {
    expect(formatarCep("70070030")).toBe("70070-030");
    expect(formatarCep("7007003")).toBe("7007003");
  });
});
