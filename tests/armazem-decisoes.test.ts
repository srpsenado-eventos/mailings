import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  armazemDecisoesEmArquivo, armazemDecisoesEmBlob, armazemDecisoesEmMemoria, atualizarDecisoes, CAMINHO_DECISOES_BLOB,
  CAMINHO_DECISOES_PADRAO, DecisoesIlegiveisError, validarHistorico,
} from "@/lib/armazem-decisoes";
import { CAMINHO_RETRATO_BLOB, type ClienteBlob } from "@/lib/armazem-blob";
import { HISTORICO_VAZIO, registrar, type HistoricoDecisoes, type RegistroManual } from "@/lib/decisoes";

const registro = (extra: Partial<RegistroManual> = {}): RegistroManual => ({
  tipo: "mesma_pessoa", data: "2026-10-26", quem: "GT (planilha de 29/10)", observacao: "Convidar pelo TSE",
  validacao: "validado", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"], ...extra,
});

const umCaso = (nome = "Ana Fictícia", r: RegistroManual = registro()): HistoricoDecisoes =>
  registrar(HISTORICO_VAZIO, nome, [], r);

describe("validarHistorico", () => {
  test("aceita o histórico gravado por registrar e devolve igual", () => {
    // Arrange
    const h = umCaso();
    // Act
    const lido = validarHistorico(JSON.parse(JSON.stringify(h)));
    // Assert
    expect(lido).toEqual(h);
  });

  test("aceita entrada de coleta no histórico", () => {
    const h = umCaso();
    const comColeta = {
      ...h,
      casos: [{ ...h.casos[0], registros: [...h.casos[0].registros, { tipo: "coleta", data: "2026-10-30", situacao: "pendente", grupos: ["Ministros do STJ"] }] }],
    };
    expect(validarHistorico(comColeta).casos[0].registros).toHaveLength(2);
  });

  test("descarta campos que não são do registro (nada de telefone ou e-mail no arquivo)", () => {
    const h = umCaso();
    const sujo = { ...h, casos: [{ ...h.casos[0], registros: [{ ...h.casos[0].registros[0], telefone: "61 0000-0000" }] }] };
    expect(validarHistorico(sujo).casos[0].registros[0]).not.toHaveProperty("telefone");
  });

  test.each([
    ["não objeto", "x"],
    ["versão desconhecida", { versao: 2, casos: [] }],
    ["casos ausentes", { versao: 1 }],
    ["caso sem chaves", { versao: 1, casos: [{ id: "a", nome: "A", registros: [] }] }],
    ["registro sem tipo", { versao: 1, casos: [{ id: "a", nome: "A", chaves: ["a"], registros: [{ data: "2026-10-26", grupos: [] }] }] }],
    ["coleta com situação desconhecida", { versao: 1, casos: [{ id: "a", nome: "A", chaves: ["a"], registros: [{ tipo: "coleta", data: "2026-10-26", situacao: "talvez", grupos: [] }] }] }],
  ])("%s lança DecisoesIlegiveisError", (_nome, valor) => {
    expect(() => validarHistorico(valor)).toThrow(DecisoesIlegiveisError);
  });
});

describe("armazemDecisoesEmMemoria", () => {
  test("começa vazio e devolve o que gravou", async () => {
    const a = armazemDecisoesEmMemoria();
    expect(await a.ler()).toEqual(HISTORICO_VAZIO);
    await a.gravar(umCaso());
    expect((await a.ler()).casos).toHaveLength(1);
  });
});

