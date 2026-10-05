"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ExportButtons } from "@/components/export-buttons";
import { PublicarButton } from "@/components/publicar-button";
import { CLASSES_COLUNAS, LinhaContato, LinhaNovo } from "@/components/linha-contato";
import { cartoesDoResumo, contarContatos, filtrarGrupos, FILTROS, resumoDoGrupo, textoCabecalhoWeb, textoDataHora, type Filtro } from "@/lib/painel";
import type { ResultadoGrupo, Retrato } from "@/lib/types";

function EstadoDaFonte({ g }: { g: ResultadoGrupo }) {
  if (g.semFonte) {
    return (
      <span className="text-xs text-ruim">
        Sem fonte cadastrada
        {g.sugestoesCadastro && g.sugestoesCadastro.length > 0 ? ` (você quis dizer: ${g.sugestoesCadastro.join(" · ")}?)` : ""}
        {" · "}<Link href="/grupos" className="underline">grupos cadastrados</Link>
      </span>
    );
  }
  if (g.fonteInacessivel) {
    return (
      <span className="text-xs text-atencao">
        Fonte inacessível, confira à mão{g.erroFonte ? `: ${g.erroFonte}` : ""}
        {g.fonteUrl && <> · <a href={g.fonteUrl} target="_blank" rel="noreferrer" className="underline">abrir</a></>}
      </span>
    );
  }
  return (
    <span className="text-xs text-cinza">
      {g.viaPesquisaAmpla && <span className="text-atencao">≈ via IA — confira · </span>}
      {g.erroFonte && <span className="text-atencao">uma fonte não respondeu: {g.erroFonte} · </span>}
      {g.fonteUrl && g.fonteUrl.startsWith("http") && (
        <a href={g.fonteUrl} target="_blank" rel="noreferrer" className="text-acao underline">abrir fonte</a>
      )}
    </span>
  );
}

