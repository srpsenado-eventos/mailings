import { describe, expect, test, vi, beforeEach } from "vitest";
import { iaDisponivel, extrairComposicao, extrairJson } from "@/lib/gemini";

describe("iaDisponivel", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("false quando não há chave", () => {
    expect(iaDisponivel()).toBe(false);
  });

  test("true quando há chave", () => {
    process.env.ANTHROPIC_API_KEY = "x";
    expect(iaDisponivel()).toBe(true);
  });
});

describe("extrairJson", () => {
  test("parseia JSON simples", () => {
    expect(extrairJson('[{"nome":"Ana"}]')).toEqual([{ nome: "Ana" }]);
  });

  test("remove cercas de código ```json", () => {
    expect(extrairJson('```json\n[{"nome":"Ana"}]\n```')).toEqual([{ nome: "Ana" }]);
  });

  test("recorta o array quando há texto em volta", () => {
    expect(extrairJson('Claro! Aqui está: [{"nome":"Ana"}] fim.')).toEqual([{ nome: "Ana" }]);
  });

  test("texto sem JSON → array vazio", () => {
    expect(extrairJson("nenhum json aqui")).toEqual([]);
  });
});

describe("extrairComposicao", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  test("devolve pessoas com origem e endereço", async () => {
    const cliente = {
      gerarJson: vi.fn().mockResolvedValue([
        { nome: "Ana Lima", cargo: "Conselheira", endereco: "Praça X", origem: "pagina" },
        { nome: "Bruno Sá", cargo: "Conselheiro", origem: "conhecimento" },
      ]),
    };
    const pessoas = await extrairComposicao("CNJ", "texto da página", cliente);
    expect(pessoas).toEqual([
      { nome: "Ana Lima", cargo: "Conselheira", endereco: "Praça X", origem: "pagina" },
      { nome: "Bruno Sá", cargo: "Conselheiro", endereco: undefined, origem: "conhecimento" },
    ]);
  });

  test("origem inválida/ausente vira 'conhecimento'", async () => {
    const cliente = { gerarJson: vi.fn().mockResolvedValue([{ nome: "Ana", cargo: "X" }]) };
    const p = await extrairComposicao("G", "", cliente);
    expect(p[0].origem).toBe("conhecimento");
  });

  test("sem chave e sem cliente → []", async () => {
    expect(await extrairComposicao("G", "txt")).toEqual([]);
  });

  test("falha do cliente → [] (degrada)", async () => {
    const cliente = { gerarJson: vi.fn().mockRejectedValue(new Error("cota")) };
    expect(await extrairComposicao("G", "txt", cliente)).toEqual([]);
  });
});
