import type { CheerioAPI } from "cheerio";
import { normalizarTexto } from "@/lib/normalize";
import type { PessoaSite } from "@/lib/types";

/**
 * Página de uma só autoridade (GT de 13/11, comandantes das Forças): a composição é uma pessoa,
 * cujo nome é o título principal da página e cujo cargo é o texto fixo do catálogo; sem candidato a
 * lista sai vazia e `extrairConteudo` lança `ScrapeError` (`MOTIVO_PESSOA_UNICA_SEM_NOME`). O nome fica
 * como a página escreve, com tratamento e patente. Função pura; este módulo não importa
 * `lib/scrape.ts`, que o chama de `extrairConteudo` (depois de tirar a moldura) e lhe passa o
 * teste de "parece nome".
 */

/** Opção da fonte: o cargo fixo da autoridade da página. */
export interface OpcoesPessoaUnica {
  cargo: string;
}

/** Motivo da página de autoridade única sem título com cara de nome: leitura quebrada (layout mudou). */
export const MOTIVO_PESSOA_UNICA_SEM_NOME = "página de autoridade única sem o nome";

const compactar =(texto: string): string => texto.replace(/\s+/g, " ").trim();

/**
 * O primeiro `h1` com cara de nome; sem ele, o primeiro `h2`/`h3` com cara de nome. Título que
 * contém o próprio cargo ("Comandante da Marinha do Brasil") nunca é a pessoa. Nenhum: `[]`.
 */
export function extrairPessoaUnica(
  $: CheerioAPI,
  opcoes: OpcoesPessoaUnica,
  pareceNome: (texto: string) => boolean,
): PessoaSite[] {
  const cargo = normalizarTexto(opcoes.cargo);
  const candidato = (seletor: string): string | undefined =>
    $(seletor)
      .toArray()
      .map((el) => compactar($(el).text()))
      .find((texto) => pareceNome(texto) && !normalizarTexto(texto).includes(cargo));
  const nome = candidato("h1") ?? candidato("h2, h3");
  return nome ? [{ nome, cargo: opcoes.cargo, origem: "pagina" }] : [];
}
