"use client";
import { useState } from "react";
import Link from "next/link";
import { NovaVarreduraForm } from "@/components/nova-varredura-form";
import { Painel } from "@/components/painel";
import type { Retrato } from "@/lib/types";

export function NovaVarreduraTela() {
  const [naoGuardado, setNaoGuardado] = useState<{ retrato: Retrato; aviso: string } | null>(null);

  if (naoGuardado) return <Painel retrato={naoGuardado.retrato} aviso={naoGuardado.aviso} onNovaVarredura={() => setNaoGuardado(null)} />;

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">Nova varredura</h1>
        <Link href="/grupos" className="text-sm text-acao underline">Grupos cadastrados</Link>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-cinza">
        As duas planilhas são lidas aqui no seu navegador. Esta máquina lê as fontes oficiais e guarda o resultado em um arquivo local; nada sai daqui.
      </p>
      <NovaVarreduraForm onRetratoNaoGuardado={(retrato, aviso) => setNaoGuardado({ retrato, aviso })} />
    </main>
  );
}
