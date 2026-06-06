import { describe, expect, test, vi, beforeEach } from "vitest";
import {
  refinarComGemini,
  geminiDisponivel,
  pesquisarFonteAmpla,
  extrairJson,
} from "@/lib/gemini";
import type { ResultadoGrupo } from "@/lib/types";

const grupoBase: ResultadoGrupo = {
  grupo: "ORG",
  fonteUrl: "https://orgao.gov.br",
  semFonte: false,
  contatos: [
    {
      contato: { nome: "Ana", grupo: "ORG" },
      semaforo: "amarelo",
      score: 0.7,
      comparacoes: [],
      camposDivergentes: [],
      origem: "oficial",
      fonteUrl: "https://orgao.gov.br",
    },
  ],
  novos: [],
};

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

describe("refinarComGemini", () => {
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  test("sem chave → devolve o grupo inalterado (degradação graciosa)", async () => {
    const r = await refinarComGemini(grupoBase, {
      textoLimpo: "",
      url: "",
      destaques: [],
      pessoas: [],
    });
    expect(r).toEqual(grupoBase);
  });

  test("falha do cliente → devolve o grupo da Camada A sem lançar", async () => {
    process.env.GEMINI_API_KEY = "x";
    const clienteQuebrado = {
      gerarJson: vi.fn().mockRejectedValue(new Error("cota")),
    };
    const r = await refinarComGemini(
      grupoBase,
      { textoLimpo: "", url: "", destaques: [], pessoas: [] },
      clienteQuebrado,
    );
    expect(r.contatos[0].semaforo).toBe("amarelo");
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
