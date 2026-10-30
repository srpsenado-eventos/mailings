import { describe, expect, test } from "vitest";
import {
  anotacaoReaproveitada,
  atualizarFalhas,
  chaveDaLeitura,
  contarUrlsCaidas,
  ehMudancaDeComposicao,
  falhasDoRetrato,
  FRACAO_MINIMA_TROCADA,
  MIN_COLETAS_URL_CAIDA,
  nomesNovos,
  descreverMotivoDeHoje,
  diaMes,
  ehLeituraGuardada,
  ehLeituraParcial,
  leituraValida,
  memoriaDoRetrato,
  mesclarLeituras,
  motivoLeituraParcial,
  MOTIVO_SEM_NINGUEM,
  podarLeituras,
  reconstruirLeituras,
} from "@/lib/memoria-leitura";
import type { LeituraGuardada, LeiturasGuardadas, ResultadoGrupo, Retrato } from "@/lib/types";

const AGORA = new Date("2026-10-20T12:00:00.000Z");
const URL_A = "https://orgao.gov.br/a";
const URL_B = "https://orgao.gov.br/b";

function leitura(url: string, lidaEm: string, nomes: string[] = ["Ana Exemplo"]): LeituraGuardada {
  return { url, lidaEm, conteudo: { url, textoLimpo: nomes.join("\n"), destaques: [], pessoas: nomes.map((nome) => ({ nome })) } };
}

describe("leituraValida", () => {
  test("6 dias: válida", () => expect(leituraValida(leitura(URL_A, "2026-10-14T12:00:00.000Z"), AGORA)).toBe(true));
  test("7 dias exatos: válida (inclusive)", () => expect(leituraValida(leitura(URL_A, "2026-10-13T12:00:00.000Z"), AGORA)).toBe(true));
  test("8 dias: vencida", () => expect(leituraValida(leitura(URL_A, "2026-10-12T12:00:00.000Z"), AGORA)).toBe(false));
  test("lidaEm ilegível: vencida", () => expect(leituraValida(leitura(URL_A, "ontem"), AGORA)).toBe(false));
});

describe("ehLeituraParcial e motivo", () => {
  test("2 de 10 é parcial; 9 de 10 não; 1 de 2 não (metade exata); grupo de 1 nunca", () => {
    expect(ehLeituraParcial(2, 10)).toBe(true);
    expect(ehLeituraParcial(9, 10)).toBe(false);
    expect(ehLeituraParcial(1, 2)).toBe(false);
    expect(ehLeituraParcial(0, 1)).toBe(false);
  });
  test("motivo", () => expect(motivoLeituraParcial(2, 10)).toBe("página casou 2 de 10 contatos"));
});

describe("textos", () => {
  test("diaMes no fuso de Brasília", () => expect(diaMes("2026-10-16T15:50:29.000Z")).toBe("16/10"));
  test("anotação curta", () => expect(anotacaoReaproveitada({ lidaEm: "2026-10-16T15:50:29.000Z", motivo: "HTTP 403" })).toBe("leitura de 16/10 reaproveitada (HTTP 403)"));
  test("descreverMotivoDeHoje", () => {
    expect(descreverMotivoDeHoje("HTTP 403")).toBe("hoje a página não respondeu (HTTP 403)");
    expect(descreverMotivoDeHoje(MOTIVO_SEM_NINGUEM)).toBe("hoje a página não trouxe ninguém");
    expect(descreverMotivoDeHoje("página casou 2 de 10 contatos")).toBe("hoje a página casou 2 de 10 contatos");
  });
});

