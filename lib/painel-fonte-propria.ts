import type { ResultadoGrupo } from "@/lib/types";

/** Etiqueta da linha cuja pessoa veio de outra página do órgão, não da fonte principal do grupo. */
export const TEXTO_FONTE_PROPRIA = "Fonte própria";
export const EXPLICACAO_FONTE_PROPRIA =
  "Pessoa lida em outra página do órgão (fonte secundária do grupo), não na fonte principal do cabeçalho";

/**
 * URL a mostrar na linha quando a pessoa (contato cadastrado ou proposta de inclusão) veio de uma
 * fonte secundária do grupo: a página dela é outra que a do cabeçalho. Caso dos convocados do TST
 * (`/orgaos`) e do STJ (PDF da composição) e dos senadores fora de exercício. Fica de fora:
 * - grupo com páginas individuais: a página do contato é sempre outra, e o rodapé "De onde veio
 *   cada resposta" já a mostra;
 * - grupo lido pela URL alternativa: o grupo inteiro veio dela, e o cabeçalho já avisa;
 * - URL que não é http (sentinela da composição via IA).
 */
export function fontePropria(
  urlPessoa: string | undefined,
  g: Pick<ResultadoGrupo, "fonteUrl" | "individuais" | "alternativa">,
): string | undefined {
  if (!urlPessoa || !urlPessoa.startsWith("http")) return undefined;
  if (g.individuais) return undefined;
  if (urlPessoa === g.fonteUrl) return undefined;
  if (g.alternativa?.url === urlPessoa) return undefined;
  return urlPessoa;
}
