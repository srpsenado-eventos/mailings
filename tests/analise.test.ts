import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { analisar, MOTIVO_LEITURA_SUSPEITA, type Dependencias } from "@/lib/analise";
import { extrairConteudo, extrairTabela, ScrapeError } from "@/lib/scrape";
import { URL_PESQUISA_AMPLA } from "@/lib/gemini";
import { MOTIVO_NAVEGADOR_AUSENTE } from "@/lib/navegador";
import { CATALOGO } from "@/data/catalogo";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { chaveDaLeitura, MOTIVO_SEM_NINGUEM } from "@/lib/memoria-leitura";
import { MOTIVO_SEM_LISTA } from "@/lib/match";
import { GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
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
  // grupo "Senadores titulares fora de exercício"). O mecanismo de segunda fonte continua valendo e é
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

  test('leitura guardada de Embaixadores: "SE Sr." não entra no nome; diferença real continua divergindo, com o esperado sem o prefixo (spec 2026-11-05 §7.1)', async () => {
    // Arrange
    const pagina: ConteudoFonte = {
      url: URL,
      textoLimpo: "",
      destaques: [],
      pessoas: [
        { nome: "SE Sr. Noguchi Yasushi", cargo: "Embaixador", origem: "pagina" },
        { nome: "SE Sra. Tonika Maria-Sealy Thompson", cargo: "Embaixadora", origem: "pagina" },
      ],
    };
    const embaixadores: ContatoPlanilha[] = [
      { nome: "Noguchi Yasushi", grupo: "ORG", cargo: "Embaixador", ...CADASTRO_OK },
      { nome: "Tonika Maria Sealy Thompson", grupo: "ORG", cargo: "Embaixadora", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" },
    ];

    // Act
    const r = await analisar("c.xlsx", embaixadores, comMemoria(erro403, { [URL]: guardada(pagina) }));

    // Assert
    const g = r.grupos[0];
    expect(g.reaproveitada).toMatchObject({ url: URL, motivo: "HTTP 403" });
    const nomeDe = (i: number) => g.contatos[i].comparacoes.find((c) => c.campo === "nome");
    expect(nomeDe(0)?.situacao).toBe("confere");
    expect(nomeDe(1)).toMatchObject({ situacao: "divergente", valorEsperado: "Tonika Maria-Sealy Thompson" });
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

test("nome diferente na página sai divergente com o nome da página, sem exceção por fonte (spec 2026-11-04 §3.3)", async () => {
  const r = await analisar("c.xlsx", [{ nome: "Garibaldi Alves Filho", grupo: "ORG", ...CADASTRO_OK }], {
    ...deps,
    resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true }], fontesIndividuais: [], sugestoes: [] }),
    raspar: async () => ({ ...fonte, pessoas: [{ nome: "Garibaldi Alves" }] }),
  });
  const c = r.grupos[0].contatos[0];
  expect(c.semaforo).toBe("amarelo");
  expect(c.comparacoes.find((x) => x.campo === "nome")).toMatchObject({ situacao: "divergente", valorEsperado: "Garibaldi Alves" });
});

