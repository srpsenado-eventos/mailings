import { describe, expect, test } from "vitest";
import { buscarFontePrimaria, listarGruposComFonte } from "@/lib/supabase";

interface FonteFake {
  url: string;
  ativo: boolean;
  created_at: string;
}
interface GrupoFake {
  nome: string;
  fontes: FonteFake[] | null;
}

/**
 * Cliente fake que ignora o query builder e devolve linhas de `grupos` com suas
 * `fontes` embutidas — o mesmo formato do embed grupos→fontes que
 * buscarFontePrimaria passou a usar (caminho robusto, idêntico ao da /grupos).
 */
function fakeClient(grupos: GrupoFake[]) {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: grupos, error: null }),
    }),
  } as never;
}

/** Açúcar para declarar um grupo com uma única fonte ativa. */
function grupoComFonte(nome: string, url: string, created_at = "2024-01-01T00:00:00Z"): GrupoFake {
  return { nome, fontes: [{ url, ativo: true, created_at }] };
}

describe("buscarFontePrimaria", () => {
  test("retorna a primeira URL ativa do grupo com nome idêntico", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([grupoComFonte("STF", "https://a.gov.br")]),
      "STF",
    );
    expect(url).toBe("https://a.gov.br");
  });

  test("tolera diferença de caixa e acento entre planilha e cadastro", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([grupoComFonte("Governador de São Paulo", "https://gov.br/sp")]),
      "governador de sao paulo",
    );
    expect(url).toBe("https://gov.br/sp");
  });

  test("escolhe o grupo certo quando há fontes de vários grupos", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([
        grupoComFonte("STJ", "https://a.gov.br/stj"),
        grupoComFonte("STF", "https://a.gov.br/stf"),
      ]),
      "STF",
    );
    expect(url).toBe("https://a.gov.br/stf");
  });

  test("retorna undefined quando não há fonte", async () => {
    const url = await buscarFontePrimaria(fakeClient([]), "SEM");
    expect(url).toBeUndefined();
  });

  test("retorna undefined quando nenhum grupo corresponde", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([grupoComFonte("STF", "https://a.gov.br/stf")]),
      "STJ",
    );
    expect(url).toBeUndefined();
  });

  test("ignora fonte inativa e retorna undefined quando só há inativa", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([{ nome: "STF", fontes: [{ url: "https://antiga", ativo: false, created_at: "2024-01-01T00:00:00Z" }] }]),
      "STF",
    );
    expect(url).toBeUndefined();
  });

  test("grupo correspondente sem fontes (null) retorna undefined", async () => {
    const url = await buscarFontePrimaria(fakeClient([{ nome: "STF", fontes: null }]), "STF");
    expect(url).toBeUndefined();
  });

  test("casa um segmento quando o rótulo da planilha junta vários grupos com ponto e vírgula", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([grupoComFonte("Ministros do STF", "https://stf.jus.br/min")]),
      "MAILING RP - Sessão Especial; MAILING RP - Sessão Solene; Ministros do STF",
    );
    expect(url).toBe("https://stf.jus.br/min");
  });

  test("escolhe a fonte primária (mais antiga por created_at) quando dois segmentos têm fonte", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([
        grupoComFonte("MAILING RP - Sessão Solene", "https://segunda.gov.br", "2024-02-01T00:00:00Z"),
        grupoComFonte("Ministros do STF", "https://primeira.gov.br", "2024-01-01T00:00:00Z"),
      ]),
      "MAILING RP - Sessão Solene; Ministros do STF",
    );
    expect(url).toBe("https://primeira.gov.br");
  });

  test("ignora segmentos vazios gerados por ponto e vírgula sobrando", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([grupoComFonte("Ministros do STF", "https://stf.jus.br/min")]),
      "; Ministros do STF ;",
    );
    expect(url).toBe("https://stf.jus.br/min");
  });
});

/** Cliente fake para listarGruposComFonte: ignora o builder e devolve as linhas de `grupos`. */
function fakeClientGrupos(linhas: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: linhas, error: null }),
      }),
    }),
  } as never;
}

describe("listarGruposComFonte", () => {
  test("mapeia responsáveis e marca temFonte com a primeira fonte ativa", async () => {
    const grupos = await listarGruposComFonte(
      fakeClientGrupos([
        {
          nome: "Ministros do STF",
          responsavel_1: "Ramena",
          responsavel_2: "Daniela",
          backup: "Maria Ines",
          email_resp_1: "ramena@senado.leg.br",
          email_resp_2: null,
          email_backup: null,
          fontes: [{ url: "https://stf.jus.br/x", ativo: true }],
        },
      ]),
    );
    expect(grupos).toHaveLength(1);
    expect(grupos[0].responsavel1).toBe("Ramena");
    expect(grupos[0].emailResp2).toBeUndefined();
    expect(grupos[0].temFonte).toBe(true);
    expect(grupos[0].fonteUrl).toBe("https://stf.jus.br/x");
  });

  test("ignora fontes inativas: temFonte falso e fonteUrl indefinida", async () => {
    const grupos = await listarGruposComFonte(
      fakeClientGrupos([
        {
          nome: "Governadores",
          responsavel_1: "Marcus",
          responsavel_2: null,
          backup: null,
          email_resp_1: null,
          email_resp_2: null,
          email_backup: null,
          fontes: [{ url: "https://antiga.gov.br", ativo: false }],
        },
      ]),
    );
    expect(grupos[0].temFonte).toBe(false);
    expect(grupos[0].fonteUrl).toBeUndefined();
  });

  test("grupo sem fontes resulta em temFonte falso", async () => {
    const grupos = await listarGruposComFonte(
      fakeClientGrupos([
        {
          nome: "Ex-Senadores",
          responsavel_1: "Fernanda",
          responsavel_2: null,
          backup: null,
          email_resp_1: null,
          email_resp_2: null,
          email_backup: null,
          fontes: null,
        },
      ]),
    );
    expect(grupos[0].temFonte).toBe(false);
  });
});
