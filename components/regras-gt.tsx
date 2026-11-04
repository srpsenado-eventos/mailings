"use client";
import { useState } from "react";
import type { RegraGt } from "@/data/regras-gt";
import { TITULO_REGRAS_GT, textoLongo } from "@/lib/regras-gt";

/**
 * Quadro "Regras do GT em vigor" (spec 2026-11-04 §3.2): aberto na primeira visita, com botão
 * para recolher (estado só do navegador). Só renderiza.
 */
export function RegrasGt({ regras }: { regras: readonly RegraGt[] }) {
  const [aberto, setAberto] = useState(true);
  return (
    <section className="mt-5 overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{TITULO_REGRAS_GT}</h2>
      </button>
      {aberto && (
        <ul className="border-t border-separador">
          {regras.map((r) => (
            <li key={`${r.data}-${r.titulo}`} className="border-t border-separador px-4 py-2 text-sm first:border-t-0">
              {textoLongo(r)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
