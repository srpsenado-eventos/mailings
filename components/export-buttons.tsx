"use client";
import type { ResultadoAnalise, ResultadoEleicao } from "@/lib/types";
import { gerarXlsx, gerarCsv } from "@/lib/export";
import { gerarXlsxEleitos } from "@/lib/export-eleitos";
import { baixar, MIME_XLSX } from "@/components/baixar";

export function ExportButtons({ analise }: { analise: ResultadoAnalise }) {
  return (
    <div className="flex gap-2">
      <button
        className="rounded-md bg-acao px-3 py-1.5 text-sm font-medium text-white"
        onClick={() => baixar("resultado.xlsx", gerarXlsx(analise), MIME_XLSX)}>
        Baixar planilha
      </button>
      <button
        className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm"
        onClick={() => baixar("resultado.csv", gerarCsv(analise), "text/csv")}>
        CSV
      </button>
    </div>
  );
}

export function ExportEleitosButton({ eleicao }: { eleicao: ResultadoEleicao }) {
  return (
    <button
      className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm"
      onClick={() => baixar("eleitos-2026.xlsx", gerarXlsxEleitos(eleicao), MIME_XLSX)}>
      Eleitos 2026 (.xlsx)
    </button>
  );
}
