import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { analisar, MOTIVO_LEITURA_SUSPEITA, type Dependencias } from "@/lib/analise";
import { extrairConteudo, extrairTabela, ScrapeError } from "@/lib/scrape";
import { URL_PESQUISA_AMPLA } from "@/lib/gemini";
import { MOTIVO_NAVEGADOR_AUSENTE } from "@/lib/navegador";
import { CATALOGO } from "@/data/catalogo";
import { chaveDaLeitura, MOTIVO_SEM_NINGUEM } from "@/lib/memoria-leitura";
import type { ContatoPlanilha, ConteudoFonte, FonteCatalogo, LeituraGuardada, LeiturasGuardadas } from "@/lib/types";

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
          fontesIndividuais: [],
          sugestoes: [],
        }
      : { fontes: [], fontesIndividuais: [], sugestoes: [] },
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

  test("nenhuma fonte legível, mas a IA compôs: quem falta na composição ainda é possível saída", async () => {
    // Fronteira da regra de ouro, e o limite da correção de leitura parcial: composição
    // "página OU IA". Nenhuma fonte contribuiu, então não há leitura parcial — a lista da
    // IA é composição real e pode apontar saída, marcada viaPesquisaAmpla ("≈ via IA —
    // confira"). É o caminho documentado do TCU (spec de 2026-06-14) e não muda aqui.
    // Arrange
    const depsIa: Dependencias = {
      ...deps,
      raspar: async () => {
        throw new Error("HTTP 403");
      },
      extrairComposicao: async () => [
        { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" },
      ],
    };
    const ausente = { nome: "Beatriz Sousa Ausente", grupo: "ORG", ...CADASTRO_OK };

    // Act
    const r = await analisar("c.xlsx", [contatos[0], ausente], depsIa);

    // Assert
    const g = r.grupos[0];
    expect(g.viaPesquisaAmpla).toBe(true);
    expect(g.erroFonte).toBeUndefined(); // não é leitura parcial: nenhuma fonte respondeu
    const beatriz = g.contatos.find((c) => c.contato.nome === "Beatriz Sousa Ausente");
    expect(beatriz?.possivelSaida).toBe(true);
    expect(beatriz?.semaforo).toBe("vermelho");
  });

  test("Chrome ausente: fonte inacessível com o motivo do navegador, ninguém vira possível saída", async () => {
    const depsSemChrome: Dependencias = {
      ...deps,
      raspar: async () => { throw new ScrapeError("https://orgao.gov.br", MOTIVO_NAVEGADOR_AUSENTE); },
      extrairComposicao: async () => [],
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsSemChrome);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.fonteUrl).toBe("https://orgao.gov.br");
    expect(g.erroFonte).toBe(MOTIVO_NAVEGADOR_AUSENTE);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado" && !c.possivelSaida)).toBe(true);
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
      resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [], fontesIndividuais: [], sugestoes: [] }),
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
      resolverFonte: () => ({ fontes: [], fontesIndividuais: [], sugestoes: ["Conselho Nacional de Justiça (CNJ)"] }),
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

  test("resumo conta possível saída e contatos de grupo sem fonte, separados do vermelho", async () => {
    // Arrange: "Pessoa Que Saiu" está no grupo com fonte mas não na página; "Pessoa Sem Fonte" está em grupo sem URL.
    const lista: ContatoPlanilha[] = [
      ...contatos,
      { nome: "Pessoa Que Saiu Daqui", grupo: "ORG", ...CADASTRO_OK },
    ];

    // Act
    const r = await analisar("c.xlsx", lista, deps);

    // Assert
    expect(r.resumo.possivelSaida).toBe(1);
    expect(r.resumo.contatosSemFonte).toBe(1);
    expect(r.resumo.vermelho).toBe(2);
  });

  test("grupo leva o responsável que o catálogo informa", async () => {
    // Arrange
    const comResponsavel: Dependencias = {
      ...deps,
      resolverFonte: (grupo) => ({ ...deps.resolverFonte(grupo), responsavel: "Fulana de Tal" }),
    };

    // Act
    const r = await analisar("c.xlsx", contatos, comResponsavel);

    // Assert: nos dois caminhos (com fonte e sem fonte)
    expect(r.grupos[0].responsavel).toBe("Fulana de Tal");
    expect(r.grupos[1].responsavel).toBe("Fulana de Tal");
  });

  test("sem responsável no catálogo, o campo fica ausente", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    expect(r.grupos[0].responsavel).toBeUndefined();
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
      fontesIndividuais: [],
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

  test("a fonte primária cai (erro): a secundária ainda confirma quem ela publica, e ninguém vira saída", async () => {
    // Invariante: toda fonte que contribuiu compõe o grupo — jogar fora a secundária
    // oficial descartaria Camada 1 de verdade. O que a falha suspende é a CONCLUSÃO:
    // Wellington Dias, publicado pela secundária, sai verde; Weverton, que só a primária
    // publica, fica indeterminado, nunca possível saída (regra de ouro).
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
    // A fonte que falhou é identificada: sem o prefixo, "HTTP 403" não diz qual página caiu.
    expect(g.erroFonte).toBe(`${PRIMARIA}: HTTP 403`);
    expect(g.contatos.find((c) => c.contato.nome === "Wellington Dias")?.semaforo).toBe("verde");
    expect(g.contatos.find((c) => c.contato.nome === "Weverton")?.semaforo).toBe("indeterminado");
    expect(g.contatos.some((c) => c.possivelSaida)).toBe(false);
  });

  test("a fonte primária volta vazia (200 sem gente): mesma regra, quem ela publicava fica indeterminado", async () => {
    // Espelho do teste acima com um scrape que teve sucesso (sem lançar) mas não achou
    // ninguém — o caso real do TCU/JS e o da página que mudou de estrutura. Na PRIMÁRIA
    // isso é falha: é a lista que define quem é do grupo, e o spec de 2026-09-24 promete
    // indeterminado, nunca saída falsa. (Numa fonte secundária, vazio é estado normal —
    // ver o teste "a fonte secundária responde sem ninguém".)
    const depsPrimariaVazia: Dependencias = {
      ...depsSenadores,
      raspar: async (fonte) =>
        fonte.url === PRIMARIA
          ? { url: PRIMARIA, textoLimpo: "", destaques: [], pessoas: [] }
          : {
              url: SECUNDARIA,
              textoLimpo: "Wellington Dias — PI",
              destaques: [],
              pessoas: [{ nome: "Wellington Dias", uf: "PI", origem: "pagina" as const }],
            },
    };
    const r = await analisar("c.xlsx", senadores, depsPrimariaVazia);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.erroFonte).toBe(`${PRIMARIA}: não trouxe ninguém`);
    expect(g.contatos.find((c) => c.contato.nome === "Wellington Dias")?.semaforo).toBe("verde");
    expect(g.contatos.find((c) => c.contato.nome === "Weverton")?.semaforo).toBe("indeterminado");
    expect(g.contatos.some((c) => c.possivelSaida)).toBe(false);
  });

  test("a fonte secundária cai (erro): o grupo segue comparado com a primária e o erro é atribuído a ela", async () => {
    const depsSecundariaQuebrada: Dependencias = {
      ...depsSenadores,
      raspar: async (fonte) => {
        if (fonte.url === PRIMARIA) {
          return {
            url: PRIMARIA,
            textoLimpo: "Weverton — MA",
            destaques: [],
            pessoas: [{ nome: "Weverton", uf: "MA", origem: "pagina" as const }],
          };
        }
        throw new Error("HTTP 403");
      },
    };
    const r = await analisar("c.xlsx", senadores, depsSecundariaQuebrada);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    // O rótulo da fonte que caiu entra no motivo — sem ele, "HTTP 403" parece falha da primária.
    expect(g.erroFonte).toBe("fora de exercício: HTTP 403");
    expect(g.contatos.find((c) => c.contato.nome === "Weverton")?.semaforo).toBe("verde");
    // LEITURA PARCIAL (uma fonte respondeu, outra não): era o "limite conhecido" desta
    // branch e é o defeito que esta correção fecha. Com a secundária fora do ar, quem só
    // ela publica (titular afastado) não pode ser dado como saída — fica indeterminado,
    // com a ressalva na observação. Só esta situação suspende o veredito: composição
    // vinda só da IA continua apontando saída (ver o teste da fronteira, acima).
    const wd = g.contatos.find((c) => c.contato.nome === "Wellington Dias");
    expect(wd?.possivelSaida).toBeUndefined();
    expect(wd?.semaforo).toBe("indeterminado");
    expect(wd?.observacao).toMatch(/não respondeu/);
  });

  test("a fonte secundária responde sem ninguém: a detecção de saída continua de pé, com a ressalva", async () => {
    // Estado NORMAL da lista de "fora de exercício": ninguém afastado hoje. Não é falha, e
    // tratá-la como falha desligaria a detecção de saída dos três mailings de Senadores
    // sem ninguém perceber. A página respondeu — a ressalva diz isso, não que é ilegível.
    const depsSecundariaVazia: Dependencias = {
      ...depsSenadores,
      raspar: async (fonte) =>
        fonte.url === PRIMARIA
          ? {
              url: PRIMARIA,
              textoLimpo: "Weverton — MA",
              destaques: [],
              pessoas: [{ nome: "Weverton", uf: "MA", origem: "pagina" as const }],
            }
          : { url: SECUNDARIA, textoLimpo: "", destaques: [], pessoas: [] },
    };
    const r = await analisar("c.xlsx", senadores, depsSecundariaVazia);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    // Ressalva honesta: a fonte respondeu e não trouxe ninguém.
    expect(g.erroFonte).toBe("fora de exercício: não trouxe ninguém");
    expect(g.contatos.find((c) => c.contato.nome === "Weverton")?.semaforo).toBe("verde");
    // E o veredito de saída continua funcionando: quem não está em nenhuma das duas listas
    // é possível saída, como seria se a secundária nem existisse.
    expect(g.contatos.find((c) => c.contato.nome === "Wellington Dias")?.possivelSaida).toBe(true);
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

describe("Senadores de ponta a ponta (fixtures das duas páginas reais)", () => {
  const EM_EXERCICIO = "https://www25.senado.leg.br/web/senadores/em-exercicio";
  const FORA = "https://www25.senado.leg.br/web/senadores/fora-de-exercicio";
  const html = (arquivo: string) =>
    readFileSync(join(__dirname, "fixtures", arquivo), "utf8");

  const grupoMA = CATALOGO.find((g) => g.nome === "Senadores (Maranhão ao Piauí)")!;
  // Desde a planilha de 23/10 o catálogo não traz mais a segunda fonte nos Senadores (virou o
  // grupo "Senadores fora de exercício"). O mecanismo de segunda fonte continua valendo e é
  // testado aqui com a entrada como era no catálogo até 23/10.
  const SEGUNDA_FONTE: FonteCatalogo = {
    url: FORA,
    ativo: true,
    rotulo: "fora de exercício",
    propoeInclusao: true,
    tabela: {
      colunas: { nome: 0, uf: 2, motivo: 3 },
      secoes: ["Assunção de cargo", "Licença com convocação de suplente"],
    },
  };

  const deps: Dependencias = {
    resolverFonte: () => ({
      grupoCanonico: grupoMA.nome,
      fontes: [...grupoMA.fontes.filter((f) => f.ativo), SEGUNDA_FONTE],
      ufs: grupoMA.ufs,
      fontesIndividuais: [],
      sugestoes: [],
    }),
    raspar: async (fonte) =>
      extrairTabela(
        html(fonte.url === FORA ? "senado-fora-de-exercicio.html" : "senado-em-exercicio.html"),
        fonte.url,
        fonte.tabela!,
      ),
    extrairComposicao: async () => [],
  };

  const contatos: ContatoPlanilha[] = [
    { nome: "Weverton", grupo: grupoMA.nome, ...CADASTRO_OK },
    { nome: "Wellington Dias", grupo: grupoMA.nome, ...CADASTRO_OK },
  ];

  test("senador de nome de uma palavra não é possível saída", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    const weverton = r.grupos[0].contatos.find((c) => c.contato.nome === "Weverton");
    expect(weverton?.possivelSaida).toBeUndefined();
    expect(weverton?.semaforo).toBe("verde");
  });

  test("titular afastado casa pela segunda fonte e carrega o motivo", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    const wd = r.grupos[0].contatos.find((c) => c.contato.nome === "Wellington Dias");
    expect(wd?.semaforo).toBe("verde");
    expect(wd?.observacao).toBe("fora de exercício — Ocupação de cargo de ministro/secretário");
  });

  test("titular afastado que falta na planilha vira novo, e só na faixa de UF do grupo", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], deps);
    expect(r.grupos[0].novos.map((n) => n.nome).sort()).toEqual([
      "Ana Paula Lobato",
      "Diego Tavares",
      "Wellington Dias",
    ]);
  });

  test("suplente, falecido e renunciante nunca entram no grupo", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    const nomes = r.grupos[0].novos.map((n) => n.nome);
    expect(nomes).not.toContain("Ney Suassuna");
    expect(nomes).not.toContain("Arolde de Oliveira");
    expect(nomes).not.toContain("Flávio Dino");
  });

  test("Eduardo Girão (CE) não é proposto no grupo de Maranhão ao Piauí", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    expect(r.grupos[0].novos.map((n) => n.nome)).not.toContain("Eduardo Girão");
  });

  test("grupo de uma fonte só continua se comportando como antes", async () => {
    const umaFonte: Dependencias = {
      ...deps,
      resolverFonte: () => ({
        grupoCanonico: grupoMA.nome,
        fontes: [grupoMA.fontes[0]],
        ufs: grupoMA.ufs,
        fontesIndividuais: [],
        sugestoes: [],
      }),
    };
    const r = await analisar("c.xlsx", contatos, umaFonte);
    const g = r.grupos[0];
    expect(g.fonteUrl).toBe(EM_EXERCICIO);
    expect(g.erroFonte).toBeUndefined();
    // Sem a segunda fonte, o titular afastado volta a ser possível saída — é o
    // comportamento de hoje, e o que a fonte nova existe para corrigir.
    expect(g.contatos.find((c) => c.contato.nome === "Wellington Dias")?.possivelSaida).toBe(true);
    expect(g.novos).toEqual([]);
  });
});

