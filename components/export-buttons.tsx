"use client";
import type { ResultadoAnalise } from "@/lib/types";
import { gerarXlsx, gerarCsv } from "@/lib/export";

function baixar(nome: string, conteudo: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons({ analise }: { analise: ResultadoAnalise }) {
  return (
    <div className="flex gap-2">
      <button className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white"
        onClick={() => baixar("resultado.xlsx", gerarXlsx(analise),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
        Exportar XLSX
      </button>
      <button className="rounded border px-3 py-1.5 text-sm"
        onClick={() => baixar("resultado.csv", gerarCsv(analise), "text/csv")}>
        Exportar CSV
      </button>
    </div>
  );
}
