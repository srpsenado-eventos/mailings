import * as XLSX from "xlsx";
import type { BaseEnderecos, CelulaBase, EnderecoEstruturado } from "@/lib/types";
import { normalizarTexto } from "@/lib/normalize";
import { ColunaFaltanteError } from "@/lib/planilha";

/**
 * Leitura da planilha de endereços do Sistema Contatos (`BASE ENDERECO`), feita no
 * navegador como a dos contatos. Mesmo padrão de `lib/planilha.ts`: cabeçalho
 * casado normalizado, coluna ausente vira erro claro em vez de campo vazio.
 *
 * A exportação real traz uma primeira coluna de lixo (`&nbsp;`), que é ignorada
 * por não estar no mapa.
 */
const MAPA_COLUNAS = {
  contatoId: "contato id",
  enderecoId: "endereco id",
  nome: "nome",
  logradouro: "logradouro",
  numero: "numero",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  uf: "uf",
  pais: "pais",
  cep: "cep",
  prioritario: "prioritario",
} as const;

type Campo = keyof typeof MAPA_COLUNAS;

/** Sem `Contato Id` não existe junção: é erro, não planilha vazia. */
const OBRIGATORIAS: Campo[] = ["contatoId"];

export function lerPlanilhaEnderecos(buffer: ArrayBuffer): EnderecoEstruturado[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new ColunaFaltanteError([MAPA_COLUNAS.contatoId]);

  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (linhas.length === 0) return [];

  const idx = new Map<string, string>();
  for (const chave of Object.keys(linhas[0])) idx.set(normalizarTexto(chave), chave);

  const faltantes = OBRIGATORIAS.filter((c) => !idx.has(MAPA_COLUNAS[c])).map((c) => MAPA_COLUNAS[c]);
  if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);

  const pegar = (linha: Record<string, unknown>, campo: Campo): string => {
    const chave = idx.get(MAPA_COLUNAS[campo]);
    if (!chave) return "";
    return String(linha[chave] ?? "").trim();
  };

  const enderecos: EnderecoEstruturado[] = [];
  for (const linha of linhas) {
    const contatoId = pegar(linha, "contatoId");
    if (!contatoId) continue; // linha vazia da exportação
    enderecos.push({
      contatoId,
      enderecoId: pegar(linha, "enderecoId") || undefined,
      nome: pegar(linha, "nome") || undefined,
      logradouro: pegar(linha, "logradouro") || undefined,
      numero: pegar(linha, "numero") || undefined,
      complemento: pegar(linha, "complemento") || undefined,
      bairro: pegar(linha, "bairro") || undefined,
      cidade: pegar(linha, "cidade") || undefined,
      uf: pegar(linha, "uf") || undefined,
      pais: pegar(linha, "pais") || undefined,
      cep: pegar(linha, "cep") || undefined,
      prioritario: normalizarTexto(pegar(linha, "prioritario")) === "sim",
    });
  }
  return enderecos;
}

function celulaDaBase(valor: unknown): CelulaBase {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" || typeof valor === "number") return valor;
  return String(valor);
}

const celulaVazia = (v: CelulaBase): boolean => v === null || v === "";

/**
 * A base inteira como foi lida, para o ajuste do Número do PRODASEN (spec 2026-10-06, §3):
 * cabeçalho em texto e células cruas. Descarta a linha sem valor da 2ª coluna em diante,
 * como o script de origem (a 1ª coluna da exportação é lixo).
 */
export function lerBaseEnderecos(buffer: ArrayBuffer): BaseEnderecos {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { cabecalho: [], linhas: [] };
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  if (matriz.length === 0) return { cabecalho: [], linhas: [] };
  const cabecalho = matriz[0].map((c) => String(c ?? ""));
  const linhas = matriz
    .slice(1)
    .map((l) => cabecalho.map((_, i) => celulaDaBase(l[i])))
    .filter((l) => l.slice(1).some((v) => !celulaVazia(v)));
  return { cabecalho, linhas };
}
