import * as cheerio from "cheerio";
import { Agent } from "undici";
import { normalizarTexto, nucleoDeNome } from "@/lib/normalize";
import { CARGOS } from "@/lib/cargos";
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

/**
 * Tags cujo começo e fim recebem quebra de linha, para o texto não "grudar"
 * entre blocos. `strong` e `b` ficam DE FORA: o STJ marca em negrito só parte do
 * nome ("<b>Marco Aurélio Bellizze</b> Oliveira") e separar por eles partia o
 * nome em duas pessoas. Separar também no início do bloco preserva o CNJ, onde o
 * nome vem num `strong` colado ao `span` do cargo.
 */
const TAGS_SEPARAR =
  "p,li,div,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,dt,dd,span,a";

function ehRotulo(linha: string): boolean {
  return linha.endsWith(":") || /^(nascimento|ingresso|vaga|cep|telefone|cnpj|endere)/i.test(linha);
}

const CONECTOR = /^(de|da|do|das|dos|e)$/i;

/**
 * Palavras que, abrindo o que sobra da linha depois do título, denunciam
 * complemento de cargo e não nome próprio ("Ministro do Supremo Tribunal
 * Federal", "Desembargador Federal Substituto").
 */
const ABERTURAS_DE_CARGO = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "federal", "nacional", "geral", "regional", "militar", "eleitoral", "superior",
  "titular", "substituto", "substituta", "interino", "interina", "adjunto", "adjunta",
]);

function contemCargo(valor: string): boolean {
  const norm = normalizarTexto(valor);
  return CARGOS.some((c) => norm.includes(c));
}

/** Trecho curto o bastante para ser rótulo de cargo, e que cita um cargo do léxico. */
function ehCargoCurto(valor: string): boolean {
  const norm = normalizarTexto(valor);
  return norm.split(" ").filter(Boolean).length <= 8 && contemCargo(norm);
}

/** O léxico de cargos como conjunto, para comparar o primeiro token da linha. */
const CARGOS_EM_TOKEN = new Set<string>(CARGOS);

/**
 * Linha ocupada por um cargo do primeiro ao último token, por mais longa que
 * seja. A página de Ministros de Estado do Planalto publica títulos de dez
 * tokens ("Ministra de Estado da Casa Civil da Presidência da República"): eles
 * escapavam do limite de oito do rótulo curto e entravam na lista como se
 * fossem gente. É o segundo token que separa este caso de "Ministro Edson
 * Fachin" e de "Ministra Dra. Maria Elizabeth Guimarães Teixeira Rocha", em que
 * o que vem depois do título é o nome da pessoa.
 */
function ehCargoPorInteiro(valor: string): boolean {
  const tokens = normalizarTexto(valor).split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  return CARGOS_EM_TOKEN.has(tokens[0]) && ABERTURAS_DE_CARGO.has(tokens[1]);
}

/** Trecho que é cargo: rótulo curto do léxico ou título longo com complemento. */
function ehTrechoDeCargo(valor: string): boolean {
  return ehCargoCurto(valor) || ehCargoPorInteiro(valor);
}

/** Trecho com cara de nome próprio: 2+ tokens significativos, todos capitalizados. */
function pareceNome(valor: string): boolean {
  if (valor.length < 5 || valor.length > 70) return false;
  if (valor.includes(":") || /\d/.test(valor)) return false;
  if (ehRotulo(valor) || ehTrechoDeCargo(valor)) return false;
  const tokens = valor.split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  if (ABERTURAS_DE_CARGO.has(normalizarTexto(tokens[0]))) return false;
  const significativos = tokens.filter((t) => !CONECTOR.test(t));
  return significativos.length >= 2 && significativos.every((t) => /^[A-ZÀ-Ý]/.test(t));
}

/**
 * O nome que a linha carrega, ou `undefined` se ela não for linha de pessoa.
 * Vale a linha inteira quando ela já parece nome — é assim que sobrevive o nome
 * parlamentar "Dr. Hiran", que a poda do tratamento reduziria a um token. Se não
 * parecer, vale o NÚCLEO (sem título ou patente no começo, sem rótulo de ficha
 * no fim): é o que recupera "Ministra Dra. Maria Elizabeth Guimarães Teixeira
 * Rocha" e "Gen Ex Fulano de Tal", que o teste de cargo descartava inteiros.
 */
function nomeDaLinha(linha: string): string | undefined {
  if (pareceNome(linha)) return linha;
  const nucleo = nucleoDeNome(linha);
  return pareceNome(nucleo) ? nucleo : undefined;
}

function ehNome(linha: string): boolean {
  return nomeDaLinha(linha) !== undefined;
}

/**
 * Linha que é PREDOMINANTEMENTE cargo. Conter um cargo não basta: "Ministro
 * Fulano de Tal" contém "Ministro" e mesmo assim é a linha do nome.
 */
function ehCargo(linha: string): boolean {
  return ehTrechoDeCargo(linha) && !ehNome(linha);
}

