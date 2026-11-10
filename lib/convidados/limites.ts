import { LIMITE_NUMERO } from "@/lib/endereco";
import type { CampoModelo } from "./tipos";

export const LIMITES: Readonly<Record<CampoModelo, number | undefined>> = {
  NOME: 50,
  TRATAMENTO: undefined,
  ENDERECAMENTO: undefined,
  CARGO: undefined,
  CEP: 8,
  LOGRADOURO: 50,
  NUMERO: LIMITE_NUMERO,
  COMPLEMENTO: 30,
  BAIRRO: 30,
  CIDADE: 30,
  UF: 2,
};

export const UFS: ReadonlySet<string> = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
  "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);
