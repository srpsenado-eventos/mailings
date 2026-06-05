import stringSimilarity from "string-similarity";
import type {
  ContatoPlanilha,
  ConteudoFonte,
  PessoaSite,
  ResultadoContato,
  ResultadoGrupo,
  CampoDivergente,
  Semaforo,
} from "@/lib/types";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";

const LIMIAR_FORTE = 0.85;
const LIMIAR_FRACO = 0.6;
const BONUS_CONTENCAO = 0.9;
const MIN_TAMANHO_FRASE = 2;
const TAMANHO_CONTEXTO = 200;

/** Quebra texto em frases curtas para comparação granular. */
function quebrarEmFrases(texto: string): string[] {
  return texto
    .split(/[.;,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > MIN_TAMANHO_FRASE);
}

interface CorrespondenciaNome {
  score: number;
  /** Frase da fonte onde o nome mais se aproximou (para conferir campos secundários). */
  frase: string;
}

/**
 * Melhor correspondência do nome contra qualquer trecho/destaque da fonte.
 * Devolve o score e a frase onde a pessoa foi localizada, para que os campos
 * secundários (cargo, endereço) sejam conferidos no contexto certo — e não em
 * qualquer parte do documento, que pertenceria a outra pessoa.
 */
function melhorCorrespondencia(nome: string, fonte: ConteudoFonte): CorrespondenciaNome {
  const alvo = normalizarNome(nome);
  if (!alvo) return { score: 0, frase: "" };

  const frases = quebrarEmFrases(fonte.textoLimpo);
  const candidatos = [
    ...fonte.destaques.map((d) => ({ original: d, norm: normalizarNome(d) })),
    ...frases.map((f) => ({ original: f, norm: normalizarNome(f) })),
  ].filter((c) => c.norm.length > 0);
  if (candidatos.length === 0) return { score: 0, frase: "" };

  // bônus: contenção direta do nome normalizado em alguma frase
  const fraseContida = frases.find((f) => normalizarTexto(f).includes(alvo));

  const ratings = stringSimilarity.findBestMatch(
    alvo,
    candidatos.map((c) => c.norm),
  );
  const melhorIdx = ratings.bestMatchIndex;
  const scoreSim = ratings.bestMatch.rating;

  if (fraseContida && BONUS_CONTENCAO >= scoreSim) {
    return { score: BONUS_CONTENCAO, frase: fraseContida };
  }
  return { score: scoreSim, frase: candidatos[melhorIdx].original };
}

/**
 * Verifica se o valor da planilha aparece no contexto onde o nome foi localizado.
 * Restringe a comparação à frase correspondente para não confundir o cargo de
 * uma autoridade com o de outra que apareça em outro ponto do documento.
 */
function campoBate(
  valorPlanilha: string | undefined,
  contexto: string,
): boolean {
  if (!valorPlanilha) return true; // nada a comparar
  return normalizarTexto(contexto).includes(normalizarTexto(valorPlanilha));
}

export function compararContato(
  contato: ContatoPlanilha,
  fonte: ConteudoFonte,
): ResultadoContato {
  const { score, frase } = melhorCorrespondencia(contato.nome, fonte);
  const camposDivergentes: CampoDivergente[] = [];

  let semaforo: Semaforo;
  if (score < LIMIAR_FRACO) {
    semaforo = "vermelho";
    camposDivergentes.push({ campo: "nome", valorPlanilha: contato.nome });
  } else {
    // nome encontrado — conferir campos secundários no contexto da pessoa
    if (!campoBate(contato.cargo, frase)) {
      camposDivergentes.push({ campo: "cargo", valorPlanilha: contato.cargo });
    }
    if (!campoBate(contato.endereco, frase)) {
      camposDivergentes.push({ campo: "endereco", valorPlanilha: contato.endereco });
    }
    if (score >= LIMIAR_FORTE && camposDivergentes.length === 0) {
      semaforo = "verde";
    } else {
      semaforo = "amarelo";
    }
  }

  return {
    contato,
    semaforo,
    score,
    camposDivergentes,
    origem: "oficial",
    fonteUrl: fonte.url,
  };
}

/** Destaques da fonte que não casaram com nenhum contato → possíveis novos. */
function detectarNovos(
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte,
): PessoaSite[] {
  const nomesPlanilha = contatos.map((c) => normalizarNome(c.nome)).filter(Boolean);
  const novos: PessoaSite[] = [];
  for (const destaque of fonte.destaques) {
    const alvo = normalizarNome(destaque);
    if (!alvo) continue;
    const casou = nomesPlanilha.some(
      (n) => stringSimilarity.compareTwoStrings(alvo, n) >= LIMIAR_FRACO,
    );
    if (!casou) {
      novos.push({
        nomePolitico: destaque,
        contexto: fonte.textoLimpo.slice(0, TAMANHO_CONTEXTO),
      });
    }
  }
  return novos;
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
): ResultadoGrupo {
  if (!fonte) {
    return {
      grupo,
      semFonte: true,
      contatos: contatos.map((c) => ({
        contato: c,
        semaforo: "vermelho" as Semaforo,
        score: 0,
        camposDivergentes: [{ campo: "fonte", valorPlanilha: "sem URL cadastrada" }],
        origem: "oficial" as const,
        observacao: "Grupo sem fonte oficial cadastrada",
      })),
      novos: [],
    };
  }
  return {
    grupo,
    fonteUrl: fonte.url,
    semFonte: false,
    contatos: contatos.map((c) => compararContato(c, fonte)),
    novos: detectarNovos(contatos, fonte),
  };
}
