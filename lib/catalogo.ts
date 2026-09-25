import { normalizarTexto } from "@/lib/normalize";
import { sugerirGrupos } from "@/lib/match";
import { CATALOGO } from "@/data/catalogo";
import type { FonteCatalogo, GrupoCadastro, GrupoCatalogo } from "@/lib/types";

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

const TAMANHO_MIN_SEGMENTO = 3;

/** Casa um nome de grupo normalizado contra um segmento da planilha. */
function casaSegmento(nomeNorm: string, seg: string): boolean {
  if (seg.length < TAMANHO_MIN_SEGMENTO) return false; // guarda contra "pr" casar "presidente..."
  if (nomeNorm === seg) return true;
  // Contenção: a sigla curta da planilha ("cnj") cabe no nome formal cadastrado
  // ("conselho nacional de justica (cnj)").
  if (nomeNorm.includes(seg)) return true;
  // Contenção ao contrário: o rótulo do Contatos é o nome cadastrado mais um
  // qualificador no fim ("Presidente do Senado Federal" ↔ "Presidente do Senado").
  // Exige o nome cadastrado NO COMEÇO do rótulo, seguido de espaço: sem isso
  // "Vice-Presidente da República" casaria "Presidente da República", porque o
  // nome cadastrado também é o fim do rótulo.
  return seg.startsWith(`${nomeNorm} `);
}

/**
 * Filtra os grupos que casam com algum segmento da planilha.
 * Exato-primeiro: se algum grupo casa exatamente um segmento, só esses contam
 * (preserva casos já corretos, como "Ministros do STF"). Só quando não há
 * nenhum exato cai para a contenção (sigla curta dentro do nome formal).
 */
function gruposQueCasam(
  grupos: readonly GrupoCatalogo[],
  segmentos: string[],
): GrupoCatalogo[] {
  const exatos = grupos.filter((g) => segmentos.includes(normalizarTexto(g.nome)));
  if (exatos.length > 0) return exatos;
  return grupos.filter((g) => segmentos.some((seg) => casaSegmento(normalizarTexto(g.nome), seg)));
}

/**
 * Fonte primária dentre os grupos casados: a **primeira ativa na ordem do
 * catálogo**. No schema Postgres anterior era a mais antiga por `created_at`;
 * sem banco, a ordem do array é o critério — explícita e revisável no diff.
 */
function fontePrimariaDe(grupos: readonly GrupoCatalogo[]): FonteCatalogo | undefined {
  return grupos.flatMap((g) => g.fontes).find((f) => f.ativo);
}

/** Resolução de grupo: casamento com o cadastro + fontes oficiais + sugestões. */
export interface FonteResolvida {
  /** Nome do grupo como cadastrado. `undefined` quando nenhum grupo casa. */
  grupoCanonico?: string;
  /** TODAS as fontes ativas dos grupos casados, na ordem do catálogo. A 1ª é a primária. */
  fontes: FonteCatalogo[];
  /** URL da fonte primária. Derivada de `fontes[0]`; some quando `lib/analise.ts` parar de usá-la (Task 3). */
  url?: string;
  /** Faixa de UFs do grupo casado, quando cadastrada. Filtra proposta de inclusão. */
  ufs?: readonly string[];
  /** Quando nada casa: nomes cadastrados mais próximos, para orientar o usuário. */
  sugestoes: string[];
}

/**
 * Busca a URL oficial primária de um grupo.
 * A junção planilha↔catálogo é por nome, comparado normalizado (sem acento, sem
 * caixa) e por segmento — o rótulo da planilha pode juntar vários grupos com ";",
 * então casa qualquer segmento contra o cadastro, evitando falsos "sem fonte".
 */
export function buscarFontePrimaria(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): string | undefined {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return undefined;
  return fontePrimariaDe(gruposQueCasam(catalogo, segmentos))?.url;
}

/**
 * Resolve o rótulo da planilha para o grupo cadastrado e sua fonte oficial.
 * Sempre devolve um objeto: com `grupoCanonico` quando casa (e `url` se houver
 * fonte), ou só com `sugestoes` (nomes próximos) quando nenhum grupo casa — para
 * a UI orientar o usuário a alinhar a planilha em vez de um beco sem saída.
 */
export function resolverGrupoEFonte(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): FonteResolvida {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return { fontes: [], sugestoes: [] };

  const casados = gruposQueCasam(catalogo, segmentos);
  if (casados.length === 0) {
    return { fontes: [], sugestoes: sugerirGrupos(segmentos, catalogo.map((g) => g.nome)) };
  }

  const fontes = casados.flatMap((g) => g.fontes).filter((f) => f.ativo);
  // Prefere o nome do grupo que de fato fornece a fonte primária; senão, o 1º casado.
  const dono = casados.find((g) => g.fontes.some((f) => f.ativo && f.url === fontes[0]?.url));
  const grupo = dono ?? casados[0];
  return {
    grupoCanonico: grupo.nome,
    fontes,
    ...(fontes[0] ? { url: fontes[0].url } : {}),
    ...(grupo.ufs ? { ufs: grupo.ufs } : {}),
    sugestoes: [],
  };
}

function mapearGrupo(grupo: GrupoCatalogo): GrupoCadastro {
  const fonteAtiva = grupo.fontes.find((f) => f.ativo);
  return {
    nome: grupo.nome,
    responsavel1: grupo.responsavel1,
    responsavel2: grupo.responsavel2,
    backup: grupo.backup,
    emailResp1: grupo.emailResp1,
    emailResp2: grupo.emailResp2,
    emailBackup: grupo.emailBackup,
    fonteUrl: fonteAtiva?.url,
    temFonte: fonteAtiva !== undefined,
  };
}

/**
 * Lista os grupos do catálogo com seus responsáveis e o status de fonte oficial.
 * Alimenta a tela de visualização (/grupos). Ordenado por nome; não muta a entrada.
 */
export function listarGruposComFonte(
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): GrupoCadastro[] {
  return [...catalogo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(mapearGrupo);
}
