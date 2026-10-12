import { pontuarPessoa } from "@/lib/match";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { siglaDaUf } from "@/lib/uf";
import type { CasaLegislativa, ContatoDoEleito, ContatoPlanilha, DeputadoAtual, EleitoPlanilha } from "@/lib/types";

/** Casamento de pessoa e de grupo compartilhado pelos eixos de eleitos e de governadores. Módulo-folha: não importa os dois. */

export const MOTIVO_AMBIGUO = "Nome casa mais de um contato do Contatos";

export function casaDoGrupo(grupo: string): { casa: CasaLegislativa; eleitos: boolean } | undefined {
  const g = normalizarTexto(grupo);
  if (g.startsWith("ex-") || g.startsWith("ex ")) return undefined;
  if (g.includes("eleit")) {
    if (g.includes("senador")) return { casa: "senado", eleitos: true };
    if (g.includes("deputad")) return { casa: "camara", eleitos: true };
    return undefined;
  }
  if (g.includes("senadores")) return { casa: "senado", eleitos: false };
  if (g.includes("deputados federais")) return { casa: "camara", eleitos: false };
  return undefined;
}

export function casaPessoa(
  contato: ContatoPlanilha,
  e: { uf: string; nomeUrna: string; nomeCompleto: string },
  ufDoContato: string | undefined = siglaDaUf(contato.departamento),
): boolean {
  const uf = ufDoContato;
  if (uf && uf !== e.uf.toUpperCase()) return false;
  const nomes = [e.nomeUrna, e.nomeCompleto].filter((n) => n.trim().length > 0);
  const alvo = normalizarNome(contato.nome);
  return nomes.some((n) => normalizarNome(n) === alvo || pontuarPessoa(contato.nome, n) >= 1);
}

/** O deputado em exercício que é a pessoa (UF + nome civil ou de urna), se houver. */
export function constaEntreAtuaisPor(
  uf: string,
  nomeCompleto: string,
  nomeUrna: string,
  atuais: readonly DeputadoAtual[],
): DeputadoAtual | undefined {
  const civil = normalizarNome(nomeCompleto);
  const urna = normalizarNome(nomeUrna);
  return atuais.find(
    (d) => d.uf.toUpperCase() === uf.toUpperCase()
      && (normalizarNome(d.nomeCivil) === civil || normalizarNome(d.nomeParlamentar) === urna),
  );
}

export const constaEntreAtuais = (e: EleitoPlanilha, atuais: readonly DeputadoAtual[]): boolean =>
  constaEntreAtuaisPor(e.uf, e.nomeCompleto, e.nomeUrna, atuais) !== undefined;

export const chavePessoa = (c: ContatoPlanilha): string => c.id ?? normalizarNome(c.nome);

export const referencia = (a: { grupo: string; contato: ContatoPlanilha }): ContatoDoEleito => ({ grupo: a.grupo, nome: a.contato.nome, ...(a.contato.id ? { id: a.contato.id } : {}) });

