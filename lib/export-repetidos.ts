import * as XLSX from "xlsx";
import type { AutoridadeRepetida, OcorrenciaRepetida } from "@/lib/repetidos";

export const CABECALHO_REPETIDAS = [
  "Nome", "Situação", "Convidar pelo grupo", "Cargo do convite", "Nível na Nominata", "Motivo", "Grupos em que está",
] as const;

const ABA = "Em mais de um grupo";

export function descreverOcorrencia(o: OcorrenciaRepetida): string {
  const nivel = o.nivel ? o.nivel.nivel : "fora da Nominata";
  return `${o.grupoRegra}: ${o.cargo || "cargo vazio"} (${nivel}${o.ex ? ", ex-" : ""})`;
}

export function linhasRepetidas(lista: readonly AutoridadeRepetida[]): Record<string, string>[] {
  return lista.map((a) => ({
    Nome: a.nome,
    "Situação": a.situacao === "decidido" ? "Decidido" : "Conferir",
    "Convidar pelo grupo": a.convidaPor?.grupoRegra ?? "",
    "Cargo do convite": a.convidaPor?.cargo ?? "",
    "Nível na Nominata": a.convidaPor?.nivel ? `${a.convidaPor.nivel.nivel} ${a.convidaPor.nivel.nominata}` : "",
    Motivo: a.motivo,
    "Grupos em que está": a.ocorrencias.map(descreverOcorrencia).join("; "),
  }));
}

export function gerarXlsxRepetidas(lista: readonly AutoridadeRepetida[]): ArrayBuffer {
  const linhas = linhasRepetidas(lista);
  const aba = linhas.length > 0
    ? XLSX.utils.json_to_sheet(linhas, { header: [...CABECALHO_REPETIDAS] })
    : XLSX.utils.aoa_to_sheet([[...CABECALHO_REPETIDAS]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aba, ABA);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
