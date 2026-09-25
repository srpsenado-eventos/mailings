import { describe, expect, test } from "vitest";
import { analisar, type Dependencias } from "@/lib/analise";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

/**
 * `Tratamento` e `Endereçamento` coerentes e conformes: a auditoria dos dois campos roda
 * em todo contato, e célula vazia é achado por si só — aqui o que está sob teste é a
 * comparação com o site, não o cadastro de protocolo.
 */
const CADASTRO_OK = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };

const contatos: ContatoPlanilha[] = [
  { nome: "Ana Maria Política Completa", grupo: "ORG", ...CADASTRO_OK },
  { nome: "Pessoa Sem Fonte", grupo: "SEM_FONTE", ...CADASTRO_OK },
];

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Política Completa, Presidente.",
  destaques: [],
  pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "pagina" }],
};

const deps: Dependencias = {
  resolverFonte: (grupo) =>
    grupo === "ORG"
      ? {
          grupoCanonico: "ORG",
          fontes: [{ url: "https://orgao.gov.br", ativo: true }],
          sugestoes: [],
        }
      : { fontes: [], sugestoes: [] },
  raspar: async (_fonte) => fonte,
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
      resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [], sugestoes: [] }),
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
      resolverFonte: () => ({ fontes: [], sugestoes: ["Conselho Nacional de Justiça (CNJ)"] }),
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
      [{ nome: "Ana Maria Política Completa", grupo: "ORG", cargo: "Presidente", ...CADASTRO_OK }],
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

describe("analisar com duas fontes no mesmo grupo", () => {
  const PRIMARIA = "https://senado.leg.br/em-exercicio";
  const SECUNDARIA = "https://senado.leg.br/fora-de-exercicio";

  const depsSenadores: Dependencias = {
    resolverFonte: () => ({
      grupoCanonico: "Senadores (Maranhão ao Piauí)",
      fontes: [
        { url: PRIMARIA, ativo: true },
        { url: SECUNDARIA, ativo: true, rotulo: "fora de exercício", propoeInclusao: true },
      ],
      ufs: ["MA", "PI"],
      sugestoes: [],
    }),
    raspar: async (fonte) =>
      fonte.url === PRIMARIA
        ? {
            url: PRIMARIA,
            textoLimpo: "Weverton — MA",
            destaques: [],
            pessoas: [{ nome: "Weverton", uf: "MA", origem: "pagina" as const }],
          }
        : {
            url: SECUNDARIA,
            textoLimpo: "Wellington Dias — PI",
            destaques: [],
            pessoas: [
              { nome: "Wellington Dias", uf: "PI", contexto: "Ocupação de cargo de ministro/secretário", origem: "pagina" as const },
            ],
          },
    extrairComposicao: async () => [],
  };

  const senadores: ContatoPlanilha[] = [
    { nome: "Weverton", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
    { nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
  ];

  test("contato que só consta na fonte secundária não é possível saída", async () => {
    const r = await analisar("c.xlsx", senadores, depsSenadores);
    const wellington = r.grupos[0].contatos.find((c) => c.contato.nome === "Wellington Dias");
    expect(wellington?.possivelSaida).toBeUndefined();
    expect(wellington?.semaforo).toBe("verde");
  });

  test("o grupo aponta para a fonte primária", async () => {
    const r = await analisar("c.xlsx", senadores, depsSenadores);
    expect(r.grupos[0].fonteUrl).toBe(PRIMARIA);
    expect(r.grupos[0].semFonte).toBe(false);
  });

  test("quem aparece nas duas fontes conta uma vez só e não vira novo", async () => {
    const depsRepetido: Dependencias = {
      ...depsSenadores,
      raspar: async (fonte) => ({
        url: fonte.url,
        textoLimpo: "Weverton — MA",
        destaques: [],
        pessoas: [{ nome: "Weverton", uf: "MA", origem: "pagina" as const }],
      }),
    };
    const r = await analisar("c.xlsx", [senadores[0]], depsRepetido);
    expect(r.grupos[0].contatos).toHaveLength(1);
    expect(r.grupos[0].novos).toEqual([]);
  });

  test("uma fonte cai e a outra responde: compara com a que sobrou e guarda o motivo", async () => {
    const depsPrimariaQuebrada: Dependencias = {
      ...depsSenadores,
      raspar: async (fonte) => {
        if (fonte.url === PRIMARIA) throw new Error("HTTP 403");
        return {
          url: SECUNDARIA,
          textoLimpo: "Wellington Dias — PI",
          destaques: [],
          pessoas: [{ nome: "Wellington Dias", uf: "PI", origem: "pagina" as const }],
        };
      },
    };
    const r = await analisar("c.xlsx", senadores, depsPrimariaQuebrada);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.erroFonte).toBe("HTTP 403");
    expect(g.contatos.find((c) => c.contato.nome === "Wellington Dias")?.semaforo).toBe("verde");
    expect(g.contatos.find((c) => c.contato.nome === "Weverton")?.possivelSaida).toBe(true);
  });

  test("as duas fontes caem: todos indeterminados, nenhuma saída", async () => {
    const depsTudoQuebrado: Dependencias = {
      ...depsSenadores,
      raspar: async () => {
        throw new Error("timeout");
      },
    };
    const r = await analisar("c.xlsx", senadores, depsTudoQuebrado);
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(r.grupos[0].contatos.every((c) => c.semaforo === "indeterminado")).toBe(true);
    expect(r.grupos[0].contatos.some((c) => c.possivelSaida)).toBe(false);
  });
});
