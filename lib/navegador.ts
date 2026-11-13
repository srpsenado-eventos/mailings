import { existsSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer-core";
import { extrairConteudo, extrairTabela, ScrapeError, type OpcoesRaspagem } from "@/lib/scrape";
import { paginaComConteudo } from "@/lib/match";
import type { ConteudoFonte, ExtracaoTabela, CliqueAntes } from "@/lib/types";

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
/** O clique de `clicarAntes` não achou o elemento ou a prova não apareceu na página. */
export const MOTIVO_CLIQUE_SEM_EFEITO = "navegador: clique não revelou conteúdo";
/** Quanto esperar a prova aparecer na página depois do clique. */
const ESPERA_APOS_CLIQUE_MS = 5_000;
/** Teto por página. A do TCU carrega em poucos segundos; 30 s cobre rede lenta sem travar a varredura. */
export const TETO_NAVEGADOR_MS = 30_000;
/** Pausa depois do carregamento na sessão com janela, para o DOM assentar antes de ler o HTML. */
const PAUSA_APOS_CARREGAR_MS = 1_500;

/**
 * Ritmo da sessão com janela. Em 2026-10-15 a varredura leu umas 40 páginas do gov.br em
 * sequência e o site passou a responder HTTP 429 ("muitos pedidos") e CAPTCHA, derrubando até
 * a página geral do Planalto. A pausa espaça as páginas; a espera dá tempo de o limite aliviar
 * antes da única nova tentativa.
 */
export const PAUSA_ENTRE_PAGINAS_MS = 3_000;
export const ESPERA_ANTES_DE_REPETIR_MS = 60_000;
const MOTIVO_MUITOS_PEDIDOS = "HTTP 429";

const esperarPadrao = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Caminhos padrão do Chrome no Windows, na ordem de procura. */
const CAMINHOS_PADRAO = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
] as const;

/** Uma página aberta num navegador lançado: lê uma URL e fecha o navegador. */
export interface PaginaNavegador {
  conteudo(url: string, timeoutMs: number, clicarAntes?: CliqueAntes): Promise<string>;
  fechar(): Promise<void>;
}

/** Como lançar: com janela visível (gov.br responde CAPTCHA ao headless) ou sem (padrão, caso TCU). */
export interface ModoLancamento {
  janela?: boolean;
}

export type Lancador = (caminhoChrome: string, modo?: ModoLancamento) => Promise<PaginaNavegador>;

/**
 * O que a leitura pelo Chrome aplica da fonte: a tabela, o nome em destaque (spec 2026-10-30 §3.1)
 * e, desde 13/11, o marcador e a pessoa única (Defesa e comandantes, fontes lidas pela janela).
 * `gabinetes` não se aplica à janela: o STM é lido por `fetch`. As fontes com marcador ou gabinetes
 * lidas por `fetch` continuam sem ir à janela no 403 (`janelaLeComoOFetch` em `lib/raspagem.ts`).
 */
export type OpcoesExtracaoNavegador = Pick<
  OpcoesRaspagem,
  "tabela" | "nomeEmDestaque" | "clicarAntes" | "marcador" | "marcadorObrigatorio" | "pessoaUnica"
>;

/** O HTML montado pelo Chrome passa pelo MESMO extrator das outras fontes. */
function extrairDoNavegador(html: string, url: string, opcoes: OpcoesExtracaoNavegador): ConteudoFonte {
  if (opcoes.tabela) return extrairTabela(html, url, opcoes.tabela);
  return extrairConteudo(html, url, {
    ...(opcoes.nomeEmDestaque ? { nomeEmDestaque: true } : {}),
    ...(opcoes.marcador ? { marcador: opcoes.marcador } : {}),
    ...(opcoes.marcadorObrigatorio ? { marcadorObrigatorio: true } : {}),
    ...(opcoes.pessoaUnica ? { pessoaUnica: opcoes.pessoaUnica } : {}),
  });
}

