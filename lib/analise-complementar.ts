import type {
  ComparacaoCampo,
  ConteudoFonte,
  ContatoPlanilha,
  FonteIndividual,
  LeituraAlternativa,
  Reaproveitamento,
  ResultadoContato,
  ResultadoGrupo,
  TentativaDeUrl,
} from "@/lib/types";
import { compararContatoIndividual, divergenciasDe, paginaComConteudo } from "@/lib/match";
import { fonteIndividualDe } from "@/lib/catalogo";
import type { LeituraColhida } from "@/lib/memoria-leitura";

/** Dia `AAAA-MM-DD` no fuso de Brasília ("en-CA" já formata assim). */
const FORMATO_DIA_BRASILIA = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * Fonte individual ainda dentro da validade (spec 2026-10-26 §3.3): sem `validaAte`, ou com o dia
 * da varredura em Brasília até ele, inclusive. Fonte vencida é tratada como inativa.
 */
export function individualVigente(fonte: FonteIndividual, agora: Date): boolean {
  return fonte.validaAte === undefined || FORMATO_DIA_BRASILIA.format(agora) <= fonte.validaAte;
}

export function individualComConteudo(l: { conteudo?: ConteudoFonte; erro?: string }): boolean {
  return l.erro === undefined && l.conteudo !== undefined && paginaComConteudo(l.conteudo);
}

/** Pluraliza "N página(s) individual(is) inacessível(is)" para o motivo do grupo. */
export function textoIndividuaisCaidas(n: number): string {
  return n === 1 ? "1 página individual inacessível" : `${n} páginas individuais inacessíveis`;
}

/** Leitura de uma página individual, como o orquestrador a produz (`Leitura<FonteIndividual>`). */
export interface IndividualLida {
  fonte: FonteIndividual;
  conteudo?: ConteudoFonte;
  erro?: string;
  reaproveitada?: Reaproveitamento;
  urlDaMemoria?: string;
  alternativa?: LeituraAlternativa;
  tentadas: TentativaDeUrl[];
}

/** O que a análise de um grupo devolve, no que `aplicarComplementares` precisa (ver `AnaliseDoGrupo`). */
export interface AnaliseComplementavel {
  grupo: ResultadoGrupo;
  leituras: LeituraColhida[];
  tentadas: TentativaDeUrl[];
}

/** O que o orquestrador empresta: ler uma página com memória e transformá-la em leitura guardável. */
export interface LeitorDePaginas {
  ler: (fonte: FonteIndividual) => Promise<IndividualLida>;
  guardar: (lida: IndividualLida) => LeituraColhida;
}

/** Observação do contato cuja página complementar foi lida e não traz o nome dele. */
export function observacaoSemNomeNaComplementar(url: string): string {
  return `Página complementar lida, mas o nome não foi encontrado nela: ${url}`;
}

/** Fonte individual que só complementa o grupo (spec 2026-11-19 v2 §2.3). */
export function ehComplementar(fonte: FonteIndividual): boolean {
  return fonte.complementar === true;
}

/**
 * O grupo segue o caminho de grupo e depois passa por `aplicarComplementares`: há ao menos uma
 * individual vigente e TODAS são complementares. Com alguma individual comum, o caminho por
 * contato de sempre decide tudo.
 */
export function soComplementares(vigentes: readonly FonteIndividual[]): boolean {
  return vigentes.length > 0 && vigentes.every(ehComplementar);
}

/**
 * Troca no resultado do grupo as comparações dos campos da página complementar pelas do veredito
 * individual. Campo que o veredito não traz (cargo vazio no cadastro) fica como o grupo decidiu.
 * O semáforo só é refeito quando era verde ou amarelo: vermelho e indeterminado são do grupo.
 */
