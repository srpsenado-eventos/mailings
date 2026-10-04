"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EntrarForm() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (resp.ok && json?.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setErro(json?.message ?? "Não foi possível entrar. Tente de novo.");
    } catch {
      setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-6 flex max-w-sm flex-col gap-3">
      <label htmlFor="senha" className="text-sm text-cinza">Senha</label>
      <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required className="rounded-md border border-borda-forte bg-cartao px-3 py-2 text-sm" />
      {erro && <p className="rounded-lg border border-atencao-borda bg-atencao-fundo p-2 text-sm text-atencao">{erro}</p>}
      <button type="submit" disabled={enviando} className="rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{enviando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
