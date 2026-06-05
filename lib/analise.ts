import type {
  ContatoPlanilha,
  ConteudoFonte,
  ResultadoAnalise,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";
import { agruparPorGrupo } from "@/lib/planilha";
import { compararGrupo } from "@/lib/match";

/**
 * Dependências injetadas no orquestrador. Permitem testar o pipeline sem rede
 * real e manter `lib/*` puro: a resolução de URL, o scraping e o refino por IA
 * são fornecidos de fora.
 */
export interface Dependencias {
  resolverFonte: (grupo: string) => Promise<string | undefined>;
  raspar: (url: string) => Promise<ConteudoFonte>;
  refinar: (grupo: ResultadoGrupo, fonte: ConteudoFonte) => Promise<ResultadoGrupo>;
}

async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoGrupo> {
  const url = await deps.resolverFonte(grupo);
  if (!url) return compararGrupo(grupo, contatos, undefined);

  let fonte: ConteudoFonte;
  try {
    fonte = await deps.raspar(url);
  } catch {
    // Falha de rede/timeout no scrape → degrada para "sem fonte" (vermelho),
    // sem derrubar a análise dos demais grupos.
    return compararGrupo(grupo, contatos, undefined);
  }

  const base = compararGrupo(grupo, contatos, fonte);
  try {
    return await deps.refinar(base, fonte);
  } catch {
    // Camada B (Gemini) é opcional: qualquer falha mantém o veredito determinístico.
    return base;
  }
}

function resumir(grupos: ResultadoGrupo[]): ResumoAnalise {
  const resumo: ResumoAnalise = {
    total: 0,
    verde: 0,
    amarelo: 0,
    vermelho: 0,
    novo: 0,
    gruposSemFonte: 0,
  };
  for (const g of grupos) {
    if (g.semFonte) resumo.gruposSemFonte += 1;
    resumo.novo += g.novos.length;
    for (const c of g.contatos) {
      resumo.total += 1;
      resumo[c.semaforo] += 1;
    }
  }
  return resumo;
}

export async function analisar(
  arquivoNome: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoAnalise> {
  const porGrupo = agruparPorGrupo(contatos);
  const grupos = await Promise.all(
    [...porGrupo.entries()].map(([grupo, lista]) => analisarGrupo(grupo, lista, deps)),
  );
  return { arquivoNome, grupos, resumo: resumir(grupos) };
}
