import type * as cheerio from "cheerio";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { PessoaSite } from "@/lib/types";

/**
 * Nome em destaque (spec 2026-10-30 §3.1, fonte `nomeEmDestaque`, hoje só o STJ): as partes
 * do nome em negrito no bloco de cada pessoa. Funções puras usadas por `extrairConteudo`
 * (`lib/scrape.ts`); este módulo não importa `lib/scrape.ts`, que lhe passa os separadores.
 */

type RaizCheerio = ReturnType<typeof cheerio.load>;

/** Partes em negrito de cada linha, pela chave da linha (`chaveDaLinha`). */
export type DestaquesPorLinha = ReadonlyMap<string, string>;

/** Chave que liga uma linha da página ao texto do bloco de onde ela saiu. */
function chaveDaLinha(texto: string): string {
  return normalizarTexto(texto.replace(/\s+/g, " ").trim());
}

/**
 * Partes em negrito do bloco de cada linha. Colhido ANTES de `extrairLinhas`, que muda o DOM.
 * `tagsSeparar` são as tags que viram quebra de linha na extração. Só o bloco-folha conta
 * (separador sem outro separador nem `<br>` dentro): o texto dele é exatamente uma linha. No
 * STJ é o `a` de `span.clsMinistrosNome`: "<b>Sérgio</b> Luíz <b>Kukina</b>" dá "Sérgio
 * Kukina". Negrito dentro de negrito conta uma vez, pelo de fora.
 */
export function colherDestaquesPorLinha($: RaizCheerio, tagsSeparar: string): DestaquesPorLinha {
  const porLinha = new Map<string, string>();
  $(tagsSeparar).each((_, el) => {
    const bloco = $(el);
    if (bloco.find(tagsSeparar).length > 0 || bloco.find("br").length > 0) return;
    const negritos = bloco.find("b, strong");
    const partes = negritos
      .filter((_, negrito) => negritos.has(negrito).length === 0)
      .map((_, negrito) => $(negrito).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((parte) => parte.length > 0);
    if (partes.length === 0) return;
    const chave = chaveDaLinha(bloco.text());
    if (chave && !porLinha.has(chave)) porLinha.set(chave, partes.join(" "));
  });
  return porLinha;
}

/**
 * O destaque da linha vale só quando é parte do nome extraído: todo token dele está no nome.
 * Negrito no cargo ou em outro trecho da linha não vira nome esperado.
 */
export function destaqueDoNome(nome: string, destaque: string | undefined): string | undefined {
  if (destaque === undefined) return undefined;
  const tokensNome = new Set(normalizarNome(nome).split(" "));
  const tokensDestaque = normalizarNome(destaque).split(" ").filter(Boolean);
  return tokensDestaque.length > 0 && tokensDestaque.every((t) => tokensNome.has(t)) ? destaque : undefined;
}

/** A pessoa com o `nomeDestaque` da linha de onde saiu, quando há. Não muta a pessoa. */
export function comDestaque(pessoa: PessoaSite, linha: string, destaques?: DestaquesPorLinha): PessoaSite {
  const nomeDestaque = destaqueDoNome(pessoa.nome, destaques?.get(chaveDaLinha(linha)));
  return nomeDestaque === undefined ? pessoa : { ...pessoa, nomeDestaque };
}
