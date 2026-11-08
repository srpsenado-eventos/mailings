import { chaveToken, normalizarTexto } from "@/lib/normalize";
import { LIMITES } from "./limites";
import type { ResultadoCampo } from "./tipos";

/** Títulos removidos do início do nome, comparados por `chaveToken` (sem ponto, acento ou caixa). Patente e cargo ficam. */
export const TITULOS: readonly string[] = ["dr", "dra", "exmo", "exma", "sr", "sra", "se sr", "se sra"];

export const CONECTIVOS: ReadonlySet<string> = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Patentes abreviadas pelos Correios (script correios_regras.py); as mais específicas vêm antes. */
export const ABREV_PATENTES: readonly (readonly [string, string])[] = [
  ["General de Exército", "Gen Ex"],
  ["General de Divisão", "Gen Div"],
  ["General de Brigada Combatente", "Gen Bda"],
  ["General de Brigada", "Gen Bda"],
  ["Almirante de Esquadra", "Alte Esq"],
  ["Vice-Almirante", "V Alte"],
  ["Contra-Almirante", "C Alte"],
  ["Tenente-Brigadeiro", "Ten Brig"],
  ["Major-Brigadeiro", "Maj Brig"],
  ["Brigadeiro", "Brig"],
  ["Coronel", "Cel"],
];

const LIMITE_NOME = LIMITES.NOME ?? Infinity;
const REGRA_ESPACOS = "Nome: espaços normalizados";
const REGRA_CAIXA_ALTA = "Nome em caixa alta convertido; conferir a grafia";

function palavras(texto: string): string[] {
  return texto.split(/\s+/).filter(Boolean);
}

function ehConectivo(token: string): boolean {
  return CONECTIVOS.has(token.toLocaleLowerCase("pt-BR"));
}

/** Remove só o primeiro título (uma ou duas palavras) do início do nome. */
export function semTitulo(nome: string): { valor: string; removido?: string } {
  const tokens = palavras(nome);
  for (const quantidade of [2, 1]) {
    if (tokens.length <= quantidade) continue;
    const trecho = tokens.slice(0, quantidade);
    if (TITULOS.includes(trecho.map(chaveToken).join(" "))) {
      return { valor: tokens.slice(quantidade).join(" "), removido: trecho.join(" ") };
    }
  }
  return { valor: nome };
}

export function ehCaixaAlta(nome: string): boolean {
  return /\p{L}/u.test(nome) && nome === nome.toLocaleUpperCase("pt-BR");
}

export function comIniciaisMaiusculas(nome: string): string {
  return palavras(nome)
    .map((palavra, indice) => {
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      if (indice > 0 && CONECTIVOS.has(minuscula)) return minuscula;
      return minuscula.replace(/(^|[-'’])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
}

function abreviarPatente(nome: string): string {
  const tokens = palavras(nome);
  for (const [patente, sigla] of ABREV_PATENTES) {
    const partes = palavras(patente);
    if (tokens.length < partes.length) continue;
    const confere = partes.every((parte, i) => normalizarTexto(parte) === normalizarTexto(tokens[i] ?? ""));
    if (confere) return [sigla, ...tokens.slice(partes.length)].join(" ");
  }
  return nome;
}

/** Primeiro token + conectivo anterior ao penúltimo (se houver) + os dois últimos tokens não conectivos. */
function encurtar(nome: string): string {
  const tokens = palavras(nome);
  const plenos: number[] = [];
  tokens.forEach((token, i) => {
    if (!ehConectivo(token)) plenos.push(i);
  });
  if (plenos.length <= 3) return nome;
  const penultimo = plenos[plenos.length - 2] ?? 0;
  const ultimo = plenos[plenos.length - 1] ?? 0;
  const anterior = tokens[penultimo - 1];
  const conectivo = anterior !== undefined && ehConectivo(anterior) ? [anterior] : [];
  return [tokens[0], ...conectivo, tokens[penultimo], tokens[ultimo]].join(" ");
}

export function sugestaoNomeCurto(nome: string): string {
  const abreviado = abreviarPatente(nome);
  const curto = abreviado.length > LIMITE_NOME ? encurtar(abreviado) : abreviado;
  return `${curto} (${curto.length})`;
}

export function tratarNome(nome: string): ResultadoCampo {
  const regras: string[] = [];
  let valor = palavras(nome).join(" ");
  if (valor !== nome) regras.push(REGRA_ESPACOS);
  const titulo = semTitulo(valor);
  if (titulo.removido !== undefined) {
    valor = titulo.valor;
    regras.push(`Nome: título removido (${titulo.removido})`);
  }
  if (ehCaixaAlta(valor)) {
    valor = comIniciaisMaiusculas(valor);
    regras.push(REGRA_CAIXA_ALTA);
  }
  if (valor.length > LIMITE_NOME) {
    return {
      valor,
      regras,
      revisao: {
        marca: "revisar",
        texto: `Nome com ${valor.length} caracteres (limite ${LIMITE_NOME}). A ferramenta não corta nome sozinha.`,
        sugestao: sugestaoNomeCurto(valor),
      },
    };
  }
  return { valor, regras };
}
