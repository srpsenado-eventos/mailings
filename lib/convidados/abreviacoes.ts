import { LIMITES } from "./limites";
import type { Revisao } from "./tipos";

type Troca = readonly [RegExp, string];
type Passo = readonly Troca[];

/** Monta um padrão que ignora acento: cada vogal (e o "c") aceita as formas acentuadas. */
function padraoSemAcento(texto: string): string {
  const semAcento = texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const classes: Record<string, string> = {
    a: "[aáàâãä]", e: "[eéèêë]", i: "[iíìîï]", o: "[oóòôõö]", u: "[uúùûü]", c: "[cç]",
  };
  return semAcento
    .split("")
    .map((letra) => {
      if (letra === " ") return "\\s+";
      return classes[letra.toLowerCase()] ?? letra;
    })
    .join("");
}

/** Palavra inteira, sem caixa e sem acento. */
function palavra(texto: string): RegExp {
  return new RegExp(`\\b${padraoSemAcento(texto)}\\b`, "gi");
}

export const ABREV_EXPRESSOES: readonly (readonly [string, string])[] = [
  ["Setor de Administração Federal Sul", "SAFS"],
  ["Setor de Autarquias Sul", "SAS"],
  ["Setor de Embaixadas Sul", "SES"],
  ["Setor Hoteleiro Sul", "SHS"],
  ["Setor Comercial Norte", "SCN"],
  ["Setor Comercial Sul", "SCS"],
  ["Setor Bancário Norte", "SBN"],
  ["Setor Bancário Sul", "SBS"],
];

/** Regra de caixa: a troca só acompanha a caixa da palavra original quando o regex ignora caixa. */
export const PASSOS_LOGRADOURO: readonly Passo[] = [
  ABREV_EXPRESSOES.map(([expressao, sigla]): Troca => [palavra(expressao), sigla]),
  [
    [palavra("Quadra"), "Qd"],
    [palavra("Conjunto"), "Cj"],
    [palavra("Bloco"), "Bl"],
    [palavra("Lote"), "Lt"],
  ],
  [
    [palavra("Edifício"), "Ed"],
    [palavra("Avenida"), "Av"],
    [palavra("Alameda"), "Al"],
    [palavra("Rodovia"), "Rod"],
    [palavra("Travessa"), "Tv"],
    [palavra("Estrada"), "Estr"],
    [palavra("Condomínio"), "Cond"],
    [palavra("Residencial"), "Res"],
    [palavra("Gabinete"), "Gab"],
    [palavra("Pavimento"), "Pav"],
    [palavra("Parque"), "Pq"],
  ],
  [[palavra("Senado Federal"), "Senado"]],
  [[palavra("Praça"), "Pç"]],
];

/**
 * Com a flag `i`: casam "SALA", "Sala" e "sala". No nível 2 a palavra minúscula não deixa a sigla
 * minúscula ("5º andar" dá "5º And", como no exemplo aprovado); ver `adaptarCaixa`.
 */
export const NIVEL_2_COMPLEMENTO: readonly Troca[] = [
  [/\bsalas?\b/gi, "Sl"],
  [/\band(?:ar|ares)\b/gi, "And"],
  [/\bpavimento\b/gi, "Pav"],
  [/\bt[ée]rreo\b/gi, "Ter"],
  [/\bgabinete\b/gi, "Gab"],
  [/\bapartamento\b/gi, "Apto"],
  [/ (?:dos|das|de|do|da)(?= )/gi, ""],
];

function ehTodaMaiuscula(texto: string): boolean {
  return /\p{L}/u.test(texto) && texto === texto.toLocaleUpperCase("pt-BR");
}

/** O que a palavra original em minúscula faz com a sigla: fica minúscula ou fica como está. */
export type CaixaDaMinuscula = "minuscula" | "como_esta";

/**
 * Caixa da sigla, quando o padrão ignora caixa: palavra original toda em maiúscula ("SALA") dá a
 * sigla toda em maiúscula ("SL"); só a inicial maiúscula ("Sala") dá a sigla como está ("Sl");
 * inicial minúscula ("sala") dá a sigla em minúscula ("sl"), ou como está com `"como_esta"`
 * (nível 2 do Complemento).
 */
