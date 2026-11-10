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
export const REVISAO_COMPLEMENTO_REGRA_A = "Complemento acima de 30 depois da regra A";
const REGRA_A_LOGRADOURO = "Lote/Casa/Chácara do Logradouro levado ao Complemento (regra A dos Correios)";
/**
 * Identificador de lote/casa/chácara: contém dígito ("12", "5/6", "12A") ou é uma letra maiúscula
 * isolada ("B"). Nome próprio ("Civil", "de Apoio", "Santa Luzia") não é identificador, e a letra
 * isolada exige maiúscula para que o conectivo "e" não conte.
 */
const IDENTIFICADOR = String.raw`(?:[\w/.-]*\d(?:[\w/.-]*[\w/])?|[A-Z](?![\p{L}\d]))`;
const MARCA_NO_LOGRADOURO = String.raw`\b(?:lotes?|lt|casa|cs|ch[aá]cara|ch)\.?`;
const LOTE_NO_LOGRADOURO = new RegExp(String.raw`${MARCA_NO_LOGRADOURO}\s+${IDENTIFICADOR}`, "giu");
const SO_IDENTIFICADOR = new RegExp(String.raw`^${IDENTIFICADOR}$`, "u");

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

/** O token (sem pontuação nas pontas) é identificador de lote: tem dígito ou é uma letra maiúscula isolada. */
function ehIdentificador(token: string | undefined): boolean {
  if (token === undefined) return false;
  return SO_IDENTIFICADOR.test(token.replace(/^[.,;:]+|[.,;:]+$/g, ""));
}

/** Abrevia a marca (Lote, Casa, Chácara, Bloco) só quando o token seguinte é identificador. */
export function abreviarLote(trecho: string): string {
  const tokens = trecho.split(/\s+/).filter(Boolean);
  return tokens
    .map((token, i) => {
      const sigla = MARCAS_DE_LOTE[chaveDoToken(token)];
      if (!sigla || !ehIdentificador(tokens[i + 1])) return token;
      return sigla + (token.endsWith(",") ? "," : "");
    })
    .join(" ");
}

function temMarcaDeLote(numero: string): boolean {
  const [primeiro = "", segundo] = numero.split(/\s+/);
  return chaveDoToken(primeiro) in MARCAS_DE_LOTE && ehIdentificador(segundo);
}

function juntarAoComplemento(trecho: string, complemento: string): { complemento: string; revisao?: Revisao } {
  const novo = abreviarLote(trecho) + (complemento ? `, ${complemento}` : "");
  const limite = LIMITES.COMPLEMENTO ?? Infinity;
  if (novo.length > limite) {
    return { complemento: novo, revisao: { marca: "revisar", texto: REVISAO_COMPLEMENTO_REGRA_A } };
  }
  return { complemento: novo };
}

/**
 * A busca ignora caixa na marca ("LOTE", "lote"), e isso também deixaria a letra isolada minúscula
 * passar; por isso cada achado é conferido de novo pelo identificador, que exige maiúscula.
 */
function ehLoteDeVerdade(achado: string): boolean {
  return ehIdentificador(achado.split(/\s+/).pop());
}

/** Todas as ocorrências de lote, casa e chácara com identificador no Logradouro, na ordem. */
function lotesDoLogradouro(logradouro: string): string[] {
  return (logradouro.match(LOTE_NO_LOGRADOURO) ?? []).filter(ehLoteDeVerdade);
}

/** Tira do Logradouro todas as ocorrências de lote, casa e chácara com identificador. */
function tirarDoLogradouro(logradouro: string): string {
  return logradouro
    .replace(LOTE_NO_LOGRADOURO, (achado) => (ehLoteDeVerdade(achado) ? " " : achado))
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,]+|[\s,]+$/g, "");
}

function tratarNumeroVazio(entrada: EntradaNumero): SaidaNumero {
  const { logradouro, complemento, uf, cidade } = entrada;
  if (ehEnderecoDoDf(uf, cidade)) {
    const regras = ["Número vazio em endereço do DF = S/N"];
    const achados = lotesDoLogradouro(logradouro);
    if (achados.length === 0) return { numero: "S/N", logradouro, complemento, regras };
    const juntado = juntarAoComplemento(achados.join(" "), complemento);
    return {
      numero: "S/N",
      logradouro: tirarDoLogradouro(logradouro),
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
