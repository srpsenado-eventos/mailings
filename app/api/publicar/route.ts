import { NextRequest, NextResponse } from "next/server";
import { armazemPadrao, RetratoIlegivelError } from "@/lib/armazem";
import { armazemEmBlob, clienteBlobPadrao } from "@/lib/armazem-blob";
import { armazemDecisoesEmBlob, armazemDecisoesPadrao, DecisoesIlegiveisError } from "@/lib/armazem-decisoes";
import { modoDoApp } from "@/lib/modo";
import { origemPermitida } from "@/lib/origem";
import { enxugarParaPublicar } from "@/lib/publicar";

/**
 * Publica o último retrato desta máquina no Blob, sem telefone, e-mail e rede social
 * (spec 2026-10-02 §6.3). Só em modo local; na Vercel não existe. O retrato local não muda.
 * As decisões do GT vão junto, num objeto próprio (spec 2026-10-30 §4.1.2); sem arquivo, vão vazias.
 */
export async function POST(req: NextRequest) {
  if (!origemPermitida(req.headers)) return NextResponse.json({ ok: false, message: "Origem não permitida." }, { status: 403 });
  if (modoDoApp() === "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ ok: false, message: "Publicação não configurada: falta BLOB_READ_WRITE_TOKEN em .env.local." }, { status: 400 });
  try {
    const retrato = await armazemPadrao().lerRetrato();
    if (!retrato) return NextResponse.json({ ok: false, message: "Não há varredura para publicar." }, { status: 400 });
    // Lidas antes de gravar qualquer coisa: arquivo ilegível não publica nada (nem apaga as decisões da web).
    const decisoes = await armazemDecisoesPadrao().ler();
    const publicadoEm = new Date().toISOString();
    const cliente = clienteBlobPadrao(token);
    await armazemDecisoesEmBlob(cliente).gravar(decisoes);
    await armazemEmBlob(cliente).gravarRetrato(enxugarParaPublicar(retrato, publicadoEm));
    return NextResponse.json({ ok: true, publicadoEm });
  } catch (err) {
    if (err instanceof RetratoIlegivelError) return NextResponse.json({ ok: false, message: "O retrato local não pôde ser lido." }, { status: 422 });
    if (err instanceof DecisoesIlegiveisError) return NextResponse.json({ ok: false, message: "O arquivo .fiscal/decisoes.json não pôde ser lido; nada foi publicado." }, { status: 422 });
    // Só o motivo técnico: nunca o retrato.
    console.error("[/api/publicar] falha:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível publicar. Tente de novo." }, { status: 500 });
  }
}
