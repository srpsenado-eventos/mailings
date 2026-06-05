"use client";
import { useState } from "react";
import Link from "next/link";
import type { ResultadoAnalise } from "@/lib/types";
import { UploadZone } from "@/components/upload-zone";
import { ResultadoTabela } from "@/components/resultado-tabela";
import { ExportButtons } from "@/components/export-buttons";

export default function Home() {
  const [analise, setAnalise] = useState<ResultadoAnalise | null>(null);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fiscal de Mailings</h1>
        <Link href="/grupos" className="text-sm underline">
          Grupos cadastrados →
        </Link>
      </div>
      {!analise && <UploadZone onResultado={(r) => setAnalise(r as ResultadoAnalise)} />}
      {analise && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {analise.arquivoNome} — {analise.resumo.total} registros · 🟢 {analise.resumo.verde} · 🟡 {analise.resumo.amarelo} · 🔴 {analise.resumo.vermelho} · ✨ {analise.resumo.novo} · ⚪ {analise.resumo.indeterminado}
              {analise.resumo.gruposFonteInacessivel > 0 && (
                <span className="text-amber-600">
                  {" "}· {analise.resumo.gruposFonteInacessivel} grupo(s) com fonte inacessível
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <ExportButtons analise={analise} />
              <button className="text-sm underline" onClick={() => setAnalise(null)}>Nova análise</button>
            </div>
          </div>
          <ResultadoTabela analise={analise} />
        </div>
      )}
    </main>
  );
}
