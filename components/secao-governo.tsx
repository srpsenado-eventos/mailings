"use client";
import { useState } from "react";
import type { SecaoGoverno as Secao } from "@/lib/painel-eleicao";

const COLUNAS_TURNO = "grid grid-cols-[minmax(0,0.6fr)_minmax(0,5fr)] gap-4 px-4";

/**
 * Seção recolhível das UFs que aguardam o 2º turno. Só renderiza. Os governadores eleitos a
 * cadastrar ficam na seção do grupo "Governadores eleitos" (`SecaoEleitos`).
 */
export function SecaoGoverno({ secao, abertoInicial }: { secao: Secao; abertoInicial: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <section className="overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{secao.titulo}</h2>
      </button>
      {aberto && (
        <div className="border-t border-separador">
          <div className={`${COLUNAS_TURNO} py-2 text-xs text-cinza-claro`}>
            <div>UF</div><div>Candidatos</div>
          </div>
          {secao.segundoTurno.map((u) => (
            <div key={u.uf} className={`${COLUNAS_TURNO} items-start border-t border-separador py-2.5 text-sm`}>
              <div className="font-medium">{u.uf}</div>
              <div>
                <div>{u.candidatos.map((c) => (c.partido ? `${c.nomeUrna} (${c.partido})` : c.nomeUrna)).join(" · ")}</div>
                {u.candidatos.map((c, i) => (
                  <div key={`${c.nomeUrna}-${i}`} className="text-xs text-cinza">{c.nomeUrna}: {c.statusMandato}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
