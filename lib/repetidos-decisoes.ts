import {
  casosDaPessoa, chaveDoQueDecide, dataDaDecisao, grupoEquivalente, MOTIVO_DUAS_DECISOES, gruposAtuaisParaOCaso, situacaoDoCaso, vigente,
  type CasoDecidido, type HistoricoDecisoes, type RegistroManual, type SituacaoNoContatos, type TipoDecisao,
} from "@/lib/decisoes";
import { gruposAtuaisDoCaso } from "@/lib/decisoes-coleta";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import {
  entradasDoGrupo, equivalenteDaOcorrencia, escolherComEleito, escolherGrupo, mesmoGrupo, semRepeticao,
  type AutoridadeRepetida, type Entrada, type OcorrenciaRepetida, type SituacaoRepetida,
} from "@/lib/repetidos-base";
import type { ResultadoEleicao, ResultadoGrupo } from "@/lib/types";

// Vivem em lib/decisoes.ts (o eixo dos eleitos também os usa); reexportados para a tela de repetidos.
export { dataDaDecisao, MOTIVO_DUAS_DECISOES };

/**
 * Decisões do GT aplicadas às autoridades em mais de um grupo (spec 2026-10-30 §4.1.3 e §4.1.4).
 * Funções puras; a situação no Contatos é calculada ao vivo com os grupos do retrato.
 */

/** Textos das situações, os mesmos na tela e na planilha baixada. */
export const TEXTO_SITUACAO_REPETIDA: Record<SituacaoRepetida, string> = {
  decidido: "Decidido pela regra",
  conferir: "Conferir",
  decidido_gt: "Decidido pelo GT",
  tratado: "Tratado no Contatos",
};

/** Situação no Contatos (spec §4.1.4); sem efeito ou sem decisão fica vazio. */
export function textoNoContatos(s: SituacaoNoContatos | undefined): string {
  if (s === "tratado") return "Tratado no Contatos";
  if (s === "pendente") return "Pendente no Contatos";
  if (s === "reaberto") return "Reaberto";
  return "";
}

export const MOTIVO_PESSOA_NAO_ENCONTRADA = "Pessoa não encontrada no Contatos";

/** Motivo do caso reaberto (spec §4.1.4). */
export function textoReaberto(data: string): string {
  return `grupo novo desde a decisão de ${dataDaDecisao(data)}`;
}

/** Nome de cada tipo de decisão, o mesmo na tela, no formulário e na planilha. */
export const TEXTO_TIPO: Record<TipoDecisao, string> = {
  mesma_pessoa: "Mesma pessoa",
  pessoas_diferentes: "Pessoas diferentes",
  nao_recebe_convite: "Não recebe convite",
  ajustar_contatos: "Ajustar no Contatos",
};

/** Decisão vigente em texto: tipo, grupo do convite e quem decidiu. */
export function textoDecisao(d: RegistroManual): string {
  const convite = d.convidaPor?.trim() ? `: convidar pelo grupo ${d.convidaPor.trim()}` : "";
  return `${TEXTO_TIPO[d.tipo] ?? d.tipo}${convite} (${d.quem})`;
}

function motivoDaDecisao(d: RegistroManual): string {
  const observacao = d.observacao.trim() ? ` · ${d.observacao.trim()}` : "";
  return `Decisão do GT de ${dataDaDecisao(d.data)}: ${textoDecisao(d)}${observacao}`;
}

interface Contexto {
  grupos: readonly ResultadoGrupo[];
  eleicao?: ResultadoEleicao;
  /** Todos os casos do histórico: os da mesma pessoa delimitam os grupos de cada caso. */
  casos: readonly CasoDecidido[];
}

/** Caso com o seu registro vigente (só entram casos com decisão). */
interface Aplicado {
  caso: CasoDecidido;
  decisao: RegistroManual;
}

const conjunto = (grupos: readonly string[]): Set<string> => new Set(grupos.map(normalizarTexto));

