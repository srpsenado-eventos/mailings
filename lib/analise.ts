import type {
  ContatoPlanilha,
  ConteudoFonte,
  ResultadoAnalise,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";
import { agruparPorGrupo } from "@/lib/planilha";
import { compararGrupo, compararGrupoAmplo, marcarFonteInacessivel } from "@/lib/match";
import { ScrapeError } from "@/lib/scrape";
import type { FonteResolvida } from "@/lib/supabase";

/**
 * Dependências injetadas no orquestrador. Permitem testar o pipeline sem rede
 * real e manter `lib/*` puro: a resolução de URL, o scraping, a pesquisa ampla
 * (2ª etapa) e o refino por IA são fornecidos de fora.
 */
export interface Dependencias {
  resolverFonte: (grupo: string) => Promise<FonteResolvida | undefined>;
  raspar: (url: string) => Promise<ConteudoFonte>;
  /** 2ª etapa (§7.3): composição atual via pesquisa ampla. `undefined` = indisponível. */
  pesquisarAmpla: (grupoCanonico: string) => Promise<ConteudoFonte | undefined>;
  refinar: (grupo: ResultadoGrupo, fonte: ConteudoFonte) => Promise<ResultadoGrupo>;
}

function motivoDaFalha(err: unknown): string {
  if (err instanceof ScrapeError) return err.motivo;
  if (err instanceof Error) return err.message;
  return "erro desconhecido";
}

async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoGrupo> {
  const resolvida = await deps.resolverFonte(grupo);
  // Grupo desconhecido (nenhum cadastro casa) → sem fonte, sem o que pesquisar.
  if (!resolvida) return compararGrupo(grupo, contatos, undefined);

  // Grupo casado mas sem URL oficial → tenta direto a 2ª etapa (pesquisa ampla).
  if (!resolvida.url) {
    const ampla = await deps.pesquisarAmpla(resolvida.grupoCanonico);
    return ampla
      ? compararGrupoAmplo(grupo, contatos, ampla)
      : compararGrupo(grupo, contatos, undefined);
  }

  let fonte: ConteudoFonte;
  try {
    fonte = await deps.raspar(resolvida.url);
  } catch (err) {
    // Fonte cadastrada, mas inacessível (TLS, WAF, timeout, bloqueio de IP).
    // 2ª etapa: tenta a composição atual por pesquisa ampla antes de desistir.
    const ampla = await deps.pesquisarAmpla(resolvida.grupoCanonico);
    if (ampla) return compararGrupoAmplo(grupo, contatos, ampla, resolvida.url);
    return marcarFonteInacessivel(grupo, contatos, resolvida.url, motivoDaFalha(err));
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
    indeterminado: 0,
    gruposSemFonte: 0,
    gruposFonteInacessivel: 0,
    gruposViaPesquisaAmpla: 0,
  };
  for (const g of grupos) {
    if (g.semFonte) resumo.gruposSemFonte += 1;
    if (g.fonteInacessivel) resumo.gruposFonteInacessivel += 1;
    if (g.viaPesquisaAmpla) resumo.gruposViaPesquisaAmpla += 1;
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