describe("analisar: grupos de modo lista e neutro (spec 2026-10-30 §4.5 e §4.6)", () => {
  const GRUPO_NEUTRO = "Convidados do presidente eleito - Posse 2027";

  const depsEspioes = () => {
    const resolverFonte = vi.fn(() => {
      throw new Error("resolverFonte não deveria ser chamado");
    });
    const raspar = vi.fn(async () => {
      throw new Error("raspar não deveria ser chamado");
    });
    const extrairComposicao = vi.fn(async () => {
      throw new Error("extrairComposicao não deveria ser chamado");
    });
    const d: Dependencias = { resolverFonte, raspar, extrairComposicao };
    return { d, resolverFonte, raspar, extrairComposicao };
  };

  test("não lê página, não chama a IA e não cria possível saída nem sem fonte", async () => {
    // Arrange
    const { d, resolverFonte, raspar, extrairComposicao } = depsEspioes();
    const lote: ContatoPlanilha[] = [
      { nome: "Senador Eleito Um", grupo: GRUPO_SENADORES_ELEITOS, ...CADASTRO_OK },
      { nome: "Governador Eleito Dois", grupo: GRUPO_GOVERNADORES_ELEITOS, ...CADASTRO_OK },
      { nome: "Convidado Três", grupo: GRUPO_NEUTRO, ...CADASTRO_OK },
    ];

    // Act
    const r = await analisar("c.xlsx", lote, d);

    // Assert
    expect(resolverFonte).not.toHaveBeenCalled();
    expect(raspar).not.toHaveBeenCalled();
    expect(extrairComposicao).not.toHaveBeenCalled();
    const todos = r.grupos.flatMap((g) => g.contatos);
    expect(todos.some((c) => c.possivelSaida)).toBe(false);
    const doGrupo = (nome: string) => r.grupos.find((g) => g.grupo === nome)!;
    for (const nome of [GRUPO_SENADORES_ELEITOS, GRUPO_GOVERNADORES_ELEITOS]) {
      const g = doGrupo(nome);
      expect(g.fiscalizacao).toBe("lista");
      expect(g.contatos[0].semaforo).toBe("indeterminado");
      expect(g.contatos[0].observacao).toBe(MOTIVO_SEM_LISTA);
    }
    const neutro = doGrupo(GRUPO_NEUTRO);
    expect(neutro.fiscalizacao).toBe("neutro");
    expect(neutro.contatos[0].semaforo).toBe("verde");
    expect(r.resumo.gruposSemFonte).toBe(0);
    expect(r.resumo.contatosSemFonte).toBe(0);
  });
});

describe("analisar: rótulo do Contatos para Deputados Federais (spec 2026-11-05 §9.2)", () => {
  test("o grupo é de modo lista: nada é resolvido, raspado nem enviado à IA, e ninguém vira possível saída", async () => {
    // Arrange
    const rotulo = "Deputado Federal - Posse Presidencial 2027";
    const resolverFonte = vi.fn(() => {
      throw new Error("resolverFonte não deveria ser chamado");
    });
    const raspar = vi.fn(async () => {
      throw new Error("raspar não deveria ser chamado");
    });
    const extrairComposicao = vi.fn(async () => {
      throw new Error("extrairComposicao não deveria ser chamado");
    });
    const d: Dependencias = { resolverFonte, raspar, extrairComposicao };

    // Act
    const r = await analisar("c.xlsx", [{ nome: "Deputado Um", grupo: rotulo, ...CADASTRO_OK }], d);

    // Assert
    expect(resolverFonte).not.toHaveBeenCalled();
    expect(raspar).not.toHaveBeenCalled();
    expect(extrairComposicao).not.toHaveBeenCalled();
    const [g] = r.grupos;
    expect(g.fiscalizacao).toBe("lista");
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(g.contatos[0].possivelSaida).toBeFalsy();
    expect(r.resumo.gruposSemFonte).toBe(0);
  });
});

