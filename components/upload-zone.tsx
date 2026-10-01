"use client";
import { useState } from "react";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";
import { lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import type { EnderecoEstruturado } from "@/lib/types";

type RespostaAnalise = { ok: boolean; message?: string; resultado?: unknown };

/** Lê o JSON da resposta com segurança — devolve null se o corpo não for JSON (erro da plataforma). */
async function lerJsonSeguro(resp: Response): Promise<RespostaAnalise | null> {
  try {
    return (await resp.json()) as RespostaAnalise;
  } catch {
    return null;
  }
}

export function UploadZone({ onResultado }: { onResultado: (r: unknown) => void }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enderecos, setEnderecos] = useState<EnderecoEstruturado[] | null>(null);
  const [enderecosNome, setEnderecosNome] = useState<string | null>(null);

  /** Lê a planilha de endereços no navegador e a guarda para o próximo envio dos contatos. */
  async function carregarEnderecos(arquivo: File) {
    setErro(null);
    try {
      const lidos = lerPlanilhaEnderecos(await arquivo.arrayBuffer()); // pode lançar ColunaFaltanteError
      setEnderecos(lidos);
      setEnderecosNome(arquivo.name);
    } catch (err) {
      setEnderecos(null);
      setEnderecosNome(null);
      if (err instanceof ColunaFaltanteError) {
        setErro(`Planilha inválida. ${err.message}`);
      } else {
        setErro(
          err instanceof Error ? `Falha ao ler a planilha: ${err.message}` : "Falha ao ler a planilha.",
        );
      }
    }
  }

  async function enviar(arquivo: File) {
    setCarregando(true);
    setErro(null);
    try {
      // Parse no navegador: só o texto viaja. Fotos/binário ficam no cliente, então o corpo da
      // requisição é minúsculo e nunca esbarra no limite de ~4,5 MB da plataforma.
      const buffer = await arquivo.arrayBuffer();
      const contatos = lerPlanilha(buffer); // pode lançar ColunaFaltanteError

      const resp = await fetch("/api/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivoNome: arquivo.name,
          contatos,
          ...(enderecos ? { enderecos, arquivoEnderecosNome: enderecosNome } : {}),
        }),
      });

      const json = await lerJsonSeguro(resp);
      if (!json) {
        setErro(`O servidor respondeu de forma inesperada (HTTP ${resp.status}). Tente novamente.`);
        return;
      }
      if (!json.ok) {
        setErro(json.message ?? "Falha ao analisar a planilha.");
        return;
      }
      onResultado(json.resultado);
    } catch (err) {
      if (err instanceof ColunaFaltanteError) {
        setErro(`Planilha inválida. ${err.message}`);
      } else {
        setErro(
          err instanceof Error ? `Falha ao ler a planilha: ${err.message}` : "Falha ao ler a planilha.",
        );
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
      <div className="mb-6">
        <label htmlFor="planilha-enderecos" className="block text-sm text-gray-700">
          Relatório de endereços (opcional)
        </label>
        <p className="mb-2 text-xs text-gray-500">
          Se for usar, escolha este arquivo antes da planilha de contatos: a análise começa assim que os contatos são escolhidos.
        </p>
        <input
          id="planilha-enderecos"
          type="file" accept=".xlsx,.csv"
          disabled={carregando}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) carregarEnderecos(f); }}
        />
        {enderecosNome && (
          <p className="mt-2 text-sm text-gray-500">
            {enderecosNome} — {enderecos?.length} endereços
          </p>
        )}
      </div>
      <input
        type="file" accept=".xlsx,.csv"
        disabled={carregando}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); }}
      />
      {carregando && <p className="mt-2 text-sm text-gray-500">Analisando…</p>}
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
