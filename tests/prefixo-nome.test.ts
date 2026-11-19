import { describe, expect, test } from "vitest";
import { comparacaoPrefixoNome, nomeEsperadoComPrefixo } from "@/lib/prefixo-nome";
import type { ContatoPlanilha } from "@/lib/types";

const grupo = "Presidente da Câmara dos Deputados";
const presidente = (p: Partial<ContatoPlanilha>): ContatoPlanilha =>
  ({
    nome: "Deputado Federal Hugo Fictício",
    grupo,
    cargo: "Presidente da Câmara dos Deputados",
    tratamento: "Excelentíssimo Senhor",
    ...p,
  }) as ContatoPlanilha;

describe("prefixo Deputado Federal no Presidente da Câmara (GT, 2026-11-19)", () => {
  test("nome com Deputado Federal e página só com o nome: nenhum achado e esperado com o prefixo", () => {
    expect(comparacaoPrefixoNome(presidente({}), grupo)).toEqual([]);
    expect(nomeEsperadoComPrefixo(presidente({}), grupo, "Hugo Fictício")).toBe("Deputado Federal Hugo Fictício");
  });

  test("nome sem o prefixo: achado nome_sem_prefixo com o esperado completo", () => {
    expect(comparacaoPrefixoNome(presidente({ nome: "Hugo Fictício" }), grupo)).toEqual([
      {
        campo: "nome",
        valorPlanilha: "Hugo Fictício",
        valorEsperado: "Deputado Federal Hugo Fictício",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "nome_sem_prefixo",
      },
    ]);
  });

  test("presidenta leva Deputada Federal", () => {
    const c = presidente({ nome: "Ana Fictícia", tratamento: "Excelentíssima Senhora", cargo: "Presidenta da Câmara dos Deputados" });
    expect(nomeEsperadoComPrefixo(c, grupo, "Ana Fictícia")).toBe("Deputada Federal Ana Fictícia");
  });

  test("Exmo. Deputado Federal já tem o prefixo; Deputado sozinho não basta", () => {
    expect(comparacaoPrefixoNome(presidente({ nome: "Exmo. Deputado Federal Hugo Fictício" }), grupo)).toEqual([]);
    expect(comparacaoPrefixoNome(presidente({ nome: "Deputado Hugo Fictício" }), grupo)[0]?.valorEsperado).toBe(
      "Deputado Federal Hugo Fictício",
    );
  });

  test("nome só com o prefixo não gera achado", () => {
    expect(comparacaoPrefixoNome(presidente({ nome: "Deputado Federal" }), grupo)).toEqual([]);
  });

  test("Federal sem Deputado antes não é consumido como tratamento", () => {
    expect(nomeEsperadoComPrefixo(presidente({}), grupo, "Federal Hugo Fictício")).toBe(
      "Deputado Federal Federal Hugo Fictício",
    );
  });

  test("Vice-Presidente da Câmara não leva o prefixo", () => {
    expect(comparacaoPrefixoNome(presidente({ nome: "Hugo Fictício", cargo: "Vice-Presidente da Câmara" }), grupo)).toEqual([]);
  });

  test("Presidente do Senado continua sem prefixo", () => {
    const c = { nome: "Davi Fictício", grupo: "Presidente do Senado", cargo: "Presidente do Senado Federal" } as ContatoPlanilha;
    expect(comparacaoPrefixoNome(c, "Presidente do Senado")).toEqual([]);
  });

  test("os tribunais continuam como antes", () => {
    const c = { nome: "x", grupo: "Ministros do STF", cargo: "Presidente do Supremo Tribunal Federal" } as ContatoPlanilha;
    expect(nomeEsperadoComPrefixo(c, "Ministros do STF", "Luís Fictício")).toBe("Ministro Luís Fictício");
  });
});
