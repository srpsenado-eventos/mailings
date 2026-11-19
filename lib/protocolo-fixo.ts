import { GRUPOS_DE_TRIBUNAL } from "@/data/cargos-tribunal";
import { GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES_ELEITOS, GRUPO_MINISTROS_INDICADOS, GRUPO_SENADORES_ELEITOS, GRUPOS_POSSE } from "@/data/grupos-posse";
import { neutralizarGenero } from "@/lib/cargos";
import { normalizarTexto } from "@/lib/normalize";
import { contatoEhFeminino } from "@/lib/tratamento";
import type { ComparacaoCampo, ContatoPlanilha } from "@/lib/types";

/**
 * Protocolo fixo (spec 2026-11-05 §7.3 e 2026-11-13 §3.5, decisões do Clovis). Vale por cima da
 * tabela de protocolo e dos pares, nos presidentes ativos do Congresso e da Câmara, no grupo de
 * ex-presidentes do Congresso e em todo o grupo dos Chefes de Estado. Desde a spec 2026-11-19 §2.1 e §2.2
 * vale também para os eleitos (grupos de eleitos: "Senhor(a)" e "Ao Senhor"/"À Senhora") e para o
 * presidente de tribunal (STF "Excelentíssimo(a) Senhor(a)", os outros cinco "Senhor(a)").
 *
 * Não importa `lib/agrupador` nem `lib/catalogo`: `lib/match` importa este módulo e eles importam
 * `lib/match`, e o ciclo deixaria `OBSERVACAO_SEM_FONTE_OFICIAL` indefinido na avaliação do agrupador.
 */

const GRUPO_EX_PRESIDENTES = "Ex-Presidentes do Congresso";

/** Rótulo do agrupador da Posse (grupo neutro): protocolo fixo para todos, sem exceção por cargo (spec 2026-11-13 §3.5). */
export const GRUPO_CHEFES_DE_ESTADO = "Chefes de Estado, Gov, Presidentes Parlam - 2027";

/** Cargo ativo, normalizado: nunca "Vice-…" (não começa com "presidente") e nunca com período. */
const CARGO_ATIVO = /^presidente (do congresso nacional|do senado federal|da camara dos deputados)$/;

export interface ProtocoloFixo {
  tratamento: string;
  /** Ausente quando o GT ainda não decidiu o endereçamento (ministros indicados). */
  enderecamento?: string;
  /** Orientação que acompanha o endereçamento sem regra. */
  observacaoEnderecamento?: string;
}

/** Endereçamento dos ministros indicados ainda sem decisão do GT (19/11). */
export const OBSERVACAO_ENDERECAMENTO_INDICADOS = "Endereçamento dos ministros indicados: a definir pelo GT";

const ROTULO_INDICADOS = normalizarTexto(GRUPO_MINISTROS_INDICADOS);

/** Algum segmento ("A; B") do rótulo do Contatos é o grupo dos ministros indicados. */
function nosMinistrosIndicados(grupo: string): boolean {
  return grupo.split(";").some((seg) => normalizarTexto(seg) === ROTULO_INDICADOS);
}

/** Rótulo oficial e apelidos do grupo dos Chefes de Estado, normalizados. */
const ROTULOS_CHEFES_DE_ESTADO: ReadonlySet<string> = new Set(
  GRUPOS_POSSE.filter((g) => g.rotulo === GRUPO_CHEFES_DE_ESTADO).flatMap((g) =>
    [g.rotulo, ...(g.apelidos ?? [])].map(normalizarTexto),
  ),
);

/** Algum segmento ("A; B") do rótulo do Contatos é o grupo dos Chefes de Estado. */
function nosChefesDeEstado(grupo: string): boolean {
  return grupo.split(";").some((seg) => ROTULOS_CHEFES_DE_ESTADO.has(normalizarTexto(seg)));
}

/** Rótulos dos três grupos de eleitos (spec 2026-11-19 §2.1). */
export const GRUPOS_DE_ELEITOS: readonly string[] = Object.freeze([
  GRUPO_SENADORES_ELEITOS,
  GRUPO_DEPUTADOS_ELEITOS,
  GRUPO_GOVERNADORES_ELEITOS,
]);

