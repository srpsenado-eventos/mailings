import type {
  ContatoPlanilha,
  ConteudoFonte,
  PessoaSite,
  ResultadoAnalise,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";
import { agruparPorGrupo } from "@/lib/planilha";
import { compararGrupo, marcarFonteInacessivel } from "@/lib/match";
import { URL_PESQUISA_AMPLA } from "@/lib/gemini";
import { ScrapeError } from "@/lib/scrape";
import type { FonteResolvida } from "@/lib/supabase";

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
  resolverFonte: (grupo: string) => Promise<FonteResolvida>;
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

  // 1. Tenta raspar a URL oficial (se houver); falha → texto vazio (a IA completa).
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

  // 2. Camada B: composição via IA (texto + conhecimento). Sem chave → [].
  const pessoas = await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo);
  if (pessoas.length > 0) {
    const fonte: ConteudoFonte = {
      url: resolvida.url ?? URL_PESQUISA_AMPLA,
      textoLimpo,
      destaques: [],
      pessoas,
    };
    const r = compararGrupo(grupo, contatos, fonte);
    // Marca o grupo quando a composição dependeu do conhecimento (não 100% oficial).
    const usouConhecimento = pessoas.some((p) => p.origem === "conhecimento");
    return usouConhecimento || !resolvida.url ? { ...r, viaPesquisaAmpla: true } : r;
  }

  // 3. Sem IA (ou IA vazia): usa o determinístico do scrape, se houve.
  if (fonteRaspada) return compararGrupo(grupo, contatos, fonteRaspada);
  // 4. Tinha URL mas não raspou e IA vazia → inacessível (com o motivo técnico).
  if (resolvida.url) {
    return marcarFonteInacessivel(grupo, contatos, resolvida.url, motivoFalha);
  }
  // 5. Sem URL e IA vazia → sem fonte.
  return compararGrupo(grupo, contatos, undefined);
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
