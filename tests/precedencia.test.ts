import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";
import { PRECEDENCIA } from "@/data/precedencia";
import { casaSegmento } from "@/lib/catalogo";
import { normalizarTexto } from "@/lib/normalize";
import { compararNivel, nivelDoCargo, regraDoSegmento } from "@/lib/repetidos";

const regra = (grupo: string) => {
  const r = PRECEDENCIA.find((x) => x.grupo === grupo);
  if (!r) throw new Error(`regra ausente: ${grupo}`);
  return r;
};

describe("dados da precedência", () => {
  test("níveis no formato da Nominata e texto preenchido", () => {
    for (const r of PRECEDENCIA) {
      for (const n of [r.presidente, r.distritoFederal, r.nivel]) {
        if (!n) continue;
        expect(n.nivel).toMatch(/^\d+(\.\d+)+$/);
        expect(n.nominata.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("um grupo aparece uma vez só", () => {
    const nomes = PRECEDENCIA.map((r) => normalizarTexto(r.grupo));
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  test("todo grupo da tabela existe no catálogo", () => {
    for (const r of PRECEDENCIA) {
      const seg = normalizarTexto(r.grupo);
      expect(CATALOGO.some((g) => casaSegmento(normalizarTexto(g.nome), seg)), r.grupo).toBe(true);
    }
  });
});

describe("regraDoSegmento", () => {
  test.each([
    ["ministros do stf", "Ministros do STF"],
    ["senadores", "Senadores"],
    ["senadores (acre a goias)", "Senadores"],
    ["presidente do senado federal", "Presidente do Senado"],
    ["defensor", "Defensor Público Geral da União"],
    ["ex-presidentes do senado", "Ex-Presidentes do Senado"],
    ["embaixadores (africa do sul ate eua)", "Embaixadores"],
  ])("%s casa %s", (seg, grupo) => {
    expect(regraDoSegmento(seg)?.grupo).toBe(grupo);
  });

  test.each([
    "senadores eleitos",
    "governadores eleitos",
    "governadoras eleitas",
    "grupo eventos - pp 2027 - piloto",
    "mailing rp - sessao especial",
    "presidente",
  ])("%s fica fora", (seg) => {
    expect(regraDoSegmento(seg)).toBeUndefined();
  });
});

describe("regraDoSegmento e o filtro de eleitos", () => {
  test("eleitoral não é barrado como eleitos: casa por contenção", () => {
    expect(regraDoSegmento("ministros do tse (eleitoral)")?.grupo).toBe("Ministros do TSE");
  });
});

describe("nivelDoCargo", () => {
  test("presidente do tribunal sobe de nível; vice-presidente não", () => {
    expect(nivelDoCargo(regra("Ministros do STF"), "Presidente do Supremo Tribunal Federal")?.nivel).toBe("3.3");
    expect(nivelDoCargo(regra("Ministros do STF"), "Vice-Presidente do Supremo Tribunal Federal")?.nivel).toBe("4.9");
    expect(nivelDoCargo(regra("Ministros do TSE"), "Presidenta do Tribunal Superior Eleitoral")?.nivel).toBe("4.8");
    expect(nivelDoCargo(regra("Ministros do TSE"), "Ministra do Tribunal Superior Eleitoral")?.nivel).toBe("5.9");
  });

  test("Ministro Presidente do tribunal também sobe de nível", () => {
    const tse = regra("Ministros do TSE");
    expect(nivelDoCargo(tse, "Ministro Presidente do Tribunal Superior Eleitoral")?.nivel).toBe("4.8");
    expect(nivelDoCargo(tse, "Ministra Presidente do Tribunal Superior Eleitoral")?.nivel).toBe("4.8");
    expect(nivelDoCargo(tse, "Ministro-Presidente do Tribunal Superior Eleitoral")?.nivel).toBe("4.8");
  });

  test("presidência de turma, seção, comissão ou conselho fica no nível do grupo", () => {
    const stj = regra("Ministros do STF");
    for (const cargo of [
      "Presidente da Primeira Turma", "Presidente da Segunda Seção", "Ministro Presidente da Terceira Turma",
      "Presidente da Comissão de Regimento", "Presidente do Conselho Nacional",
    ]) {
      expect(nivelDoCargo(stj, cargo)?.nivel, cargo).toBe(stj.nivel?.nivel);
    }
  });

  test("governador do Distrito Federal tem nível próprio", () => {
    expect(nivelDoCargo(regra("Governadores"), "Governador do Distrito Federal")?.nivel).toBe("4.11");
    expect(nivelDoCargo(regra("Governadores"), "Governadora do Estado de Goiás")?.nivel).toBe("4.12");
  });

  test("grupo fora da Nominata não tem nível", () => {
    expect(nivelDoCargo(regra("Embaixadores"), "Embaixador")).toBeUndefined();
  });
});

describe("compararNivel", () => {
  test("ordena como a Nominata", () => {
    const ordenados = ["4.10", "3.3", "4.9", "4.10.1", "6.1.1", "5.9"].sort(compararNivel);
    expect(ordenados).toEqual(["3.3", "4.9", "4.10", "4.10.1", "5.9", "6.1.1"]);
    expect(compararNivel("4.13", "4.13")).toBe(0);
  });
});