/** Quebra o corpo em linhas limpas, inserindo separador entre blocos antes do .text(). */
function extrairLinhas($: RaizCheerio): string[] {
  $("br").replaceWith("\n");
  $(TAGS_SEPARAR).each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  return $("body")
    .text()
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

/** Ordinal que abre a linha em lista numerada ("01 - Fulano de Tal"). */
const ORDINAL = /^\d{1,3}[.\u00ba\u00b0]?$/;

/**
 * Pessoa cujo nome e cargo vêm na MESMA linha, separados por " - ": o TST publica
 * "01 - Fulano de Tal - Presidente" e o STJ, "Fulano - Diretor-Geral da ENFAM".
 * O dígito do ordinal reprovava a linha inteira no filtro de nome, e os 26
 * ministros do TST saíam como "possível saída". Só vale como lista quando há
 * ordinal ou quando a outra parte é mesmo um cargo — senão "Fale Conosco -
 * Ouvidoria" viraria pessoa.
 */
function pessoaEmLinhaUnica(linha: string): PessoaSite | undefined {
  const partes = linha
    .split(/\s+-\s+/)
    .map((parte) => parte.trim())
    .filter(Boolean);
  if (partes.length < 2) return undefined;
  const temOrdinal = ORDINAL.test(partes[0]);
  const restantes = temOrdinal ? partes.slice(1) : partes;
  if (restantes.length === 0) return undefined;
  const nome = nomeDaLinha(restantes[0]);
  if (nome === undefined) return undefined;
  const cargo = restantes.slice(1).find((parte) => ehTrechoDeCargo(parte));
  if (!temOrdinal && cargo === undefined) return undefined;
  return { nome, cargo, contexto: linha };
}

/** De que lado da linha do nome a página publica o cargo. */
type OrientacaoDoCargo = "depois" | "antes";

/**
 * Mede a própria página antes de montar as pessoas. STF, STJ, STM, TST, TSE,
 * Câmara e Defensoria põem o nome primeiro e o cargo embaixo; a página de
 * Ministros de Estado do Planalto faz o contrário — o cargo em negrito e o nome
 * recuado na linha seguinte. Olhando só para frente, cada ministro herdava o
 * cargo do ministro SEGUINTE, e um homem chegava a sair rotulado "Ministra".
 * Vence o padrão majoritário da página; empate ou nenhuma adjacência mantém
 * "depois", que é o comportamento já validado pelas outras fontes.
 */
function orientacaoDoCargo(linhas: string[]): OrientacaoDoCargo {
  let antes = 0;
  let depois = 0;
  for (let i = 0; i < linhas.length; i++) {
    if (pessoaEmLinhaUnica(linhas[i]) !== undefined) continue;
    if (!ehNome(linhas[i])) continue;
    if (i > 0 && ehCargo(linhas[i - 1])) antes++;
    if (i + 1 < linhas.length && ehCargo(linhas[i + 1])) depois++;
  }
  return antes > depois ? "antes" : "depois";
}

/** Janela curta para frente: o cargo vem logo abaixo do nome. */
function indiceDoCargoDepois(linhas: string[], i: number): number | undefined {
  for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
    // a linha da PRÓXIMA pessoa encerra a janela: no STJ ela cita um cargo
    // ("Fulano - Diretor-Geral da ENFAM") e era adotada como cargo desta.
    if (pessoaEmLinhaUnica(linhas[j]) !== undefined || ehNome(linhas[j])) break;
    if (ehCargo(linhas[j])) return j;
  }
  return undefined;
}

/**
 * Só a linha imediatamente anterior, e só enquanto nenhuma outra pessoa já a
 * tiver tomado: numa página cargo-antes-do-nome um mesmo título não pode servir
 * a dois nomes.
 */
function indiceDoCargoAntes(
  linhas: string[],
  i: number,
  consumidas: ReadonlySet<number>,
): number | undefined {
  const j = i - 1;
  if (j < 0 || consumidas.has(j)) return undefined;
  return ehCargo(linhas[j]) ? j : undefined;
}

/** Segmenta linhas em pessoas: linha-nome + cargo adjacente, do lado que a página usa. */
function segmentarPessoas(linhas: string[]): PessoaSite[] {
  const pessoas: PessoaSite[] = [];
  const orientacao = orientacaoDoCargo(linhas);
  const consumidas = new Set<number>();
  for (let i = 0; i < linhas.length; i++) {
    const emLinhaUnica = pessoaEmLinhaUnica(linhas[i]);
    if (emLinhaUnica) {
      pessoas.push(emLinhaUnica);
      continue;
    }
    const nome = nomeDaLinha(linhas[i]);
    if (nome === undefined) continue;
    const indiceCargo =
      orientacao === "antes"
        ? indiceDoCargoAntes(linhas, i, consumidas)
        : indiceDoCargoDepois(linhas, i);
    if (indiceCargo !== undefined) consumidas.add(indiceCargo);
    const cargo = indiceCargo === undefined ? undefined : linhas[indiceCargo];
    pessoas.push({ nome, cargo, contexto: linhas[i] });
  }
  return pessoas;
}

