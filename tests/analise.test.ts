import { describe, expect, test } from "vitest";
import { analisar, type Dependencias } from "@/lib/analise";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

const contatos: ContatoPlanilha[] = [
  { nome: "Ana Maria Política Completa", grupo: "ORG" },
  { nome: "Pessoa Sem Fonte", grupo: "SEM_FONTE" },
];

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Política Completa, Presidente.",
  destaques: ["Ana Política"],
};

const deps: Dependencias = {
  resolverFonte: async (grupo) => (grupo === "ORG" ? "https://orgao.gov.br" : undefined),
  raspar: async () => fonte,
  refinar: async (g) => g,
};

describe("analisar", () => {
  test("monta resultado por grupo e resumo agregado", async () => {
    const r = await analisar("contatos.xlsx", contatos, deps);
    expect(r.arquivoNome).toBe("contatos.xlsx");
    expect(r.grupos).toHaveLength(2);
    expect(r.resumo.total).toBe(2);
    expect(r.resumo.gruposSemFonte).toBe(1);
  });

  test("grupo com fonte produz veredito verde para nome presente", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], deps);
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("falha de scrape marca fonte inacessível (≠ sem fonte), sem derrubar a análise", async () => {
    const depsQuebrado: Dependencias = {
      ...deps,
      raspar: async () => {
        throw new Error("timeout");
      },
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsQuebrado);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.semFonte).toBe(false);
    expect(g.fonteUrl).toBe("https://orgao.gov.br");
    expect(g.erroFonte).toBe("timeout");
    expect(g.contatos[0].semaforo).toBe("indeterminado");
  });

  test("resumo conta grupos inacessíveis e registros indeterminados", async () => {
    const depsQuebrado: Dependencias = {
      ...deps,
      raspar: async () => {
        throw new Error("HTTP 403");
      },
    };
    const r = await analisar("c.xlsx", contatos, depsQuebrado);
    // "ORG" tem URL mas falha o scrape → inacessível; "SEM_FONTE" → sem fonte.
    expect(r.resumo.gruposFonteInacessivel).toBe(1);
    expect(r.resumo.gruposSemFonte).toBe(1);
    expect(r.resumo.indeterminado).toBe(1);
  });

  test("falha do refinador (Camada B) degrada para o veredito da Camada A sem derrubar", async () => {
    const depsRefinarQuebrado: Dependencias = {
      ...deps,
      refinar: async () => {
        throw new Error("cota do Gemini esgotada");
      },
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsRefinarQuebrado);
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
    expect(r.grupos[0].contatos[0].origem).toBe("oficial");
  });
});