describe("podarLeituras", () => {
  test("mantém só as válidas e com forma certa; chave e url têm que bater", () => {
    const entrada: unknown = {
      [URL_A]: leitura(URL_A, "2026-10-16T12:00:00.000Z"),
      [URL_B]: leitura(URL_B, "2026-10-01T12:00:00.000Z"),
      "https://x": "texto solto",
      "https://y": { url: "https://y", lidaEm: "2026-10-19T00:00:00.000Z" },
      "https://z": leitura("https://outra", "2026-10-19T00:00:00.000Z"),
    };
    expect(Object.keys(podarLeituras(entrada, AGORA))).toEqual([URL_A]);
  });
  test("aceita chave com sufixo de extração da mesma URL (`${url}#...`), não de outra URL", () => {
    const entrada: unknown = {
      [`${URL_A}#tabela:{"colunaNome":0}`]: leitura(URL_A, "2026-10-16T12:00:00.000Z"),
      [`${URL_B}#pdf`]: leitura(URL_A, "2026-10-16T12:00:00.000Z"),
      [`${URL_A}x#pdf`]: leitura(URL_A, "2026-10-16T12:00:00.000Z"),
    };
    expect(Object.keys(podarLeituras(entrada, AGORA))).toEqual([`${URL_A}#tabela:{"colunaNome":0}`]);
  });
  test("entrada que não é objeto vira memória vazia", () => {
    expect(podarLeituras("nada", AGORA)).toEqual({});
    expect(podarLeituras(undefined, AGORA)).toEqual({});
  });
  test("ehLeituraGuardada exige url, lidaEm e conteudo com pessoas em lista", () => {
    expect(ehLeituraGuardada(leitura(URL_A, "2026-10-16T12:00:00.000Z"))).toBe(true);
    expect(ehLeituraGuardada({ url: URL_A, lidaEm: "x", conteudo: { url: URL_A, textoLimpo: "", destaques: [], pessoas: "não" } })).toBe(false);
  });
});

/** Colhida sob a chave da URL pura (fonte de extração padrão), ou sob a chave dada. */
const colhida = (l: LeituraGuardada, chave: string = l.url) => ({ chave, leitura: l });

describe("chaveDaLeitura (memória por forma de extração)", () => {
  const TABELA = { indice: 1, colunas: { nome: 0, uf: 2 } };
  test("fonte padrão: a URL pura", () => {
    expect(chaveDaLeitura(URL_A, {})).toBe(URL_A);
    expect(chaveDaLeitura(URL_A, { tipo: "html" })).toBe(URL_A);
  });
  test("com tabela, marcador ou pdf: sufixo próprio", () => {
    expect(chaveDaLeitura(URL_A, { tabela: TABELA })).toBe(`${URL_A}#tabela:${JSON.stringify(TABELA)}`);
    expect(chaveDaLeitura(URL_A, { marcador: { textos: ["(convocado)", "(convocada)"] } })).toBe(`${URL_A}#marcador:["(convocado)","(convocada)"]`);
    expect(chaveDaLeitura(URL_A, { tipo: "pdf" })).toBe(`${URL_A}#pdf`);
  });
  test("nome em destaque: sufixo #destaque, para a leitura sem destaque não ser reaproveitada no lugar", () => {
    expect(chaveDaLeitura(URL_A, { nomeEmDestaque: true })).toBe(`${URL_A}#destaque`);
  });
  test("mais de um: sufixos combinados na ordem tabela, marcador, pdf", () => {
    expect(chaveDaLeitura(URL_A, { tipo: "pdf", marcador: { textos: ["X"] }, tabela: TABELA })).toBe(`${URL_A}#tabela:${JSON.stringify(TABELA)}#marcador:["X"]#pdf`);
  });
});

