"use client";
import { useState } from "react";
import type { SecaoGoverno as Secao } from "@/lib/painel-eleicao";

const COLUNAS_NOVOS = "grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4";
const COLUNAS_TURNO = "grid grid-cols-[minmax(0,0.6fr)_minmax(0,5fr)] gap-4 px-4";

/** Seção recolhível dos governadores eleitos (a cadastrar) e das UFs que aguardam o 2º turno. Só renderiza. */
export function SecaoGoverno({ secao, abertoInicial }: { secao: Secao; abertoInicial: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <section className="overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{secao.titulo}</h2>
      </button>
      {aberto && secao.id === "governo_novos" && (
        <div className="border-t border-separador">
          <div className={`${COLUNAS_NOVOS} py-2 text-xs text-cinza-claro`}>
            <div>Nome de urna</div><div>Nome completo</div><div>UF</div><div>Partido</div><div>Gênero</div><div>Vice</div>
          </div>
          {secao.novos.map((x, i) => (
            <div key={`${x.eleito.uf}-${x.eleito.nomeUrna}-${i}`} className={`${COLUNAS_NOVOS} items-start border-t border-separador py-2.5 text-sm`}>
              <div className="font-medium">{x.eleito.nomeUrna}</div>
              <div className="text-cinza">{x.eleito.nomeCompleto}</div>
              <div>{x.eleito.uf}</div>
              <div className="text-cinza">{x.eleito.partido ?? "—"}</div>
              <div className="text-cinza">{x.eleito.genero || "—"}</div>
              <div className="text-cinza">{x.eleito.vice ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
      {aberto && secao.id === "governo_segundo_turno" && (
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
