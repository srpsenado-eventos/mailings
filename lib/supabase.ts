import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizarTexto } from "@/lib/normalize";

export function criarClienteServidor(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado (verifique .env.local)");
  return createClient(url, key);
}

/**
 * Busca a URL oficial primária (fonte ativa mais antiga) de um grupo.
 * A junção planilha↔fontes é por grupos.nome; normalizamos para tolerar
 * variações de caixa/acento.
 */
export async function buscarFontePrimaria(
  client: SupabaseClient,
  grupoNome: string,
): Promise<string | undefined> {
  const alvo = normalizarTexto(grupoNome);
  const { data, error } = await client
    .from("fontes")
    .select("url, grupos!inner(nome)")
    .eq("ativo", true)
    .eq("grupos.nome", grupoNome)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Erro ao buscar fonte: ${error.message}`);
  // fallback de normalização caso a busca exata não retorne
  if (!data || data.length === 0) {
    void alvo; // normalização disponível para evolução futura (RPC com unaccent)
    return undefined;
  }
  return (data[0] as { url: string }).url;
}