describe("cargo nos tribunais (spec 2026-10-30 §3.2)", () => {
  const depsTribunal = (grupoCanonico: string, cargoNaPagina: string): Dependencias => ({
    resolverFonte: () => ({
      grupoCanonico,
      fontes: [{ url: "https://tribunal.jus.br", ativo: true }],
      fontesIndividuais: [],
      sugestoes: [],
    }),
    raspar: async () => ({
      url: "https://tribunal.jus.br",
      textoLimpo: "",
      destaques: [],
      pessoas: [{ nome: "Fulano de Tal Silva", cargo: cargoNaPagina, origem: "pagina" }],
    }),
    extrairComposicao: async () => [],
  });
  const ministro: ContatoPlanilha = { nome: "Fulano de Tal Silva", grupo: "TRIB", cargo: "Ministro do Superior Tribunal de Justiça", ...CADASTRO_OK };

  test("Diretor-Geral da ENFAM na página confirma o Ministro do STJ", async () => {
    const r = await analisar("c.xlsx", [ministro], depsTribunal("Ministros do STJ", "Diretor-Geral da ENFAM"));
    expect(r.grupos[0].contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
  });

  test("a mesma página fora de tribunal continua divergindo no cargo", async () => {
    const r = await analisar("c.xlsx", [ministro], depsTribunal("ORG", "Diretor-Geral da ENFAM"));
    expect(r.grupos[0].contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("divergente");
  });
});

describe("tratamento e endereçamento pela maioria dos pares (spec 2026-10-30 §3.4)", () => {
  const semFonte: Dependencias = {
    resolverFonte: () => ({ fontes: [], fontesIndividuais: [], sugestoes: [] }),
    raspar: async () => {
      throw new Error("raspar não deveria ser chamado");
    },
    extrairComposicao: async () => [],
  };
  const embaixador = (nome: string, cargo: string, tratamento: string): ContatoPlanilha => ({
    nome, grupo: "Embaixadores", cargo, tratamento, enderecamento: "A Sua Excelência o Senhor",
  });

  test("cargo sem regra na tabela é julgado pelos pares também no grupo sem fonte", async () => {
    // Arrange: "Encarregado de Negócios" não está na tabela de protocolo.
    const lote = [
      embaixador("Um", "Encarregado de Negócios da Embaixada do Iraque", "Senhor"),
      embaixador("Dois", "Encarregado de Negócios a.i. da Embaixada do Peru", "Senhor"),
      embaixador("Quatro", "Encarregada de Negócios da Embaixada do Chile", "Senhora"),
      embaixador("Três", "Encarregado de Negócios da Embaixada de Gana", "Doutor"),
    ];
    const sozinho = await analisar("c.xlsx", [lote[3]], semFonte);
    expect(sozinho.grupos[0].contatos[0].comparacoes.find((c) => c.campo === "tratamento" && c.origemValor !== "coerencia")?.situacao).toBe("sem_regra");

    // Act
    const r = await analisar("c.xlsx", lote, semFonte);

    // Assert
    const [um, , , tres] = r.grupos[0].contatos;
    expect(um.comparacoes.find((c) => c.campo === "tratamento" && c.origemValor === "pares")?.situacao).toBe("confere");
    expect(tres.comparacoes.find((c) => c.campo === "tratamento" && c.origemValor === "pares")).toMatchObject({
      situacao: "divergente",
      valorEsperado: "Senhor",
      observacao: "Pela maioria dos pares: 3 de 3 no grupo usam Senhor",
    });
    expect(tres.camposDivergentes.some((d) => d.campo === "tratamento")).toBe(true);
    // Grupo sem fonte: o contato continua vermelho "cadastrar fonte"; os pares não mudam o semáforo.
    expect(tres.semaforo).toBe("vermelho");
    expect(r.resumo.vermelho).toBe(4);
  });

  test("grupo lido com cargo sem regra: divergente dos pares pinta amarelo e entra no resumo", async () => {
    // Arrange
    const lote = [
      embaixador("Ana Um", "Encarregado de Negócios da Embaixada do Iraque", "Senhor"),
      embaixador("Bia Dois", "Encarregado de Negócios da Embaixada do Peru", "Senhor"),
      embaixador("Davi Quatro", "Encarregado de Negócios da Embaixada do Chile", "Senhor"),
      embaixador("Caio Tres", "Encarregado de Negócios da Embaixada de Gana", "Doutor"),
    ];
    const pagina: Dependencias = {
      resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true }], fontesIndividuais: [], sugestoes: [] }),
      raspar: async () => ({
        url: "https://orgao.gov.br",
        textoLimpo: "",
        destaques: [],
        pessoas: lote.map((c) => ({ nome: c.nome, cargo: c.cargo, origem: "pagina" as const })),
      }),
      extrairComposicao: async () => [],
    };

    // Act
    const r = await analisar("c.xlsx", lote, pagina);

    // Assert
    expect(r.grupos[0].contatos.map((c) => c.semaforo)).toEqual(["verde", "verde", "verde", "amarelo"]);
    expect(r.grupos[0].contatos[0].comparacoes.find((c) => c.campo === "tratamento" && c.origemValor === "pares")?.situacao).toBe("confere");
    expect(r.resumo.verde).toBe(3);
    expect(r.resumo.amarelo).toBe(1);
  });
});

