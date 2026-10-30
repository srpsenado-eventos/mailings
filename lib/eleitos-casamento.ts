import { pontuarPessoa } from "@/lib/match";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { siglaDaUf } from "@/lib/uf";
import type { CasaLegislativa, ContatoDoEleito, ContatoPlanilha, DeputadoAtual } from "@/lib/types";

/** Casamento de pessoa e de grupo compartilhado pelos eixos de eleitos e de governadores. Módulo-folha: não importa os dois. */

export const MOTIVO_AMBIGUO = "Nome casa mais de um contato do Contatos";
export const MOTIVO_HOMONIMO_EM_EXERCICIO = "Mais de um deputado em exercício casa este nome: conferir";

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

/** Partes do nome já normalizado, sem pontuação ("a." vira "a"). Ligações ("de", "da"...) ficam: contam como parte. */
function partesDoNome(nome: string): string[] {
  return normalizarNome(nome).split(" ").map((p) => p.replace(/[.,;:]/g, "")).filter(Boolean);
}

/**
 * Os dois nomes coincidem parte a parte, na ordem e com o mesmo número de partes. Uma parte de
 * uma letra só ("A.") casa qualquer parte do outro nome que comece com ela, nos dois sentidos.
 * As partes de ligação não são descartadas: a Câmara e o TSE gravam a ligação no mesmo lugar
 * ("... PESSOA DE MELO ..."), e descartá-la só afrouxaria a regra.
 */
export function nomesComAbreviacao(a: string, b: string): boolean {
  const pa = partesDoNome(a);
  const pb = partesDoNome(b);
  if (pa.length === 0 || pa.length !== pb.length) return false;
  return pa.every((parte, i) => {
    const outra = pb[i];
    if (parte === outra) return true;
    if (parte.length === 1) return outra.startsWith(parte);
    if (outra.length === 1) return parte.startsWith(outra);
    return false;
  });
}

/**
 * Deputados distintos da lista de exercício da Câmara que são a pessoa (spec 2026-10-30 §4.3.2):
 * nome civil igual em qualquer UF; ou nome parlamentar igual ao de urna na mesma UF; ou, na mesma
 * UF, nome civil igual ao nome completo do TSE considerando abreviações. Zero é "fora da lista",
 * um é "em exercício", mais de um é homônimo.
 */
export function deputadosEmExercicio(
  e: { uf: string; nomeUrna: string; nomeCompleto: string },
  atuais: readonly DeputadoAtual[],
): DeputadoAtual[] {
  const civil = normalizarNome(e.nomeCompleto);
  const urna = normalizarNome(e.nomeUrna);
  const uf = e.uf.toUpperCase();
  return atuais.filter((d) => {
    if (civil !== "" && normalizarNome(d.nomeCivil) === civil) return true;
    if (d.uf.toUpperCase() !== uf) return false;
    return (urna !== "" && normalizarNome(d.nomeParlamentar) === urna)
      || nomesComAbreviacao(d.nomeCivil, e.nomeCompleto);
  });
}

export const chavePessoa = (c: ContatoPlanilha): string => c.id ?? normalizarNome(c.nome);

export const referencia = (a: { grupo: string; contato: ContatoPlanilha }): ContatoDoEleito => ({ grupo: a.grupo, nome: a.contato.nome, ...(a.contato.id ? { id: a.contato.id } : {}) });

