import { NextResponse } from "next/server";
import { armazemPadrao, RetratoIlegivelError } from "@/lib/armazem";
import { armazemEmBlob, clienteBlobPadrao } from "@/lib/armazem-blob";
import { modoDoApp } from "@/lib/modo";
import { enxugarParaPublicar } from "@/lib/publicar";

/**
 * Publica o último retrato desta máquina no Blob, sem telefone, e-mail e rede social
 * (spec 2026-10-02 §6.3). Só em modo local; na Vercel não existe. O retrato local não muda.
 */
export async function POST() {
  if (modoDoApp() === "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ ok: false, message: "Publicação não configurada: falta BLOB_READ_WRITE_TOKEN em .env.local." }, { status: 400 });
  try {
    const retrato = await armazemPadrao().lerRetrato();
    if (!retrato) return NextResponse.json({ ok: false, message: "Não há varredura para publicar." }, { status: 400 });
    const publicadoEm = new Date().toISOString();
    await armazemEmBlob(clienteBlobPadrao(token)).gravarRetrato(enxugarParaPublicar(retrato, publicadoEm));
    return NextResponse.json({ ok: true, publicadoEm });
  } catch (err) {
    if (err instanceof RetratoIlegivelError) return NextResponse.json({ ok: false, message: "O retrato local não pôde ser lido." }, { status: 422 });
    // Só o motivo técnico: nunca o retrato.
    console.error("[/api/publicar] falha:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível publicar. Tente de novo." }, { status: 500 });
  }
}
