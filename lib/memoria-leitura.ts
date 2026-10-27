import { normalizarNome } from "@/lib/normalize";
import type { FalhasPorUrl, FonteLegivel, LeituraGuardada, LeiturasGuardadas, PessoaSite, Reaproveitamento, ResultadoContato, ResultadoGrupo, Retrato, TentativaDeUrl } from "@/lib/types";

/**
 * Memória de leitura por página (spec 2026-10-20): validade, poda, mescla e reconstrução.
 * Funções puras; a rota e `lib/analise.ts` as usam. Nada aqui lê disco nem rede.
 */

/** Uma leitura guardada vale até este prazo, inclusive (decisão 4). */
export const VALIDADE_LEITURA_DIAS = 7;
/** Leitura parcial: a página casou menos desta fração dos contatos do grupo (§4.2). */
export const FRACAO_MINIMA_CASADA = 0.5;
/** Grupo de um contato só nunca é leitura parcial: uma pessoa pode mesmo ter saído. */
export const MIN_CONTATOS_LEITURA_PARCIAL = 2;
/**
 * Motivo de hoje quando a página respondeu e não trouxe ninguém. Diferente do diagnóstico de
 * "provável JavaScript" de propósito: a página respondeu, e dizer que ela é ilegível seria
 * mentira (a lista de "fora de exercício" fica legitimamente vazia quando ninguém está afastado).
 */
export const MOTIVO_SEM_NINGUEM = "não trouxe ninguém";
/** URL do catálogo que falhou em tantas coletas seguidas conta como caída (spec 2026-10-23 §3.4). */
export const MIN_COLETAS_URL_CAIDA = 2;
/** Mudança de composição: mais desta fração dos nomes de hoje não estava na leitura guardada (§3.4). */
export const FRACAO_MINIMA_TROCADA = 0.5;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** §5.3: a única função que decide validade, para grupo, individual e geral. */
export function leituraValida(leitura: LeituraGuardada, agora: Date): boolean {
  const lidaEm = Date.parse(leitura.lidaEm);
  if (Number.isNaN(lidaEm)) return false;
  return agora.getTime() - lidaEm <= VALIDADE_LEITURA_DIAS * MS_POR_DIA;
}

export function ehLeituraParcial(casados: number, totalContatos: number): boolean {
  return totalContatos >= MIN_CONTATOS_LEITURA_PARCIAL && casados / totalContatos < FRACAO_MINIMA_CASADA;
}

export function motivoLeituraParcial(casados: number, totalContatos: number): string {
  return `página casou ${casados} de ${totalContatos} contatos`;
}

const FORMATO_DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** "16/10", no fuso de Brasília. */
export function diaMes(iso: string): string {
  return FORMATO_DIA_MES.format(new Date(iso));
}

/** "leitura de 16/10 reaproveitada (HTTP 403)": anotação para `erroFonte` e para o export (§5.1 passo 6, §7). */
export function anotacaoReaproveitada(r: Reaproveitamento): string {
  return `leitura de ${diaMes(r.lidaEm)} reaproveitada (${r.motivo})`;
}

