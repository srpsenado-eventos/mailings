import { describe, expect, test } from "vitest";
import {
  anotacaoReaproveitada,
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
  test("entrada que não é objeto vira memória vazia", () => {
    expect(podarLeituras("nada", AGORA)).toEqual({});
    expect(podarLeituras(undefined, AGORA)).toEqual({});
  });
  test("ehLeituraGuardada exige url, lidaEm e conteudo com pessoas em lista", () => {
    expect(ehLeituraGuardada(leitura(URL_A, "2026-10-16T12:00:00.000Z"))).toBe(true);
    expect(ehLeituraGuardada({ url: URL_A, lidaEm: "x", conteudo: { url: URL_A, textoLimpo: "", destaques: [], pessoas: "não" } })).toBe(false);
  });
});

describe("mesclarLeituras", () => {
  const anteriores: LeiturasGuardadas = {
    [URL_A]: leitura(URL_A, "2026-10-16T12:00:00.000Z", ["Velha"]),
    [URL_B]: leitura(URL_B, "2026-10-15T12:00:00.000Z"),
    "https://vencida": leitura("https://vencida", "2026-10-01T12:00:00.000Z"),
  };
  test("a boa de hoje vence a anterior; URL não visitada permanece; vencida é podada; não muta a entrada", () => {
    const saida = mesclarLeituras(anteriores, [leitura(URL_A, AGORA.toISOString(), ["Nova"])], AGORA);
    expect(saida[URL_A].conteudo.pessoas).toEqual([{ nome: "Nova" }]);
    expect(saida[URL_B].lidaEm).toBe("2026-10-15T12:00:00.000Z");
    expect(saida["https://vencida"]).toBeUndefined();
    expect(anteriores[URL_A].conteudo.pessoas).toEqual([{ nome: "Velha" }]);
  });
  test("reaproveitada colhida mantém a data original", () => {
    const saida = mesclarLeituras(anteriores, [leitura(URL_A, "2026-10-16T12:00:00.000Z", ["Velha"])], AGORA);
    expect(saida[URL_A].lidaEm).toBe("2026-10-16T12:00:00.000Z");
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
