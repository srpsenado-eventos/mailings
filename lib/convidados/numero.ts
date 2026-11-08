import { normalizarTexto } from "@/lib/normalize";
import { LIMITES } from "./limites";
import type { Revisao } from "./tipos";

export const MARCAS_DE_LOTE: Readonly<Record<string, string>> = {
  lote: "Lt", lotes: "Lt", lt: "Lt",
  casa: "Cs", cs: "Cs",
  chacara: "Ch", ch: "Ch",
  bloco: "Bl", bl: "Bl",
};

const REGRA_A_NUMERO =
  "Número acima de 6 com lote/casa: Número = S/N e o trecho vai ao Complemento (regra A dos Correios)";
const REGRA_A_LOGRADOURO = "Lote/Casa/Chácara do Logradouro levado ao Complemento (regra A dos Correios)";
const LOTE_NO_LOGRADOURO = /\b(lotes?|casa|ch[aá]cara)\s+[\w/.-]+/i;

export interface EntradaNumero {
  numero: string;
  logradouro: string;
  complemento: string;
  uf: string;
  cidade: string;
}

export interface SaidaNumero {
  numero: string;
  logradouro: string;
  complemento: string;
  regras: string[];
  revisao?: Revisao;
}

export function ehEnderecoDoDf(uf: string, cidade: string): boolean {
  const sigla = uf.trim().toUpperCase();
  if (sigla) return sigla === "DF";
  return ["brasilia", "bsb"].includes(normalizarTexto(cidade));
}

/** Chave de busca de um token: sem pontuação nas pontas, sem caixa e sem acento. */
function chaveDoToken(token: string): string {
  return normalizarTexto(token.replace(/^[.,;:]+|[.,;:]+$/g, ""));
}

export function abreviarLote(trecho: string): string {
  return trecho
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const sigla = MARCAS_DE_LOTE[chaveDoToken(token)];
      if (!sigla) return token;
      return sigla + (token.endsWith(",") ? "," : "");
    })
    .join(" ");
}

function temMarcaDeLote(numero: string): boolean {
  const primeiro = numero.split(/\s+/)[0] ?? "";
  return chaveDoToken(primeiro) in MARCAS_DE_LOTE;
}

function juntarAoComplemento(trecho: string, complemento: string): { complemento: string; revisao?: Revisao } {
  const novo = abreviarLote(trecho) + (complemento ? `, ${complemento}` : "");
  const limite = LIMITES.COMPLEMENTO ?? Infinity;
  if (novo.length > limite) {
    return { complemento: novo, revisao: { marca: "revisar", texto: "Complemento acima de 30 depois da regra A" } };
  }
  return { complemento: novo };
}

function tirarDoLogradouro(logradouro: string, trecho: string): string {
  return logradouro
    .replace(trecho, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "");
}

function tratarNumeroVazio(entrada: EntradaNumero): SaidaNumero {
  const { logradouro, complemento, uf, cidade } = entrada;
  if (ehEnderecoDoDf(uf, cidade)) {
    const regras = ["Número vazio em endereço do DF = S/N"];
    const achado = LOTE_NO_LOGRADOURO.exec(logradouro);
    if (!achado) return { numero: "S/N", logradouro, complemento, regras };
    const juntado = juntarAoComplemento(achado[0], complemento);
    return {
      numero: "S/N",
      logradouro: tirarDoLogradouro(logradouro, achado[0]),
      complemento: juntado.complemento,
      regras: [...regras, REGRA_A_LOGRADOURO],
      ...(juntado.revisao ? { revisao: juntado.revisao } : {}),
    };
  }
  const textoLogradouro = normalizarTexto(logradouro);
  if (textoLogradouro.includes("s/n") || textoLogradouro.includes("sem numero")) {
    return { numero: "S/N", logradouro, complemento, regras: ["Número vazio: logradouro indica S/N"] };
  }
  return { numero: "", logradouro, complemento, regras: [], revisao: { marca: "revisar", texto: "Número não informado" } };
}

export function tratarNumero(entrada: EntradaNumero): SaidaNumero {
  const numero = entrada.numero.trim();
  const { logradouro, complemento } = entrada;
  if (!numero) return tratarNumeroVazio(entrada);
  if (numero.length <= (LIMITES.NUMERO ?? Infinity)) return { numero, logradouro, complemento, regras: [] };
  if (temMarcaDeLote(numero)) {
    const juntado = juntarAoComplemento(numero, complemento);
    return {
      numero: "S/N",
      logradouro,
      complemento: juntado.complemento,
      regras: [REGRA_A_NUMERO],
      ...(juntado.revisao ? { revisao: juntado.revisao } : {}),
    };
  }
  return {
    numero,
    logradouro,
    complemento,
    regras: [],
    revisao: { marca: "revisar", texto: "Número acima de 6 caracteres sem lote/casa/bloco" },
  };
}
