import { normalizarTexto } from "@/lib/normalize";
import { abreviarAteCaber, PASSOS_LOGRADOURO } from "./abreviacoes";
import { LIMITES, UFS } from "./limites";
import type { ResultadoCampo } from "./tipos";

const LIMITE_BAIRRO = LIMITES.BAIRRO ?? Infinity;
const LIMITE_CIDADE = LIMITES.CIDADE ?? Infinity;

export const DE_PARA_BAIRRO: Readonly<Record<string, string>> = {
  "Setor de Administração Federal Sul": "Setor de Adm. Federal Sul",
  "Setor de Habitações Individuais Sul": "Setor Hab. Individuais Sul",
  "Setor de Habitações Individuais Norte": "Setor Hab. Individuais Norte",
  "Setor Habitacional Jardim Botânico": "Setor Hab. Jardim Botânico",
  "Serra Verde - Cidade Administrativa": "Serra Verde",
  "Zona Cívico-Administrativa na cidade de Brasília/D": "Zona Cívico-Administrativa",
};

export const BAIRROS_CANONICOS: Readonly<Record<string, string>> = {
  "zona civico-administrativa": "Zona Cívico-Administrativa",
  "zona civico administrativa": "Zona Cívico-Administrativa",
  "zona civico administrativo": "Zona Cívico-Administrativa",
  "zona civico-administrativo": "Zona Cívico-Administrativa",
  "asa sul": "Asa Sul",
  "asa norte": "Asa Norte",
  "lago sul": "Lago Sul",
  "lago norte": "Lago Norte",
  "setor militar urbano": "Setor Militar Urbano",
};

const DE_PARA_NORMALIZADO: ReadonlyMap<string, string> = new Map(
  Object.entries(DE_PARA_BAIRRO).map(([chave, valor]) => [normalizarTexto(chave), valor]),
);

export function tratarBairro(bairro: string): ResultadoCampo {
  let valor = bairro.trim();
  if (!valor) return { valor: "", regras: [], revisao: { marca: "revisar", texto: "Bairro vazio" } };
  const regras: string[] = [];

  const doDePara = DE_PARA_NORMALIZADO.get(normalizarTexto(valor));
  if (doDePara !== undefined) {
    if (doDePara !== valor) regras.push("Bairro abreviado (de-para dos Correios)");
    valor = doDePara;
  }
  const canonico = BAIRROS_CANONICOS[normalizarTexto(valor)];
  if (canonico !== undefined && canonico !== valor) {
    regras.push(`Bairro padronizado (${valor} → ${canonico})`);
    valor = canonico;
  }
  if (valor.length > LIMITE_BAIRRO) {
    const abreviado = abreviarAteCaber(valor, LIMITE_BAIRRO, PASSOS_LOGRADOURO);
    valor = abreviado.valor;
    if (abreviado.passos.length > 0) {
      regras.push(`Bairro acima de ${LIMITE_BAIRRO}: abreviado (${abreviado.passos.join(", ")})`);
    }
    if (valor.length > LIMITE_BAIRRO) {
      return { valor, regras, revisao: { marca: "revisar", texto: `Bairro acima de ${LIMITE_BAIRRO} caracteres` } };
    }
  }
  return { valor, regras };
}

const GRAFIAS_DE_BRASILIA: ReadonlySet<string> = new Set(["brasilia", "brasila", "bsb"]);

export function tratarCidade(cidade: string): ResultadoCampo {
  let valor = cidade.trim();
  if (!valor) return { valor: "", regras: [], revisao: { marca: "revisar", texto: "Cidade vazia" } };
  const regras: string[] = [];
  if (GRAFIAS_DE_BRASILIA.has(normalizarTexto(valor)) && valor !== "Brasília") {
    regras.push(`Cidade padronizada (${valor} → Brasília)`);
    valor = "Brasília";
  }
  if (valor.length > LIMITE_CIDADE) {
    return { valor, regras, revisao: { marca: "revisar", texto: `Cidade acima de ${LIMITE_CIDADE} caracteres` } };
  }
  return { valor, regras };
}

export function tratarUf(uf: string): ResultadoCampo {
  const aparada = uf.trim();
  if (!aparada) return { valor: "", regras: [], revisao: { marca: "revisar", texto: "UF vazia" } };
  const alta = aparada.toUpperCase();
  if (!UFS.has(alta)) {
    return { valor: aparada, regras: [], revisao: { marca: "revisar", texto: `UF inexistente (${aparada})` } };
  }
  return { valor: alta, regras: alta !== aparada ? ["UF em caixa alta"] : [] };
}