describe("grupo sem proposta de inclusão (spec 2026-11-05 §2.5)", () => {
  const AGORA = new Date("2026-11-05T12:00:00.000Z");
  const URL = "https://orgao.gov.br";
  const aMais = { nome: "Carla Pessoa Nova", cargo: "Embaixadora" };
  const paginaComAMais: ConteudoFonte = {
    url: URL,
    textoLimpo: "Ana Maria Política Completa, Presidente. Carla Pessoa Nova, Embaixadora.",
    destaques: [],
    pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "pagina" }, aMais],
  };
  const resolver = (semInclusao: boolean): Dependencias["resolverFonte"] => () => ({
    grupoCanonico: "ORG",
    fontes: [{ url: URL, ativo: true }],
    fontesIndividuais: [],
    sugestoes: [],
    ...(semInclusao ? { semInclusao: true as const } : {}),
  });
  const depsCom = (semInclusao: boolean, extra: Partial<Dependencias> = {}): Dependencias => ({
    ...deps,
    resolverFonte: resolver(semInclusao),
    raspar: async () => paginaComAMais,
    agora: () => AGORA,
    ...extra,
  });

  test("grupo sem a marca mantém a proposta de inclusão", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsCom(false));
    expect(r.grupos[0].novos.map((n) => n.nome)).toEqual(["Carla Pessoa Nova"]);
    expect(r.resumo.novo).toBe(1);
  });

  test("grupo com semInclusao sai com novos vazio e o resumo não conta", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], depsCom(true));
    expect(r.grupos[0].novos).toEqual([]);
    expect(r.resumo.novo).toBe(0);
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("contato ausente da página continua possível saída", async () => {
    const ausente = { nome: "Beatriz Sousa Ausente", grupo: "ORG", ...CADASTRO_OK };
    const r = await analisar("c.xlsx", [contatos[0], ausente], depsCom(true));
    const b = r.grupos[0].contatos.find((c) => c.contato.nome === "Beatriz Sousa Ausente");
    expect(r.grupos[0].novos).toEqual([]);
    expect(b?.possivelSaida).toBe(true);
  });

  test("leitura reaproveitada pela memória também sai sem novos", async () => {
    const memoria: LeiturasGuardadas = { [URL]: { url: URL, lidaEm: "2026-11-03T10:00:00.000Z", conteudo: paginaComAMais } };
    const d = depsCom(true, { raspar: async () => { throw new Error("HTTP 403"); }, leiturasAnteriores: memoria });
    const r = await analisar("c.xlsx", [contatos[0]], d);
    expect(r.grupos[0].reaproveitada).toBeDefined();
    expect(r.grupos[0].novos).toEqual([]);
    expect(r.resumo.novo).toBe(0);
  });

  test("composição só pela Camada 2 também sai sem novos", async () => {
    const d = depsCom(true, {
      raspar: async () => { throw new Error("HTTP 403"); },
      extrairComposicao: async () => [
        { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" },
        { ...aMais, origem: "conhecimento" },
      ],
    });
    const r = await analisar("c.xlsx", [contatos[0]], d);
    expect(r.grupos[0].viaPesquisaAmpla).toBe(true);
    expect(r.grupos[0].novos).toEqual([]);
  });
});

