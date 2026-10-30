import {
  GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES, GRUPO_SENADORES_ELEITOS,
} from "@/data/grupos-posse";
import {
  chaveDoQueDecide, dataDaDecisao, grupoEquivalente, MOTIVO_DUAS_DECISOES, vigente,
  type CasoDecidido, type HistoricoDecisoes, type RegistroManual,
} from "@/lib/decisoes";
import { casaDoGrupo } from "@/lib/eleitos-casamento";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";

/**
 * Decisão do GT sobre um eleito de 2026 (spec 2026-10-30 §4.1.1 e §4.3.1: "a decisão do GT vence a
 * regra"). Função pura: acha os casos da pessoa e diz o que a classificação deve fazer com eles.
 */

export { MOTIVO_DUAS_DECISOES };

/** Grupos em que uma decisão sobre a pessoa vale para o senador ou deputado eleito. */
export const GRUPOS_DA_ELEICAO_DA_CASA: readonly string[] = [GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS];
/** Grupos em que uma decisão sobre a pessoa vale para o governador eleito. */
export const GRUPOS_DA_ELEICAO_DO_GOVERNO: readonly string[] = [GRUPO_GOVERNADORES, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES, GRUPO_DEPUTADOS_FEDERAIS];

const GRUPOS_DE_ELEITOS: readonly string[] = [GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES_ELEITOS];

export interface DecisaoDoEleito {
  /** Registro que a tela mostra: o que decide; no conflito, o mais recente dos que decidem. */
  registro: RegistroManual;
  /** Grupo do convite decidido, no eixo da eleição (rótulo do agrupador; a Casa pelo grupo atual dela). */
  convidaPor?: string;
  /** Grupo do convite decidido que está fora do eixo da eleição: o eleito fica a conferir. */
  foraDoEixo?: string;
  /** Duas ou mais decisões que decidem coisas diferentes: o eleito fica a conferir. */
  conflito: boolean;
  /**
   * Ligações por nome que são outra pessoa: os grupos (no eixo, normalizados) marcados em
   * `outraPessoa`, ou "todas" quando há `pessoas_diferentes` sem `outraPessoa` num caso com
   * ocorrência de eleito. A lista da Câmara vale como o grupo "Deputados Federais".
   */
  outraPessoa: ReadonlySet<string> | "todas";
}

/**
 * Grupo no eixo da eleição: qualquer grupo de parlamentar atual vale como o da sua Casa ("Senadores
 * titulares fora de exercício" é Senado); o resto, pelo rótulo do agrupador.
 */
function grupoDoEixo(grupo: string): string {
  const casa = casaDoGrupo(grupo);
  if (casa && !casa.eleitos) return casa.casa === "senado" ? GRUPO_SENADORES : GRUPO_DEPUTADOS_FEDERAIS;
  return grupoEquivalente(grupo, "contatos");
}

const chave = (grupo: string): string => normalizarTexto(grupoDoEixo(grupo));

/**
 * Casos que valem para o eleito: alguma chave de nome casa o nome de urna ou o completo e o registro
 * vigente toca `grupos` (os da eleição; em `grupos` ou em `convidaPor`). A rota recusa registro com
 * `grupos` vazio; caso sem grupos só vem da carga manual do arquivo e vale pelo nome, sem cortar
 * ligação (`pessoas_diferentes` só corta todas quando o caso tem um grupo de eleitos). A
 * classificação e o histórico da tela usam esta mesma seleção.
 */
export function casosDoEleito(
  e: { nomeUrna: string; nomeCompleto: string },
  decisoes: HistoricoDecisoes | undefined,
  grupos: readonly string[],
): CasoDecidido[] {
  if (!decisoes) return [];
  const alvo = new Set(grupos.map(chave));
  const nomes = new Set([e.nomeUrna, e.nomeCompleto].map(normalizarNome).filter((n) => n.length > 0));
  return decisoes.casos.filter((c) => {
    const r = vigente(c);
    if (!r || !c.chaves.some((ch) => nomes.has(ch))) return false;
    const doRegistro = [...r.grupos, ...(r.convidaPor?.trim() ? [r.convidaPor] : [])].map(chave);
    return r.grupos.length === 0 || doRegistro.some((g) => alvo.has(g));
  });
}

const vigentes = (casos: readonly CasoDecidido[]): RegistroManual[] =>
  casos.flatMap((c) => {
    const r = vigente(c);
    return r ? [r] : [];
  });

const maisRecente = (rs: readonly RegistroManual[]): RegistroManual =>
  rs.reduce((melhor, r) => (r.data >= melhor.data ? r : melhor));

const DE_ELEITOS = new Set(GRUPOS_DE_ELEITOS.map(chave));

/**
 * `pessoas_diferentes` sem `outraPessoa` só corta todas as ligações quando o caso tem ocorrência de
 * eleito (um grupo de eleitos entre os seus). Nascido de uma duplicidade do Contatos, ele não diz
 * nada sobre o eleito (Mauro Benevides Filho, Paulo Dantas).
 */
function ligacoesDeOutraPessoa(rs: readonly RegistroManual[]): ReadonlySet<string> | "todas" {
  const cortaTodas = (r: RegistroManual) =>
    r.tipo === "pessoas_diferentes" && (r.outraPessoa ?? []).length === 0 && r.grupos.some((g) => DE_ELEITOS.has(chave(g)));
  if (rs.some(cortaTodas)) return "todas";
  return new Set(rs.flatMap((r) => (r.outraPessoa ?? []).map(chave)));
}

/** Rótulo do grupo do convite no eixo da eleição, ou `undefined` quando ele está fora do eixo. */
function conviteNoEixo(convite: string, grupos: readonly string[]): string | undefined {
  const alvo = chave(convite);
  return grupos.find((x) => normalizarTexto(x) === alvo);
}

/**
 * Decisão aplicável ao eleito, ou `undefined` sem nenhuma. Decide quem não é `pessoas_diferentes`;
 * o grupo do convite vem de `convidaPor` (`mesma_pessoa`, ou `ajustar_contatos` quando o GT já disse
 * o grupo). Duas decisões só são conflito quando decidem coisas diferentes (`chaveDoQueDecide`).
 * `outraPessoa` de todos os registros aplicáveis tira as ligações por nome.
 */
export function decisaoDoEleito(
  e: { nomeUrna: string; nomeCompleto: string },
  decisoes: HistoricoDecisoes | undefined,
  grupos: readonly string[],
): DecisaoDoEleito | undefined {
  const rs = vigentes(casosDoEleito(e, decisoes, grupos));
  if (rs.length === 0) return undefined;
  const outraPessoa = ligacoesDeOutraPessoa(rs);
  const decisivos = rs.filter((r) => r.tipo !== "pessoas_diferentes");
  const conflito = new Set(decisivos.map(chaveDoQueDecide)).size > 1;
  const registro = decisivos.length > 0 ? maisRecente(decisivos) : maisRecente(rs);
  const convite = conflito || decisivos.length === 0 ? undefined : registro.convidaPor?.trim();
  if (!convite) return { registro, conflito, outraPessoa };
  const noEixo = conviteNoEixo(convite, grupos);
  return noEixo
    ? { registro, conflito, outraPessoa, convidaPor: noEixo }
    : { registro, conflito, outraPessoa, foraDoEixo: grupoEquivalente(convite, "contatos") };
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

/** Motivo do eleito cujo grupo do convite decidido está fora do eixo da eleição. */
export function motivoForaDoEixo(r: RegistroManual, grupo: string): string {
  return `${motivoDaDecisaoDoEleito(r)}: grupo ${grupo} fora do eixo da eleição`;
}