function adaptarCaixa(original: string, sigla: string, acompanhaCaixa: boolean, minuscula: CaixaDaMinuscula): string {
  if (!acompanhaCaixa) return sigla;
  const primeira = original.charAt(0);
  if (primeira !== primeira.toLocaleUpperCase("pt-BR")) {
    return minuscula === "minuscula" ? sigla.toLocaleLowerCase("pt-BR") : sigla;
  }
  if (original.length > 1 && ehTodaMaiuscula(original)) return sigla.toLocaleUpperCase("pt-BR");
  return sigla;
}

function rotuloDaTroca(achado: string, novo: string): string {
  const original = achado.trim().replace(/\s+/g, " ");
  return novo.trim() === "" ? `${original} removido` : `${original} = ${novo}`;
}

/** Aplica um passo por vez, só enquanto o valor passa do limite. */
export function abreviarAteCaber(
  valor: string,
  limite: number,
  passos: readonly Passo[],
  minuscula: CaixaDaMinuscula = "minuscula",
): { valor: string; passos: string[] } {
  let atual = valor;
  const rotulos: string[] = [];
  for (const passo of passos) {
    if (atual.length <= limite) break;
    for (const [regex, sigla] of passo) {
      atual = atual.replace(regex, (achado: string) => {
        const novo = adaptarCaixa(achado, sigla, regex.ignoreCase, minuscula);
        const rotulo = rotuloDaTroca(achado, novo);
        if (!rotulos.includes(rotulo)) rotulos.push(rotulo);
        return novo;
      });
    }
  }
  return { valor: atual, passos: rotulos };
}

const PALAVRAS_ENTREGA = new Set([
  "sala", "sl", "gab", "gabinete", "apto", "apartamento", "loja", "casa", "cs", "lote", "lt", "bloco", "bl",
  "torre", "ala", "anexo", "cobertura", "conjunto", "cj",
]);
const PALAVRAS_ANDAR = new Set(["andar", "and", "pav", "pavimento", "terreo", "ter", "subsolo", "piso"]);
const PALAVRAS_PREDIO = new Set([
  "ed", "edificio", "cond", "condominio", "res", "residencial", "palacio", "parque", "pq", "centro",
]);

/** 0 = localiza a entrega ou tem dígito, 1 = andar, 2 = prédio, 3 = outros. */
export function classeDoSegmento(segmento: string): 0 | 1 | 2 | 3 {
  const sinais = segmento
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t !== "");
  if (sinais.some((t) => PALAVRAS_ENTREGA.has(t))) return 0;
  if (sinais.some((t) => PALAVRAS_ANDAR.has(t))) return 1;
  if (sinais.some((t) => PALAVRAS_PREDIO.has(t))) return 2;
  return /\d/.test(segmento) ? 0 : 3;
}

/** Ordem em que as classes saem do Complemento; a classe 0 sai por último, do início. */
const PRIORIDADE_DE_DESCARTE: readonly (0 | 1 | 2 | 3)[] = [3, 1, 2, 0];

interface Segmento {
  texto: string;
  fim: number;
}

/** Segmentos separados por vírgula ou " - ", com o fim de cada um no texto original. */
function segmentar(texto: string): Segmento[] {
  const segmentos: Segmento[] = [];
  const separador = /\s*,\s*|\s+-\s+/g;
  let inicio = 0;
  let achado = separador.exec(texto);
  while (achado !== null) {
    segmentos.push({ texto: texto.slice(inicio, achado.index), fim: achado.index });
    inicio = achado.index + achado[0].length;
    achado = separador.exec(texto);
  }
  segmentos.push({ texto: texto.slice(inicio), fim: texto.length });
  return segmentos.filter((s) => s.texto.trim() !== "");
}

function colapsar(texto: string): string {
  return texto.replace(/\s+/g, " ").replace(/,(\s*,)+/g, ",").trim();
}

function limiteDe(campo: "LOGRADOURO" | "COMPLEMENTO"): number {
  const limite = LIMITES[campo];
  if (limite === undefined) throw new Error(`Limite de ${campo} não definido`);
  return limite;
}

function juntar(textos: readonly string[]): string {
  return textos.filter((t) => t !== "").join(", ");
}

