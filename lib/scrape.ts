import * as cheerio from "cheerio";
import { Agent } from "undici";
import { normalizarTexto } from "@/lib/normalize";
import type { ConteudoFonte, PessoaSite } from "@/lib/types";

export class ScrapeError extends Error {
  constructor(
    public url: string,
    public motivo: string,
  ) {
    super(`Falha ao raspar ${url}: ${motivo}`);
    this.name = "ScrapeError";
  }
}

/**
 * Headers de navegador real. Vários sites .gov.br têm WAF que bloqueia
 * User-Agent de bot (HTTP 403); com headers de navegador a página responde.
 * Não há custo de segurança em enviar estes cabeçalhos.
 */
const HEADERS_NAVEGADOR: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

/** RequestInit + `dispatcher` (extensão do undici/Node, ausente no lib.dom). */
type RequestInitComDispatcher = RequestInit & { dispatcher?: Agent };

/**
 * Agent que aceita cadeia de certificado incompleta. Usado SÓ no retry quando o
 * fetch estrito falha por erro de certificado — sites com cadeia válida mantêm
 * verificação completa. Tradeoff documentado em
 * docs/superpowers/specs/2026-06-05-fonte-inacessivel-e-scrape-resiliente.md
 */
const agenteTlsRelaxado = new Agent({ connect: { rejectUnauthorized: false } });

/** Detecta falha de verificação de certificado TLS (cadeia incompleta, self-signed). */
function ehErroDeCertificado(err: unknown): boolean {
  const causa = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  const codigoCausa =
    causa && typeof causa === "object" && "code" in causa
      ? String((causa as { code?: unknown }).code)
      : undefined;
  const codigoDireto =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : undefined;
  const codigo = codigoCausa ?? codigoDireto ?? "";
  if (/CERT|UNABLE_TO_VERIFY|SELF_SIGNED|LEAF_SIGNATURE|CERTIFICATE/i.test(codigo)) return true;
  const msg = err instanceof Error ? err.message : "";
  const msgCausa = causa instanceof Error ? causa.message : "";
  return /certificate|self.signed|leaf signature/i.test(`${msg} ${msgCausa}`);
}

type RaizCheerio = ReturnType<typeof cheerio.load>;

/** Tags cujo fim recebe quebra de linha, para o texto não "grudar" entre elementos. */
const TAGS_SEPARAR =
  "p,li,div,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,dt,dd,span,strong,b,a";

const CARGOS = [
  "presidente", "vice-presidente", "corregedor", "corregedora",
  "conselheiro", "conselheira", "ministro", "ministra",
  "secretario", "secretaria", "diretor", "diretora",
  "procurador", "procuradora", "defensor", "defensora",
  "governador", "governadora", "senador", "senadora",
  "deputado", "deputada", "embaixador", "embaixadora",
  "prefeito", "prefeita", "desembargador", "desembargadora",
];

function ehRotulo(linha: string): boolean {
  return linha.endsWith(":") || /^(nascimento|ingresso|vaga|cep|telefone|cnpj|endere)/i.test(linha);
}

function ehCargo(linha: string): boolean {
  const norm = normalizarTexto(linha);
  if (norm.split(" ").length > 8) return false;
  return CARGOS.some((c) => norm.includes(c));
}

function ehNome(linha: string): boolean {
  if (linha.length < 5 || linha.length > 70) return false;
  if (linha.includes(":") || /\d/.test(linha)) return false;
  if (ehRotulo(linha) || ehCargo(linha)) return false;
  const tokens = linha.split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  const conector = /^(de|da|do|das|dos|e)$/i;
  const significativos = tokens.filter((t) => !conector.test(t));
  return significativos.length >= 2 && significativos.every((t) => /^[A-ZÀ-Ý]/.test(t));
}

/** Quebra o corpo em linhas limpas, inserindo separador entre blocos antes do .text(). */
function extrairLinhas($: RaizCheerio): string[] {
  $("br").replaceWith("\n");
  $(TAGS_SEPARAR).each((_, el) => {
    $(el).append("\n");
  });
  return $("body")
    .text()
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

/** Segmenta linhas em pessoas: linha-nome + cargo adjacente (janela curta). */
function segmentarPessoas(linhas: string[]): PessoaSite[] {
  const pessoas: PessoaSite[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!ehNome(linhas[i])) continue;
    let cargo: string | undefined;
    for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
      if (ehCargo(linhas[j])) {
        cargo = linhas[j];
        break;
      }
      if (ehNome(linhas[j])) break;
    }
    pessoas.push({ nome: linhas[i], cargo, contexto: linhas[i] });
  }
  return pessoas;
}

/** Extrai texto limpo + destaques + pessoas estruturadas de um HTML já baixado. Função pura. */
export function extrairConteudo(html: string, url: string): ConteudoFonte {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  // destaques ANTES de mutar o DOM (extrairLinhas insere "\n").
  const destaquesBrutos: string[] = [];
  $("strong, b").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt) destaquesBrutos.push(txt);
  });

  const linhas = extrairLinhas($);
  const pessoas = segmentarPessoas(linhas);
  const destaques = [...new Set(destaquesBrutos.filter(ehNome))];

  return { url, textoLimpo: linhas.join(" "), destaques, pessoas };
}

/**
 * Baixa a página e extrai o conteúdo. Lança ScrapeError em falha de rede/timeout.
 * Tenta TLS estrito primeiro; só em erro de certificado repete com TLS relaxado.
 */
export async function raspar(url: string, timeoutMs = 15000): Promise<ConteudoFonte> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const html = await baixarHtml(url, ctrl.signal);
    if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
    return extrairConteudo(html, url);
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
  } finally {
    clearTimeout(timer);
  }
}

/** Faz o fetch e devolve o HTML, com retry de TLS relaxado em erro de certificado. */
async function baixarHtml(url: string, signal: AbortSignal): Promise<string> {
  try {
    return await requisitar(url, signal);
  } catch (err) {
    if (ehErroDeCertificado(err)) {
      return await requisitar(url, signal, agenteTlsRelaxado);
    }
    throw err;
  }
}

/** Uma requisição HTTP; lança ScrapeError em status não-OK. */
async function requisitar(url: string, signal: AbortSignal, dispatcher?: Agent): Promise<string> {
  const opcoes: RequestInitComDispatcher = { signal, headers: HEADERS_NAVEGADOR };
  if (dispatcher) opcoes.dispatcher = dispatcher;
  const resp = await fetch(url, opcoes);
  if (!resp.ok) throw new ScrapeError(url, `HTTP ${resp.status}`);
  return resp.text();
}
