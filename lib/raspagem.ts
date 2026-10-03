import { raspar, type OpcoesRaspagem } from "@/lib/scrape";
import { rasparComNavegador, type OpcoesNavegador } from "@/lib/navegador";
import type { ConteudoFonte, FonteCatalogo } from "@/lib/types";

/**
 * Escolhe como ler UMA fonte do catálogo: `fetch` + cheerio (padrão) ou Chrome local
 * (`navegador: true`, spec 2026-10-02 §5). Recebe só `FonteCatalogo`: nenhuma URL fora do
 * catálogo chega ao navegador. Os dois leitores são injetáveis para teste.
 */
export interface Raspadores {
  porFetch: (url: string, opcoes: OpcoesRaspagem) => Promise<ConteudoFonte>;
  porNavegador: (url: string, opcoes: OpcoesNavegador) => Promise<ConteudoFonte>;
}

const RASPADORES_PADRAO: Raspadores = { porFetch: raspar, porNavegador: rasparComNavegador };

export function rasparFonte(fonte: FonteCatalogo, raspadores: Raspadores = RASPADORES_PADRAO): Promise<ConteudoFonte> {
  const opcoes = fonte.tabela ? { tabela: fonte.tabela } : {};
  return fonte.navegador ? raspadores.porNavegador(fonte.url, opcoes) : raspadores.porFetch(fonte.url, opcoes);
}
