import { describe, expect, test } from "vitest";
import { armazemEmBlob, CAMINHO_RETRATO_BLOB, type ClienteBlob } from "@/lib/armazem-blob";
import { RetratoIlegivelError } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

const retrato = {
  arquivoNome: "c.xlsx", grupos: [], resumo: { total: 0 }, sugestoesCadastro: [],
  geradoEm: "2026-10-03T14:20:22.969Z", planilhaContatos: { nome: "c.xlsx", linhas: 0 }, publicadoEm: "2026-10-04T10:00:00.000Z",
} as unknown as Retrato;

function clienteFalso(inicial?: string) {
  const objetos = new Map<string, string>();
  if (inicial !== undefined) objetos.set(CAMINHO_RETRATO_BLOB, inicial);
  const cliente: ClienteBlob = {
    ler: async (caminho) => objetos.get(caminho),
    gravar: async (caminho, corpo) => { objetos.set(caminho, corpo); },
  };
  return { cliente, objetos };
}

describe("armazemEmBlob", () => {
  test("ausente devolve undefined, sem erro", async () => {
    expect(await armazemEmBlob(clienteFalso().cliente).lerRetrato()).toBeUndefined();
  });
  test("grava no caminho fixo e lê de volta igual", async () => {
    const { cliente, objetos } = clienteFalso();
    await armazemEmBlob(cliente).gravarRetrato(retrato);
    expect([...objetos.keys()]).toEqual([CAMINHO_RETRATO_BLOB]);
    expect(await armazemEmBlob(cliente).lerRetrato()).toEqual(retrato);
  });
  test("JSON inválido e retrato sem campos lançam RetratoIlegivelError", async () => {
    await expect(armazemEmBlob(clienteFalso("{nao é json").cliente).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
    await expect(armazemEmBlob(clienteFalso('{"geradoEm":"x"}').cliente).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
  });
  test("erro do cliente ao ler ou gravar sobe como está (não vira retrato ausente)", async () => {
    const quebrado: ClienteBlob = { ler: async () => { throw new Error("blob fora do ar"); }, gravar: async () => { throw new Error("blob fora do ar"); } };
    await expect(armazemEmBlob(quebrado).lerRetrato()).rejects.toThrow("blob fora do ar");
    await expect(armazemEmBlob(quebrado).gravarRetrato(retrato)).rejects.toThrow("blob fora do ar");
  });
});