describe("auditoria de endereço anexada ao resultado", () => {
  const enderecos = [
    {
      contatoId: "7",
      nome: "Ana Maria Política Completa",
      logradouro: "Praça dos Três Poderes",
      numero: "S/N",
      bairro: "Zona Cívico-Administrativa",
      cidade: "Brasília",
      uf: "DF",
      cep: "70160-900",
      prioritario: true,
    },
  ];

  test("sem planilha de endereços, a situação é sem_base e o resumo conta zero", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], deps);
    expect(r.grupos[0].contatos[0].endereco?.situacao).toBe("sem_base");
    expect(r.resumo.enderecosAConfirmar).toBe(0);
  });

  test("com a planilha, o contato casado pelo Id recebe o endereço", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[0], id: "7" }], deps, enderecos);
    const e = r.grupos[0].contatos[0].endereco;
    expect(e?.situacao).toBe("completo");
    expect(e?.formatado).toContain("70160-900 Brasília - DF");
    expect(r.resumo.enderecosAConfirmar).toBe(0);
  });

  test("contato sem endereço na base conta no resumo como a confirmar", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[0], id: "999" }], deps, enderecos);
    expect(r.grupos[0].contatos[0].endereco?.situacao).toBe("pendente");
    expect(r.resumo.enderecosAConfirmar).toBe(1);
  });

  test("a auditoria não muda o semáforo nem cria divergência", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[0], id: "999" }], deps, enderecos);
    const c = r.grupos[0].contatos[0];
    expect(c.semaforo).toBe("verde");
    expect(c.camposDivergentes).toEqual([]);
    expect(c.possivelSaida).toBeUndefined();
  });

  test("grupo sem fonte também recebe a auditoria de endereço", async () => {
    const r = await analisar("c.xlsx", [{ ...contatos[1], id: "7" }], deps, enderecos);
    const c = r.grupos[0].contatos[0];
    expect(r.grupos[0].semFonte).toBe(true);
    expect(c.endereco?.situacao).toBe("completo");
  });

  test("grupo com fonte inacessível também recebe a auditoria de endereço", async () => {
    const depsQuebrado: Dependencias = {
      ...deps,
      raspar: async () => {
        throw new Error("timeout");
      },
    };
    const r = await analisar("c.xlsx", [{ ...contatos[0], id: "7" }], depsQuebrado, enderecos);
    const c = r.grupos[0].contatos[0];
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(c.semaforo).toBe("indeterminado");
    expect(c.endereco?.situacao).toBe("completo");
  });
});

