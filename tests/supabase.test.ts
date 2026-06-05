import { describe, expect, test, vi } from "vitest";
import { buscarFontePrimaria } from "@/lib/supabase";

function fakeClient(linhas: { url: string }[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: linhas, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("buscarFontePrimaria", () => {
  test("retorna a primeira URL ativa do grupo", async () => {
    const url = await buscarFontePrimaria(fakeClient([{ url: "https://a.gov.br" }]), "STF");
    expect(url).toBe("https://a.gov.br");
  });

  test("retorna undefined quando não há fonte", async () => {
    const url = await buscarFontePrimaria(fakeClient([]), "SEM");
    expect(url).toBeUndefined();
  });
});
