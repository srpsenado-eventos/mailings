import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { armazemEmArquivo, armazemEmMemoria, RetratoIlegivelError } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

const retrato: Retrato = {
  arquivoNome: "c.xlsx",
  grupos: [],
  resumo: {
    total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0,
    enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0,
    gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
  },
  geradoEm: "2026-10-01T17:12:00.000Z",
  planilhaContatos: { nome: "c.xlsx", linhas: 0 },
};

describe("armazemEmMemoria", () => {
  test("começa vazio e devolve o que gravou", async () => {
    const a = armazemEmMemoria();
    expect(await a.lerRetrato()).toBeUndefined();
    await a.gravarRetrato(retrato);
    expect(await a.lerRetrato()).toEqual(retrato);
  });
});

describe("armazemEmArquivo", () => {
  let pasta: string;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "fiscal-"));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  test("arquivo ausente devolve undefined, sem erro", async () => {
    const a = armazemEmArquivo(join(pasta, "sub", "retrato.json"));
    expect(await a.lerRetrato()).toBeUndefined();
  });

  test("grava criando a pasta e lê de volta", async () => {
    const a = armazemEmArquivo(join(pasta, "sub", "retrato.json"));
    await a.gravarRetrato(retrato);
    expect(await a.lerRetrato()).toEqual(retrato);
  });

  test("gravar de novo substitui o arquivo e não deixa temporário", async () => {
    const caminho = join(pasta, "retrato.json");
    const a = armazemEmArquivo(caminho);
    await a.gravarRetrato(retrato);
    await a.gravarRetrato({ ...retrato, geradoEm: "2026-10-02T10:00:00.000Z" });
    expect((await a.lerRetrato())?.geradoEm).toBe("2026-10-02T10:00:00.000Z");
    expect(await readdir(pasta)).toEqual(["retrato.json"]);
  });

  test("JSON inválido lança RetratoIlegivelError", async () => {
    const caminho = join(pasta, "retrato.json");
    await writeFile(caminho, "{ isto não é json", "utf8");
    await expect(armazemEmArquivo(caminho).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
  });

  test("JSON sem geradoEm lança RetratoIlegivelError", async () => {
    const caminho = join(pasta, "retrato.json");
    await writeFile(caminho, JSON.stringify({ grupos: [], resumo: {} }), "utf8");
    await expect(armazemEmArquivo(caminho).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
  });

  test("JSON sem planilhaContatos lança RetratoIlegivelError", async () => {
    // Arrange
    const caminho = join(pasta, "retrato.json");
    await writeFile(caminho, JSON.stringify({ geradoEm: retrato.geradoEm, grupos: [], resumo: {} }), "utf8");
    // Act + Assert
    await expect(armazemEmArquivo(caminho).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
  });

  test("o arquivo gravado é JSON legível por fora", async () => {
    const caminho = join(pasta, "retrato.json");
    await armazemEmArquivo(caminho).gravarRetrato(retrato);
    expect(JSON.parse(await readFile(caminho, "utf8")).geradoEm).toBe(retrato.geradoEm);
  });
});
