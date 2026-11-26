import type ExcelJS from "exceljs";

/** Estilo comum das planilhas de saída do tratamento de convidados (cores, fonte, cabeçalho, larguras). */

/** Cores em ARGB, como o exceljs pede. */
export const CORES = {
  amarelo: "FFFFF2CC",
  laranja: "FFF8CBAD",
  verde: "FFE2EFDA",
  cinza: "FFE7E6E6",
  azul: "FFDDEBF7",
  cabecalho: "FF1F4E78",
} as const;

export const FONTE = "Arial";

export function paraArrayBuffer(buffer: ExcelJS.Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function preencher(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Primeira linha em negrito branco sobre azul, com quebra de texto. */
export function cabecalhoAzul(ws: ExcelJS.Worksheet): void {
  ws.getRow(1).eachCell((c) => {
    c.font = { name: FONTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    preencher(c, CORES.cabecalho);
    c.alignment = { vertical: "middle", wrapText: true };
  });
}

/** Fonte e alinhamento de todas as células a partir da segunda linha. */
export function fonteDasCelulas(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row, numero) => {
    if (numero === 1) return;
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { name: FONTE, size: 10 };
      c.alignment = { vertical: "top", wrapText: true };
    });
  });
}

export function larguras(ws: ExcelJS.Worksheet, valores: readonly number[]): void {
  valores.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}
