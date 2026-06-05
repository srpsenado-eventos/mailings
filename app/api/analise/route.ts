import { NextRequest, NextResponse } from "next/server";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";
import { analisar, type Dependencias } from "@/lib/analise";
import { criarClienteServidor, buscarFontePrimaria } from "@/lib/supabase";
import { raspar } from "@/lib/scrape";
import { refinarComGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Limite de tamanho do upload — protege a função serverless contra exaustão de memória. */
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("arquivo");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "Arquivo não enviado." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return NextResponse.json(
        { ok: false, message: "Formato inválido. Envie uma planilha .xlsx." },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ ok: false, message: "Arquivo vazio." }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { ok: false, message: "Arquivo muito grande (máximo 15 MB)." },
        { status: 413 },
      );
    }

    const buffer = await file.arrayBuffer();
    const contatos = lerPlanilha(buffer);

    const supabase = criarClienteServidor();
    const deps: Dependencias = {
      resolverFonte: (grupo) => buscarFontePrimaria(supabase, grupo),
      raspar,
      refinar: (grupo, fonte) => refinarComGemini(grupo, fonte),
    };

    const resultado = await analisar(file.name, contatos, deps);
    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    if (err instanceof ColunaFaltanteError) {
      return NextResponse.json(
        { ok: false, message: `Planilha inválida. ${err.message}` },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