export interface OpcoesNavegador {
  timeoutMs?: number;
  tabela?: ExtracaoTabela;
  nomeEmDestaque?: boolean;
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

/**
 * Clica no primeiro título, botão, link ou resumo cujo texto (espaços colapsados, sem diferenciar
 * caixa) é igual a `clique.texto` e espera o corpo da página conter `clique.prova`. Texto que só
 * cresceu não basta ("Carregando..."): sem a prova, `MOTIVO_CLIQUE_SEM_EFEITO`.
 * Não coberto por teste (abre navegador).
 */
async function clicarEEsperar(page: Page, clique: CliqueAntes): Promise<void> {
  const clicou = await page.evaluate((alvo: string) => {
    const colapsar = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
    const el = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6,button,a,summary")).find(
      (e) => colapsar(e.innerText ?? "") === colapsar(alvo),
    );
    el?.click();
    return Boolean(el);
  }, clique.texto);
  if (!clicou) throw new Error(MOTIVO_CLIQUE_SEM_EFEITO);
  try {
    await page.waitForFunction(
      (prova: string) => document.body.innerText.includes(prova),
      { timeout: ESPERA_APOS_CLIQUE_MS, polling: 200 },
      clique.prova,
    );
  } catch {
    throw new Error(MOTIVO_CLIQUE_SEM_EFEITO);
  }
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
    async conteudo(url, timeoutMs, clicarAntes) {
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
      if (clicarAntes) await clicarEEsperar(page, clicarAntes);
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
    return extrairDoNavegador(html, url, opcoes);
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
  raspar(url: string, opcoes?: OpcoesExtracaoNavegador): Promise<ConteudoFonte>;
  /** Fecha o Chrome, se chegou a abrir. Nunca lança. */
  fechar(): Promise<void>;
}

export interface OpcoesSessao {
  timeoutMs?: number;
  /** Espera do ritmo (pausa entre páginas e antes da nova tentativa). Injetável para teste. */
  esperar?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  existe?: (caminho: string) => boolean;
  lancar?: Lancador;
}

/**
 * Sessão do Chrome COM JANELA para as fontes `navegador: "janela"` (spec 2026-10-15 §4.2):
 * um Chrome por varredura, lançado no primeiro `raspar`, uma página por vez na mesma aba,
 * com o teto por página. Chrome ausente ou que não sobe faz cada `raspar` falhar com
 * `ScrapeError`, sem travar as fontes lidas por `fetch`. A rota chama `fechar()` no `finally`.
 *
 * Ritmo: pausa de `PAUSA_ENTRE_PAGINAS_MS` antes de cada página a partir da segunda; página
 * que volta HTTP 429 ou sem conteúdo legível (CAPTCHA, `paginaComConteudo`) é lida mais UMA
 * vez depois de `ESPERA_ANTES_DE_REPETIR_MS`, e o resultado dessa segunda leitura vale.
 */
export function abrirSessao(opcoes: OpcoesSessao = {}): SessaoNavegador {
  const timeoutMs = opcoes.timeoutMs ?? TETO_NAVEGADOR_MS;
  const lancar = opcoes.lancar ?? lancarChrome;
  const esperar = opcoes.esperar ?? esperarPadrao;
  let lancamento: Promise<PaginaNavegador> | undefined;
  let paginasPedidas = 0;
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

  const lerUma = async (url: string, extracao: OpcoesExtracaoNavegador): Promise<ConteudoFonte> => {
    try {
      const p = await pagina(url);
      const html = await comTeto(p.conteudo(url, timeoutMs, extracao.clicarAntes), timeoutMs);
      if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
      return extrairDoNavegador(html, url, extracao);
    } catch (err) {
      if (err instanceof ScrapeError) throw err;
      if (err instanceof TempoEsgotadoError) throw new ScrapeError(url, MOTIVO_NAVEGADOR_TEMPO);
      throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
    }
  };

  const lerComRitmo = async (url: string, extracao: OpcoesExtracaoNavegador): Promise<ConteudoFonte> => {
    if (paginasPedidas++ > 0) await esperar(PAUSA_ENTRE_PAGINAS_MS);
    try {
      const conteudo = await lerUma(url, extracao);
      if (paginaComConteudo(conteudo)) return conteudo;
    } catch (err) {
      if (!(err instanceof ScrapeError && err.motivo === MOTIVO_MUITOS_PEDIDOS)) throw err;
    }
    await esperar(ESPERA_ANTES_DE_REPETIR_MS);
    return lerUma(url, extracao);
  };

  return {
    raspar(url, o = {}) {
      const leitura = fila.then(() => lerComRitmo(url, o));
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
