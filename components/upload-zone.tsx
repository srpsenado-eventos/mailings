"use client";
import { useState } from "react";

export function UploadZone({ onResultado }: { onResultado: (r: unknown) => void }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setCarregando(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const resp = await fetch("/api/analise", { method: "POST", body: fd });
      const json = await resp.json();
      if (!json.ok) { setErro(json.message); return; }
      onResultado(json.resultado);
    } catch {
      setErro("Falha ao enviar a planilha.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
      <input
        type="file" accept=".xlsx"
        disabled={carregando}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); }}
      />
      {carregando && <p className="mt-2 text-sm text-gray-500">Analisando…</p>}
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