const ROTULOS_DE_ELEITOS: ReadonlySet<string> = new Set(GRUPOS_DE_ELEITOS.map(normalizarTexto));

/** Algum segmento ("A; B") do rótulo do Contatos é um grupo de eleitos. */
function nosEleitos(grupo: string): boolean {
  return grupo.split(";").some((seg) => ROTULOS_DE_ELEITOS.has(normalizarTexto(seg)));
}

const GRUPO_STF = "Ministros do STF";

/** Presidência própria de tribunal (nunca "Vice-…"), no grupo canônico do tribunal. */
function presidenteDeTribunal(cargo: string | undefined, grupoCanonico: string | undefined): boolean {
  if (grupoCanonico === undefined || !GRUPOS_DE_TRIBUNAL.includes(grupoCanonico)) return false;
  return /^presidente\b/.test(neutralizarGenero(normalizarTexto(cargo ?? "")));
}

function ativo(cargo: string | undefined): boolean {
  return CARGO_ATIVO.test(neutralizarGenero(normalizarTexto(cargo ?? "")));
}

/**
 * O protocolo fixo do contato, no gênero dele, ou `undefined` quando a regra não vale. Quem está
 * no grupo "Ex-Presidentes do Congresso" é sempre inativo, seja qual for o cargo escrito.
 */
export function protocoloFixo(contato: ContatoPlanilha, grupoCanonico: string | undefined): ProtocoloFixo | undefined {
  const feminino = contatoEhFeminino(contato);
  const excelencia = feminino ? "A Sua Excelência a Senhora" : "A Sua Excelência o Senhor";
  if (grupoCanonico === GRUPO_EX_PRESIDENTES) {
    return { tratamento: feminino ? "Senhora" : "Senhor", enderecamento: excelencia };
  }
  if (ativo(contato.cargo) || nosChefesDeEstado(contato.grupo)) {
    return { tratamento: feminino ? "Excelentíssima Senhora" : "Excelentíssimo Senhor", enderecamento: excelencia };
  }
  if (nosMinistrosIndicados(contato.grupo)) {
    return { tratamento: feminino ? "Senhora" : "Senhor", observacaoEnderecamento: OBSERVACAO_ENDERECAMENTO_INDICADOS };
  }
  if (nosEleitos(contato.grupo)) {
    return { tratamento: feminino ? "Senhora" : "Senhor", enderecamento: feminino ? "À Senhora" : "Ao Senhor" };
  }
  if (presidenteDeTribunal(contato.cargo, grupoCanonico)) {
    const tratamento = grupoCanonico === GRUPO_STF
      ? feminino ? "Excelentíssima Senhora" : "Excelentíssimo Senhor"
      : feminino ? "Senhora" : "Senhor";
    return { tratamento, enderecamento: excelencia };
  }
  return undefined;
}

function comparar(campo: "tratamento" | "enderecamento", valorPlanilha: string, fixo: string): ComparacaoCampo {
  return {
    campo,
    valorPlanilha,
    valorEsperado: fixo,
    situacao: normalizarTexto(valorPlanilha) === normalizarTexto(fixo) ? "confere" : "divergente",
    origemValor: "regra_gt",
  };
}

/** As duas comparações contra o valor fixo, ou `undefined` quando a regra não vale para o contato. */
export function comparacoesProtocoloFixo(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
): ComparacaoCampo[] | undefined {
  const fixo = protocoloFixo(contato, grupoCanonico);
  if (!fixo) return undefined;
  const enderecamento: ComparacaoCampo =
    fixo.enderecamento === undefined
      ? {
          campo: "enderecamento",
          valorPlanilha: contato.enderecamento ?? "",
          situacao: "sem_regra",
          origemValor: "regra_gt",
          ...(fixo.observacaoEnderecamento ? { observacao: fixo.observacaoEnderecamento } : {}),
        }
      : comparar("enderecamento", contato.enderecamento ?? "", fixo.enderecamento);
  return [comparar("tratamento", contato.tratamento ?? "", fixo.tratamento), enderecamento];
}
