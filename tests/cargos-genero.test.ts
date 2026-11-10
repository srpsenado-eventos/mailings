import { describe, expect, test } from "vitest";
import { CARGOS_FEMININOS, CARGOS_MASCULINOS, generoDoCargo, neutralizarGenero } from "@/lib/cargos";
import { FUNCOES_DE_TRIBUNAL, GRUPOS_DE_TRIBUNAL, ehGrupoDeTribunal } from "@/data/cargos-tribunal";
import { normalizarTexto } from "@/lib/normalize";

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

describe("grupos de tribunal (spec 2026-10-30 §3.2)", () => {
  test("os seis segmentos de tribunal do catálogo são grupos de tribunal", () => {
    for (const g of ["Ministros do STF", "Ministros do STJ", "Ministros do TSE", "Ministros do TST", "Ministros do STM", "Ministros do TCU"]) {
      expect(ehGrupoDeTribunal(g)).toBe(true);
    }
    expect(GRUPOS_DE_TRIBUNAL).toHaveLength(6);
  });

  test("outros grupos e grupo ausente não são de tribunal", () => {
    expect(ehGrupoDeTribunal("Ministros de Estado")).toBe(false);
    expect(ehGrupoDeTribunal("Governadores")).toBe(false);
    expect(ehGrupoDeTribunal(undefined)).toBe(false);
  });

  test("as funções de tribunal estão normalizadas e no masculino", () => {
    for (const f of FUNCOES_DE_TRIBUNAL) {
      expect(f).toBe(neutralizarGenero(normalizarTexto(f)));
    }
    expect(FUNCOES_DE_TRIBUNAL).toContain("vice-presidente");
    expect(FUNCOES_DE_TRIBUNAL).toContain("corregedor-geral");
  });
});

describe("generoDoCargo (léxico único, usado por match e tratamento)", () => {
  test("um gênero explícito é reconhecido; marcador genérico, os dois gêneros ou nenhum ficam indeterminados", () => {
    expect(generoDoCargo("Ministra do STF")).toBe("feminino");
    expect(generoDoCargo("Corregedor-Geral")).toBe("masculino");
    expect(generoDoCargo("Ministro(a)")).toBe("indeterminado");
    expect(generoDoCargo("Ministro/Ministra")).toBe("indeterminado");
    expect(generoDoCargo("Presidente")).toBe("indeterminado");
    expect(generoDoCargo(undefined)).toBe("indeterminado");
  });
});