describe("TCU de ponta a ponta (fixture real da página montada pelo navegador)", () => {
  const URL_TCU = "https://portal.tcu.gov.br/autoridades";
  const GRUPO = "Ministros do TCU";
  const paginaCompleta = readFileSync(join(__dirname, "fixtures", "tcu-autoridades.html"), "utf8");
  /** Os dois blocos de ministros são os únicos `article` com `p-4`; os cartões do menu não têm. */
  const BLOCO_DE_MINISTROS = /<article class="bg-surface-primary rounded-2xl p-4">[\s\S]*?<\/article>/g;
  /** A página pela metade: a requisição da lista não voltou, só o menu e os títulos. */
  const paginaSemLista = paginaCompleta.replace(BLOCO_DE_MINISTROS, "");

  const depsTcu = (html: string): Dependencias => ({
    resolverFonte: () => ({
      grupoCanonico: GRUPO,
      fontes: [{ url: URL_TCU, ativo: true, navegador: true }],
      fontesIndividuais: [],
      sugestoes: [],
    }),
    raspar: async () => extrairConteudo(html, URL_TCU),
    extrairComposicao: async () => [],
  });

  const contato = (nome: string, cargo?: string): ContatoPlanilha => ({
    nome,
    grupo: GRUPO,
    ...(cargo ? { cargo } : {}),
    ...CADASTRO_OK,
  });

  test("a fixture sem a lista perde exatamente os dois blocos de ministros", () => {
    expect(paginaCompleta.match(BLOCO_DE_MINISTROS)).toHaveLength(2);
    expect(paginaSemLista).not.toMatch(/Walton Alencar/);
    expect(paginaSemLista).toMatch(/Comissão Permanente de Jurisprudência/);
  });

  test("página pela metade (só o menu) é leitura suspeita: grupo indeterminado, ninguém vira saída", async () => {
    // Arrange: quatro contatos que ESTÃO na página completa. Sem a lista, o menu ("Primeira
    // Câmara", "Comissão Permanente de Regimento") ainda forma uma composição "real".
    const contatos = [
      contato("Walton Alencar Rodrigues"),
      contato("Vital do Rêgo"),
      contato("Jorge Oliveira"),
      contato("Benjamin Zymler"),
    ];

    // Act
    const r = await analisar("c.xlsx", contatos, depsTcu(paginaSemLista));

    // Assert
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.fonteUrl).toBe(URL_TCU);
    expect(g.erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado")).toBe(true);
    expect(g.contatos.some((c) => c.possivelSaida)).toBe(false);
    expect(g.novos).toEqual([]);
    expect(r.resumo.possivelSaida).toBe(0);
  });

  test("grupo de um contato só fica fora da regra: a ausência ainda é possível saída", async () => {
    // Arrange
    const contatos = [contato("Walton Alencar Rodrigues")];

    // Act
    const r = await analisar("c.xlsx", contatos, depsTcu(paginaSemLista));

    // Assert
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeFalsy();
    expect(g.contatos[0].possivelSaida).toBe(true);
  });

  test("grupo sem URL cuja IA não casa ninguém cai em 'sem fonte', sem saída e sem link quebrado", async () => {
    // Arrange: grupo sem URL; a IA devolve gente que não é nenhum dos contatos. A leitura é
    // suspeita, mas sem URL não há página a conferir: o caminho é o de "cadastrar fonte".
    const depsIa: Dependencias = {
      resolverFonte: () => ({ grupoCanonico: GRUPO, fontes: [], fontesIndividuais: [], sugestoes: [] }),
      raspar: async () => {
        throw new Error("não deveria raspar");
      },
      extrairComposicao: async () => [
        { nome: "Fulano de Tal Silva", cargo: "Ministro", origem: "conhecimento" },
      ],
    };
    const contatos = [contato("Walton Alencar Rodrigues"), contato("Benjamin Zymler")];

    // Act
    const r = await analisar("c.xlsx", contatos, depsIa);

    // Assert
    const g = r.grupos[0];
    expect(g.semFonte).toBe(true);
    expect(g.fonteInacessivel).toBeFalsy();
    expect(g.fonteUrl).not.toBe(URL_PESQUISA_AMPLA);
    expect(g.viaPesquisaAmpla).toBeFalsy();
    expect(g.contatos.some((c) => c.possivelSaida)).toBe(false);
    expect(g.novos).toEqual([]);
  });

  test("página completa: quem está casa, e só quem falta vira possível saída", async () => {
    // Arrange
    const contatos = [
      contato("Walton Alencar Rodrigues", "Ministro do Tribunal de Contas da União"),
      contato("Vital do Rêgo", "Presidente do Tribunal de Contas da União"),
      contato("Jorge Oliveira"),
      contato("Aroldo Cedraz"),
    ];

    // Act
    const r = await analisar("c.xlsx", contatos, depsTcu(paginaCompleta));

    // Assert
    const g = r.grupos[0];
    const de = (nome: string) => g.contatos.find((c) => c.contato.nome === nome);
    expect(g.viaPesquisaAmpla).toBeFalsy();
    expect(g.fonteInacessivel).toBeFalsy();
    expect(g.erroFonte).toBeUndefined();
    expect(de("Walton Alencar Rodrigues")?.semaforo).toBe("verde");
    expect(de("Vital do Rêgo")?.possivelSaida).toBeFalsy();
    expect(de("Jorge Oliveira")?.possivelSaida).toBeFalsy();
    expect(de("Aroldo Cedraz")?.possivelSaida).toBe(true);
    expect(de("Aroldo Cedraz")?.semaforo).toBe("vermelho");
  });
});

