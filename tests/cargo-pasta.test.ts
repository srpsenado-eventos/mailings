import { describe, expect, test } from "vitest";
import { GRUPOS_CARGO_PELA_PASTA, situacaoCargoPelaPasta } from "@/lib/cargo-pasta";

describe("situacaoCargoPelaPasta (GT de 13/11: Ministros de Estado, cargo pela pasta)", () => {
  test("só Ministros de Estado usa a regra", () => {
    expect(GRUPOS_CARGO_PELA_PASTA).toContain("Ministros de Estado");
    expect(GRUPOS_CARGO_PELA_PASTA).not.toContain("Ministros do STF");
  });

  test.each([
    ["Ministro de Estado da Fazenda", "Ministro de Estado da Fazenda", "confere"],
    ["Ministra de Estado da Fazenda", "Ministro de Estado da Fazenda", "confere"],
    ["Ministro de Estado da Fazenda", "Ministro de Estado da Agricultura e Pecuária", "divergente"],
    ["Ministro de Estado do Desenvolvimento Agrário e Agricultura Familiar", "Ministro de Estado da Agricultura Familiar e Desenvolvimento Agrário", "confere"],
    ["Ministro de Estado da Controladoria-Geral da União", "Controladoria-Geral da União", "confere"],
    ["Advogado-Geral da União", "Advocacia-Geral da União", "confere"],
    ["Ministro de Estado Chefe da Casa Civil", "Ministra de Estado da Casa Civil da Presidência da República", "divergente"],
  ] as const)("%s × %s → %s", (planilha, pagina, esperado) => {
    expect(situacaoCargoPelaPasta(planilha, pagina)).toBe(esperado);
  });

  test("sem token distintivo em algum lado, cai na régua comum", () => {
    expect(situacaoCargoPelaPasta("Ministro de Estado", "Ministro de Estado")).toBe("confere");
  });
});
