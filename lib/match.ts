import stringSimilarity from "string-similarity";
import type {
  ContatoPlanilha,
  ConteudoFonte,
  PessoaSite,
  ResultadoContato,
  ResultadoGrupo,
  CampoDivergente,
  ComparacaoCampo,
  FonteIndividual,
  LeituraAlternativa,
  SituacaoCampo,
  OrigemVeredito,
  Semaforo,
} from "@/lib/types";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { CARGOS } from "@/lib/cargos";
import { comparacaoRegraNome, comparacoesCoerencia, comparacoesProtocolo } from "@/lib/tratamento";

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

/**
 * Quantos contatos casam alguém da composição, pela mesma régua de `mesclarComposicao`.
 * Serve à leitura parcial da spec 2026-10-20 (§5.1, passo 4): a página de hoje casou
 * menos da metade do grupo?
 */
export function contarContatosCasados(contatos: readonly ContatoPlanilha[], pessoas: readonly PessoaSite[]): number {
  return contatos.filter((c) => pessoas.some((p) => pontuarPessoa(c.nome, p.nome) >= LIMIAR_PESSOA)).length;
}

/**
 * Une as composições das várias fontes ativas de um grupo, na ordem do catálogo. A
 * primeira fonte que publica alguém vence: a mesma autoridade pode constar em duas
 * páginas do mesmo órgão, e contá-la duas vezes duplicaria a proposta de inclusão e
 * bagunçaria o casamento por índice de `compararGrupo`.
 *
 * A comparação só olha para TRÁS: cada pessoa é testada contra quem as fontes ANTERIORES
 * já contribuíram, nunca contra alguém da própria lista. Sem essa guarda, duas autoridades
 * de verdade na mesma página que só compartilham sobrenomes (ex.: "Carlos Eduardo Silva" e
 * "Carlos Eduardo Souza") ou um nome de uma palavra contido num mais completo pontuam ≥
 * `LIMIAR_PESSOA` uma contra a outra e uma delas some da composição — exatamente o nome
 * curto que a extração de tabela (Task 2) foi buscar recuperar.
 */
