"use client";
import { Etiqueta } from "@/components/etiqueta";
import { SecaoEleitos } from "@/components/secao-eleitos";
import { resumoGrupoDeputados, type GrupoDeputados } from "@/lib/painel-deputados";

const COLUNAS = "grid grid-cols-[minmax(0,2.4fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,2.2fr)] gap-4 px-4";

/** Grupo "Deputados Federais" vindo da planilha da Câmara (spec 2026-10-12 §3). Só renderiza; sem dado de gabinete. */
export function GrupoDeputados({ grupo, aberto, onAlternar }: { grupo: GrupoDeputados; aberto: boolean; onAlternar: () => void }) {
  return (
    <section className="overflow-clip rounded-xl border border-borda bg-cartao">
      <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 bg-cartao px-4 py-3 ${aberto ? "border-b border-separador" : ""}`}>
        <button type="button" aria-expanded={aberto} onClick={onAlternar} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
          <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
          <h2 className="font-serif text-lg font-semibold">{grupo.titulo}</h2>
          <span className="text-xs text-cinza">{resumoGrupoDeputados(grupo)}</span>
        </button>
        <div className="grow" />
        <span className="text-xs text-cinza">{grupo.aviso}</span>
      </div>
      {aberto && (
        <>
          {grupo.atuais.length > 0 && (
            <>
              <div className={`${COLUNAS} py-2 text-xs text-cinza-claro`}>
                <div>Deputado</div><div>UF</div><div>Partido</div><div>Condição</div><div>Eleição 2026</div>
              </div>
              {grupo.atuais.map((d, i) => (
                <div key={`${d.uf}-${d.nome}-${i}`} className={`${COLUNAS} items-start border-t border-separador py-2.5 text-sm`}>
                  <div>
                    <div className="font-medium">{d.nome}</div>
                    <div className="text-xs text-cinza">{d.nomeCivil}</div>
                  </div>
                  <div>{d.uf}</div>
                  <div className="text-cinza">{d.partido ?? "—"}</div>
                  <div className="text-cinza">{d.condicao ?? "—"}</div>
                  <div className="flex flex-wrap gap-1">
                    {d.etiquetas.map((e) => <Etiqueta key={e.texto} texto={e.texto} tom={e.tom} explicacao={e.explicacao} />)}
                  </div>
                </div>
              ))}
            </>
          )}
          {grupo.aCadastrar.length > 0 && (
            <div className="border-t border-separador p-3">
              <SecaoEleitos
                secao={{ id: "camara_novos", titulo: `Deputados Federais Eleitos — a cadastrar (${grupo.aCadastrar.length})`, linhas: grupo.aCadastrar }}
                abertoInicial={false}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
