import { describe, expect, test } from "vitest";
import { rotuloDaOpcaoDeGrupo } from "@/lib/painel";

describe("rotuloDaOpcaoDeGrupo", () => {
  test("rótulo curto fica como está", () => {
    expect(rotuloDaOpcaoDeGrupo("Senadores")).toBe("Senadores");
  });

  test("rótulo de exatamente 60 caracteres não é cortado", () => {
    const r = "a".repeat(60);
    expect(rotuloDaOpcaoDeGrupo(r)).toBe(r);
  });

  test("rótulo longo é cortado em 60 caracteres, contando a reticência", () => {
    const r = "Grupo combinado; ".repeat(30);
    const out = rotuloDaOpcaoDeGrupo(r);
    expect(out).toHaveLength(60);
    expect(out.endsWith("…")).toBe(true);
    expect(r.startsWith(out.slice(0, 59))).toBe(true);
  });
});