describe("memória de leitura por página (spec 2026-10-20 §5.1)", () => {
  const AGORA = new Date("2026-10-20T12:00:00.000Z");
  const LIDA_EM_16 = "2026-10-16T15:50:29.000Z";
  const URL = "https://orgao.gov.br";
  const guardada = (conteudo: ConteudoFonte = fonte, lidaEm = LIDA_EM_16): LeituraGuardada => ({ url: conteudo.url, lidaEm, conteudo });
  const paginaCom = (nomes: string[]): ConteudoFonte => ({ url: URL, textoLimpo: nomes.join(". "), destaques: [], pessoas: nomes.map((nome) => ({ nome, cargo: "Ministro" })) });
  // Nomes sem token em comum: `pontuarPessoa` casaria "Pessoa Número Um" com "Pessoa Número Dois".
  const dez = ["Alberto Caminho Verde", "Beatriz Lagoa Azul", "Carlos Monte Claro", "Dalva Serra Branca", "Eduardo Vale Fundo", "Fátima Rio Manso", "Gustavo Campo Largo", "Helena Praia Grande", "Ivo Morro Alto", "Joana Bosque Novo"];
  const dezContatos: ContatoPlanilha[] = dez.map((nome) => ({ nome, grupo: "ORG", ...CADASTRO_OK }));

  function comMemoria(raspar: Dependencias["raspar"], leituras: LeiturasGuardadas, extra: Partial<Dependencias> = {}): Dependencias {
    return { ...deps, raspar, leiturasAnteriores: leituras, agora: () => AGORA, ...extra };
  }
  const erro403: Dependencias["raspar"] = async () => { throw new Error("HTTP 403"); };
  const semNinguem: Dependencias["raspar"] = async () => ({ url: URL, textoLimpo: "", destaques: [], pessoas: [] });

  test("primária com erro e memória válida → grupo lido, reaproveitada com o motivo, IA não chamada, contato verde", async () => {
    let iaChamada = false;
    const r = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, { [URL]: guardada() }, { extrairComposicao: async () => { iaChamada = true; return []; } }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.viaPesquisaAmpla).toBeUndefined();
    expect(g.reaproveitada).toEqual({ url: URL, lidaEm: LIDA_EM_16, motivo: "HTTP 403" });
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].origem).toBe("oficial");
    expect(iaChamada).toBe(false);
    expect(r.resumo.gruposReaproveitados).toBe(1);
    expect(r.resumo.gruposFonteInacessivel).toBe(0);
  });

  test("primária com erro e memória vencida (8 dias) → comportamento de hoje: IA sozinha e via IA; sem IA, inacessível", async () => {
    const vencida = { [URL]: guardada(fonte, "2026-10-12T11:00:00.000Z") };
    const comIa = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, vencida, { extrairComposicao: async () => [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" }] }));
    expect(comIa.grupos[0].viaPesquisaAmpla).toBe(true);
    expect(comIa.grupos[0].reaproveitada).toBeUndefined();
    const semIa = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, vencida));
    expect(semIa.grupos[0].fonteInacessivel).toBe(true);
    expect(semIa.resumo.gruposReaproveitados).toBe(0);
  });

  test("primária que respondeu sem ninguém e memória válida → reaproveitada com 'não trouxe ninguém'", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], comMemoria(semNinguem, { [URL]: guardada() }));
    expect(r.grupos[0].reaproveitada).toMatchObject({ motivo: "não trouxe ninguém" });
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("leitura parcial (2 de 10) com memória que casa os 10 → reaproveitada com o motivo, todos verdes", async () => {
    const hoje = async () => paginaCom(dez.slice(0, 2));
    const r = await analisar("c.xlsx", dezContatos, comMemoria(hoje, { [URL]: guardada(paginaCom(dez)) }));
    const g = r.grupos[0];
    expect(g.reaproveitada).toEqual({ url: URL, lidaEm: LIDA_EM_16, motivo: "página casou 2 de 10 contatos" });
    expect(g.contatos.every((c) => c.semaforo === "verde")).toBe(true);
  });

  test("leitura parcial sem memória → como hoje: 2 verdes e 8 possíveis saídas", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 2)), {}));
    const g = r.grupos[0];
    expect(g.reaproveitada).toBeUndefined();
    expect(g.contatos.filter((c) => c.possivelSaida).length).toBe(8);
  });

  test("leitura parcial com memória que não casa melhor → fica a de hoje", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 2)), { [URL]: guardada(paginaCom(dez.slice(0, 2))) }));
    expect(r.grupos[0].reaproveitada).toBeUndefined();
  });

  test("9 de 10 com memória → a leitura de hoje vale; quem falta é possível saída", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 9)), { [URL]: guardada(paginaCom(dez)) }));
    const g = r.grupos[0];
    expect(g.reaproveitada).toBeUndefined();
    expect(g.contatos.filter((c) => c.possivelSaida).length).toBe(1);
  });

  test("grupo de um contato nunca é parcial: página de hoje sem ele e memória com ele → possível saída", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], comMemoria(async () => paginaCom(["Outra Pessoa Qualquer"]), { [URL]: guardada() }));
    expect(r.grupos[0].reaproveitada).toBeUndefined();
    expect(r.grupos[0].contatos[0].possivelSaida).toBe(true);
  });

  test("guardada que não casa ninguém de um grupo com 2+ contatos cai na leitura suspeita, nunca saída em massa", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(erro403, { [URL]: guardada(paginaCom(["Fulano Estranho", "Beltrano Estranho"])) }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado")).toBe(true);
  });

  test("leituras de saída: a boa de hoje com a data de hoje; a parcial não entra; a reaproveitada mantém a data original; vencida é podada", async () => {
    const boa = await analisar("c.xlsx", [contatos[0]], comMemoria(async () => fonte, { "https://nao-visitada": guardada({ ...fonte, url: "https://nao-visitada" }), "https://vencida": guardada({ ...fonte, url: "https://vencida" }, "2026-10-01T00:00:00.000Z") }));
    expect(boa.leituras?.[URL]).toEqual({ url: URL, lidaEm: AGORA.toISOString(), conteudo: fonte });
    expect(boa.leituras?.["https://nao-visitada"]).toBeDefined();
    expect(boa.leituras?.["https://vencida"]).toBeUndefined();

    const parcial = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 2)), {}));
    expect(parcial.leituras?.[URL]).toBeUndefined();

    const reaproveitada = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, { [URL]: guardada() }));
    expect(reaproveitada.leituras?.[URL].lidaEm).toBe(LIDA_EM_16);
  });

  test("sem memória injetada, leituras sai só com as boas de hoje e nada é reaproveitado", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], { ...deps, agora: () => AGORA });
    expect(Object.keys(r.leituras ?? {})).toEqual([URL]);
    const caido = await analisar("c.xlsx", [contatos[0]], { ...deps, raspar: erro403 });
    expect(caido.grupos[0].fonteInacessivel).toBe(true);
  });
  test("guardada sem ninguém não serve à primária: com IA, o grupo segue via IA como antes; sem IA, inacessível", async () => {
    const vazia: ConteudoFonte = { url: URL, textoLimpo: "", destaques: [], pessoas: [] };
    const comIa = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, { [URL]: guardada(vazia) }, { extrairComposicao: async () => [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" }] }));
    expect(comIa.grupos[0].viaPesquisaAmpla).toBe(true);
    expect(comIa.grupos[0].reaproveitada).toBeUndefined();
    const semIa = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, { [URL]: guardada(vazia) }));
    expect(semIa.grupos[0].fonteInacessivel).toBe(true);
  });
});

