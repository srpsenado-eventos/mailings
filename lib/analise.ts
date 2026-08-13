import type {
  ContatoPlanilha,
  ConteudoFonte,
  PessoaSite,
  ResultadoAnalise,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";
import { agruparPorGrupo } from "@/lib/planilha";
import { compararGrupo, marcarFonteInacessivel, mesclarComposicao } from "@/lib/match";
import { URL_PESQUISA_AMPLA } from "@/lib/gemini";
import { ScrapeError } from "@/lib/scrape";
import type { FonteResolvida } from "@/lib/catalogo";

function motivoDaFalha(err: unknown): string {
  if (err instanceof ScrapeError) return err.motivo;
  if (err instanceof Error) return err.message;
  return "fonte inacessível";
}

/**
 * Dependências injetadas no orquestrador. Mantêm `lib/*` puro e testável: a
 * resolução de URL, o scraping e a composição via IA (Camada B) vêm de fora.
 */
export interface Dependencias {
  /** Resolve o rótulo da planilha para grupo canônico + URL oficial. Síncrono: lê o catálogo versionado. */
  resolverFonte: (grupo: string) => FonteResolvida;
  raspar: (url: string) => Promise<ConteudoFonte>;
  /** Camada B: composição via IA (texto raspado + conhecimento). `[]` = indisponível. */
  extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]>;
}

async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoGrupo> {
  const resolvida = await deps.resolverFonte(grupo);
  // Grupo desconhecido (nenhum cadastro casa) → sem fonte; orienta com sugestões.
  if (!resolvida.grupoCanonico) {
    const base = compararGrupo(grupo, contatos, undefined);
    return resolvida.sugestoes.length > 0
      ? { ...base, sugestoesCadastro: resolvida.sugestoes }
      : base;
  }

  // 1. Camada 1 (base): tenta raspar a URL oficial. Falha → texto vazio (a IA cobre).
  let fonteRaspada: ConteudoFonte | undefined;
  let motivoFalha = "fonte inacessível";
  if (resolvida.url) {
    try {
      fonteRaspada = await deps.raspar(resolvida.url);
    } catch (err) {
      motivoFalha = motivoDaFalha(err);
    }
  }
  const textoLimpo = fonteRaspada?.textoLimpo ?? "";
  const pessoasPagina = fonteRaspada?.pessoas ?? [];

  // 2. Camada 2 (refinamento/cobertura): composição via IA. Sem chave → [].
  const pessoasIA = await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo);
  const composicao = mesclarComposicao(pessoasPagina, pessoasIA, contatos);

  // 3. Sem composição (página ilegível E IA vazia): NUNCA "saída" — "não verificado".
  if (composicao.length === 0) {
    if (resolvida.url) {
      // Diferencia scrape que lançou erro de página que veio sem conteúdo legível (JS).
      const motivo = fonteRaspada
        ? "página não retornou conteúdo legível (provável JavaScript)"
        : motivoFalha;
      return marcarFonteInacessivel(grupo, contatos, resolvida.url, motivo);
    }
    return compararGrupo(grupo, contatos, undefined); // sem URL → sem fonte
  }

  // 4. Compara contra a composição (página + resgates da IA, ou só IA na página ilegível).
  const fonte: ConteudoFonte = {
    url: resolvida.url ?? URL_PESQUISA_AMPLA,
    textoLimpo,
    destaques: [],
    pessoas: composicao,
  };
  const r = compararGrupo(grupo, contatos, fonte);
  // Marca o grupo quando a composição dependeu do conhecimento da IA (não 100% oficial).
  const usouConhecimento = composicao.some((p) => p.origem === "conhecimento");
  return usouConhecimento || !resolvida.url ? { ...r, viaPesquisaAmpla: true } : r;
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