describe("Ministros de Estado de ponta a ponta: página do Planalto como fonte única, cargo pela pasta (GT de 13/11)", () => {
  const URL_PLANALTO = "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras";
  const GRUPO = "Ministros de Estado";
  const html = readFileSync(join(__dirname, "fixtures", "ministros-estado.html"), "utf8");
  const depsMin = (conteudoHtml: string, extra: Partial<Dependencias> = {}): Dependencias => ({
    resolverFonte: () => ({
      grupoCanonico: GRUPO,
      fontes: [{ url: URL_PLANALTO, ativo: true, navegador: "janela" }],
      fontesIndividuais: [],
      sugestoes: [],
    }),
    raspar: async () => extrairConteudo(conteudoHtml, URL_PLANALTO),
    extrairComposicao: async () => [],
    ...extra,
  });
  const contato = (nome: string, cargo: string): ContatoPlanilha => ({ nome, grupo: GRUPO, cargo, ...CADASTRO_OK });
  const casaCivil = contato("Miriam Belchior", "Ministra de Estado da Casa Civil da Presidência da República");
  const defesa = contato("José Mucio Monteiro Filho", "Ministro de Estado da Defesa");
  type Resultado = Awaited<ReturnType<typeof analisar>>;
  const doContato = (r: Resultado, nome: string) => r.grupos[0].contatos.find((c) => c.contato.nome === nome)!;
  const cargoDe = (r: Resultado, nome: string) => doContato(r, nome).comparacoes.find((c) => c.campo === "cargo")!;

  test("nome e pasta iguais aos da página: cargo confere, sem possível saída", async () => {
    const r = await analisar("c.xlsx", [casaCivil, defesa], depsMin(html));
    expect(cargoDe(r, casaCivil.nome).situacao).toBe("confere");
    expect(cargoDe(r, defesa.nome).situacao).toBe("confere");
    expect(r.grupos[0].contatos.some((c) => c.possivelSaida)).toBe(false);
  });

  test("pasta trocada no Contatos: cargo diverge e a pasta da página vem como esperado", async () => {
    const trocado = { ...defesa, cargo: "Ministro de Estado da Educação" };
    const r = await analisar("c.xlsx", [casaCivil, trocado], depsMin(html));
    const cargo = cargoDe(r, trocado.nome);
    expect(cargo.situacao).toBe("divergente");
    expect(cargo.valorEsperado).toBe("Ministro de Estado da Defesa");
    expect(doContato(r, trocado.nome).semaforo).toBe("amarelo");
  });

  test("nome fora da página, com composição real: possível saída", async () => {
    const r = await analisar("c.xlsx", [casaCivil, defesa, contato("Fulano Fora Da Pagina", "Ministro de Estado da Fazenda")], depsMin(html));
    expect(doContato(r, "Fulano Fora Da Pagina").possivelSaida).toBe(true);
    expect(doContato(r, casaCivil.nome).possivelSaida).toBeFalsy();
  });

  test("limitação conhecida de 13/11: CGU e AGU (linha-órgão sem cargo na extração) saem verdes com o cargo fonte_nao_informa", async () => {
    const cgu = contato("Vinícius Marques de Carvalho", "Ministro de Estado da Controladoria-Geral da União");
    const agu = contato("Jorge Rodrigo Araújo Messias", "Advogado-Geral da União");
    const r = await analisar("c.xlsx", [casaCivil, cgu, agu], depsMin(html));
    for (const c of [cgu, agu]) {
      expect(doContato(r, c.nome).possivelSaida).toBeFalsy();
      expect(doContato(r, c.nome).semaforo).toBe("verde");
      expect(cargoDe(r, c.nome).situacao).toBe("fonte_nao_informa");
    }
  });

  test("página vazia: grupo indeterminado, ninguém vira saída (regra de ouro)", async () => {
    const r = await analisar("c.xlsx", [casaCivil, defesa], depsMin("<html><body></body></html>"));
    expect(r.grupos[0].contatos.some((c) => c.possivelSaida)).toBe(false);
    expect(r.grupos[0].contatos.every((c) => c.semaforo === "indeterminado")).toBe(true);
  });

  test("proposta de inclusão nunca vem do conhecimento da IA", async () => {
    const ia = async () => [{ nome: "Pessoa Lembrada Pela IA", cargo: "Ministro de Estado da Fazenda", origem: "conhecimento" as const }];
    const r = await analisar("c.xlsx", [casaCivil, defesa], depsMin(html, { extrairComposicao: ia }));
    expect(r.grupos[0].novos.some((n) => n.nome === "Pessoa Lembrada Pela IA")).toBe(false);
  });
});

