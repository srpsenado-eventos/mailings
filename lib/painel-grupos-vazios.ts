import { GRUPO_DEPUTADOS_FEDERAIS } from "@/data/grupos-posse";
import { grupoDoAgrupador, type LinhaAgrupador } from "@/lib/agrupador";
import type { Filtro } from "@/lib/painel";
import type { SecaoGrupoEleito } from "@/lib/painel-eleicao";
import type { ResultadoGrupo, ResumoAnalise } from "@/lib/types";

export const TEXTO_GRUPO_NAO_CADASTRADO = "Grupo ainda não cadastrado no Contatos";

const PREFIXO_CONTATO_DE_TESTE = "teste";

export interface GrupoNaoCadastrado {
  rotulo: string;
  texto: string;
}

/** Linha de grupo não cadastrado; com `secao`, os eleitos classificados para ele aparecem no lugar dela. */
export interface LinhaGrupoNaoCadastrado extends GrupoNaoCadastrado {
  secao?: SecaoGrupoEleito;
}

/**
 * Contato criado só para abrir os grupos no Contatos (spec 2026-11-05 §8.2): rótulo com dois ou mais
 * segmentos e todos os contatos com nome começando por "Teste".
 */
function segmentosDoRotulo(g: ResultadoGrupo): string[] {
  return g.grupo.split(";").map((s) => s.trim()).filter((s) => s !== "");
}

export function ehGrupoDeTeste(g: ResultadoGrupo): boolean {
  if (segmentosDoRotulo(g).length < 2 || g.contatos.length === 0) return false;
  return g.contatos.every((c) => c.contato.nome.trim().toLowerCase().startsWith(PREFIXO_CONTATO_DE_TESTE));
}

/** Segmentos dos grupos de teste que o agrupador não reconhece, aparados e sem repetição. */
export function rotulosDeTesteForaDoAgrupador(grupos: readonly ResultadoGrupo[]): string[] {
  const segmentos = grupos.filter(ehGrupoDeTeste).flatMap(segmentosDoRotulo);
  return [...new Set(segmentos)].filter((s) => grupoDoAgrupador(s) === undefined);
}

const CONTADORES_DO_SEMAFORO = ["verde", "amarelo", "vermelho", "indeterminado"] as const;

/** Retrato sem os grupos de teste, com `total` e os contadores do semáforo descontados. Não muta. */
export function retratoSemGruposDeTeste<T extends { grupos: ResultadoGrupo[]; resumo: ResumoAnalise }>(retrato: T): T {
  const testes = retrato.grupos.filter(ehGrupoDeTeste);
  if (testes.length === 0) return retrato;
  const resumo: ResumoAnalise = { ...retrato.resumo };
  for (const c of testes.flatMap((g) => g.contatos)) {
    resumo.total -= 1;
    const chave = CONTADORES_DO_SEMAFORO.find((k) => k === c.semaforo);
    if (chave) resumo[chave] -= 1;
  }
  return { ...retrato, grupos: retrato.grupos.filter((g) => !ehGrupoDeTeste(g)), resumo };
}

/** Linhas do agrupador sem nenhum contato no Contatos, com o motivo da decisão do GT quando houver. */
export function gruposNaoCadastrados(
  linhas: readonly LinhaAgrupador[],
  motivos: Readonly<Record<string, readonly string[]>>,
  temDeputadosVirtual: boolean,
  rotulosExtras: readonly string[] = [],
): GrupoNaoCadastrado[] {
  const doAgrupador = linhas
    .filter((l) => l.noContatos === 0 && !l.foraDoAgrupador)
    .filter((l) => !(temDeputadosVirtual && l.rotulo === GRUPO_DEPUTADOS_FEDERAIS))
    .map((l) => {
      const dos = motivos[l.rotulo] ?? [];
      return { rotulo: l.rotulo, texto: dos.length > 0 ? dos.join(" · ") : TEXTO_GRUPO_NAO_CADASTRADO };
    });
  const extras = rotulosExtras.map((rotulo) => ({ rotulo, texto: TEXTO_GRUPO_NAO_CADASTRADO }));
  return [...doAgrupador, ...extras];
}

/**
 * Linhas dos grupos não cadastrados, com a seção dos eleitos de cada um (spec 2026-11-05 §9.1). Com
 * grupo escolhido, só a linha dele; sem grupo, entra quem tem seção visível e, no filtro "tudo" sem
 * busca, também quem não tem.
 */
export function linhasDosGruposNaoCadastrados(
  lista: readonly GrupoNaoCadastrado[],
  secoes: readonly SecaoGrupoEleito[],
  { filtro, busca, grupo }: { filtro: Filtro; busca: string; grupo: string },
): LinhaGrupoNaoCadastrado[] {
  const linhas = lista.map((l): LinhaGrupoNaoCadastrado => {
    const secao = secoes.find((s) => s.grupo === l.rotulo);
    return secao ? { ...l, secao } : { ...l };
  });
  if (grupo !== "") return linhas.filter((l) => l.rotulo === grupo);
  const semRecorte = filtro === "tudo" && busca.trim() === "";
  return linhas.filter((l) => semRecorte || l.secao !== undefined);
}

/**
 * Seções dos grupos que não estão entre os não cadastrados: só com a chave "Eleição 2026" ligada e,
 * com grupo escolhido, só a do próprio grupo (que pode vir pelo apelido do Contatos).
 */
export function secoesDosDemaisGrupos(
  secoes: readonly SecaoGrupoEleito[],
  lista: readonly GrupoNaoCadastrado[],
  { eleicaoLigada, grupo }: { eleicaoLigada: boolean; grupo: string },
): SecaoGrupoEleito[] {
  if (!eleicaoLigada) return [];
  const demais = secoes.filter((s) => !lista.some((l) => l.rotulo === s.grupo));
  if (grupo === "") return demais;
  const rotulo = grupoDoAgrupador(grupo)?.rotulo ?? grupo;
  return demais.filter((s) => s.grupo === rotulo);
}
