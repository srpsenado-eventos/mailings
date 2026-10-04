import { NextRequest, NextResponse } from "next/server";
import { analisar, type Dependencias } from "@/lib/analise";
import { parsePayloadAnalise, PayloadInvalidoError } from "@/lib/analise-payload";
import { armazemPadrao } from "@/lib/armazem";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { modoDoApp } from "@/lib/modo";
import { montarRetrato } from "@/lib/painel";
import { rasparFonte } from "@/lib/raspagem";
import { extrairComposicao, diagnosticarIa } from "@/lib/gemini";

const AVISO_NAO_GUARDADO = "A varredura terminou, mas o retrato não pôde ser guardado: na próxima abertura o app não a terá.";

/**
 * Recebe os contatos (e, opcionalmente, os endereços) já extraídos no navegador, varre as
 * fontes a partir desta máquina e grava o retrato em `.fiscal/retrato.json`. Sem teto de
 * tempo: o app é local (spec 2026-10-01, painel local). A rota não é testada diretamente;
 * `analisar`, `montarRetrato` e o `Armazem` são.
 */
export async function POST(req: NextRequest) {
  // A Vercel nunca lê fonte (spec 2026-10-02 §6.5): em modo web a rota não existe.
  if (modoDoApp() === "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  try {
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return NextResponse.json({ ok: false, message: "Corpo inválido (esperado JSON)." }, { status: 400 });
    }

    const { arquivoNome, contatos, arquivoEnderecosNome, enderecos } = parsePayloadAnalise(corpo);

    const deps: Dependencias = {
      resolverFonte: (grupo) => resolverGrupoEFonte(grupo),
      raspar: (fonte) => rasparFonte(fonte),
      extrairComposicao: (grupoCanonico, textoLimpo) => extrairComposicao(grupoCanonico, textoLimpo),
    };

    const resultado = await analisar(arquivoNome, contatos, deps, enderecos);
    const retrato = montarRetrato(
      resultado,
      {
        contatos: { nome: arquivoNome, linhas: contatos.length },
        ...(enderecos
          ? { enderecos: { nome: arquivoEnderecosNome ?? "endereços", linhas: enderecos.length } }
          : {}),
      },
      new Date(),
    );

    let aviso: string | undefined;
    try {
      await armazemPadrao().gravarRetrato(retrato);
    } catch (err) {
      // Só o motivo técnico: o retrato tem PII e nunca vai para o log.
      console.error("[/api/analise] retrato não guardado:", err instanceof Error ? err.message : "erro desconhecido");
      aviso = AVISO_NAO_GUARDADO;
    }

    // Diagnóstico temporário (não-PII): só roda com ?diag=1 (custo zero no fluxo normal).
    const diag = req.nextUrl.searchParams.get("diag") === "1" ? await diagnosticarIa() : undefined;
    return NextResponse.json({ ok: true, retrato, ...(aviso ? { aviso } : {}), ...(diag ? { diag } : {}) });
  } catch (err) {
    if (err instanceof PayloadInvalidoError) {
      return NextResponse.json({ ok: false, message: err.message }, { status: 422 });
    }
    // Log sem PII (só o motivo técnico).
    console.error("[/api/analise] falha:", err instanceof Error ? err.message : "erro desconhecido");
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
