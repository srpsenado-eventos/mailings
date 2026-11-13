import { REGRAS_NOME, type RegraNome } from "@/data/regras-nome";
import { chaveToken, mesmaGrafiaDeNome, PATENTES_EM_TOKENS, TRATAMENTOS_EM_TOKENS } from "@/lib/normalize";
import { nomeEsperadoComPrefixo, semTratamentosProibidos } from "@/lib/tratamento";
import type { ContatoPlanilha } from "@/lib/types";

/** O prefixo (em tokens) que começa em `tokens[i]`, se houver. */
function prefixoEm(tokens: readonly string[], i: number, prefixos: readonly string[][]): string[] | undefined {
  return prefixos.find((prefixo) => i + prefixo.length <= tokens.length && prefixo.every((parte, j) => tokens[i + j] === parte));
}

/**
 * Os tokens de patente no início do nome, na forma `chaveToken` e unidos por espaço, depois dos
 * tratamentos ("Ministro", "Dr."): "Gen. Ex. X" → "gen ex"; "Ministro Alte Esq X" → "alte esq".
 * Sem patente, devolve "".
 */
export function patenteDoNome(nome: string): string {
  const tokens = nome.split(/\s+/).filter(Boolean).map(chaveToken);
  const patente: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const daPatente = prefixoEm(tokens, i, PATENTES_EM_TOKENS);
    const achado = daPatente ?? prefixoEm(tokens, i, TRATAMENTOS_EM_TOKENS);
    if (!achado) break;
    if (daPatente) patente.push(...daPatente);
    i += achado.length;
  }
  return patente.join(" ");
}

/** Os dois nomes levam a mesma patente, escrita da mesma forma (por extenso × abreviada não é igual). */
export function mesmaPatente(a: string, b: string): boolean {
  return patenteDoNome(a) === patenteDoNome(b);
}

/**
 * O nome que o contato deve ter a partir do nome da página: sem os tratamentos proibidos do grupo
 * ("Dra." no STM) e com o prefixo do presidente, quando a regra vale. A patente fica como o site a escreve.
 */
export function nomeEsperadoDaPagina(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
  nomeDaPagina: string,
  regras: Readonly<Record<string, RegraNome>> = REGRAS_NOME,
): string {
  const proibidos = (grupoCanonico ? regras[grupoCanonico]?.tratamentosProibidos : undefined) ?? [];
  return nomeEsperadoComPrefixo(contato, grupoCanonico, semTratamentosProibidos(nomeDaPagina, proibidos), regras);
}

/** A regra de escrita do nome do grupo canônico, se houver. */
export function regraDoGrupo(grupoCanonico: string | undefined): RegraNome | undefined {
  return grupoCanonico ? REGRAS_NOME[grupoCanonico] : undefined;
}

/** O nome do cadastro confere com o esperado: mesma grafia e, nos grupos com a regra, a mesma patente. */
export function nomeConfereComPatente(planilha: string, esperado: string, regra: RegraNome | undefined): boolean {
  return mesmaGrafiaDeNome(planilha, esperado) && (!regra?.patenteComoNoSite || mesmaPatente(planilha, esperado));
}
