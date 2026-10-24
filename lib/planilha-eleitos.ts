import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";
import { listarEntreAspas } from "@/lib/texto";
import type { CasaLegislativa, DeputadoAtual, EleitoPlanilha, GovernadorPlanilha, PlanilhaGovernadores } from "@/lib/types";

/**
 * Leitura, no navegador, das planilhas de `GT Posse/Eleitos 2026` (spec 2026-10-05 §2).
 * Mesmo padrão de `lib/planilha-enderecos.ts`: cabeçalho casado normalizado e coluna
 * ausente como erro claro. O tipo é reconhecido pela aba e pelas colunas, não pelo nome do arquivo:
 * - aba "Em exercício" → deputados atuais;
 * - aba "Eleitos 1º turno" (layout antigo do gerador) ou aba "Eleitos" com a coluna "Turno"
 *   (layout desde 24/10/2026) → governadores, com a aba "2º turno" opcional;
 * - aba "Eleitos" sem "Turno" → senadores (com "1º suplente") ou deputados federais eleitos.
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
    super("Planilha não reconhecida: esperada a aba \"Eleitos\" (senadores ou deputados eleitos; governadores, quando tem a coluna \"Turno\"), \"Em exercício\" (deputados atuais) ou \"Eleitos 1º turno\" (governadores, layout antigo).");
    this.name = "PlanilhaEleicaoDesconhecidaError";
  }
}

const ROTULO_TIPO: Record<ArquivoEleicao["tipo"], string> = {
  senado: "senadores eleitos",
  camara: "deputados federais eleitos",
  atuais: "deputados federais em exercício",
  governo: "governadores eleitos",
};

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
type ColunasGoverno = Record<keyof typeof COLUNAS_GOVERNO, string>;
const OBRIGATORIAS_GOVERNO = ["uf", "nomeUrna", "nomeCompleto", "situacaoTse", "statusMandato"] as const;

/** Coluna que só a planilha de senadores tem. */
const MARCA_SENADO = normalizarTexto("1º suplente");
/** Coluna que só a planilha de governadores tem na aba "Eleitos" (layout do gerador do GT desde 24/10/2026). */
const MARCA_GOVERNO = normalizarTexto("Turno");
/**
 * Na aba "2º turno" do layout novo a situação vem sufixada: vale a do 2º turno quando a coluna existe,
 * senão a do 1º turno; o layout antigo mantém "Situação (TSE)". A primeira coluna presente é a usada.
 */
const COLUNAS_SITUACAO_SEGUNDO_TURNO = ["Situação (TSE) 2º turno", "Situação (TSE) (1º turno)", "Situação (TSE)"].map(normalizarTexto);

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

