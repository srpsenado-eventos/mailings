import stringSimilarity from "string-similarity";
import type {
  ContatoPlanilha,
  ConteudoFonte,
  PessoaSite,
  ResultadoContato,
  ResultadoGrupo,
  CampoDivergente,
  ComparacaoCampo,
  SituacaoCampo,
  OrigemVeredito,
  Semaforo,
} from "@/lib/types";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";

const LIMIAR_PESSOA = 0.6;
const LIMIAR_TOKEN = 0.85;
const LIMIAR_SUGESTAO = 0.4;
const MAX_SUGESTOES = 3;
/** Prefixos que mudam o sentido de um cargo de 1 token (ex.: "Presidente" ≠ "Vice-Presidente"). */
const PREFIXOS_NEGANTES = ["vice", "ex", "sub", "adjunto", "interino", "substituto"];

/**
 * Quando o rótulo da planilha não casa nenhum grupo cadastrado, sugere os nomes
 * cadastrados mais próximos (por similaridade) para o usuário alinhar a planilha.
 * Best-effort: para siglas "secas" sem letras em comum a similaridade é baixa e
 * nada é sugerido — a UI complementa com o link para a lista de grupos.
 */
export function sugerirGrupos(
  segmentos: string[],
  nomesCadastrados: string[],
  max = MAX_SUGESTOES,
): string[] {
  const segs = segmentos.map(normalizarTexto).filter((s) => s.length > 0);
  if (segs.length === 0) return [];
  return nomesCadastrados
    .map((nome) => {
      const nomeNorm = normalizarTexto(nome);
      const score = Math.max(
        ...segs.map((s) => stringSimilarity.compareTwoStrings(s, nomeNorm)),
      );
      return { nome, score };
    })
    .filter((r) => r.score >= LIMIAR_SUGESTAO)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((r) => r.nome);
}

/** Campos auditados contra a fonte. `site` devolve undefined quando a fonte não tem o dado. */
interface CampoAuditado {
  campo: string;
  planilha: (c: ContatoPlanilha) => string | undefined;
  site: (p: PessoaSite) => string | undefined;
}

const CAMPOS_AUDITADOS: CampoAuditado[] = [
  { campo: "cargo", planilha: (c) => c.cargo, site: (p) => p.cargo },
  { campo: "endereco", planilha: (c) => c.endereco, site: () => undefined },
  { campo: "telefone", planilha: (c) => c.telefone, site: () => undefined },
  { campo: "email", planilha: (c) => c.email, site: () => undefined },
];

