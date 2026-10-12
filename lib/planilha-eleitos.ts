import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";
import type { CasaLegislativa, DeputadoAtual, EleitoPlanilha, GovernadorPlanilha, PlanilhaGovernadores } from "@/lib/types";

/**
 * Leitura, no navegador, das planilhas de `GT Posse/Eleitos 2026` (spec 2026-10-05 §2).
 * Mesmo padrão de `lib/planilha-enderecos.ts`: cabeçalho casado normalizado e coluna
 * ausente como erro claro. O tipo é reconhecido pela aba e pelas colunas, não pelo nome do arquivo.
 */
export type ArquivoEleicao =
  | { tipo: "senado"; eleitos: EleitoPlanilha[] }
  | { tipo: "camara"; eleitos: EleitoPlanilha[] }
  | { tipo: "atuais"; deputados: DeputadoAtual[] }
  | { tipo: "governo"; governadores: PlanilhaGovernadores };

export interface ArquivoEleicaoLido {
  nome: string;
  arquivo: ArquivoEleicao;
}

export class PlanilhaEleicaoDesconhecidaError extends Error {
  constructor() {
    super("Planilha não reconhecida: esperada a aba \"Eleitos\" (senadores ou deputados eleitos), \"Em exercício\" (deputados atuais) ou \"Eleitos 1º turno\" (governadores).");
    this.name = "PlanilhaEleicaoDesconhecidaError";
  }
}

const COLUNAS_ELEITOS = {
  uf: "uf", nomeUrna: "nome de urna", nomeCompleto: "nome completo", partido: "partido",
  situacaoTse: "situacao (tse)", statusMandato: "status do mandato", baseStatus: "base do status",
  genero: "genero (tse)", nascimento: "nascimento",
} as const;
const OBRIGATORIAS_ELEITOS = ["uf", "nomeUrna", "nomeCompleto", "situacaoTse", "statusMandato"] as const;

const COLUNAS_ATUAIS = {
  uf: "uf", nomeParlamentar: "nome parlamentar", nomeCivil: "nome civil", partido: "partido", sexo: "sexo",
  condicao: "condicao eleitoral", eleicao2026: "eleicao 2026 (resumo)", email: "e-mail", predio: "predio",
  sala: "sala", telefone: "telefone", idCamara: "id camara",
} as const;
const OBRIGATORIAS_ATUAIS = ["uf", "nomeParlamentar", "nomeCivil"] as const;

const COLUNAS_GOVERNO = {
  uf: "uf", nomeUrna: "nome de urna", nomeCompleto: "nome completo", partido: "partido",
  situacaoTse: "situacao (tse)", statusMandato: "status do mandato", baseStatus: "base do status",
  genero: "genero (tse)", vice: "vice na chapa",
} as const;
const OBRIGATORIAS_GOVERNO = ["uf", "nomeUrna", "nomeCompleto", "situacaoTse", "statusMandato"] as const;

/** Coluna que só a planilha de senadores tem. */
const MARCA_SENADO = normalizarTexto("1º suplente");

function cabecalhos(ws: XLSX.WorkSheet): Map<string, number> {
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const primeira = (linhas[0] ?? []).map((c) => String(c ?? ""));
  return new Map(primeira.map((c, i) => [normalizarTexto(c), i]));
}

function lerTabela<K extends string>(
  ws: XLSX.WorkSheet,
  mapa: Record<K, string>,
  obrigatorias: readonly string[]
): Record<K, string>[] {
  const idx = cabecalhos(ws);
  const faltantes = obrigatorias.filter((c) => !idx.has(mapa[c as K])).map((c) => mapa[c as K]);
  if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);
  const brutas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }).slice(1);
  const chaves = Object.keys(mapa) as K[];
  return brutas.map((linha) =>
    Object.fromEntries(
      chaves.map((c) => {
        const i = idx.get(mapa[c]);
        return [c, i === undefined ? "" : String(linha[i] ?? "").trim()];
      }),
    ) as Record<K, string>,
  );
}

const opcional = (v: string): string | undefined => (v.length > 0 ? v : undefined);

function aba(wb: XLSX.WorkBook, alvo: string): XLSX.WorkSheet | undefined {
  const nome = wb.SheetNames.find((n) => normalizarTexto(n) === alvo);
  return nome ? wb.Sheets[nome] : undefined;
}

function lerGovernadores(ws: XLSX.WorkSheet): GovernadorPlanilha[] {
  return lerTabela(ws, COLUNAS_GOVERNO, OBRIGATORIAS_GOVERNO)
    .filter((l) => l.nomeUrna || l.nomeCompleto)
    .map((l): GovernadorPlanilha => ({
      uf: l.uf.toUpperCase(), nomeUrna: l.nomeUrna, nomeCompleto: l.nomeCompleto, situacaoTse: l.situacaoTse,
      statusMandato: l.statusMandato,
      ...Object.fromEntries(
        ([["partido", l.partido], ["baseStatus", l.baseStatus], ["genero", l.genero], ["vice", l.vice]] as const)
          .filter(([, v]) => v.length > 0),
      ),
    }));
}