describe("memória de leitura com duas fontes no grupo (§5.1 passo 6)", () => {
  const PRIMARIA = "https://senado.leg.br/em-exercicio";
  const SECUNDARIA = "https://senado.leg.br/fora-de-exercicio";
  const AGORA = new Date("2026-10-20T12:00:00.000Z");
  const paginaPrimaria: ConteudoFonte = { url: PRIMARIA, textoLimpo: "Weverton — MA", destaques: [], pessoas: [{ nome: "Weverton", uf: "MA" }] };
  const paginaSecundaria: ConteudoFonte = { url: SECUNDARIA, textoLimpo: "Wellington Dias — PI", destaques: [], pessoas: [{ nome: "Wellington Dias", uf: "PI" }] };
  const senadores: ContatoPlanilha[] = [
    { nome: "Weverton", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
    { nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
    { nome: "Fulano Que Saiu", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
  ];
  const depsSenadores: Dependencias = {
    resolverFonte: () => ({
      grupoCanonico: "Senadores (Maranhão ao Piauí)",
      fontes: [{ url: PRIMARIA, ativo: true }, { url: SECUNDARIA, ativo: true, rotulo: "fora de exercício", propoeInclusao: true }],
      ufs: ["MA", "PI"], fontesIndividuais: [], sugestoes: [],
    }),
    raspar: async (f) => { if (f.url === SECUNDARIA) throw new Error("HTTP 403"); return paginaPrimaria; },
    extrairComposicao: async () => [],
    leiturasAnteriores: { [SECUNDARIA]: { url: SECUNDARIA, lidaEm: "2026-10-16T15:50:29.000Z", conteudo: paginaSecundaria } },
    agora: () => AGORA,
  };

  test("secundária com erro e memória → anotação em erroFonte, grupo não reaproveitado, quem só constava nela casa, e a saída continua de pé", async () => {
    const r = await analisar("c.xlsx", senadores, depsSenadores);
    const g = r.grupos[0];
    expect(g.reaproveitada).toBeUndefined();
    expect(g.erroFonte).toBe("fora de exercício: leitura de 16/10 reaproveitada (HTTP 403)");
    expect(g.contatos.map((c) => c.semaforo)).toEqual(["verde", "verde", "vermelho"]);
    expect(g.contatos[2].possivelSaida).toBe(true);
    expect(r.resumo.gruposReaproveitados).toBe(0);
  });
});

describe("memória por forma de extração: a mesma URL lida como texto e como tabela (regressão)", () => {
  // Caso real: "Presidente do Senado" lê em-exercicio como texto; os grupos de Senadores leem a
  // mesma URL como tabela, a única forma que traz os senadores de nome de uma palavra.
  const URL_SENADO = "https://senado.leg.br/em-exercicio";
  const TABELA = { colunas: { nome: 0, uf: 2 } };
  const CHAVE_TABELA = chaveDaLeitura(URL_SENADO, { tabela: TABELA });
  const AGORA = new Date("2026-10-21T12:00:00.000Z");
  const LIDA_EM = "2026-10-19T12:00:00.000Z";
  const comoTexto: ConteudoFonte = { url: URL_SENADO, textoLimpo: "Davi Exemplo Presidente\nAna Senadora Exemplo", destaques: [], pessoas: [{ nome: "Davi Exemplo Presidente" }, { nome: "Ana Senadora Exemplo" }] };
  const comoTabela: ConteudoFonte = { url: URL_SENADO, textoLimpo: "Weverton\nAna Senadora Exemplo", destaques: [], pessoas: [{ nome: "Weverton", uf: "MA" }, { nome: "Ana Senadora Exemplo", uf: "MA" }] };
  const contatosSenado: ContatoPlanilha[] = [
    { nome: "Davi Exemplo Presidente", grupo: "PRES", ...CADASTRO_OK },
    { nome: "Weverton", grupo: "SEN", ...CADASTRO_OK },
    { nome: "Ana Senadora Exemplo", grupo: "SEN", ...CADASTRO_OK },
  ];
  const resolverSenado: Dependencias["resolverFonte"] = (grupo) =>
    grupo === "PRES"
      ? { grupoCanonico: "PRES", fontes: [{ url: URL_SENADO, ativo: true }], fontesIndividuais: [], sugestoes: [] }
      : { grupoCanonico: "SEN", fontes: [{ url: URL_SENADO, ativo: true, tabela: TABELA }], fontesIndividuais: [], sugestoes: [] };
  const depsSenado = (raspar: Dependencias["raspar"], leituras: LeiturasGuardadas = {}): Dependencias => ({
    resolverFonte: resolverSenado,
    raspar,
    extrairComposicao: async () => [],
    leiturasAnteriores: leituras,
    agora: () => AGORA,
  });
  const lerTudo: Dependencias["raspar"] = async (f) => (f.tabela ? comoTabela : comoTexto);
  const tabelaCaida: Dependencias["raspar"] = async (f) => {
    if (f.tabela) throw new Error("HTTP 503");
    return comoTexto;
  };

  test("a memória sai com duas entradas distintas, a de texto sob a URL e a de tabela sob a sua chave", async () => {
    const r = await analisar("c.xlsx", contatosSenado, depsSenado(lerTudo));
    expect(Object.keys(r.leituras ?? {}).sort()).toEqual([URL_SENADO, CHAVE_TABELA].sort());
    expect(r.leituras?.[URL_SENADO]?.conteudo).toEqual(comoTexto);
    expect(r.leituras?.[CHAVE_TABELA]?.conteudo).toEqual(comoTabela);
    expect(r.leituras?.[CHAVE_TABELA]?.url).toBe(URL_SENADO);
  });

  test("primária de tabela caída: reaproveita a leitura de tabela, e o senador de nome de uma palavra não vira possível saída", async () => {
    const memoria: LeiturasGuardadas = {
      [URL_SENADO]: { url: URL_SENADO, lidaEm: LIDA_EM, conteudo: comoTexto },
      [CHAVE_TABELA]: { url: URL_SENADO, lidaEm: LIDA_EM, conteudo: comoTabela },
    };
    const r = await analisar("c.xlsx", contatosSenado, depsSenado(tabelaCaida, memoria));
    const sen = r.grupos.find((g) => g.grupo === "SEN")!;
    expect(sen.reaproveitada).toEqual({ url: URL_SENADO, lidaEm: LIDA_EM, motivo: "HTTP 503" });
    const weverton = sen.contatos.find((c) => c.contato.nome === "Weverton")!;
    expect(weverton.possivelSaida).toBeFalsy();
    expect(weverton.semaforo).toBe("verde");
    // A leitura de texto de hoje não sobrescreve a de tabela reaproveitada.
    expect(r.leituras?.[CHAVE_TABELA]?.conteudo).toEqual(comoTabela);
    expect(r.leituras?.[URL_SENADO]?.lidaEm).toBe(AGORA.toISOString());
  });

  test("memória antiga só com a leitura em texto: o grupo de tabela não a reaproveita e ninguém vira possível saída", async () => {
    const memoria: LeiturasGuardadas = { [URL_SENADO]: { url: URL_SENADO, lidaEm: LIDA_EM, conteudo: comoTexto } };
    const r = await analisar("c.xlsx", contatosSenado, depsSenado(tabelaCaida, memoria));
    const sen = r.grupos.find((g) => g.grupo === "SEN")!;
    expect(sen.reaproveitada).toBeUndefined();
    expect(sen.fonteInacessivel).toBe(true);
    expect(sen.contatos.some((c) => c.possivelSaida)).toBe(false);
  });
});

/** Raspador por URL: conteúdo, ou string = erro com esse motivo; URL fora do mapa também é erro. */
function rasparDe(mapa: Record<string, ConteudoFonte | string>): Dependencias["raspar"] {
  return async (f) => {
    const v = mapa[f.url];
    if (v === undefined) throw new Error(`sem página para ${f.url}`);
    if (typeof v === "string") throw new Error(v);
    return v;
  };
}

describe("URL alternativa (spec 2026-10-23 §3.3)", () => {
  const ALT = "https://orgao.gov.br/alternativa";
  const depsAlt = (mapa: Record<string, ConteudoFonte | string>, extra: Partial<Dependencias> = {}): Dependencias => ({
    ...deps,
    resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true, urlAlternativa: ALT }], fontesIndividuais: [], sugestoes: [] }),
    raspar: rasparDe(mapa),
    ...extra,
  });
  test("principal com erro e alternativa boa: grupo lido pela alternativa, fonteUrl do grupo é a principal, do contato é a alternativa", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: { ...fonte, url: ALT } }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.fonteUrl).toBe("https://orgao.gov.br");
    expect(g.alternativa).toEqual({ url: ALT, urlPrincipal: "https://orgao.gov.br", motivoPrincipal: "HTTP 404" });
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].fonteUrl).toBe(ALT);
  });
  test("principal sem ninguém também abre a alternativa, com o motivo 'não trouxe ninguém'", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": { ...fonte, pessoas: [] }, [ALT]: { ...fonte, url: ALT } }));
    expect(r.grupos[0].alternativa?.motivoPrincipal).toBe(MOTIVO_SEM_NINGUEM);
  });
  test("principal boa: a alternativa não é lida", async () => {
    const raspar = vi.fn(rasparDe({ "https://orgao.gov.br": fonte, [ALT]: { ...fonte, url: ALT } }));
    await analisar("c.xlsx", [contatos[0]], depsAlt({}, { raspar }));
    expect(raspar.mock.calls.map((c) => c[0].url)).toEqual(["https://orgao.gov.br"]);
  });
  test("as duas falham: inacessível, com os dois motivos", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: "HTTP 500 (3 tentativas)" }));
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(r.grupos[0].erroFonte).toBe("HTTP 404 · URL alternativa: HTTP 500 (3 tentativas)");
  });
  test("memória da alternativa serve quando as duas falham: reaproveitada com url = principal, leitura guardada sob a alternativa", async () => {
    const guardada: LeituraGuardada = { url: ALT, lidaEm: "2026-10-19T12:00:00.000Z", conteudo: { ...fonte, url: ALT } };
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: "HTTP 500" }, { leiturasAnteriores: { [ALT]: guardada }, agora: () => new Date("2026-10-21T12:00:00.000Z") }));
    const g = r.grupos[0];
    expect(g.reaproveitada).toEqual({ url: "https://orgao.gov.br", lidaEm: guardada.lidaEm, motivo: "HTTP 404 · URL alternativa: HTTP 500" });
    expect(r.leituras?.[ALT]?.lidaEm).toBe(guardada.lidaEm);
    expect(Object.keys(r.leituras ?? {})).toEqual([ALT]);
    // A proveniência do contato é a página de onde o conteúdo guardado veio.
    expect(g.contatos[0].fonteUrl).toBe(ALT);
  });
  test("leitura boa pela alternativa entra na memória sob a URL da alternativa", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsAlt({ "https://orgao.gov.br": "HTTP 404", [ALT]: { ...fonte, url: ALT } }));
    expect(Object.keys(r.leituras ?? {})).toEqual([ALT]);
  });
  test("secundária lida pela alternativa: compõe o grupo e vira anotação em erroFonte, sem alternativa no grupo", async () => {
    const FORA = "https://orgao.gov.br/fora";
    const FORA_ALT = "https://orgao.gov.br/fora-alternativa";
    const r = await analisar("c.xlsx", [contatos[0]], {
      ...deps,
      resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true }, { url: FORA, ativo: true, rotulo: "fora", urlAlternativa: FORA_ALT }], fontesIndividuais: [], sugestoes: [] }),
      raspar: rasparDe({ "https://orgao.gov.br": fonte, [FORA]: "HTTP 404", [FORA_ALT]: { ...fonte, url: FORA_ALT, pessoas: [{ nome: "Outra Pessoa Afastada", cargo: "Senadora", origem: "pagina" }] } }),
    });
    const g = r.grupos[0];
    expect(g.erroFonte).toBe("fora: lida pela URL alternativa (HTTP 404)");
    expect(g.alternativa).toBeUndefined();
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(r.falhas).toEqual({ [FORA]: expect.objectContaining({ coletas: 1, motivo: "HTTP 404" }) });
  });
});

