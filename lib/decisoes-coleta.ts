import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES_ELEITOS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import {
  grupoEquivalente, registrarColetas, vigente, type CasoDecidido, type HistoricoDecisoes,
} from "@/lib/decisoes";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";
import { NOME_GRUPO_DEPUTADOS, temGrupoDeputados } from "@/lib/painel-deputados";
import type { ContatoDoEleito, ResultadoEleicao, ResultadoGrupo, Retrato } from "@/lib/types";

/**
 * Depois de cada coleta (spec 2026-10-30 §4.1.4): os grupos em que a pessoa de cada caso decidido
 * está agora, e a entrada `coleta` no histórico. Funções puras.
 */

interface EleitoDoEixo {
  nomes: readonly string[];
  contatos: readonly ContatoDoEleito[];
  grupoDaLista: string;
  grupoDestino?: string;
}

/** Eleitos de 2026 (Senado, Câmara e governos) com os nomes e o grupo de destino. */
function eleitosDoEixo(eleicao: ResultadoEleicao): EleitoDoEixo[] {
  const parlamentares = eleicao.eleitos.map(({ eleito, contatos, grupoDestino }) => ({
    nomes: [eleito.nomeUrna, eleito.nomeCompleto],
    contatos,
    grupoDaLista: eleito.casa === "senado" ? GRUPO_SENADORES_ELEITOS : GRUPO_DEPUTADOS_ELEITOS,
    ...(grupoDestino ? { grupoDestino } : {}),
  }));
  const governadores = (eleicao.governadores?.eleitos ?? []).map(({ eleito, contatos, grupoDestino }) => ({
    nomes: [eleito.nomeUrna, eleito.nomeCompleto],
    contatos,
    grupoDaLista: GRUPO_GOVERNADORES_ELEITOS,
    ...(grupoDestino ? { grupoDestino } : {}),
  }));
  return [...parlamentares, ...governadores];
}

const casaAlgumaChave = (nomes: readonly string[], chaves: ReadonlySet<string>): boolean =>
  nomes.some((n) => chaves.has(normalizarNome(n)));

/**
 * Grupos atuais do caso, na forma equivalente (`grupoEquivalente`), sem repetição:
 * - contatos de `grupos` cujo nome normalizado é uma chave do caso;
 * - deputados atuais da planilha da Câmara (nome parlamentar ou civil), enquanto o grupo Deputados
 *   Federais não existe no Contatos, valendo como "Deputados Federais";
 * - eleitos de 2026 ligados a linhas do Contatos e com grupo de destino, valendo como esse grupo
 *   (eleito em `conferir`, sem destino, não conta: as linhas dele no Contatos já contam).
 * Saem os grupos que a decisão vigente marcou como outra pessoa (`outraPessoa`).
 */
export function gruposAtuaisDoCaso(
  caso: CasoDecidido,
  grupos: readonly ResultadoGrupo[],
  eleicao?: ResultadoEleicao,
): string[] {
  const chaves = new Set(caso.chaves);
  const doContatos = grupos
    .filter((g) => g.contatos.some((c) => chaves.has(normalizarNome(c.contato.nome))))
    .map((g) => grupoEquivalente(g.grupo, "contatos"));
  const daCamara = eleicao && temGrupoDeputados(eleicao)
    && (eleicao.deputadosAtuais ?? []).some((d) => casaAlgumaChave([d.nomeParlamentar, d.nomeCivil], chaves))
    ? [grupoEquivalente(NOME_GRUPO_DEPUTADOS, "camara")]
    : [];
  const daEleicao = eleicao
    ? eleitosDoEixo(eleicao)
      .filter((e) => e.contatos.length > 0 && e.grupoDestino !== undefined && casaAlgumaChave(e.nomes, chaves))
      .map((e) => grupoEquivalente(e.grupoDaLista, "eleicao", e.grupoDestino))
    : [];

  const outraPessoa = new Set((vigente(caso)?.outraPessoa ?? []).map((g) => normalizarTexto(grupoEquivalente(g, "contatos"))));
  const vistos = new Set<string>();
  return [...doContatos, ...daCamara, ...daEleicao].filter((g) => {
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
  const novo = registrarColetas(h, (c) => gruposAtuaisDoCaso(c, retrato.grupos, retrato.eleicao), diaDaColeta(retrato.geradoEm));
  return novo.casos.every((c, i) => c === h.casos[i]) ? h : novo;
}
