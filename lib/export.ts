import * as XLSX from "xlsx";
import type { ResultadoAnalise } from "@/lib/types";

export interface LinhaExport {
  Grupo: string;
  Nome: string;
  Cargo: string;
  Status: string;
  Divergencias: string;
  Origem: string;
  Fonte: string;
  Observacao: string;
}

export function resultadoParaLinhas(analise: ResultadoAnalise): LinhaExport[] {
  const linhas: LinhaExport[] = [];
  for (const g of analise.grupos) {
    for (const c of g.contatos) {
      linhas.push({
        Grupo: g.grupo,
        Nome: c.contato.nome,
        Cargo: c.contato.cargo ?? "",
        Status: c.semaforo,
        Divergencias: c.camposDivergentes.map((d) => d.campo).join(", "),
        Origem: c.origem,
        Fonte: c.fonteUrl ?? "",
        Observacao: c.observacao ?? "",
      });
    }
    for (const novo of g.novos) {
      linhas.push({
        Grupo: g.grupo,
        Nome: novo.nomePolitico ?? novo.nomeCompleto ?? "",
        Cargo: novo.cargo ?? "",
        Status: "novo",
        Divergencias: "",
        Origem: "oficial",
        Fonte: g.fonteUrl ?? "",
        Observacao: "Pessoa no site sem correspondência na planilha",
      });
    }
  }
  return linhas;
}

export function gerarXlsx(analise: ResultadoAnalise): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(resultadoParaLinhas(analise));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultado");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function gerarCsv(analise: ResultadoAnalise): string {
  const ws = XLSX.utils.json_to_sheet(resultadoParaLinhas(analise));
  return XLSX.utils.sheet_to_csv(ws);
}
