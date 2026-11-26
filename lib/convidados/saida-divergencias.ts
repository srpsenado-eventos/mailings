import ExcelJS from "exceljs";
import {
  TEXTO_SITUACAO_DIVERGENCIA,
  type Divergencias,
  type EntradaDoSite,
  type LinhaDivergencia,
  type SituacaoDivergencia,
} from "./divergencias";
import { TITULO_COLUNA_REGISTRO_GT } from "./registro-gt";
import { cabecalhoAzul, CORES, FONTE, fonteDasCelulas, larguras, paraArrayBuffer, preencher } from "./saida-estilo";
import { CAMPOS_MODELO, type Valores } from "./tipos";

/**
 * Planilha `Divergencias Camara - Deputados Federais - <data>.xlsx` (spec 2026-11-08 §16.5):
 * "Lista original", "Divergencias" e "Resumo". A coluna do registro do GT vem de `LinhaTratada.registroGt` (§16.6).
 */

/** `dataCamara` já formatada "DD/MM/AAAA" (data de modificação do `deputado.xls`). */
export interface MetaDivergencias {
  listaNome: string;
  arquivoCamara: string;
  dataCamara: string;
  grupo: string;
}

const COLUNAS_DO_SITE = ["Nome parlamentar (site)", "Nome civil (site)", "UF (site)", "Partido (site)", "Titular/Suplente/Efetivado (site)"] as const;
const COLUNA_SITUACAO = 1 + CAMPOS_MODELO.length + 1;
const TOTAL_COLUNAS = COLUNA_SITUACAO + COLUNAS_DO_SITE.length + 1;
const LARGURAS_MODELO: readonly number[] = [10, ...CAMPOS_MODELO.map(() => 22)];

/** Linha repetida na própria lista fica sem cor: não entra no casamento nem nas contagens. */
const COR_DA_SITUACAO: Readonly<Partial<Record<SituacaoDivergencia, string>>> = {
  permanece: CORES.verde,
  saiu: CORES.laranja,
  entrou: CORES.azul,
  conferir: CORES.amarelo,
};

function colorirSituacao(row: ExcelJS.Row, situacao: SituacaoDivergencia): void {
  const cor = COR_DA_SITUACAO[situacao];
  if (cor !== undefined) preencher(row.getCell(COLUNA_SITUACAO), cor);
}

const COMO_LER = [
  "Casamento: a linha casa o deputado quando o nome da lista, sem acento, caixa nem tratamento, é igual ao nome parlamentar ou ao nome civil do site (qualquer UF); senão, quando casa o nome civil parte a parte, aceitando abreviação ('J.' casa 'José').",
  "Permanece: linha que casou um só deputado. Saiu: linha que não casou nenhum deputado do site. Entrou: deputado do site que nenhuma linha casou, com NOME como no site, Tratamento, Endereçamento e Cargo pelo sexo da planilha e o endereço da Câmara (Praça dos Três Poderes, S/N, Anexo e Gabinete, CEP 70160900), o único que o site informa.",
  "Conferir: homônimo, nas duas pontas: linha que casa mais de um deputado, ou deputado casado por mais de uma linha. Nada nesta planilha muda a situação da linha na rodada nem o arquivo de importação: é planilha de conferência.",
];

const valoresDoModelo = (v: Valores): string[] => CAMPOS_MODELO.map((c) => v[c]);

function listaOriginal(wb: ExcelJS.Workbook, d: Divergencias): void {
  const ws = wb.addWorksheet("Lista original");
  ws.addRow(["Linha na lista", ...CAMPOS_MODELO]);
  d.linhas.forEach(({ linha }) => ws.addRow([linha.linha, ...valoresDoModelo(linha.gravado)]));
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, LARGURAS_MODELO);
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 1, topLeftCell: "B2" }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: LARGURAS_MODELO.length } };
}

function colunasDoSite(deputado: EntradaDoSite["deputado"] | undefined): string[] {
  if (!deputado) return COLUNAS_DO_SITE.map(() => "");
  return [deputado.nomeParlamentar, deputado.nomeCivil, deputado.uf, deputado.partido ?? "", deputado.condicao ?? ""];
}

function linhaDaLista(ws: ExcelJS.Worksheet, item: LinhaDivergencia): void {
  const row = ws.addRow([
    item.linha.linha, ...valoresDoModelo(item.linha.gravado),
    TEXTO_SITUACAO_DIVERGENCIA[item.situacao], ...colunasDoSite(item.deputado), item.linha.registroGt,
  ]);
  colorirSituacao(row, item.situacao);
}

function linhaDoSite(ws: ExcelJS.Worksheet, item: EntradaDoSite): void {
  const row = ws.addRow(["", ...valoresDoModelo(item.valores), TEXTO_SITUACAO_DIVERGENCIA[item.situacao], ...colunasDoSite(item.deputado), ""]);
  colorirSituacao(row, item.situacao);
}

function divergencias(wb: ExcelJS.Workbook, d: Divergencias, meta: MetaDivergencias): void {
  const ws = wb.addWorksheet("Divergencias");
  ws.addRow([
    "Linha na lista", ...CAMPOS_MODELO,
    `Situação no site da Câmara (${meta.arquivoCamara}, ${meta.dataCamara})`, ...COLUNAS_DO_SITE, TITULO_COLUNA_REGISTRO_GT,
  ]);
  d.linhas.forEach((item) => linhaDaLista(ws, item));
  d.entraram.forEach((item) => linhaDoSite(ws, item));
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, [...LARGURAS_MODELO, 30, 28, 32, 10, 12, 24, 60]);
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1, topLeftCell: "C2" }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TOTAL_COLUNAS } };
}

function resumo(wb: ExcelJS.Workbook, d: Divergencias, meta: MetaDivergencias): void {
  const ws = wb.addWorksheet("Resumo");
  const titulo = ws.addRow(["Divergências com o site da Câmara"]);
  const pares: [string, string][] = [
    ["Lista", meta.listaNome],
    ["Grupo escolhido ao rodar", meta.grupo],
    ["Planilha do site da Câmara", meta.arquivoCamara],
    ["Data da planilha (modificação do arquivo)", meta.dataCamara],
  ];
  pares.forEach((p) => ws.addRow(p));
  ws.addRow([]);
  const cab = ws.addRow(["Situação", "Qtd"]);
  const c = d.contagens;
  const contagens: [string, number][] = [
    ["Linhas na lista", d.linhas.length],
    ["Permanece (linha que casou um deputado do site)", c.permanece],
    ["Saiu (linha sem deputado no site)", c.saiu],
    ["Entrou (deputado do site fora da lista)", c.entrou],
    ["Conferir (homônimo: linhas da lista e deputados do site)", c.conferir],
  ];
  contagens.forEach((p) => ws.addRow(p));
  ws.addRow([]);
  const como = ws.addRow(["Como ler"]);
  COMO_LER.forEach((frase) => ws.addRow([frase]));
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: FONTE, size: 10 };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
  titulo.getCell(1).font = { name: FONTE, size: 12, bold: true };
  [cab.getCell(1), cab.getCell(2), como.getCell(1)].forEach((cell) => {
    cell.font = { name: FONTE, size: 10, bold: true };
  });
  larguras(ws, [70, 90]);
}

export async function gerarDivergencias(d: Divergencias, meta: MetaDivergencias): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  listaOriginal(wb, d);
  divergencias(wb, d, meta);
  resumo(wb, d, meta);
  return paraArrayBuffer(await wb.xlsx.writeBuffer());
}