/** Situação no Contatos ao vivo, com a mesma regra da coleta (`gruposAtuaisParaOCaso`). */
function noContatosDoCaso(caso: CasoDecidido, ctx: Contexto): SituacaoNoContatos {
  return situacaoDoCaso(caso, gruposAtuaisParaOCaso(caso, gruposAtuaisDoCaso(caso, ctx.grupos, ctx.eleicao), ctx.casos));
}

/** O mais recente pela data do registro vigente; no empate, o último do histórico. */
function maisRecente(aplicados: readonly Aplicado[]): Aplicado {
  return aplicados.reduce((melhor, x) => (x.decisao.data >= melhor.decisao.data ? x : melhor));
}

function comDecisao(a: AutoridadeRepetida, x: Aplicado, noContatos: SituacaoNoContatos): AutoridadeRepetida {
  const base = {
    nome: a.nome, ocorrencias: a.ocorrencias, ...(a.eleicao ? { eleicao: true as const } : {}),
    caso: x.caso, decisao: x.decisao, noContatos,
  };
  if (noContatos === "reaberto") return { ...base, situacao: "conferir", motivo: textoReaberto(x.decisao.data) };
  const convite = x.decisao.convidaPor?.trim();
  const convidaPor = convite ? ocorrenciaDoConvite(a.ocorrencias, convite) : undefined;
  return {
    ...base,
    situacao: noContatos === "tratado" ? "tratado" : "decidido_gt",
    ...(convidaPor ? { convidaPor } : {}),
    motivo: motivoDaDecisao(x.decisao),
  };
}

/**
 * Ocorrência que convida: só a do Contatos ou a da planilha da Câmara, no grupo decidido (a do
 * Contatos primeiro). O eleito ligado pelo eixo não está cadastrado no grupo do convite e nunca vale.
 */
function ocorrenciaDoConvite(ocorrencias: readonly OcorrenciaRepetida[], convite: string): OcorrenciaRepetida | undefined {
  const casam = ocorrencias.filter((o) => o.origem !== "eleicao" && mesmoGrupo(equivalenteDaOcorrencia(o), convite));
  return casam.find((o) => o.origem === "contatos") ?? casam[0];
}

/**
 * Tira as ocorrências que o GT marcou como outra pessoa e refaz a escolha pela regra. `repetida` diz
 * se a pessoa continua em dois ou mais grupos.
 */
function semAsOutrasPessoas(a: AutoridadeRepetida, outras: ReadonlySet<string>): { autoridade: AutoridadeRepetida; repetida: boolean } {
  const ocorrencias = a.ocorrencias.filter((o) => !outras.has(normalizarTexto(equivalenteDaOcorrencia(o))));
  if (ocorrencias.length === a.ocorrencias.length) return { autoridade: a, repetida: true };
  const comEleito = ocorrencias.some((o) => o.origem === "eleicao");
  const base = { nome: a.nome, ocorrencias, ...(comEleito ? { eleicao: true as const } : {}) };
  if (new Set(ocorrencias.map((o) => o.grupoRegra)).size < 2) {
    return { autoridade: { ...base, situacao: "decidido_gt", motivo: "" }, repetida: false };
  }
  const parcial = new Set(ocorrencias.filter((o) => o.origem !== "eleicao").map((o) => o.chave)).size > 1;
  const escolha = comEleito && !parcial ? escolherComEleito(ocorrencias) : escolherGrupo(ocorrencias, parcial);
  return { autoridade: { ...base, ...escolha }, repetida: true };
}

/**
 * Todos os casos da pessoa valem (spec §4.1.3):
 * 1. caso reaberto volta para conferir;
 * 2. as ocorrências marcadas como outra pessoa saem do cálculo;
 * 3. uma decisão que não seja `pessoas_diferentes` decide; duas ou mais só ficam para conferir quando
 *    decidem coisas diferentes (`chaveDoQueDecide`); com o mesmo convite, vale a mais recente;
 * 4. só `pessoas_diferentes`: sem `outraPessoa` silencia o caso; com ela, vale a regra sobre o que restou.
 */
