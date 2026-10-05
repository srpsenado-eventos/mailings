"use client";
import { useState } from "react";
import { Etiqueta } from "@/components/etiqueta";
import type { SecaoEleicao } from "@/lib/painel-eleicao";

/** Seção recolhível dos eleitos fora do Contatos (a cadastrar ou a conferir). Só renderiza. */
export function SecaoEleitos({ secao, abertoInicial }: { secao: SecaoEleicao; abertoInicial: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <section className="overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{secao.titulo}</h2>
      </button>
      {aberto && (
        <div className="border-t border-separador">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4 py-2 text-xs text-cinza-claro">
            <div>Nome de urna</div><div>Nome completo</div><div>UF</div><div>Partido</div><div>{secao.id === "conferir" ? "Motivo" : "Gênero"}</div>
          </div>
          {secao.linhas.map((x, i) => (
            <div key={`${x.eleito.casa}-${x.eleito.uf}-${x.eleito.nomeUrna}-${i}`} className="grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,2fr)] items-start gap-4 border-t border-separador px-4 py-2.5 text-sm">
              <div className="font-medium">
                {x.eleito.nomeUrna}
                {x.projecao && <span className="ml-2"><Etiqueta texto="Projeção — aguarda TSE" tom="neutro" /></span>}
              </div>
              <div className="text-cinza">{x.eleito.nomeCompleto}</div>
              <div>{x.eleito.uf}</div>
              <div className="text-cinza">{x.eleito.partido ?? "—"}</div>
              <div className={secao.id === "conferir" ? "text-xs text-atencao" : "text-cinza"}>
                {secao.id === "conferir" ? x.motivo : (x.eleito.genero ?? "—")}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