export function unirFontes(listas: PessoaSite[][]): PessoaSite[] {
  const unida: PessoaSite[] = [];
  let deFontesAnteriores: PessoaSite[] = [];
  for (const lista of listas) {
    for (const pessoa of lista) {
      const repetida = deFontesAnteriores.some(
        (p) => pontuarPessoa(p.nome, pessoa.nome) >= LIMIAR_PESSOA,
      );
      if (!repetida) unida.push(pessoa);
    }
    // Fecha a fonte com uma cópia: `unida` segue crescendo nas próximas fontes, e sem a
    // cópia essa mesma referência faria a fonte seguinte se comparar contra si mesma.
    deFontesAnteriores = [...unida];
  }
  return unida;
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
 * Auditoria de Tratamento, Endereçamento e Nome — Camada A (coerência interna do
 * contato), Camada B (conformidade com a tabela de protocolo) e Camada C (regras de
 * escrita do cadastro, por grupo canônico). Nenhuma das três depende do site, então
 * valem nos quatro caminhos de veredito, inclusive naqueles em que a página não pôde
 * ser lida ou o grupo não tem fonte cadastrada.
 *
 * `grupoCanonico` é o nome do grupo **cadastrado** (`data/catalogo.ts`), não o rótulo
 * cru da coluna `Grupo` da planilha — que pode ser um apelido. Só a Camada C usa: é a
 * chave de `data/regras-nome.ts`.
 * Ver docs/superpowers/specs/2026-09-15-auditoria-tratamento-correcao-de-alvo.md e
 * docs/superpowers/specs/2026-09-18-regras-de-escrita-do-cadastro.md.
 */
function comparacoesTratamento(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
): ComparacaoCampo[] {
  return [
    ...comparacoesCoerencia(contato),
    ...comparacoesProtocolo(contato),
    ...comparacaoRegraNome(contato, grupoCanonico),
  ];
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

/**
 * Texto do contato não casado quando alguma fonte do grupo não respondeu. Diz o que
 * aconteceu (verificação incompleta) sem afirmar o que não se sabe (saída).
 */
export const OBSERVACAO_VERIFICACAO_INCOMPLETA =
  "Não consta nas fontes que responderam, mas uma fonte do grupo não respondeu — confira manualmente";

/** Monta o veredito de um contato contra a pessoa casada (ou nenhuma → possível saída). */
function montarResultado(
  contato: ContatoPlanilha,
  pessoa: PessoaSite | undefined,
  score: number,
  grupoCanonico: string | undefined,
  url?: string,
  leituraParcial?: boolean,
): ResultadoContato {
  if (!pessoa) {
    // A auditoria de tratamento vale também para quem saiu: não depende da fonte, e o
    // achado tem que chegar ao export junto com a possível saída, não no lugar dela.
    const protocolo = comparacoesTratamento(contato, grupoCanonico);
    if (leituraParcial) {
      // Regra de ouro: parte das fontes ativas respondeu e parte não, então a composição
      // oficial está incompleta e a ausência não prova nada. Indeterminado, nunca saída.
      return {
        contato,
        semaforo: "indeterminado",
        score,
        comparacoes: protocolo,
        camposDivergentes: divergenciasDe(protocolo),
        origem: "oficial",
        fonteUrl: url,
        observacao: OBSERVACAO_VERIFICACAO_INCOMPLETA,
      };
    }
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
  comparacoes.push(...comparacoesTratamento(contato, grupoCanonico));
  // Semáforo e divergências derivam de `comparacoes`: um achado de tratamento pinta
  // amarelo sozinho, e nunca "possível saída" — esta só existe sem pessoa casada.
  const camposDivergentes = divergenciasDe(comparacoes);
  const semaforo: Semaforo = camposDivergentes.length > 0 ? "amarelo" : "verde";
  // Casou por fonte rotulada (ex.: a lista de fora de exercício): o cadastro está certo,
  // e o que o usuário precisa saber é a situação, não uma divergência.
  const nota = pessoa.rotuloFonte
    ? [pessoa.rotuloFonte, pessoa.contexto].filter(Boolean).join(" — ")
    : undefined;
  return {
    contato,
    semaforo,
    score,
    comparacoes,
    camposDivergentes,
    origem,
    fonteUrl: pessoa.fonteUrl ?? url,
    ...(nota ? { observacao: nota } : {}),
  };
}

/**
 * A pessoa pertence à faixa de UF do grupo? Sem faixa cadastrada, ou sem UF publicada
 * pela fonte, não há o que filtrar e a resposta é sim — o filtro nunca inventa exclusão.
 */
function naFaixaDeUf(pessoa: PessoaSite, ufs?: readonly string[]): boolean {
  if (!ufs || ufs.length === 0 || !pessoa.uf) return true;
  return ufs.includes(pessoa.uf.toUpperCase());
}

/**
 * Compara um contato isolado contra uma fonte, sem contexto de grupo — usado nos testes
 * de campo a campo. Sem grupo canônico, a Camada C (por grupo) não entra; as demais
 * camadas não dependem dele.
 */
export function compararContato(contato: ContatoPlanilha, fonte: ConteudoFonte): ResultadoContato {
  const { indice, score } = melhorPessoa(contato.nome, fonte.pessoas);
  const casou = indice >= 0 && score >= LIMIAR_PESSOA;
  return montarResultado(contato, casou ? fonte.pessoas[indice] : undefined, score, undefined, fonte.url);
}

/**
 * Grupo cujo scrape falhou: a URL existe, mas não foi possível ler a página.
 * Não fabrica veredito (não conseguimos verificar) — marca cada contato como
 * "indeterminado" e expõe o motivo técnico para o usuário conferir à mão.
 */
export function marcarFonteInacessivel(
  grupo: string,
  contatos: ContatoPlanilha[],
  url: string | undefined,
  motivo: string,
  grupoCanonico?: string,
): ResultadoGrupo {
  return {
    grupo,
    ...(url ? { fonteUrl: url } : {}),
    semFonte: false,
    fonteInacessivel: true,
    erroFonte: motivo,
    contatos: contatos.map((c) => {
      // A página não pôde ser lida, mas Tratamento, Endereçamento e Nome continuam
      // auditáveis. O semáforo segue "indeterminado": ele descreve a verificação contra
      // o site, que de fato não aconteceu — as divergências, essas, precisam chegar ao
      // export.
      const protocolo = comparacoesTratamento(c, grupoCanonico);
      return {
        contato: c,
        semaforo: "indeterminado" as Semaforo,
        score: 0,
        comparacoes: protocolo,
        camposDivergentes: divergenciasDe(protocolo),
        origem: "oficial" as const,
        ...(url ? { fonteUrl: url } : {}),
        observacao: "Fonte cadastrada, mas inacessível — verifique manualmente",
      };
    }),
    novos: [],
  };
}

/**
 * @param leituraParcial Parte das fontes ativas do grupo respondeu e parte não (erro, ou 200
 *   sem ninguém). Quem não casar fica `indeterminado` em vez de "possível saída": falta um
 *   pedaço da composição oficial e a ausência não prova nada. **Só a leitura PARCIAL suspende
 *   o veredito.** Composição inteiramente vinda da IA é composição real e segue podendo
 *   apontar saída, marcada `viaPesquisaAmpla` — é a regra de ouro do CLAUDE.md ("página *ou
 *   IA*") e o caminho documentado do TCU.
 */
export function compararGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte | undefined,
  grupoCanonico?: string,
  ufsDoGrupo?: readonly string[],
  leituraParcial?: boolean,
): ResultadoGrupo {
  if (!fonte) {
    return {
      grupo,
      semFonte: true,
      contatos: contatos.map((c) => {
        // Sem URL cadastrada não há o que comparar com o site, mas o protocolo e as
        // regras de escrita são auditáveis. O vermelho continua sendo do grupo (falta
        // fonte), não do contato.
        const protocolo = comparacoesTratamento(c, grupoCanonico);
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
    return montarResultado(
      c,
      casou ? fonte.pessoas[indice] : undefined,
      score,
      grupoCanonico,
      fonte.url,
      leituraParcial,
    );
  });
  // "novos": de fonte que propõe inclusão, só quem está na faixa de UF do grupo. Das
  // demais fontes, mantém a regra antiga — só pessoa com cargo, que corta item de menu
  // do texto achatado. Numa fonte tabular toda linha já é pessoa.
  const novos = fonte.pessoas.filter((p, i) => {
    if (usados.has(i)) return false;
    return p.propoeInclusao ? naFaixaDeUf(p, ufsDoGrupo) : Boolean(p.cargo);
  });
  return { grupo, fonteUrl: fonte.url, semFonte: false, contatos: resultados, novos };
}

/**
 * Exceção por fonte (spec 2026-10-23 §4.2): nos nomes listados (como estão no Contatos), o
 * Contatos prevalece sobre a grafia da página. Contato da lista que casou uma pessoa da
 * composição sai com o nome "confere" e o próprio nome como valor esperado; semáforo e
 * divergências são refeitos a partir das comparações. Quem não casou continua possível
 * saída: a exceção corrige a grafia, nunca a presença. Não muta a entrada.
 */
export function aplicarNomesDoContatos(grupo: ResultadoGrupo, nomes: readonly string[]): ResultadoGrupo {
  if (nomes.length === 0) return grupo;
  const prevalecem = new Set(nomes.map(normalizarNome));
  return { ...grupo, contatos: grupo.contatos.map((c) => (prevalecem.has(normalizarNome(c.contato.nome)) ? nomeDoContatosConfere(c) : c)) };
}

/** Só o contato casado (verde ou amarelo, com nome lido na composição) muda; os demais voltam iguais. */
function nomeDoContatosConfere(c: ResultadoContato): ResultadoContato {
  const nomeLido = (comp: ComparacaoCampo): boolean => comp.campo === "nome" && comp.valorEsperado !== undefined;
  const casou = (c.semaforo === "verde" || c.semaforo === "amarelo") && !c.possivelSaida && c.comparacoes.some(nomeLido);
  if (!casou) return c;
  const comparacoes = c.comparacoes.map((comp) => (nomeLido(comp) ? { ...comp, valorEsperado: c.contato.nome, situacao: "confere" as const } : comp));
  const camposDivergentes = divergenciasDe(comparacoes);
  return { ...c, comparacoes, camposDivergentes, semaforo: camposDivergentes.length > 0 ? "amarelo" : "verde" };
}

// ---------------------------------------------------------------------------
// Fontes individuais por contato (spec 2026-10-15)
// ---------------------------------------------------------------------------

/**
 * Abaixo disto a página individual não conta como lida: é o CAPTCHA do gov.br (uns 200
 * caracteres), o menu sem o miolo, ou uma resposta vazia. Regra de ouro: sem conteúdo não
 * há "ausência", há fonte inacessível. Calibrado pelas fixtures de ministério e de governo.
 */
export const MIN_TEXTO_PAGINA_INDIVIDUAL = 300;
export const MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO = "página individual sem conteúdo legível (CAPTCHA ou só menu)";
export const OBSERVACAO_NAO_CONSTA_INDIVIDUAL = "Não consta na página individual (possível saída)";
export const OBSERVACAO_NOME_VAZIO_INDIVIDUAL = "Nome vazio no cadastro: não há o que procurar na página";
export const OBSERVACAO_SEM_INDIVIDUAL = "Sem fonte individual cadastrada";

export function paginaComConteudo(c: ConteudoFonte): boolean {
  return c.textoLimpo.trim().length >= MIN_TEXTO_PAGINA_INDIVIDUAL;
}

/** Só letras, dígitos e espaços simples: para procurar um nome como trecho de um texto. */
function soPalavras(valor: string): string {
  return normalizarTexto(valor).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Conectivos de nome: não contam como nome a mais na janela nem precisam casar. */
const CONECTIVOS_NOME = new Set(["de", "da", "do", "das", "dos", "e"]);
/** Nomes do meio a mais que a janela tolera entre o primeiro e o último nome do Contatos (R9). */
const MAX_NOMES_A_MAIS = 3;

/** Palavra da página: o texto original (para exibir) e a forma normalizada (para casar). */
interface PalavraPagina { original: string; norma: string }

function palavrasDe(texto: string): PalavraPagina[] {
  return texto
    .split(/\s+/)
    .filter((o) => o.length > 0)
    .flatMap((original) => soPalavras(original).split(" ").filter(Boolean).map((norma) => ({ original, norma })));
}

/**
 * Janela de palavras consecutivas que começa no primeiro nome de `alvo`, termina no último,
 * traz todos os nomes na ordem e tem no máximo `alvo.length + MAX_NOMES_A_MAIS` palavras que
 * não são conectivo. Devolve o trecho original da janela, ou `undefined`.
 */
function janelaDoNome(alvo: readonly string[], palavras: readonly PalavraPagina[]): string | undefined {
  const limite = alvo.length + MAX_NOMES_A_MAIS;
  for (let i = 0; i < palavras.length; i += 1) {
    if (palavras[i].norma !== alvo[0]) continue;
    let k = 1;
    let contadas = 1;
    for (let j = i + 1; j < palavras.length && contadas < limite; j += 1) {
      if (CONECTIVOS_NOME.has(palavras[j].norma)) continue;
      contadas += 1;
      if (palavras[j].norma === alvo[k]) k += 1;
      if (k === alvo.length) return trechoOriginal(palavras.slice(i, j + 1));
    }
  }
  return undefined;
}

/** Junta as palavras originais da janela (uma vez cada) e apara a pontuação das pontas. */
function trechoOriginal(janela: readonly PalavraPagina[]): string {
  const originais = janela.map((p) => p.original).filter((o, n, todas) => n === 0 || o !== todas[n - 1]);
  return originais.join(" ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Resultado de `nomeNaPagina`: `exato` falso quando a página traz o nome mais longo (R9). */
export interface NomeAchado {
  pessoa?: PessoaSite;
  /** O nome como a página o escreve (valor esperado quando não é exato). */
  nomeNaPagina?: string;
  exato: boolean;
}

/**
 * O nome do contato está na página individual? Vias exatas (spec §4.3): uma `PessoaSite` com
 * o mesmo nome normalizado, ou o nome inteiro como trecho contíguo do texto, com fronteira de
 * palavra. Vias não exatas (decisão R9, spec §9), para nome de duas ou mais palavras: uma
 * `PessoaSite`, ou um trecho do texto, com todos os nomes do Contatos na ordem numa janela
 * com até três nomes a mais ("Guilherme Boulos" acha "Guilherme Castro Boulos").
 * `undefined` é nome ausente.
 */
export function nomeNaPagina(nome: string, c: ConteudoFonte): NomeAchado | undefined {
  const alvo = normalizarNome(nome);
  if (!alvo) return undefined;
  const pessoa = c.pessoas.find((p) => normalizarNome(p.nome) === alvo);
  if (pessoa) return { pessoa, nomeNaPagina: pessoa.nome, exato: true };
  const trecho = soPalavras(alvo);
  if (!trecho) return undefined;
  if (` ${soPalavras(c.textoLimpo)} `.includes(` ${trecho} `)) return { nomeNaPagina: nome, exato: true };

  const tokens = trecho.split(" ").filter((t) => !CONECTIVOS_NOME.has(t));
  if (tokens.length < 2) return undefined;
  const pessoaLonga = c.pessoas.find((p) => janelaDoNome(tokens, palavrasDe(normalizarNome(p.nome))) !== undefined);
  if (pessoaLonga) return { pessoa: pessoaLonga, nomeNaPagina: pessoaLonga.nome, exato: false };
  const doTexto = janelaDoNome(tokens, palavrasDe(c.textoLimpo));
  return doTexto ? { nomeNaPagina: doTexto, exato: false } : undefined;
}

/** Denominações de cargo publicadas por uma fonte `casamento: "cargo"`, únicas, na ordem da página. */
export function listaDeCargos(c: ConteudoFonte): string[] {
  return [...new Set(c.pessoas.map((p) => p.cargo?.trim() ?? "").filter((x) => x.length > 0))];
}

export type ListaCargos = { url: string; cargos: readonly string[] } | { url: string; erro: string };

/** Tokens que não distinguem uma pasta da outra: toda denominação de ministro os tem. */
const TOKENS_GENERICOS_CARGO = new Set(["de", "da", "do", "das", "dos", "e", "em", "ministro", "ministra", "estado"]);

function tokensDistintivos(valor: string): string[] {
  return tokensSignificativos(valor).filter((t) => !TOKENS_GENERICOS_CARGO.has(t));
}

/**
 * Cargo do contato contra a lista de denominações da página geral (spec §5.3). A denominação
 * esperada é a de maior sobreposição de tokens distintivos ("fazenda", "casa civil"; empate:
 * a primeira da lista). `confere` exige DUAS coisas: a régua de cargo de sempre
 * (`situacaoCampo`: papel, gênero, prefixo) e o MESMO conjunto de tokens distintivos nos dois
 * cargos (ordem e repetição não contam). Pasta diferente que divide um token, ou qualificador
 * a mais ou a menos, é `divergente`, com a denominação oficial em `valorEsperado`. Sem token
 * em comum com denominação alguma, a lista não informa este cargo. Nome não entra aqui.
 */
export function compararCargoNaLista(cargo: string, lista: readonly string[], fonteUrl: string): ComparacaoCampo {
  const tc = tokensDistintivos(cargo);
  let melhor: { denominacao: string; n: number } | undefined;
  for (const d of lista) {
    const n = tokensDistintivos(d).filter((t) => tc.includes(t)).length;
    if (n > 0 && (!melhor || n > melhor.n)) melhor = { denominacao: d, n };
  }
  if (!melhor) return { campo: "cargo", valorPlanilha: cargo, situacao: "fonte_nao_informa", fonteUrl };
  const doOficial = new Set(tokensDistintivos(melhor.denominacao));
  const doContato = new Set(tc);
  const mesmoConjunto = doOficial.size === doContato.size && [...doContato].every((t) => doOficial.has(t));
  return {
    campo: "cargo",
    valorPlanilha: cargo,
    valorEsperado: melhor.denominacao,
    origemValor: "pagina",
    situacao: mesmoConjunto && situacaoCampo(cargo, melhor.denominacao) === "confere" ? "confere" : "divergente",
    fonteUrl,
  };
}

function comparacaoCargoPelaLista(cargo: string, lista: ListaCargos | undefined): ComparacaoCampo {
  if (!lista) return { campo: "cargo", valorPlanilha: cargo, situacao: "nao_verificado" };
  if ("erro" in lista) return { campo: "cargo", valorPlanilha: cargo, situacao: "nao_verificado", fonteUrl: lista.url };
  return compararCargoNaLista(cargo, lista.cargos, lista.url);
}

function comparacoesSemSite(contato: ContatoPlanilha): ComparacaoCampo[] {
  const lista: ComparacaoCampo[] = [];
  for (const campo of ["telefone", "email"] as const) {
    const v = contato[campo];
    if (v) lista.push({ campo, valorPlanilha: v, valorEsperado: undefined, situacao: "fonte_nao_informa" });
  }
  return lista;
}

export interface EntradaIndividual {
  contato: ContatoPlanilha;
  /** A fonte individual que casou o contato. */
  fonte: FonteIndividual;
  /**
   * Leitura da página individual: conteúdo OU motivo da falha. `alternativa`: a principal não
   * serviu e o conteúdo veio da URL alternativa cadastrada (spec 2026-10-23 §3.3).
   */
  lida: { conteudo?: ConteudoFonte; erro?: string; alternativa?: LeituraAlternativa };
  /** Fonte do cargo do grupo (`casamento: "cargo"`), quando o grupo tem; a individual cobre o cargo quando declara. */
  listaCargos?: ListaCargos;
  grupoCanonico?: string;
}

export interface VereditoIndividual {
  resultado: ResultadoContato;
  /** O nome do contato foi encontrado na página individual. */
  nomeConfirmado: boolean;
  /** A página individual foi lida com conteúdo (independe de o nome estar nela). */
  lidaComConteudo: boolean;
  /** Pessoas com cargo da página individual quando o contato não está nela (proposta de inclusão). */
  novos: PessoaSite[];
}

/** Veredito de um contato ligado a uma fonte individual: a tabela da spec 2026-10-15 §5.2. */
export function compararContatoIndividual(e: EntradaIndividual): VereditoIndividual {
  const { contato, fonte, lida, listaCargos, grupoCanonico } = e;
  // A URL de onde o conteúdo veio: a alternativa, quando foi ela que respondeu (spec 2026-10-23 §3.3).
  const url = lida.alternativa?.url ?? fonte.url;
  const pelaAlternativa = lida.alternativa ? { alternativa: lida.alternativa } : {};
  const cobreCargo = fonte.campos.includes("cargo");
  const protocolo = comparacoesTratamento(contato, grupoCanonico);
  const cargoDe = (comp: ComparacaoCampo | undefined): ComparacaoCampo[] => (comp ? [comp] : []);

  // Nome não verificado: página caída, ou nome vazio no cadastro. Cargo pela sua fonte (a
  // individual, que não foi usada, ou a lista geral, que é independente da individual).
  const indeterminado = (observacao: string, lidaComConteudo: boolean): VereditoIndividual => {
    const cargo = contato.cargo
      ? cobreCargo
        ? { campo: "cargo", valorPlanilha: contato.cargo, situacao: "nao_verificado" as const, fonteUrl: url }
        : comparacaoCargoPelaLista(contato.cargo, listaCargos)
      : undefined;
    const comparacoes: ComparacaoCampo[] = [
      { campo: "nome", valorPlanilha: contato.nome, situacao: "nao_verificado", fonteUrl: url },
      ...cargoDe(cargo),
      ...comparacoesSemSite(contato),
      ...protocolo,
    ];
    return {
      resultado: {
        contato,
        semaforo: "indeterminado",
        score: 0,
        comparacoes,
        camposDivergentes: divergenciasDe(comparacoes),
        origem: "oficial",
        fonteUrl: url,
        observacao,
      },
      nomeConfirmado: false,
      lidaComConteudo,
      novos: [],
    };
  };

  const semConteudo = lida.erro !== undefined || lida.conteudo === undefined || !paginaComConteudo(lida.conteudo);
  if (semConteudo) {
    return indeterminado(`Página individual inacessível: ${lida.erro ?? MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO}`, false);
  }
  // Contato sem nome ligado por UF: não há o que procurar, e ausência aqui não é saída.
  if (!normalizarNome(contato.nome)) return indeterminado(OBSERVACAO_NOME_VAZIO_INDIVIDUAL, true);

  const conteudo = lida.conteudo as ConteudoFonte;
  const achado = nomeNaPagina(contato.nome, conteudo);
  if (!achado) {
    return {
      resultado: {
        contato,
        semaforo: "vermelho",
        score: 0,
        comparacoes: protocolo,
        camposDivergentes: [{ campo: "nome", valorPlanilha: contato.nome }, ...divergenciasDe(protocolo)],
        possivelSaida: true,
        origem: "oficial",
        fonteUrl: url,
        observacao: OBSERVACAO_NAO_CONSTA_INDIVIDUAL,
        ...pelaAlternativa,
      },
      nomeConfirmado: false,
      lidaComConteudo: true,
      novos: conteudo.pessoas.filter((p) => Boolean(p.cargo)).map((p) => ({ ...p, origem: "pagina" as const, fonteUrl: url })),
    };
  }

  const cargo = contato.cargo
    ? cobreCargo
      ? {
          campo: "cargo",
          valorPlanilha: contato.cargo,
          valorEsperado: achado.pessoa?.cargo,
          origemValor: "pagina" as const,
          situacao: situacaoCampo(contato.cargo, achado.pessoa?.cargo),
          fonteUrl: url,
        }
      : comparacaoCargoPelaLista(contato.cargo, listaCargos)
    : undefined;
  const comparacoes: ComparacaoCampo[] = [
    // Nome mais longo na página (R9): a pessoa está lá, mas o GT quer o nome como o site o
    // escreve; sai "divergente" (amarelo) com o nome da página para copiar.
    achado.exato
      ? { campo: "nome", valorPlanilha: contato.nome, valorEsperado: achado.pessoa?.nome ?? contato.nome, origemValor: "pagina", situacao: "confere", fonteUrl: url }
      : { campo: "nome", valorPlanilha: contato.nome, valorEsperado: achado.nomeNaPagina, origemValor: "pagina", situacao: "divergente", fonteUrl: url },
    ...cargoDe(cargo),
    ...comparacoesSemSite(contato),
    ...protocolo,
  ];
  const camposDivergentes = divergenciasDe(comparacoes);
  return {
    resultado: {
      contato,
      semaforo: camposDivergentes.length > 0 ? "amarelo" : "verde",
      score: 1,
      comparacoes,
      camposDivergentes,
      origem: "oficial",
      fonteUrl: url,
      ...pelaAlternativa,
    },
    nomeConfirmado: true,
    lidaComConteudo: true,
    novos: [],
  };
}

/**
 * Contato de grupo com individuais que não casou nenhuma (spec §5.4). Com lista de cargos no
 * grupo (ministro): indeterminado, nome não verificado, cargo pela lista. Sem lista
 * (governador): o vermelho de "cadastrar fonte", como o grupo sem fonte.
 */
export function compararContatoSemIndividual(
  contato: ContatoPlanilha,
  o: { grupoCanonico?: string; listaCargos?: ListaCargos; uf?: string },
): ResultadoContato {
  const protocolo = comparacoesTratamento(contato, o.grupoCanonico);
  if (o.listaCargos) {
    const comparacoes: ComparacaoCampo[] = [
      { campo: "nome", valorPlanilha: contato.nome, situacao: "nao_verificado" },
      ...(contato.cargo ? [comparacaoCargoPelaLista(contato.cargo, o.listaCargos)] : []),
      ...comparacoesSemSite(contato),
      ...protocolo,
    ];
    return {
      contato,
      semaforo: "indeterminado",
      score: 0,
      comparacoes,
      camposDivergentes: divergenciasDe(comparacoes),
      origem: "oficial",
      observacao: OBSERVACAO_SEM_INDIVIDUAL,
    };
  }
  return {
    contato,
    semaforo: "vermelho",
    score: 0,
    comparacoes: protocolo,
    camposDivergentes: [{ campo: "fonte", valorPlanilha: "sem URL cadastrada" }, ...divergenciasDe(protocolo)],
    origem: "oficial",
    observacao: o.uf ? `Sem fonte individual para a UF ${o.uf}` : "UF não reconhecida no cadastro",
  };
}

/**
 * Pessoas com cargo de uma composição de grupo que não casam nenhum contato (régua de
 * tokens, a mesma de `compararGrupo`): proposta de inclusão de uma fonte `casamento:
 * "pessoa"` num grupo que também tem individuais (spec §5.5).
 */
export function novosForaDaPlanilha(pessoas: PessoaSite[], contatos: ContatoPlanilha[]): PessoaSite[] {
  return pessoas.filter(
    (p) => Boolean(p.cargo) && !contatos.some((c) => pontuarPessoa(c.nome, p.nome) >= LIMIAR_PESSOA),
  );
}