describe("mesclarLeituras", () => {
  const anteriores: LeiturasGuardadas = {
    [URL_A]: leitura(URL_A, "2026-10-16T12:00:00.000Z", ["Velha"]),
    [URL_B]: leitura(URL_B, "2026-10-15T12:00:00.000Z"),
    "https://vencida": leitura("https://vencida", "2026-10-01T12:00:00.000Z"),
  };
  test("a boa de hoje vence a anterior; URL não visitada permanece; vencida é podada; não muta a entrada", () => {
    const saida = mesclarLeituras(anteriores, [colhida(leitura(URL_A, AGORA.toISOString(), ["Nova"]))], AGORA);
    expect(saida[URL_A].conteudo.pessoas).toEqual([{ nome: "Nova" }]);
    expect(saida[URL_B].lidaEm).toBe("2026-10-15T12:00:00.000Z");
    expect(saida["https://vencida"]).toBeUndefined();
    expect(anteriores[URL_A].conteudo.pessoas).toEqual([{ nome: "Velha" }]);
  });
  test("reaproveitada colhida mantém a data original", () => {
    const saida = mesclarLeituras(anteriores, [colhida(leitura(URL_A, "2026-10-16T12:00:00.000Z", ["Velha"]))], AGORA);
    expect(saida[URL_A].lidaEm).toBe("2026-10-16T12:00:00.000Z");
  });
  test("duas colhidas da mesma URL: a mais recente vence, qualquer que seja a ordem", () => {
    const antiga = leitura(URL_A, "2026-10-16T12:00:00.000Z", ["Antiga"]);
    const nova = leitura(URL_A, AGORA.toISOString(), ["Nova"]);
    expect(mesclarLeituras({}, [colhida(nova), colhida(antiga)], AGORA)[URL_A].conteudo.pessoas).toEqual([{ nome: "Nova" }]);
    expect(mesclarLeituras({}, [colhida(antiga), colhida(nova)], AGORA)[URL_A].conteudo.pessoas).toEqual([{ nome: "Nova" }]);
  });
  test("mesma URL com extrações diferentes: duas entradas, cada uma sob a sua chave, com a url real", () => {
    const texto = leitura(URL_A, AGORA.toISOString(), ["Texto"]);
    const tabela = leitura(URL_A, AGORA.toISOString(), ["Tabela"]);
    const chaveTabela = `${URL_A}#tabela:{"colunaNome":0}`;
    const saida = mesclarLeituras({}, [colhida(tabela, chaveTabela), colhida(texto)], AGORA);
    expect(Object.keys(saida).sort()).toEqual([URL_A, chaveTabela].sort());
    expect(saida[chaveTabela].url).toBe(URL_A);
    expect(saida[chaveTabela].conteudo.pessoas).toEqual([{ nome: "Tabela" }]);
    expect(saida[URL_A].conteudo.pessoas).toEqual([{ nome: "Texto" }]);
  });
});

