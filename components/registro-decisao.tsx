"use client";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Registro, TipoDecisao } from "@/lib/decisoes";
import {
  corpoDoPedido, errosDoFormulario, FORMULARIO_VAZIO, hojeEmBrasilia, pedeConvite, textoDoRegistro, TIPOS_DO_FORMULARIO,
  type AlvoDeDecisao, type FormularioDecisao,
} from "@/lib/registro-decisao";

interface Props {
  alvo: AlvoDeDecisao;
  /** Já do mais recente para o mais antigo. */
  registros: readonly Registro[];
  modo: "local" | "web";
}

const CAMPO = "rounded-md border border-borda-forte bg-cartao px-2 py-1 text-sm";

/** Botão "Registrar decisão" (só local) e "Histórico (n)". A lógica fica em `lib/registro-decisao.ts`. */
export function RegistroDecisao({ alvo, registros, modo }: Props) {
  const [formAberto, setFormAberto] = useState(false);
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const podeRegistrar = modo === "local";
  if (!podeRegistrar && registros.length === 0) return null;
  return (
    <div className="mt-2 text-xs">
      <div className="flex flex-wrap gap-3">
        {podeRegistrar && (
          <button type="button" aria-expanded={formAberto} onClick={() => setFormAberto((v) => !v)} className="text-acao underline">
            Registrar decisão
          </button>
        )}
        <button type="button" aria-expanded={historicoAberto} onClick={() => setHistoricoAberto((v) => !v)} className="text-acao underline">
          Histórico ({registros.length})
        </button>
      </div>
      {historicoAberto && (
        registros.length === 0
          ? <p className="mt-1 text-cinza">Nenhum registro.</p>
          : <ol className="mt-1 space-y-0.5 text-cinza">{registros.map((r, i) => <li key={`${r.data}-${i}`}>{textoDoRegistro(r)}</li>)}</ol>
      )}
      {podeRegistrar && formAberto && <Formulario alvo={alvo} onFechar={() => setFormAberto(false)} />}
    </div>
  );
}

function Formulario({ alvo, onFechar }: { alvo: AlvoDeDecisao; onFechar: () => void }) {
  const router = useRouter();
  const id = useId();
  const [f, setF] = useState<FormularioDecisao>(FORMULARIO_VAZIO);
  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const mudar = (parcial: Partial<FormularioDecisao>) => setF((atual) => ({ ...atual, ...parcial }));
  const alternarOutra = (valor: string) => mudar({
    outraPessoa: f.outraPessoa.includes(valor) ? f.outraPessoa.filter((v) => v !== valor) : [...f.outraPessoa, valor],
  });

  async function gravar() {
    const achados = errosDoFormulario(f);
    setErros(achados);
    if (achados.length > 0) return;
    setEnviando(true);
    try {
      const resposta = await fetch("/api/decisoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpoDoPedido(alvo, f, hojeEmBrasilia())),
      });
      const corpo: unknown = await resposta.json().catch(() => undefined);
      const message = typeof corpo === "object" && corpo !== null && "message" in corpo && typeof corpo.message === "string" ? corpo.message : undefined;
      if (!resposta.ok) {
        setErros([message ?? `Não foi possível gravar a decisão (HTTP ${resposta.status}).`]);
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
      onSubmit={(e) => { e.preventDefault(); void gravar(); }}>
      <fieldset>
        <legend className="text-xs text-cinza">Decisão</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {TIPOS_DO_FORMULARIO.map((t) => (
            <label key={t.valor} className="flex items-center gap-1">
              <input type="radio" name={`${id}-tipo`} checked={f.tipo === t.valor} onChange={() => mudar({ tipo: t.valor as TipoDecisao })} className="accent-acao" />
              {t.rotulo}
            </label>
          ))}
        </div>
      </fieldset>
      {pedeConvite(f.tipo) && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-cinza">Convidar pelo grupo{f.tipo === "ajustar_contatos" ? " (opcional)" : ""}</span>
          <select value={f.convidaPor} onChange={(e) => mudar({ convidaPor: e.target.value })} className={CAMPO}>
            <option value="">—</option>
            {alvo.convites.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      )}
      {alvo.ocorrencias.length > 0 && (
        <fieldset>
          <legend className="text-xs text-cinza">É outra pessoa</legend>
          {alvo.ocorrencias.map((o) => (
            <label key={o.valor} className="mt-1 flex items-start gap-1.5">
              <input type="checkbox" checked={f.outraPessoa.includes(o.valor)} onChange={() => alternarOutra(o.valor)} className="mt-0.5 accent-acao" />
              <span>{o.rotulo}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="block">
        <span className="text-xs text-cinza">Observação</span>
        <textarea value={f.observacao} onChange={(e) => mudar({ observacao: e.target.value })} rows={2} className={`${CAMPO} mt-1 block w-full`} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="text-xs text-cinza">Quem decidiu</span>
          <input type="text" value={f.quem} onChange={(e) => mudar({ quem: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-cinza">Validação</span>
          <select value={f.validacao} onChange={(e) => mudar({ validacao: e.target.value === "a_validar" ? "a_validar" : "validado" })} className={CAMPO}>
            <option value="validado">Validado</option>
            <option value="a_validar">A validar</option>
          </select>
        </label>
      </div>
      {erros.length > 0 && <ul role="alert" className="text-xs text-ruim">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="flex gap-2">
        <button type="submit" disabled={enviando} className="rounded-md bg-acao px-3 py-1 text-sm font-medium text-white disabled:opacity-60">
          {enviando ? "Gravando…" : "Gravar decisão"}
        </button>
        <button type="button" onClick={onFechar} className="rounded-md border border-borda-forte bg-cartao px-3 py-1 text-sm">Cancelar</button>
      </div>
    </form>
  );
}