function lerGovernadores(ws: XLSX.WorkSheet, colunas: ColunasGoverno = COLUNAS_GOVERNO): GovernadorPlanilha[] {
  return lerTabela(ws, colunas, OBRIGATORIAS_GOVERNO)
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

/**
 * A aba "2º turno" lista os dois candidatos de cada UF que foi ao 2º turno, e no layout novo continua
 * listando-os depois que o eleito entra na aba "Eleitos". UF pendente é só a que ainda não tem eleito
 * (decisão do Clovis, 24/10/2026); o restante do app segue recebendo `segundoTurno` como lista de pendentes.
 */
function lerSegundoTurno(ws: XLSX.WorkSheet, ufsEleitas: ReadonlySet<string>): GovernadorPlanilha[] {
  if (abaVazia(ws)) return [];
  const idx = cabecalhos(ws);
  const situacaoTse = COLUNAS_SITUACAO_SEGUNDO_TURNO.find((c) => idx.has(c)) ?? COLUNAS_GOVERNO.situacaoTse;
  return lerGovernadores(ws, { ...COLUNAS_GOVERNO, situacaoTse }).filter((g) => !ufsEleitas.has(g.uf));
}

function lerArquivoGoverno(eleitosAba: XLSX.WorkSheet, segunda: XLSX.WorkSheet | undefined): ArquivoEleicao {
  const eleitos = lerGovernadores(eleitosAba);
  const ufsEleitas = new Set(eleitos.map((g) => g.uf));
  return {
    tipo: "governo",
    governadores: { eleitos, segundoTurno: segunda ? lerSegundoTurno(segunda, ufsEleitas) : [] },
  };
}

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

  const segundoTurno = aba(wb, normalizarTexto("2º turno"));
  const primeiroTurno = aba(wb, normalizarTexto("Eleitos 1º turno"));
  if (primeiroTurno) return lerArquivoGoverno(primeiroTurno, segundoTurno);

  const eleitosAba = aba(wb, "eleitos");
  if (!eleitosAba) throw new PlanilhaEleicaoDesconhecidaError();
  const colunas = cabecalhos(eleitosAba);
  if (colunas.has(MARCA_GOVERNO)) return lerArquivoGoverno(eleitosAba, segundoTurno);

  const casa: CasaLegislativa = colunas.has(MARCA_SENADO) ? "senado" : "camara";
  const eleitos = lerTabela(eleitosAba, COLUNAS_ELEITOS, OBRIGATORIAS_ELEITOS)
    .filter((l) => l.nomeUrna || l.nomeCompleto)
    .map((l): EleitoPlanilha => ({
      casa, uf: l.uf.toUpperCase(), nomeUrna: l.nomeUrna, nomeCompleto: l.nomeCompleto,
      partido: opcional(l.partido), situacaoTse: l.situacaoTse, statusMandato: l.statusMandato,
      baseStatus: opcional(l.baseStatus), genero: opcional(l.genero), nascimento: opcional(l.nascimento),
    }));
  return casa === "senado" ? { tipo: "senado", eleitos } : { tipo: "camara", eleitos };
}

/**
 * Numa mesma seleção, dois arquivos reconhecidos como o mesmo tipo são contradição, não troca (em 24/10/2026
 * a planilha de governadores regerada foi lida como Câmara e escondeu o cartão dos deputados eleitos):
 * nenhum deles entra, e a mensagem diz quais foram e como foram lidos. Entre seleções distintas, o arquivo
 * novo substitui o antigo do mesmo tipo (`juntarArquivosEleicao`).
 */
export function separarColisoesDeTipo(lidos: readonly ArquivoEleicaoLido[]): { aceitos: ArquivoEleicaoLido[]; colisoes: string[] } {
  const porTipo = new Map<ArquivoEleicao["tipo"], ArquivoEleicaoLido[]>();
  for (const l of lidos) porTipo.set(l.arquivo.tipo, [...(porTipo.get(l.arquivo.tipo) ?? []), l]);
  const repetidos = [...porTipo].filter(([, doTipo]) => doTipo.length > 1);
  const tiposRepetidos = new Set(repetidos.map(([tipo]) => tipo));
  return {
    aceitos: lidos.filter((l) => !tiposRepetidos.has(l.arquivo.tipo)),
    colisoes: repetidos.map(([tipo, doTipo]) => `${listarEntreAspas(doTipo.map((l) => l.nome))} foram reconhecidos como ${ROTULO_TIPO[tipo]}; escolha um deles.`),
  };
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
  if (a.tipo === "senado" || a.tipo === "camara") return `${a.eleitos.length} ${ROTULO_TIPO[a.tipo]}`;
  if (a.tipo === "atuais") return `${a.deputados.length} ${ROTULO_TIPO.atuais}`;
  const { eleitos, segundoTurno } = a.governadores;
  const base = `${eleitos.length} ${ROTULO_TIPO.governo}`;
  if (segundoTurno.length === 0) return base;
  return `${base} · ${new Set(segundoTurno.map((g) => g.uf)).size} UFs no 2º turno`;
}
