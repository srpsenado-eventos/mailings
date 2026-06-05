import { describe, expect, test } from "vitest";
import { buscarFontePrimaria } from "@/lib/supabase";

interface LinhaFake {
  url: string;
  grupos: { nome: string };
}

/** Cliente fake que ignora o query builder e devolve as linhas já "ordenadas". */
function fakeClient(linhas: LinhaFake[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: linhas, error: null }),
        }),
      }),
    }),
  } as never;
}

describe("buscarFontePrimaria", () => {
  test("retorna a primeira URL ativa do grupo com nome idêntico", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([{ url: "https://a.gov.br", grupos: { nome: "STF" } }]),
      "STF",
    );
    expect(url).toBe("https://a.gov.br");
  });

  test("tolera diferença de caixa e acento entre planilha e cadastro", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([{ url: "https://gov.br/sp", grupos: { nome: "Governador de São Paulo" } }]),
      "governador de sao paulo",
    );
    expect(url).toBe("https://gov.br/sp");
  });

  test("escolhe o grupo certo quando há fontes de vários grupos", async () => {
    const url = await buscarFontePrimaria(
      fakeClient([
        { url: "https://a.gov.br/stj", grupos: { nome: "STJ" } },
        { url: "https://a.gov.br/stf", grupos: { nome: "STF" } },
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
      fakeClient([{ url: "https://a.gov.br/stf", grupos: { nome: "STF" } }]),
      "STJ",
    );
    expect(url).toBeUndefined();
  });
});
