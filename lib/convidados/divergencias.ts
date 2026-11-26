import { nomesComAbreviacao } from "@/lib/eleitos-casamento";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { DeputadoAtual } from "@/lib/types";
import { CEP_CAMARA } from "./bairro-cidade-uf";
import { complementoDaCamara, ENDERECO_CAMARA, protocoloDoGenero } from "./camara";
import type { LinhaTratada, Valores } from "./tipos";

/**
 * Divergências entre a lista tratada e o `deputado.xls` do site da Câmara (spec 2026-11-08 §16.5).
 * Planilha de conferência: nada aqui muda a situação da linha na rodada nem o arquivo de importação.
 */

/** `repetida`: linha repetida na própria lista; fica fora do casamento e das contagens, só aparece. */
export type SituacaoDaLinha = "permanece" | "saiu" | "conferir" | "repetida";
export type SituacaoDoSite = "entrou" | "conferir";
export type SituacaoDivergencia = SituacaoDaLinha | SituacaoDoSite;

export const TEXTO_SITUACAO_DIVERGENCIA: Readonly<Record<SituacaoDivergencia, string>> = {
  permanece: "Permanece",
  saiu: "Saiu",
  entrou: "Entrou",
  conferir: "Conferir",
  repetida: "Repetida na própria lista",
};

/** Linha da lista com a situação no site; `deputado` só quando a linha casou um único deputado. */
export interface LinhaDivergencia {
  linha: LinhaTratada;
  situacao: SituacaoDaLinha;
  deputado?: DeputadoAtual;
}

/** Deputado do site que nenhuma linha casou sozinha, já com os valores do modelo montados pelo mapeamento de §15.2. */
export interface EntradaDoSite {
  deputado: DeputadoAtual;
  valores: Valores;
  situacao: SituacaoDoSite;
}

/** `conferir` soma as duas pontas: linhas da lista e deputados do site em homonímia. */
export interface ContagensDivergencias {
  permanece: number;
  saiu: number;
  entrou: number;
  conferir: number;
}

export interface Divergencias {
  linhas: LinhaDivergencia[];
  entraram: EntradaDoSite[];
  contagens: ContagensDivergencias;
}

/** Primeira letra do sexo da planilha ("F", "Feminino", "M", "Masculino"); outro texto não decide. */
export function generoDoSexo(sexo: string | undefined): "f" | "m" | undefined {
  const inicial = normalizarTexto(sexo ?? "").charAt(0);
  if (inicial === "f") return "f";
  if (inicial === "m") return "m";
  return undefined;
}

/** Valores do modelo para um deputado do site (§15.2): nome parlamentar, protocolo pelo sexo e o endereço da Câmara. */
export function valoresDoSite(d: DeputadoAtual): Valores {
  return {
    NOME: d.nomeParlamentar,
    ...protocoloDoGenero(generoDoSexo(d.sexo)),
    CEP: CEP_CAMARA,
    LOGRADOURO: ENDERECO_CAMARA.LOGRADOURO,
    NUMERO: ENDERECO_CAMARA.NUMERO,
    COMPLEMENTO: complementoDaCamara(d.predio ?? "", d.sala ?? ""),
    BAIRRO: ENDERECO_CAMARA.BAIRRO,
    CIDADE: ENDERECO_CAMARA.CIDADE,
    UF: ENDERECO_CAMARA.UF,
  };
}

/** Nome da lista, por `normalizarNome`, igual ao nome parlamentar ou ao nome civil do site (qualquer UF). */
export function casaExato(nomeDaLista: string, d: DeputadoAtual): boolean {
  const alvo = normalizarNome(nomeDaLista);
  if (alvo === "") return false;
  return alvo === normalizarNome(d.nomeParlamentar) || alvo === normalizarNome(d.nomeCivil);
}

/** Nome civil do site casado por abreviação (regra de `deputadosEmExercicio`, spec 2026-10-30 §4.3.2, sem a UF). */
export function casaPorAbreviacao(nomeDaLista: string, d: DeputadoAtual): boolean {
  return normalizarNome(nomeDaLista) !== "" && nomesComAbreviacao(d.nomeCivil, nomeDaLista);
}

/** A linha casa o deputado pelo nome exato ou, na falta, pela abreviação do nome civil. */
export function casaDeputado(nomeDaLista: string, d: DeputadoAtual): boolean {
  return casaExato(nomeDaLista, d) || casaPorAbreviacao(nomeDaLista, d);
}