describe("armazemDecisoesEmArquivo", () => {
  let pasta: string;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "fiscal-decisoes-"));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  test("o caminho padrão é .fiscal/decisoes.json", () => {
    expect(CAMINHO_DECISOES_PADRAO).toBe(join(".fiscal", "decisoes.json"));
  });

  test("arquivo ausente devolve HISTORICO_VAZIO, sem erro", async () => {
    const a = armazemDecisoesEmArquivo(join(pasta, "sub", "decisoes.json"));
    expect(await a.ler()).toEqual(HISTORICO_VAZIO);
  });

  test("grava criando a pasta, lê de volta e não deixa temporário", async () => {
    const caminho = join(pasta, "sub", "decisoes.json");
    const a = armazemDecisoesEmArquivo(caminho);
    await a.gravar(umCaso());
    await a.gravar(umCaso("Rui Fictício"));
    expect((await a.ler()).casos.map((c) => c.nome)).toEqual(["Rui Fictício"]);
    expect(await readdir(join(pasta, "sub"))).toEqual(["decisoes.json"]);
  });

  test("JSON quebrado lança DecisoesIlegiveisError", async () => {
    const caminho = join(pasta, "decisoes.json");
    await writeFile(caminho, "{ isto não é json", "utf8");
    await expect(armazemDecisoesEmArquivo(caminho).ler()).rejects.toBeInstanceOf(DecisoesIlegiveisError);
  });

  test("JSON válido com estrutura errada lança DecisoesIlegiveisError", async () => {
    const caminho = join(pasta, "decisoes.json");
    await writeFile(caminho, JSON.stringify({ versao: 1, casos: "nada" }), "utf8");
    await expect(armazemDecisoesEmArquivo(caminho).ler()).rejects.toBeInstanceOf(DecisoesIlegiveisError);
  });
});

describe("armazemDecisoesEmBlob", () => {
  function clienteFalso(inicial?: string) {
    const objetos = new Map<string, string>();
    if (inicial !== undefined) objetos.set(CAMINHO_DECISOES_BLOB, inicial);
    const cliente: ClienteBlob = {
      ler: async (caminho) => objetos.get(caminho),
      gravar: async (caminho, corpo) => { objetos.set(caminho, corpo); },
    };
    return { cliente, objetos };
  }

  test("o caminho no Blob é separado do retrato", () => {
    expect(CAMINHO_DECISOES_BLOB).toBe("retratos/decisoes.json");
    expect(CAMINHO_DECISOES_BLOB).not.toBe(CAMINHO_RETRATO_BLOB);
  });

  test("ausente devolve HISTORICO_VAZIO", async () => {
    expect(await armazemDecisoesEmBlob(clienteFalso().cliente).ler()).toEqual(HISTORICO_VAZIO);
  });

  test("grava no caminho fixo e lê de volta igual", async () => {
    const { cliente, objetos } = clienteFalso();
    const h = umCaso();
    await armazemDecisoesEmBlob(cliente).gravar(h);
    expect([...objetos.keys()]).toEqual([CAMINHO_DECISOES_BLOB]);
    expect(await armazemDecisoesEmBlob(cliente).ler()).toEqual(h);
  });

  test("JSON inválido lança DecisoesIlegiveisError", async () => {
    await expect(armazemDecisoesEmBlob(clienteFalso("{nao").cliente).ler()).rejects.toBeInstanceOf(DecisoesIlegiveisError);
  });
});

describe("atualizarDecisoes", () => {
  test("duas atualizações ao mesmo tempo no mesmo arquivo guardam as duas", async () => {
    // Arrange
    const pasta = await mkdtemp(join(tmpdir(), "fiscal-decisoes-"));
    const caminho = join(pasta, "decisoes.json");
    try {
      // Act
      await Promise.all([
        atualizarDecisoes(armazemDecisoesEmArquivo(caminho), (h) => registrar(h, "Ana Fictícia", [], registro())),
        atualizarDecisoes(armazemDecisoesEmArquivo(caminho), (h) => registrar(h, "Rui Fictício", [], registro())),
      ]);
      // Assert
      const gravado = JSON.parse(await readFile(caminho, "utf8")) as HistoricoDecisoes;
      expect(gravado.casos.map((c) => c.nome).sort()).toEqual(["Ana Fictícia", "Rui Fictício"]);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });

  test("não grava quando a alteração devolve o mesmo histórico", async () => {
    let gravacoes = 0;
    const a = armazemDecisoesEmMemoria();
    const contado = { ler: a.ler, gravar: async (h: HistoricoDecisoes) => { gravacoes += 1; await a.gravar(h); } };
    await atualizarDecisoes(contado, (h) => h);
    expect(gravacoes).toBe(0);
  });

  test("falha numa atualização não trava a seguinte", async () => {
    const a = armazemDecisoesEmMemoria();
    await expect(atualizarDecisoes(a, () => { throw new Error("quebrou"); })).rejects.toThrow("quebrou");
    const h = await atualizarDecisoes(a, (atual) => registrar(atual, "Ana Fictícia", [], registro()));
    expect(h.casos).toHaveLength(1);
  });
});
