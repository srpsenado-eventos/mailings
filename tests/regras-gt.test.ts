import { describe, expect, test } from "vitest";
import { REGRAS_GT } from "@/data/regras-gt";
import { regrasDoGrupo, textoCurto, textoLongo } from "@/lib/regras-gt";

describe("regras do GT em vigor (spec 2026-11-04 §3.2)", () => {
  test("as cinco regras de 04/11 com os títulos da spec", () => {
    expect(REGRAS_GT.map((r) => [r.data, r.titulo])).toEqual([
      ["2026-11-04", "Nome"], ["2026-11-04", "Pessoa em mais de um grupo"], ["2026-11-04", "STM: patentes"], ["2026-11-04", "STM: abreviação"], ["2026-11-04", "Tratamento"],
    ]);
    expect(REGRAS_GT.every((r) => r.texto.length > 20)).toBe(true);
  });
  test("regras por grupo: STM tem duas, Governadores uma, Senadores nenhuma; rótulo com variação casa pelo catálogo", () => {
    expect(regrasDoGrupo("Ministros do STM").map((r) => r.titulo)).toEqual(["STM: patentes", "STM: abreviação"]);
    expect(regrasDoGrupo("Governadores").map((r) => r.titulo)).toEqual(["Tratamento"]);
    expect(regrasDoGrupo("Senadores")).toEqual([]);
    expect(regrasDoGrupo("rótulo desconhecido")).toEqual([]);
  });
  test("textos curto e longo", () => {
    const r = { data: "2026-11-04", titulo: "Nome", texto: "O nome é como no site." };
    expect(textoCurto(r)).toBe("Regra do GT de 04/11: Nome");
    expect(textoLongo(r)).toBe("04/11/2026 · Nome — O nome é como no site.");
  });
});
