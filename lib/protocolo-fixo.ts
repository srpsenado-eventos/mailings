import { neutralizarGenero } from "@/lib/cargos";
import { normalizarTexto } from "@/lib/normalize";
import { contatoEhFeminino } from "@/lib/tratamento";
import type { ComparacaoCampo, ContatoPlanilha } from "@/lib/types";

/**
 * Protocolo fixo dos presidentes do Congresso e da Câmara (spec 2026-11-05 §7.3, decisão do
 * Clovis). Vale por cima da tabela de protocolo e dos pares, só nesses cargos.
 */

const GRUPO_EX_PRESIDENTES = "Ex-Presidentes do Congresso";

/** Cargo ativo, normalizado: nunca "Vice-…" (não começa com "presidente") e nunca com período. */
const CARGO_ATIVO = /^presidente (do congresso nacional|do senado federal|da camara dos deputados)$/;

export interface ProtocoloFixo {
  tratamento: string;
  enderecamento: string;
}

function ativo(cargo: string | undefined): boolean {
  return CARGO_ATIVO.test(neutralizarGenero(normalizarTexto(cargo ?? "")));
}

/**
 * O protocolo fixo do contato, no gênero dele, ou `undefined` quando a regra não vale. Quem está
 * no grupo "Ex-Presidentes do Congresso" é sempre inativo, seja qual for o cargo escrito.
 */
export function protocoloFixo(contato: ContatoPlanilha, grupoCanonico: string | undefined): ProtocoloFixo | undefined {
  const exPresidente = grupoCanonico === GRUPO_EX_PRESIDENTES;
  if (!exPresidente && !ativo(contato.cargo)) return undefined;
  const feminino = contatoEhFeminino(contato);
  return {
    tratamento: exPresidente
      ? feminino ? "Senhora" : "Senhor"
      : feminino ? "Excelentíssima Senhora" : "Excelentíssimo Senhor",
    enderecamento: feminino ? "A Sua Excelência a Senhora" : "A Sua Excelência o Senhor",
  };
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
  return [
    comparar("tratamento", contato.tratamento ?? "", fixo.tratamento),
    comparar("enderecamento", contato.enderecamento ?? "", fixo.enderecamento),
  ];
}
