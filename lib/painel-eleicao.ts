import { ORIENTACAO_OUTRA_CASA } from "@/lib/eleitos";
import { normalizarTexto } from "@/lib/normalize";
import { temGrupoDeputados } from "@/lib/painel-deputados";
import type { Etiqueta } from "@/lib/painel";
import type { CasaLegislativa, EleicaoContato, EleicaoGovernoContato, EleitoClassificado, GovernadorClassificado, ResultadoContato, ResultadoEleicao, UfSegundoTurno } from "@/lib/types";

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

export function detalheDoGoverno(e: EleicaoGovernoContato): { linhas: { rotulo: string; valor: string }[]; orientacao?: string } {
  const linhas = [
    { rotulo: "Eleito para", valor: "Governo do Estado" },
    { rotulo: "UF", valor: e.uf },
    ...(e.partido ? [{ rotulo: "Partido", valor: e.partido }] : []),
    { rotulo: "Situação no TSE", valor: e.situacaoTse },
    { rotulo: "Status do mandato", valor: e.statusMandato },
    ...(e.baseStatus ? [{ rotulo: "Base do status", valor: e.baseStatus }] : []),
    ...(e.motivo ? [{ rotulo: "A conferir", valor: e.motivo }] : []),
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
    ...(e.motivo ? [{ rotulo: "A conferir", valor: e.motivo }] : []),
  ];
  return { linhas, ...(e.destino === "outra_casa" ? { orientacao: ORIENTACAO_OUTRA_CASA } : {}) };
}

export function passaFiltroEleicao(c: ResultadoContato, f: FiltroEleicao): boolean {
  if (f === "reeleitos") return c.eleicao?.destino === "reeleito" || c.eleicaoGoverno?.destino === "reeleito";
  if (f === "outra_casa") return c.eleicao?.destino === "outra_casa" || c.eleicaoGoverno?.destino === "outro_cargo";
  return false; // a_cadastrar e a_conferir são seções, não linhas do Contatos
}

export interface SecaoEleicao {
  id: "senado_novos" | "camara_novos" | "conferir";
  titulo: string;
  linhas: EleitoClassificado[];
  /** Governadores a conferir, na seção "conferir". Ausente nas seções montadas fora deste módulo. */
  governo?: GovernadorClassificado[];
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

const SECOES_POR_FILTRO: Record<string, readonly SecaoEleicao["id"][]> = {
  tudo: ["senado_novos", "camara_novos", "conferir"],
  a_cadastrar: ["senado_novos", "camara_novos"],
  a_conferir: ["conferir"],
};

export function secoesDeEleicao(eleicao: ResultadoEleicao | undefined, filtro: string, busca: string): SecaoEleicao[] {
  if (!eleicao) return [];
  const b = normalizarTexto(busca.trim());
  const ids = SECOES_POR_FILTRO[filtro] ?? [];
  const visiveis = eleicao.eleitos.filter((x) => casaBusca(x, b));
  const novos = (casa: CasaLegislativa) => visiveis.filter((x) => x.destino === "novo" && !x.jaCadastrado && x.eleito.casa === casa);
  const governoConferir = (eleicao.governadores?.eleitos ?? []).filter((g) => g.destino === "conferir" && governoBusca(g, b));
  const todas: SecaoEleicao[] = [
    { id: "senado_novos", titulo: "Senadores Eleitos — a cadastrar", linhas: novos("senado"), governo: [] },
    { id: "camara_novos", titulo: "Deputados Federais Eleitos — a cadastrar", linhas: novos("camara"), governo: [] },
    { id: "conferir", titulo: "Eleitos — a conferir", linhas: visiveis.filter((x) => x.destino === "conferir"), governo: governoConferir },
  ];
  // Com o grupo virtual "Deputados Federais" na tela, os eleitos novos da Câmara já aparecem dentro dele.
  const grupoVirtual = temGrupoDeputados(eleicao);
  return todas
    .filter((s) => ids.includes(s.id) && s.linhas.length + (s.governo?.length ?? 0) > 0 && !(grupoVirtual && s.id === "camara_novos"))
    .map((s) => ({ ...s, titulo: `${s.titulo} (${s.linhas.length + (s.governo?.length ?? 0)})` }));
}

export interface SecaoGoverno {
  id: "governo_novos" | "governo_segundo_turno";
  titulo: string;
  novos: GovernadorClassificado[];
  segundoTurno: UfSegundoTurno[];
}

const SECOES_GOVERNO_POR_FILTRO: Record<string, readonly SecaoGoverno["id"][]> = {
  tudo: ["governo_novos", "governo_segundo_turno"],
  a_cadastrar: ["governo_novos"],
};

function segundoTurnoBusca(u: UfSegundoTurno, busca: string): boolean {
  if (busca === "") return true;
  return [u.uf, ...u.candidatos.map((c) => c.nomeUrna)].some((v) => normalizarTexto(v).includes(busca));
}

export function secoesDeGoverno(eleicao: ResultadoEleicao | undefined, filtro: string, busca: string): SecaoGoverno[] {
  const gov = eleicao?.governadores;
  if (!gov) return [];
  const b = normalizarTexto(busca.trim());
  const ids = SECOES_GOVERNO_POR_FILTRO[filtro] ?? [];
  const novos = gov.eleitos.filter((g) => g.destino === "novo" && !g.jaCadastrado && governoBusca(g, b));
  const segundoTurno = gov.segundoTurno.filter((u) => segundoTurnoBusca(u, b));
  const todas: SecaoGoverno[] = [
    { id: "governo_novos", titulo: `Governadores Eleitos — a cadastrar (${novos.length})`, novos, segundoTurno: [] },
    {
      id: "governo_segundo_turno",
      titulo: `Governadores — aguarda 2º turno, 25/10 (${segundoTurno.length} ${segundoTurno.length === 1 ? "UF" : "UFs"})`,
      novos: [], segundoTurno,
    },
  ];
  return todas.filter((s) => ids.includes(s.id) && s.novos.length + s.segundoTurno.length > 0);
}

export function avisoDaEleicao(eleicao: ResultadoEleicao | undefined): string | undefined {
  if (!eleicao || eleicao.camaraNoContatos) return undefined;
  if (!eleicao.eleitos.some((x) => x.eleito.casa === "camara")) return undefined;
  return "Deputados classificados pela planilha: o grupo Deputados Federais ainda não está no Contatos.";
}
