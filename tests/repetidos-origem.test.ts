import { describe, expect, test } from "vitest";
import type { OcorrenciaRepetida } from "@/lib/repetidos-base";
import { semTseQuandoHaOrigem } from "@/lib/repetidos-origem";

const oc = (grupoRegra: string, cargo: string): OcorrenciaRepetida => ({
  grupo: grupoRegra, grupoRegra, chave: "ana", cargo, ex: false, possivelSaida: false, origem: "contatos",
  nivel: { nivel: "5.9", nominata: "x" },
});

describe("semTseQuandoHaOrigem", () => {
  test("TSE + STJ: a ocorrência do TSE sai da disputa", () => {
    const r = semTseQuandoHaOrigem([oc("Ministros do TSE", "Ministro do Tribunal Superior Eleitoral"), oc("Ministros do STJ", "Ministro do STJ")]);
    expect(r.aplicada).toBe(true);
    expect(r.ocorrencias.map((o) => o.grupoRegra)).toEqual(["Ministros do STJ"]);
  });

  test("TSE + STF: a ocorrência do TSE sai da disputa", () => {
    const r = semTseQuandoHaOrigem([oc("Ministros do TSE", "Ministra do Tribunal Superior Eleitoral"), oc("Ministros do STF", "Ministra do STF")]);
    expect(r.aplicada).toBe(true);
    expect(r.ocorrencias.map((o) => o.grupoRegra)).toEqual(["Ministros do STF"]);
  });

  test("Presidente do TSE + STF: nada sai", () => {
    const r = semTseQuandoHaOrigem([oc("Ministros do TSE", "Presidente do Tribunal Superior Eleitoral"), oc("Ministros do STF", "Ministro do STF")]);
    expect(r.aplicada).toBe(false);
    expect(r.ocorrencias).toHaveLength(2);
  });

  test("Vice-Presidente do TSE + STJ: sai (vice não é presidência)", () => {
    const r = semTseQuandoHaOrigem([oc("Ministros do TSE", "Vice-Presidente do Tribunal Superior Eleitoral"), oc("Ministros do STJ", "Ministro do STJ")]);
    expect(r.aplicada).toBe(true);
    expect(r.ocorrencias.map((o) => o.grupoRegra)).toEqual(["Ministros do STJ"]);
  });

  test("Ministro Substituto no TSE + STJ: sai", () => {
    const r = semTseQuandoHaOrigem([oc("Ministros do TSE", "Ministro Substituto do TSE"), oc("Ministros do STJ", "Ministro do STJ")]);
    expect(r.aplicada).toBe(true);
  });

  test("TSE sozinho, ou TSE + Senadores: nada muda", () => {
    const so = [oc("Ministros do TSE", "Ministro do TSE")];
    expect(semTseQuandoHaOrigem(so)).toEqual({ ocorrencias: so, aplicada: false });
    const r = semTseQuandoHaOrigem([oc("Ministros do TSE", "Ministro do TSE"), oc("Senadores", "Senador")]);
    expect(r.aplicada).toBe(false);
    expect(r.ocorrencias).toHaveLength(2);
  });

  test("não muta a lista recebida", () => {
    const entrada = [oc("Ministros do TSE", "Ministro do TSE"), oc("Ministros do STJ", "Ministro do STJ")];
    semTseQuandoHaOrigem(entrada);
    expect(entrada).toHaveLength(2);
  });
});
