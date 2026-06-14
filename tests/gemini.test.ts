import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  geminiDisponivel,
  pesquisarFonteAmpla,
  extrairComposicaoGemini,
  extrairJson,
} from "@/lib/gemini";

describe("geminiDisponivel", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  test("false quando não há chave", () => {
    expect(geminiDisponivel()).toBe(false);
  });

  test("true quando há chave", () => {
    process.env.GEMINI_API_KEY = "x";
    expect(geminiDisponivel()).toBe(true);
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

describe("pesquisarFonteAmpla", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  test("sem chave e sem cliente → undefined", async () => {
    expect(await pesquisarFonteAmpla("CNJ")).toBeUndefined();
  });

  test("com cliente fake → ConteudoFonte com destaques e textoLimpo", async () => {
    const cliente = {
      gerarJson: vi.fn().mockResolvedValue([
        { nome: "Ana Lima", cargo: "Conselheira" },
        { nome: "Bruno Sá" },
      ]),
    };
    const fonte = await pesquisarFonteAmpla("Conselho Nacional de Justiça (CNJ)", cliente);
    if (!fonte) throw new Error("esperava ConteudoFonte");
    expect(fonte.destaques).toEqual(["Ana Lima", "Bruno Sá"]);
    expect(fonte.textoLimpo).toContain("Ana Lima, Conselheira.");
    expect(fonte.textoLimpo).toContain("Bruno Sá.");
    expect(fonte.pessoas).toEqual([
      { nome: "Ana Lima", cargo: "Conselheira" },
      { nome: "Bruno Sá", cargo: undefined },
    ]);
  });

  test("resposta sem pessoas → undefined", async () => {
    const cliente = { gerarJson: vi.fn().mockResolvedValue([]) };
    expect(await pesquisarFonteAmpla("X", cliente)).toBeUndefined();
  });

  test("falha do cliente → undefined (degrada)", async () => {
    const cliente = { gerarJson: vi.fn().mockRejectedValue(new Error("cota")) };
    expect(await pesquisarFonteAmpla("X", cliente)).toBeUndefined();
  });
});

describe("extrairComposicaoGemini", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  test("converte texto raspado em pessoas estruturadas", async () => {
    const cliente = {
      gerarJson: vi.fn().mockResolvedValue([{ nome: "Ana Lima", cargo: "Conselheira" }]),
    };
    const pessoas = await extrairComposicaoGemini("...texto bagunçado...", cliente);
    expect(pessoas).toEqual([{ nome: "Ana Lima", cargo: "Conselheira" }]);
  });

  test("sem chave e sem cliente → []", async () => {
    expect(await extrairComposicaoGemini("x")).toEqual([]);
  });

  test("falha do cliente → [] (degrada)", async () => {
    const cliente = { gerarJson: vi.fn().mockRejectedValue(new Error("cota")) };
    expect(await extrairComposicaoGemini("x", cliente)).toEqual([]);
  });
});
