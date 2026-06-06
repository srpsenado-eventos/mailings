import * as XLSX from "xlsx";
import type { ResultadoAnalise, ResultadoContato } from "@/lib/types";

/** Campos mostrados em pares de colunas planilha×site. */
const CAMPOS = [
  { campo: "cargo", rotulo: "Cargo" },
  { campo: "endereco", rotulo: "Endereço" },
  { campo: "telefone", rotulo: "Telefone" },
  { campo: "email", rotulo: "E-mail" },
];

/** Valor do site para um campo: o valor correto, "fonte não informa", ou vazio. */
function valorSiteDe(c: ResultadoContato, campo: string): string {
  const comp = c.comparacoes.find((x) => x.campo === campo);
  if (!comp) return "";
  return comp.situacao === "fonte_nao_informa" ? "fonte não informa" : comp.valorSite ?? "";
}

function valorPlanilhaDe(c: ResultadoContato, campo: string): string {
  return c.comparacoes.find((x) => x.campo === campo)?.valorPlanilha ?? "";
}

export function resultadoParaLinhas(analise: ResultadoAnalise): Record<string, string>[] {
  const linhas: Record<string, string>[] = [];
  for (const g of analise.grupos) {
    for (const c of g.contatos) {
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Nome: c.contato.nome,
        Status: c.semaforo,
        Divergencias: c.camposDivergentes.map((d) => d.campo).join(", "),
        Origem: c.origem,
        Fonte: c.fonteUrl ?? "",
        Observacao: c.observacao ?? "",
      };
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = valorPlanilhaDe(c, f.campo);
        linha[`${f.rotulo} (site)`] = valorSiteDe(c, f.campo);
      }
      linhas.push(linha);
    }
    for (const novo of g.novos) {
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Nome: novo.nome,
        Status: "novo",
        Divergencias: "",
        Origem: "oficial",
        Fonte: g.fonteUrl ?? "",
        Observacao: "Pessoa no site sem correspondência na planilha",
      };
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = "";
        linha[`${f.rotulo} (site)`] = f.campo === "cargo" ? novo.cargo ?? "" : "";
      }
      linhas.push(linha);
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
