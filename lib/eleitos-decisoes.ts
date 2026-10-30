import {
  GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES, GRUPO_SENADORES_ELEITOS,
} from "@/data/grupos-posse";
import { grupoEquivalente, vigente, type HistoricoDecisoes, type RegistroManual } from "@/lib/decisoes";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { dataDaDecisao, MOTIVO_DUAS_DECISOES } from "@/lib/repetidos-decisoes";

/**
 * Decisão do GT sobre um eleito de 2026 (spec 2026-10-30 §4.1.1 e §4.3.1: "a decisão do GT vence a
 * regra"). Função pura: acha os casos da pessoa e diz o que a classificação deve fazer com eles.
 */

export { MOTIVO_DUAS_DECISOES };

/** Grupos em que uma decisão sobre a pessoa vale para o senador ou deputado eleito. */
export const GRUPOS_DA_ELEICAO_DA_CASA: readonly string[] = [GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS];
/** Grupos em que uma decisão sobre a pessoa vale para o governador eleito. */
export const GRUPOS_DA_ELEICAO_DO_GOVERNO: readonly string[] = [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS];

export interface DecisaoDoEleito {
  /** Registro que a tela mostra: o que decide; no conflito, o mais recente dos que decidem. */
  registro: RegistroManual;
  /** Grupo do convite decidido, no rótulo do agrupador. Ausente no conflito e sem `convidaPor`. */
  convidaPor?: string;
  /** Duas ou mais decisões que decidem: o eleito fica a conferir. */
  conflito: boolean;
  /**
   * Ligações por nome que são outra pessoa: os grupos (rótulo equivalente, normalizado) marcados em
   * `outraPessoa`, ou "todas" quando há `pessoas_diferentes` sem `outraPessoa`. A lista da Câmara
   * vale como o grupo "Deputados Federais".
   */
  outraPessoa: ReadonlySet<string> | "todas";
}

const chave = (grupo: string): string => normalizarTexto(grupoEquivalente(grupo, "contatos"));

/** Rótulo do grupo do convite como o agrupador o escreve (ou o texto, aparado, fora dele). */
export const rotuloDoConvite = (grupo: string): string => grupoEquivalente(grupo, "contatos");

/**
 * O caso vale para o eleito quando alguma chave de nome casa o nome de urna ou o completo e o
 * registro vigente toca os grupos da eleição (em `grupos` ou em `convidaPor`). Caso sem grupos (só
 * registrável pela seção dos eleitos) vale pelo nome.
 */
function aplicaveis(e: { nomeUrna: string; nomeCompleto: string }, h: HistoricoDecisoes, grupos: readonly string[]): RegistroManual[] {
  const nomes = new Set([e.nomeUrna, e.nomeCompleto].map(normalizarNome).filter((n) => n.length > 0));
  const alvo = new Set(grupos.map(chave));
  return h.casos.flatMap((c) => {
    const r = vigente(c);
    if (!r || !c.chaves.some((ch) => nomes.has(ch))) return [];
    const doRegistro = [...r.grupos, ...(r.convidaPor?.trim() ? [r.convidaPor] : [])].map(chave);
    return r.grupos.length === 0 || doRegistro.some((g) => alvo.has(g)) ? [r] : [];
  });
}

const maisRecente = (rs: readonly RegistroManual[]): RegistroManual =>
  rs.reduce((melhor, r) => (r.data >= melhor.data ? r : melhor));

function ligacoesDeOutraPessoa(rs: readonly RegistroManual[]): ReadonlySet<string> | "todas" {
  if (rs.some((r) => r.tipo === "pessoas_diferentes" && (r.outraPessoa ?? []).length === 0)) return "todas";
  return new Set(rs.flatMap((r) => (r.outraPessoa ?? []).map(chave)));
}

/**
 * Decisão aplicável ao eleito, ou `undefined` sem nenhuma. Decide quem não é `pessoas_diferentes`;
 * o grupo do convite vem de `convidaPor` (`mesma_pessoa`, ou `ajustar_contatos` quando o GT já disse
 * o grupo). `outraPessoa` de todos os registros aplicáveis tira as ligações por nome.
 */
export function decisaoDoEleito(
  e: { nomeUrna: string; nomeCompleto: string },
  decisoes: HistoricoDecisoes | undefined,
  grupos: readonly string[],
): DecisaoDoEleito | undefined {
  if (!decisoes) return undefined;
  const rs = aplicaveis(e, decisoes, grupos);
  if (rs.length === 0) return undefined;
  const outraPessoa = ligacoesDeOutraPessoa(rs);
  const decisivos = rs.filter((r) => r.tipo !== "pessoas_diferentes");
  if (decisivos.length > 1) return { registro: maisRecente(decisivos), conflito: true, outraPessoa };
  const registro = decisivos[0] ?? maisRecente(rs);
  const convite = decisivos[0]?.convidaPor?.trim();
  return { registro, conflito: false, outraPessoa, ...(convite ? { convidaPor: rotuloDoConvite(convite) } : {}) };
}

/** A ligação com uma linha do grupo (ou com a lista da Câmara, como "Deputados Federais") é outra pessoa. */
export function ehOutraPessoa(d: DecisaoDoEleito | undefined, grupo: string): boolean {
  if (!d) return false;
  return d.outraPessoa === "todas" || d.outraPessoa.has(chave(grupo));
}

/** Motivo do eleito classificado pela decisão. */
export function motivoDaDecisaoDoEleito(r: RegistroManual): string {
  return `Decisão do GT de ${dataDaDecisao(r.data)}`;
}
