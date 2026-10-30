/**
 * Agrupador da Posse 2027 (spec 2026-10-30 §4.5): os 28 grupos do Contatos, na ordem do Clovis,
 * cada um com o rótulo exato do Contatos e o modo de fiscalização.
 *
 * - `fonte`: página oficial do catálogo, como sempre.
 * - `lista`: comparado com as planilhas (TSE, Câmara), nunca com página nem IA (spec §4.6).
 * - `neutro`: grupo de convidados, sem fonte oficial; fora das Camadas 1 e 2.
 */
export type ModoFiscalizacao = "fonte" | "lista" | "neutro";

export interface GrupoPosse {
  rotulo: string;
  fiscalizacao: ModoFiscalizacao;
}

export const GRUPO_SENADORES_ELEITOS = "Senadores eleitos - Posse Presidencial 2027";
export const GRUPO_DEPUTADOS_ELEITOS = "Deputado Federal eleitos - Posse Presidencial 2027";
export const GRUPO_GOVERNADORES_ELEITOS = "Governadores eleitos - Posse Presidencial 2027";

/** Igual a `NOME_GRUPO_DEPUTADOS` de `lib/painel-deputados.ts` (um teste confere). */
export const GRUPO_DEPUTADOS_FEDERAIS = "Deputados Federais";
export const GRUPO_SENADORES = "Senadores";
export const GRUPO_GOVERNADORES = "Governadores";

const fonte = (rotulo: string): GrupoPosse => ({ rotulo, fiscalizacao: "fonte" });
const lista = (rotulo: string): GrupoPosse => ({ rotulo, fiscalizacao: "lista" });
const neutro = (rotulo: string): GrupoPosse => ({ rotulo, fiscalizacao: "neutro" });

export const GRUPOS_POSSE: readonly GrupoPosse[] = [
  fonte("Defensor Público Geral"),
  fonte("Ministros do STF"),
  fonte("Ministros do TSE"),
  fonte("Ministros do STJ"),
  fonte("Ex-Presidentes do Senado"),
  fonte(GRUPO_GOVERNADORES),
  fonte("Ministros do STM"),
  fonte("Ministros do TST"),
  fonte("Ministros do TCU"),
  fonte("Presidente da República"),
  fonte("Ministros de Estado"),
  fonte("Embaixadores"),
  fonte("Procurador-Geral da República"),
  fonte("Presidente da Câmara dos Deputados"),
  fonte(GRUPO_SENADORES),
  fonte("Ex-Presidentes da República"),
  fonte("Senadores titulares fora de exercício - Posse 2027"),
  lista(GRUPO_GOVERNADORES_ELEITOS),
  lista(GRUPO_SENADORES_ELEITOS),
  lista(GRUPO_DEPUTADOS_FEDERAIS),
  lista(GRUPO_DEPUTADOS_ELEITOS),
  neutro("Ministros de Estado Indicados - Posse 2027"),
  neutro("Convidados do presidente eleito - Posse 2027"),
  neutro("Convidados do vice presidente eleito - Posse 2027"),
  neutro("Convidado do presidente do Congresso e Câmara 2027"),
  neutro("Familiares do presidente eleito e do vice - 2027"),
  neutro("Chefes de Estado, Gov, Presidentes Parlam - 2027"),
  neutro("Delegações estrangeiras e organismos intern - 2027"),
];
