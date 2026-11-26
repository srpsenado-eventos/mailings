import { describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { compararComSite } from "@/lib/convidados/divergencias";
import { gerarDivergencias, type MetaDivergencias } from "@/lib/convidados/saida-divergencias";
import { CORES } from "@/lib/convidados/saida-estilo";
import { CAMPOS_MODELO } from "@/lib/convidados/tipos";
import { HISTORICO_VAZIO } from "@/lib/decisoes";
import { DEPUTADOS_DO_SITE, GRUPO_DEPUTADOS, linhasTratadas } from "./fixtures/convidados/divergencias";

const META: MetaDivergencias = {
  listaNome: "Lista Exemplo - Deputados Federais.xlsx",
  arquivoCamara: "deputado.xls",
  dataCamara: "25/11/2026",
  grupo: GRUPO_DEPUTADOS,
};
const COLUNA_SITUACAO = 1 + CAMPOS_MODELO.length + 1;

const divergencias = () => compararComSite(linhasTratadas(), DEPUTADOS_DO_SITE);
const planilha = async () => XLSX.read(await gerarDivergencias(divergencias(), META), { type: "array" });
const matriz = (wb: XLSX.WorkBook, aba: string) => XLSX.utils.sheet_to_json<string[]>(wb.Sheets[aba], { header: 1, defval: "" });

describe("planilha de divergências com o site da Câmara", () => {
  test("três abas na ordem da spec", async () => {
    const wb = await planilha();
    expect(wb.SheetNames).toEqual(["Lista original", "Divergencias", "Resumo"]);
  });

  test("Lista original: 'Linha na lista' e os 11 campos do modelo nos valores gravados, uma linha por linha da lista", async () => {
    const m = matriz(await planilha(), "Lista original");
    expect(m[0]).toEqual(["Linha na lista", ...CAMPOS_MODELO]);
    expect(m).toHaveLength(4);
    expect(m[1][0]).toBe(9);
    expect(m[1][1]).toBe("Ana Exemplo");
    expect(m[2][1]).toBe("J. Exemplo Silva");
    expect(m[3][1]).toBe("Carlos Saiu Exemplo");
    expect(m[1][5]).toBe("70160900");
  });

  test("Divergencias: cabeçalho com a situação (arquivo e data), as colunas do site e o registro do GT", async () => {
    const m = matriz(await planilha(), "Divergencias");
    expect(m[0]).toEqual([
      "Linha na lista", ...CAMPOS_MODELO,
      "Situação no site da Câmara (deputado.xls, 25/11/2026)",
      "Nome parlamentar (site)", "Nome civil (site)", "UF (site)", "Partido (site)", "Titular/Suplente/Efetivado (site)",
      "Registro do GT (duplicidade / grupo do convite)",
    ]);
  });

  test("Divergencias: 2 Permanece, 1 Saiu e 1 Entrou no fim, com linha na lista vazia e os valores de §15.2", async () => {
    const m = matriz(await planilha(), "Divergencias");
    expect(m).toHaveLength(5);
    expect(m.slice(1).map((l) => l[COLUNA_SITUACAO - 1])).toEqual(["Permanece", "Permanece", "Saiu", "Entrou"]);
    const permanece = m[2];
    expect(permanece.slice(COLUNA_SITUACAO, COLUNA_SITUACAO + 5)).toEqual(["Zé Exemplo", "José Exemplo Silva", "SP", "PY", "Titular"]);
    const saiu = m[3];
    expect(saiu.slice(COLUNA_SITUACAO, COLUNA_SITUACAO + 5)).toEqual(["", "", "", "", ""]);
    const entrou = m[4];
    expect(entrou[0]).toBe("");
    expect(entrou.slice(1, 1 + CAMPOS_MODELO.length)).toEqual([
      "Beatriz Entrou Exemplo", "Senhora", "A Sua Excelência a Senhora", "Deputada Federal",
      "70160900", "Praça dos Três Poderes", "S/N", "Anexo 4, Gabinete 414", "Zona Cívico-Administrativa", "Brasília", "DF",
    ]);
    expect(entrou.slice(COLUNA_SITUACAO, COLUNA_SITUACAO + 5)).toEqual(["Beatriz Entrou Exemplo", "Beatriz Entrou Exemplo", "MG", "PZ", "Suplente"]);
  });

  test("Divergencias: a coluna do registro do GT vem da linha tratada e fica vazia em quem entrou", async () => {
    const base = [{ id: "1", nome: "Ana Exemplo", grupo: GRUPO_DEPUTADOS }, { id: "2", nome: "Ana Exemplo", grupo: "Senadores" }];
    const linhas = linhasTratadas(undefined, { base, decisoes: HISTORICO_VAZIO });
    const wb = XLSX.read(await gerarDivergencias(compararComSite(linhas, DEPUTADOS_DO_SITE), META), { type: "array" });
    const registro = matriz(wb, "Divergencias").slice(1).map((l) => l[COLUNA_SITUACAO + 5] ?? "");
    expect(registro).toEqual(["Em mais de um grupo · sem decisão registrada", "", "", ""]);
  });

  test("sem base nem histórico a coluna do registro do GT fica vazia em toda linha", async () => {
    const m = matriz(await planilha(), "Divergencias");
    expect(m[0]).toHaveLength(COLUNA_SITUACAO + 6);
    expect(m.slice(1).every((l) => (l[COLUNA_SITUACAO + 5] ?? "") === "")).toBe(true);
  });

  test("Resumo: lista, grupo, arquivo da Câmara, data, contagens e as três frases de leitura", async () => {
    const m = matriz(await planilha(), "Resumo");
    const plano = m.map((l) => l.join(" | ")).join("\n");
    expect(m[0][0]).toBe("Divergências com o site da Câmara");
    expect(plano).toMatch(/Lista \| Lista Exemplo - Deputados Federais.xlsx/);
    expect(plano).toMatch(/Grupo escolhido ao rodar \| Deputados Federais/);
    expect(plano).toMatch(/Planilha do site da Câmara \| deputado.xls/);
    expect(plano).toMatch(/Data da planilha \(modificação do arquivo\) \| 25\/11\/2026/);
    expect(plano).toMatch(/Linhas na lista \| 3/);
    expect(plano).toMatch(/Permanece \(linha que casou um deputado do site\) \| 2/);
    expect(plano).toMatch(/Saiu \(linha sem deputado no site\) \| 1/);
    expect(plano).toMatch(/Entrou \(deputado do site fora da lista\) \| 1/);
    expect(plano).toMatch(/Conferir \(homônimo: linhas da lista e deputados do site\) \| 0/);
    const frases = m.slice(m.findIndex((l) => l[0] === "Como ler") + 1).map((l) => l[0]).filter((t) => t !== "");
    expect(frases).toHaveLength(3);
    expect(frases[0]).toMatch(/^Casamento:/);
    expect(frases[1]).toMatch(/^Permanece:/);
    expect(frases[2]).toMatch(/^Conferir:/);
  });

  test("cores da situação, cabeçalho azul, fonte e painéis congelados", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await gerarDivergencias(divergencias(), META)) as unknown as ExcelJS.Buffer);
    const div = wb.getWorksheet("Divergencias")!;
    const cor = (linha: number, coluna: number) => (div.getCell(linha, coluna).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    expect(cor(1, 1)).toBe(CORES.cabecalho);
    expect(cor(2, COLUNA_SITUACAO)).toBe(CORES.verde);
    expect(cor(3, COLUNA_SITUACAO)).toBe(CORES.verde);
    expect(cor(4, COLUNA_SITUACAO)).toBe(CORES.laranja);
    expect(cor(5, COLUNA_SITUACAO)).toBe(CORES.azul);
    expect(cor(2, 2)).toBeUndefined();
    expect(div.getCell(1, 1).font?.bold).toBe(true);
    expect(div.getCell(2, 1).font?.name).toBe("Arial");
    expect(div.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 1 });
    expect(wb.getWorksheet("Lista original")!.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1 });
  });

  test("linha repetida na própria lista aparece com o texto próprio, sem cor, e fora das contagens", async () => {
    const protocolo = { TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal" };
    const linhas = linhasTratadas([{ NOME: "Pedro Exemplo", ...protocolo }, { NOME: "Pedro Exemplo", ...protocolo }]);
    const site = [{ uf: "BA", nomeParlamentar: "Pedro Exemplo", nomeCivil: "Pedro Exemplo" }];
    const buffer = await gerarDivergencias(compararComSite(linhas, site), META);
    const m = matriz(XLSX.read(buffer, { type: "array" }), "Divergencias");
    expect(m.slice(1).map((l) => l[COLUNA_SITUACAO - 1])).toEqual(["Permanece", "Repetida na própria lista"]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
    const div = wb.getWorksheet("Divergencias")!;
    expect((div.getCell(2, COLUNA_SITUACAO).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(CORES.verde);
    expect((div.getCell(3, COLUNA_SITUACAO).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb).toBeUndefined();
    const resumo = matriz(XLSX.read(buffer, { type: "array" }), "Resumo").map((l) => l.join(" | ")).join("\n");
    expect(resumo).toMatch(/Linhas na lista \| 2/);
    expect(resumo).toMatch(/Permanece \(linha que casou um deputado do site\) \| 1/);
  });

  test("Conferir sai amarelo nas duas pontas", async () => {
    const protocolo = { TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal" };
    const linhas = linhasTratadas([{ NOME: "Pedro Exemplo", ...protocolo }]);
    const site = [
      { uf: "BA", nomeParlamentar: "Pedro Exemplo", nomeCivil: "Pedro Exemplo" },
      { uf: "CE", nomeParlamentar: "Pedro Exemplo", nomeCivil: "Pedro Exemplo" },
    ];
    const buffer = await gerarDivergencias(compararComSite(linhas, site), META);
    const m = matriz(XLSX.read(buffer, { type: "array" }), "Divergencias");
    expect(m.slice(1).map((l) => l[COLUNA_SITUACAO - 1])).toEqual(["Conferir", "Conferir", "Conferir"]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
    const div = wb.getWorksheet("Divergencias")!;
    for (const linha of [2, 3, 4]) {
      expect((div.getCell(linha, COLUNA_SITUACAO).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(CORES.amarelo);
    }
  });
});
