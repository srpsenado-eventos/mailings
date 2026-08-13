import { describe, expect, test } from "vitest";
import { expandirFormas } from "@/lib/tratamento";
import type { ContatoPlanilha } from "@/lib/types";

/** Contato mínimo; sobrescreva o que o caso precisar. */
function contato(extra: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Ana Maria Souza", grupo: "G", ...extra };
}

describe("expandirFormas — marcador de gênero", () => {
  test("sufixo em palavra terminada em o troca o 'o' pelo 'a'", () => {
    const formas = expandirFormas("Excelentíssimo(a) Senhor(a) Presidente", contato());
    expect(formas).toContain("excelentissimo senhor presidente");
    expect(formas).toContain("excelentissima senhora presidente");
  });

  test("sufixo em palavra que não termina em o apenas acrescenta o 'a'", () => {
    const formas = expandirFormas("Senhor(a) Embaixador(a)", contato());
    expect(formas).toContain("senhor embaixador");
    expect(formas).toContain("senhora embaixadora");
  });

  test("normalização absorve a irregularidade de Juiz(a)", () => {
    const formas = expandirFormas("Senhor(a) Juiz(a)", contato());
    expect(formas).toContain("senhor juiz");
    expect(formas).toContain("senhora juiza");
  });

  test("tolera a inconsistência da fonte (Excelentíssimo sem marcador)", () => {
    const formas = expandirFormas("Excelentíssimo Senhor(a) Governador(a)", contato());
    expect(formas).toContain("excelentissimo senhor governador");
    expect(formas).toContain("excelentissimo senhora governadora");
  });
});

describe("expandirFormas — alternativas", () => {
  test("alternativas separadas por 'ou' em linha isolada viram formas independentes", () => {
    const formas = expandirFormas(
      "Eminentíssimo Senhor Cardeal\nou\nEminentíssimo e Reverendíssimo Senhor Cardeal",
      contato(),
    );
    expect(formas).toContain("eminentissimo senhor cardeal");
    expect(formas).toContain("eminentissimo e reverendissimo senhor cardeal");
  });

  test("barra herda o prefixo da primeira alternativa", () => {
    // "Senhor(a) Ministro(a) / Conselheiro(a)" precisa aceitar "Senhora Conselheira",
    // e não só "Conselheira" solto.
    const formas = expandirFormas("Senhor(a) Ministro(a) / Conselheiro(a)", contato());
    expect(formas).toContain("senhor ministro");
    expect(formas).toContain("senhora conselheira");
  });

  test("barra com prefixo de duas palavras (Arcebispo / Bispo)", () => {
    const formas = expandirFormas("Reverendíssimo Senhor Arcebispo / Bispo", contato());
    expect(formas).toContain("reverendissimo senhor arcebispo");
    expect(formas).toContain("reverendissimo senhor bispo");
  });
});

describe("expandirFormas — feminino por extenso", () => {
  test("parêntese com palavra inteira gera alternativa, combinada com o gênero", () => {
    const formas = expandirFormas("Senhor(a) Cônsul (Consulesa)", contato());
    expect(formas).toContain("senhor consul");
    expect(formas).toContain("senhora consulesa");
  });
});

describe("expandirFormas — placeholders", () => {
  test("[Cargo] é substituído pelo cargo do contato", () => {
    const formas = expandirFormas("Senhor(a) [Cargo]", contato({ cargo: "Diretor-Geral" }));
    expect(formas).toContain("senhor diretor-geral");
    expect(formas).toContain("senhora diretor-geral");
  });

  test("[Patente] usa o cargo do contato", () => {
    const formas = expandirFormas("Senhor(a) [Patente]", contato({ cargo: "Coronel" }));
    expect(formas).toContain("senhor coronel");
  });

  test("placeholder sem cargo no contato devolve vazio (não auditável)", () => {
    expect(expandirFormas("Senhor(a) [Cargo]", contato())).toEqual([]);
  });

  test("[Nome] é substituído pelo nome do contato", () => {
    const formas = expandirFormas("A Sua Excelência o(a) Senhor(a)\n[Nome]", contato());
    expect(formas).toContain("a sua excelencia o senhor ana maria souza");
  });
});

describe("expandirFormas — higiene", () => {
  test("espaço sobrando na tabela não afeta o resultado", () => {
    const formas = expandirFormas("Excelentíssimo(a) Senhor(a) Presidente ", contato());
    expect(formas).toContain("excelentissimo senhor presidente");
  });

  test("quebras de linha do endereçamento viram espaço", () => {
    const formas = expandirFormas("A Sua Excelência\nPresidente\ndo Senado", contato());
    expect(formas).toContain("a sua excelencia presidente do senado");
  });

  test("não repete formas idênticas", () => {
    const formas = expandirFormas("Senhor Presidente", contato());
    expect(formas).toEqual(["senhor presidente"]);
  });

  test("padrão vazio devolve lista vazia", () => {
    expect(expandirFormas("   ", contato())).toEqual([]);
  });
});