describe("Comandantes das Forças Armadas e EMCFA de ponta a ponta: quatro fontes do catálogo (GT de 13/11)", () => {
  const GRUPO = "Comandantes das Forças Armadas e EMCFA";
  const URL_MARINHA = "https://www.marinha.mil.br/comandantedamarinha";
  const URL_DEFESA = "https://www.gov.br/defesa/pt-br/composicao";
  const URL_EB = "https://www.eb.mil.br/web/comandante-do-exercito";
  const URL_FAB = "https://www.fab.mil.br/a-forca-aerea/comandante/";
  const BLOQUEIO = "HTTP 403";
  const lerFixture = (nome: string) => readFileSync(join(__dirname, "fixtures", nome), "utf8");
  const PAGINAS: Record<string, string> = {
    [URL_DEFESA]: lerFixture("defesa-composicao.html"),
    [URL_EB]: lerFixture("comandante-exercito.html"),
  };
  /** As fontes do próprio catálogo; página fora do mapa responde como a Cloudflare em 13/11. */
  const depsCmd = (paginas: Record<string, string> = PAGINAS): Dependencias => ({
    resolverFonte: (g) => resolverGrupoEFonte(g),
    raspar: async (f) => {
      const html = paginas[f.url];
      if (html === undefined) throw new ScrapeError(f.url, BLOQUEIO);
      return extrairConteudo(html, f.url, {
        ...(f.marcador ? { marcador: f.marcador.textos } : {}),
        ...(f.pessoaUnica ? { pessoaUnica: f.pessoaUnica } : {}),
      });
    },
    extrairComposicao: async () => [],
  });
  const contato = (nome: string, cargo: string): ContatoPlanilha => ({ nome, grupo: GRUPO, cargo, ...CADASTRO_OK });
  const exercito = contato("Gen Ex Tomás Miguel Miné Ribeiro Paiva", "Comandante do Exército Brasileiro");
  const emcfa = contato("Alte Esq Renato Rodrigues de Aguiar Freire", "Chefe do Estado-Maior Conjunto das Forças Armadas");
  const marinha = contato("Alte Esq Fulano de Tal Souza", "Comandante da Marinha");
  const fab = contato("Ten Brig Ar Beltrano Pereira Lima", "Comandante da Aeronáutica");
  type Resultado = Awaited<ReturnType<typeof analisar>>;
  const doContato = (r: Resultado, nome: string) => r.grupos[0].contatos.find((c) => c.contato.nome === nome)!;

  test("Marinha e FAB bloqueadas: leitura parcial, os dois indeterminados (nunca saída), Exército e EMCFA verdes", async () => {
    // Act
    const r = await analisar("c.xlsx", [marinha, emcfa, exercito, fab], depsCmd());
    const g = r.grupos[0];

    // Assert
    expect(g.grupo).toBe(GRUPO);
    expect(g.contatos.some((c) => c.possivelSaida)).toBe(false);
    expect(doContato(r, marinha.nome).semaforo).toBe("indeterminado");
    expect(doContato(r, fab.nome).semaforo).toBe("indeterminado");
    expect(doContato(r, exercito.nome).semaforo).toBe("verde");
    expect(doContato(r, emcfa.nome).semaforo).toBe("verde");
    for (const c of [exercito, emcfa]) {
      expect(doContato(r, c.nome).comparacoes.find((x) => x.campo === "cargo")?.situacao).toBe("confere");
    }
    expect(g.erroFonte).toContain(URL_MARINHA);
    expect(g.erroFonte).toContain(URL_FAB);
  });

  test("nome em caixa normal no Contatos e em caixa alta na página: confere", async () => {
    const r = await analisar("c.xlsx", [marinha, emcfa, exercito, fab], depsCmd());
    const nome = doContato(r, exercito.nome).comparacoes.find((c) => c.campo === "nome")!;
    expect(nome.situacao).toBe("confere");
  });

  test("ninguém da composição da Defesa vira proposta de inclusão (semInclusao)", async () => {
    const r = await analisar("c.xlsx", [marinha, emcfa, exercito, fab], depsCmd());
    expect(r.grupos[0].novos).toEqual([]);
  });

  test("as quatro páginas lidas: os quatro verdes", async () => {
    const pagina = (nome: string) => `<html><body><main><h1>${nome}</h1></main></body></html>`;
    const r = await analisar(
      "c.xlsx",
      [marinha, emcfa, exercito, fab],
      depsCmd({ ...PAGINAS, [URL_MARINHA]: pagina(marinha.nome), [URL_FAB]: pagina(fab.nome) }),
    );
    expect(r.grupos[0].contatos.map((c) => c.semaforo)).toEqual(["verde", "verde", "verde", "verde"]);
    expect(r.grupos[0].erroFonte).toBeUndefined();
  });

  test("patente por extenso no Contatos e abreviada na página: amarelo pela patente", async () => {
    // Arrange
    const porExtenso = { ...marinha, nome: "Almirante de Esquadra Fulano de Tal Souza" };
    const paginas = { ...PAGINAS, [URL_MARINHA]: "<html><body><main><h1>Alte Esq Fulano de Tal Souza</h1></main></body></html>" };

    // Act
    const r = await analisar("c.xlsx", [porExtenso, emcfa, exercito, fab], depsCmd(paginas));
    const c = doContato(r, porExtenso.nome);

    // Assert
    expect(c.possivelSaida).toBeFalsy();
    expect(c.semaforo).toBe("amarelo");
    const nome = c.comparacoes.find((x) => x.campo === "nome")!;
    expect(nome.situacao).toBe("divergente");
    expect(nome.valorEsperado).toBe("Alte Esq Fulano de Tal Souza");
  });
});
