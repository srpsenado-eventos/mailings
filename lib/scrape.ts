import * as cheerio from "cheerio";
import type { ConteudoFonte } from "@/lib/types";

export class ScrapeError extends Error {
  constructor(public url: string, motivo: string) {
    super(`Falha ao raspar ${url}: ${motivo}`);
    this.name = "ScrapeError";
  }
}

/** Extrai texto limpo + destaques (negrito) de um HTML já baixado. Função pura. */
export function extrairConteudo(html: string, url: string): ConteudoFonte {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const destaques: string[] = [];
  $("strong, b").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt) destaques.push(txt);
  });

  const textoLimpo = $("body").text().replace(/\s+/g, " ").trim();

  return {
    url,
    textoLimpo,
    destaques: [...new Set(destaques)],
  };
}

/** Baixa a página e extrai o conteúdo. Lança ScrapeError em falha de rede/timeout. */
export async function raspar(url: string, timeoutMs = 15000): Promise<ConteudoFonte> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "FiscalDeMailings/1.0 (Senado Federal)" },
    });
    if (!resp.ok) throw new ScrapeError(url, `HTTP ${resp.status}`);
    const html = await resp.text();
    if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
    return extrairConteudo(html, url);
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
  } finally {
    clearTimeout(timer);
  }
}
