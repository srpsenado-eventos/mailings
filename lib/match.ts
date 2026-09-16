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
import { CARGOS } from "@/lib/cargos";
import { comparacoesCoerencia, comparacoesProtocolo } from "@/lib/tratamento";

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

/**
 * Compõe a lista final de pessoas a partir da Camada 1 (página) e da Camada 2 (IA):
 * - Página ilegível (sem pessoas) → usa a composição da IA (cobertura, ex.: TCU/JS).
 * - Página legível → base oficial + RESGATE: anexa só as pessoas da IA que casam algum
 *   contato da planilha E ainda não estão na página. Evita o falso "possível saída" quando
 *   a extração escapou um nome, sem poluir "novos" com gente que a IA imaginou.
 * A página sempre vence em caso de empate (mantém a proveniência oficial).
 */
export function mesclarComposicao(
  pessoasPagina: PessoaSite[],
  pessoasIA: PessoaSite[],
  contatos: ContatoPlanilha[],
): PessoaSite[] {
  if (pessoasPagina.length === 0) return [...pessoasIA];
  const resgates = pessoasIA.filter(
    (ia) =>
      contatos.some((c) => pontuarPessoa(c.nome, ia.nome) >= LIMIAR_PESSOA) &&
      !pessoasPagina.some((p) => pontuarPessoa(p.nome, ia.nome) >= LIMIAR_PESSOA),
  );
  return [...pessoasPagina, ...resgates];
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

/** Papéis de autoridade (do léxico) presentes no valor, por token exato. */
function rolesDe(valor: string): string[] {
  return tokensSignificativos(valor).filter((t) => CARGOS.includes(t));
}

/**
 * Compara cargo planilha × site com foco no objetivo da auditoria: confirmar o
 * PAPEL declarado na planilha, ignorando qualificadores extras da fonte
 * ("Ministro (Decano)" confirma "Ministro do STF"), mas ainda flagrando mudança
 * real de papel (Ministro→Presidente), gênero (Ministro≠Ministra) e prefixo
 * (Presidente≠Vice-Presidente, Senador≠Ex-Senador). Sem palavra-chave de cargo,
 * cai na comparação por tokens.
 */
function situacaoCampo(valorPlanilha: string, valorEsperado?: string): SituacaoCampo {
  if (valorEsperado === undefined) return "fonte_nao_informa";
  const tp = tokensSignificativos(valorPlanilha);
  const ts = tokensSignificativos(valorEsperado);
  const rolesP = rolesDe(valorPlanilha);

  if (rolesP.length > 0) {
    const rolesS = rolesDe(valorEsperado);
    // todo papel da planilha precisa estar confirmado na fonte
    if (!rolesP.every((r) => rolesS.includes(r))) return "divergente";
    // prefixo negante presente em só um dos lados → papéis diferentes
    if (PREFIXOS_NEGANTES.some((x) => tp.includes(x) !== ts.includes(x))) return "divergente";
    return "confere";
  }

  // cargo sem papel conhecido → comparação por tokens (tolerante a fragmentos)
  if (tp.length === 0 || ts.length === 0) {
    return normalizarTexto(valorPlanilha) === normalizarTexto(valorEsperado) ? "confere" : "divergente";
  }
  const [menor, maior] = tp.length <= ts.length ? [tp, ts] : [ts, tp];
  if (!menor.every((t) => maior.includes(t))) return "divergente";
  if (menor.length === 1 && maior.some((t) => PREFIXOS_NEGANTES.includes(t))) return "divergente";
  return "confere";
}

/** Nome: o site é o parâmetro — confere só se igual normalizado. */
function situacaoNome(planilha: string, site: string): SituacaoCampo {
  return normalizarNome(planilha) === normalizarNome(site) ? "confere" : "divergente";
}

/**
 * Auditoria de Tratamento e Endereçamento — Camada A (coerência interna do contato) e
 * Camada B (conformidade com a tabela de protocolo). Nenhuma das duas depende do site,
 * então valem nos quatro caminhos de veredito, inclusive naqueles em que a página não
 * pôde ser lida ou o grupo não tem fonte cadastrada.
 * Ver docs/superpowers/specs/2026-09-15-auditoria-tratamento-correcao-de-alvo.md.
 */
function comparacoesTratamento(contato: ContatoPlanilha): ComparacaoCampo[] {
  return [...comparacoesCoerencia(contato), ...comparacoesProtocolo(contato)];
}

/**
 * Divergências no formato do badge e do export. `fonte_nao_informa` e `sem_regra` ficam
 * de fora de propósito: são limites da fonte e do cadastro de regras, não defeitos do
 * contato, e por contrato não pintam amarelo.
 */
function divergenciasDe(comparacoes: readonly ComparacaoCampo[]): CampoDivergente[] {
  return comparacoes
    .filter((c) => c.situacao === "divergente")
    .map((c) => ({ campo: c.campo, valorPlanilha: c.valorPlanilha, valorEncontrado: c.valorEsperado }));
}

/** Monta o veredito de um contato contra a pessoa casada (ou nenhuma → possível saída). */
function montarResultado(
  contato: ContatoPlanilha,
  pessoa: PessoaSite | undefined,
  score: number,
  url?: string,
): ResultadoContato {
  if (!pessoa) {
    // A auditoria de tratamento vale também para quem saiu: não depende da fonte, e o
    // achado tem que chegar ao export junto com a possível saída, não no lugar dela.
    const protocolo = comparacoesTratamento(contato);
    return {
      contato,
      semaforo: "vermelho",
      score,
      comparacoes: protocolo,
      camposDivergentes: [
        { campo: "nome", valorPlanilha: contato.nome },
        ...divergenciasDe(protocolo),
      ],
      possivelSaida: true,
      origem: "oficial",
      fonteUrl: url,
      observacao: "Não consta na fonte (possível saída)",
    };
  }
  const ov = pessoa.origem;
  const origem: OrigemVeredito = pessoa.origem === "conhecimento" ? "pesquisa_ampla" : "oficial";
  const comparacoes: ComparacaoCampo[] = [
    {
      campo: "nome",
      valorPlanilha: contato.nome,
      valorEsperado: pessoa.nome,
      origemValor: ov,
      situacao: situacaoNome(contato.nome, pessoa.nome),
    },
  ];
  if (contato.cargo) {
    comparacoes.push({
      campo: "cargo",
      valorPlanilha: contato.cargo,
      valorEsperado: pessoa.cargo,
      origemValor: ov,
      situacao: situacaoCampo(contato.cargo, pessoa.cargo),
    });
  }
  if (contato.endereco) {
    comparacoes.push({
      campo: "endereco",
      valorPlanilha: contato.endereco,
      valorEsperado: pessoa.endereco,
      origemValor: ov,
      situacao: situacaoCampo(contato.endereco, pessoa.endereco),
    });
  }
  for (const campo of ["telefone", "email"] as const) {
    const v = contato[campo];
    if (v) comparacoes.push({ campo, valorPlanilha: v, valorEsperado: undefined, situacao: "fonte_nao_informa" });
  }
  comparacoes.push(...comparacoesTratamento(contato));
  // Semáforo e divergências derivam de `comparacoes`: um achado de tratamento pinta
  // amarelo sozinho, e nunca "possível saída" — esta só existe sem pessoa casada.
  const camposDivergentes = divergenciasDe(comparacoes);
  const semaforo: Semaforo = camposDivergentes.length > 0 ? "amarelo" : "verde";
  return { contato, semaforo, score, comparacoes, camposDivergentes, origem, fonteUrl: url };
}

export function compararContato(contato: ContatoPlanilha, fonte: ConteudoFonte): ResultadoContato {
  const { indice, score } = melhorPessoa(contato.nome, fonte.pessoas);
  const casou = indice >= 0 && score >= LIMIAR_PESSOA;
  return montarResultado(contato, casou ? fonte.pessoas[indice] : undefined, score, fonte.url);
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
    contatos: contatos.map((c) => {
      // A página não pôde ser lida, mas Tratamento e Endereçamento continuam auditáveis.
      // O semáforo segue "indeterminado": ele descreve a verificação contra o site, que
      // de fato não aconteceu — as divergências, essas, precisam chegar ao export.
      const protocolo = comparacoesTratamento(c);
      return {
        contato: c,
        semaforo: "indeterminado" as Semaforo,
        score: 0,
        comparacoes: protocolo,
        camposDivergentes: divergenciasDe(protocolo),
        origem: "oficial" as const,
        fonteUrl: url,
        observacao: "Fonte cadastrada, mas inacessível — verifique manualmente",
      };
    }),
    novos: [],
  };
}