describe("falhas por URL em coletas seguidas (spec 2026-10-23 §3.4)", () => {
  const agora = () => new Date("2026-10-21T12:00:00.000Z");
  test("URL que falhou entra em falhas com coletas 1; o resumo não conta antes de 2", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], { ...deps, raspar: async () => { throw new ScrapeError("https://orgao.gov.br", "HTTP 404"); }, agora });
    expect(r.falhas).toEqual({ "https://orgao.gov.br": { desde: agora().toISOString(), coletas: 1, motivo: "HTTP 404" } });
    expect(r.resumo.urlsCaidasRepetidas).toBe(0);
  });
  test("segunda coleta seguida: coletas 2, desde mantido, resumo conta 1; grupo reaproveitado pela memória também conta", async () => {
    const desde = "2026-10-19T12:00:00.000Z";
    const guardada: LeituraGuardada = { url: "https://orgao.gov.br", lidaEm: desde, conteudo: fonte };
    const r = await analisar("c.xlsx", [contatos[0]], {
      ...deps,
      raspar: async () => { throw new ScrapeError("https://orgao.gov.br", "HTTP 404"); },
      agora,
      falhasAnteriores: { "https://orgao.gov.br": { desde, coletas: 1, motivo: "HTTP 404" } },
      leiturasAnteriores: { "https://orgao.gov.br": guardada },
    });
    expect(r.grupos[0].reaproveitada).toBeDefined();
    expect(r.falhas?.["https://orgao.gov.br"]).toEqual({ desde, coletas: 2, motivo: "HTTP 404" });
    expect(r.resumo.urlsCaidasRepetidas).toBe(1);
  });
  test("URL lida hoje sai de falhas; sem falhasAnteriores o mapa começa vazio", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], { ...deps, agora, falhasAnteriores: { "https://orgao.gov.br": { desde: "2026-10-19T12:00:00.000Z", coletas: 3, motivo: "HTTP 404" } } });
    expect(r.falhas).toEqual({});
  });
  test("entrada antiga de URL não tentada hoje (coletas 5) fica no mapa mas não conta no resumo", async () => {
    const antiga = { desde: "2026-10-01T12:00:00.000Z", coletas: 5, motivo: "HTTP 404" };
    const r = await analisar("c.xlsx", [contatos[0]], { ...deps, agora, falhasAnteriores: { "https://nao-visitada.gov.br": antiga } });
    expect(r.falhas).toEqual({ "https://nao-visitada.gov.br": antiga });
    expect(r.resumo.urlsCaidasRepetidas).toBe(0);
  });
  test("primária sem ninguém (grupo de fonte) conta como falha da URL; secundária sem ninguém não", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], {
      ...deps,
      resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true }, { url: "https://orgao.gov.br/fora", ativo: true, rotulo: "fora" }], fontesIndividuais: [], sugestoes: [] }),
      raspar: async (f) => (f.url === "https://orgao.gov.br" ? fonte : { ...fonte, url: f.url, pessoas: [] }),
      agora,
    });
    expect(r.falhas).toEqual({});
    const r2 = await analisar("c.xlsx", [contatos[0]], { ...deps, raspar: async () => ({ ...fonte, pessoas: [] }), agora });
    expect(r2.falhas?.["https://orgao.gov.br"]?.motivo).toBe(MOTIVO_SEM_NINGUEM);
  });
});

