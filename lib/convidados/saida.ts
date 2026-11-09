import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { REGRAS_TEXTO } from "@/lib/convidados/regras-texto";
import { textoDaSituacao } from "@/lib/convidados/tratar";
import {
  CABECALHO_PRODASEN,
  CAMPOS_MODELO,
  TEXTO_TIPO_ACHADO,
  type Achado,
  type LinhaTratada,
  type MetaRodada,
  type Rodada,
  type TipoAchado,
} from "@/lib/convidados/tipos";

/** Cores em ARGB, como o exceljs pede. */
export const CORES = {
  amarelo: "FFFFF2CC",
  laranja: "FFF8CBAD",
  verde: "FFE2EFDA",
  cinza: "FFE7E6E6",
  azul: "FFDDEBF7",
  cabecalho: "FF1F4E78",
} as const;

const FONTE = "Arial";
const COLUNA_REVISAO = 27;

const MARCA_DO_ACHADO: Readonly<Record<TipoAchado, string>> = {
  validar: "VALIDAR",
  revisar: "REVISAR",
  ja_outro_grupo: "ATENÇÃO",
  repetida: "ATENÇÃO",
  endereco_diferente: "ATENÇÃO",
  conferir_duplicidade: "ATENÇÃO",
  ja_grupo_escolhido: "OK",
  endereco_novo: "INFO",
};

const COMO_LER = [
  "Aba 'Simulacao': cada campo em duas colunas, RECEBIDO e GRAVADO. Amarelo = a ferramenta mudou o valor; laranja = precisa de revisão humana; azul = alterado por inferência, validar; verde = já cadastrado no grupo escolhido (era o esperado); cinza = linha que não entra no arquivo de importação.",
  "Aba 'Modelo PRODASEN': cópia exata do arquivo de importação gerado ao lado ('Importacao PRODASEN - <grupo> - <data>.xlsx'), só com as linhas 'Novo: importar', já com os ajustes.",
  "Aba 'Revisoes': só o que pede ação humana, uma linha por achado, com a sugestão da ferramenta e a coluna 'Decisão' em branco para preencher.",
  "Aba 'Regras': as regras aplicadas nesta rodada, na ordem.",
  "Tratamento e Endereçamento chegam preenchidos na lista; a ferramenta só confere pela tabela de tratamentos e aponta divergência, sem mudar o valor.",
  "Grupo não vai no arquivo: é escolhido no Contatos na hora de subir o lote. Aqui ele serve só para a duplicidade.",
];