export function Painel({ retrato, aviso, onNovaVarredura, modo = "local", podePublicar = false }: { retrato: Retrato; aviso?: string; onNovaVarredura?: () => void; modo?: "local" | "web"; podePublicar?: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("");
  const grupos = useMemo(() => filtrarGrupos(retrato.grupos, filtro, busca, grupo), [retrato, filtro, busca, grupo]);
  const total = retrato.resumo.total;
  const visiveis = contarContatos(grupos);
  const filtrando = filtro !== "tudo" || busca.trim() !== "" || grupo !== "";
  // Sem filtro os grupos abrem recolhidos; com filtro, abertos. `alternados` guarda quem foge do padrão.
  const [alternados, setAlternados] = useState<ReadonlySet<string>>(new Set());
  const estaAberto = (nome: string) => filtrando !== alternados.has(nome);
  const alternar = (nome: string) => setAlternados((atual) => {
    const novo = new Set(atual);
    if (!novo.delete(nome)) novo.add(nome);
    return novo;
  });
  const abrirTodos = (abrir: boolean) => setAlternados(abrir === filtrando ? new Set() : new Set(grupos.map((g) => g.grupo)));
  const mudarFiltro = (aplicar: () => void) => { aplicar(); setAlternados(new Set()); };

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Fiscal de Mailings</h1>
          {modo === "web" ? (
            <p className="mt-1 text-sm text-cinza">{textoCabecalhoWeb(retrato.geradoEm, retrato.publicadoEm)}</p>
          ) : (
            <p className="mt-1 text-sm text-cinza">
              Contatos <strong className="font-medium text-tinta">{retrato.planilhaContatos.nome}</strong>
              {retrato.planilhaEnderecos && <> · Endereços <strong className="font-medium text-tinta">{retrato.planilhaEnderecos.nome}</strong></>}
              {" · "}varredura de {textoDataHora(retrato.geradoEm)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/grupos" className="text-sm text-acao underline">Grupos cadastrados</Link>
          {modo !== "web" && (onNovaVarredura ? (
            <button type="button" onClick={onNovaVarredura} className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm">Nova varredura</button>
          ) : (
            <Link href="/nova-varredura" className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm">Nova varredura</Link>
          ))}
          {modo !== "web" && podePublicar && <PublicarButton />}
          <ExportButtons analise={retrato} />
        </div>
      </header>

      {aviso && <p className="mt-4 rounded-lg border border-atencao-borda bg-atencao-fundo p-3 text-sm text-atencao">{aviso}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cartoesDoResumo(retrato.resumo).map((c) => (
          <div key={c.rotulo} className="rounded-lg border border-borda bg-cartao px-4 py-3">
            <div className="font-serif text-3xl font-semibold">{c.valor}</div>
            <div className="text-xs text-cinza">{c.rotulo}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-cinza-claro">Mostrar</span>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => mudarFiltro(() => setFiltro(f.id))}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === f.id ? "border-acao bg-acao text-white" : "border-borda-forte bg-cartao text-tinta"}`}
          >
            {f.rotulo}
          </button>
        ))}
        <label htmlFor="grupo" className="ml-2 text-xs text-cinza-claro">Grupo</label>
        <select
          id="grupo"
          value={grupo}
          onChange={(e) => mudarFiltro(() => setGrupo(e.target.value))}
          className="max-w-72 rounded-md border border-borda-forte bg-cartao px-2 py-1 text-xs"
        >
          <option value="">Todos os grupos</option>
          {retrato.grupos.map((g) => <option key={g.grupo} value={g.grupo}>{g.grupo}</option>)}
        </select>
        <div className="grow" />
        <label htmlFor="busca" className="text-xs text-cinza-claro">Buscar</label>
        <input
          id="busca"
          type="search"
          value={busca}
          onChange={(e) => mudarFiltro(() => setBusca(e.target.value))}
          placeholder="nome, cargo ou órgão"
          className="w-56 rounded-md border border-borda-forte bg-cartao px-2.5 py-1 text-sm"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-cinza">
        {filtrando && <span>{visiveis} contatos de {total}</span>}
        <div className="grow" />
        <button type="button" onClick={() => abrirTodos(true)} className="text-acao underline">Expandir todos</button>
        <button type="button" onClick={() => abrirTodos(false)} className="text-acao underline">Recolher todos</button>
      </div>

      <div className="mt-5 space-y-5">
        {grupos.map((g) => {
          const aberto = estaAberto(g.grupo);
          return (
            <section key={g.grupo} className="overflow-clip rounded-xl border border-borda bg-cartao">
              <div className={`sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 bg-cartao px-4 py-3 ${aberto ? "border-b border-separador" : ""}`}>
                <button type="button" aria-expanded={aberto} onClick={() => alternar(g.grupo)} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
                  <span aria-hidden className="w-3 text-xs text-cinza">{aberto ? "▾" : "▸"}</span>
                  <h2 className="font-serif text-lg font-semibold">{g.grupo}</h2>
                  <span className="text-xs text-cinza">
                    {resumoDoGrupo(g)}{g.responsavel ? ` · responsável ${g.responsavel}` : ""}
                  </span>
                </button>
                <div className="grow" />
                <EstadoDaFonte g={g} />
              </div>
              {aberto && (
                <>
                  <div className={`${CLASSES_COLUNAS} text-xs text-cinza-claro`}>
                    <div>Contato</div><div>Cargo no cadastro</div><div>Campos conferidos</div><div>Situação</div>
                  </div>
                  {g.contatos.map((c, i) => <LinhaContato key={`${c.contato.nome}-${i}`} c={c} g={g} retrato={retrato} />)}
                  {g.novos.map((n, i) => (
                    <LinhaNovo
                      key={`novo-${i}`}
                      nome={n.nome}
                      cargo={n.cargo}
                      viaIa={n.origem === "conhecimento"}
                      nota={n.rotuloFonte ? [n.rotuloFonte, n.contexto].filter(Boolean).join(": ") : undefined}
                    />
                  ))}
                </>
              )}
            </section>
          );
        })}
        {grupos.length === 0 && <p className="text-sm text-cinza">Nada para mostrar com este filtro.</p>}
      </div>
    </main>
  );
}
