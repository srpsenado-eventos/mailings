import * as XLSX from "xlsx";
import { CABECALHO_PRODASEN, type Valores } from "@/lib/convidados/tipos";

export const CABECALHO_LISTA = ["", "NOME COMPLETO DO CONVIDADO/ NOME POLÍTICO", "ÓRGÃO", "CARGO DO CONVIDADO", "CEP", "LOGRADOURO", "NÚMERO", "COMPLEMENTO", "BAIRRO", "CIDADE", "UF", "TRATAMENTO", "ENDERECAMENTO"];

interface OpcoesLista {
  linhaCabecalho?: number;
  aba?: string;
  semColunas?: string[];
  cepComoNumero?: boolean;
}

function paraBuffer(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function umaAba(nome: string, aoa: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nome);
  return paraBuffer(wb);
}

export function montarListaPadrao(linhas: Partial<Valores & { orgao: string }>[], opcoes: OpcoesLista = {}): ArrayBuffer {
  const { linhaCabecalho = 8, aba = "Lista de Convidados", semColunas = [], cepComoNumero = false } = opcoes;
  const cabecalho = CABECALHO_LISTA.map((r) => (semColunas.includes(r) ? "" : r));
  const dados = linhas.map((l, i) => {
    const cep = l.CEP ?? "";
    return [
      i + 1, l.NOME ?? "", l.orgao ?? "", l.CARGO ?? "",
      cepComoNumero && cep !== "" ? Number(cep) : cep,
      l.LOGRADOURO ?? "", l.NUMERO ?? "", l.COMPLEMENTO ?? "", l.BAIRRO ?? "", l.CIDADE ?? "", l.UF ?? "",
      l.TRATAMENTO ?? "", l.ENDERECAMENTO ?? "",
    ];
  });
  const vazias = Array.from({ length: linhaCabecalho - 1 }, () => [] as unknown[]);
  return umaAba(aba, [...vazias, cabecalho, ...dados]);
}

export function montarBaseGrupos(contatos: { id: string; nome: string; grupo: string; cargo?: string }[]): ArrayBuffer {
  return umaAba("Contatos", [
    ["Id", "Nome", "Grupo", "Cargo", "Tratamento", "Endereçamento"],
    ...contatos.map((c) => [c.id, c.nome, c.grupo, c.cargo ?? "", "", ""]),
  ]);
}

export function montarBaseEnderecos(
  linhas: { contatoId: string; nome?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string; cep?: string; prioritario?: boolean }[],
): ArrayBuffer {
  return umaAba("Enderecos", [
    ["&nbsp;", "Contato Id", "Endereço Id", "Nome", "Logradouro", "Numero", "Complemento", "Bairro", "Cidade", "UF", "País", "CEP", "Prioritário"],
    ...linhas.map((l, i) => [
      "", l.contatoId, `E${i + 1}`, l.nome ?? "", l.logradouro ?? "", l.numero ?? "", l.complemento ?? "",
      l.bairro ?? "", l.cidade ?? "", l.uf ?? "", "Brasil", l.cep ?? "", l.prioritario ? "Sim" : "Não",
    ]),
  ]);
}

export async function montarModeloProdasen(): Promise<ArrayBuffer> {
  return umaAba("Contatos", [[...CABECALHO_PRODASEN]]);
}
