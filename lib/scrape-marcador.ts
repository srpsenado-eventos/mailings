import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { PessoaSite } from "@/lib/types";

/**
 * Marcador em linha própria (GT de 13/11, chefe do EMCFA na composição da Defesa): o marcador que
 * ocupa a linha inteira, comparado por `normalizarTexto`, é o cargo da pessoa da linha de cima, e os
 * dois ficam como a página escreve. Só vale para marcador com letras e mais de uma palavra: "**" (PDF
 * do STJ) e "(convocado)" (TST) seguem só no meio da linha, como antes. Funções puras; este módulo não
 * importa `lib/scrape.ts`, que lhe passa o teste de "parece nome".
 */

/** Motivo da fonte com `marcador.obrigatorio` em que nenhum marcador casou: leitura quebrada, não lista vazia. */
export const MOTIVO_MARCADOR_SEM_PESSOA = "nenhuma pessoa com o marcador obrigatório";

/** Marcador que pode ocupar a linha inteira: tem letras e duas ou mais palavras. */
function valeEmLinhaPropria(marcador: string): boolean {
  const palavras = normalizarTexto(marcador).split(" ").filter((p) => /[a-z]/.test(p));
  return palavras.length >= 2;
}

/** A linha `n` é um marcador inteiro e a de cima tem cara de nome: a pessoa, com a linha como cargo. */
export function pessoaDoMarcadorEmLinhaPropria(
  linhas: readonly string[],
  n: number,
  textos: readonly string[],
  pareceNome: (texto: string) => boolean,
): PessoaSite | undefined {
  if (n === 0) return undefined;
  const linha = linhas[n].trim();
  const alvo = normalizarTexto(linha);
  if (alvo === "" || !textos.some((t) => valeEmLinhaPropria(t) && normalizarTexto(t) === alvo)) return undefined;
  const nome = linhas[n - 1].trim();
  return pareceNome(nome) ? { nome, cargo: linha, origem: "pagina" } : undefined;
}

/** Junta as pessoas na ordem, sem repetir o mesmo nome (comparado por `normalizarNome`). */
export function semNomeRepetido(pessoas: readonly PessoaSite[]): PessoaSite[] {
  const vistos = new Set<string>();
  return pessoas.filter((p) => {
    const chave = normalizarNome(p.nome);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}
