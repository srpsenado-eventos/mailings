import { NextResponse } from "next/server";
import { criarClienteServidor } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint TEMPORÁRIO de diagnóstico (sem PII — só nomes de grupo e URLs de
 * fonte, que já são públicos em /grupos). Revela exatamente o que a query
 * grupos→fontes enxerga em produção para STF/STJ/Senadores. REMOVER após uso.
 */
export async function GET() {
  const client = criarClienteServidor();
  const host = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(indefinido)";

  const { data, error } = await client
    .from("grupos")
    .select("nome, fontes(url, ativo, created_at)");
  if (error) {
    return NextResponse.json({ ok: false, etapa: "grupos->fontes", error: error.message });
  }

  type G = { nome: string; fontes: { url: string; ativo: boolean; created_at: string }[] | null };
  const grupos = (data ?? []) as G[];

  const alvos = grupos
    .filter((g) => /STF|STJ|Senadores \(Acre/i.test(g.nome))
    .map((g) => ({
      nome: g.nome,
      nomeRaw: JSON.stringify(g.nome), // expõe espaços/caracteres invisíveis
      nomeNorm: normalizarTexto(g.nome),
      totalFontes: g.fontes?.length ?? 0,
      ativas: (g.fontes ?? []).filter((f) => f.ativo).length,
      urls: (g.fontes ?? []).map((f) => `${f.ativo ? "[ON]" : "[off]"} ${f.url}`),
    }));

  // Conta direta na tabela fontes (sem embed) por ativo.
  const { count: fontesAtivas } = await client
    .from("fontes")
    .select("*", { count: "exact", head: true })
    .eq("ativo", true);

  return NextResponse.json({
    ok: true,
    host,
    totalGrupos: grupos.length,
    fontesAtivasCount: fontesAtivas,
    alvos,
  });
}
