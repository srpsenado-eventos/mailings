import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { REGRAS_TEXTO } from "@/lib/convidados/regras-texto";
import { TITULO_COLUNA_REGISTRO_GT } from "@/lib/convidados/registro-gt";
import { cabecalhoAzul, CORES, FONTE, fonteDasCelulas, larguras, paraArrayBuffer, preencher } from "@/lib/convidados/saida-estilo";
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

/** As cores moram em `saida-estilo.ts`; seguem exportadas daqui para quem já importava deste módulo. */
export { CORES };

const CABECALHO_SIMULACAO: readonly string[] = [
  "Linha na lista", "Situação",
  ...CAMPOS_MODELO.flatMap((campo) => [`${campo} RECEBIDO`, `${campo} GRAVADO`]),
  "Campos alterados", "Regras aplicadas", "Revisão / validação", "Trecho que não coube",
  "Já no Contatos (Id · grupo)", TITULO_COLUNA_REGISTRO_GT, "Referência (Câmara / TSE)",
];
const colunaDaSimulacao = (titulo: string): number => CABECALHO_SIMULACAO.indexOf(titulo) + 1;
const COLUNA_REVISAO = colunaDaSimulacao("Revisão / validação");
const COLUNA_JA_NO_CONTATOS = colunaDaSimulacao("Já no Contatos (Id · grupo)");
const TOTAL_COLUNAS_SIMULACAO = CABECALHO_SIMULACAO.length;
/** Primeira coluna GRAVADO (a do NOME); as seguintes vêm de duas em duas. */
const PRIMEIRA_COLUNA_GRAVADO = colunaDaSimulacao("NOME GRAVADO");

const CABECALHO_REVISOES: readonly string[] = [
  "Linha na lista", "Nome", "Tipo", "Campo", "Valor recebido", "Sugestão da ferramenta", "Motivo", TITULO_COLUNA_REGISTRO_GT, "Decisão (preencher)",
];

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
  "Tratamento e Endereçamento: sem a opção de preencher o protocolo, a ferramenta só confere pela tabela de tratamentos e aponta divergência, sem mudar o valor; com a opção (ligada só depois do aval do GT), campo vazio é preenchido pela regra (eleitos: Senhor(a) / Ao Senhor; demais: tabela v02 para o cargo) e sai como alterado, e campo já preenchido continua só conferido.",
  "Grupo não vai no arquivo: é escolhido no Contatos na hora de subir o lote. Aqui ele serve só para a duplicidade.",
  "Coluna 'Registro do GT (duplicidade / grupo do convite)': o que .fiscal/decisoes.json já diz sobre a pessoa (decisão vigente, grupo do convite, pendências de bloqueio no Posse); 'sem decisão registrada' quando há duplicidade sem decisão; 'registro de decisões não lido' quando o arquivo não pôde ser lido.",
];

function temCor(cell: ExcelJS.Cell): boolean {
  return (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb !== undefined;
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
    ["Gerado em", `${meta.geradoEm} · ${meta.comando}${rodada.preencherProtocolo ? " · protocolo preenchido pela regra" : ""}`],
    ...(meta.divergencias === undefined ? [] : [["Planilha de divergências", meta.divergencias] as [string, string]]),
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
    ["Tratamento ou Endereçamento preenchidos pela ferramenta", c.protocoloPreenchido],
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

/** Cores da linha da Simulacao: campos alterados, coluna de revisão (e a do Contatos no verde) e cinza em quem não entra. */
function colorirLinhaDaSimulacao(row: ExcelJS.Row, l: LinhaTratada, revisao: string): void {
  CAMPOS_MODELO.forEach((campo, i) => {
    if (!l.camposAlterados.includes(campo)) return;
    preencher(row.getCell(PRIMEIRA_COLUNA_GRAVADO + i * 2), ehValidarDoCampo(l, campo) ? CORES.azul : CORES.amarelo);
  });
  if (l.situacao === "ja_grupo_escolhido") {
    preencher(row.getCell(COLUNA_REVISAO), CORES.verde);
    preencher(row.getCell(COLUNA_JA_NO_CONTATOS), CORES.verde);
  } else if (/REVISAR|ATENÇÃO/.test(revisao)) {
    preencher(row.getCell(COLUNA_REVISAO), CORES.laranja);
  } else if (revisao.includes("VALIDAR")) {
    preencher(row.getCell(COLUNA_REVISAO), CORES.azul);
  }
  if (l.entraNoArquivo) return;
  for (let i = 1; i <= TOTAL_COLUNAS_SIMULACAO; i += 1) {
    const cell = row.getCell(i);
    if (!temCor(cell)) preencher(cell, CORES.cinza);
  }
}

function simulacao(wb: ExcelJS.Workbook, rodada: Rodada): void {
  const ws = wb.addWorksheet("Simulacao");
  ws.addRow([...CABECALHO_SIMULACAO]);
  for (const l of rodada.linhas) {
    const revisao = textoRevisao(l);
    const row = ws.addRow([
      l.linha, textoDaSituacao(l),
      ...CAMPOS_MODELO.flatMap((campo) => [l.recebido[campo], l.gravado[campo]]),
      l.camposAlterados.join(", "), l.regras.join("; "), revisao, l.trechoQueNaoCoube,
      textoOcorrencias(l), l.registroGt, l.referencia,
    ]);
    colorirLinhaDaSimulacao(row, l, revisao);
  }
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, [10, 30, ...CAMPOS_MODELO.flatMap(() => [22, 22]), 20, 40, 60, 30, 36, 50, 30]);
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1, topLeftCell: "C2" }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TOTAL_COLUNAS_SIMULACAO } };
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
  ws.addRow([...CABECALHO_REVISOES]);
  for (const l of rodada.linhas) {
    for (const a of l.achados) {
      const row = ws.addRow([a.linha, a.nome, TEXTO_TIPO_ACHADO[a.tipo], a.campo, a.valorRecebido, a.sugestao, a.motivo, l.registroGt, ""]);
      const cor = corDoTipo(a.tipo);
      if (cor) preencher(row.getCell(3), cor);
    }
  }
  fonteDasCelulas(ws);
  cabecalhoAzul(ws);
  larguras(ws, [10, 36, 34, 16, 36, 36, 70, 50, 30]);
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