function trocarCampos(r: ResultadoContato, doVeredito: readonly ComparacaoCampo[], fonte: FonteIndividual, leituraDe: string | undefined): ResultadoContato {
  const cobre = (campo: string) => (fonte.campos as readonly string[]).includes(campo);
  const novas = new Map(doVeredito.filter((c) => cobre(c.campo)).map((c) => [c.campo, c]));
  const trocadas = r.comparacoes.map((c) => novas.get(c.campo) ?? c);
  const jaTinha = new Set(r.comparacoes.map((c) => c.campo));
  const comparacoes = [...trocadas, ...[...novas.values()].filter((c) => !jaTinha.has(c.campo))];
  const camposDivergentes = divergenciasDe(comparacoes);
  const refaz = r.semaforo === "verde" || r.semaforo === "amarelo";
  return {
    ...r,
    comparacoes,
    camposDivergentes,
    ...(refaz ? { semaforo: camposDivergentes.length > 0 ? ("amarelo" as const) : ("verde" as const) } : {}),
    ...(leituraDe ? { leituraDe } : {}),
  };
}

/** Acrescenta o aviso à observação que o contato já tem, separando por " · ". */
function comObservacao(r: ResultadoContato, aviso: string): ResultadoContato {
  return { ...r, observacao: r.observacao ? `${r.observacao} · ${aviso}` : aviso };
}

/**
 * Passo final do caminho de grupo quando as fontes individuais vigentes são todas complementares
 * (spec 2026-11-19 v2 §2.3). A presença do contato (possível saída), os `novos` e o veredito de
 * vermelho e indeterminado vêm só do grupo; a página complementar só troca os campos que declara.
 * Grupo sem leitura (sem fonte ou inacessível) não passa por aqui: não há resultado a refinar.
 * Cada URL é lida uma vez. Devolve a análise com as leituras e URLs tentadas das complementares
 * somadas e `grupo.individuais` contando só elas.
 */
export async function aplicarComplementares(
  analise: AnaliseComplementavel,
  contatos: readonly ContatoPlanilha[],
  complementares: readonly FonteIndividual[],
  leitor: LeitorDePaginas,
): Promise<AnaliseComplementavel> {
  const { grupo } = analise;
  if (grupo.semFonte || grupo.fonteInacessivel || grupo.contatos.length !== contatos.length) return analise;
  const ligacoes = contatos.map((c) => fonteIndividualDe(c, complementares));
  const aLer = [...new Map(ligacoes.flatMap((f) => (f ? [[f.url, f] as const] : []))).values()];
  if (aLer.length === 0) return analise;

  const lidasInd = await Promise.all(aLer.map((f) => leitor.ler(f)));
  const porUrl = new Map(lidasInd.map((l) => [l.fonte.url, l]));

  const contatosFinais = grupo.contatos.map((resultado, i) => {
    const fonte = ligacoes[i];
    if (!fonte) return resultado;
    const lida = porUrl.get(fonte.url)!;
    const v = compararContatoIndividual({ contato: resultado.contato, fonte, lida, grupoCanonico: grupo.grupo });
    if (v.lidaComConteudo && !v.nomeConfirmado) {
      return comObservacao(resultado, observacaoSemNomeNaComplementar(lida.urlDaMemoria ?? lida.alternativa?.url ?? fonte.url));
    }
    return trocarCampos(resultado, v.resultado.comparacoes, fonte, lida.reaproveitada?.lidaEm);
  });

  // Página reaproveitada não é lida nem caída (spec 2026-10-20 §4.1).
  const lidas = lidasInd.filter((l) => individualComConteudo(l) && !l.reaproveitada).length;
  const reaproveitadas = lidasInd.filter((l) => l.reaproveitada !== undefined).length;
  const caidas = lidasInd.length - lidas - reaproveitadas;
  return {
    grupo: {
      ...grupo,
      contatos: contatosFinais,
      individuais: { lidas, caidas, ...(reaproveitadas > 0 ? { reaproveitadas } : {}) },
    },
    leituras: [...analise.leituras, ...lidasInd.filter(individualComConteudo).map((l) => leitor.guardar(l))],
    tentadas: [...analise.tentadas, ...lidasInd.flatMap((l) => l.tentadas)],
  };
}