function escolherParaDescartar(segmentos: readonly string[]): number {
  for (const classe of PRIORIDADE_DE_DESCARTE) {
    const indice = segmentos.findIndex((s) => classeDoSegmento(s) === classe);
    if (indice >= 0) return indice;
  }
  return 0;
}

/** Tira segmentos do Complemento até caber; devolve o que ficou e o que saiu, na ordem original. */
function descartarAteCaber(complemento: string, limite: number): { ficou: string; saiu: string } {
  let restantes = segmentar(complemento).map((s) => s.texto);
  const saiu: { ordem: number; texto: string }[] = [];
  let ordens = restantes.map((_, i) => i);
  while (restantes.length > 0 && juntar(restantes).length > limite) {
    const i = escolherParaDescartar(restantes);
    saiu.push({ ordem: ordens[i], texto: restantes[i] });
    restantes = restantes.filter((_, k) => k !== i);
    ordens = ordens.filter((_, k) => k !== i);
  }
  const texto = saiu.sort((a, b) => a.ordem - b.ordem).map((s) => s.texto);
  return { ficou: juntar(restantes), saiu: juntar(texto) };
}

interface ResultadoLogradouro {
  logradouro: string;
  movido: string;
  regras: string[];
  revisao?: Revisao;
}

function encaixarLogradouro(entrada: string): ResultadoLogradouro {
  const limite = limiteDe("LOGRADOURO");
  const regras: string[] = [];
  let logradouro = colapsar(entrada);
  if (logradouro.length <= limite) return { logradouro, movido: "", regras };

  const abreviado = abreviarAteCaber(logradouro, limite, PASSOS_LOGRADOURO);
  logradouro = colapsar(abreviado.valor);
  if (abreviado.passos.length > 0) {
    regras.push(`Logradouro acima de ${limite}: abreviado (${abreviado.passos.join(", ")})`);
  }
  if (logradouro.length <= limite) return { logradouro, movido: "", regras };

  const segmentos = segmentar(logradouro);
  let mantidos = segmentos.length;
  while (mantidos > 1 && segmentos[mantidos - 1].fim > limite) mantidos -= 1;
  if (segmentos[mantidos - 1].fim > limite) {
    return {
      logradouro,
      movido: "",
      regras,
      revisao: { marca: "revisar", texto: `Logradouro acima de ${limite} mesmo abreviado` },
    };
  }
  regras.push("Logradouro: trecho movido para o Complemento");
  return {
    logradouro: logradouro.slice(0, segmentos[mantidos - 1].fim),
    movido: juntar(segmentos.slice(mantidos).map((s) => s.texto)),
    regras,
  };
}

export function encaixarLogradouroComplemento(
  logradouro: string,
  complemento: string,
): { logradouro: string; complemento: string; trechoQueNaoCoube: string; regras: string[]; revisao?: Revisao } {
  const limiteComplemento = limiteDe("COMPLEMENTO");
  const lograd = encaixarLogradouro(logradouro);
  const regras = [...lograd.regras];
  let atual = colapsar(juntar([lograd.movido, colapsar(complemento)]));
  let trechoQueNaoCoube = "";
  let revisao = lograd.revisao;

  if (atual.length > limiteComplemento) {
    const nivel1 = abreviarAteCaber(atual, limiteComplemento, PASSOS_LOGRADOURO);
    atual = colapsar(nivel1.valor);
    if (nivel1.passos.length > 0) regras.push(`Complemento abreviado (nível 1: ${nivel1.passos.join(", ")})`);
  }
  if (atual.length > limiteComplemento) {
    const nivel2 = abreviarAteCaber(atual, limiteComplemento, [NIVEL_2_COMPLEMENTO], "como_esta");
    atual = colapsar(nivel2.valor);
    if (nivel2.passos.length > 0) regras.push(`Complemento abreviado (nível 2: ${nivel2.passos.join(", ")})`);
  }
  if (atual.length > limiteComplemento) {
    const descarte = descartarAteCaber(atual, limiteComplemento);
    atual = descarte.ficou;
    trechoQueNaoCoube = descarte.saiu;
    const aviso = `Complemento acima de ${limiteComplemento}: trecho não coube`;
    revisao = { marca: "revisar", texto: revisao ? `${revisao.texto}; ${aviso}` : aviso };
  }
  return { logradouro: lograd.logradouro, complemento: atual, trechoQueNaoCoube, regras, revisao };
}
