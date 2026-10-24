import { listarEntreAspas } from "@/lib/texto";

/**
 * Triagem dos arquivos soltos (arrastar e soltar) na área tracejada da Nova varredura.
 * Função pura, para o componente só renderizar: decide o que entra e o aviso a mostrar.
 * As extensões são as mesmas do `accept` do seletor de arquivo.
 */
export const EXTENSOES_PLANILHA = [".xlsx", ".csv"] as const;

export interface TriagemDeArquivos<T> {
  aceitos: T[];
  aviso: string | null;
}

const temExtensaoDePlanilha = (nome: string): boolean => {
  const minusculo = nome.toLowerCase();
  return EXTENSOES_PLANILHA.some((extensao) => minusculo.endsWith(extensao));
};

/**
 * `multiplo` é o passo que aceita várias planilhas de uma vez (Eleição 2026). Nos passos de um
 * arquivo só, soltar mais de uma planilha não escolhe nenhuma: avisa e espera uma por vez.
 */
export function triarArquivosSoltos<T extends { name: string }>(arquivos: readonly T[], multiplo: boolean): TriagemDeArquivos<T> {
  if (arquivos.length === 0) return { aceitos: [], aviso: "Nenhum arquivo foi solto." };

  const planilhas = arquivos.filter((a) => temExtensaoDePlanilha(a.name));
  const recusados = arquivos.filter((a) => !temExtensaoDePlanilha(a.name)).map((a) => a.name);
  const avisos: string[] = [];
  if (recusados.length > 0) {
    avisos.push(`Só planilhas .xlsx ou .csv: ${listarEntreAspas(recusados)} ${recusados.length === 1 ? "foi ignorado" : "foram ignorados"}.`);
  }

  const excesso = !multiplo && planilhas.length > 1;
  if (excesso) avisos.push("Este passo aceita um arquivo só: solte uma planilha por vez.");

  return { aceitos: excesso ? [] : planilhas, aviso: avisos.length > 0 ? avisos.join(" ") : null };
}
