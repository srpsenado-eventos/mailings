import { describe, expect, test } from "vitest";
import { CARGOS_FEMININOS, CARGOS_MASCULINOS, neutralizarGenero } from "@/lib/cargos";

describe("neutralizarGenero", () => {
  test("troca cada feminino do léxico pelo masculino, palavra a palavra", () => {
    expect(neutralizarGenero("senadora")).toBe("senador");
    expect(neutralizarGenero("governadora do estado do acre")).toBe("governador do estado do acre");
    expect(neutralizarGenero("encarregada de negocios")).toBe("encarregado de negocios");
    expect(neutralizarGenero("vice-governadora")).toBe("vice-governador");
    expect(neutralizarGenero("presidenta")).toBe("presidente");
  });

  test("não mexe em texto sem feminino do léxico, nem em 'secretaria' (nome de órgão)", () => {
    expect(neutralizarGenero("ministro de estado")).toBe("ministro de estado");
    expect(neutralizarGenero("secretaria-geral da presidencia")).toBe("secretaria-geral da presidencia");
    expect(neutralizarGenero("")).toBe("");
  });

  test("cada feminino do léxico vira o masculino da mesma posição, com o mesmo radical", () => {
    CARGOS_FEMININOS.forEach((f, i) => {
      expect(neutralizarGenero(f)).toBe(CARGOS_MASCULINOS[i]);
      expect(CARGOS_MASCULINOS[i].slice(0, 4)).toBe(f.slice(0, 4));
    });
  });

  test("nome herdado de Object.prototype não vaza", () => {
    expect(neutralizarGenero("constructor")).toBe("constructor");
  });
});
