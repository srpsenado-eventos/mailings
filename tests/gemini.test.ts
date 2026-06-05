import { describe, expect, test, vi, beforeEach } from "vitest";
import { refinarComGemini, geminiDisponivel } from "@/lib/gemini";
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
      { textoLimpo: "", url: "", destaques: [] },
      clienteQuebrado,
    );
    expect(r.contatos[0].semaforo).toBe("amarelo");
  });
});