/**
 * Moldura da página: navegação, cabeçalho, rodapé e título. Links de menu (Title
 * Case, multi-palavra) entram como falsas "pessoas" e, pior, dão à página a
 * aparência de ter composição real — o que transforma quem a extração perdeu em
 * "possível saída". Muitos portais (STM) não usam `nav`/`header`/`role`: o menu
 * é um `div`/`ul` identificado só pela classe ou pelo id.
 */
const TAGS_MOLDURA = new Set(["nav", "header", "footer", "aside"]);
const PAPEIS_MOLDURA = new Set(["navigation", "banner", "contentinfo", "menu", "menubar"]);

/**
 * Palavra de classe/id que denuncia moldura. Exige limite de palavra: no STJ o
 * bloco que guarda os ministros se chama `idInterfaceVisualBlocoDeMenuBanners
 * NavegacaoAplicacao` — casar "menu" no meio do nome apagaria a composição.
 */
const PALAVRAS_MOLDURA =
  /(^|[^a-z])(menus?|nav|navbar|navigation|navegacao|breadcrumbs?|sitemap|off-?canvas|skip|page-title)([^a-z]|$)/i;

/**
 * Fração do texto da página acima da qual o bloco é a própria página, não a
 * moldura. Protege contra o caso real do STM, em que o `body` inteiro leva a
 * classe `off-canvas-menu-init`: sem o limite, a página sairia vazia.
 */
const MAX_FRACAO_MOLDURA = 0.8;

function tamanhoDoTexto(texto: string): number {
  return texto.replace(/\s+/g, " ").trim().length;
}

/** Remove os blocos de moldura, preservando qualquer bloco grande demais para ser moldura. */
function removerMoldura($: RaizCheerio): void {
  const total = tamanhoDoTexto($("body").text());
  if (total === 0) return;
  $("*").each((_, el) => {
    const alvo = $(el);
    const marcas = `${alvo.attr("class") ?? ""} ${alvo.attr("id") ?? ""}`;
    const tag = "tagName" in el ? String(el.tagName).toLowerCase() : "";
    const ehMoldura =
      TAGS_MOLDURA.has(tag) ||
      PAPEIS_MOLDURA.has((alvo.attr("role") ?? "").toLowerCase()) ||
      PALAVRAS_MOLDURA.test(marcas);
    if (!ehMoldura) return;
    if (tamanhoDoTexto(alvo.text()) / total >= MAX_FRACAO_MOLDURA) return;
    alvo.remove();
  });
}

/** Extrai texto limpo + destaques + pessoas estruturadas de um HTML já baixado. Função pura. */
export function extrairConteudo(html: string, url: string): ConteudoFonte {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  removerMoldura($);

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

const CHARSET_PADRAO = "utf-8";
/** Quanto do começo do corpo é vasculhado atrás de um `<meta charset>`. */
const BYTES_PARA_META = 4096;

function charsetDeclarado(valor: string): string | undefined {
  return /charset\s*=\s*"?([\w-]+)"?/i.exec(valor)?.[1];
}

function comoBytes(corpo: ArrayBuffer | Uint8Array): Uint8Array {
  return corpo instanceof Uint8Array ? corpo : new Uint8Array(corpo);
}

/**
 * Decodifica o corpo no charset que a fonte declara, no cabeçalho ou no `<meta>`,
 * com UTF-8 como padrão. O STJ responde em ISO-8859-1 e sem `<meta charset>`: lido
 * como UTF-8, "Luis Felipe Salomão" chega corrompido e nenhum nome acentuado casa
 * a planilha. Função pura, para ser testável sem rede.
 */
export function decodificarCorpo(
  corpo: ArrayBuffer | Uint8Array,
  contentType?: string | null,
): string {
  const bytes = comoBytes(corpo);
  const doCabecalho = charsetDeclarado(contentType ?? "");
  const doMeta = doCabecalho
    ? undefined
    : charsetDeclarado(new TextDecoder("latin1").decode(bytes.subarray(0, BYTES_PARA_META)));
  const charset = doCabecalho ?? doMeta ?? CHARSET_PADRAO;
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder(CHARSET_PADRAO).decode(bytes);
  }
}

/** Uma requisição HTTP; lança ScrapeError em status não-OK. */
async function requisitar(url: string, signal: AbortSignal, dispatcher?: Agent): Promise<string> {
  const opcoes: RequestInitComDispatcher = { signal, headers: HEADERS_NAVEGADOR };
  if (dispatcher) opcoes.dispatcher = dispatcher;
  const resp = await fetch(url, opcoes);
  if (!resp.ok) throw new ScrapeError(url, `HTTP ${resp.status}`);
  return decodificarCorpo(await resp.arrayBuffer(), resp.headers.get("content-type"));
}
