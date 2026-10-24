"use client";
import { useEffect, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";
import { lerBaseEnderecos, lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import { juntarArquivosEleicao, lerPlanilhaEleicao, PlanilhaEleicaoDesconhecidaError, resumoArquivoEleicao, separarColisoesDeTipo, substituirPorTipo, type ArquivoEleicaoLido } from "@/lib/planilha-eleitos";
import { triarArquivosSoltos } from "@/lib/arquivos-soltos";
import { juntarMensagens } from "@/lib/texto";
import type { BaseEnderecos, ContatoPlanilha, EnderecoEstruturado, Retrato } from "@/lib/types";

type Resposta = { ok: true; retrato: Retrato; aviso?: string } | { ok: false; message?: string };

interface ArquivoContatos { nome: string; contatos: ContatoPlanilha[]; grupos: number }
interface ArquivoEnderecos { nome: string; enderecos: EnderecoEstruturado[]; base: BaseEnderecos }

async function lerJsonSeguro(resp: Response): Promise<Resposta | null> {
  try {
    return (await resp.json()) as Resposta;
  } catch {
    return null;
  }
}

function mensagemDeLeitura(err: unknown): string {
  if (err instanceof PlanilhaEleicaoDesconhecidaError) return err.message;
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

interface SeletorProps {
  id: string;
  rotulo: string;
  desabilitado: boolean;
  /** Passo que aceita várias planilhas de uma vez (Eleição 2026). */
  multiplo?: boolean;
  /** Recebe as planilhas escolhidas ou soltas e o aviso da triagem (arquivo ignorado, mais de uma num passo de uma só). */
  onEntrega: (arquivos: File[], aviso: string | null) => void;
}

const arrastaArquivos = (dt: DataTransfer | null): boolean => dt !== null && Array.from(dt.types).includes("Files");

/**
 * Arquivo solto fora da área tracejada cairia no comportamento padrão do navegador (baixar o .xlsx ou
 * abrir o .csv no lugar da tela, perdendo o que já foi lido). Enquanto a tela está montada, nada disso acontece.
 */
function useSemSoltarForaDaArea() {
  useEffect(() => {
    const impedir = (e: globalThis.DragEvent) => {
      if (arrastaArquivos(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener("dragover", impedir);
    window.addEventListener("drop", impedir);
    return () => {
      window.removeEventListener("dragover", impedir);
      window.removeEventListener("drop", impedir);
    };
  }, []);
}

function SeletorDeArquivo({ id, rotulo, desabilitado, multiplo = false, onEntrega }: SeletorProps) {
  const [arrastando, setArrastando] = useState(false);

  function aoArrastarSobre(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const comArquivos = arrastaArquivos(e.dataTransfer);
    e.dataTransfer.dropEffect = desabilitado || !comArquivos ? "none" : "copy";
    if (!desabilitado && comArquivos) setArrastando(true);
  }

  function aoSairDoArrasto(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
  }

  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    if (desabilitado) return;
    const { aceitos, aviso } = triarArquivosSoltos(Array.from(e.dataTransfer.files), multiplo);
    onEntrega(aceitos, aviso);
  }

  return (
    <div
      onDragOver={aoArrastarSobre}
      onDragLeave={aoSairDoArrasto}
      onDrop={aoSoltar}
      className={`mt-4 rounded-lg border border-dashed p-5 text-center transition-colors ${arrastando ? "border-acao bg-acao-borda/40" : "border-borda-forte bg-fundo"}`}
    >
      <label htmlFor={id} className="cursor-pointer rounded-md border border-acao-borda bg-cartao px-3.5 py-1.5 text-sm font-medium text-acao">
        {rotulo}
      </label>
      <p className="mt-3 text-xs text-cinza">{multiplo ? "ou arraste as planilhas para aqui" : "ou arraste a planilha para aqui"}</p>
      <input
        id={id}
        type="file"
        accept=".xlsx,.csv"
        className="sr-only"
        disabled={desabilitado}
        multiple={multiplo}
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          if (lista.length > 0) onEntrega(lista, null);
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
  useSemSoltarForaDaArea();
  const [contatos, setContatos] = useState<ArquivoContatos | null>(null);
  const [enderecos, setEnderecos] = useState<ArquivoEnderecos | null>(null);
  const [erroContatos, setErroContatos] = useState<string | null>(null);
  const [erroEnderecos, setErroEnderecos] = useState<string | null>(null);
  const [eleicao, setEleicao] = useState<ArquivoEleicaoLido[]>([]);
  const [erroEleicao, setErroEleicao] = useState<string | null>(null);
  const [erroVarredura, setErroVarredura] = useState<string | null>(null);
  const [varrendo, setVarrendo] = useState(false);

  async function lerContatos(arquivos: File[], aviso: string | null) {
    setErroVarredura(null);
    const arquivo = arquivos[0];
    if (!arquivo) {
      setErroContatos(aviso);
      return;
    }
    try {
      const lista = lerPlanilha(await arquivo.arrayBuffer());
      setContatos({ nome: arquivo.name, contatos: lista, grupos: new Set(lista.map((c) => c.grupo)).size });
      setErroContatos(aviso);
    } catch (err) {
      setContatos(null);
      setErroContatos(juntarMensagens([aviso, mensagemDeLeitura(err)]));
    }
  }

  async function lerEnderecos(arquivos: File[], aviso: string | null) {
    setErroVarredura(null);
    const arquivo = arquivos[0];
    if (!arquivo) {
      setErroEnderecos(aviso);
      return;
    }
    try {
      const buffer = await arquivo.arrayBuffer();
      setEnderecos({ nome: arquivo.name, enderecos: lerPlanilhaEnderecos(buffer), base: lerBaseEnderecos(buffer) });
      setErroEnderecos(aviso);
    } catch (err) {
      setEnderecos(null);
      setErroEnderecos(juntarMensagens([aviso, mensagemDeLeitura(err)]));
    }
  }

  async function lerEleicao(arquivos: File[], aviso: string | null) {
    setErroVarredura(null);
    const lidos: ArquivoEleicaoLido[] = [];
    const erros: string[] = aviso ? [aviso] : [];
    for (const f of arquivos) {
      try {
        lidos.push({ nome: f.name, arquivo: lerPlanilhaEleicao(await f.arrayBuffer()) });
      } catch (err) {
        erros.push(`${f.name}: ${mensagemDeLeitura(err)}`);
      }
    }
    // Dois arquivos do mesmo tipo na mesma seleção não entram (nenhum deles); o de outra seleção é trocado.
    const { aceitos, colisoes } = separarColisoesDeTipo(lidos);
    if (aceitos.length > 0) setEleicao((atual) => substituirPorTipo(atual, aceitos));
    setErroEleicao(juntarMensagens([...erros, ...colisoes]));
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
          ...(enderecos ? { enderecos: enderecos.enderecos, arquivoEnderecosNome: enderecos.nome, baseEnderecos: enderecos.base } : {}),
          ...(eleicao.length > 0 ? juntarArquivosEleicao(eleicao) : {}),
        }),
      });
      const json = await lerJsonSeguro(resp);
      if (!json) {
        setErroVarredura(`O servidor respondeu de forma inesperada (HTTP ${resp.status}). Tente novamente.`);
        setVarrendo(false);
        return;
      }
      if (!json.ok) {
        setErroVarredura(json.message ?? "Falha ao varrer.");
        setVarrendo(false);
        return;
      }
      if (json.aviso) {
        onRetratoNaoGuardado(json.retrato, json.aviso);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setErroVarredura(err instanceof Error ? `Falha na varredura: ${err.message}` : "Falha na varredura.");
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
            <ArquivoLido nome={contatos.nome} resumo={`${contatos.contatos.length} contatos · ${contatos.grupos} grupos`} onTrocar={() => { setContatos(null); setErroContatos(null); setErroVarredura(null); }} desabilitado={varrendo} />
          ) : (
            <SeletorDeArquivo id="planilha-contatos" rotulo="Escolher arquivo" desabilitado={varrendo} onEntrega={lerContatos} />
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
            <ArquivoLido nome={enderecos.nome} resumo={`${enderecos.enderecos.length} endereços`} onTrocar={() => { setEnderecos(null); setErroEnderecos(null); setErroVarredura(null); }} desabilitado={varrendo} />
          ) : (
            <SeletorDeArquivo id="planilha-enderecos" rotulo="Escolher arquivo" desabilitado={varrendo} onEntrega={lerEnderecos} />
          )}
          {erroEnderecos && <p className="mt-2 text-sm text-ruim">{erroEnderecos}</p>}
        </section>

        <section className="rounded-xl border border-borda-forte bg-cartao p-6 md:col-span-2">
          <div className="flex items-center gap-2.5">
            <Passo numero={3} ativo={eleicao.length > 0} />
            <h2 className="text-lg font-semibold">Eleição 2026</h2>
            <span className="rounded-full bg-neutro-fundo px-2 py-0.5 text-[11px] text-cinza">opcional</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-cinza">
            As planilhas da pasta <strong className="font-medium">Eleitos 2026</strong>: senadores eleitos, deputados federais eleitos, deputados atuais e governadores eleitos. Pode escolher ou arrastar as quatro de uma vez.
          </p>
          {eleicao.map((l) => (
            <ArquivoLido
              key={l.arquivo.tipo}
              nome={l.nome}
              resumo={resumoArquivoEleicao(l.arquivo)}
              onTrocar={() => { setEleicao((atual) => atual.filter((a) => a.arquivo.tipo !== l.arquivo.tipo)); setErroEleicao(null); setErroVarredura(null); }}
              desabilitado={varrendo}
            />
          ))}
          <SeletorDeArquivo id="planilhas-eleicao" rotulo={eleicao.length > 0 ? "Acrescentar ou trocar" : "Escolher arquivos"} desabilitado={varrendo} multiplo onEntrega={lerEleicao} />
          {erroEleicao && <p className="mt-2 text-sm text-ruim">{erroEleicao}</p>}
        </section>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={varrer}
          disabled={!contatos || varrendo}
          className="rounded-lg bg-acao px-6 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {varrendo ? "Varrendo…" : contatos ? `Varrer ${contatos.grupos} ${contatos.grupos === 1 ? "grupo" : "grupos"}` : "Varrer"}
        </button>
        {varrendo && <p className="text-sm text-cinza">Esta máquina está lendo as fontes oficiais. Pode levar mais de um minuto.</p>}
        {erroVarredura && <p className="text-sm text-ruim">{erroVarredura}</p>}
      </div>
    </div>
  );
}
