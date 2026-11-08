import { describe, expect, test } from "vitest";
import { dataNoNomeDaBase, grupoNoNomeDeArquivo, maisRecente, nomeDaPastaDaRodada, nomeImportacao, sufixoDaData } from "@/lib/convidados/rodada-nomes";

describe("nomes da rodada", () => {
  test("sufixo da data no formato DDMMMAAAA", () => {
    expect(sufixoDaData(new Date(2026, 10, 8))).toBe("08NOV2026");
    expect(sufixoDaData(new Date(2027, 0, 5))).toBe("05JAN2027");
  });
  test("grupo no nome do arquivo sai sem acento, sem caracteres proibidos e com 40 caracteres", () => {
    expect(grupoNoNomeDeArquivo("Convidados da Presidência / Posse: 2027")).toBe("Convidados da Presidencia Posse 2027");
    expect(grupoNoNomeDeArquivo("Delegações estrangeiras e organismos intern - 2027")).toHaveLength(40);
    expect(nomeImportacao("Ministros do STF", "08NOV2026")).toBe("Importacao PRODASEN - Ministros do STF - 08NOV2026.xlsx");
  });
  test("segunda rodada no dia ganha sufixo -2 e nunca sobrescreve", () => {
    expect(nomeDaPastaDaRodada("08NOV2026", [])).toBe("08NOV2026");
    expect(nomeDaPastaDaRodada("08NOV2026", ["08NOV2026"])).toBe("08NOV2026-2");
    expect(nomeDaPastaDaRodada("08NOV2026", ["08NOV2026", "08NOV2026-2"])).toBe("08NOV2026-3");
  });
  test("base mais recente pela data do nome, com hora opcional", () => {
    const nomes = ["BASE GRUPOS POSSE - 27 OUT 2026.xlsx", "BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx", "BASE GRUPOS POSSE - 04 NOV 2026.xlsx", "BASE ENDERECO - 05 NOV 2026 15h.xlsx", "lixo.xlsx"];
    expect(maisRecente(nomes, "BASE GRUPOS POSSE")).toBe("BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx");
    expect(maisRecente(nomes, "BASE ENDERECO")).toBe("BASE ENDERECO - 05 NOV 2026 15h.xlsx");
    expect(dataNoNomeDaBase("lixo.xlsx")).toBeUndefined();
    expect(maisRecente(["lixo.xlsx"], "BASE GRUPOS POSSE")).toBeUndefined();
  });
});
