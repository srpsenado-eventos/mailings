import { REGRAS_NOME, type RegraNome } from "@/data/regras-nome";
import type { ComparacaoCampo, ContatoPlanilha } from "@/lib/types";

/**
 * Limite de caracteres do campo Nome (Camada C, spec 2026-11-04 §3.5). O Posse corta o nome do
 * Ministro do STM acima de 50 caracteres; o GT manda abreviar o sobrenome, nunca a patente.
 */

/** Tamanho do nome como o Posse conta: pontas aparadas, cada letra (acentuada ou não) vale um. */
export function tamanhoDoNome(nome: string): number {
  return Array.from(nome.trim()).length;
}

export function textoCurtoLimiteNome(n: number, limite: number): string {
  return `Nome com ${n} caracteres, acima do limite de ${limite} do Posse`;
}

export function textoLimiteNome(n: number, limite: number): string {
  return `${textoCurtoLimiteNome(n, limite)}: patente como no site do STM (regra do GT de 13/11)`;
}

/**
 * Camada C: nome acima do limite do grupo. Sem regra, ou dentro do limite, devolve `[]`. Não
 * traz `valorEsperado`: o app não propõe a abreviação, quem decide é o GT.
 */
export function comparacaoLimiteNome(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
  regras: Readonly<Record<string, RegraNome>> = REGRAS_NOME,
): ComparacaoCampo[] {
  const limite = (grupoCanonico ? regras[grupoCanonico] : undefined)?.limiteCaracteres;
  if (limite === undefined) return [];
  const n = tamanhoDoNome(contato.nome);
  if (n <= limite) return [];
  return [
    {
      campo: "nome",
      valorPlanilha: contato.nome,
      situacao: "divergente",
      origemValor: "coerencia",
      achado: "nome_acima_do_limite",
      observacao: textoLimiteNome(n, limite),
    },
  ];
}
