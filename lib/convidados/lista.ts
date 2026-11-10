import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";
import { CAMPOS_MODELO, type CampoModelo, type LinhaLista, type Valores } from "./tipos";

/** Quantas linhas, do topo de cada aba, são varridas à procura do cabeçalho. */
const LINHAS_PROCURADAS = 30;
const PREFIXO_NOME = "nome completo";
const ROTULO_NOME = "NOME COMPLETO DO CONVIDADO/ NOME POLÍTICO";

/** Cabeçalho normalizado de cada campo do modelo; `NOME` casa por prefixo. */
const COLUNA_DO_CAMPO: Readonly<Record<CampoModelo, string>> = {
  NOME: PREFIXO_NOME,
  TRATAMENTO: "tratamento",
  ENDERECAMENTO: "enderecamento",
  CARGO: "cargo do convidado",
  CEP: "cep",
  LOGRADOURO: "logradouro",
  NUMERO: "numero",
  COMPLEMENTO: "complemento",
  BAIRRO: "bairro",
  CIDADE: "cidade",
  UF: "uf",
};

const texto = (v: unknown): string => String(v ?? "").trim();

function indiceDoCampo(cabecalho: string[], campo: CampoModelo): number {
  if (campo === "NOME") return cabecalho.findIndex((c) => c.startsWith(PREFIXO_NOME));
  return cabecalho.indexOf(COLUNA_DO_CAMPO[campo]);
}

function acharCabecalho(matriz: unknown[][]): number {
  const limite = Math.min(matriz.length, LINHAS_PROCURADAS);
  for (let i = 0; i < limite; i++) {
    const celulas = matriz[i].map((c) => normalizarTexto(texto(c)));
    if (celulas.some((c) => c.startsWith(PREFIXO_NOME)) && celulas.includes("cep")) return i;
  }
  return -1;
}

export function lerListaPadrao(buffer: ArrayBuffer): LinhaLista[] {
  const wb = XLSX.read(buffer, { type: "array" });
  for (const nomeAba of wb.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nomeAba], { header: 1, defval: "", raw: false, range: 0 });
    const posicao = acharCabecalho(matriz);
    if (posicao < 0) continue;

    const cabecalho = matriz[posicao].map((c) => normalizarTexto(texto(c)));
    const faltantes = CAMPOS_MODELO.filter((c) => indiceDoCampo(cabecalho, c) < 0).map((c) =>
      c === "NOME" ? ROTULO_NOME : c,
    );
    if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);

    const colunaOrgao = cabecalho.indexOf("orgao");
    const linhas: LinhaLista[] = [];
    matriz.slice(posicao + 1).forEach((celulas, i) => {
      const valores = Object.fromEntries(
        CAMPOS_MODELO.map((c) => [c, texto(celulas[indiceDoCampo(cabecalho, c)])]),
      ) as Valores;
      if (!valores.NOME) return;
      linhas.push({
        linha: posicao + 2 + i,
        valores,
        orgao: colunaOrgao >= 0 ? texto(celulas[colunaOrgao]) : "",
      });
    });
    return linhas;
  }
  throw new ColunaFaltanteError([ROTULO_NOME, "CEP"]);
}
