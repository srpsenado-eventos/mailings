import { normalizarNome } from "@/lib/normalize";
import type { FalhasPorUrl, LeituraGuardada, LeiturasGuardadas, PessoaSite, Reaproveitamento, ResultadoContato, ResultadoGrupo, Retrato, TentativaDeUrl } from "@/lib/types";

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

/** Só as entradas com forma certa, chave igual à `url` e dentro do prazo. Devolve objeto novo. */
export function podarLeituras(leituras: unknown, agora: Date): LeiturasGuardadas {
  if (!ehObjeto(leituras)) return {};
  const validas: LeiturasGuardadas = {};
  for (const [url, l] of Object.entries(leituras)) {
    if (ehLeituraGuardada(l) && l.url === url && leituraValida(l, agora)) validas[url] = l;
  }
  return validas;
}

/**
 * §6 passo 3: a memória anterior podada, sobreposta pelas leituras desta varredura (as boas de
 * hoje, com a data de hoje, e as reaproveitadas, com a data original). Na mesma URL, a leitura de
 * data mais recente vence, qualquer que seja a ordem (grupos que compartilham a página podem ler
 * hoje um e reaproveitar a guardada no outro). Não muta a entrada.
 */
export function mesclarLeituras(anteriores: LeiturasGuardadas, colhidas: readonly LeituraGuardada[], agora: Date): LeiturasGuardadas {
  const saida = podarLeituras(anteriores, agora);
  for (const l of colhidas) {
    const existente = saida[l.url];
    if (!existente || Date.parse(l.lidaEm) >= Date.parse(existente.lidaEm)) saida[l.url] = l;
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

export function contarUrlsCaidas(falhas: FalhasPorUrl): number {
  return Object.values(falhas).filter((f) => f.coletas >= MIN_COLETAS_URL_CAIDA).length;
}

/** `retrato.falhas` com forma válida (desde string, coletas número, motivo string); senão `{}`. Retrato ausente ou sem o campo: `{}`. */
export function falhasDoRetrato(retrato: Pick<Retrato, "falhas"> | undefined): FalhasPorUrl {
  const bruto: unknown = retrato?.falhas;
  if (!ehObjeto(bruto)) return {};
  const validas: FalhasPorUrl = {};
  for (const [url, f] of Object.entries(bruto)) {
    if (ehObjeto(f) && typeof f.desde === "string" && typeof f.coletas === "number" && typeof f.motivo === "string") {
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
