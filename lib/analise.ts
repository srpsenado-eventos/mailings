import type {
  ContatoPlanilha,
  ConteudoFonte,
  EnderecoEstruturado,
  FalhasPorUrl,
  FonteCatalogo,
  FonteIndividual,
  FonteLegivel,
  LeituraAlternativa,
  LeituraGuardada,
  LeiturasGuardadas,
  PessoaSite,
  Reaproveitamento,
  ResultadoAnalise,
  ResultadoGrupo,
  ResumoAnalise,
  TentativaDeUrl,
} from "@/lib/types";
import { agruparPorGrupo } from "@/lib/planilha";
import {
  compararContatoIndividual,
  compararContatoSemIndividual,
  compararGrupo,
  contarContatosCasados,
  listaDeCargos,
  marcarFonteInacessivel,
  mesclarComposicao,
  MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO,
  novosForaDaPlanilha,
  paginaComConteudo,
  unirFontes,
  type ListaCargos,
} from "@/lib/match";
import {
  anotacaoReaproveitada,
  atualizarFalhas,
  contarUrlsCaidas,
  ehLeituraParcial,
  leituraValida,
  mesclarLeituras,
  motivoLeituraParcial,
  MOTIVO_SEM_NINGUEM,
} from "@/lib/memoria-leitura";
import { URL_PESQUISA_AMPLA } from "@/lib/gemini";
import { ScrapeError } from "@/lib/scrape";
import { fonteIndividualDe, type FonteResolvida } from "@/lib/catalogo";
import { ufDoContato } from "@/lib/uf";
import { auditarEndereco, indexarEnderecos, type IndiceEnderecos } from "@/lib/endereco";

function motivoDaFalha(err: unknown): string {
  if (err instanceof ScrapeError) return err.motivo;
  if (err instanceof Error) return err.message;
  return "fonte inacessível";
}

/** Motivo padrão quando o scrape teve sucesso (HTTP 200) mas não achou ninguém — caso do TCU/JS. */
const MOTIVO_PAGINA_SEM_CONTEUDO = "página não retornou conteúdo legível (provável JavaScript)";

/** Motivo do grupo cuja composição lida não casou nenhum contato (ver `leituraSuspeita`). */
export const MOTIVO_LEITURA_SUSPEITA =
  "leitura suspeita: nenhum contato do grupo foi encontrado na composição lida";

/** A partir de quantos contatos "ninguém casou" deixa de ser crível como saída real. */
export const MIN_CONTATOS_LEITURA_SUSPEITA = 2;

/**
 * A composição não casou NINGUÉM de um grupo com 2+ contatos: todos saíram como possível
 * saída. Na prática isso é página que não terminou de montar (o TCU sem a lista, só com o
 * menu), mudança de layout ou página errada, nunca um grupo inteiro que saiu. Grupo de um
 * contato só fica de fora: uma pessoa pode mesmo ter saído.
 */
function leituraSuspeita(r: ResultadoGrupo): boolean {
  return (
    r.contatos.length >= MIN_CONTATOS_LEITURA_SUSPEITA &&
    r.contatos.every((c) => c.possivelSaida === true)
  );
}

/**
 * Dependências injetadas no orquestrador. Mantêm `lib/*` puro e testável: a
 * resolução de URL, o scraping e a composição via IA (Camada B) vêm de fora.
 */
export interface Dependencias {
  /** Resolve o rótulo da planilha para grupo canônico + fontes oficiais. Lê o catálogo versionado. */
  resolverFonte: (grupo: string) => FonteResolvida;
  /** Raspa UMA fonte do catálogo, de grupo ou individual, com a extração que ela declara. */
  raspar: (fonte: FonteLegivel) => Promise<ConteudoFonte>;
  /** Camada B: composição via IA (texto raspado + conhecimento). `[]` = indisponível. */
  extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]>;
  /**
   * Memória de leitura por página (spec 2026-10-20), por URL. Ausente: nada é reaproveitado e o
   * comportamento é o de antes; `leituras` sai só com as boas de hoje.
   */
  leiturasAnteriores?: LeiturasGuardadas;
  /**
   * URLs que falharam nas coletas anteriores (spec 2026-10-23 §3.4). Ausente: o mapa de hoje
   * começa vazio.
   */
  falhasAnteriores?: FalhasPorUrl;
  /** Relógio injetável (validade de 7 dias e data das leituras de hoje). Ausente: `new Date()`. */
  agora?: () => Date;
}

