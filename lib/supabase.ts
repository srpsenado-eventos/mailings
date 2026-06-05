import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizarTexto } from "@/lib/normalize";
import type { GrupoCadastro } from "@/lib/types";

export function criarClienteServidor(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado (verifique .env.local)");
  return createClient(url, key);
}

/** Linha de `fontes` com o nome do grupo via join. O Supabase pode tipar o
 * relacionamento como objeto ou array; tratamos ambos. */
interface FonteComGrupo {
  url: string;
  grupos: { nome: string } | { nome: string }[] | null;
}

function nomeDoGrupo(linha: FonteComGrupo): string {
  const g = linha.grupos;
  if (!g) return "";
  return Array.isArray(g) ? (g[0]?.nome ?? "") : g.nome;
}

/**
 * Quebra o rótulo "Grupo" da planilha em segmentos normalizados.
 * No Sistema Contatos uma mesma autoridade pertence a vários mailings ao mesmo
 * tempo, e a célula "Grupo" vem com eles colados por ";" (ex.: "MAILING RP -
 * Sessão Especial; ...; Ministros do STF"). Cada segmento é um grupo candidato
 * que pode ter fonte oficial cadastrada.
 */
function segmentarGrupo(grupoNome: string): string[] {
  return grupoNome
    .split(";")
    .map((s) => normalizarTexto(s))
    .filter((s) => s.length > 0);
}

/**
 * Busca a URL oficial primária (fonte ativa mais antiga) de um grupo.
 * A junção planilha↔fontes é por grupos.nome. A comparação é feita sobre o
 * nome normalizado (sem acento, sem caixa) e por segmento — o rótulo da
 * planilha pode juntar vários grupos com ";", então casa qualquer segmento
 * contra o cadastro, evitando falsos "sem fonte".
 */
export async function buscarFontePrimaria(
  client: SupabaseClient,
  grupoNome: string,
): Promise<string | undefined> {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return undefined;

  const { data, error } = await client
    .from("fontes")
    .select("url, grupos!inner(nome)")
    .eq("ativo", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Erro ao buscar fonte: ${error.message}`);
  if (!data) return undefined;

  const linhas = data as FonteComGrupo[];
  // Lista já vem ordenada por created_at asc; o primeiro match é a fonte primária.
  const match = linhas.find((linha) => segmentos.includes(normalizarTexto(nomeDoGrupo(linha))));
  return match?.url;
}

/** Linha de `grupos` com responsáveis e fontes via join (para a tela de visualização). */
interface GrupoComFontes {
  nome: string;
  responsavel_1: string | null;
  responsavel_2: string | null;
  backup: string | null;
  email_resp_1: string | null;
  email_resp_2: string | null;
  email_backup: string | null;
  fontes: { url: string; ativo: boolean }[] | null;
}

function vazioParaUndefined(v: string | null): string | undefined {
  return v ?? undefined;
}

function mapearGrupo(linha: GrupoComFontes): GrupoCadastro {
  const fonteAtiva = (linha.fontes ?? []).find((f) => f.ativo);
  return {
    nome: linha.nome,
    responsavel1: vazioParaUndefined(linha.responsavel_1),
    responsavel2: vazioParaUndefined(linha.responsavel_2),
    backup: vazioParaUndefined(linha.backup),
    emailResp1: vazioParaUndefined(linha.email_resp_1),
    emailResp2: vazioParaUndefined(linha.email_resp_2),
    emailBackup: vazioParaUndefined(linha.email_backup),
    fonteUrl: fonteAtiva?.url,
    temFonte: fonteAtiva !== undefined,
  };
}

/**
 * Lista os grupos cadastrados com seus responsáveis e o status de fonte oficial.
 * Alimenta a tela de visualização (/grupos). Ordenado por nome.
 */
export async function listarGruposComFonte(client: SupabaseClient): Promise<GrupoCadastro[]> {
  const { data, error } = await client
    .from("grupos")
    .select(
      "nome, responsavel_1, responsavel_2, backup, email_resp_1, email_resp_2, email_backup, fontes(url, ativo)",
    )
    .order("nome", { ascending: true });
  if (error) throw new Error(`Erro ao listar grupos: ${error.message}`);
  if (!data) return [];
  return (data as GrupoComFontes[]).map(mapearGrupo);
}
