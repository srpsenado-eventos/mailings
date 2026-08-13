import { describe, expect, test } from "vitest";
import { buscarFontePrimaria, resolverGrupoEFonte, listarGruposComFonte } from "@/lib/catalogo";
import type { GrupoCatalogo } from "@/lib/types";

/** Açúcar para declarar um grupo com uma única fonte ativa. */
function grupoComFonte(nome: string, url: string): GrupoCatalogo {
  return { nome, fontes: [{ url, ativo: true }] };
}

describe("buscarFontePrimaria", () => {
  test("retorna a primeira URL ativa do grupo com nome idêntico", () => {
    const url = buscarFontePrimaria("STF", [grupoComFonte("STF", "https://a.gov.br")]);
    expect(url).toBe("https://a.gov.br");
  });

  test("tolera diferença de caixa e acento entre planilha e cadastro", () => {
    const url = buscarFontePrimaria("governador de sao paulo", [
      grupoComFonte("Governador de São Paulo", "https://gov.br/sp"),
    ]);
    expect(url).toBe("https://gov.br/sp");
  });

  test("escolhe o grupo certo quando há fontes de vários grupos", () => {
    const url = buscarFontePrimaria("STF", [
      grupoComFonte("STJ", "https://a.gov.br/stj"),
      grupoComFonte("STF", "https://a.gov.br/stf"),
    ]);
    expect(url).toBe("https://a.gov.br/stf");
  });

  test("retorna undefined quando não há fonte", () => {
    expect(buscarFontePrimaria("SEM", [])).toBeUndefined();
  });

  test("retorna undefined quando nenhum grupo corresponde", () => {
    const url = buscarFontePrimaria("STJ", [grupoComFonte("STF", "https://a.gov.br/stf")]);
    expect(url).toBeUndefined();
  });

  test("ignora fonte inativa e retorna undefined quando só há inativa", () => {
    const url = buscarFontePrimaria("STF", [
      { nome: "STF", fontes: [{ url: "https://antiga", ativo: false }] },
    ]);
    expect(url).toBeUndefined();
  });

  test("grupo correspondente sem nenhuma fonte retorna undefined", () => {
    const url = buscarFontePrimaria("STF", [{ nome: "STF", fontes: [] }]);
    expect(url).toBeUndefined();
  });

  test("casa um segmento quando o rótulo da planilha junta vários grupos com ponto e vírgula", () => {
    const url = buscarFontePrimaria(
      "MAILING RP - Sessão Especial; MAILING RP - Sessão Solene; Ministros do STF",
      [grupoComFonte("Ministros do STF", "https://stf.jus.br/min")],
    );
    expect(url).toBe("https://stf.jus.br/min");
  });

  test("escolhe a primeira fonte ativa na ordem do catálogo quando dois segmentos têm fonte", () => {
    // Regra nova (substitui "mais antiga por created_at" do banco): vence quem vem antes no array.
    const url = buscarFontePrimaria("MAILING RP - Sessão Solene; Ministros do STF", [
      grupoComFonte("Ministros do STF", "https://primeira.gov.br"),
      grupoComFonte("MAILING RP - Sessão Solene", "https://segunda.gov.br"),
    ]);
    expect(url).toBe("https://primeira.gov.br");
  });

  test("ignora segmentos vazios gerados por ponto e vírgula sobrando", () => {
    const url = buscarFontePrimaria("; Ministros do STF ;", [
      grupoComFonte("Ministros do STF", "https://stf.jus.br/min"),
    ]);
    expect(url).toBe("https://stf.jus.br/min");
  });

  test("sigla curta da planilha casa o nome formal cadastrado (contenção)", () => {
    // Planilha manda "CNJ"; cadastro tem o nome completo "Conselho Nacional de Justiça (CNJ)".
    const url = buscarFontePrimaria("CNJ; MAILING RP - Sessão Especial; MAILING RP - Sessão Solene", [
      grupoComFonte("Conselho Nacional de Justiça (CNJ)", "https://www.cnj.jus.br/composicao-atual/"),
    ]);
    expect(url).toBe("https://www.cnj.jus.br/composicao-atual/");
  });

  test("contenção não confunde siglas parecidas (CNJ ≠ CNMP)", () => {
    const url = buscarFontePrimaria("CNJ", [
      grupoComFonte("Conselho Nacional do Ministério Público (CNMP)", "https://cnmp"),
      grupoComFonte("Conselho Nacional de Justiça (CNJ)", "https://cnj"),
    ]);
    expect(url).toBe("https://cnj");
  });

  test("match exato tem precedência sobre contenção", () => {
    const url = buscarFontePrimaria("MAILING RP - Sessão Solene; Ministros do STF", [
      grupoComFonte("Ministros do STM", "https://stm"),
      grupoComFonte("Ministros do STF", "https://stf"),
    ]);
    expect(url).toBe("https://stf");
  });

  test("segmento curto demais (<3) não casa por contenção", () => {
    // "PR" (2 letras) não pode casar "Presidente da República" só porque cabe dentro.
    const url = buscarFontePrimaria("PR", [grupoComFonte("Presidente da República", "https://planalto")]);
    expect(url).toBeUndefined();
  });
});

