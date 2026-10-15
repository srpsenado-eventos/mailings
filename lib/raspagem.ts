import { raspar, ScrapeError, type OpcoesRaspagem } from "@/lib/scrape";
import { rasparComNavegador, type OpcoesNavegador } from "@/lib/navegador";
import type { ConteudoFonte, ExtracaoTabela, FonteLegivel } from "@/lib/types";

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
  porJanela: (url: string, opcoes: { tabela?: ExtracaoTabela }) => Promise<ConteudoFonte>;
}

export const MOTIVO_SESSAO_AUSENTE = "sessão do navegador com janela não aberta";

export const RASPADORES_PADRAO: Raspadores = {
  porFetch: raspar,
  porNavegador: rasparComNavegador,
  porJanela: async (url) => {
    throw new ScrapeError(url, MOTIVO_SESSAO_AUSENTE);
  },
};

export function rasparFonte(fonte: FonteLegivel, raspadores: Raspadores = RASPADORES_PADRAO): Promise<ConteudoFonte> {
  const opcoes = fonte.tabela ? { tabela: fonte.tabela } : {};
  if (fonte.navegador === "janela") return raspadores.porJanela(fonte.url, opcoes);
  return fonte.navegador ? raspadores.porNavegador(fonte.url, opcoes) : raspadores.porFetch(fonte.url, opcoes);
}
