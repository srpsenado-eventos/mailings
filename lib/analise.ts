import type {
  ContatoPlanilha,
  ConteudoFonte,
  EnderecoEstruturado,
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
import { auditarEndereco, indexarEnderecos, type IndiceEnderecos } from "@/lib/endereco";

function motivoDaFalha(err: unknown): string {
  if (err instanceof ScrapeError) return err.motivo;
  if (err instanceof Error) return err.message;
  return "fonte inacessível";
}

/** Motivo padrão quando o scrape teve sucesso (HTTP 200) mas não achou ninguém — caso do TCU/JS. */
const MOTIVO_PAGINA_SEM_CONTEUDO = "página não retornou conteúdo legível (provável JavaScript)";

/**
 * Motivo de uma fonte que respondeu e simplesmente não trouxe ninguém, enquanto outra fonte
 * do grupo trouxe. Diferente do diagnóstico acima de propósito: a página respondeu, e dizer
 * que ela é ilegível seria mentira — a lista de "fora de exercício" fica legitimamente vazia
 * quando nenhum senador está afastado.
 */
const MOTIVO_FONTE_VAZIA = "não trouxe ninguém";

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

/**
 * A fonte FALHOU, no sentido que suspende o veredito de saída? Não é a mesma pergunta que
 * `contribuiu`: lá o que se decide é quem entra na composição; aqui, se a composição ficou
 * confiável o bastante para concluir que alguém saiu.
 *
 * - Lançou erro (403, TLS, timeout) → falhou, em qualquer posição.
 * - É a PRIMÁRIA e voltou de pé sem ninguém → falhou: é o caso do TCU/JS e o da página que
 *   mudou de estrutura, em que o spec de 2026-09-24 promete indeterminado, nunca saída falsa.
 * - É uma fonte secundária e voltou de pé sem ninguém → NÃO falhou: a lista de "fora de
 *   exercício" vazia é estado normal (nenhum senador afastado), e tratá-la como falha
 *   desligaria a detecção de saída dos três mailings de Senadores sem ninguém perceber.
 */
function falhou(lida: FonteLida, ehPrimaria: boolean): boolean {
  return lida.erro !== undefined || (ehPrimaria && !contribuiu(lida));
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
  // Toda fonte que contribuiu entra na composição, na ordem do catálogo: dado oficial da
  // Camada 1 nunca é descartado, nem quando a primária caiu. O que a falha de UMA fonte
  // entre várias suspende é a CONCLUSÃO, não a comparação — ver `leituraParcial` abaixo.
  const pessoasPagina = unirFontes(
    lidas.map((l) => (l.conteudo ? marcarProveniencia(l.conteudo.pessoas, l.fonte) : [])),
  );
  const naoContribuiram = lidas.filter((l) => !contribuiu(l));
  const algumaContribuiu = lidas.some(contribuiu);
  // LEITURA PARCIAL: alguma fonte ativa compôs o grupo e outra FALHOU (ver `falhou`). É a
  // única situação em que o veredito de saída fica suspenso — ver o passo 4. Fonte que
  // respondeu e não tinha ninguém a listar não entra aqui: vira só ressalva em `erroFonte`.
  // Quando NENHUMA fonte contribuiu nada muda em relação ao que já existia: a composição
  // da IA, se houver, é composição real e continua podendo apontar saída (marcada
  // `viaPesquisaAmpla`, o caminho documentado do TCU); sem IA, cai em fonte inacessível.
  const leituraParcial = algumaContribuiu && lidas.some((l, i) => falhou(l, i === 0));
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
  // Leitura parcial: parte da composição oficial ficou de fora, então ninguém deste grupo
  // pode ser dado como saída — e o usuário precisa saber disso, na tela e no export.
  const r = compararGrupo(
    grupo,
    contatos,
    fonte,
    resolvida.grupoCanonico,
    resolvida.ufs,
    leituraParcial,
  );
  // Ressalva atribuída A CADA fonte que não compôs — sem identificar qual, "HTTP 403"
  // parece falha da primária. Vale para as duas formas de não compor, inclusive a que NÃO
  // suspende o veredito: o usuário tem que saber que aquela fonte não trouxe nada. Só
  // rótulo/URL e o motivo técnico: nunca um contato.
  const erro = algumaContribuiu && naoContribuiram.length > 0
    ? naoContribuiram
        .map((l) => `${identificarFonte(l.fonte)}: ${l.erro ?? MOTIVO_FONTE_VAZIA}`)
        .join(" · ")
    : undefined;
  // Marca o grupo quando a composição dependeu do conhecimento da IA (não 100% oficial).
  const usouConhecimento = composicao.some((p) => p.origem === "conhecimento");
  return {
    ...r,
    ...(erro ? { erroFonte: erro } : {}),
    ...(usouConhecimento || !urlPrimaria ? { viaPesquisaAmpla: true } : {}),
  };
}

/**
 * Anexa a auditoria de endereço a cada contato do grupo. Passada POSTERIOR de
 * propósito: o endereço não depende da fonte oficial, então não entra em
 * `compararGrupo` e vale igual nos três caminhos (com fonte, sem fonte, fonte
 * inacessível). Não toca `semaforo`, `camposDivergentes` nem `possivelSaida`.
 */
function anexarEnderecos(grupo: ResultadoGrupo, indice?: IndiceEnderecos): ResultadoGrupo {
  return {
    ...grupo,
    contatos: grupo.contatos.map((c) => ({ ...c, endereco: auditarEndereco(c.contato, indice) })),
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
    enderecosAConfirmar: 0,
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
      if (c.endereco?.situacao === "pendente") resumo.enderecosAConfirmar += 1;
    }
  }
  return resumo;
}

export async function analisar(
  arquivoNome: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
  enderecos?: EnderecoEstruturado[],
): Promise<ResultadoAnalise> {
  const indice = enderecos && enderecos.length > 0 ? indexarEnderecos(enderecos) : undefined;
  const porGrupo = agruparPorGrupo(contatos);
  const grupos = await Promise.all(
    [...porGrupo.entries()].map(async ([grupo, lista]) =>
      anexarEnderecos(await analisarGrupo(grupo, lista, deps), indice),
    ),
  );
  return { arquivoNome, grupos, resumo: resumir(grupos) };
}