function tokensNome(nome: string): string[] {
  return normalizarNome(nome)
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Pontua a semelhança entre dois nomes por sobreposição de tokens (não string
 * inteira), para casar variações como "Sívio Roberto Oliveira de Amorim Júnior"
 * com "Silvio Amorim Junior". Conta tokens com correspondência forte e divide
 * pelo menor conjunto — exige ≥2 tokens alinhados quando ambos têm ≥2 tokens.
 */
export function pontuarPessoa(nomePlanilha: string, nomeSite: string): number {
  const a = tokensNome(nomePlanilha);
  const b = tokensNome(nomeSite);
  if (a.length === 0 || b.length === 0) return 0;
  let fortes = 0;
  for (const ta of a) {
    const melhor = Math.max(...b.map((tb) => stringSimilarity.compareTwoStrings(ta, tb)));
    if (melhor >= LIMIAR_TOKEN) fortes += 1;
  }
  return fortes / Math.min(a.length, b.length);
}

function melhorPessoa(nome: string, pessoas: PessoaSite[]): { indice: number; score: number } {
  let indice = -1;
  let score = 0;
  pessoas.forEach((p, i) => {
    const s = pontuarPessoa(nome, p.nome);
    if (s > score) {
      score = s;
      indice = i;
    }
  });
  return { indice, score };
}

/** Tokens significativos (sem acento, sem pontuação, sem palavras de 1 letra). */
function tokensSignificativos(valor: string): string[] {
  return normalizarTexto(valor)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Compara cargo planilha × site por sobreposição de tokens (tolerante a
 * fragmentos e pontuação): "(Presidente)" confere com "Presidente do Supremo
 * Tribunal Federal". `confere` quando os tokens do menor cabem no maior.
 */
function situacaoCampo(valorPlanilha: string, valorSite?: string): SituacaoCampo {
  if (valorSite === undefined) return "fonte_nao_informa";
  const p = tokensSignificativos(valorPlanilha);
  const s = tokensSignificativos(valorSite);
  if (p.length === 0 || s.length === 0) {
    return normalizarTexto(valorPlanilha) === normalizarTexto(valorSite) ? "confere" : "divergente";
  }
  const [menor, maior] = p.length <= s.length ? [p, s] : [s, p];
  if (!menor.every((t) => maior.includes(t))) return "divergente";
  // Cargo de 1 token só confere se o maior não tem prefixo negante
  // ("Presidente" ⊄ "Vice-Presidente do…").
  if (menor.length === 1 && maior.some((t) => PREFIXOS_NEGANTES.includes(t))) return "divergente";
  return "confere";
}

/** Monta o veredito de um contato contra a pessoa casada (ou nenhuma → vermelho). */
function montarResultado(
  contato: ContatoPlanilha,
  pessoa: PessoaSite | undefined,
  score: number,
  origem: OrigemVeredito,
  url?: string,
): ResultadoContato {
  if (!pessoa) {
    return {
      contato,
      semaforo: "vermelho",
      score,
      comparacoes: [],
      camposDivergentes: [{ campo: "nome", valorPlanilha: contato.nome }],
      origem,
      fonteUrl: url,
    };
  }
  const comparacoes: ComparacaoCampo[] = [];
  for (const campo of CAMPOS_AUDITADOS) {
    const valorPlanilha = campo.planilha(contato);
    if (!valorPlanilha) continue; // nada a auditar neste campo
    const valorSite = campo.site(pessoa);
    comparacoes.push({
      campo: campo.campo,
      valorPlanilha,
      valorSite,
      situacao: situacaoCampo(valorPlanilha, valorSite),
    });
  }
  const camposDivergentes: CampoDivergente[] = comparacoes
    .filter((c) => c.situacao === "divergente")
    .map((c) => ({ campo: c.campo, valorPlanilha: c.valorPlanilha, valorEncontrado: c.valorSite }));
  const semaforo: Semaforo = camposDivergentes.length > 0 ? "amarelo" : "verde";
  return { contato, semaforo, score, comparacoes, camposDivergentes, origem, fonteUrl: url };
}

export function compararContato(
  contato: ContatoPlanilha,
  fonte: ConteudoFonte,
  origem: OrigemVeredito = "oficial",
): ResultadoContato {
  const { indice, score } = melhorPessoa(contato.nome, fonte.pessoas);
  const casou = indice >= 0 && score >= LIMIAR_PESSOA;
  return montarResultado(contato, casou ? fonte.pessoas[indice] : undefined, score, origem, fonte.url);
}

/**
 * Grupo cujo scrape falhou: a URL existe, mas não foi possível ler a página.
 * Não fabrica veredito (não conseguimos verificar) — marca cada contato como
 * "indeterminado" e expõe o motivo técnico para o usuário conferir à mão.
 */
export function marcarFonteInacessivel(
  grupo: string,
  contatos: ContatoPlanilha[],
  url: string,
  motivo: string,
): ResultadoGrupo {
  return {
    grupo,
    fonteUrl: url,
    semFonte: false,
    fonteInacessivel: true,
    erroFonte: motivo,
    contatos: contatos.map((c) => ({
      contato: c,
      semaforo: "indeterminado" as Semaforo,
      score: 0,
      comparacoes: [],
      camposDivergentes: [],
      origem: "oficial" as const,
      fonteUrl: url,
      observacao: "Fonte cadastrada, mas inacessível — verifique manualmente",
    })),
    novos: [],
  };
}

export function compararGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte | undefined,
  origem: OrigemVeredito = "oficial",
): ResultadoGrupo {
  if (!fonte) {
    return {
      grupo,
      semFonte: true,
      contatos: contatos.map((c) => ({
        contato: c,
        semaforo: "vermelho" as Semaforo,
        score: 0,
        comparacoes: [],
        camposDivergentes: [{ campo: "fonte", valorPlanilha: "sem URL cadastrada" }],
        origem: "oficial" as const,
        observacao: "Grupo sem fonte oficial cadastrada",
      })),
      novos: [],
    };
  }
  // Casa contatos a pessoas e marca as usadas, para "novos" = pessoas não casadas.
  const usados = new Set<number>();
  const resultados = contatos.map((c) => {
    const { indice, score } = melhorPessoa(c.nome, fonte.pessoas);
    const casou = indice >= 0 && score >= LIMIAR_PESSOA;
    if (casou) usados.add(indice);
    return montarResultado(c, casou ? fonte.pessoas[indice] : undefined, score, origem, fonte.url);
  });
  // "novos" só pessoas com cargo de autoridade — item de menu não tem cargo,
  // então fica de fora (reduz drasticamente o ruído de navegação).
  const novos = fonte.pessoas.filter((p, i) => !usados.has(i) && Boolean(p.cargo));
  return { grupo, fonteUrl: fonte.url, semFonte: false, contatos: resultados, novos };
}

/**
 * Compara o grupo contra a composição obtida pela 2ª etapa (pesquisa ampla via
 * Gemini), quando a fonte oficial estava inacessível/ausente. Marca o grupo e
 * cada veredito como `pesquisa_ampla` (complementar, não oficial) e preserva a
 * URL oficial (se houver) para o usuário conferir manualmente.
 */
export function compararGrupoAmplo(
  grupo: string,
  contatos: ContatoPlanilha[],
  fonteAmpla: ConteudoFonte,
  urlOficial?: string,
): ResultadoGrupo {
  const base = compararGrupo(grupo, contatos, fonteAmpla, "pesquisa_ampla");
  return { ...base, viaPesquisaAmpla: true, fonteUrl: urlOficial ?? base.fonteUrl };
}
