"use client";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";
import {
  corpoDoBloqueio, errosDoFormularioBloqueio, formularioBloqueioVazio, hojeEmBrasilia, type FormularioBloqueio,
} from "@/lib/registro-decisao";
import type { AcaoBloqueio } from "@/lib/repetidos-decisoes";

interface Props {
  acao: AcaoBloqueio;
  modo: "local" | "web";
}

const CAMPO = "rounded-md border border-borda-forte bg-cartao px-2 py-1 text-sm";
const parar = (e: MouseEvent) => e.stopPropagation();

/** Botão "Marcar bloqueio no Posse" / "Desfazer bloqueio" (só local). A lógica fica em `lib/registro-decisao.ts`. */
export function MarcarBloqueio({ acao, modo }: Props) {
  const [aberto, setAberto] = useState(false);
  if (modo !== "local") return null;
  return (
    <div className="mt-1 text-xs" onClick={parar}>
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="text-acao underline">
        {acao.bloqueado ? "Desfazer bloqueio" : "Marcar bloqueio no Posse"}
      </button>
      {aberto && <Formulario acao={acao} onFechar={() => setAberto(false)} />}
    </div>
  );
}

function Formulario({ acao, onFechar }: { acao: AcaoBloqueio; onFechar: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<FormularioBloqueio>(() => formularioBloqueioVazio(hojeEmBrasilia()));
  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const mudar = (parcial: Partial<FormularioBloqueio>) => setF((atual) => ({ ...atual, ...parcial }));

  async function gravar() {
    const achados = errosDoFormularioBloqueio(f);
    setErros(achados);
    if (achados.length > 0) return;
    setEnviando(true);
    try {
      const resposta = await fetch("/api/decisoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDoBloqueio(acao.alvo, acao.grupo, acao.bloqueado ? "desbloqueio" : "bloqueio", f)),
      });
      const corpo: unknown = await resposta.json().catch(() => undefined);
      const message = typeof corpo === "object" && corpo !== null && "message" in corpo && typeof corpo.message === "string" ? corpo.message : undefined;
      if (!resposta.ok) {
        setErros([message ?? `Não foi possível gravar o bloqueio (HTTP ${resposta.status}).`]);
        return;
      }
      onFechar();
      router.refresh();
    } catch {
      setErros(["Não foi possível falar com o servidor local. Tente de novo."]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-borda-forte bg-fundo p-3 text-sm"
      onClick={parar}
      onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void gravar(); }}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-xs text-cinza">Data</span>
          <input type="date" value={f.data} onChange={(e) => mudar({ data: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-cinza">Quem marcou</span>
          <input type="text" value={f.quem} onChange={(e) => mudar({ quem: e.target.value })} className={CAMPO} />
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-cinza">Observação</span>
        <textarea value={f.observacao} onChange={(e) => mudar({ observacao: e.target.value })} rows={2} className={`${CAMPO} mt-1 block w-full`} />
      </label>
      {erros.length > 0 && <ul role="alert" className="text-xs text-ruim">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="flex gap-2">
        <button type="submit" disabled={enviando} className="rounded-md bg-acao px-3 py-1 text-sm font-medium text-white disabled:opacity-60">
          {enviando ? "Gravando…" : "Gravar"}
        </button>
        <button type="button" onClick={onFechar} className="rounded-md border border-borda-forte bg-cartao px-3 py-1 text-sm">Cancelar</button>
      </div>
    </form>
  );
}