describe("resolverGrupoEFonte", () => {
  test("grupo casado devolve nome canônico, URL e sem sugestões", () => {
    const r = resolverGrupoEFonte("CNJ; MAILING RP - Sessão Especial", [
      grupoComFonte("Conselho Nacional de Justiça (CNJ)", "https://cnj"),
    ]);
    expect(r.grupoCanonico).toBe("Conselho Nacional de Justiça (CNJ)");
    expect(r.url).toBe("https://cnj");
    expect(r.sugestoes).toHaveLength(0);
  });

  test("grupo casado sem fonte ativa devolve canônico com url indefinida", () => {
    const r = resolverGrupoEFonte("Defensor Público Geral da União", [
      { nome: "Defensor Público Geral da União", fontes: [] },
    ]);
    expect(r.grupoCanonico).toBe("Defensor Público Geral da União");
    expect(r.url).toBeUndefined();
  });

  test("nenhum grupo casa → sem canônico, com sugestões próximas", () => {
    const r = resolverGrupoEFonte("Governador de São Paulo", [grupoComFonte("Governadores", "https://gov")]);
    expect(r.grupoCanonico).toBeUndefined();
    expect(r.sugestoes).toContain("Governadores");
  });
});

describe("listarGruposComFonte", () => {
  test("mapeia responsáveis e marca temFonte com a primeira fonte ativa", () => {
    const grupos = listarGruposComFonte([
      {
        nome: "Ministros do STF",
        responsavel1: "Ramena",
        responsavel2: "Daniela",
        backup: "Maria Ines",
        emailResp1: "ramena@senado.leg.br",
        fontes: [{ url: "https://stf.jus.br/x", ativo: true }],
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].responsavel1).toBe("Ramena");
    expect(grupos[0].emailResp2).toBeUndefined();
    expect(grupos[0].temFonte).toBe(true);
    expect(grupos[0].fonteUrl).toBe("https://stf.jus.br/x");
  });

  test("ignora fontes inativas: temFonte falso e fonteUrl indefinida", () => {
    const grupos = listarGruposComFonte([
      { nome: "Governadores", responsavel1: "Marcus", fontes: [{ url: "https://antiga.gov.br", ativo: false }] },
    ]);
    expect(grupos[0].temFonte).toBe(false);
    expect(grupos[0].fonteUrl).toBeUndefined();
  });

  test("grupo sem fontes resulta em temFonte falso", () => {
    const grupos = listarGruposComFonte([{ nome: "Ex-Senadores", responsavel1: "Fernanda", fontes: [] }]);
    expect(grupos[0].temFonte).toBe(false);
  });

  test("ordena por nome e não muta o catálogo recebido", () => {
    const entrada: GrupoCatalogo[] = [
      { nome: "Zeladoria", fontes: [] },
      { nome: "Assessorias", fontes: [] },
    ];
    const grupos = listarGruposComFonte(entrada);
    expect(grupos.map((g) => g.nome)).toEqual(["Assessorias", "Zeladoria"]);
    expect(entrada.map((g) => g.nome)).toEqual(["Zeladoria", "Assessorias"]);
  });
});
