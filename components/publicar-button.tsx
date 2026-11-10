"use client";
import { useState } from "react";
import { textoDataHora } from "@/lib/painel";

/** Botão do modo local: manda o retrato desta máquina para a web (POST /api/publicar). */
export function PublicarButton() {
  const [estado, setEstado] = useState<{ tipo: "parado" } | { tipo: "enviando" } | { tipo: "ok"; publicadoEm: string } | { tipo: "erro"; mensagem: string }>({ tipo: "parado" });

  async function publicar() {
    setEstado({ tipo: "enviando" });
    try {
      const resp = await fetch("/api/publicar", { method: "POST" });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; publicadoEm?: string; message?: string } | null;
      if (resp.ok && json?.ok && json.publicadoEm) setEstado({ tipo: "ok", publicadoEm: json.publicadoEm });
      else setEstado({ tipo: "erro", mensagem: json?.message ?? `O servidor respondeu de forma inesperada (HTTP ${resp.status}).` });
    } catch {
      setEstado({ tipo: "erro", mensagem: "Não foi possível publicar. Tente de novo." });
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={publicar} disabled={estado.tipo === "enviando"} className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm disabled:opacity-60">
        {estado.tipo === "enviando" ? "Publicando…" : "Publicar na web"}
      </button>
      {estado.tipo === "ok" && <span className="text-xs text-cinza">Publicado às {textoDataHora(estado.publicadoEm).split(", ")[1]}</span>}
      {estado.tipo === "erro" && <span className="text-xs text-atencao">{estado.mensagem}</span>}
    </span>
  );
}