export function compararGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte | undefined,
): ResultadoGrupo {
  if (!fonte) {
    return {
      grupo,
      semFonte: true,
      contatos: contatos.map((c) => {
        // Sem URL cadastrada não há o que comparar com o site, mas o protocolo é
        // auditável. O vermelho continua sendo do grupo (falta fonte), não do contato.
        const protocolo = comparacoesTratamento(c);
        return {
          contato: c,
          semaforo: "vermelho" as Semaforo,
          score: 0,
          comparacoes: protocolo,
          camposDivergentes: [
            { campo: "fonte", valorPlanilha: "sem URL cadastrada" },
            ...divergenciasDe(protocolo),
          ],
          origem: "oficial" as const,
          observacao: "Grupo sem fonte oficial cadastrada",
        };
      }),
      novos: [],
    };
  }
  // Casa contatos a pessoas e marca as usadas, para "novos" = pessoas não casadas.
  const usados = new Set<number>();
  const resultados = contatos.map((c) => {
    const { indice, score } = melhorPessoa(c.nome, fonte.pessoas);
    const casou = indice >= 0 && score >= LIMIAR_PESSOA;
    if (casou) usados.add(indice);
    return montarResultado(c, casou ? fonte.pessoas[indice] : undefined, score, fonte.url);
  });
  // "novos" só pessoas com cargo de autoridade — item de menu não tem cargo,
  // então fica de fora (reduz drasticamente o ruído de navegação).
  const novos = fonte.pessoas.filter((p, i) => !usados.has(i) && Boolean(p.cargo));
  return { grupo, fonteUrl: fonte.url, semFonte: false, contatos: resultados, novos };
}
