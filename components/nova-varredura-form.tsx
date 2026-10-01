"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";
import { lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import type { ContatoPlanilha, EnderecoEstruturado, Retrato } from "@/lib/types";

type Resposta = { ok: true; retrato: Retrato; aviso?: string } | { ok: false; message?: string };

interface ArquivoContatos { nome: string; contatos: ContatoPlanilha[]; grupos: number }
interface ArquivoEnderecos { nome: string; enderecos: EnderecoEstruturado[] }

async function lerJsonSeguro(resp: Response): Promise<Resposta | null> {
  try {
    return (await resp.json()) as Resposta;
  } catch {
    return null;
  }
}

function mensagemDeLeitura(err: unknown): string {
  if (err instanceof ColunaFaltanteError) return `Planilha inválida. ${err.message}`;
  return err instanceof Error ? `Falha ao ler a planilha: ${err.message}` : "Falha ao ler a planilha.";
}

function Passo({ numero, ativo }: { numero: number; ativo: boolean }) {
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${ativo ? "bg-ok-fundo text-ok" : "bg-neutro-fundo text-cinza"}`}>
      {numero}
    </span>
  );
}

function SeletorDeArquivo({ id, rotulo, desabilitado, onArquivo }: { id: string; rotulo: string; desabilitado: boolean; onArquivo: (f: File) => void }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-borda-forte bg-fundo p-5 text-center">
      <label htmlFor={id} className="cursor-pointer rounded-md border border-acao-borda bg-cartao px-3.5 py-1.5 text-sm font-medium text-acao">
        {rotulo}
      </label>
      <input
        id={id}
        type="file"
        accept=".xlsx,.csv"
        className="sr-only"
        disabled={desabilitado}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArquivo(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ArquivoLido({ nome, resumo, onTrocar, desabilitado }: { nome: string; resumo: string; onTrocar: () => void; desabilitado: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-ok-fundo bg-ok-fundo/40 p-4">
      <span aria-hidden="true" className="text-ok">✓</span>
      <div className="grow">
        <div className="text-sm font-medium">{nome}</div>
        <div className="text-xs text-cinza">{resumo}</div>
      </div>
      <button type="button" onClick={onTrocar} disabled={desabilitado} className="rounded-md border border-borda-forte bg-cartao px-2.5 py-1 text-xs">
        Trocar
      </button>
    </div>
  );
}

export function NovaVarreduraForm({ onRetratoNaoGuardado }: { onRetratoNaoGuardado: (retrato: Retrato, aviso: string) => void }) {
  const router = useRouter();
  const [contatos, setContatos] = useState<ArquivoContatos | null>(null);
  const [enderecos, setEnderecos] = useState<ArquivoEnderecos | null>(null);
  const [erroContatos, setErroContatos] = useState<string | null>(null);
  const [erroEnderecos, setErroEnderecos] = useState<string | null>(null);
  const [erroVarredura, setErroVarredura] = useState<string | null>(null);
  const [varrendo, setVarrendo] = useState(false);

  async function lerContatos(arquivo: File) {
    setErroContatos(null);
    try {
      const lista = lerPlanilha(await arquivo.arrayBuffer());
      setContatos({ nome: arquivo.name, contatos: lista, grupos: new Set(lista.map((c) => c.grupo)).size });
    } catch (err) {
      setContatos(null);
      setErroContatos(mensagemDeLeitura(err));
    }
  }

  async function lerEnderecos(arquivo: File) {
    setErroEnderecos(null);
    try {
      setEnderecos({ nome: arquivo.name, enderecos: lerPlanilhaEnderecos(await arquivo.arrayBuffer()) });
    } catch (err) {
      setEnderecos(null);
      setErroEnderecos(mensagemDeLeitura(err));
    }
  }

  async function varrer() {
    if (!contatos) return;
    setVarrendo(true);
    setErroVarredura(null);
    try {
      const resp = await fetch("/api/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivoNome: contatos.nome,
          contatos: contatos.contatos,
          ...(enderecos ? { enderecos: enderecos.enderecos, arquivoEnderecosNome: enderecos.nome } : {}),
        }),
      });
      const json = await lerJsonSeguro(resp);
      if (!json) {
        setErroVarredura(`O servidor respondeu de forma inesperada (HTTP ${resp.status}). Tente novamente.`);
        return;
      }
      if (!json.ok) {
        setErroVarredura(json.message ?? "Falha ao varrer.");
        return;
      }
      if (json.aviso) {
        onRetratoNaoGuardado(json.retrato, json.aviso);
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setVarrendo(false);
    }
  }

  return (
    <div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-borda-forte bg-cartao p-6">
          <div className="flex items-center gap-2.5">
            <Passo numero={1} ativo={contatos !== null} />
            <h2 className="text-lg font-semibold">Contatos e grupos</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-cinza">
            Exportação do Sistema Contatos. Os grupos a varrer saem da coluna <strong className="font-medium">Grupo</strong> desta planilha.
          </p>
          {contatos ? (
            <ArquivoLido nome={contatos.nome} resumo={`${contatos.contatos.length} contatos · ${contatos.grupos} grupos`} onTrocar={() => setContatos(null)} desabilitado={varrendo} />
          ) : (
            <SeletorDeArquivo id="planilha-contatos" rotulo="Escolher arquivo" desabilitado={varrendo} onArquivo={lerContatos} />
          )}
          {erroContatos && <p className="mt-2 text-sm text-ruim">{erroContatos}</p>}
        </section>

        <section className="rounded-xl border border-borda-forte bg-cartao p-6">
          <div className="flex items-center gap-2.5">
            <Passo numero={2} ativo={enderecos !== null} />
            <h2 className="text-lg font-semibold">Relatório de endereços</h2>
            <span className="rounded-full bg-neutro-fundo px-2 py-0.5 text-[11px] text-cinza">opcional</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-cinza">
            Sem ele, o endereço continua saindo como <em>fonte não informa</em>: os sites dos órgãos não publicam endereço.
          </p>
          {enderecos ? (
            <ArquivoLido nome={enderecos.nome} resumo={`${enderecos.enderecos.length} endereços`} onTrocar={() => setEnderecos(null)} desabilitado={varrendo} />
          ) : (
            <SeletorDeArquivo id="planilha-enderecos" rotulo="Escolher arquivo" desabilitado={varrendo} onArquivo={lerEnderecos} />
          )}
          {erroEnderecos && <p className="mt-2 text-sm text-ruim">{erroEnderecos}</p>}
        </section>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={varrer}
          disabled={!contatos || varrendo}
          className="rounded-lg bg-acao px-6 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {varrendo ? "Varrendo…" : contatos ? `Varrer ${contatos.grupos} grupos` : "Varrer"}
        </button>
        {varrendo && <p className="text-sm text-cinza">Esta máquina está lendo as fontes oficiais. Pode levar mais de um minuto.</p>}
        {erroVarredura && <p className="text-sm text-ruim">{erroVarredura}</p>}
      </div>
    </div>
  );
}