function aplicarCasos(a: AutoridadeRepetida, aplicados: readonly Aplicado[], ctx: Contexto): AutoridadeRepetida {
  const situacoes = new Map(aplicados.map((x) => [x, noContatosDoCaso(x.caso, ctx)] as const));
  const noContatos = (x: Aplicado): SituacaoNoContatos => situacoes.get(x) ?? "sem_efeito";
  const reabertos = aplicados.filter((x) => noContatos(x) === "reaberto");
  if (reabertos.length > 0) return comDecisao(a, maisRecente(reabertos), "reaberto");

  const outras = conjunto(aplicados.flatMap((x) => (x.decisao.outraPessoa ?? []).map((g) => grupoEquivalente(g, "contatos"))));
  const { autoridade, repetida } = semAsOutrasPessoas(a, outras);
  const decisivos = aplicados.filter((x) => x.decisao.tipo !== "pessoas_diferentes");
  if (new Set(decisivos.map((x) => chaveDoQueDecide(x.decisao))).size > 1) {
    const recente = maisRecente(decisivos);
    const { convidaPor: _semConvite, ...resto } = autoridade;
    return { ...resto, situacao: "conferir", motivo: MOTIVO_DUAS_DECISOES, caso: recente.caso, decisao: recente.decisao, noContatos: noContatos(recente) };
  }
  if (decisivos.length > 0) {
    const decide = maisRecente(decisivos);
    return comDecisao(autoridade, decide, noContatos(decide));
  }

  const recente = maisRecente(aplicados);
  const silenciador = aplicados.find((x) => (x.decisao.outraPessoa ?? []).length === 0);
  const extras = { caso: (silenciador ?? recente).caso, decisao: (silenciador ?? recente).decisao, noContatos: noContatos(silenciador ?? recente) };
  if (silenciador || !repetida) {
    const { convidaPor: _semConvite, ...resto } = autoridade;
    return { ...resto, ...extras, situacao: "decidido_gt", motivo: motivoDaDecisao(extras.decisao) };
  }
  return { ...autoridade, ...extras };
}

/** Linhas do grupo com a pessoa do caso: pela regra da Nominata, ou pelo próprio rótulo quando fora dela. */
function entradasDaPessoa(g: ResultadoGrupo, chaves: ReadonlySet<string>): Entrada[] {
  const pelaRegra = entradasDoGrupo(g).filter((e) => chaves.has(e.ocorrencia.chave));
  if (pelaRegra.length > 0) return pelaRegra;
  return g.contatos
    .filter((c) => chaves.has(normalizarNome(c.contato.nome)))
    .map((c) => ({
      nome: c.contato.nome,
      ocorrencia: {
        grupo: g.grupo, grupoRegra: g.grupo, chave: normalizarNome(c.contato.nome), cargo: c.contato.cargo ?? "",
        ex: false, possivelSaida: Boolean(c.possivelSaida), origem: "contatos" as const,
      },
    }));
}

/**
 * Caso decidido cuja pessoa já não aparece repetida (Nunes Marques, só no TSE): procura a pessoa nos
 * grupos do retrato pelas chaves do caso, sem os grupos marcados como outra pessoa. A situação vem da
 * situação no Contatos.
 */
function autoridadeForaDoCalculo(x: Aplicado, ctx: Contexto): AutoridadeRepetida {
  const chaves = new Set(x.caso.chaves);
  const outraPessoa = conjunto((x.decisao.outraPessoa ?? []).map((g) => grupoEquivalente(g, "contatos")));
  const entradas = ctx.grupos
    .filter((g) => !outraPessoa.has(normalizarTexto(grupoEquivalente(g.grupo, "contatos"))))
    .flatMap((g) => entradasDaPessoa(g, chaves));
  const ocorrencias = semRepeticao(entradas.map((e) => e.ocorrencia));
  const nome = entradas[0]?.nome ?? x.caso.nome;
  const noContatos = noContatosDoCaso(x.caso, ctx);
  const decidida = comDecisao({ nome, ocorrencias, situacao: "decidido_gt", motivo: "" }, x, noContatos);
  if (ocorrencias.length > 0 || decidida.situacao !== "decidido_gt") return decidida;
  return { ...decidida, motivo: MOTIVO_PESSOA_NAO_ENCONTRADA };
}

