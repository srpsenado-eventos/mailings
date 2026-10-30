import {
  grupoEquivalente, gruposAtuaisParaOCaso, registrarColetas, vigente, type CasoDecidido, type HistoricoDecisoes,
} from "@/lib/decisoes";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import type { ContatoDoEleito, ResultadoEleicao, ResultadoGrupo, Retrato } from "@/lib/types";

/**
 * Depois de cada coleta (spec 2026-10-30 §4.1.4): os grupos em que a pessoa de cada caso decidido
 * está agora, e a entrada `coleta` no histórico. Funções puras.
 */

interface EleitoDoEixo {
  nomes: readonly string[];
  contatos: readonly ContatoDoEleito[];
}

/** Eleitos de 2026 (Senado, Câmara e governos) com os nomes e as linhas do Contatos ligadas. */
function eleitosDoEixo(eleicao: ResultadoEleicao): EleitoDoEixo[] {
  return [...eleicao.eleitos, ...(eleicao.governadores?.eleitos ?? [])].map(({ eleito, contatos }) => ({
    nomes: [eleito.nomeUrna, eleito.nomeCompleto],
    contatos,
  }));
}

const casaAlgumaChave = (nomes: readonly string[], chaves: ReadonlySet<string>): boolean =>
  nomes.some((n) => chaves.has(normalizarNome(n)));

/**
 * Grupos atuais do caso **no Contatos**, na forma equivalente (`grupoEquivalente`), sem repetição:
 * - os grupos do retrato com um contato cujo nome normalizado é uma chave do caso;
 * - os grupos das linhas do Contatos ligadas aos eleitos de 2026 do caso (pelo nome de urna ou completo).
 * As listas de fora (planilha da Câmara, grupo de destino do eleito) não entram: a situação no
 * Contatos só olha o Contatos. Saem os grupos que a decisão vigente marcou como outra pessoa.
 */
export function gruposAtuaisDoCaso(
  caso: CasoDecidido,
  grupos: readonly ResultadoGrupo[],
  eleicao?: ResultadoEleicao,
): string[] {
  const chaves = new Set(caso.chaves);
  const doRetrato = grupos
    .filter((g) => g.contatos.some((c) => chaves.has(normalizarNome(c.contato.nome))))
    .map((g) => g.grupo);
  const dosEleitos = eleicao
    ? eleitosDoEixo(eleicao).filter((e) => casaAlgumaChave(e.nomes, chaves)).flatMap((e) => e.contatos.map((c) => c.grupo))
    : [];

  const outraPessoa = new Set((vigente(caso)?.outraPessoa ?? []).map((g) => normalizarTexto(grupoEquivalente(g, "contatos"))));
  const vistos = new Set<string>();
  return [...doRetrato, ...dosEleitos].map((g) => grupoEquivalente(g, "contatos")).filter((g) => {
    const chave = normalizarTexto(g);
    if (outraPessoa.has(chave) || vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/** Dia `AAAA-MM-DD` no fuso de Brasília ("en-CA" já formata assim). */
const FORMATO_DIA_BRASILIA = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/Sao_Paulo" });

/** Data da coleta (`AAAA-MM-DD`, Brasília) a partir do `geradoEm` do retrato. */
export function diaDaColeta(geradoEm: string): string {
  return FORMATO_DIA_BRASILIA.format(new Date(geradoEm));
}

/**
 * `registrarColetas` com os grupos atuais tirados do retrato e a data da varredura. Sem nenhuma
 * entrada nova, devolve o mesmo histórico (quem grava pode pular a gravação).
 */
export function registrarColetasDoRetrato(
  h: HistoricoDecisoes,
  retrato: Pick<Retrato, "grupos" | "eleicao" | "geradoEm">,
): HistoricoDecisoes {
  // Grupo coberto só por outro caso da mesma pessoa não conta (`gruposAtuaisParaOCaso`, a mesma regra da tela).
  const gruposDoCaso = (c: CasoDecidido): string[] =>
    gruposAtuaisParaOCaso(c, gruposAtuaisDoCaso(c, retrato.grupos, retrato.eleicao), h.casos);
  const novo = registrarColetas(h, gruposDoCaso, diaDaColeta(retrato.geradoEm));
  return novo.casos.every((c, i) => c === h.casos[i]) ? h : novo;
}

/** Aviso da varredura cujo histórico de decisões não pôde ser atualizado (o retrato foi guardado). */
export const AVISO_DECISOES_NAO_ATUALIZADAS =
  "A varredura terminou e o retrato foi guardado, mas o histórico das decisões do GT não foi atualizado com esta coleta.";

const PARAMETRO_AVISO = "aviso";
const VALOR_AVISO_DECISOES = "decisoes";

/**
 * Para onde a tela de Nova varredura vai depois de uma varredura guardada. Com o aviso das
 * decisões, a URL leva só uma marca fixa (nunca o texto), e o painel mostra o texto.
 */
export function rotaDepoisDaVarredura(avisoDecisoes: string | undefined): string {
  return avisoDecisoes ? `/?${PARAMETRO_AVISO}=${VALOR_AVISO_DECISOES}` : "/";
}

/** Texto do aviso a partir do parâmetro `aviso` da URL do painel; outro valor não vira aviso. */
export function avisoDoParametro(valor: string | string[] | undefined): string | undefined {
  const primeiro = Array.isArray(valor) ? valor[0] : valor;
  return primeiro === VALOR_AVISO_DECISOES ? AVISO_DECISOES_NAO_ATUALIZADAS : undefined;
}
