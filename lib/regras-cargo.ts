import { REGRAS_NOME, type RegraNome } from "@/data/regras-nome";
import { normalizarTexto } from "@/lib/normalize";
import type { ComparacaoCampo, ContatoPlanilha } from "@/lib/types";

/**
 * Camada C, regras de escrita do campo `Cargo` (spec 2026-10-30 §3.5). Como as regras de
 * nome de `lib/tratamento.ts`, não olha a página nem a tabela de protocolo: confere se o cargo
 * foi escrito como o GT fixou, e por isso vale nos quatro caminhos de veredito.
 */

/** Orientação que acompanha o achado: o app não sabe os anos (spec 2026-10-30 §3.5). */
export const OBSERVACAO_PERIODO = "Informar o período da presidência";

/** Marcador dos anos que o usuário completa, no lugar do período desconhecido. */
const PERIODO_DESCONHECIDO = "de AAAA a AAAA";
const PERIODO_DESCONHECIDO_NO_PERIODO = "no período de AAAA a AAAA";
const PREFIXO_NO_PERIODO = "no periodo ";
const SO_UM_ANO = /^em \d{4}$/;

/**
 * Período da presidência, já normalizado (`normalizarTexto`): "de 2019 a 2021", ou mais de um
 * mandato separados por vírgula ou "e" ("de 1995 a 1997 e de 2009 a 2011"). Mais de um período
 * é aceito e o app não escolhe qual escrever (ainda a definir pelo Clovis, 30/10). A ordem dos
 * anos de cada período é conferida à parte, em `periodoValido`.
 */
export const PERIODO_PRESIDENCIA = /^de \d{4} a \d{4}(?: ?(?:,|e) de \d{4} a \d{4})*$/;

const ANOS_DO_PERIODO = /de (\d{4}) a (\d{4})/g;

/** O período segue o formato e, em cada mandato, o segundo ano não vem antes do primeiro. */
function periodoValido(periodo: string): boolean {
  if (!PERIODO_PRESIDENCIA.test(periodo)) return false;
  return [...periodo.matchAll(ANOS_DO_PERIODO)].every(([, inicio, fim]) => Number(fim) >= Number(inicio));
}

/** Forma do Congresso (05/11): "no período de 2017 a 2019" (um ou mais períodos) ou "em 2001". */
function periodoNoPeriodoValido(resto: string): boolean {
  if (SO_UM_ANO.test(resto)) return true;
  return resto.startsWith(PREFIXO_NO_PERIODO) && periodoValido(resto.slice(PREFIXO_NO_PERIODO.length));
}

/**
 * Cargo do ex-presidente fora do formato do GT (spec 2026-10-30 §3.5; decisão do Clovis de
 * 30/10: todo cargo fora do formato é acusado). Nos grupos com `cargoComPeriodo` em
 * `data/regras-nome.ts`, o único cargo aceito é o da regra seguido de "de AAAA a AAAA" com
 * anos de quatro dígitos (o segundo não antes do primeiro, um ou mais mandatos). Qualquer outra
 * forma diverge: "Ex-Presidente...", o cargo sem período, sem "Federal", "Senador", o marcador
 * "AAAA" copiado sem preencher. O esperado é o cargo da regra com "AAAA" no lugar dos anos, e a
 * observação pede o período. Cargo vazio fica fora: o painel já o acusa como "Cargo vazio", e
 * acusar duas vezes só repetiria o aviso. Fora desses grupos nada muda.
 */
export function comparacaoCargoExPresidente(
  contato: ContatoPlanilha,
  grupoCanonico: string | undefined,
  regras: Readonly<Record<string, RegraNome>> = REGRAS_NOME,
): ComparacaoCampo[] {
  const cargoComPeriodo = grupoCanonico ? regras[grupoCanonico]?.cargoComPeriodo : undefined;
  if (!cargoComPeriodo) return [];
  const cargo = contato.cargo ?? "";
  const normalizado = normalizarTexto(cargo);
  const base = `${normalizarTexto(cargoComPeriodo)} `;
  if (normalizado.length === 0) return [];
  const noPeriodo = regras[grupoCanonico ?? ""]?.formaDoPeriodo === "no_periodo_ou_em_ano";
  const resto = normalizado.startsWith(base) ? normalizado.slice(base.length) : undefined;
  const noFormato = resto !== undefined && (noPeriodo ? periodoNoPeriodoValido(resto) : periodoValido(resto));
  if (noFormato) return [];

  return [
    {
      campo: "cargo",
      valorPlanilha: cargo,
      valorEsperado: `${cargoComPeriodo} ${noPeriodo ? PERIODO_DESCONHECIDO_NO_PERIODO : PERIODO_DESCONHECIDO}`,
      situacao: "divergente",
      origemValor: "coerencia",
      achado: "cargo_ex_presidente",
      observacao: OBSERVACAO_PERIODO,
    },
  ];
}