function aplicado(caso: CasoDecidido): Aplicado[] {
  const decisao = vigente(caso);
  return decisao ? [{ caso, decisao }] : [];
}

/**
 * Cada autoridade com todos os casos do histórico que casam com ela (`casosDaPessoa`); depois, os
 * casos que não casaram nenhuma e cuja pessoa (pelas chaves) não está em nenhuma autoridade da lista.
 */
export function aplicarDecisoes(
  lista: readonly AutoridadeRepetida[], h: HistoricoDecisoes, grupos: readonly ResultadoGrupo[], eleicao: ResultadoEleicao | undefined,
): AutoridadeRepetida[] {
  const ctx: Contexto = { grupos, casos: h.casos, ...(eleicao ? { eleicao } : {}) };
  const usados = new Set<CasoDecidido>();
  const decididas = lista.map((a) => {
    const nomes = [a.nome, ...a.ocorrencias.map((o) => o.chave)];
    const casos = casosDaPessoa(h, nomes, [...new Set(a.ocorrencias.map(equivalenteDaOcorrencia))]);
    for (const c of casos) usados.add(c);
    const aplicados = casos.flatMap(aplicado);
    return aplicados.length > 0 ? aplicarCasos(a, aplicados, ctx) : a;
  });
  const chavesDaLista = new Set(lista.flatMap((a) => a.ocorrencias.filter((o) => o.origem === "contatos").map((o) => o.chave)));
  const foraDoCalculo = h.casos
    .filter((c) => !usados.has(c) && !c.chaves.some((k) => chavesDaLista.has(k)))
    .flatMap(aplicado)
    .map((x) => autoridadeForaDoCalculo(x, ctx));
  return [...decididas, ...foraDoCalculo];
}

/** Etiqueta da linha no painel e se a linha fica fosca (atenuada, fora das pendências). */
export interface MarcaDeRepeticao {
  etiqueta: Etiqueta;
  fosca: boolean;
}

/**
 * Marca pela decisão vigente do GT (spec §4.1.3), para autoridade decidida pelo GT ou tratada. A linha
 * fosca leva etiqueta neutra: não conta como pendência. Fosca só quando há ocorrência no grupo do
 * convite; nunca no grupo que convida nem em `ajustar_contatos`.
 */
export function marcaDaDecisao(a: AutoridadeRepetida, d: RegistroManual, grupo: string): MarcaDeRepeticao | undefined {
  const dia = dataDaDecisao(d.data);
  const daLinha = grupoEquivalente(grupo, "contatos");
  const marca = (tom: Etiqueta["tom"], texto: string, fosca: boolean): MarcaDeRepeticao =>
    ({ etiqueta: { campo: "grupo", tom, texto, explicacao: a.motivo }, fosca });
  switch (d.tipo) {
    case "mesma_pessoa": {
      const convite = d.convidaPor?.trim();
      if (!convite) return undefined;
      if (!mesmoGrupo(daLinha, convite)) {
        return a.convidaPor
          ? marca("neutro", `Será convidada pelo grupo ${convite} (decisão do GT de ${dia})`, true)
          : marca("atencao", `Grupo do convite ${convite} sem a pessoa no Contatos`, false);
      }
      const outros = [...new Set(a.ocorrencias
        .filter((o) => !mesmoGrupo(equivalenteDaOcorrencia(o), convite))
        .map((o) => o.grupoRegra))].join(", ");
      const tambem = outros ? `; também em ${outros}` : "";
      return marca("neutro", `Convidada por este grupo${tambem} (decisão do GT de ${dia})`, false);
    }
    case "nao_recebe_convite":
      return marca("neutro", `Não recebe convite (decisão do GT de ${dia})`, true);
    case "ajustar_contatos":
      return a.situacao === "tratado" ? undefined : marca("atencao", `Ajustar no Contatos (decisão de ${dia})`, false);
    default:
      return undefined;
  }
}
