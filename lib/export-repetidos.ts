import * as XLSX from "xlsx";
import type { SituacaoNoContatos } from "@/lib/decisoes";
import {
  rotuloOrigem, textoDecisao, type AutoridadeRepetida, type OcorrenciaRepetida, type SituacaoRepetida,
} from "@/lib/repetidos";

export const CABECALHO_REPETIDAS = [
  "Nome", "Situação", "Convidar pelo grupo", "Cargo do convite", "Nível na Nominata", "Motivo", "Grupos em que está", "Origem", "Eleição 2026",
  "Decisão do GT", "Data da decisão", "Situação no Contatos",
] as const;

const TEXTO_SITUACAO: Record<SituacaoRepetida, string> = {
  decidido: "Decidido",
  conferir: "Conferir",
  decidido_gt: "Decidido pelo GT",
  tratado: "Tratado no Contatos",
};

/** Situação no Contatos (spec 2026-10-30 §4.1.4); sem efeito ou sem decisão fica vazio. */
export function textoNoContatos(s: SituacaoNoContatos | undefined): string {
  if (s === "tratado") return "Tratado no Contatos";
  if (s === "pendente") return "Pendente no Contatos";
  if (s === "reaberto") return "Reaberto";
  return "";
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`. */
function dataDaDecisao(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

/** Grupo do convite: a ocorrência que convida ou, sem ela (grupo ainda fora do Contatos), o grupo decidido pelo GT. */
function grupoDoConvite(a: AutoridadeRepetida): string {
  if (a.convidaPor) return a.convidaPor.grupoRegra;
  return a.situacao !== "conferir" && a.decisao?.tipo === "mesma_pessoa" ? a.decisao.convidaPor?.trim() ?? "" : "";
}

const ABA = "Em mais de um grupo";

export function descreverOcorrencia(o: OcorrenciaRepetida): string {
  const nivel = o.nivel ? o.nivel.nivel : "fora da Nominata";
  const origem = o.origem === "contatos" ? "" : ` [${rotuloOrigem(o.origem)}]`;
  return `${o.grupoRegra}: ${o.cargo || "cargo vazio"} (${nivel}${o.ex ? ", ex-" : ""})${origem}`;
}

export function linhasRepetidas(lista: readonly AutoridadeRepetida[]): Record<string, string>[] {
  return lista.map((a) => ({
    Nome: a.nome,
    "Situação": TEXTO_SITUACAO[a.situacao],
    "Convidar pelo grupo": grupoDoConvite(a),
    "Cargo do convite": a.convidaPor?.cargo ?? "",
    "Nível na Nominata": a.convidaPor?.nivel ? `${a.convidaPor.nivel.nivel} ${a.convidaPor.nivel.nominata}` : "",
    Motivo: a.motivo,
    "Grupos em que está": a.ocorrencias.map(descreverOcorrencia).join("; "),
    Origem: a.convidaPor ? rotuloOrigem(a.convidaPor.origem) : "",
    "Eleição 2026": a.eleicao ? "Sim" : "",
    "Decisão do GT": a.decisao ? textoDecisao(a.decisao) : "",
    "Data da decisão": a.decisao ? dataDaDecisao(a.decisao.data) : "",
    "Situação no Contatos": textoNoContatos(a.noContatos),
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
