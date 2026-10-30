"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { baixar, MIME_XLSX } from "@/components/baixar";
import { Etiqueta } from "@/components/etiqueta";
import { descreverOcorrencia, gerarXlsxRepetidas } from "@/lib/export-repetidos";
import { textoDataHora } from "@/lib/painel";
import { filtrarRepetidas, separarRepetidas, textoLinkRepetidas, type AutoridadeRepetida, type FiltroRepetidas } from "@/lib/repetidos";

const FILTROS: readonly { id: FiltroRepetidas; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "conferir", rotulo: "A conferir" },
  { id: "decidido", rotulo: "Decididas" },
];

export function TelaRepetidos({ repetidas, geradoEm, aviso }: { repetidas: AutoridadeRepetida[]; geradoEm: string; aviso?: string }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroRepetidas>("todas");
  const lista = useMemo(() => filtrarRepetidas(repetidas, busca, filtro), [repetidas, busca, filtro]);
  const { demais, eleitos } = useMemo(() => separarRepetidas(lista), [lista]);
  const aConferir = repetidas.filter((a) => a.situacao === "conferir").length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-acao underline">← Painel</Link>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Autoridades em mais de um grupo</h1>
          <p className="mt-1 text-sm text-cinza">
            Varredura de {textoDataHora(geradoEm)} · {textoLinkRepetidas(repetidas)} · {aConferir} a conferir.
            Cargo atual vence cargo de ex-; entre cargos atuais, vale a Nominata do GT.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md bg-acao px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => baixar("autoridades-em-mais-de-um-grupo.xlsx", gerarXlsxRepetidas(lista), MIME_XLSX)}>
          Baixar planilha
        </button>
      </header>
      {aviso && <p className="mt-4 rounded-lg border border-atencao-borda bg-atencao-fundo p-3 text-sm text-atencao">{aviso}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome"
          className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm"
        />
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`rounded-full px-3 py-1 text-sm ${filtro === f.id ? "bg-tinta text-white" : "border border-borda-forte bg-cartao"}`}>
            {f.rotulo}
          </button>
        ))}
      </div>

      {lista.length === 0 && <p className="mt-8 text-sm text-cinza">Nenhuma autoridade nesta seleção.</p>}
      {demais.length > 0 && <TabelaRepetidas lista={demais} />}
      {eleitos.length > 0 && (
        <section className="mt-8">
          <h2 className="font-serif text-xl font-semibold">Eleitos em 2026 já no Contatos — convidar pelo grupo atual</h2>
          <TabelaRepetidas lista={eleitos} />
        </section>
      )}
    </main>
  );
}

function TabelaRepetidas({ lista }: { lista: readonly AutoridadeRepetida[] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-borda-forte bg-cartao">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-cinza">
          <tr>
            <th className="px-4 py-2">Autoridade</th>
            <th className="px-4 py-2">Grupos em que está</th>
            <th className="px-4 py-2">Convidar pelo grupo</th>
            <th className="px-4 py-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => (
            <tr key={`${a.ocorrencias[0]?.chave}-${a.ocorrencias[0]?.grupo}`} className="border-t border-separador align-top">
              <td className="px-4 py-3 font-medium text-tinta">{a.nome}</td>
              <td className="px-4 py-3 text-cinza">
                <ul>{a.ocorrencias.map((o) => <li key={`${o.grupo}-${o.grupoRegra}-${o.chave}-${o.origem}`}>{descreverOcorrencia(o)}</li>)}</ul>
              </td>
              <td className="px-4 py-3">
                <span className="font-medium text-tinta">{a.convidaPor?.grupoRegra ?? "—"}</span>
                <span className="block text-xs text-cinza">{a.motivo}</span>
              </td>
              <td className="px-4 py-3">
                {a.situacao === "decidido"
                  ? <Etiqueta texto="Decidido" tom="ok" />
                  : <Etiqueta texto="Conferir" tom="atencao" explicacao={a.motivo} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
