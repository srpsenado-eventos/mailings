import { describe, expect, test } from "vitest";
import { neutralizarGenero } from "@/lib/cargos";

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
});