const indicesQueCasam = (
  nome: string,
  deputados: readonly DeputadoAtual[],
  casa: (nome: string, d: DeputadoAtual) => boolean,
): number[] => deputados.map((d, j) => (casa(nome, d) ? j : -1)).filter((j) => j >= 0);

/**
 * Para cada linha, os índices dos deputados que ela casa: primeiro pelo nome exato (parlamentar ou
 * civil); a abreviação do nome civil só é tentada quando nenhum casou pelo nome exato. Linha
 * repetida na própria lista não casa ninguém.
 */
function casamentos(linhas: readonly LinhaTratada[], deputados: readonly DeputadoAtual[]): number[][] {
  return linhas.map((l) => {
    if (l.situacao === "repetida") return [];
    const exatos = indicesQueCasam(l.gravado.NOME, deputados, casaExato);
    return exatos.length > 0 ? exatos : indicesQueCasam(l.gravado.NOME, deputados, casaPorAbreviacao);
  });
}

/** Para cada deputado, os índices das linhas que o casam (transposta de `casamentos`). */
function casadosPor(porLinha: readonly (readonly number[])[], total: number): number[][] {
  return Array.from({ length: total }, (_, j) =>
    porLinha.flatMap((js, i) => (js.includes(j) ? [i] : [])),
  );
}

function situacaoDaLinha(candidatos: readonly number[], porDeputado: readonly (readonly number[])[]): SituacaoDaLinha {
  if (candidatos.length === 0) return "saiu";
  if (candidatos.length === 1 && porDeputado[candidatos[0]].length === 1) return "permanece";
  return "conferir";
}

function classificarLinhas(
  linhas: readonly LinhaTratada[],
  deputados: readonly DeputadoAtual[],
  porLinha: readonly (readonly number[])[],
  porDeputado: readonly (readonly number[])[],
): LinhaDivergencia[] {
  return linhas.map((linha, i) => {
    if (linha.situacao === "repetida") return { linha, situacao: "repetida" };
    const candidatos = porLinha[i];
    const situacao = situacaoDaLinha(candidatos, porDeputado);
    const deputado = candidatos.length === 1 ? deputados[candidatos[0]] : undefined;
    return deputado ? { linha, situacao, deputado } : { linha, situacao };
  });
}

function classificarSite(
  deputados: readonly DeputadoAtual[],
  porLinha: readonly (readonly number[])[],
  porDeputado: readonly (readonly number[])[],
): EntradaDoSite[] {
  return deputados.flatMap((deputado, j) => {
    const linhas = porDeputado[j];
    if (linhas.length === 1 && porLinha[linhas[0]].length === 1) return [];
    const situacao: SituacaoDoSite = linhas.length === 0 ? "entrou" : "conferir";
    return [{ deputado, valores: valoresDoSite(deputado), situacao }];
  });
}

function contar(linhas: readonly LinhaDivergencia[], entraram: readonly EntradaDoSite[]): ContagensDivergencias {
  const quantas = <T extends { situacao: string }>(itens: readonly T[], s: string): number =>
    itens.filter((i) => i.situacao === s).length;
  return {
    permanece: quantas(linhas, "permanece"),
    saiu: quantas(linhas, "saiu"),
    entrou: quantas(entraram, "entrou"),
    conferir: quantas(linhas, "conferir") + quantas(entraram, "conferir"),
  };
}

/**
 * "Permanece" é a linha que casou um só deputado, e só ela; "Saiu" é a linha que não casou nenhum;
 * "Entrou" é o deputado que nenhuma linha casou. Linha que casa mais de um deputado, ou deputado
 * casado por mais de uma linha, é "Conferir" (homônimo) nas duas pontas. A ordem da lista é mantida;
 * os deputados saem na ordem da planilha do site.
 */
export function compararComSite(linhas: readonly LinhaTratada[], deputados: readonly DeputadoAtual[]): Divergencias {
  const porLinha = casamentos(linhas, deputados);
  const porDeputado = casadosPor(porLinha, deputados.length);
  const classificadas = classificarLinhas(linhas, deputados, porLinha, porDeputado);
  const entraram = classificarSite(deputados, porLinha, porDeputado);
  return { linhas: classificadas, entraram, contagens: contar(classificadas, entraram) };
}
