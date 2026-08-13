import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";

describe("catálogo real (data/catalogo.ts)", () => {
  test("tem os 33 grupos migrados do banco", () => {
    expect(CATALOGO).toHaveLength(33);
  });

  test("tem as 21 fontes migradas do banco", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(21);
  });

  test("todo grupo tem nome não-vazio", () => {
    const semNome = CATALOGO.filter((g) => g.nome.trim().length === 0);
    expect(semNome).toEqual([]);
  });

  test("não há nome de grupo repetido", () => {
    const nomes = CATALOGO.map((g) => g.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  test("toda fonte tem URL http(s)", () => {
    const invalidas = CATALOGO.flatMap((g) => g.fontes)
      .map((f) => f.url)
      .filter((url) => !/^https?:\/\//i.test(url));
    expect(invalidas).toEqual([]);
  });

  test("todo grupo com fonte tem ao menos uma ativa", () => {
    const semAtiva = CATALOGO.filter((g) => g.fontes.length > 0 && !g.fontes.some((f) => f.ativo));
    expect(semAtiva.map((g) => g.nome)).toEqual([]);
  });
});