/**
 * Leitura de uma fonte, de grupo ou individual: conteúdo OU motivo técnico da falha, nunca os
 * dois. Quando o conteúdo veio da memória (spec 2026-10-20), `reaproveitada` diz de quando ele
 * é e por que a leitura de hoje não serviu, e `urlDaMemoria` sob qual URL ele estava guardado.
 * `alternativa`: a principal não serviu e a URL alternativa cadastrada respondeu (spec
 * 2026-10-23 §3.3). `tentadas`: as URLs pedidas hoje, com o motivo das que não serviram; a
 * leitura reaproveitada mantém as de hoje, porque a URL falhou mesmo assim (§3.4).
 */
interface Leitura<F extends FonteLegivel> {
  fonte: F;
  conteudo?: ConteudoFonte;
  erro?: string;
  reaproveitada?: Reaproveitamento;
  urlDaMemoria?: string;
  alternativa?: LeituraAlternativa;
  tentadas: TentativaDeUrl[];
}
type FonteLida = Leitura<FonteCatalogo>;
type IndividualLida = Leitura<FonteIndividual>;
/** Uma leitura de uma URL só, antes de saber se ela serviu. */
type Raspagem = Pick<Leitura<FonteLegivel>, "conteudo" | "erro">;

async function rasparUma(fonte: FonteLegivel, deps: Dependencias): Promise<Raspagem> {
  try {
    return { conteudo: await deps.raspar(fonte) };
  } catch (err) {
    return { erro: motivoDaFalha(err) };
  }
}

/** A URL tentada hoje e, se ela não serviu, o motivo (o técnico ou o padrão de quem chama). */
function tentativa(url: string, r: Raspagem, serviu: boolean, motivoPadrao: string): TentativaDeUrl {
  return serviu ? { url } : { url, erro: r.erro ?? motivoPadrao };
}

/** A URL de onde veio o conteúdo de hoje: a alternativa, quando foi ela que respondeu (§3.3). */
function urlLida<F extends FonteLegivel>(l: Leitura<F>): string {
  return l.alternativa?.url ?? l.fonte.url;
}

/**
 * A URL da página de onde o conteúdo realmente veio: a da memória, quando ele foi reaproveitado
 * (pode ser a alternativa), senão a lida hoje. É a proveniência que o contato cita e a chave sob
 * a qual a leitura volta à memória.
 */
function urlDoConteudo<F extends FonteLegivel>(l: Leitura<F>): string {
  return l.urlDaMemoria ?? urlLida(l);
}

/**
 * Lê a URL principal e, se ela não serviu (`serviu` falsa, conforme quem chama) e a fonte tem
 * URL alternativa, lê a alternativa com o mesmo raspador (spec 2026-10-23 §3.3). A alternativa
 * que serve entra com `alternativa: { url, motivoPrincipal }`; as duas falhando, o erro diz os
 * dois motivos. Principal que serve: a alternativa nem é pedida.
 */
async function lerHoje<F extends FonteLegivel>(
  fonte: F,
  deps: Dependencias,
  serviu: (l: Leitura<F>) => boolean,
  motivoPadrao: string,
): Promise<Leitura<F>> {
  const principal = await rasparUma(fonte, deps);
  const principalServiu = serviu({ fonte, ...principal, tentadas: [] });
  const tentadaPrincipal = tentativa(fonte.url, principal, principalServiu, motivoPadrao);
  if (principalServiu || !fonte.urlAlternativa) return { fonte, ...principal, tentadas: [tentadaPrincipal] };
  const url = fonte.urlAlternativa;
  const alternativa = await rasparUma({ ...fonte, url }, deps);
  const alternativaServiu = serviu({ fonte, ...alternativa, tentadas: [] });
  const tentadas = [tentadaPrincipal, tentativa(url, alternativa, alternativaServiu, motivoPadrao)];
  const motivoPrincipal = principal.erro ?? motivoPadrao;
  if (alternativaServiu) return { fonte, conteudo: alternativa.conteudo, alternativa: { url, motivoPrincipal }, tentadas };
  return { fonte, erro: `${motivoPrincipal} · URL alternativa: ${alternativa.erro ?? motivoPadrao}`, tentadas };
}

