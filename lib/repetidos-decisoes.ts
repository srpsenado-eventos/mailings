import {
  casosDaPessoa, chaveDoQueDecide, dataDaDecisao, grupoEquivalente, MOTIVO_DUAS_DECISOES, gruposAtuaisParaOCaso, quadroDeBloqueio,
  situacaoDoCaso, textoDasPendencias, vigente,
  type BloqueioDoGrupo, type CasoDecidido, type HistoricoDecisoes, type QuadroDeBloqueio, type RegistroManual, type SituacaoNoContatos,
  type TipoDecisao,
} from "@/lib/decisoes";
import { gruposAtuaisDoCaso } from "@/lib/decisoes-coleta";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import {
  entradasDoGrupo, equivalenteDaOcorrencia, escolherComEleito, escolherGrupo, mesmoGrupo, semRepetir, semRepeticao,
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
  tratado: "Tratado",
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

/**
 * Situação no Contatos e quadro de bloqueio ao vivo, os dois sobre os mesmos grupos atuais da coleta
 * (`gruposAtuaisParaOCaso`): uma regra só para a tela e a coleta.
 */
function noContatosDoCaso(caso: CasoDecidido, ctx: Contexto): { situacao: SituacaoNoContatos; quadro: QuadroDeBloqueio } {
  const atuais = gruposAtuaisParaOCaso(caso, gruposAtuaisDoCaso(caso, ctx.grupos, ctx.eleicao), ctx.casos);
  return { situacao: situacaoDoCaso(caso, atuais), quadro: quadroDeBloqueio(caso, atuais) };
}

/** O mais recente pela data do registro vigente; no empate, o último do histórico. */
function maisRecente(aplicados: readonly Aplicado[]): Aplicado {
  return aplicados.reduce((melhor, x) => (x.decisao.data >= melhor.decisao.data ? x : melhor));
}

type NoContatos = ReturnType<typeof noContatosDoCaso>;

function comDecisao(a: AutoridadeRepetida, x: Aplicado, { situacao: noContatos, quadro }: NoContatos): AutoridadeRepetida {
  const base = {
    nome: a.nome, ocorrencias: a.ocorrencias, ...(a.eleicao ? { eleicao: true as const } : {}),
    caso: x.caso, decisao: x.decisao, noContatos,
    ...(quadro.pendencias.length > 0 ? { pendencias: quadro.pendencias } : {}),
    ...(quadro.bloqueios.length > 0 ? { bloqueios: quadro.bloqueios } : {}),
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
  const calculado = (x: Aplicado): NoContatos => situacoes.get(x) ?? { situacao: "sem_efeito", quadro: { aBloquear: [], bloqueios: [], pendencias: [] } };
  const noContatos = (x: Aplicado): SituacaoNoContatos => calculado(x).situacao;
  const reabertos = aplicados.filter((x) => noContatos(x) === "reaberto");
  if (reabertos.length > 0) return comDecisao(a, maisRecente(reabertos), calculado(maisRecente(reabertos)));

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
    return comDecisao(autoridade, decide, calculado(decide));
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
  const decidida = comDecisao({ nome, ocorrencias, situacao: "decidido_gt", motivo: "" }, x, noContatosDoCaso(x.caso, ctx));
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

/** Pessoa e grupos do caso, o que o registro de bloqueio precisa para achar o caso (spec 2026-11-04 §3.1.3). */
export interface AlvoDeBloqueio {
  nome: string;
  nomes: string[];
  grupos: string[];
}

/** Ação do botão de bloqueio da linha: marcar (`bloqueado: false`) ou desfazer (`bloqueado: true`). */
export interface AcaoBloqueio {
  alvo: AlvoDeBloqueio;
  grupo: string;
  bloqueado: boolean;
  /** O bloqueio está no grupo do convite (registrado por engano): o botão desfaz. */
  grupoDoConvite?: true;
}

/** Etiquetas da linha no painel, se a linha fica fosca (atenuada, fora das pendências) e a ação de bloqueio. */
export interface MarcaDeRepeticao {
  etiquetas: Etiqueta[];
  fosca: boolean;
  acao?: AcaoBloqueio;
}

/** Alvo do registro de bloqueio; sem caso ou sem decisão vigente não há o que bloquear. */
export function alvoDeBloqueio(a: AutoridadeRepetida): AlvoDeBloqueio | undefined {
  if (!a.caso || !a.decisao) return undefined;
  return {
    nome: a.nome,
    nomes: semRepetir([a.nome, ...a.caso.chaves, ...a.ocorrencias.map((o) => o.chave)]),
    grupos: [...a.decisao.grupos],
  };
}

/** Situação da autoridade em texto: a mesma na tela e na planilha (spec 2026-11-04 §3.1.2). */
export function textoDaSituacao(a: AutoridadeRepetida): string {
  const s = a.noContatos;
  if (s === undefined || s === "sem_efeito") return "";
  if (a.decisao?.tipo === "ajustar_contatos") return textoNoContatos(s);
  if (s === "tratado") return "Tratado";
  if (s === "pendente") return a.pendencias && a.pendencias.length > 0 ? textoDasPendencias(a.pendencias) : "Pendente";
  return textoNoContatos(s);
}

/** Bloqueio de um grupo em texto, para o cartão e a planilha. */
export function textoDoBloqueio(b: BloqueioDoGrupo): string {
  if (!b.bloqueado) return `${b.grupo}: a bloquear`;
  const quando = `${b.grupo}: bloqueada em ${dataDaDecisao(b.data ?? "")}`;
  return b.grupoDoConvite ? `${quando}, mas é o grupo do convite: desbloquear` : quando;
}

/** Há grupo a bloquear no Posse: algum bloqueio fora do grupo do convite ainda não feito. */
export function temGrupoABloquear(a: AutoridadeRepetida): boolean {
  return (a.bloqueios ?? []).some((b) => !b.grupoDoConvite && !b.bloqueado);
}

/**
 * Marca pela decisão vigente do GT (spec 2026-11-04 §3.1.4), para autoridade decidida pelo GT ou
 * tratada. A linha fica fosca (etiqueta neutra, fora das pendências) só depois de bloqueada no Posse;
 * enquanto falta o bloqueio, a etiqueta é de atenção e a linha traz a ação. Nunca fosca no grupo que
 * convida nem em `ajustar_contatos`.
 */
export function marcaDaDecisao(a: AutoridadeRepetida, d: RegistroManual, grupo: string): MarcaDeRepeticao | undefined {
  const dia = dataDaDecisao(d.data);
  const daLinha = grupoEquivalente(grupo, "contatos");
  const etiqueta = (tom: Etiqueta["tom"], texto: string): Etiqueta => ({ campo: "grupo", tom, texto, explicacao: a.motivo });
  const bloqueio = a.bloqueios?.find((x) => mesmoGrupo(x.grupo, daLinha));
  const bloqueadoNaLinha = Boolean(bloqueio?.bloqueado) && !bloqueio?.grupoDoConvite;
  const alvo = alvoDeBloqueio(a);
  const acao = (extra: Partial<AcaoBloqueio> = {}): { acao?: AcaoBloqueio } =>
    (alvo ? { acao: { alvo, grupo: daLinha, bloqueado: Boolean(bloqueio?.bloqueado), ...extra } } : {});
  const aBloquear = (motivo: string): MarcaDeRepeticao => bloqueadoNaLinha
    ? { etiquetas: [etiqueta("neutro", `Bloqueada no Posse em ${dataDaDecisao(bloqueio?.data ?? "")} · ${motivo}`)], fosca: true, ...acao() }
    : { etiquetas: [etiqueta("atencao", `Bloquear no Posse neste grupo ao autorizar · ${motivo}`)], fosca: false, ...acao() };
  switch (d.tipo) {
    case "mesma_pessoa": {
      const convite = d.convidaPor?.trim();
      if (!convite) return undefined;
      if (!mesmoGrupo(daLinha, convite)) {
        const marca = aBloquear(`convite pelo grupo ${convite} (decisão do GT de ${dia})`);
        if (a.convidaPor) return marca;
        return { ...marca, etiquetas: [...marca.etiquetas, etiqueta("atencao", `Grupo do convite ${convite} sem a pessoa no Contatos`)] };
      }
      const outros = [...new Set(a.ocorrencias
        .filter((o) => !mesmoGrupo(equivalenteDaOcorrencia(o), convite))
        .map((o) => o.grupoRegra))].join(", ");
      const tambem = outros ? `; também em ${outros}` : "";
      const convida = etiqueta("neutro", `Convidada por este grupo${tambem} (decisão do GT de ${dia})`);
      if (!bloqueio?.grupoDoConvite) return { etiquetas: [convida], fosca: false };
      const erro = etiqueta("atencao", `Bloqueada no Posse em ${dataDaDecisao(bloqueio.data ?? "")}, mas é o grupo do convite: desbloquear`);
      return { etiquetas: [convida, erro], fosca: false, ...acao({ bloqueado: true, grupoDoConvite: true }) };
    }
    case "nao_recebe_convite":
      return aBloquear(`não recebe convite (decisão do GT de ${dia})`);
    case "ajustar_contatos":
      return a.situacao === "tratado" ? undefined : { etiquetas: [etiqueta("atencao", `Ajustar no Contatos (decisão de ${dia})`)], fosca: false };
    default:
      return undefined;
  }
}
