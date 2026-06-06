import { NextRequest, NextResponse } from "next/server";
import { analisar, type Dependencias } from "@/lib/analise";
import { parsePayloadAnalise, PayloadInvalidoError } from "@/lib/analise-payload";
import { criarClienteServidor, resolverGrupoEFonte } from "@/lib/supabase";
import { raspar } from "@/lib/scrape";
import { refinarComGemini, pesquisarFonteAmpla, extrairComposicaoGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Recebe os contatos já extraídos no cliente (parse da planilha acontece no navegador — ver
 * docs/superpowers/specs/2026-06-06-upload-no-cliente-e-resiliencia.md). O corpo é JSON enxuto
 * (só texto), então não esbarra no limite de ~4,5 MB de corpo da plataforma.
 */
export async function POST(req: NextRequest) {
  try {
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return NextResponse.json({ ok: false, message: "Corpo inválido (esperado JSON)." }, { status: 400 });
    }

    const { arquivoNome, contatos } = parsePayloadAnalise(corpo);

    const supabase = criarClienteServidor();
    const deps: Dependencias = {
      resolverFonte: (grupo) => resolverGrupoEFonte(supabase, grupo),
      raspar,
      pesquisarAmpla: (grupoCanonico) => pesquisarFonteAmpla(grupoCanonico),
      enriquecerPessoas: async (fonte) => {
        const pessoas = await extrairComposicaoGemini(fonte.textoLimpo);
        return pessoas.length > 0 ? { ...fonte, pessoas } : fonte;
      },
      refinar: (grupo, fonte) => refinarComGemini(grupo, fonte),
    };

    const resultado = await analisar(arquivoNome, contatos, deps);
    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    if (err instanceof PayloadInvalidoError) {
      return NextResponse.json({ ok: false, message: err.message }, { status: 422 });
    }
    // Log sem PII (só o motivo técnico) para diagnosticar falhas em produção.
    console.error("[/api/analise] falha:", err instanceof Error ? err.message : "erro desconhecido");
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
