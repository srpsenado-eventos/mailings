import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizarTexto } from "@/lib/normalize";
import { sugerirGrupos } from "@/lib/match";
import type { GrupoCadastro } from "@/lib/types";

export function criarClienteServidor(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado (verifique .env.local)");
  return createClient(url, key);
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

/** Linha de `grupos` com suas fontes via embed grupos→fontes (mesmo caminho de
 * listarGruposComFonte). */
interface GrupoComFonteUrl {
  nome: string;
  fontes: { url: string; ativo: boolean; created_at: string }[] | null;
}

const TAMANHO_MIN_SEGMENTO = 3;

/** Casa um nome de grupo normalizado contra um segmento da planilha. */
function casaSegmento(nomeNorm: string, seg: string): boolean {
  // Contenção: a sigla curta da planilha ("cnj") cabe no nome formal cadastrado
  // ("conselho nacional de justica (cnj)"). Guarda de tamanho evita que pedaços
  // de 1-2 letras casem grupos longos por engano (ex.: "pr" em "presidente...").
  return seg.length >= TAMANHO_MIN_SEGMENTO && (nomeNorm === seg || nomeNorm.includes(seg));
}

/**
 * Filtra os grupos que casam com algum segmento da planilha.
 * Exato-primeiro: se algum grupo casa exatamente um segmento, só esses contam
 * (preserva casos já corretos, como "Ministros do STF"). Só quando não há
 * nenhum exato cai para a contenção (sigla curta dentro do nome formal).
 */
function gruposQueCasam<T extends { nome: string }>(grupos: T[], segmentos: string[]): T[] {
  const exatos = grupos.filter((g) => segmentos.includes(normalizarTexto(g.nome)));
  if (exatos.length > 0) return exatos;
  return grupos.filter((g) => segmentos.some((seg) => casaSegmento(normalizarTexto(g.nome), seg)));
}

/**
 * Busca a URL oficial primária (fonte ativa mais antiga) de um grupo.
 * A junção planilha↔fontes é por grupos.nome. A comparação é feita sobre o
 * nome normalizado (sem acento, sem caixa) e por segmento — o rótulo da
 * planilha pode juntar vários grupos com ";", então casa qualquer segmento
 * contra o cadastro, evitando falsos "sem fonte".
 *
 * Usa o embed grupos→fontes (e não fontes→grupos!inner): é o mesmo caminho da
 * tela /grupos, comprovadamente robusto em produção, onde o embed inverso com
 * `!inner` deixava de retornar certos grupos de forma intermitente.
 */
export async function buscarFontePrimaria(
  client: SupabaseClient,
  grupoNome: string,
): Promise<string | undefined> {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return undefined;

  const grupos = await carregarGruposComFonte(client);
  return fontePrimariaDe(gruposQueCasam(grupos, segmentos))?.url;
}

/** Resolução de grupo: casamento com o cadastro + fonte oficial + sugestões. */
export interface FonteResolvida {
  /** Nome do grupo como cadastrado. `undefined` quando nenhum grupo casa. */
  grupoCanonico?: string;
  /** URL oficial primária ativa, se o grupo casado tiver fonte cadastrada. */
  url?: string;
  /** Quando nada casa: nomes cadastrados mais próximos, para orientar o usuário. */
  sugestoes: string[];
}

/**
 * Resolve o rótulo da planilha para o grupo cadastrado e sua fonte oficial.
 * Sempre devolve um objeto: com `grupoCanonico` quando casa (e `url` se houver
 * fonte), ou só com `sugestoes` (nomes próximos) quando nenhum grupo casa — para
 * a UI orientar o usuário a alinhar a planilha em vez de um beco sem saída.
 */
export async function resolverGrupoEFonte(
  client: SupabaseClient,
  grupoNome: string,
): Promise<FonteResolvida> {
  const segmentos = segmentarGrupo(grupoNome);
  const grupos = await carregarGruposComFonte(client);
  if (segmentos.length === 0) return { sugestoes: [] };

  const casados = gruposQueCasam(grupos, segmentos);
  if (casados.length === 0) {
    return { sugestoes: sugerirGrupos(segmentos, grupos.map((g) => g.nome)) };
  }

  const primaria = fontePrimariaDe(casados);
  // Prefere o nome do grupo que de fato fornece a fonte primária; senão, o 1º casado.
  const canonico = casados.find((g) => (g.fontes ?? []).some((f) => f.ativo && f.url === primaria?.url));
  return { grupoCanonico: (canonico ?? casados[0]).nome, url: primaria?.url, sugestoes: [] };
}

async function carregarGruposComFonte(client: SupabaseClient): Promise<GrupoComFonteUrl[]> {
  const { data, error } = await client
    .from("grupos")
    .select("nome, fontes(url, ativo, created_at)");
  if (error) throw new Error(`Erro ao buscar fonte: ${error.message}`);
  return (data as GrupoComFonteUrl[] | null) ?? [];
}

/** Fonte ativa mais antiga (primária) dentre os grupos casados. */
function fontePrimariaDe(grupos: GrupoComFonteUrl[]): { url: string; created_at: string } | undefined {
  return grupos
    .flatMap((g) => g.fontes ?? [])
    .filter((f) => f.ativo)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
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
