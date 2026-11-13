import type { CheerioAPI } from "cheerio";
import { normalizarTexto } from "@/lib/normalize";
import type { PessoaSite } from "@/lib/types";

/**
 * Página de uma só autoridade (GT de 13/11, comandantes das Forças): a composição é uma pessoa,
 * cujo nome é o título principal da página e cujo cargo é o texto fixo do catálogo. A página só vale
 * quando o texto dela (sem a moldura) traz o cargo do catálogo: é a prova de que é a página certa e
 * de que montou; um `h1` institucional ("Marinha do Brasil") passa por "parece nome" e, sem essa
 * prova, viraria a pessoa e o comandante sairia como possível saída. Sem o cargo, ou sem título com
 * cara de nome, `extrairPessoaUnica` devolve o motivo e `extrairConteudo` lança `ScrapeError`. O nome
 * fica como a página escreve, com tratamento e patente. Função pura; este módulo não importa
 * `lib/scrape.ts`, que o chama de `extrairConteudo` (depois de tirar a moldura) e lhe passa o
 * teste de "parece nome".
 */

/** Opção da fonte: o cargo fixo da autoridade da página. */
export interface OpcoesPessoaUnica {
  cargo: string;
}

/** Motivo da página de autoridade única sem título com cara de nome: leitura quebrada (layout mudou). */
export const MOTIVO_PESSOA_UNICA_SEM_NOME = "página de autoridade única sem o nome";

/** Motivo da página de autoridade única sem o cargo do catálogo no texto: página errada ou que não montou. */
export const MOTIVO_PESSOA_UNICA_SEM_CARGO = "página de autoridade única sem o cargo esperado";

/** A pessoa da página, ou o motivo da leitura quebrada. */
export type ResultadoPessoaUnica = { pessoas: PessoaSite[] } | { motivo: string };

const compactar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/**
 * Exige o cargo do catálogo no texto da página (por `normalizarTexto`, como trecho). Depois, o
 * primeiro `h1` com cara de nome; sem ele, o primeiro `h2`/`h3` com cara de nome. Título que
 * contém o próprio cargo ("Comandante da Marinha do Brasil") nunca é a pessoa.
 */
export function extrairPessoaUnica(
  $: CheerioAPI,
  opcoes: OpcoesPessoaUnica,
  pareceNome: (texto: string) => boolean,
): ResultadoPessoaUnica {
  const cargo = normalizarTexto(opcoes.cargo);
  if (!normalizarTexto(compactar($.root().text())).includes(cargo)) return { motivo: MOTIVO_PESSOA_UNICA_SEM_CARGO };
  const candidato = (seletor: string): string | undefined =>
    $(seletor)
      .toArray()
      .map((el) => compactar($(el).text()))
      .find((texto) => pareceNome(texto) && !normalizarTexto(texto).includes(cargo));
  const nome = candidato("h1") ?? candidato("h2, h3");
  return nome
    ? { pessoas: [{ nome, cargo: opcoes.cargo, origem: "pagina" }] }
    : { motivo: MOTIVO_PESSOA_UNICA_SEM_NOME };
}