/** Guardada sem ninguém não serve à fonte de grupo (nem à lista geral): só a individual pode ser legitimamente vazia. */
const GUARDADA_COM_PESSOAS = (g: LeituraGuardada): boolean => g.conteudo.pessoas.length > 0;

/**
 * A leitura guardada da fonte, se existe e está no prazo (§5.3): a da URL principal e, sem ela,
 * a da URL alternativa (spec 2026-10-23 §3.3).
 */
function guardadaValida(fonte: FonteLegivel, deps: Dependencias, agora: Date): LeituraGuardada | undefined {
  const urls = fonte.urlAlternativa ? [fonte.url, fonte.urlAlternativa] : [fonte.url];
  return urls
    .map((url) => deps.leiturasAnteriores?.[url])
    .find((g): g is LeituraGuardada => g !== undefined && leituraValida(g, agora));
}

/**
 * Lê a fonte hoje e, se a leitura não serviu (`serviu` falsa: erro, sem ninguém ou sem conteúdo
 * legível, conforme quem chama), sai pela leitura guardada válida da mesma URL, com a data
 * original e o motivo de hoje (§5.1 passo 2, §5.2). Sem memória válida (ou que `serveGuardada`
 * recusa), devolve a de hoje.
 */
async function lerFonte<F extends FonteLegivel>(
  fonte: F,
  deps: Dependencias,
  agora: Date,
  serviu: (l: Leitura<F>) => boolean,
  motivoPadrao: string,
  serveGuardada: (g: LeituraGuardada) => boolean = () => true,
): Promise<Leitura<F>> {
  const hoje = await lerHoje(fonte, deps, serviu, motivoPadrao);
  if (serviu(hoje)) return hoje;
  const guardada = guardadaValida(fonte, deps, agora);
  if (!guardada || !serveGuardada(guardada)) return hoje;
  return {
    fonte,
    conteudo: guardada.conteudo,
    reaproveitada: { lidaEm: guardada.lidaEm, motivo: hoje.erro ?? motivoPadrao },
    urlDaMemoria: guardada.url,
    tentadas: hoje.tentadas,
  };
}

/**
 * O que entra na memória por esta leitura, sob a URL de onde o conteúdo veio (a alternativa,
 * quando foi ela que respondeu): reaproveitada volta com a data original e sob a URL em que
 * estava guardada (§4.3).
 */
function guardar<F extends FonteLegivel>(l: Leitura<F>, agora: Date): LeituraGuardada {
  return { url: urlDoConteudo(l), lidaEm: l.reaproveitada?.lidaEm ?? agora.toISOString(), conteudo: l.conteudo as ConteudoFonte };
}

/**
 * O que a análise de um grupo devolve: o resultado, as leituras boas desta varredura (§4.3) e
 * as URLs tentadas hoje, com o motivo das que falharam (spec 2026-10-23 §3.4).
 */
interface AnaliseDoGrupo {
  grupo: ResultadoGrupo;
  leituras: LeituraGuardada[];
  tentadas: TentativaDeUrl[];
}

const SEM_LEITURAS: LeituraGuardada[] = [];
const SEM_TENTADAS: TentativaDeUrl[] = [];

/**
 * §5.1 passo 4: a primária lida hoje casou menos da metade dos contatos. Se a guardada casa
 * mais, ela entra no lugar, com o motivo "página casou X de N contatos"; senão fica a de hoje,
 * que não será guardada (`primariaParcial`). Primária reaproveitada, sem ninguém ou que é só
 * lista de cargos não passa por aqui.
 */
function reaproveitarParcial(
  lidas: FonteLida[],
  contatos: ContatoPlanilha[],
  deps: Dependencias,
  agora: Date,
): { lidas: FonteLida[]; primariaParcial: boolean } {
  const primaria = lidas[0];
  const naoSeAplica = { lidas, primariaParcial: false };
  if (!primaria || primaria.reaproveitada || !contribuiu(primaria) || primaria.fonte.casamento === "cargo") return naoSeAplica;
  const casadosHoje = contarContatosCasados(contatos, primaria.conteudo!.pessoas);
  if (!ehLeituraParcial(casadosHoje, contatos.length)) return naoSeAplica;
  const guardada = guardadaValida(primaria.fonte, deps, agora);
  if (!guardada || contarContatosCasados(contatos, guardada.conteudo.pessoas) <= casadosHoje) return { lidas, primariaParcial: true };
  const trocada: FonteLida = {
    fonte: primaria.fonte,
    conteudo: guardada.conteudo,
    reaproveitada: { lidaEm: guardada.lidaEm, motivo: motivoLeituraParcial(casadosHoje, contatos.length) },
    urlDaMemoria: guardada.url,
    tentadas: primaria.tentadas,
  };
  return { lidas: [trocada, ...lidas.slice(1)], primariaParcial: false };
}

