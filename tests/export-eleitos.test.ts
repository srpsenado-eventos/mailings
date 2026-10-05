import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { CABECALHO_ELEITOS, gerarXlsxEleitos, linhasEleitos } from "@/lib/export-eleitos";
import type { EleitoClassificado, ResultadoEleicao } from "@/lib/types";

const x = (nome: string, destino: EleitoClassificado["destino"], casa: "senado" | "camara", uf = "MA", over: Partial<EleitoClassificado> = {}): EleitoClassificado => ({
  eleito: { casa, uf, nomeUrna: nome, nomeCompleto: `${nome} Completo`, partido: "PXX", situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino, projecao: false, contatos: [], ...over,
});

describe("linhasEleitos", () => {
  test("uma linha por eleito, com Casa, destino por extenso, grupo no Contatos e motivo", () => {
    const [l] = linhasEleitos([x("Ana", "reeleito", "senado", "MA", { contatos: [{ grupo: "Senadores", nome: "Ana" }] })]);
    expect(Object.keys(l)).toEqual([...CABECALHO_ELEITOS]);
    expect(l).toMatchObject({ Casa: "Senado Federal", UF: "MA", "Nome de urna": "Ana", Destino: "Reeleito — fica no grupo atual", "Grupo no Contatos": "Senadores", Motivo: "" });
  });

  test("ordena por Casa (Senado primeiro), UF e nome de urna", () => {
    const r = linhasEleitos([x("Zeca", "novo", "camara", "AC"), x("Bia", "novo", "senado", "SP"), x("Ana", "novo", "senado", "SP"), x("Caio", "novo", "senado", "AC")]);
    expect(r.map((l) => l["Nome de urna"])).toEqual(["Caio", "Ana", "Bia", "Zeca"]);
  });
});

describe("gerarXlsxEleitos", () => {
  test("três abas com o cabeçalho mesmo vazias, e cada destino na sua aba", () => {
    const e: ResultadoEleicao = { arquivos: [], camaraNoContatos: false, eleitos: [x("Ana", "reeleito", "senado"), x("Davi", "outra_casa", "senado"), x("Bia", "novo", "camara")] };
    const wb = XLSX.read(gerarXlsxEleitos(e), { type: "array" });
    expect(wb.SheetNames).toEqual(["Fica no grupo atual", "Grupo novo", "A conferir"]);
    const ler = (aba: string) => XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[aba]);
    expect(ler("Fica no grupo atual").map((l) => l["Nome de urna"])).toEqual(["Ana", "Davi"]);
    expect(ler("Grupo novo").map((l) => l["Nome de urna"])).toEqual(["Bia"]);
    const cabecalho = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["A conferir"], { header: 1 })[0];
    expect(cabecalho).toEqual([...CABECALHO_ELEITOS]);
  });
});
