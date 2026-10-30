import { raspar, ScrapeError, type OpcoesRaspagem } from "@/lib/scrape";
import { paginaComConteudo } from "@/lib/match";
import { rasparComNavegador, type OpcoesExtracaoNavegador, type OpcoesNavegador } from "@/lib/navegador";
import type { ConteudoFonte, FonteLegivel } from "@/lib/types";

/**
 * Escolhe como ler UMA fonte do catálogo: `fetch` + cheerio (padrão), Chrome headless
 * (`navegador: true`, spec 2026-10-02 §5) ou a sessão do Chrome com janela
 * (`navegador: "janela"`, spec 2026-10-15 §4.2). Recebe só fonte do catálogo (de grupo ou
 * individual): nenhuma URL de fora chega ao navegador. Os leitores são injetáveis para teste.
 */
export interface Raspadores {
  porFetch: (url: string, opcoes: OpcoesRaspagem) => Promise<ConteudoFonte>;
  porNavegador: (url: string, opcoes: OpcoesNavegador) => Promise<ConteudoFonte>;
  /** A sessão com janela da varredura (`abrirSessao().raspar`). Sem sessão, a fonte falha. */
  porJanela: (url: string, opcoes: OpcoesExtracaoNavegador) => Promise<ConteudoFonte>;
}

export const MOTIVO_SESSAO_AUSENTE = "sessão do navegador com janela não aberta";

export const RASPADORES_PADRAO: Raspadores = {
  porFetch: raspar,
  porNavegador: rasparComNavegador,
  porJanela: async (url) => {
    throw new ScrapeError(url, MOTIVO_SESSAO_AUSENTE);
  },
};

/** Motivos do `fetch` que indicam bloqueio do site, não falha da página: a mesma URL vai ao Chrome com janela. */
export const MOTIVOS_BLOQUEIO_FETCH: readonly string[] = ["HTTP 403", "HTTP 401"];

/** Esperas entre tentativas de uma falha transitória: 30 s e depois 120 s (spec 2026-10-23 §3.2). */
export const ESPERAS_REPETICAO_MS: readonly number[] = [30_000, 120_000];

function montarOpcoes(fonte: FonteLegivel): OpcoesRaspagem {
  return {
    ...(fonte.tabela ? { tabela: fonte.tabela } : {}),
    ...(fonte.marcador ? { marcador: fonte.marcador.textos } : {}),
    ...(fonte.tipo ? { tipo: fonte.tipo } : {}),
    ...(fonte.nomeEmDestaque ? { nomeEmDestaque: true } : {}),
  };
}

/**
 * A janela só aplica a extração por tabela: o marcador e o PDF ficariam de fora, e a página
 * inteira entraria no lugar da lista filtrada (TST `/orgaos`: ~145 pessoas viraria dezenas de
 * inclusões falsas). Fonte assim não vai à janela no 403/401; vale o erro do fetch.
 */
function janelaLeComoOFetch(fonte: FonteLegivel): boolean {
  return !fonte.marcador && fonte.tipo !== "pdf";
}

export async function rasparFonte(fonte: FonteLegivel, raspadores: Raspadores = RASPADORES_PADRAO): Promise<ConteudoFonte> {
  const opcoes = montarOpcoes(fonte);
  if (fonte.navegador === "janela") return raspadores.porJanela(fonte.url, opcoes);
  if (fonte.navegador) return raspadores.porNavegador(fonte.url, opcoes);
  try {
    return await raspadores.porFetch(fonte.url, opcoes);
  } catch (erro) {
    if (!(erro instanceof ScrapeError) || !MOTIVOS_BLOQUEIO_FETCH.includes(erro.motivo) || !janelaLeComoOFetch(fonte)) throw erro;
    // Site que bloqueia o fetch costuma liberar o Chrome com janela. Se a janela também
    // falha ou não traz conteúdo legível, vale o motivo do fetch (o mais informativo).
    const daJanela = await raspadores.porJanela(fonte.url, opcoes).catch(() => undefined);
    if (daJanela && (paginaComConteudo(daJanela) || daJanela.pessoas.length > 0)) return daJanela;
    throw erro;
  }
}

/** Falha que passa sozinha: limite de pedidos, erro 5xx, tempo esgotado ou queda de rede. */
export function ehFalhaTransitoria(motivo: string): boolean {
  return /^HTTP (429|5\d\d)\b/.test(motivo) || /tempo esgotado|aborted|timeout|fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(motivo);
}

export interface OpcoesRepeticao {
  esperar?: (ms: number) => Promise<void>;
  esperas?: readonly number[];
}

const esperarPadrao = (ms: number): Promise<void> => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Repete a leitura de uma fonte que falhou por motivo transitório, esperando entre as
 * tentativas. A fonte `janela` passa direto: a sessão com janela já tem ritmo e repetição
 * próprios. Falha não transitória interrompe; o motivo final leva o total de tentativas.
 */
export function comRepeticao(
  raspar: (fonte: FonteLegivel) => Promise<ConteudoFonte>,
  opcoes: OpcoesRepeticao = {},
): (fonte: FonteLegivel) => Promise<ConteudoFonte> {
  const esperar = opcoes.esperar ?? esperarPadrao;
  const esperas = opcoes.esperas ?? ESPERAS_REPETICAO_MS;
  return async (fonte) => {
    if (fonte.navegador === "janela") return raspar(fonte);
    for (let tentativas = 1; ; tentativas++) {
      try {
        return await raspar(fonte);
      } catch (erro) {
        if (!(erro instanceof ScrapeError)) throw erro;
        const haEspera = tentativas <= esperas.length;
        if (ehFalhaTransitoria(erro.motivo) && haEspera) {
          await esperar(esperas[tentativas - 1]);
          continue;
        }
        throw new ScrapeError(fonte.url, tentativas > 1 ? `${erro.motivo} (${tentativas} tentativas)` : erro.motivo);
      }
    }
  };
}