/** §4.3: fontes que contribuíram entram na memória; a primária parcial de hoje não. */
function leiturasBoas(lidas: readonly FonteLida[], primariaParcial: boolean, agora: Date): LeituraGuardada[] {
  return lidas.flatMap((l, i) => (!contribuiu(l) || (i === 0 && primariaParcial) ? [] : [guardar(l, agora)]));
}

/**
 * Carimba em cada pessoa de onde ela veio, para o veredito saber o que dizer depois. `url` é a
 * página de onde o conteúdo veio (`urlDoConteudo`): a alternativa, quando foi ela (spec
 * 2026-10-23 §3.3).
 */
function marcarProveniencia(pessoas: PessoaSite[], fonte: FonteCatalogo, url: string): PessoaSite[] {
  return pessoas.map((p) => ({
    ...p,
    fonteUrl: url,
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

/** Carimba o responsável do catálogo no grupo, nos três caminhos (com fonte, sem fonte, inacessível). */
function comResponsavel(grupo: ResultadoGrupo, responsavel?: string): ResultadoGrupo {
  return responsavel ? { ...grupo, responsavel } : grupo;
}

async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
  agora: Date,
): Promise<AnaliseDoGrupo> {
  const resolvida = await deps.resolverFonte(grupo);
  // Grupo desconhecido (nenhum cadastro casa) → sem fonte; orienta com sugestões.
  if (!resolvida.grupoCanonico) {
    const base = compararGrupo(grupo, contatos, undefined);
    return {
      grupo: comResponsavel(
        resolvida.sugestoes.length > 0 ? { ...base, sugestoesCadastro: resolvida.sugestoes } : base,
        resolvida.responsavel,
      ),
      leituras: SEM_LEITURAS,
      tentadas: SEM_TENTADAS,
    };
  }

  // Grupo com fontes individuais (spec 2026-10-15): caminho por contato. Os demais seguem abaixo.
  if (resolvida.fontesIndividuais.length > 0) {
    const a = await analisarGrupoIndividual(grupo, contatos, resolvida, deps, agora);
    return { ...a, grupo: comResponsavel(a.grupo, resolvida.responsavel) };
  }

  // 1. Camada 1 (base): todas as fontes ativas, em paralelo. Uma falhar não derruba a outra.
  //    Fonte que FALHOU hoje (ver `falhou`) sai pela leitura guardada válida, se houver, com o
  //    motivo de hoje anotado (spec 2026-10-20 §5.1, passo 2).
  const lidasHoje: FonteLida[] = await Promise.all(
    resolvida.fontes.map((fonte, i) => lerFonte(fonte, deps, agora, (l) => !falhou(l, i === 0), MOTIVO_SEM_NINGUEM, GUARDADA_COM_PESSOAS)),
  );
  // Leitura parcial da primária (§5.1, passo 4): só a guardada que casa mais contatos a substitui.
  const { lidas, primariaParcial } = reaproveitarParcial(lidasHoje, contatos, deps, agora);
  const urlPrimaria = resolvida.fontes[0]?.url;
  const primariaReaproveitada = lidas[0]?.reaproveitada;
  const primariaAlternativa = lidas[0]?.alternativa;
  // Toda URL pedida hoje, principal e alternativa, sai com o grupo para o mapa de falhas (§3.4).
  const tentadas = lidas.flatMap((l) => l.tentadas);
  // Toda fonte que contribuiu entra na composição, na ordem do catálogo: dado oficial da
  // Camada 1 nunca é descartado, nem quando a primária caiu. O que a falha de UMA fonte
  // entre várias suspende é a CONCLUSÃO, não a comparação — ver `leituraParcial` abaixo.
  const pessoasPagina = unirFontes(
    lidas.map((l) => (l.conteudo ? marcarProveniencia(l.conteudo.pessoas, l.fonte, urlDoConteudo(l)) : [])),
  );
  const naoContribuiram = lidas.filter((l) => !contribuiu(l));
  const algumaContribuiu = lidas.some(contribuiu);
  // LEITURA PARCIAL (no sentido de 2026-09-24): alguma fonte ativa compôs o grupo e outra
  // FALHOU (ver `falhou`). É a única situação em que o veredito de saída fica suspenso — ver o
  // passo 4. Fonte reaproveitada pela memória contribuiu e não falhou. Fonte que respondeu e
  // não tinha ninguém a listar não entra aqui: vira só ressalva em `erroFonte`. Quando NENHUMA
  // fonte contribuiu nada muda em relação ao que já existia: a composição da IA, se houver, é
  // composição real e continua podendo apontar saída (marcada `viaPesquisaAmpla`); sem IA,
  // cai em fonte inacessível.
  const leituraParcial = algumaContribuiu && lidas.some((l, i) => falhou(l, i === 0));
  // A Camada 2 recebe o texto da fonte primária — uma chamada por grupo, como sempre.
  const textoLimpo = lidas[0]?.conteudo?.textoLimpo ?? "";

  // 2. Camada 2 (refinamento/cobertura): composição via IA. Sem chave → [].
  // Fonte que é só lista de cargos não tem composição de pessoas a refinar: a IA não roda.
  // Com a primária reaproveitada a IA também não roda (spec 2026-10-20 §5.1, passo 5): a
  // composição guardada é a de um dia bom e não precisa de resgate. Primária que falhou SEM
  // memória válida segue como sempre: a IA compõe sozinha (decisão 3).
  const primariaCasaPessoa = (resolvida.fontes[0]?.casamento ?? "pessoa") === "pessoa";
  const pessoasIA = primariaCasaPessoa && !primariaReaproveitada ? await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo) : [];
  const composicao = mesclarComposicao(pessoasPagina, pessoasIA, contatos);

  // 3. Sem composição (nenhuma fonte legível E IA vazia): NUNCA "saída" — "não verificado".
  if (composicao.length === 0) {
    if (urlPrimaria) {
      // Diferencia scrape que lançou erro de página que veio sem conteúdo legível (JS).
      const motivo = lidas[0]?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO;
      return {
        grupo: comResponsavel(
          marcarFonteInacessivel(grupo, contatos, urlPrimaria, motivo, resolvida.grupoCanonico),
          resolvida.responsavel,
        ),
        leituras: SEM_LEITURAS,
        tentadas,
      };
    }
    // sem URL → sem fonte
    return {
      grupo: comResponsavel(compararGrupo(grupo, contatos, undefined, resolvida.grupoCanonico), resolvida.responsavel),
      leituras: SEM_LEITURAS,
      tentadas,
    };
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
  const r = compararGrupo(grupo, contatos, fonte, resolvida.grupoCanonico, resolvida.ufs, leituraParcial);
  // LEITURA SUSPEITA: composição real (página, memória e/ou IA) que não casa nenhum contato de
  // um grupo com 2+ contatos é, na prática, página que não montou, layout que mudou ou página
  // errada, nunca um grupo inteiro que saiu. Não se confia nela: o grupo fica indeterminado,
  // com o motivo, e o fiscal confere à mão; sem `novos`, que viriam da mesma leitura ruim. A
  // leitura parcial já suspende a saída (ninguém vira possível saída) e nunca dispara aqui.
  // Grupo SEM URL no catálogo (composição só da IA) cai no caminho "sem fonte": a tela diz
  // "cadastrar fonte", e não aparece um link "abrir" apontando para o sentinela da IA.
  // Leitura ruim de hoje não entra na memória.
  if (leituraSuspeita(r)) {
    return {
      grupo: comResponsavel(
        urlPrimaria
          ? marcarFonteInacessivel(grupo, contatos, urlPrimaria, MOTIVO_LEITURA_SUSPEITA, resolvida.grupoCanonico)
          : compararGrupo(grupo, contatos, undefined, resolvida.grupoCanonico),
        resolvida.responsavel,
      ),
      leituras: SEM_LEITURAS,
      tentadas,
    };
  }
  // Ressalva atribuída A CADA fonte que não compôs — sem identificar qual, "HTTP 403" parece
  // falha da primária. Vale para as duas formas de não compor, inclusive a que NÃO suspende o
  // veredito: o usuário tem que saber que aquela fonte não trouxe nada. Fonte secundária
  // reaproveitada pela memória também é anotada aqui (spec 2026-10-20 §5.1, passo 6), sem
  // mudar o veredito, e a secundária lida pela URL alternativa (spec 2026-10-23 §3.3). Só
  // rótulo/URL e o motivo técnico: nunca um contato.
  const anotacoes = [
    ...naoContribuiram.map((l) => `${identificarFonte(l.fonte)}: ${l.erro ?? MOTIVO_SEM_NINGUEM}`),
    ...lidas.slice(1).flatMap((l) => (l.reaproveitada ? [`${identificarFonte(l.fonte)}: ${anotacaoReaproveitada(l.reaproveitada)}`] : [])),
    ...lidas.slice(1).flatMap((l) => (l.alternativa ? [`${identificarFonte(l.fonte)}: lida pela URL alternativa (${l.alternativa.motivoPrincipal})`] : [])),
  ];
  const erro = algumaContribuiu && anotacoes.length > 0 ? anotacoes.join(" · ") : undefined;
  // Marca o grupo quando a composição dependeu do conhecimento da IA (não 100% oficial).
  const usouConhecimento = composicao.some((p) => p.origem === "conhecimento");
  return {
    grupo: comResponsavel(
      {
        ...r,
        ...(erro ? { erroFonte: erro } : {}),
        // Primária substituída pela guardada: o grupo sai LIDO, com a data e o motivo (§5.1, passo 6).
        ...(primariaReaproveitada && urlPrimaria ? { reaproveitada: { url: urlPrimaria, ...primariaReaproveitada } } : {}),
        // Primária lida pela URL alternativa: a `fonteUrl` do grupo continua a principal (§3.3).
        ...(primariaAlternativa ? { alternativa: primariaAlternativa } : {}),
        ...(usouConhecimento || !urlPrimaria ? { viaPesquisaAmpla: true } : {}),
      },
      resolvida.responsavel,
    ),
    leituras: leiturasBoas(lidas, primariaParcial, agora),
    tentadas,
  };
}

function individualComConteudo(l: { conteudo?: ConteudoFonte; erro?: string }): boolean {
  return l.erro === undefined && l.conteudo !== undefined && paginaComConteudo(l.conteudo);
}

/** Pluraliza "N página(s) individual(is) inacessível(is)" para o motivo do grupo. */
function textoIndividuaisCaidas(n: number): string {
  return n === 1 ? "1 página individual inacessível" : `${n} páginas individuais inacessíveis`;
}

/**
 * Caminho por contato (spec 2026-10-15 §4 e §5): cada contato é verificado na SUA página
 * individual; a fonte de grupo, quando existe, é a lista de denominações de cargo
 * (`casamento: "cargo"`) ou, se compõe pessoas, só alimenta `novos`. Nenhuma leitura parcial
 * entre individuais: cada contato responde pela sua. A IA não participa. Página individual sem
 * conteúdo legível e geral sem ninguém saem pela leitura guardada válida (spec 2026-10-20 §5.2).
 */
async function analisarGrupoIndividual(
  grupo: string,
  contatos: ContatoPlanilha[],
  resolvida: FonteResolvida,
  deps: Dependencias,
  agora: Date,
): Promise<AnaliseDoGrupo> {
  const grupoCanonico = resolvida.grupoCanonico;
  const ligacoes = contatos.map((c) => ({ contato: c, fonte: fonteIndividualDe(c, resolvida.fontesIndividuais) }));
  // Cada URL é lida UMA vez, mesmo com dois contatos ligados a ela; individual sem contato não é lida.
  const aLer = [...new Map(ligacoes.flatMap((l) => (l.fonte ? [[l.fonte.url, l.fonte] as const] : []))).values()];
  const geral = resolvida.fontes[0];
  // A geral entra na fila do Chrome ANTES das individuais: lida por último, chegava quando o
  // gov.br já limitava os pedidos (HTTP 429 em 2026-10-15) e o cargo de todos ficava sem fonte.
  const leituraGeral = geral ? lerFonte(geral, deps, agora, contribuiu, MOTIVO_PAGINA_SEM_CONTEUDO, GUARDADA_COM_PESSOAS) : Promise.resolve(undefined);
  const [lidaGeral, lidasInd] = await Promise.all([
    leituraGeral,
    Promise.all(aLer.map((f) => lerFonte(f, deps, agora, individualComConteudo, MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO))),
  ]);
  const porUrl = new Map<string, IndividualLida>(lidasInd.map((l) => [l.fonte.url, l]));
  const tentadas = [...(lidaGeral?.tentadas ?? []), ...lidasInd.flatMap((l) => l.tentadas)];

  // Fonte do cargo do grupo: a lista de denominações, ou o motivo de ela não ter vindo.
  const geralContribuiu = lidaGeral !== undefined && contribuiu(lidaGeral);
  const listaCargos: ListaCargos | undefined =
    geral && geral.casamento === "cargo"
      ? geralContribuiu
        ? { url: urlDoConteudo(lidaGeral!), cargos: listaDeCargos(lidaGeral!.conteudo!) }
        : { url: geral.url, erro: lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO }
      : undefined;

  const vereditos = ligacoes.map((l) => {
    if (!l.fonte) {
      return {
        resultado: compararContatoSemIndividual(l.contato, { grupoCanonico, listaCargos, uf: ufDoContato(l.contato) }),
        nomeConfirmado: false,
        lidaHoje: false,
        novos: [] as PessoaSite[],
      };
    }
    const lida = porUrl.get(l.fonte.url)!;
    const v = compararContatoIndividual({ contato: l.contato, fonte: l.fonte, lida, listaCargos, grupoCanonico });
    // Página reaproveitada: o contato é comparado como se ela fosse de hoje; só a data fica registrada (§5.2).
    return {
      ...v,
      resultado: lida.reaproveitada ? { ...v.resultado, leituraDe: lida.reaproveitada.lidaEm } : v.resultado,
      lidaHoje: lida.reaproveitada === undefined,
    };
  });

  // Página reaproveitada não é lida nem caída (§4.1).
  const lidas = lidasInd.filter((l) => individualComConteudo(l) && !l.reaproveitada).length;
  const reaproveitadasInd = lidasInd.filter((l) => l.reaproveitada !== undefined).length;
  const caidas = lidasInd.length - lidas - reaproveitadasInd;
  const geralReaproveitada = lidaGeral?.reaproveitada;
  const reaproveitadas = reaproveitadasInd + (geralReaproveitada ? 1 : 0);
  const individuais = { lidas, caidas, ...(reaproveitadas > 0 ? { reaproveitadas } : {}) };
  const geralFalhou = geral !== undefined && !geralContribuiu;

  // Nenhuma fonte, de grupo ou individual, com conteúdo (hoje ou pela memória): grupo inacessível, como sempre.
  if (aLer.length + (geral ? 1 : 0) > 0 && lidas + reaproveitadasInd === 0 && (geral === undefined || geralFalhou)) {
    const motivo = [
      geral ? `${identificarFonte(geral)}: ${lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO}` : undefined,
      caidas > 0 ? textoIndividuaisCaidas(caidas) : undefined,
    ].filter(Boolean).join(" · ");
    return { grupo: { ...marcarFonteInacessivel(grupo, contatos, geral?.url, motivo, grupoCanonico), individuais }, leituras: SEM_LEITURAS, tentadas };
  }

  // GUARDA DE GRUPO (§4.3 de 2026-10-15): duas ou mais individuais lidas HOJE com conteúdo e
  // nenhuma confirmou o nome do seu contato é layout que mudou ou bloqueio devolvendo outra
  // página, nunca todo mundo saindo de uma vez. Indeterminado, com o motivo, sem novos. As
  // páginas reaproveitadas não contam: já foram leituras boas (spec 2026-10-20 §5.2).
  const confirmadasHoje = vereditos.filter((v) => v.lidaHoje && v.nomeConfirmado).length;
  if (lidas >= MIN_CONTATOS_LEITURA_SUSPEITA && confirmadasHoje === 0) {
    return { grupo: { ...marcarFonteInacessivel(grupo, contatos, geral?.url, MOTIVO_LEITURA_SUSPEITA, grupoCanonico), individuais }, leituras: SEM_LEITURAS, tentadas };
  }

  const erros = [
    ...(geralFalhou ? [`${identificarFonte(geral!)}: ${lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO}`] : []),
    ...lidasInd.filter((l) => !individualComConteudo(l)).map((l) => `${l.fonte.url}: ${l.erro ?? MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO}`),
  ];
  // Fonte de grupo que compõe pessoas (não é o caso do catálogo de hoje): só propõe inclusão.
  const novosDaGeral =
    geral && geral.casamento !== "cargo" && geralContribuiu
      ? novosForaDaPlanilha(marcarProveniencia(lidaGeral!.conteudo!.pessoas, geral, urlDoConteudo(lidaGeral!)), contatos)
      : [];
  return {
    grupo: {
      grupo,
      ...(geral ? { fonteUrl: geral.url } : {}),
      semFonte: false,
      contatos: vereditos.map((v) => v.resultado),
      novos: [...vereditos.flatMap((v) => v.novos), ...novosDaGeral],
      ...(erros.length > 0 ? { erroFonte: erros.join(" · ") } : {}),
      // A geral é a `fonteUrl` do grupo: reaproveitada, o cabeçalho diz a data e o motivo.
      ...(geral && geralReaproveitada ? { reaproveitada: { url: geral.url, ...geralReaproveitada } } : {}),
      // Geral lida pela URL alternativa: a `fonteUrl` do grupo continua a principal (spec 2026-10-23 §3.3).
      ...(lidaGeral?.alternativa ? { alternativa: lidaGeral.alternativa } : {}),
      individuais,
    },
    // §4.3: individuais com conteúdo e geral com denominação entram na memória; reaproveitadas voltam com a data original.
    leituras: [
      ...lidasInd.filter(individualComConteudo).map((l) => guardar(l, agora)),
      ...(lidaGeral && contribuiu(lidaGeral) ? [guardar(lidaGeral, agora)] : []),
    ],
    tentadas,
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

function resumir(grupos: ResultadoGrupo[], falhas: FalhasPorUrl): ResumoAnalise {
  const resumo: ResumoAnalise = {
    total: 0,
    verde: 0,
    amarelo: 0,
    vermelho: 0,
    novo: 0,
    indeterminado: 0,
    enderecosAConfirmar: 0,
    possivelSaida: 0,
    contatosSemFonte: 0,
    gruposSemFonte: 0,
    gruposFonteInacessivel: 0,
    gruposViaPesquisaAmpla: 0,
    gruposReaproveitados: 0,
    urlsCaidasRepetidas: contarUrlsCaidas(falhas),
    gruposComMudanca: 0,
  };
  for (const g of grupos) {
    if (g.semFonte) resumo.gruposSemFonte += 1;
    if (g.fonteInacessivel) resumo.gruposFonteInacessivel += 1;
    if (g.viaPesquisaAmpla) resumo.gruposViaPesquisaAmpla += 1;
    if (g.reaproveitada || (g.individuais?.reaproveitadas ?? 0) > 0) resumo.gruposReaproveitados += 1;
    resumo.novo += g.novos.length;
    for (const c of g.contatos) {
      resumo.total += 1;
      resumo[c.semaforo] += 1;
      if (c.endereco?.situacao === "pendente") resumo.enderecosAConfirmar += 1;
      if (c.possivelSaida) resumo.possivelSaida += 1;
      // Grupo sem fonte, ou contato de grupo com individuais que não tem a sua ("cadastrar fonte").
      if (g.semFonte || c.camposDivergentes.some((d) => d.campo === "fonte")) resumo.contatosSemFonte += 1;
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
  const agora = deps.agora?.() ?? new Date();
  const indice = enderecos && enderecos.length > 0 ? indexarEnderecos(enderecos) : undefined;
  const porGrupo = agruparPorGrupo(contatos);
  const analisados = await Promise.all(
    [...porGrupo.entries()].map(([grupo, lista]) => analisarGrupo(grupo, lista, deps, agora)),
  );
  const grupos = analisados.map((a) => anexarEnderecos(a.grupo, indice));
  // A memória que sai desta varredura (spec 2026-10-20 §6, passo 3): a anterior podada,
  // sobreposta pelas leituras boas de hoje e pelas reaproveitadas, com a data original.
  const leituras = mesclarLeituras(deps.leiturasAnteriores ?? {}, analisados.flatMap((a) => a.leituras), agora);
  // URLs que falharam hoje somam uma coleta à contagem anterior; as lidas saem do mapa (spec 2026-10-23 §3.4).
  const falhas = atualizarFalhas(deps.falhasAnteriores ?? {}, analisados.flatMap((a) => a.tentadas), agora);
  return { arquivoNome, grupos, resumo: resumir(grupos, falhas), leituras, falhas };
}