describe("mudança de composição (spec 2026-10-23 §3.4; decisões 1 e 2 do plano)", () => {
  const agora = () => new Date("2026-10-21T12:00:00.000Z");
  // Nomes fictícios sem token em comum entre si (pontuarPessoa casa por token; um sobrenome repetido casaria a pessoa errada).
  const dez = ["Aline Borges Teixeira", "Bruno Cardoso Mendes", "Cláudia Ferraz Nogueira", "Diego Pacheco Ramos", "Elisa Quintela Sá", "Fábio Guimarães Lopes", "Gisele Vasconcelos Dutra", "Hugo Barbosa Peixoto", "Irene Castelo Branco", "Jorge Linhares Moura"];
  const novos = ["Karen Oliveira Prado", "Leonardo Siqueira Fontes", "Marina Dantas Rezende", "Nelson Figueira Cunha", "Olívia Monteiro Tavares", "Paulo Zanetti Correia", "Quitéria Amaral Xavier"];
  const menu = Array.from({ length: 10 }, (_, i) => `Item Menu ${i + 1}`);
  const contatosDez: ContatoPlanilha[] = dez.map((nome) => ({ nome, grupo: "ORG", ...CADASTRO_OK }));
  const conteudo = (lista: string[]): ConteudoFonte => ({ url: "https://orgao.gov.br", textoLimpo: lista.join("\n"), destaques: [], pessoas: lista.map((nome) => ({ nome, cargo: "Ministro" })) });
  const guardada: LeituraGuardada = { url: "https://orgao.gov.br", lidaEm: "2026-10-16T12:00:00.000Z", conteudo: conteudo(dez) };
  const depsCom = (hoje: ConteudoFonte): Dependencias => ({ ...deps, raspar: async () => hoje, leiturasAnteriores: { "https://orgao.gov.br": guardada }, agora });

  test("7 de 10 nomes novos: grupo lido com mudouFormato, saídas aparecem, leitura de hoje não entra na memória, resumo conta", async () => {
    const hoje = conteudo([...dez.slice(0, 3), ...novos]);
    const r = await analisar("c.xlsx", contatosDez, depsCom(hoje));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.reaproveitada).toBeUndefined();
    expect(g.mudouFormato).toEqual({ lidaEm: guardada.lidaEm, trocados: 7, total: 10 });
    expect(g.contatos.filter((c) => c.possivelSaida)).toHaveLength(7);
    expect(r.leituras?.["https://orgao.gov.br"]?.lidaEm).toBe(guardada.lidaEm);
    expect(r.resumo.gruposComMudanca).toBe(1);
  });
  test("3 de 10 novos não é mudança: leitura de hoje vale e entra na memória", async () => {
    const hoje = conteudo([...dez.slice(0, 7), ...novos.slice(0, 3)]);
    const r = await analisar("c.xlsx", contatosDez, depsCom(hoje));
    expect(r.grupos[0].mudouFormato).toBeUndefined();
    expect(r.leituras?.["https://orgao.gov.br"]?.lidaEm).toBe(agora().toISOString());
  });
  test("página truncada (2 de 10, todos guardados) continua leitura parcial reaproveitada, não mudança", async () => {
    const r = await analisar("c.xlsx", contatosDez, depsCom(conteudo(dez.slice(0, 2))));
    expect(r.grupos[0].mudouFormato).toBeUndefined();
    expect(r.grupos[0].reaproveitada?.motivo).toBe("página casou 2 de 10 contatos");
  });
  test("mudança que não casa ninguém continua leitura suspeita (inacessível), sem mudouFormato", async () => {
    const r = await analisar("c.xlsx", contatosDez, depsCom(conteudo(menu)));
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(r.grupos[0].erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
    expect(r.grupos[0].mudouFormato).toBeUndefined();
    expect(r.resumo.gruposComMudanca).toBe(0);
  });
  test("grupo de um contato nunca tem mudança", async () => {
    const r = await analisar("c.xlsx", [contatosDez[0]], depsCom(conteudo(novos.slice(0, 5))));
    expect(r.grupos[0].mudouFormato).toBeUndefined();
  });
  test("sem memória válida não há com o que comparar: sem mudança", async () => {
    const hoje = conteudo([...novos, ...dez.slice(0, 3)]);
    const r = await analisar("c.xlsx", contatosDez, { ...deps, raspar: async () => hoje, agora });
    expect(r.grupos[0].mudouFormato).toBeUndefined();
  });
});

test("nomesDoContatos da fonte do grupo faz o nome conferir (spec 2026-10-23 §4.2)", async () => {
  const r = await analisar("c.xlsx", [{ nome: "Garibaldi Alves Filho", grupo: "ORG", ...CADASTRO_OK }], {
    ...deps,
    resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true, nomesDoContatos: ["Garibaldi Alves Filho"] }], fontesIndividuais: [], sugestoes: [] }),
    raspar: async () => ({ ...fonte, pessoas: [{ nome: "Garibaldi Alves" }] }),
  });
  expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
});
