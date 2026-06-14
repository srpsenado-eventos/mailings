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
  pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Presidente" }],
};

const deps: Dependencias = {
  resolverFonte: async (grupo) =>
    grupo === "ORG"
      ? { grupoCanonico: "ORG", url: "https://orgao.gov.br", sugestoes: [] }
      : { sugestoes: [] },
  raspar: async () => fonte,
  pesquisarAmpla: async () => undefined,
};

const fonteAmpla: ConteudoFonte = {
  url: "pesquisa-ampla://gemini+google-search",
  textoLimpo: "Ana Maria Política Completa, Presidente.",
  destaques: ["Ana Maria Política Completa"],
  pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Presidente" }],
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

  test("fonte inacessível + pesquisa ampla com conteúdo → grupo via pesquisa ampla", async () => {
    const depsAmpla: Dependencias = {
      ...deps,
      raspar: async () => {
        throw new Error("HTTP 403");
      },
      pesquisarAmpla: async () => fonteAmpla,
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsAmpla);
    const g = r.grupos[0];
    expect(g.viaPesquisaAmpla).toBe(true);
    expect(g.fonteInacessivel).toBeFalsy();
    expect(g.fonteUrl).toBe("https://orgao.gov.br"); // preserva a URL oficial para conferência
    expect(g.contatos[0].origem).toBe("pesquisa_ampla");
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(r.resumo.gruposViaPesquisaAmpla).toBe(1);
  });

  test("grupo casado sem URL oficial + pesquisa ampla → via pesquisa ampla", async () => {
    const depsSemUrl: Dependencias = {
      ...deps,
      resolverFonte: async () => ({ grupoCanonico: "ORG", sugestoes: [] }), // casou, sem URL
      pesquisarAmpla: async () => fonteAmpla,
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsSemUrl);
    expect(r.grupos[0].viaPesquisaAmpla).toBe(true);
    expect(r.grupos[0].contatos[0].origem).toBe("pesquisa_ampla");
  });

  test("grupo desconhecido com sugestões → semFonte + sugestoesCadastro", async () => {
    const depsSug: Dependencias = {
      ...deps,
      resolverFonte: async () => ({ sugestoes: ["Conselho Nacional de Justiça (CNJ)"] }),
    };
    const r = await analisar("c.xlsx", [contatos[1]], depsSug);
    const g = r.grupos[0];
    expect(g.semFonte).toBe(true);
    expect(g.sugestoesCadastro).toEqual(["Conselho Nacional de Justiça (CNJ)"]);
  });

  test("enriquecerPessoas (Fase 2) substitui as pessoas usadas no matching", async () => {
    const depsEnriq: Dependencias = {
      ...deps,
      raspar: async () => ({
        url: "https://orgao.gov.br",
        textoLimpo: "ruído determinístico",
        destaques: [],
        pessoas: [{ nome: "Pessoa Errada Extraída" }],
      }),
      enriquecerPessoas: async (f) => ({
        ...f,
        pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Presidente" }],
      }),
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsEnriq);
    // sem enriquecer, "Ana" não casaria "Pessoa Errada"; com Gemini, casa → verde.
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("enriquecimento (Camada B) não mascara divergência: cargo diferente continua amarelo", async () => {
    const depsEnriq: Dependencias = {
      ...deps,
      enriquecerPessoas: async (f) => ({
        ...f,
        pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Diretora" }],
      }),
    };
    const r = await analisar(
      "c.xlsx",
      [{ nome: "Ana Maria Política Completa", grupo: "ORG", cargo: "Presidente" }],
      depsEnriq,
    );
    const c = r.grupos[0].contatos[0];
    expect(c.semaforo).toBe("amarelo"); // divergência de cargo NÃO vira verde
    expect(c.origem).toBe("oficial"); // veio da fonte oficial, não de pesquisa ampla
    expect(c.comparacoes.find((x) => x.campo === "cargo")?.situacao).toBe("divergente");
  });
});
