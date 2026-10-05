import * as XLSX from "xlsx";
import type { CasaLegislativa, DestinoEleito, EleitoClassificado, ResultadoEleicao } from "@/lib/types";

/** Planilha "Eleitos 2026" do painel (spec 2026-10-05 §5): a lista para o cadastro, por destino. */
export const CABECALHO_ELEITOS = [
  "Casa", "UF", "Nome de urna", "Nome completo", "Partido", "Status do mandato", "Situação (TSE)", "Destino", "Grupo no Contatos", "Motivo",
] as const;

const NOME_CASA: Record<CasaLegislativa, string> = { senado: "Senado Federal", camara: "Câmara dos Deputados" };
const ORDEM_CASA: Record<CasaLegislativa, number> = { senado: 0, camara: 1 };

const ROTULO_DESTINO: Record<DestinoEleito, string> = {
  reeleito: "Reeleito — fica no grupo atual",
  outra_casa: "Eleito para a outra Casa — fica no grupo atual (Ata 14)",
  novo: "Mandato novo — grupo novo",
  conferir: "A conferir",
};

function ordenar(lista: readonly EleitoClassificado[]): EleitoClassificado[] {
  return [...lista].sort((a, b) =>
    ORDEM_CASA[a.eleito.casa] - ORDEM_CASA[b.eleito.casa]
    || a.eleito.uf.localeCompare(b.eleito.uf, "pt-BR")
    || a.eleito.nomeUrna.localeCompare(b.eleito.nomeUrna, "pt-BR"));
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

const ABAS: readonly { nome: string; destinos: readonly DestinoEleito[] }[] = [
  { nome: "Fica no grupo atual", destinos: ["reeleito", "outra_casa"] },
  { nome: "Grupo novo", destinos: ["novo"] },
  { nome: "A conferir", destinos: ["conferir"] },
];

export function gerarXlsxEleitos(eleicao: ResultadoEleicao): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const aba of ABAS) {
    const linhas = linhasEleitos(eleicao.eleitos.filter((x) => aba.destinos.includes(x.destino)));
    // Aba vazia ainda leva o cabeçalho: quem abre o arquivo vê que a lista existe e está vazia.
    const ws = linhas.length > 0
      ? XLSX.utils.json_to_sheet(linhas, { header: [...CABECALHO_ELEITOS] })
      : XLSX.utils.aoa_to_sheet([[...CABECALHO_ELEITOS]]);
    XLSX.utils.book_append_sheet(wb, ws, aba.nome);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
