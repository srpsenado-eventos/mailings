import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { analisar, type Dependencias } from "@/lib/analise";
import { extrairTabela } from "@/lib/scrape";
import { CATALOGO } from "@/data/catalogo";
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

  const deps: Dependencias = {
    resolverFonte: () => ({
      grupoCanonico: grupoMA.nome,
      fontes: grupoMA.fontes.filter((f) => f.ativo),
      ufs: grupoMA.ufs,
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
