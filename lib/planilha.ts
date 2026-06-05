import * as XLSX from "xlsx";
import type { ContatoPlanilha } from "@/lib/types";
import { normalizarTexto } from "@/lib/normalize";

export class ColunaFaltanteError extends Error {
  constructor(public colunas: string[]) {
    super(`Colunas obrigatórias ausentes na planilha: ${colunas.join(", ")}`);
    this.name = "ColunaFaltanteError";
  }
}

/** Mapa de campo do domínio → rótulo de cabeçalho normalizado esperado. */
const MAPA_COLUNAS: Record<keyof ContatoPlanilha, string> = {
  foto: "foto",
  tratamento: "tratamento",
  enderecamento: "enderecamento",
  nome: "nome",
  telefone: "telefone",
  email: "e-mail",
  redeSocial: "rede social",
  endereco: "endereco",
  orgao: "orgao",
  cargo: "cargo",
  departamento: "departamento",
  grupo: "grupo",
};

const OBRIGATORIAS: (keyof ContatoPlanilha)[] = ["nome", "grupo"];

function indexarCabecalho(linha: Record<string, unknown>): Map<string, string> {
  // chave normalizada → chave original presente na planilha
  const idx = new Map<string, string>();
  for (const chaveOriginal of Object.keys(linha)) {
    idx.set(normalizarTexto(chaveOriginal), chaveOriginal);
  }
  return idx;
}

export function lerPlanilha(buffer: ArrayBuffer): ContatoPlanilha[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new ColunaFaltanteError(OBRIGATORIAS as string[]);

  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (linhas.length === 0) return [];

  const idx = indexarCabecalho(linhas[0]);

  const faltantes = OBRIGATORIAS
    .filter((campo) => !idx.has(MAPA_COLUNAS[campo]))
    .map((campo) => MAPA_COLUNAS[campo]);
  if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);

  const pegar = (linha: Record<string, unknown>, campo: keyof ContatoPlanilha): string => {
    const chave = idx.get(MAPA_COLUNAS[campo]);
    if (!chave) return "";
    return String(linha[chave] ?? "").trim();
  };

  const contatos: ContatoPlanilha[] = [];
  for (const linha of linhas) {
    const nome = pegar(linha, "nome");
    const grupo = pegar(linha, "grupo");
    if (!nome && !grupo) continue; // linha vazia
    contatos.push({
      foto: pegar(linha, "foto") || undefined,
      tratamento: pegar(linha, "tratamento") || undefined,
      enderecamento: pegar(linha, "enderecamento") || undefined,
      nome,
      telefone: pegar(linha, "telefone") || undefined,
      email: pegar(linha, "email") || undefined,
      redeSocial: pegar(linha, "redeSocial") || undefined,
      endereco: pegar(linha, "endereco") || undefined,
      orgao: pegar(linha, "orgao") || undefined,
      cargo: pegar(linha, "cargo") || undefined,
      departamento: pegar(linha, "departamento") || undefined,
      grupo,
    });
  }
  return contatos;
}

/** Agrupa contatos pela coluna Grupo. */
export function agruparPorGrupo(contatos: ContatoPlanilha[]): Map<string, ContatoPlanilha[]> {
  const mapa = new Map<string, ContatoPlanilha[]>();
  for (const c of contatos) {
    const lista = mapa.get(c.grupo) ?? [];
    mapa.set(c.grupo, [...lista, c]);
  }
  return mapa;
}
