import { lerListaPadrao } from "@/lib/convidados/lista";
import { tratarLista } from "@/lib/convidados/tratar";
import type { LinhaTratada, Valores } from "@/lib/convidados/tipos";
import type { HistoricoDecisoes } from "@/lib/decisoes";
import { lerPlanilha } from "@/lib/planilha";
import type { DeputadoAtual } from "@/lib/types";
import { montarBaseGrupos, montarListaPadrao } from "./montar";

/** Fixture fictícia do critério 4 do §16.7: 3 linhas da lista × 3 deputados do site, 2 em comum. */

export const GRUPO_DEPUTADOS = "Deputados Federais";

const CAMARA = { CEP: "70160900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" };

export const LINHAS_DA_LISTA: Partial<Valores>[] = [
  { NOME: "Ana Exemplo", TRATAMENTO: "Senhora", ENDERECAMENTO: "A Sua Excelência a Senhora", CARGO: "Deputada Federal", COMPLEMENTO: "Anexo 3, Gabinete 531", ...CAMARA },
  { NOME: "J. Exemplo Silva", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal", COMPLEMENTO: "Anexo 4, Gabinete 101", ...CAMARA },
  { NOME: "Carlos Saiu Exemplo", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal", COMPLEMENTO: "Anexo 2, Gabinete 202", ...CAMARA },
];

export const DEPUTADOS_DO_SITE: DeputadoAtual[] = [
  { uf: "DF", nomeParlamentar: "Ana Exemplo", nomeCivil: "Ana Maria Exemplo", sexo: "F", partido: "PX", condicao: "Titular", predio: "3", sala: "531" },
  { uf: "SP", nomeParlamentar: "Zé Exemplo", nomeCivil: "José Exemplo Silva", sexo: "M", partido: "PY", condicao: "Titular", predio: "4", sala: "101" },
  { uf: "MG", nomeParlamentar: "Beatriz Entrou Exemplo", nomeCivil: "Beatriz Entrou Exemplo", sexo: "Feminino", partido: "PZ", condicao: "Suplente", predio: "4", sala: "414" },
];

/** Base e histórico de decisões opcionais, para a coluna "Registro do GT" (§16.6); sem eles a coluna sai vazia. */
export interface ExtrasDaRodada {
  base?: { id: string; nome: string; grupo: string }[];
  decisoes?: HistoricoDecisoes | null;
}

/** Linhas tratadas pela rodada (valores gravados), sem endereços. */
export function linhasTratadas(linhas: readonly Partial<Valores>[] = LINHAS_DA_LISTA, extras: ExtrasDaRodada = {}): LinhaTratada[] {
  const base = extras.base === undefined ? [] : lerPlanilha(montarBaseGrupos(extras.base));
  return tratarLista({
    linhas: lerListaPadrao(montarListaPadrao([...linhas])), grupo: GRUPO_DEPUTADOS, base, enderecos: [], decisoes: extras.decisoes,
  }).linhas;
}

export function deputado(sobrescrita: Partial<DeputadoAtual> & Pick<DeputadoAtual, "nomeParlamentar">): DeputadoAtual {
  return { uf: "DF", nomeCivil: sobrescrita.nomeParlamentar, ...sobrescrita };
}