describe("reconstruirLeituras (§5.4)", () => {
  const base = { semFonte: false, novos: [] as ResultadoGrupo["novos"] };
  const contato = (nome: string, comparacoes: ResultadoGrupo["contatos"][number]["comparacoes"], extra: Partial<ResultadoGrupo["contatos"][number]> = {}) =>
    ({ contato: { nome, grupo: "G" }, semaforo: "verde", score: 1, comparacoes, camposDivergentes: [], origem: "oficial", ...extra }) as ResultadoGrupo["contatos"][number];
  const lido: ResultadoGrupo = {
    ...base, grupo: "Lido", fonteUrl: URL_A,
    contatos: [
      // origemValor ausente: é como a raspagem real grava valor de página
      contato("Ana Exemplo", [{ campo: "nome", valorPlanilha: "Ana Exemplo", valorEsperado: "Ana Maria Exemplo", situacao: "divergente" }, { campo: "cargo", valorPlanilha: "Ministra", valorEsperado: "Ministra", situacao: "confere" }]),
      contato("Beto Caso", [{ campo: "nome", valorPlanilha: "Beto Caso", valorEsperado: "Beto Caso", situacao: "confere", origemValor: "pagina" }, { campo: "cargo", valorPlanilha: "Ministro", situacao: "fonte_nao_informa" }]),
      // resgatado pela IA: fica fora
      contato("Ciro IA", [{ campo: "nome", valorPlanilha: "Ciro IA", valorEsperado: "Ciro IA", situacao: "confere", origemValor: "conhecimento" }]),
      // Camada C tem valorEsperado, mas é coerência: fica fora
      contato("Dr. Dino", [{ campo: "nome", valorPlanilha: "Dr. Dino", valorEsperado: "Dino", situacao: "divergente", origemValor: "coerencia", achado: "nome_tratamento_academico" }]),
      // possível saída: sem valor de página
      contato("Eva Saiu", [], { semaforo: "vermelho", possivelSaida: true }),
    ],
    novos: [{ nome: "Fábio Novo", cargo: "Ministro" }, { nome: "Gil IA", cargo: "Ministro", origem: "conhecimento" }],
  };
  const retrato = { geradoEm: "2026-10-16T15:50:29.000Z", grupos: [
    lido,
    { ...base, grupo: "Via IA", fonteUrl: URL_B, viaPesquisaAmpla: true, contatos: [contato("X", [{ campo: "nome", valorPlanilha: "X", valorEsperado: "X", situacao: "confere" }])] },
    { ...base, grupo: "Inacessível", fonteUrl: "https://c", fonteInacessivel: true, contatos: [] },
    { ...base, grupo: "Sem fonte", semFonte: true, contatos: [] },
    { ...base, grupo: "Individuais", fonteUrl: "https://d", individuais: { lidas: 2, caidas: 0 }, contatos: [contato("Y", [{ campo: "nome", valorPlanilha: "Y", valorEsperado: "Y", situacao: "confere" }])] },
    { ...base, grupo: "Só IA sem URL", fonteUrl: "pesquisa-ampla://anthropic-haiku", contatos: [] },
    { ...base, grupo: "Nada aproveitável", fonteUrl: "https://e", contatos: [contato("Z", [], { semaforo: "vermelho", possivelSaida: true })] },
  ] } as unknown as Pick<Retrato, "geradoEm" | "grupos">;

  test("grupo lido vira composição com nome e cargo da página e novos da página; lidaEm é geradoEm", () => {
    const m = reconstruirLeituras(retrato);
    expect(Object.keys(m)).toEqual([URL_A]);
    expect(m[URL_A].lidaEm).toBe("2026-10-16T15:50:29.000Z");
    expect(m[URL_A].conteudo.url).toBe(URL_A);
    expect(m[URL_A].conteudo.pessoas).toEqual([
      { nome: "Ana Maria Exemplo", cargo: "Ministra" },
      { nome: "Beto Caso" },
      { nome: "Fábio Novo", cargo: "Ministro" },
    ]);
    expect(m[URL_A].conteudo.textoLimpo).toBe("Ana Maria Exemplo\nBeto Caso\nFábio Novo");
  });

  test("dois grupos com a mesma fonteUrl somam as pessoas em uma só leitura, sem repetir nome", () => {
    const URL_SEN = "https://www25.senado.leg.br/web/senadores/em-exercicio";
    const grupoGrande: ResultadoGrupo = {
      ...base, grupo: "Senadores", fonteUrl: URL_SEN,
      contatos: [
        contato("Weverton", [{ campo: "nome", valorPlanilha: "Weverton", valorEsperado: "Weverton", situacao: "confere" }]),
        contato("Davi", [{ campo: "nome", valorPlanilha: "Davi", valorEsperado: "Davi Alcolumbre", situacao: "divergente" }]),
      ],
    };
    const grupoDeUm: ResultadoGrupo = {
      ...base, grupo: "Presidente do Senado Federal; Senadores", fonteUrl: URL_SEN,
      contatos: [contato("Davi Alcolumbre", [{ campo: "nome", valorPlanilha: "Davi Alcolumbre", valorEsperado: "Davi Alcolumbre", situacao: "confere" }, { campo: "cargo", valorPlanilha: "Presidente", valorEsperado: "Presidente do Senado", situacao: "divergente" }])],
    };
    const m = reconstruirLeituras({ geradoEm: "2026-10-20T13:49:13.000Z", grupos: [grupoGrande, grupoDeUm] });
    expect(m[URL_SEN].conteudo.pessoas.map((p) => p.nome)).toEqual(["Weverton", "Davi Alcolumbre"]);
    expect(m[URL_SEN].conteudo.textoLimpo).toBe("Weverton\nDavi Alcolumbre");
    const invertido = reconstruirLeituras({ geradoEm: "2026-10-20T13:49:13.000Z", grupos: [grupoDeUm, grupoGrande] });
    expect(invertido[URL_SEN].conteudo.pessoas).toHaveLength(2);
  });
});

