/**
 * CEP do cadastro: normalização, classificação e formatação. Puro e sem rede —
 * a conferência contra os Correios é a Fase 2 deste spec.
 */

export type SituacaoCep = "valido" | "recuperavel" | "invalido" | "ausente";

export interface Cep {
  situacao: SituacaoCep;
  /** Oito dígitos, só quando `valido`. */
  digitos?: string;
  /** Oito dígitos propostos, só quando `recuperavel`. Ainda NÃO confirmado. */
  proposto?: string;
}

/**
 * Faixa de CEP de São Paulo: 01000-000 a 19999-999. É a única UF com CEP
 * começando em zero, e é por isso que a recuperação do dígito perdido só vale lá.
 */
const FAIXA_SP = /^(0[1-9]|1\d)/;

export function normalizarCep(valor?: string): string {
  return String(valor ?? "").replace(/\D/g, "");
}

export function formatarCep(digitos: string): string {
  return /^\d{8}$/.test(digitos) ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}

/**
 * Classifica o CEP de uma linha da base de endereços.
 *
 * Sete dígitos com UF igual a SP é o defeito medido em 31 linhas da base de
 * 2026-10-01: o campo foi exportado como número e o zero inicial caiu
 * (`1049000` era `01049-000`). A proposta só sai quando o resultado cai na faixa
 * de SP, e continua sendo **proposta** até a Fase 2 conferir nos Correios.
 */
export function classificarCep(valor: string | undefined, uf: string | undefined): Cep {
  const digitos = normalizarCep(valor);
  if (digitos.length === 0) return { situacao: "ausente" };
  if (digitos.length === 8) return { situacao: "valido", digitos };
  if (digitos.length === 7 && String(uf ?? "").trim().toUpperCase() === "SP") {
    const proposto = `0${digitos}`;
    if (FAIXA_SP.test(proposto)) return { situacao: "recuperavel", proposto };
  }
  return { situacao: "invalido" };
}
