import { NextRequest, NextResponse } from "next/server";
import { armazemDecisoesPadrao, tratarRegistroDeDecisao } from "@/lib/armazem-decisoes";
import { modoDoApp } from "@/lib/modo";
import { origemPermitida } from "@/lib/origem";

/**
 * Registra uma decisão do GT em `.fiscal/decisoes.json` (spec 2026-10-30 §4.1.2). Só em modo local;
 * a web só lê a cópia publicada. Corpo: `{ nome, nomes, registro }`. A lógica está em
 * `tratarRegistroDeDecisao`, testada; a rota só faz o HTTP.
 */
export async function POST(req: NextRequest) {
  if (!origemPermitida(req.headers)) return NextResponse.json({ ok: false, message: "Origem não permitida." }, { status: 403 });
  if (modoDoApp() === "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Corpo inválido (esperado JSON)." }, { status: 400 });
  }
  try {
    const resposta = await tratarRegistroDeDecisao(corpo, armazemDecisoesPadrao());
    return NextResponse.json(resposta.corpo, { status: resposta.status });
  } catch (err) {
    // Só o motivo técnico: nunca o nome da pessoa nem o texto da decisão.
    console.error("[/api/decisoes] falha:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível gravar a decisão. Tente de novo." }, { status: 500 });
  }
}
