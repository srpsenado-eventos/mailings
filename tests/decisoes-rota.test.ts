import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { armazemDecisoesEmArquivo, armazemDecisoesEmMemoria, tratarRegistroDeDecisao } from "@/lib/armazem-decisoes";
import type { HistoricoDecisoes } from "@/lib/decisoes";

const registro = (extra: Record<string, unknown> = {}) => ({
  tipo: "mesma_pessoa", data: "2026-10-26", quem: "Marina e Clóvis", observacao: "Convidar pelo TSE",
  validacao: "validado", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"], ...extra,
});

const corpo = (nome = "Ana Fictícia", extra: Record<string, unknown> = {}) => ({ nome, nomes: [], registro: registro(extra) });

describe("tratarRegistroDeDecisao", () => {
  let pasta: string;
  let caminho: string;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "fiscal-decisoes-rota-"));
    caminho = join(pasta, "decisoes.json");
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  test("registro válido grava o caso e devolve o histórico", async () => {
    // Arrange
    const armazem = armazemDecisoesEmArquivo(caminho);
    // Act
    const r = await tratarRegistroDeDecisao(corpo(), armazem);
    // Assert
    expect(r.status).toBe(200);
    expect(r.corpo.ok).toBe(true);
    expect(r.corpo.historico?.casos.map((c) => c.nome)).toEqual(["Ana Fictícia"]);
    expect((await armazem.ler()).casos).toHaveLength(1);
  });

  test("duas chamadas em sequência, cada uma com um caso, deixam os dois no arquivo", async () => {
    // Arrange: cada chamada com o seu armazém, como duas abas abertas
    await tratarRegistroDeDecisao(corpo("Ana Fictícia"), armazemDecisoesEmArquivo(caminho));
    // Act
    await tratarRegistroDeDecisao(corpo("Rui Fictício"), armazemDecisoesEmArquivo(caminho));
    // Assert
    const gravado = JSON.parse(await readFile(caminho, "utf8")) as HistoricoDecisoes;
    expect(gravado.casos.map((c) => c.nome)).toEqual(["Ana Fictícia", "Rui Fictício"]);
  });

  test("duas chamadas ao mesmo tempo deixam os dois casos no arquivo", async () => {
    await Promise.all([
      tratarRegistroDeDecisao(corpo("Ana Fictícia"), armazemDecisoesEmArquivo(caminho)),
      tratarRegistroDeDecisao(corpo("Rui Fictício"), armazemDecisoesEmArquivo(caminho)),
    ]);
    const gravado = JSON.parse(await readFile(caminho, "utf8")) as HistoricoDecisoes;
    expect(gravado.casos.map((c) => c.nome).sort()).toEqual(["Ana Fictícia", "Rui Fictício"]);
  });

  test("arquivo com JSON quebrado responde 500 e não sobrescreve o arquivo", async () => {
    // Arrange
    await writeFile(caminho, "{ quebrado", "utf8");
    // Act
    const r = await tratarRegistroDeDecisao(corpo(), armazemDecisoesEmArquivo(caminho));
    // Assert
    expect(r.status).toBe(500);
    expect(r.corpo.ok).toBe(false);
    expect(r.corpo.message).toContain("decisoes.json");
    expect(await readFile(caminho, "utf8")).toBe("{ quebrado");
  });

  test("corpo sem registro.tipo responde 400 com mensagem clara", async () => {
    const { tipo: _tipo, ...semTipo } = registro();
    const armazem = armazemDecisoesEmMemoria();
    const r = await tratarRegistroDeDecisao({ nome: "Ana Fictícia", nomes: [], registro: semTipo }, armazem);
    expect(r.status).toBe(400);
    expect(r.corpo.ok).toBe(false);
    expect(r.corpo.message).toMatch(/tipo/);
    expect((await armazem.ler()).casos).toHaveLength(0);
  });

  test.each([
    ["corpo que não é objeto", "texto"],
    ["sem nome", { nomes: [], registro: registro() }],
    ["nomes que não são lista de textos", { nome: "Ana Fictícia", nomes: [1], registro: registro() }],
    ["sem registro", { nome: "Ana Fictícia", nomes: [] }],
    ["data fora do formato", corpo("Ana Fictícia", { data: "26/10/2026" })],
    ["validação desconhecida", corpo("Ana Fictícia", { validacao: "talvez" })],
    ["grupos ausentes", corpo("Ana Fictícia", { grupos: undefined })],
    ["grupos vazios", corpo("Ana Fictícia", { grupos: [] })],
    ["data que não existe", corpo("Ana Fictícia", { data: "2026-13-45" })],
    ["31 de fevereiro", corpo("Ana Fictícia", { data: "2026-02-31" })],
    ["mesma_pessoa sem convidaPor", corpo("Ana Fictícia", { convidaPor: undefined })],
    ["nome só com tratamento", corpo("Dr.")],
    ["quem vazio", corpo("Ana Fictícia", { quem: "" })],
    ["quem só com espaços", corpo("Ana Fictícia", { quem: "   " })],
  ])("%s responde 400", async (_caso, valor) => {
    const r = await tratarRegistroDeDecisao(valor, armazemDecisoesEmMemoria());
    expect(r.status).toBe(400);
    expect(r.corpo.ok).toBe(false);
    expect(r.corpo.message).toBeTruthy();
  });

  test("quem vazio responde 400 dizendo que falta quem decidiu, e nada é gravado", async () => {
    // Arrange
    const armazem = armazemDecisoesEmMemoria();
    // Act
    const r = await tratarRegistroDeDecisao(corpo("Ana Fictícia", { quem: "  " }), armazem);
    // Assert
    expect(r.status).toBe(400);
    expect(r.corpo.message).toMatch(/quem/);
    expect((await armazem.ler()).casos).toHaveLength(0);
  });

  test("campos que não são do registro não vão para o arquivo", async () => {
    const armazem = armazemDecisoesEmMemoria();
    await tratarRegistroDeDecisao(corpo("Ana Fictícia", { telefone: "61 0000-0000", email: "a@b.c" }), armazem);
    const [r] = (await armazem.ler()).casos[0].registros;
    expect(r).not.toHaveProperty("telefone");
    expect(r).not.toHaveProperty("email");
  });

  test("pessoas_diferentes sem convidaPor é aceito", async () => {
    const r = await tratarRegistroDeDecisao(corpo("Ana Fictícia", { tipo: "pessoas_diferentes", convidaPor: undefined }), armazemDecisoesEmMemoria());
    expect(r.status).toBe(200);
  });
});
