"use client";
import { useState } from "react";
import { Etiqueta } from "@/components/etiqueta";
import { RegistroDecisao } from "@/components/registro-decisao";
import type { HistoricoDecisoes, Registro } from "@/lib/decisoes";
import type { SecaoGrupoEleito } from "@/lib/painel-eleicao";
import { alvoDoEleito, alvoDoGovernador, historicoDoEleito, historicoDoGovernador, type AlvoDeDecisao } from "@/lib/registro-decisao";
import type { EleitoClassificado, GovernadorClassificado } from "@/lib/types";

const COLUNAS = "grid grid-cols-[minmax(0,2fr)_minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4";

function Cabecalho({ ultima }: { ultima: string }) {
  return (
    <div className={`${COLUNAS} py-2 text-xs text-cinza-claro`}>
      <div>Nome de urna</div><div>Nome completo</div><div>UF</div><div>Partido</div><div>{ultima}</div>
    </div>
  );
}

/** Decisões do GT e o modo do app, para o botão "Registrar decisão" e o histórico de cada eleito. */
interface ContextoDecisao {
  decisoes?: HistoricoDecisoes;
  modo: "local" | "web";
}

function DecisaoDoEleito({ alvo, registros, modo }: { alvo: AlvoDeDecisao; registros: readonly Registro[]; modo: "local" | "web" }) {
  return (
    <div className="col-span-full -mt-1">
      <RegistroDecisao alvo={alvo} registros={registros} modo={modo} />
    </div>
  );
}

function LinhaEleito({ x, conferir, ctx }: { x: EleitoClassificado; conferir: boolean; ctx: ContextoDecisao }) {
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
      <DecisaoDoEleito alvo={alvoDoEleito(x)} registros={historicoDoEleito(ctx.decisoes, x)} modo={ctx.modo} />
    </div>
  );
}

function LinhaGovernador({ x, conferir, ctx }: { x: GovernadorClassificado; conferir: boolean; ctx: ContextoDecisao }) {
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
      <DecisaoDoEleito alvo={alvoDoGovernador(x)} registros={historicoDoGovernador(ctx.decisoes, x)} modo={ctx.modo} />
    </div>
  );
}

function Subsecao({ titulo, eleitos, governo, conferir, ctx }: { titulo: string; eleitos: EleitoClassificado[]; governo: GovernadorClassificado[]; conferir: boolean; ctx: ContextoDecisao }) {
  const total = eleitos.length + governo.length;
  if (total === 0) return null;
  return (
    <div className="border-t border-separador">
      <h3 className="px-4 pt-3 text-sm font-semibold">{titulo} ({total})</h3>
      <Cabecalho ultima={conferir ? "Motivo" : "Gênero"} />
      {eleitos.map((x, i) => <LinhaEleito key={`${x.eleito.casa}-${x.eleito.uf}-${x.eleito.nomeUrna}-${i}`} x={x} conferir={conferir} ctx={ctx} />)}
      {governo.map((x, i) => <LinhaGovernador key={`governo-${x.eleito.uf}-${x.eleito.nomeUrna}-${i}`} x={x} conferir={conferir} ctx={ctx} />)}
    </div>
  );
}

/** Seção recolhível dos eleitos de um grupo do Contatos, com A cadastrar e A conferir. Só renderiza. */
export function SecaoEleitos({ secao, abertoInicial, modo, decisoes }: { secao: SecaoGrupoEleito; abertoInicial: boolean; modo: "local" | "web"; decisoes?: HistoricoDecisoes }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const ctx: ContextoDecisao = { modo, ...(decisoes ? { decisoes } : {}) };
  return (
    <section className="overflow-clip rounded-xl border border-borda bg-cartao">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="flex w-full items-baseline gap-3 px-4 py-3 text-left">
        <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
        <h2 className="font-serif text-lg font-semibold">{secao.titulo}</h2>
      </button>
      {aberto && (
        <>
          <Subsecao titulo="A cadastrar" eleitos={secao.aCadastrar} governo={secao.governo.aCadastrar} conferir={false} ctx={ctx} />
          <Subsecao titulo="A conferir" eleitos={secao.aConferir} governo={secao.governo.aConferir} conferir ctx={ctx} />
        </>
      )}
    </section>
  );
}