const abaVazia = (ws: XLSX.WorkSheet): boolean => XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }).length <= 1;

export function lerPlanilhaEleicao(buffer: ArrayBuffer): ArquivoEleicao {
  const wb = XLSX.read(buffer, { type: "array" });

  const atuais = aba(wb, "em exercicio");
  if (atuais) {
    const deputados = lerTabela(atuais, COLUNAS_ATUAIS, OBRIGATORIAS_ATUAIS)
      .filter((l) => l.nomeParlamentar || l.nomeCivil)
      .map((l): DeputadoAtual => ({
        uf: l.uf.toUpperCase(), nomeParlamentar: l.nomeParlamentar, nomeCivil: l.nomeCivil,
        partido: opcional(l.partido), sexo: opcional(l.sexo), condicao: opcional(l.condicao),
        eleicao2026: opcional(l.eleicao2026), email: opcional(l.email), predio: opcional(l.predio),
        sala: opcional(l.sala), telefone: opcional(l.telefone), idCamara: opcional(l.idCamara),
      }));
    return { tipo: "atuais", deputados };
  }

  const primeiroTurno = aba(wb, normalizarTexto("Eleitos 1º turno"));
  if (primeiroTurno) {
    const segunda = aba(wb, normalizarTexto("2º turno"));
    return {
      tipo: "governo",
      governadores: {
        eleitos: lerGovernadores(primeiroTurno),
        segundoTurno: segunda && !abaVazia(segunda) ? lerGovernadores(segunda) : [],
      },
    };
  }

  const eleitosAba = aba(wb, "eleitos");
  if (!eleitosAba) throw new PlanilhaEleicaoDesconhecidaError();
  const casa: CasaLegislativa = cabecalhos(eleitosAba).has(MARCA_SENADO) ? "senado" : "camara";
  const eleitos = lerTabela(eleitosAba, COLUNAS_ELEITOS, OBRIGATORIAS_ELEITOS)
    .filter((l) => l.nomeUrna || l.nomeCompleto)
    .map((l): EleitoPlanilha => ({
      casa, uf: l.uf.toUpperCase(), nomeUrna: l.nomeUrna, nomeCompleto: l.nomeCompleto,
      partido: opcional(l.partido), situacaoTse: l.situacaoTse, statusMandato: l.statusMandato,
      baseStatus: opcional(l.baseStatus), genero: opcional(l.genero), nascimento: opcional(l.nascimento),
    }));
  return casa === "senado" ? { tipo: "senado", eleitos } : { tipo: "camara", eleitos };
}

/** Junta os arquivos lidos; vale o último de cada tipo (trocar o arquivo não soma em dobro). */
export function juntarArquivosEleicao(lidos: readonly ArquivoEleicaoLido[]): {
  eleitos: EleitoPlanilha[];
  deputadosAtuais?: DeputadoAtual[];
  governadores?: PlanilhaGovernadores;
  arquivosEleicao: string[];
} {
  const ultimo = new Map<ArquivoEleicao["tipo"], ArquivoEleicaoLido>();
  for (const l of lidos) ultimo.set(l.arquivo.tipo, l);
  const escolhidos = [...ultimo.values()];
  const eleitos = escolhidos.flatMap((l) => (l.arquivo.tipo === "atuais" || l.arquivo.tipo === "governo" ? [] : l.arquivo.eleitos));
  const atuais = ultimo.get("atuais");
  const governo = ultimo.get("governo");
  return {
    eleitos,
    ...(governo && governo.arquivo.tipo === "governo" ? { governadores: governo.arquivo.governadores } : {}),
    ...(atuais && atuais.arquivo.tipo === "atuais" ? { deputadosAtuais: atuais.arquivo.deputados } : {}),
    arquivosEleicao: escolhidos.map((l) => l.nome),
  };
}

export function resumoArquivoEleicao(a: ArquivoEleicao): string {
  if (a.tipo === "senado") return `${a.eleitos.length} senadores eleitos`;
  if (a.tipo === "camara") return `${a.eleitos.length} deputados federais eleitos`;
  if (a.tipo === "atuais") return `${a.deputados.length} deputados federais em exercício`;
  const { eleitos, segundoTurno } = a.governadores;
  const base = `${eleitos.length} governadores eleitos`;
  if (segundoTurno.length === 0) return base;
  return `${base} · ${new Set(segundoTurno.map((g) => g.uf)).size} UFs no 2º turno`;
}
