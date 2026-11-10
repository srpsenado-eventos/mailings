import * as XLSX from "xlsx";
import type { CasaLegislativa, DestinoEleito, DestinoGoverno, EleitoClassificado, GovernadorClassificado, ResultadoEleicao, UfSegundoTurno } from "@/lib/types";

/** Planilha "Eleitos 2026" do painel (spec 2026-10-05 §5): a lista para o cadastro, por destino. */
export const CABECALHO_ELEITOS = [
  "Casa", "UF", "Nome de urna", "Nome completo", "Partido", "Status do mandato", "Situação (TSE)", "Destino", "Grupo no Contatos", "Motivo",
] as const;

/** Abas dos governadores (spec 2026-10-12). */
export const CABECALHO_GOVERNO = [
  "UF", "Nome de urna", "Nome completo", "Partido", "Status do mandato", "Situação (TSE)", "Destino", "Grupo no Contatos", "Motivo",
] as const;
export const CABECALHO_SEGUNDO_TURNO = ["UF", "Nome de urna", "Partido", "Status do mandato"] as const;

const NOME_CASA: Record<CasaLegislativa, string> = { senado: "Senado Federal", camara: "Câmara dos Deputados" };
const ORDEM_CASA: Record<CasaLegislativa, number> = { senado: 0, camara: 1 };

const ROTULO_DESTINO: Record<DestinoEleito, string> = {
  reeleito: "Reeleito — fica no grupo atual",
  outra_casa: "Eleito para a outra Casa — fica no grupo atual (Ata 14)",
  novo: "Mandato novo — grupo novo",
  conferir: "A conferir",
};

const ROTULO_DESTINO_GOVERNO: Record<DestinoGoverno, string> = {
  reeleito: "Reeleito — fica em Governadores",
  outro_cargo: "Eleito governador — fica no cargo atual (Ata 14)",
  novo: "Mandato novo — Governadores Eleitos",
  conferir: "A conferir",
};

const porTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR");

function ordenar(lista: readonly EleitoClassificado[]): EleitoClassificado[] {
  return [...lista].sort((a, b) =>
    ORDEM_CASA[a.eleito.casa] - ORDEM_CASA[b.eleito.casa]
    || porTexto(a.eleito.uf, b.eleito.uf)
    || porTexto(a.eleito.nomeUrna, b.eleito.nomeUrna));
}

export function linhasEleitos(lista: readonly EleitoClassificado[]): Record<string, string>[] {
  return ordenar(lista).map((x) => ({
    Casa: NOME_CASA[x.eleito.casa],
    UF: x.eleito.uf,
    "Nome de urna": x.eleito.nomeUrna,
    "Nome completo": x.eleito.nomeCompleto,
    Partido: x.eleito.partido ?? "",
    "Status do mandato": x.eleito.statusMandato,
    "Situação (TSE)": x.eleito.situacaoTse,
    Destino: ROTULO_DESTINO[x.destino],
    "Grupo no Contatos": x.contatos.map((c) => c.grupo).join("; "),
    Motivo: x.motivo ?? "",
  }));
}

export function linhasGovernadores(lista: readonly GovernadorClassificado[]): Record<string, string>[] {
  return [...lista]
    .sort((a, b) => porTexto(a.eleito.uf, b.eleito.uf) || porTexto(a.eleito.nomeUrna, b.eleito.nomeUrna))
    .map((x) => ({
      UF: x.eleito.uf,
      "Nome de urna": x.eleito.nomeUrna,
      "Nome completo": x.eleito.nomeCompleto,
      Partido: x.eleito.partido ?? "",
      "Status do mandato": x.eleito.statusMandato,
      "Situação (TSE)": x.eleito.situacaoTse,
      Destino: ROTULO_DESTINO_GOVERNO[x.destino],
      "Grupo no Contatos": x.contatos.map((c) => c.grupo).join("; "),
      Motivo: x.motivo ?? "",
    }));
}

/** Uma linha por candidato; as UFs saem em ordem alfabética. */
export function linhasSegundoTurno(lista: readonly UfSegundoTurno[]): Record<string, string>[] {
  return [...lista]
    .sort((a, b) => porTexto(a.uf, b.uf))
    .flatMap((u) =>
      [...u.candidatos]
        .sort((a, b) => porTexto(a.nomeUrna, b.nomeUrna))
        .map((c) => ({ UF: u.uf, "Nome de urna": c.nomeUrna, Partido: c.partido ?? "", "Status do mandato": c.statusMandato })));
}

const ABAS: readonly { nome: string; destinos: readonly DestinoEleito[] }[] = [
  { nome: "Fica no grupo atual", destinos: ["reeleito", "outra_casa"] },
  { nome: "Grupo novo", destinos: ["novo"] },
  { nome: "A conferir", destinos: ["conferir"] },
];

// Aba vazia ainda leva o cabeçalho: quem abre o arquivo vê que a lista existe e está vazia.
function planilha(linhas: Record<string, string>[], cabecalho: readonly string[]): XLSX.WorkSheet {
  return linhas.length > 0
    ? XLSX.utils.json_to_sheet(linhas, { header: [...cabecalho] })
    : XLSX.utils.aoa_to_sheet([[...cabecalho]]);
}

export function gerarXlsxEleitos(eleicao: ResultadoEleicao): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const aba of ABAS) {
    const linhas = linhasEleitos(eleicao.eleitos.filter((x) => aba.destinos.includes(x.destino)));
    XLSX.utils.book_append_sheet(wb, planilha(linhas, CABECALHO_ELEITOS), aba.nome);
  }
  // Retrato gravado antes dos governadores não traz o campo: as duas abas saem só com o cabeçalho.
  XLSX.utils.book_append_sheet(wb, planilha(linhasGovernadores(eleicao.governadores?.eleitos ?? []), CABECALHO_GOVERNO), "Governadores");
  XLSX.utils.book_append_sheet(wb, planilha(linhasSegundoTurno(eleicao.governadores?.segundoTurno ?? []), CABECALHO_SEGUNDO_TURNO), "Governadores 2º turno");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
