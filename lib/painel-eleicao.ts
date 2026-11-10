import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_DEPUTADOS_FEDERAIS, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import { grupoDoAgrupador } from "@/lib/agrupador";
import { ORIENTACAO_OUTRA_CASA } from "@/lib/eleitos";
import { normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import type { CasaLegislativa, EleicaoContato, EleicaoGovernoContato, EleitoClassificado, GovernadorClassificado, ResultadoContato, ResultadoEleicao, ResultadoGrupo, UfSegundoTurno } from "@/lib/types";

/**
 * O que o painel mostra da Eleição 2026 (spec 2026-10-05 §5), decidido fora do JSX.
 * Nada aqui muda a situação da linha: a eleição é eixo próprio.
 */

export type FiltroEleicao = "reeleitos" | "outra_casa" | "a_cadastrar" | "a_conferir";

export const FILTROS_ELEICAO: readonly { id: FiltroEleicao; rotulo: string }[] = [
  { id: "reeleitos", rotulo: "Reeleitos" },
  { id: "outra_casa", rotulo: "Eleitos para outro cargo" },
  { id: "a_cadastrar", rotulo: "A cadastrar" },
  { id: "a_conferir", rotulo: "A conferir" },
];

const IDS = new Set<string>(FILTROS_ELEICAO.map((f) => f.id));

export function ehFiltroEleicao(f: string): f is FiltroEleicao {
  return IDS.has(f);
}

const NOME_CASA: Record<CasaLegislativa, string> = { senado: "Senado Federal", camara: "Câmara dos Deputados" };

function etiquetaDoDestino(e: EleicaoContato): Etiqueta {
  switch (e.destino) {
    case "reeleito":
      return { campo: "eleicao", texto: "Reeleito", tom: "ok", explicacao: "Reeleito em 04/10/2026: fica neste grupo" };
    case "outra_casa":
      return { campo: "eleicao", texto: e.casa === "senado" ? "Eleito senador — atenção" : "Eleito deputado — atenção", tom: "atencao", explicacao: ORIENTACAO_OUTRA_CASA };
    case "novo":
      return { campo: "eleicao", texto: "Eleito — grupo novo", tom: "neutro", explicacao: "Mandato novo, já cadastrado no grupo dos eleitos" };
    case "conferir":
      return { campo: "eleicao", texto: "Eleição: a conferir", tom: "atencao", explicacao: e.motivo ?? "Caso a conferir antes do cadastro" };
  }
}

export function etiquetasDeEleicao(e: EleicaoContato | undefined): Etiqueta[] {
  if (!e) return [];
  const lista = [etiquetaDoDestino(e)];
  if (e.projecao) lista.push({ campo: "eleicao", texto: "Projeção — aguarda TSE", tom: "neutro", explicacao: "O TSE ainda não homologou os eleitos desta UF; a lista segue a projeção da imprensa" });
  return lista;
}

export function etiquetasDeGoverno(e: EleicaoGovernoContato | undefined): Etiqueta[] {
  if (!e) return [];
  switch (e.destino) {
    case "reeleito":
      return [{ campo: "eleicao", texto: "Reeleito governador", tom: "ok", explicacao: "Reeleito governador em 04/10/2026: fica neste grupo" }];
    case "outro_cargo":
      return [{ campo: "eleicao", texto: "Eleito governador — atenção", tom: "atencao", explicacao: ORIENTACAO_OUTRA_CASA }];
    case "novo":
      return [{ campo: "eleicao", texto: "Eleito governador — grupo novo", tom: "neutro", explicacao: "Mandato novo de governador, já cadastrado no grupo dos eleitos" }];
    case "conferir":
      return [{ campo: "eleicao", texto: "Governo: a conferir", tom: "atencao", explicacao: e.motivo ?? "Caso a conferir antes do cadastro" }];
  }
}

/** O motivo de quem não está a conferir é o da decisão do GT ("Decisão do GT de DD/MM"). */
const rotuloDoMotivo = (destino: string): string => (destino === "conferir" ? "A conferir" : "Classificação");

export function detalheDoGoverno(e: EleicaoGovernoContato): { linhas: { rotulo: string; valor: string }[]; orientacao?: string } {
  const linhas = [
    { rotulo: "Eleito para", valor: "Governo do Estado" },
    { rotulo: "UF", valor: e.uf },
    ...(e.partido ? [{ rotulo: "Partido", valor: e.partido }] : []),
    { rotulo: "Situação no TSE", valor: e.situacaoTse },
    { rotulo: "Status do mandato", valor: e.statusMandato },
    ...(e.baseStatus ? [{ rotulo: "Base do status", valor: e.baseStatus }] : []),
    ...(e.motivo ? [{ rotulo: rotuloDoMotivo(e.destino), valor: e.motivo }] : []),
  ];
  return { linhas, ...(e.destino === "outro_cargo" ? { orientacao: ORIENTACAO_OUTRA_CASA } : {}) };
}

/** Troca de Casa ou de cargo: a linha ganha destaque. */
export function destacaLinha(e: EleicaoContato | undefined, g?: EleicaoGovernoContato): boolean {
  return e?.destino === "outra_casa" || g?.destino === "outro_cargo";
}

export function detalheDaEleicao(e: EleicaoContato): { linhas: { rotulo: string; valor: string }[]; orientacao?: string } {
  const linhas = [
    { rotulo: "Eleito para", valor: NOME_CASA[e.casa] },
    { rotulo: "UF", valor: e.uf },
    ...(e.partido ? [{ rotulo: "Partido", valor: e.partido }] : []),
    { rotulo: "Situação no TSE", valor: e.situacaoTse },
    { rotulo: "Status do mandato", valor: e.statusMandato },
    ...(e.baseStatus ? [{ rotulo: "Base do status", valor: e.baseStatus }] : []),
    ...(e.motivo ? [{ rotulo: rotuloDoMotivo(e.destino), valor: e.motivo }] : []),
  ];
  return { linhas, ...(e.destino === "outra_casa" ? { orientacao: ORIENTACAO_OUTRA_CASA } : {}) };
}

export function passaFiltroEleicao(c: ResultadoContato, f: FiltroEleicao): boolean {
  if (f === "reeleitos") return c.eleicao?.destino === "reeleito" || c.eleicaoGoverno?.destino === "reeleito";
  if (f === "outra_casa") return c.eleicao?.destino === "outra_casa" || c.eleicaoGoverno?.destino === "outro_cargo";
  return false; // a_cadastrar e a_conferir são seções, não linhas do Contatos
}

/**
 * Eleitos de um grupo de destino do Contatos (spec 2026-10-30 §4.4): a seção única antiga dos
 * eleitos a conferir deu lugar a uma seção por grupo, com as subseções A cadastrar e A conferir.
 */
export interface SecaoGrupoEleito {
  /** Rótulo oficial do grupo no agrupador da Posse 2027 (`data/grupos-posse.ts`). */
  grupo: string;
  titulo: string;
  aCadastrar: EleitoClassificado[];
  aConferir: EleitoClassificado[];
  governo: { aCadastrar: GovernadorClassificado[]; aConferir: GovernadorClassificado[] };
  /** Classificados (eleitos e governadores) com este grupo de destino. Não depende de filtro nem de busca. */
  pelaLista: number;
  /** Contatos do retrato nos grupos cujo rótulo casa este (`grupoDoAgrupador`). */
  noContatos: number;
}

function casaBusca(x: EleitoClassificado, busca: string): boolean {
  if (busca === "") return true;
  const e = x.eleito;
  return [e.nomeUrna, e.nomeCompleto, e.partido ?? "", e.uf].some((v) => normalizarTexto(v).includes(busca));
}

function governoBusca(g: GovernadorClassificado, busca: string): boolean {
  if (busca === "") return true;
  const e = g.eleito;
  return [e.nomeUrna, e.nomeCompleto, e.partido ?? "", e.uf].some((v) => normalizarTexto(v).includes(busca));
}

const GRUPO_ELEITO_DA_CASA: Record<CasaLegislativa, string> = { senado: GRUPO_SENADORES_ELEITOS, camara: GRUPO_DEPUTADOS_ELEITOS };

/**
 * Grupo do convite do eleito; `conferir` não tem. Retrato gravado antes de 30/10/2026 não traz
 * `grupoDestino`: o mandato novo cai no grupo de eleitos da sua Casa, como na seção antiga.
 */
function grupoDoEleito(x: EleitoClassificado): string | undefined {
  if (x.grupoDestino !== undefined) return x.grupoDestino;
  return x.destino === "novo" ? GRUPO_ELEITO_DA_CASA[x.eleito.casa] : undefined;
}

/** Idem para o governador: sem `grupoDestino` (retrato antigo), o mandato novo vai para os governadores eleitos. */
function grupoDoGovernador(g: GovernadorClassificado): string | undefined {
  if (g.grupoDestino !== undefined) return g.grupoDestino;
  return g.destino === "novo" ? GRUPO_GOVERNADORES_ELEITOS : undefined;
}

/** Quem entra em cada subseção de um grupo, antes do filtro e da busca. */
interface RegraDoGrupo {
  grupo: string;
  aCadastrar: (x: EleitoClassificado) => boolean;
  aConferir: (x: EleitoClassificado) => boolean;
  governoACadastrar: (g: GovernadorClassificado) => boolean;
  governoAConferir: (g: GovernadorClassificado) => boolean;
  /** Total "pela lista" do título quando não é a contagem dos classificados com este grupo de destino. */
  pelaLista?: (eleicao: ResultadoEleicao) => number | undefined;
}

const nenhum = () => false;
const naoCadastradoEm = (grupo: string) => (x: EleitoClassificado) => grupoDoEleito(x) === grupo && !x.jaCadastrado;
const conferirDaCasa = (casa: CasaLegislativa) => (x: EleitoClassificado) => x.destino === "conferir" && x.eleito.casa === casa;

const REGRAS_DOS_ELEITOS: readonly RegraDoGrupo[] = [
  { grupo: GRUPO_SENADORES_ELEITOS, aCadastrar: naoCadastradoEm(GRUPO_SENADORES_ELEITOS), aConferir: conferirDaCasa("senado"), governoACadastrar: nenhum, governoAConferir: nenhum },
  { grupo: GRUPO_DEPUTADOS_ELEITOS, aCadastrar: naoCadastradoEm(GRUPO_DEPUTADOS_ELEITOS), aConferir: conferirDaCasa("camara"), governoACadastrar: nenhum, governoAConferir: nenhum },
  {
    grupo: GRUPO_GOVERNADORES_ELEITOS, aCadastrar: nenhum, aConferir: nenhum,
    governoACadastrar: (g) => grupoDoGovernador(g) === GRUPO_GOVERNADORES_ELEITOS && !g.jaCadastrado,
    governoAConferir: (g) => g.destino === "conferir",
  },
];

/**
 * Com "Deputados Federais" no Contatos, quem é convidado por ele e ainda não está nele (spec §4.4):
 * os reeleitos e os eleitos para a outra Casa que ficam no cargo atual (Ata 14). Pela lista, os
 * deputados em exercício da planilha da Câmara; sem ela, os classificados com este destino.
 */
const REGRA_DEPUTADOS_FEDERAIS: RegraDoGrupo = {
  grupo: GRUPO_DEPUTADOS_FEDERAIS,
  aCadastrar: naoCadastradoEm(GRUPO_DEPUTADOS_FEDERAIS),
  aConferir: nenhum, governoACadastrar: nenhum, governoAConferir: nenhum,
  pelaLista: (eleicao) => eleicao.deputadosAtuais?.length,
};

const SUBSECOES_POR_FILTRO: Record<string, { aCadastrar: boolean; aConferir: boolean }> = {
  tudo: { aCadastrar: true, aConferir: true },
  a_cadastrar: { aCadastrar: true, aConferir: false },
  a_conferir: { aCadastrar: false, aConferir: true },
};

function contatosNoGrupo(grupos: readonly ResultadoGrupo[], rotulo: string): number {
  return grupos
    .filter((g) => grupoDoAgrupador(g.grupo)?.rotulo === rotulo)
    .reduce((soma, g) => soma + g.contatos.length, 0);
}

/**
 * Uma seção por grupo de eleitos, na ordem Senadores, Deputado Federal e Governadores, e "Deputados
 * Federais" quando o grupo já está no Contatos. Os números do título são totais (sem filtro nem
 * busca); as listas seguem o filtro e a busca, e a seção sem linha visível some.
 */
export function secoesDeEleicao(
  eleicao: ResultadoEleicao | undefined,
  grupos: readonly ResultadoGrupo[],
  filtro: string,
  busca: string,
): SecaoGrupoEleito[] {
  const mostra = SUBSECOES_POR_FILTRO[filtro];
  if (!eleicao || !mostra) return [];
  const b = normalizarTexto(busca.trim());
  const eleitos = eleicao.eleitos;
  const governadores = eleicao.governadores?.eleitos ?? [];
  const regras = eleicao.camaraNoContatos ? [...REGRAS_DOS_ELEITOS, REGRA_DEPUTADOS_FEDERAIS] : REGRAS_DOS_ELEITOS;
  return regras.flatMap((r): SecaoGrupoEleito[] => {
    const pelaLista = r.pelaLista?.(eleicao)
      ?? eleitos.filter((x) => grupoDoEleito(x) === r.grupo).length + governadores.filter((g) => grupoDoGovernador(g) === r.grupo).length;
    const totalACadastrar = eleitos.filter(r.aCadastrar).length + governadores.filter(r.governoACadastrar).length;
    const noContatos = contatosNoGrupo(grupos, r.grupo);
    const secao: SecaoGrupoEleito = {
      grupo: r.grupo,
      titulo: `${r.grupo} — ${pelaLista} pela lista · ${noContatos} no Contatos · ${totalACadastrar} a cadastrar`,
      aCadastrar: mostra.aCadastrar ? eleitos.filter((x) => r.aCadastrar(x) && casaBusca(x, b)) : [],
      aConferir: mostra.aConferir ? eleitos.filter((x) => r.aConferir(x) && casaBusca(x, b)) : [],
      governo: {
        aCadastrar: mostra.aCadastrar ? governadores.filter((g) => r.governoACadastrar(g) && governoBusca(g, b)) : [],
        aConferir: mostra.aConferir ? governadores.filter((g) => r.governoAConferir(g) && governoBusca(g, b)) : [],
      },
      pelaLista,
      noContatos,
    };
    const linhas = secao.aCadastrar.length + secao.aConferir.length + secao.governo.aCadastrar.length + secao.governo.aConferir.length;
    return linhas > 0 ? [secao] : [];
  });
}

/**
 * Quantidade esperada pela eleição ou pela Câmara, por rótulo do agrupador (spec §4.5): só nos três
 * grupos de eleitos e em "Deputados Federais". Eleitos e governadores contam pelo grupo de destino
 * (`conferir` não conta); "Deputados Federais" é o total de deputados em exercício da planilha da
 * Câmara. Sem a planilha de uma Casa, dos governadores ou da Câmara, a chave fica de fora.
 */
export function esperadosDoAgrupador(eleicao: ResultadoEleicao | undefined): Record<string, number> {
  if (!eleicao) return {};
  const destinos = [
    ...eleicao.eleitos.map(grupoDoEleito),
    ...(eleicao.governadores?.eleitos ?? []).map(grupoDoGovernador),
  ];
  const conta = (grupo: string) => ({ [grupo]: destinos.filter((d) => d === grupo).length });
  const temCasa = (casa: CasaLegislativa) => eleicao.eleitos.some((x) => x.eleito.casa === casa);
  const atuais = eleicao.deputadosAtuais?.length ?? 0;
  return {
    ...(temCasa("senado") ? conta(GRUPO_SENADORES_ELEITOS) : {}),
    ...(temCasa("camara") ? conta(GRUPO_DEPUTADOS_ELEITOS) : {}),
    ...(eleicao.governadores ? conta(GRUPO_GOVERNADORES_ELEITOS) : {}),
    ...(atuais > 0 ? { [GRUPO_DEPUTADOS_FEDERAIS]: atuais } : {}),
  };
}

/** Seção das UFs que aguardam o 2º turno. Os governadores a cadastrar estão na seção do seu grupo (`secoesDeEleicao`). */
export interface SecaoGoverno {
  id: "governo_segundo_turno";
  titulo: string;
  segundoTurno: UfSegundoTurno[];
}

function segundoTurnoBusca(u: UfSegundoTurno, busca: string): boolean {
  if (busca === "") return true;
  return [u.uf, ...u.candidatos.map((c) => c.nomeUrna)].some((v) => normalizarTexto(v).includes(busca));
}

/** O 2º turno só aparece sem filtro, como antes ("A cadastrar" mostrava só os governadores novos). */
export function secoesDeGoverno(eleicao: ResultadoEleicao | undefined, filtro: string, busca: string): SecaoGoverno[] {
  const gov = eleicao?.governadores;
  if (!gov || filtro !== "tudo") return [];
  const b = normalizarTexto(busca.trim());
  const segundoTurno = gov.segundoTurno.filter((u) => segundoTurnoBusca(u, b));
  if (segundoTurno.length === 0) return [];
  return [{
    id: "governo_segundo_turno",
    titulo: `Governadores — aguarda 2º turno, 25/10 (${segundoTurno.length} ${segundoTurno.length === 1 ? "UF" : "UFs"})`,
    segundoTurno,
  }];
}

export function avisoDaEleicao(eleicao: ResultadoEleicao | undefined): string | undefined {
  if (!eleicao || eleicao.camaraNoContatos) return undefined;
  if (!eleicao.eleitos.some((x) => x.eleito.casa === "camara")) return undefined;
  return "Deputados classificados pela planilha: o grupo Deputados Federais ainda não está no Contatos.";
}