describe("memoriaDoRetrato (§6 passo 1 e §10)", () => {
  test("sem retrato: vazia", () => expect(memoriaDoRetrato(undefined, AGORA)).toEqual({}));
  test("retrato com leituras usa as leituras, podadas", () => {
    const r = { geradoEm: "2026-10-19T00:00:00.000Z", grupos: [], leituras: { [URL_A]: leitura(URL_A, "2026-10-19T00:00:00.000Z"), [URL_B]: leitura(URL_B, "2026-09-01T00:00:00.000Z") } } as unknown as Retrato;
    expect(Object.keys(memoriaDoRetrato(r, AGORA))).toEqual([URL_A]);
  });
  test("retrato com leituras de forma inesperada: nada é reaproveitado", () => {
    const r = { geradoEm: "2026-10-19T00:00:00.000Z", grupos: [{ grupo: "G", fonteUrl: URL_A, semFonte: false, novos: [], contatos: [] }], leituras: "quebrado" } as unknown as Retrato;
    expect(memoriaDoRetrato(r, AGORA)).toEqual({});
  });
  test("retrato sem leituras é reconstruído", () => {
    const r = {
      geradoEm: "2026-10-16T15:50:29.000Z",
      grupos: [{ grupo: "G", fonteUrl: URL_A, semFonte: false, novos: [], contatos: [{ contato: { nome: "Ana", grupo: "G" }, semaforo: "verde", score: 1, camposDivergentes: [], origem: "oficial", comparacoes: [{ campo: "nome", valorPlanilha: "Ana", valorEsperado: "Ana", situacao: "confere" }] }] }],
    } as unknown as Retrato;
    expect(memoriaDoRetrato(r, AGORA)[URL_A].conteudo.pessoas).toEqual([{ nome: "Ana" }]);
  });
});

