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
  destaques: [],
  pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "pagina" }],
};

const deps: Dependencias = {
  resolverFonte: async (grupo) =>
    grupo === "ORG"
      ? { grupoCanonico: "ORG", url: "https://orgao.gov.br", sugestoes: [] }
      : { sugestoes: [] },
  raspar: async () => fonte,
  extrairComposicao: async () => [], // sem IA → usa o determinístico do scrape
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

  test("falha de scrape (sem IA) marca fonte inacessível, com o motivo técnico", async () => {
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
    expect(r.resumo.gruposFonteInacessivel).toBe(1);
    expect(r.resumo.gruposSemFonte).toBe(1);
    expect(r.resumo.indeterminado).toBe(1);
  });

  test("fonte inacessível + IA por conhecimento → grupo via pesquisa ampla", async () => {
    const depsIa: Dependencias = {
      ...deps,
      raspar: async () => {
        throw new Error("HTTP 403");
      },
      extrairComposicao: async () => [
        { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" },
      ],
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsIa);
    const g = r.grupos[0];
    expect(g.viaPesquisaAmpla).toBe(true);
    expect(g.fonteInacessivel).toBeFalsy();
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].origem).toBe("pesquisa_ampla");
    expect(r.resumo.gruposViaPesquisaAmpla).toBe(1);
  });

  test("página vazia (JS) + IA completa pelo conhecimento casa e marca viaPesquisaAmpla", async () => {
    const depsIa: Dependencias = {
      ...deps,
      raspar: async () => ({ url: "https://tcu", textoLimpo: "", destaques: [], pessoas: [] }),
      extrairComposicao: async () => [
        { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" },
      ],
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsIa);
    expect(r.grupos[0].viaPesquisaAmpla).toBe(true);
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("grupo casado sem URL oficial + IA → via pesquisa ampla", async () => {
    const depsSemUrl: Dependencias = {
      ...deps,
      resolverFonte: async () => ({ grupoCanonico: "ORG", sugestoes: [] }),
      extrairComposicao: async () => [
        { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" },
      ],
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsSemUrl);
    expect(r.grupos[0].viaPesquisaAmpla).toBe(true);
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

  test("IA não mascara divergência: página legível manda no veredito (continua amarelo)", async () => {
    const depsIa: Dependencias = {
      ...deps,
      raspar: async () => ({
        url: "https://orgao.gov.br",
        textoLimpo: "Ana Maria Política Completa, Diretora.",
        destaques: [],
        pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Diretora", origem: "pagina" }],
      }),
      // A IA "corrige" para Presidente — mas a página é a base e não pode ser mascarada.
      extrairComposicao: async () => [
        { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "pagina" },
      ],
    };
    const r = await analisar(
      "c.xlsx",
      [{ nome: "Ana Maria Política Completa", grupo: "ORG", cargo: "Presidente" }],
      depsIa,
    );
    const c = r.grupos[0].contatos[0];
    expect(c.semaforo).toBe("amarelo");
    expect(c.origem).toBe("oficial"); // pessoa veio da página → veredito oficial
    expect(c.comparacoes.find((x) => x.campo === "cargo")?.situacao).toBe("divergente");
  });

  test("página ilegível (JS, 0 pessoas) + IA vazia → 'não verificado', NUNCA 'saída'", async () => {
    const depsVazio: Dependencias = {
      ...deps,
      raspar: async () => ({ url: "https://tcu", textoLimpo: "", destaques: [], pessoas: [] }),
      extrairComposicao: async () => [],
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsVazio);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(g.contatos[0].possivelSaida).toBeFalsy();
    expect(g.erroFonte).toMatch(/conteúdo legível/);
  });

  test("página legível que escapou um nome: a IA resgata o contato (não vira 'saída')", async () => {
    const depsResgate: Dependencias = {
      ...deps,
      raspar: async () => ({
        url: "https://orgao.gov.br",
        textoLimpo: "Outra Pessoa Qualquer, Diretor.",
        destaques: [],
        pessoas: [{ nome: "Outra Pessoa Qualquer", cargo: "Diretor", origem: "pagina" }],
      }),
      extrairComposicao: async () => [
        { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" },
      ],
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsResgate);
    const c = r.grupos[0].contatos[0];
    expect(c.semaforo).toBe("verde");
    expect(c.possivelSaida).toBeFalsy();
    expect(c.origem).toBe("pesquisa_ampla"); // resgatado pela IA
  });
});