/** Segunda metade do cabeçalho do grupo reaproveitado (§7). */
export function descreverMotivoDeHoje(motivo: string): string {
  if (motivo.startsWith("página casou ")) return `hoje a ${motivo}`;
  if (motivo === MOTIVO_SEM_NINGUEM) return "hoje a página não trouxe ninguém";
  return `hoje a página não respondeu (${motivo})`;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function ehConteudoFonte(v: unknown): boolean {
  return ehObjeto(v) && typeof v.url === "string" && typeof v.textoLimpo === "string" && Array.isArray(v.destaques) && Array.isArray(v.pessoas);
}

/** Forma mínima de uma leitura guardada (§10). O que falta disso é descartado, sem log de conteúdo. */
export function ehLeituraGuardada(v: unknown): v is LeituraGuardada {
  return ehObjeto(v) && typeof v.url === "string" && typeof v.lidaEm === "string" && ehConteudoFonte(v.conteudo);
}

/**
 * Chave da leitura no mapa da memória. A mesma URL pode ser lida de formas diferentes por
 * grupos diferentes (a lista dos senadores em exercício é lida como texto pelo grupo do
 * Presidente do Senado e como tabela pelos grupos de Senadores): cada forma guarda a sua
 * leitura, senão a última a gravar vence e a outra reaproveita uma extração que não é a dela.
 * A fonte de extração padrão fica sob a URL pura, para a memória já gravada continuar valendo.
 * Sufixos na ordem tabela, marcador, pdf. `LeituraGuardada.url` continua a URL real.
 */
export function chaveDaLeitura(url: string, fonte: Pick<FonteLegivel, "tabela" | "marcador" | "tipo">): string {
  const sufixos = [
    ...(fonte.tabela ? [`#tabela:${JSON.stringify(fonte.tabela)}`] : []),
    ...(fonte.marcador ? [`#marcador:${JSON.stringify(fonte.marcador.textos)}`] : []),
    ...(fonte.tipo === "pdf" ? ["#pdf"] : []),
  ];
  return `${url}${sufixos.join("")}`;
}

/** A chave é a `url` da leitura, pura ou com o sufixo de forma de extração (`chaveDaLeitura`). */
function chaveCombinaComUrl(chave: string, url: string): boolean {
  return chave === url || chave.startsWith(`${url}#`);
}

/** Só as entradas com forma certa, chave da própria `url` e dentro do prazo. Devolve objeto novo. */
export function podarLeituras(leituras: unknown, agora: Date): LeiturasGuardadas {
  if (!ehObjeto(leituras)) return {};
  const validas: LeiturasGuardadas = {};
  for (const [chave, l] of Object.entries(leituras)) {
    if (ehLeituraGuardada(l) && chaveCombinaComUrl(chave, l.url) && leituraValida(l, agora)) validas[chave] = l;
  }
  return validas;
}

/** Uma leitura desta varredura e a chave sob a qual ela entra na memória (`chaveDaLeitura`). */
export interface LeituraColhida {
  chave: string;
  leitura: LeituraGuardada;
}

/**
 * §6 passo 3: a memória anterior podada, sobreposta pelas leituras desta varredura (as boas de
 * hoje, com a data de hoje, e as reaproveitadas, com a data original). Na mesma chave (mesma URL
 * e mesma forma de extração), a leitura de data mais recente vence, qualquer que seja a ordem
 * (grupos que compartilham a página podem ler hoje um e reaproveitar a guardada no outro). Não
 * muta a entrada.
 */
export function mesclarLeituras(anteriores: LeiturasGuardadas, colhidas: readonly LeituraColhida[], agora: Date): LeiturasGuardadas {
  const saida = podarLeituras(anteriores, agora);
  for (const { chave, leitura } of colhidas) {
    const existente = saida[chave];
    if (!existente || Date.parse(leitura.lidaEm) >= Date.parse(existente.lidaEm)) saida[chave] = leitura;
  }
  return saida;
}

/** Valor de página: `origemValor` "pagina" OU ausente (a raspagem real não carimba a origem). IA, coerência e protocolo ficam fora. */
function valorDaPagina(c: ResultadoContato, campo: "nome" | "cargo"): string | undefined {
  const comp = c.comparacoes.find((x) => x.campo === campo && (x.origemValor === undefined || x.origemValor === "pagina"));
  return comp?.valorEsperado || undefined;
}

function grupoLidoDaPagina(g: ResultadoGrupo): boolean {
  return !g.semFonte && !g.fonteInacessivel && !g.viaPesquisaAmpla && !g.individuais && typeof g.fonteUrl === "string" && g.fonteUrl.startsWith("http");
}

function pessoa(nome: string, cargo: string | undefined): PessoaSite {
  return { nome, ...(cargo ? { cargo } : {}) };
}

/** Acumuladas mais as novas que não repetem nome (após `normalizarNome`). Devolve array novo. */
function unirPessoas(acumuladas: readonly PessoaSite[], novas: readonly PessoaSite[]): PessoaSite[] {
  const vistos = new Set(acumuladas.map((p) => normalizarNome(p.nome)));
  const saida = [...acumuladas];
  for (const p of novas) {
    const chave = normalizarNome(p.nome);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(p);
  }
  return saida;
}

/**
 * §5.4: memória reconstruída de um retrato gravado antes do mecanismo, só das fontes de grupo
 * lidas da página. Uma pessoa por contato com nome vindo da página (e o cargo, quando também
 * veio), mais os `novos` que não são da IA. `lidaEm` é o `geradoEm` do retrato. Grupo sem
 * nada aproveitável fica fora (§10). Grupos que compartilham a mesma `fonteUrl` (Senadores e
 * "Presidente do Senado Federal; Senadores", os três de Embaixadores) somam as pessoas numa só
 * leitura, sem repetir nome (igualdade após `normalizarNome`; fica a primeira ocorrência), em vez
 * de o último sobrescrever o anterior. Grupo sem pessoa não cria nem apaga entrada.
 */
export function reconstruirLeituras(retrato: Pick<Retrato, "grupos" | "geradoEm">): LeiturasGuardadas {
  const leituras: LeiturasGuardadas = {};
  for (const g of retrato.grupos) {
    if (!grupoLidoDaPagina(g)) continue;
    const url = g.fonteUrl as string;
    const pessoas: PessoaSite[] = [
      ...g.contatos.flatMap((c) => {
        const nome = valorDaPagina(c, "nome");
        return nome ? [pessoa(nome, valorDaPagina(c, "cargo"))] : [];
      }),
      ...g.novos.filter((n) => n.origem !== "conhecimento").map((n) => pessoa(n.nome, n.cargo)),
    ];
    if (pessoas.length === 0) continue;
    const unidas = unirPessoas(leituras[url]?.conteudo.pessoas ?? [], pessoas);
    leituras[url] = { url, lidaEm: retrato.geradoEm, conteudo: { url, textoLimpo: unidas.map((p) => p.nome).join("\n"), destaques: [], pessoas: unidas } };
  }
  return leituras;
}

/**
 * §6 passo 1: a memória a injetar na varredura. Retrato com `leituras` usa-as (podadas);
 * `leituras` com forma inesperada vale como "nada a reaproveitar" (§10); retrato de antes do
 * mecanismo é reconstruído; sem retrato, vazia.
 */
export function memoriaDoRetrato(retrato: Retrato | undefined, agora: Date): LeiturasGuardadas {
  if (!retrato) return {};
  if ("leituras" in retrato) return ehObjeto(retrato.leituras) ? podarLeituras(retrato.leituras, agora) : {};
  return podarLeituras(reconstruirLeituras(retrato), agora);
}

/**
 * §3.4: o mapa de falhas depois desta varredura. URL lida com sucesso em qualquer tentativa sai do
 * mapa; URL que só falhou soma uma coleta (mantendo `desde`) e fica com o motivo da última falha de
 * hoje; URL não tentada fica como estava. Não muta a entrada.
 */
export function atualizarFalhas(anteriores: FalhasPorUrl, tentadas: readonly TentativaDeUrl[], agora: Date): FalhasPorUrl {
  const lidas = new Set(tentadas.filter((t) => t.erro === undefined).map((t) => t.url));
  const motivos = new Map<string, string>();
  for (const t of tentadas) {
    if (t.erro !== undefined && !lidas.has(t.url)) motivos.set(t.url, t.erro);
  }
  const saida: FalhasPorUrl = {};
  for (const [url, falha] of Object.entries(anteriores)) {
    if (!lidas.has(url) && !motivos.has(url)) saida[url] = falha;
  }
  for (const [url, motivo] of motivos) {
    const anterior = anteriores[url];
    saida[url] = { desde: anterior?.desde ?? agora.toISOString(), coletas: (anterior?.coletas ?? 0) + 1, motivo };
  }
  return saida;
}

/**
 * URLs caídas há `MIN_COLETAS_URL_CAIDA` coletas ou mais, entre as TENTADAS nesta varredura: é o
 * que a tela consegue mostrar (o aviso sai na linha do grupo ou do contato lido hoje). O mapa
 * `falhas` mantém as URLs não visitadas (decisão 4 do plano), mas elas não entram na conta.
 */
export function contarUrlsCaidas(falhas: FalhasPorUrl, tentadasHoje: ReadonlySet<string>): number {
  return Object.entries(falhas).filter(([url, f]) => tentadasHoje.has(url) && f.coletas >= MIN_COLETAS_URL_CAIDA).length;
}

function coletasValidas(c: unknown): c is number {
  return typeof c === "number" && Number.isFinite(c) && c >= 1;
}

function dataValida(d: unknown): d is string {
  return typeof d === "string" && !Number.isNaN(Date.parse(d));
}

/**
 * `retrato.falhas` com forma válida (desde data legível, coletas número finito >= 1, motivo
 * string); o resto é descartado. Retrato ausente ou sem o campo: `{}`.
 */
export function falhasDoRetrato(retrato: Pick<Retrato, "falhas"> | undefined): FalhasPorUrl {
  const bruto: unknown = retrato?.falhas;
  if (!ehObjeto(bruto)) return {};
  const validas: FalhasPorUrl = {};
  for (const [url, f] of Object.entries(bruto)) {
    if (ehObjeto(f) && dataValida(f.desde) && coletasValidas(f.coletas) && typeof f.motivo === "string") {
      validas[url] = { desde: f.desde, coletas: f.coletas, motivo: f.motivo };
    }
  }
  return validas;
}

/** §3.4: nomes distintos de hoje (`total`) e quantos deles não estão na leitura guardada (`trocados`), após `normalizarNome`. */
export function nomesNovos(hoje: readonly PessoaSite[], guardada: readonly PessoaSite[]): { trocados: number; total: number } {
  const dehoje = new Set(hoje.map((p) => normalizarNome(p.nome)));
  const antigos = new Set(guardada.map((p) => normalizarNome(p.nome)));
  let trocados = 0;
  for (const nome of dehoje) if (!antigos.has(nome)) trocados += 1;
  return { trocados, total: dehoje.size };
}

/** Mudança de composição: grupo com 2+ contatos, página com nomes e mais da metade deles novos. */
export function ehMudancaDeComposicao(m: { trocados: number; total: number }, totalContatos: number): boolean {
  return totalContatos >= MIN_CONTATOS_LEITURA_PARCIAL && m.total > 0 && m.trocados / m.total > FRACAO_MINIMA_TROCADA;
}
