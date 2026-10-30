"use client";
import { useState } from "react";
import { ROTULO_FISCALIZACAO, TITULO_AGRUPADOR, type LinhaAgrupador } from "@/lib/agrupador";

const COLUNAS = "grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4";

/**
 * Bloco "Grupos da Posse 2027" (spec 2026-10-30 §4.5): os grupos do agrupador na ordem do Clovis,
 * com o modo de fiscalização, os contatos no Contatos e, nos grupos de eleitos e em Deputados
 * Federais, o esperado pela eleição ou pela Câmara; os grupos fora do agrupador vêm no fim.
 * Recolhido ao abrir o painel. Só renderiza.
 */
export function Agrupador({ linhas }: { linhas: readonly LinhaAgrupador[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="mt-5 overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{TITULO_AGRUPADOR}</h2>
      </button>
      {aberto && (
        <div className="border-t border-separador">
          <div className={`${COLUNAS} py-2 text-xs text-cinza-claro`}>
            <div>Grupo no Contatos</div><div>Fiscalização</div><div>No Contatos</div><div>Esperado</div>
          </div>
          {linhas.map((l) => (
            <div key={`${l.foraDoAgrupador ? "fora" : "posse"}-${l.rotulo}`} className={`${COLUNAS} items-start border-t border-separador py-2 text-sm`}>
              <div className="font-medium">
                {l.rotulo}
                {l.foraDoAgrupador && <span className="ml-2 text-xs font-normal text-atencao">fora do agrupador</span>}
              </div>
              <div className="text-cinza">{ROTULO_FISCALIZACAO[l.fiscalizacao]}</div>
              <div>{l.noContatos}</div>
              <div className="text-cinza">{l.esperado ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
