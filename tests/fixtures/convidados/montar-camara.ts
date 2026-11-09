import * as XLSX from "xlsx";

export const CABECALHO_CAMARA = [
  "Nome Parlamentar", "Partido", "UF", "Titular/Suplente/Efetivado", "Endereço", "Anexo", "Endereço (continuação)", "Gabinete",
  "Endereço (complemento)", "Telefone", "Fax", "Mês Aniversário", "Dia Aniversário", "Correio Eletrônico", "Nome sem Acento", "Tratamento", "Nome Civil",
];

export interface LinhaCamara {
  nomeParlamentar: string;
  anexo: string;
  gabinete: string;
  enderecoComplemento: string;
  tratamento: string;
}

interface OpcoesCamara {
  aba?: string;
  semColunas?: string[];
}

/** Planilha fictícia no layout do `deputado.xls` do site da Câmara; anexo e gabinete numéricos são gravados como número, como no arquivo real. */
export function montarPlanilhaDaCamara(linhas: Partial<LinhaCamara>[], opcoes: OpcoesCamara = {}): ArrayBuffer {
  const { aba = "Plan1", semColunas = [] } = opcoes;
  const cabecalho = CABECALHO_CAMARA.map((c) => (semColunas.includes(c) ? "" : c));
  const numeroOuTexto = (v: string): string | number => (/^\d+$/.test(v) ? Number(v) : v);
  const dados = linhas.map((l) => [
    l.nomeParlamentar ?? "", "PX", "DF", "Titular", "Câmara dos Deputados, Edifício Anexo", numeroOuTexto(l.anexo ?? "4"), ", gabinete nº",
    numeroOuTexto(l.gabinete ?? "414"), l.enderecoComplemento ?? "Brasília - DF - CEP 70160-900", "3215-0000", "", 1, 1, "x@example.org",
    "Nome Sem Acento", l.tratamento ?? "Exmo. Senhor Deputado", "Nome Civil Exemplo",
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cabecalho, ...dados]), aba);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
