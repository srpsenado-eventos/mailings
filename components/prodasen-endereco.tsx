"use client";
import Link from "next/link";
import { baixar, MIME_XLSX } from "@/components/baixar";
import { gerarXlsxAjustes, gerarXlsxCarga, nomesArquivosProdasen, type AjusteNumero } from "@/lib/ajuste-numero";
import { LIMITE_NUMERO } from "@/lib/endereco";
import type { BaseEnderecos } from "@/lib/types";

interface Props {
  base: BaseEnderecos;
  ajuste: AjusteNumero;
  /** Endereços acima do limite que não estão no painel (fora da Posse ou não prioritários). */
  fora: number;
  geradoEm: string;
  fonte: string;
}

export function ProdasenEndereco({ base, ajuste, fora, geradoEm, fonte }: Props) {
  const nomes = nomesArquivosProdasen(geradoEm);
  const acima = ajuste.casos.length + ajuste.semProposta.length;
  const itens: readonly { rotulo: string; valor: number }[] = [
    { rotulo: "Endereços na base", valor: ajuste.enderecos },
    { rotulo: `Número acima de ${LIMITE_NUMERO}`, valor: acima },
    { rotulo: "Contatos com ajuste proposto", valor: ajuste.contatos },
    { rotulo: "Sem proposta", valor: ajuste.semProposta.length },
    { rotulo: "Fora do painel", valor: fora },
  ];
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-acao underline">Painel</Link>
      <h1 className="mt-2 font-serif text-3xl font-semibold">Ajustes PRODASEN</h1>
      <p className="mt-1 text-sm text-cinza">Ajuste do campo Número acima de {LIMITE_NUMERO} caracteres, na base de endereços inteira.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {itens.map((i) => (
          <div key={i.rotulo} className="rounded-lg border border-borda bg-cartao px-4 py-3">
            <div className="font-serif text-3xl font-semibold">{i.valor}</div>
            <div className="text-xs text-cinza">{i.rotulo}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-acao px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => baixar(nomes.carga, gerarXlsxCarga(base, ajuste), MIME_XLSX)}
        >
          Baixar a carga ({nomes.carga})
        </button>
        <button
          type="button"
          className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm"
          onClick={() => baixar(nomes.ajustes, gerarXlsxAjustes(ajuste, { fonte, geradoEm }), MIME_XLSX)}
        >
          Baixar os ajustes ({nomes.ajustes})
        </button>
      </div>
    </main>
  );
}
