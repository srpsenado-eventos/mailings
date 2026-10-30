"use client";
import { useState } from "react";
import { Etiqueta } from "@/components/etiqueta";
import type { SecaoGrupoEleito } from "@/lib/painel-eleicao";
import type { EleitoClassificado, GovernadorClassificado } from "@/lib/types";

const COLUNAS = "grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4";

function Cabecalho({ ultima }: { ultima: string }) {
  return (
    <div className={`${COLUNAS} py-2 text-xs text-cinza-claro`}>
      <div>Nome de urna</div><div>Nome completo</div><div>UF</div><div>Partido</div><div>{ultima}</div>
    </div>
  );
}

function LinhaEleito({ x, conferir }: { x: EleitoClassificado; conferir: boolean }) {
  return (
    <div className={`${COLUNAS} items-start border-t border-separador py-2.5 text-sm`}>
      <div className="font-medium">
        {x.eleito.nomeUrna}
        {x.projecao && <span className="ml-2"><Etiqueta texto="Projeção — aguarda TSE" tom="neutro" /></span>}
      </div>
      <div className="text-cinza">{x.eleito.nomeCompleto}</div>
      <div>{x.eleito.uf}</div>
      <div className="text-cinza">{x.eleito.partido ?? "—"}</div>
      <div className={conferir ? "text-xs text-atencao" : "text-cinza"}>{conferir ? x.motivo : (x.eleito.genero ?? "—")}</div>
    </div>
  );
}

function LinhaGovernador({ x, conferir }: { x: GovernadorClassificado; conferir: boolean }) {
  return (
    <div className={`${COLUNAS} items-start border-t border-separador py-2.5 text-sm`}>
      <div className="font-medium">{x.eleito.nomeUrna}</div>
      <div className="text-cinza">
        {x.eleito.nomeCompleto}
        {x.eleito.vice && <div className="text-xs">Vice: {x.eleito.vice}</div>}
      </div>
      <div>{x.eleito.uf}</div>
      <div className="text-cinza">{x.eleito.partido ?? "—"}</div>
      <div className={conferir ? "text-xs text-atencao" : "text-cinza"}>{conferir ? x.motivo : (x.eleito.genero || "—")}</div>
    </div>
  );
}

function Subsecao({ titulo, eleitos, governo, conferir }: { titulo: string; eleitos: EleitoClassificado[]; governo: GovernadorClassificado[]; conferir: boolean }) {
  const total = eleitos.length + governo.length;
  if (total === 0) return null;
  return (
    <div className="border-t border-separador">
      <h3 className="px-4 pt-3 text-sm font-semibold">{titulo} ({total})</h3>
      <Cabecalho ultima={conferir ? "Motivo" : "Gênero"} />
      {eleitos.map((x, i) => <LinhaEleito key={`${x.eleito.casa}-${x.eleito.uf}-${x.eleito.nomeUrna}-${i}`} x={x} conferir={conferir} />)}
      {governo.map((x, i) => <LinhaGovernador key={`governo-${x.eleito.uf}-${x.eleito.nomeUrna}-${i}`} x={x} conferir={conferir} />)}
    </div>
  );
}

/** Seção recolhível dos eleitos de um grupo do Contatos, com A cadastrar e A conferir. Só renderiza. */
export function SecaoEleitos({ secao, abertoInicial }: { secao: SecaoGrupoEleito; abertoInicial: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  return (
    <section className="overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{secao.titulo}</h2>
      </button>
      {aberto && (
        <>
          <Subsecao titulo="A cadastrar" eleitos={secao.aCadastrar} governo={secao.governo.aCadastrar} conferir={false} />
          <Subsecao titulo="A conferir" eleitos={secao.aConferir} governo={secao.governo.aConferir} conferir />
        </>
      )}
    </section>
  );
}
