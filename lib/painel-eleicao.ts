import { ORIENTACAO_OUTRA_CASA } from "@/lib/eleitos";
import { normalizarTexto } from "@/lib/normalize";
import type { Etiqueta } from "@/lib/painel";
import type { CasaLegislativa, EleicaoContato, EleitoClassificado, ResultadoContato, ResultadoEleicao } from "@/lib/types";

/**
 * O que o painel mostra da Eleição 2026 (spec 2026-10-05 §5), decidido fora do JSX.
 * Nada aqui muda a situação da linha: a eleição é eixo próprio.
 */

export type FiltroEleicao = "reeleitos" | "outra_casa" | "a_cadastrar" | "a_conferir";

export const FILTROS_ELEICAO: readonly { id: FiltroEleicao; rotulo: string }[] = [
  { id: "reeleitos", rotulo: "Reeleitos" },
  { id: "outra_casa", rotulo: "Eleitos para a outra Casa" },
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

export function destacaLinha(e: EleicaoContato | undefined): boolean {
  return e?.destino === "outra_casa";
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
  if (f === "reeleitos") return c.eleicao?.destino === "reeleito";
  if (f === "outra_casa") return c.eleicao?.destino === "outra_casa";
  return false; // a_cadastrar e a_conferir são seções, não linhas do Contatos
}

export interface SecaoEleicao {
  id: "senado_novos" | "camara_novos" | "conferir";
  titulo: string;
  linhas: EleitoClassificado[];
}

function casaBusca(x: EleitoClassificado, busca: string): boolean {
  if (busca === "") return true;
  const e = x.eleito;
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
  const todas: SecaoEleicao[] = [
    { id: "senado_novos", titulo: "Senadores Eleitos — a cadastrar", linhas: novos("senado") },
    { id: "camara_novos", titulo: "Deputados Federais Eleitos — a cadastrar", linhas: novos("camara") },
    { id: "conferir", titulo: "Eleitos — a conferir", linhas: visiveis.filter((x) => x.destino === "conferir") },
  ];
  return todas
    .filter((s) => ids.includes(s.id) && s.linhas.length > 0)
    .map((s) => ({ ...s, titulo: `${s.titulo} (${s.linhas.length})` }));
}

export function avisoDaEleicao(eleicao: ResultadoEleicao | undefined): string | undefined {
  if (!eleicao || eleicao.camaraNoContatos) return undefined;
  if (!eleicao.eleitos.some((x) => x.eleito.casa === "camara")) return undefined;
  return "Deputados classificados pela planilha: o grupo Deputados Federais ainda não está no Contatos.";
}
