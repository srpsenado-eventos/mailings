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
/** Pausa depois do carregamento na sessão com janela, para o DOM assentar antes de ler o HTML. */
const PAUSA_APOS_CARREGAR_MS = 1_500;

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

/** Como lançar: com janela visível (gov.br responde CAPTCHA ao headless) ou sem (padrão, caso TCU). */
export interface ModoLancamento {
  janela?: boolean;
}

export type Lancador = (caminhoChrome: string, modo?: ModoLancamento) => Promise<PaginaNavegador>;

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

/** Lançador real via puppeteer-core. Não coberto por teste (abre navegador). */
export const lancarChrome: Lancador = async (caminhoChrome, modo = {}) => {
  const browser = await puppeteer.launch({
    executablePath: caminhoChrome,
    headless: !modo.janela,
    ...(modo.janela ? { args: ["--window-size=1200,900"] } : {}),
  });
  // Uma aba só, reaproveitada: a sessão com janela lê dezenas de páginas em sequência, e
  // uma aba por página deixaria o Chrome com dezenas de abas abertas até o fim da varredura.
  let page: Awaited<ReturnType<typeof browser.newPage>> | undefined;
  return {
    async conteudo(url, timeoutMs) {
      page ??= await browser.newPage();
      // Mesmo valor do teto de `comTeto`, cujo timer é armado antes e dispara primeiro: o motivo fica exato.
      // Headless (TCU): `networkidle0`, a lista chega por XHR e com `networkidle2` vinha pela metade.
      // Janela (gov.br, páginas servidas prontas): `networkidle2`, porque os scripts de analytics do
      // gov.br nunca deixam a rede zerar, e uma pausa curta para o DOM assentar.
      const resposta = await page.goto(url, {
        waitUntil: modo.janela ? "networkidle2" : "networkidle0",
        timeout: timeoutMs,
      });
      // Página de erro (404, 500) montada pelo Chrome não é "lida com conteúdo": vira
      // `ScrapeError` com "HTTP <status>" pelo mapeamento de `lerUma`/`rasparComNavegador`.
      // Sem resposta (navegação no mesmo documento), segue normalmente.
      if (resposta && !resposta.ok()) throw new Error(`HTTP ${resposta.status()}`);
      if (modo.janela) await new Promise((r) => setTimeout(r, PAUSA_APOS_CARREGAR_MS));
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

export interface SessaoNavegador {
  /** Lê UMA URL do catálogo na janela. As chamadas são enfileiradas: uma página por vez. */
  raspar(url: string, opcoes?: { tabela?: ExtracaoTabela }): Promise<ConteudoFonte>;
  /** Fecha o Chrome, se chegou a abrir. Nunca lança. */
  fechar(): Promise<void>;
}

export interface OpcoesSessao {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  existe?: (caminho: string) => boolean;
  lancar?: Lancador;
}

/**
 * Sessão do Chrome COM JANELA para as fontes `navegador: "janela"` (spec 2026-10-15 §4.2):
 * um Chrome por varredura, lançado no primeiro `raspar`, uma página por vez na mesma aba,
 * com o teto por página. Chrome ausente ou que não sobe faz cada `raspar` falhar com
 * `ScrapeError`, sem travar as fontes lidas por `fetch`. A rota chama `fechar()` no `finally`.
 */
export function abrirSessao(opcoes: OpcoesSessao = {}): SessaoNavegador {
  const timeoutMs = opcoes.timeoutMs ?? TETO_NAVEGADOR_MS;
  const lancar = opcoes.lancar ?? lancarChrome;
  let lancamento: Promise<PaginaNavegador> | undefined;
  // Fila: cada leitura começa quando a anterior termina, com sucesso ou erro.
  let fila: Promise<unknown> = Promise.resolve();

  const pagina = (url: string): Promise<PaginaNavegador> => {
    if (!lancamento) {
      const caminho = localizarChrome(opcoes.env ?? process.env, opcoes.existe ?? existsSync);
      if (!caminho) return Promise.reject(new ScrapeError(url, MOTIVO_NAVEGADOR_AUSENTE));
      lancamento = lancar(caminho, { janela: true });
      // Evita "unhandled rejection" quando o Chrome não sobe: o erro é entregue a cada raspar.
      lancamento.catch(() => undefined);
    }
    return lancamento;
  };

  const lerUma = async (url: string, tabela?: ExtracaoTabela): Promise<ConteudoFonte> => {
    try {
      const p = await pagina(url);
      const html = await comTeto(p.conteudo(url, timeoutMs), timeoutMs);
      if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
      return tabela ? extrairTabela(html, url, tabela) : extrairConteudo(html, url);
    } catch (err) {
      if (err instanceof ScrapeError) throw err;
      if (err instanceof TempoEsgotadoError) throw new ScrapeError(url, MOTIVO_NAVEGADOR_TEMPO);
      throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
    }
  };

  return {
    raspar(url, o = {}) {
      const leitura = fila.then(() => lerUma(url, o.tabela));
      fila = leitura.catch(() => undefined);
      return leitura;
    },
    async fechar() {
      if (!lancamento) return;
      try {
        await fila;
        await (await lancamento).fechar();
      } catch {
        /* Chrome que não subiu ou já fechou: nada a fechar */
      }
    },
  };
}
