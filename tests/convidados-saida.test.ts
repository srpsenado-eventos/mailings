import { describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { CORES, gerarConferencia, gerarImportacao } from "@/lib/convidados/saida";
import { CABECALHO_PRODASEN } from "@/lib/convidados/tipos";
import { montarModeloProdasen } from "./fixtures/convidados/montar";
import { rodadaDoExemplo } from "./fixtures/convidados/exemplo";
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

const meta = { listaNome: "Lista Exemplo.xlsx", primeiraLinha: 9, ultimaLinha: 19, baseNome: "BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx", enderecosNome: "BASE ENDERECO - 05 NOV 2026 15h.xlsx", referencias: ["deputado.xls"], geradoEm: "08/11/2026 10:00", origem: "comando" };
const abas = (buf: ArrayBuffer) => XLSX.read(buf, { type: "array" });

describe("arquivo de importação", () => {
  test("cabeçalho idêntico ao modelo, só as linhas que entram, sem coluna extra", async () => {
    const wb = abas(await gerarImportacao(rodadaDoExemplo(), await montarModeloProdasen()));
    const m = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Contatos"], { header: 1, defval: "" });
    expect(m[0]).toEqual([...CABECALHO_PRODASEN]);
    expect(m.slice(1).filter((l) => l[0] !== "")).toHaveLength(8);
    expect(m[1][0]).toBe("Ana Beatriz Exemplo Souza");
    expect(m[3][4]).toBe("01310100");
    expect(m.every((l) => l.length <= 13)).toBe(true);
    expect(m.some((l) => l[0] === "Helena Modelo Barreto")).toBe(false);
  });
  test("modelo com cabeçalho diferente é erro claro", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["NOME", "GRUPO"]]), "Contatos");
    const modelo = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    await expect(gerarImportacao(rodadaDoExemplo(), modelo)).rejects.toThrow(/cabeçalho/);
  });
});

describe("formato do arquivo de importação", () => {
  test("reproduz cabeçalho, painel, validação de UF e formato texto do modelo", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await gerarImportacao(rodadaDoExemplo(), await montarModeloProdasen())) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("Contatos")!;
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    const c1 = ws.getCell(1, 1);
    expect((c1.fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF0F6CBD");
    expect(c1.font?.bold).toBe(true);
    expect(ws.getCell(2, 5).numFmt).toBe("@");
    expect(ws.getCell(400, 3).numFmt).toBe("@");
    for (const linha of [2, 250, 500]) {
      const validacao = ws.getCell(linha, 11).dataValidation;
      expect(validacao?.type).toBe("list");
      expect(validacao?.formulae?.[0]).toBe('"AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO"');
    }
    expect(ws.getCell(501, 11).dataValidation?.type).toBeUndefined();
  });
});

describe("arquivo de conferência", () => {
  test("cinco abas na ordem e cabeçalhos da Simulacao e da Revisoes", async () => {
    const wb = abas(await gerarConferencia(rodadaDoExemplo(), meta));
    expect(wb.SheetNames).toEqual(["Resumo", "Simulacao", "Modelo PRODASEN", "Revisoes", "Regras"]);
    const sim = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Simulacao"], { header: 1, defval: "" });
    expect(sim[0].slice(0, 4)).toEqual(["Linha na lista", "Situação", "NOME RECEBIDO", "NOME GRAVADO"]);
    expect(sim[0].slice(-6)).toEqual(["Campos alterados", "Regras aplicadas", "Revisão / validação", "Trecho que não coube", "Já no Contatos (Id · grupo)", "Referência (Câmara / TSE)"]);
    expect(sim).toHaveLength(12);
    const rev = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Revisoes"], { header: 1, defval: "" });
    expect(rev[0]).toEqual(["Linha na lista", "Nome", "Tipo", "Campo", "Valor recebido", "Sugestão da ferramenta", "Motivo", "Decisão (preencher)"]);
    expect(rev.slice(1).map((l) => l[2])).toContain("Já no Contatos: grupo escolhido");
    const modelo = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Modelo PRODASEN"], { header: 1, defval: "" });
    expect(modelo[0]).toEqual([...CABECALHO_PRODASEN]);
    expect(modelo).toHaveLength(9);
    const regras = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Regras"], { header: 1, defval: "" });
    expect(regras[0]).toEqual(["Regra", "Como é aplicada"]);
  });
  test("cores: amarelo no gravado alterado, laranja na revisão, verde no grupo escolhido, cinza na linha fora do arquivo", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await gerarConferencia(rodadaDoExemplo(), meta)) as unknown as ExcelJS.Buffer);
    const sim = wb.getWorksheet("Simulacao")!;
    const cor = (linha: number, coluna: number) => (sim.getCell(linha, coluna).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    expect(cor(3, 14)).toBe(CORES.amarelo);
    expect(cor(4, 12)).toBe(CORES.azul);
    expect(cor(6, 27)).toBe(CORES.laranja);
    expect(cor(8, 27)).toBe(CORES.verde);
    expect(cor(11, 1)).toBe(CORES.cinza);
    expect(cor(2, 1)).toBeUndefined();
    expect(cor(1, 1)).toBe(CORES.cabecalho);
    expect(sim.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 1 });
    expect(sim.getCell(2, 1).font?.name).toBe("Arial");
  });
  test("Resumo traz grupo, bases e contagens", async () => {
    const wb = abas(await gerarConferencia(rodadaDoExemplo(), meta));
    const resumo = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Resumo"], { header: 1, defval: "" });
    const plano = resumo.map((l) => l.join(" | ")).join("\n");
    expect(plano).toMatch(/Grupo escolhido ao rodar \| Convidados do presidente eleito - Posse 2027/);
    expect(plano).toMatch(/BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx/);
    expect(plano).toMatch(/Linhas na lista \| 11/);
    expect(plano).toMatch(/Novo: importar \(entram no arquivo PRODASEN\) \| 8/);
    expect(plano).toMatch(/Como ler/);
    expect(plano).toMatch(/Aba 'Regras': as regras aplicadas nesta rodada, na ordem\./);
    expect(plano).toMatch(/Grupo não vai no arquivo: é escolhido no Contatos/);
  });
});
