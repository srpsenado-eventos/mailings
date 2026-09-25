import type {
  ContatoPlanilha,
  ConteudoFonte,
  FonteCatalogo,
  PessoaSite,
  ResultadoAnalise,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";
import { agruparPorGrupo } from "@/lib/planilha";
import { compararGrupo, marcarFonteInacessivel, mesclarComposicao, unirFontes } from "@/lib/match";
import { URL_PESQUISA_AMPLA } from "@/lib/gemini";
import { ScrapeError } from "@/lib/scrape";
import type { FonteResolvida } from "@/lib/catalogo";

function motivoDaFalha(err: unknown): string {
  if (err instanceof ScrapeError) return err.motivo;
  if (err instanceof Error) return err.message;
  return "fonte inacessível";
}

/** Motivo padrão quando o scrape teve sucesso (HTTP 200) mas não achou ninguém — caso do TCU/JS. */
const MOTIVO_PAGINA_SEM_CONTEUDO = "página não retornou conteúdo legível (provável JavaScript)";

/**
 * Dependências injetadas no orquestrador. Mantêm `lib/*` puro e testável: a
 * resolução de URL, o scraping e a composição via IA (Camada B) vêm de fora.
 */
export interface Dependencias {
  /** Resolve o rótulo da planilha para grupo canônico + fontes oficiais. Lê o catálogo versionado. */
  resolverFonte: (grupo: string) => FonteResolvida;
  /** Raspa UMA fonte cadastrada, com a extração que ela declara. */
  raspar: (fonte: FonteCatalogo) => Promise<ConteudoFonte>;
  /** Camada B: composição via IA (texto raspado + conhecimento). `[]` = indisponível. */
  extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]>;
}

/** Resultado da leitura de uma fonte: conteúdo OU motivo técnico da falha, nunca os dois. */
interface FonteLida {
  fonte: FonteCatalogo;
  conteudo?: ConteudoFonte;
  erro?: string;
}

/** Carimba em cada pessoa de onde ela veio, para o veredito saber o que dizer depois. */
function marcarProveniencia(pessoas: PessoaSite[], fonte: FonteCatalogo): PessoaSite[] {
  return pessoas.map((p) => ({
    ...p,
    fonteUrl: fonte.url,
    ...(fonte.rotulo ? { rotuloFonte: fonte.rotulo } : {}),
    ...(fonte.propoeInclusao ? { propoeInclusao: true } : {}),
  }));
}

/**
 * Uma fonte "não contribuiu" quando o scrape lançou erro OU voltou de pé (HTTP 200) sem
 * ninguém — a página do TCU não lança erro, só não tem HTML legível por causa do JS. As
 * duas contam como composição zero: nenhuma vira base para apontar "possível saída".
 */
function contribuiu(lida: FonteLida): boolean {
  return lida.conteudo !== undefined && lida.conteudo.pessoas.length > 0;
}

/** Identifica a fonte no motivo técnico: o rótulo quando houver, senão a URL. Sem PII. */
function identificarFonte(fonte: FonteCatalogo): string {
  return fonte.rotulo ?? fonte.url;
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

  // 1. Camada 1 (base): todas as fontes ativas, em paralelo. Uma falhar não derruba a outra.
  const lidas: FonteLida[] = await Promise.all(
    resolvida.fontes.map(async (fonte) => {
      try {
        return { fonte, conteudo: await deps.raspar(fonte) };
      } catch (err) {
        return { fonte, erro: motivoDaFalha(err) };
      }
    }),
  );
  const urlPrimaria = resolvida.fontes[0]?.url;
  const primariaOk = lidas.length > 0 && contribuiu(lidas[0]);
  // A regra de ouro vale mais que "compara com quem sobrou": se a fonte PRIMÁRIA não
  // contribuiu, uma secundária sozinha condenaria quem só a primária publica (ex.: os
  // senadores em exercício, se só a lista de "fora de exercício" respondesse). Por isso a
  // página inteira é descartada — inclusive as secundárias — sobrando só o resgate da IA,
  // o mesmo caminho que já existia para fonte única ilegível.
  const pessoasPagina = primariaOk
    ? unirFontes(lidas.map((l) => (l.conteudo ? marcarProveniencia(l.conteudo.pessoas, l.fonte) : [])))
    : [];
  // A Camada 2 recebe o texto da fonte primária — uma chamada por grupo, como sempre.
  const textoLimpo = lidas[0]?.conteudo?.textoLimpo ?? "";

  // 2. Camada 2 (refinamento/cobertura): composição via IA. Sem chave → [].
  const pessoasIA = await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo);
  const composicao = mesclarComposicao(pessoasPagina, pessoasIA, contatos);

  // 3. Sem composição (nenhuma fonte legível E IA vazia): NUNCA "saída" — "não verificado".
  if (composicao.length === 0) {
    if (urlPrimaria) {
      // Diferencia scrape que lançou erro de página que veio sem conteúdo legível (JS).
      const motivo = lidas[0]?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO;
      return marcarFonteInacessivel(grupo, contatos, urlPrimaria, motivo, resolvida.grupoCanonico);
    }
    return compararGrupo(grupo, contatos, undefined, resolvida.grupoCanonico); // sem URL → sem fonte
  }

  // 4. Compara contra a composição (fontes que sobreviveram + resgates da IA).
  const fonte: ConteudoFonte = {
    url: urlPrimaria ?? URL_PESQUISA_AMPLA,
    textoLimpo,
    destaques: [],
    pessoas: composicao,
  };
  const r = compararGrupo(grupo, contatos, fonte, resolvida.grupoCanonico, resolvida.ufs);
  // A primária sustentou o veredito, mas uma secundária caiu (ou voltou vazia): expõe o
  // motivo técnico atribuído A ELA — sem o prefixo, "HTTP 403" parece falha da primária.
  const secundariaQuebrada = primariaOk ? lidas.slice(1).find((l) => !contribuiu(l)) : undefined;
  const erro = secundariaQuebrada
    ? `${identificarFonte(secundariaQuebrada.fonte)}: ${secundariaQuebrada.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO}`
    : undefined;
  // Marca o grupo quando a composição dependeu do conhecimento da IA (não 100% oficial).
  const usouConhecimento = composicao.some((p) => p.origem === "conhecimento");
  return {
    ...r,
    ...(erro ? { erroFonte: erro } : {}),
    ...(usouConhecimento || !urlPrimaria ? { viaPesquisaAmpla: true } : {}),
  };
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
