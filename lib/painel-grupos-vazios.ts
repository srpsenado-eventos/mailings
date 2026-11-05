import { GRUPO_DEPUTADOS_FEDERAIS } from "@/data/grupos-posse";
import { grupoDoAgrupador, type LinhaAgrupador } from "@/lib/agrupador";
import type { Filtro } from "@/lib/painel";
import type { ResultadoGrupo, ResumoAnalise } from "@/lib/types";

export const TEXTO_GRUPO_NAO_CADASTRADO = "Grupo ainda não cadastrado no Contatos";

const PREFIXO_CONTATO_DE_TESTE = "teste";

export interface GrupoNaoCadastrado {
  rotulo: string;
  texto: string;
}

/**
 * Contato criado só para abrir os grupos no Contatos (spec 2026-11-05 §8.2): rótulo com dois ou mais
 * grupos, todos do agrupador, e todos os contatos com nome começando por "Teste".
 */
export function ehGrupoDeTeste(g: ResultadoGrupo): boolean {
  const segmentos = g.grupo.split(";").map((s) => s.trim()).filter((s) => s !== "");
  if (segmentos.length < 2 || g.contatos.length === 0) return false;
  if (!segmentos.every((s) => grupoDoAgrupador(s) !== undefined)) return false;
  return g.contatos.every((c) => c.contato.nome.trim().toLowerCase().startsWith(PREFIXO_CONTATO_DE_TESTE));
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
): GrupoNaoCadastrado[] {
  return linhas
    .filter((l) => l.noContatos === 0 && !l.foraDoAgrupador)
    .filter((l) => !(temDeputadosVirtual && l.rotulo === GRUPO_DEPUTADOS_FEDERAIS))
    .map((l) => {
      const dos = motivos[l.rotulo] ?? [];
      return { rotulo: l.rotulo, texto: dos.length > 0 ? dos.join(" · ") : TEXTO_GRUPO_NAO_CADASTRADO };
    });
}

/** Com grupo escolhido, só a linha dele; sem grupo, todas, mas apenas no filtro "tudo" e sem busca. */
export function gruposVaziosVisiveis(
  lista: readonly GrupoNaoCadastrado[],
  { filtro, busca, grupo }: { filtro: Filtro; busca: string; grupo: string },
): GrupoNaoCadastrado[] {
  if (grupo !== "") return lista.filter((l) => l.rotulo === grupo);
  return filtro === "tudo" && busca.trim() === "" ? [...lista] : [];
}
