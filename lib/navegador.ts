import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { extrairConteudo, extrairTabela, ScrapeError } from "@/lib/scrape";
import type { ConteudoFonte, ExtracaoTabela } from "@/lib/types";

/**
 * Leitura de fonte do catálogo marcada `navegador: true` (spec 2026-10-02, §5): abre o
 * Chrome instalado nesta máquina sem janela, carrega a página, espera a rede sossegar e
 * entrega o HTML montado ao MESMO extrator das outras fontes. Existe para a página do
 * TCU, cuja lista é montada por JavaScript e vinha vazia pelo `fetch`.
 *
 * Só URL do catálogo chega aqui. Toda falha vira `ScrapeError` com motivo técnico: o
 * orquestrador marca a fonte inacessível e ninguém vira "possível saída" (regra de ouro).
 * Nenhum teste abre navegador: o lançador é injetado por `OpcoesNavegador.lancar`.
 */

export const MOTIVO_NAVEGADOR_AUSENTE = "navegador não encontrado";
export const MOTIVO_NAVEGADOR_TEMPO = "navegador: tempo esgotado";
/** Teto por página. A do TCU carrega em poucos segundos; 30 s cobre rede lenta sem travar a varredura. */
export const TETO_NAVEGADOR_MS = 30_000;

/** Caminhos padrão do Chrome no Windows, na ordem de procura. */
const CAMINHOS_PADRAO = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
] as const;

/** Uma página aberta num navegador lançado: lê uma URL e fecha o navegador. */
export interface PaginaNavegador {
  conteudo(url: string, timeoutMs: number): Promise<string>;
  fechar(): Promise<void>;
}

export type Lancador = (caminhoChrome: string) => Promise<PaginaNavegador>;

export interface OpcoesNavegador {
  timeoutMs?: number;
  tabela?: ExtracaoTabela;
  env?: NodeJS.ProcessEnv;
  existe?: (caminho: string) => boolean;
  lancar?: Lancador;
}

/**
 * `FISCAL_CHROME` vence quando aponta para um arquivo que existe; senão os caminhos
 * padrão, inclusive a instalação por usuário em LocalAppData. Nada existindo, `undefined`.
 */
export function localizarChrome(
  env: NodeJS.ProcessEnv = process.env,
  existe: (caminho: string) => boolean = existsSync,
): string | undefined {
  const daVariavel = env.FISCAL_CHROME?.trim();
  if (daVariavel && existe(daVariavel)) return daVariavel;
  const porUsuario = env.LOCALAPPDATA ? [`${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`] : [];
  return [...CAMINHOS_PADRAO, ...porUsuario].find((caminho) => existe(caminho));
}

class TempoEsgotadoError extends Error {}

/** Rejeita com `TempoEsgotadoError` se `promessa` não resolver em `ms`. */
function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TempoEsgotadoError()), ms);
  });
  return Promise.race([promessa, teto]).finally(() => clearTimeout(timer));
}

/** Lançador real: Chrome sem janela via puppeteer-core. Não coberto por teste (abre navegador). */
export const lancarChrome: Lancador = async (caminhoChrome) => {
  const browser = await puppeteer.launch({ executablePath: caminhoChrome, headless: true });
  return {
    async conteudo(url, timeoutMs) {
      const page = await browser.newPage();
      // Mesmo valor do teto de `comTeto`, cujo timer é armado antes do lançamento e dispara primeiro: o motivo fica exato.
      // `networkidle0`: espera NENHUMA requisição pendente, para a lista dos ministros já ter
      // chegado. Com `networkidle2` a página podia ser lida pela metade (só o menu). Página cuja
      // rede nunca sossega termina em "tempo esgotado", o lado seguro (indeterminado, nunca saída).
      await page.goto(url, { waitUntil: "networkidle0", timeout: timeoutMs });
      return page.content();
    },
    async fechar() {
      await browser.close();
    },
  };
};

export async function rasparComNavegador(url: string, opcoes: OpcoesNavegador = {}): Promise<ConteudoFonte> {
  const timeoutMs = opcoes.timeoutMs ?? TETO_NAVEGADOR_MS;
  const caminho = localizarChrome(opcoes.env ?? process.env, opcoes.existe ?? existsSync);
  if (!caminho) throw new ScrapeError(url, MOTIVO_NAVEGADOR_AUSENTE);
  const lancar = opcoes.lancar ?? lancarChrome;

  let lancamento: Promise<PaginaNavegador> | undefined;
  try {
    // O teto cobre lançar + carregar: um Chrome que não sobe também é tempo esgotado.
    const html = await comTeto(
      (async () => {
        lancamento = lancar(caminho);
        const pagina = await lancamento;
        return pagina.conteudo(url, timeoutMs);
      })(),
      timeoutMs,
    );
    if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
    return opcoes.tabela ? extrairTabela(html, url, opcoes.tabela) : extrairConteudo(html, url);
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    if (err instanceof TempoEsgotadoError) throw new ScrapeError(url, MOTIVO_NAVEGADOR_TEMPO);
    throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
  } finally {
    // Nunca deixar Chrome órfão: fecha mesmo em erro ou teto. Se o lançamento ainda não
    // terminou, fecha quando terminar, sem segurar a varredura; falha ao fechar não muda o resultado.
    void lancamento?.then((p) => p.fechar()).catch(() => undefined);
  }
}