function paraArrayBuffer(buffer: ExcelJS.Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function preencher(cell: ExcelJS.Cell, argb: string): void {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function temCor(cell: ExcelJS.Cell): boolean {
  return (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb !== undefined;
}

function cabecalhoAzul(ws: ExcelJS.Worksheet): void {
  ws.getRow(1).eachCell((c) => {
    c.font = { name: FONTE, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    preencher(c, CORES.cabecalho);
    c.alignment = { vertical: "middle", wrapText: true };
  });
}

function fonteDasCelulas(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row, numero) => {
    if (numero === 1) return;
    row.eachCell({ includeEmpty: true }, (c) => {
      c.font = { name: FONTE, size: 10 };
      c.alignment = { vertical: "top", wrapText: true };
    });
  });
}

function larguras(ws: ExcelJS.Worksheet, valores: number[]): void {
  valores.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

function linhasDoArquivo(rodada: Rodada): string[][] {
  return rodada.linhas
    .filter((l) => l.entraNoArquivo)
    .map((l) => [...CAMPOS_MODELO.map((c) => l.gravado[c]), "", ""]);
}

function escreverLinhasDoArquivo(ws: ExcelJS.Worksheet, rodada: Rodada, primeiraLinha: number): void {
  linhasDoArquivo(rodada).forEach((valores, i) => {
    const row = ws.getRow(primeiraLinha + i);
    valores.forEach((v, j) => {
      const cell = row.getCell(j + 1);
      cell.value = v;
      cell.numFmt = "@";
    });
    row.commit();
  });
}

const ERRO_MODELO = "Modelo do PRODASEN com cabeçalho diferente do esperado";
const LARGURAS_PRODASEN = [24, 18, 30, 18, 12, 28, 12, 22, 24, 20, 8, 24, 28];
const ULTIMA_LINHA_FORMATADA = 500;
const UFS_DO_MODELO = "AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO";

/** Confere o cabeçalho do modelo com a xlsx (SheetJS), que lê o dialeto do arquivo real do PRODASEN. */
function conferirModelo(modelo: ArrayBuffer): void {
  const wb = XLSX.read(modelo, { type: "array" });
  const aba = wb.Sheets["Contatos"];
  if (!aba) throw new Error(ERRO_MODELO);
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, defval: "" });
  const cabecalho = (linhas[0] ?? []).map((v) => String(v));
  const igual = cabecalho.length === CABECALHO_PRODASEN.length && CABECALHO_PRODASEN.every((c, i) => cabecalho[i] === c);
  if (!igual) throw new Error(ERRO_MODELO);
}

export async function gerarImportacao(rodada: Rodada, modelo: ArrayBuffer): Promise<ArrayBuffer> {
  conferirModelo(modelo);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contatos", { views: [{ state: "frozen", ySplit: 1, topLeftCell: "A2" }] });
  LARGURAS_PRODASEN.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  for (let r = 2; r <= ULTIMA_LINHA_FORMATADA; r += 1) {
    for (let c = 1; c <= CABECALHO_PRODASEN.length; c += 1) ws.getCell(r, c).numFmt = "@";
  }
  const cab = ws.getRow(1);
  CABECALHO_PRODASEN.forEach((nome, i) => {
    const cell = cab.getCell(i + 1);
    cell.value = nome;
    cell.font = { name: "Carlito", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    preencher(cell, "FF0F6CBD");
  });
  cab.height = 24;
  escreverLinhasDoArquivo(ws, rodada, 2);
  for (let r = 2; r <= ULTIMA_LINHA_FORMATADA; r += 1) {
    ws.getCell(r, 11).dataValidation = { type: "list", allowBlank: true, formulae: [`"${UFS_DO_MODELO}"`] };
  }
  return paraArrayBuffer(await wb.xlsx.writeBuffer());
}

function descricaoDaLista(meta: MetaRodada): string {
  const linhas = `linhas ${meta.primeiraLinha} a ${meta.ultimaLinha}`;
  if (meta.origem === "camara") return `${meta.listaNome} (planilha do site da Câmara, deputados em exercício, aba '${meta.aba}', ${linhas})`;
  return `${meta.listaNome} (aba '${meta.aba}', ${linhas})`;
}

function resumo(wb: ExcelJS.Workbook, rodada: Rodada, meta: MetaRodada): void {
  const ws = wb.addWorksheet("Resumo");
  const c = rodada.contagens;
  const titulo = ws.addRow(["Tratamento da lista de convidados"]);
  const pares: [string, string | number][] = [
    ["Lista recebida", descricaoDaLista(meta)],
    ["Grupo escolhido ao rodar", rodada.grupo],
    ["Base do Contatos usada", meta.baseNome],
    ["Base de endereços usada", meta.enderecosNome],
    ["Listas de referência", meta.referencias.length > 0 ? meta.referencias.join(", ") : "nenhuma encontrada"],
    ["Gerado em", `${meta.geradoEm} · ${meta.comando}`],
  ];
  pares.forEach((p) => ws.addRow(p));
  ws.addRow([]);
  const cab = ws.addRow(["Situação", "Qtd"]);
  const contagens: [string, number][] = [
    ["Linhas na lista", c.linhas],
    ["Novo: importar (entram no arquivo PRODASEN)", c.novos],
    ["   com campo alterado pela ferramenta", c.novosAlterados],
    ["   com VALIDAR (inferência a confirmar)", c.novosValidar],
    ["   com REVISAR (a ferramenta não resolveu sozinha)", c.novosRevisar],
    ["Já no Contatos: no grupo escolhido (fora do arquivo; era o esperado)", c.jaGrupoEscolhido],
    ["Já no Contatos: em outro grupo (fora do arquivo; incluir no grupo lá dentro)", c.jaOutroGrupo],
    ["Repetida na própria lista (fora do arquivo)", c.repetidas],
    ["Fora do arquivo: Tratamento ou Endereçamento vazio", c.semProtocolo],
    ["Endereço novo para contato já cadastrado", c.enderecoNovo],
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

function textoRevisao(l: LinhaTratada): string {
  return l.achados.map((a) => `${MARCA_DO_ACHADO[a.tipo]}: ${a.motivo}`).join(" | ");
}

function textoOcorrencias(l: LinhaTratada): string {
  const certas = l.ocorrencias.map((o) => `Id ${o.id} · ${o.grupo}`).join(" · ");
  const parciais = l.conferirDuplicidade.map((o) => `Conferir: Id ${o.id} · ${o.grupo} (nome parcial)`).join(" · ");
  return [certas, parciais].filter((t) => t !== "").join(" · ");
}

function ehValidarDoCampo(l: LinhaTratada, campo: string): boolean {
  return l.marcas.includes("validar") && l.achados.some((a: Achado) => a.tipo === "validar" && a.campo === campo);
}

function simulacao(wb: ExcelJS.Workbook, rodada: Rodada): void {
  const ws = wb.addWorksheet("Simulacao");
  ws.addRow([
    "Linha na lista", "Situação",
    ...CAMPOS_MODELO.flatMap((campo) => [`${campo} RECEBIDO`, `${campo} GRAVADO`]),
    "Campos alterados", "Regras aplicadas", "Revisão / validação", "Trecho que não coube",
    "Já no Contatos (Id · grupo)", "Referência (Câmara / TSE)",
  ]);
  for (const l of rodada.linhas) {
    const revisao = textoRevisao(l);
    const row = ws.addRow([
      l.linha, textoDaSituacao(l),
      ...CAMPOS_MODELO.flatMap((campo) => [l.recebido[campo], l.gravado[campo]]),
      l.camposAlterados.join(", "), l.regras.join("; "), revisao, l.trechoQueNaoCoube,
      textoOcorrencias(l), l.referencia,
    ]);
    CAMPOS_MODELO.forEach((campo, i) => {
      if (!l.camposAlterados.includes(campo)) return;
      preencher(row.getCell(4 + i * 2), ehValidarDoCampo(l, campo) ? CORES.azul : CORES.amarelo);
    });
    const jaNoGrupo = l.situacao === "ja_grupo_escolhido";
    if (jaNoGrupo) {
      preencher(row.getCell(COLUNA_REVISAO), CORES.verde);
      preencher(row.getCell(29), CORES.verde);
    } else if (/REVISAR|ATENÇÃO/.test(revisao)) {
      preencher(row.getCell(COLUNA_REVISAO), CORES.laranja);
    } else if (revisao.includes("VALIDAR")) {
      preencher(row.getCell(COLUNA_REVISAO), CORES.azul);
    }
    if (!l.entraNoArquivo) {
      for (let i = 1; i <= 30; i += 1) {
        const cell = row.getCell(i);
        if (!temCor(cell)) preencher(cell, CORES.cinza);
      }
    }
  }
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, [10, 30, ...CAMPOS_MODELO.flatMap(() => [22, 22]), 20, 40, 60, 30, 36, 30]);
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1, topLeftCell: "C2" }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 30 } };
}