describe("falhas por URL (spec 2026-10-23 §3.4)", () => {
  const D19 = "2026-10-19T12:00:00.000Z";
  const hoje = new Date("2026-10-21T12:00:00.000Z");
  test("URL que falha pela primeira vez entra com coletas 1 e desde = agora", () => {
    const f = atualizarFalhas({}, [{ url: "https://a.gov.br", erro: "HTTP 404" }], hoje);
    expect(f).toEqual({ "https://a.gov.br": { desde: hoje.toISOString(), coletas: 1, motivo: "HTTP 404" } });
  });
  test("URL que falha de novo soma coletas, mantém desde e troca o motivo pelo de hoje", () => {
    const f = atualizarFalhas({ "https://a.gov.br": { desde: D19, coletas: 1, motivo: "HTTP 404" } }, [{ url: "https://a.gov.br", erro: "tempo esgotado" }], hoje);
    expect(f["https://a.gov.br"]).toEqual({ desde: D19, coletas: 2, motivo: "tempo esgotado" });
  });
  test("URL lida hoje sai do mapa; URL não tentada fica como está", () => {
    const antes = { "https://a.gov.br": { desde: D19, coletas: 1, motivo: "HTTP 404" }, "https://b.gov.br": { desde: D19, coletas: 3, motivo: "HTTP 500" } };
    const f = atualizarFalhas(antes, [{ url: "https://a.gov.br" }], hoje);
    expect(f).toEqual({ "https://b.gov.br": antes["https://b.gov.br"] });
    expect(antes["https://a.gov.br"]).toBeDefined(); // não muta a entrada
  });
  test("sucesso na mesma varredura apaga a falha da URL, em qualquer ordem", () => {
    const f = atualizarFalhas({}, [{ url: "https://a.gov.br", erro: "HTTP 429 (3 tentativas)" }, { url: "https://a.gov.br" }], hoje);
    expect(f).toEqual({});
  });
  test("contarUrlsCaidas conta só coletas >= MIN_COLETAS_URL_CAIDA entre as URLs tentadas hoje", () => {
    expect(MIN_COLETAS_URL_CAIDA).toBe(2);
    const falhas = { a: { desde: D19, coletas: 1, motivo: "x" }, b: { desde: D19, coletas: 2, motivo: "x" }, c: { desde: D19, coletas: 5, motivo: "x" } };
    expect(contarUrlsCaidas(falhas, new Set(["a", "b", "c"]))).toBe(2);
  });
  test("contarUrlsCaidas: entrada antiga de URL não tentada hoje não conta, mesmo com 5 coletas", () => {
    const falhas = { b: { desde: D19, coletas: 2, motivo: "x" }, antiga: { desde: D19, coletas: 5, motivo: "x" } };
    expect(contarUrlsCaidas(falhas, new Set(["b"]))).toBe(1);
  });
  test("falhasDoRetrato devolve o mapa do retrato e descarta entrada com forma errada; retrato sem o campo ou ausente dá vazio", () => {
    const boa = { desde: D19, coletas: 2, motivo: "HTTP 404" };
    expect(falhasDoRetrato({ falhas: { "https://a.gov.br": boa, "https://b.gov.br": { coletas: "2" } } } as never)).toEqual({ "https://a.gov.br": boa });
    expect(falhasDoRetrato({} as never)).toEqual({});
    expect(falhasDoRetrato(undefined)).toEqual({});
  });
  test("falhasDoRetrato descarta coletas que não é número finito >= 1 e desde que não é data", () => {
    const boa = { desde: D19, coletas: 1, motivo: "HTTP 404" };
    const falhas = {
      "https://boa.gov.br": boa,
      "https://zero.gov.br": { ...boa, coletas: 0 },
      "https://negativa.gov.br": { ...boa, coletas: -3 },
      "https://nan.gov.br": { ...boa, coletas: Number.NaN },
      "https://infinita.gov.br": { ...boa, coletas: Number.POSITIVE_INFINITY },
      "https://data-ruim.gov.br": { ...boa, desde: "ontem" },
    };
    expect(falhasDoRetrato({ falhas } as never)).toEqual({ "https://boa.gov.br": boa });
  });
});

describe("mudança de composição (spec 2026-10-23 §3.4; decisão 1 do plano)", () => {
  const p = (...nomes: string[]) => nomes.map((nome) => ({ nome }));
  test("conta os nomes distintos de hoje e quantos não estão na guardada (igualdade após normalizarNome)", () => {
    expect(nomesNovos(p("Ana Silva", "ANA SILVA", "Beto Souza", "Carla Lima"), p("Ana Silva", "Beto Souza"))).toEqual({ trocados: 1, total: 3 });
  });
  test("página truncada (todos os nomes de hoje estão na guardada) não tem nomes novos", () => {
    expect(nomesNovos(p("Ana Silva", "Beto Souza"), p("Ana Silva", "Beto Souza", "Carla Lima", "Dora Reis"))).toEqual({ trocados: 0, total: 2 });
  });
  test("é mudança com mais da metade de nomes novos em grupo com 2+ contatos", () => {
    expect(FRACAO_MINIMA_TROCADA).toBe(0.5);
    expect(ehMudancaDeComposicao({ trocados: 7, total: 10 }, 10)).toBe(true);
    expect(ehMudancaDeComposicao({ trocados: 5, total: 10 }, 10)).toBe(false);
    expect(ehMudancaDeComposicao({ trocados: 3, total: 10 }, 10)).toBe(false);
  });
  test("grupo de um contato e página sem nomes nunca são mudança", () => {
    expect(ehMudancaDeComposicao({ trocados: 1, total: 1 }, 1)).toBe(false);
    expect(ehMudancaDeComposicao({ trocados: 0, total: 0 }, 5)).toBe(false);
  });
});