function modeloProdasen(wb: ExcelJS.Workbook, rodada: Rodada): void {
  const ws = wb.addWorksheet("Modelo PRODASEN");
  ws.addRow([...CABECALHO_PRODASEN]);
  escreverLinhasDoArquivo(ws, rodada, 2);
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, CABECALHO_PRODASEN.map(() => 22));
}

function corDoTipo(tipo: TipoAchado): string | undefined {
  if (tipo === "validar") return CORES.azul;
  if (tipo === "ja_grupo_escolhido") return CORES.verde;
  if (tipo === "endereco_novo") return undefined;
  return CORES.laranja;
}

function revisoes(wb: ExcelJS.Workbook, rodada: Rodada): void {
  const ws = wb.addWorksheet("Revisoes");
  ws.addRow(["Linha na lista", "Nome", "Tipo", "Campo", "Valor recebido", "Sugestão da ferramenta", "Motivo", "Decisão (preencher)"]);
  for (const a of rodada.linhas.flatMap((l) => l.achados)) {
    const row = ws.addRow([a.linha, a.nome, TEXTO_TIPO_ACHADO[a.tipo], a.campo, a.valorRecebido, a.sugestao, a.motivo, ""]);
    const cor = corDoTipo(a.tipo);
    if (cor) preencher(row.getCell(3), cor);
  }
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, [10, 36, 34, 16, 36, 36, 70, 30]);
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
}

function regras(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet("Regras");
  ws.addRow(["Regra", "Como é aplicada"]);
  REGRAS_TEXTO.forEach((r) => ws.addRow([r.titulo, r.texto]));
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, [40, 120]);
}

export async function gerarConferencia(rodada: Rodada, meta: MetaRodada): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  resumo(wb, rodada, meta);
  simulacao(wb, rodada);
  modeloProdasen(wb, rodada);
  revisoes(wb, rodada);
  regras(wb);
  return paraArrayBuffer(await wb.xlsx.writeBuffer());
}
