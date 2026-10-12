import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { CABECALHO_ELEITOS, CABECALHO_GOVERNO, CABECALHO_SEGUNDO_TURNO, gerarXlsxEleitos, linhasEleitos, linhasGovernadores, linhasSegundoTurno } from "@/lib/export-eleitos";
import type { EleitoClassificado, GovernadorClassificado, ResultadoEleicao } from "@/lib/types";

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
  test("cinco abas com o cabeçalho mesmo vazias, e cada destino na sua aba", () => {
    const e: ResultadoEleicao = { arquivos: [], camaraNoContatos: false, eleitos: [x("Ana", "reeleito", "senado"), x("Davi", "outra_casa", "senado"), x("Bia", "novo", "camara")] };
    const wb = XLSX.read(gerarXlsxEleitos(e), { type: "array" });
    expect(wb.SheetNames).toEqual(["Fica no grupo atual", "Grupo novo", "A conferir", "Governadores", "Governadores 2º turno"]);
    const ler = (aba: string) => XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[aba]);
    expect(ler("Fica no grupo atual").map((l) => l["Nome de urna"])).toEqual(["Ana", "Davi"]);
    expect(ler("Grupo novo").map((l) => l["Nome de urna"])).toEqual(["Bia"]);
    const cabecalho = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["A conferir"], { header: 1 })[0];
    expect(cabecalho).toEqual([...CABECALHO_ELEITOS]);
  });
});


const g = (nome: string, uf: string, destino: GovernadorClassificado["destino"], over: Partial<GovernadorClassificado> = {}): GovernadorClassificado => ({
  eleito: { uf, nomeUrna: nome, nomeCompleto: `${nome} Completo`, partido: "PXX", situacaoTse: "Eleito", statusMandato: "Mandato novo" },
  destino, contatos: [], ...over,
});
const lerAba = (e: ResultadoEleicao, aba: string) => {
  const wb = XLSX.read(gerarXlsxEleitos(e), { type: "array" });
  return {
    linhas: XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets[aba]),
    cabecalho: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[aba], { header: 1 })[0],
  };
};

describe("governadores no arquivo", () => {
  test("cabeçalhos das duas abas", () => {
    expect(CABECALHO_GOVERNO).toEqual(["UF", "Nome de urna", "Nome completo", "Partido", "Status do mandato", "Situação (TSE)", "Destino", "Grupo no Contatos", "Motivo"]);
    expect(CABECALHO_SEGUNDO_TURNO).toEqual(["UF", "Nome de urna", "Partido", "Status do mandato"]);
  });
  test("linhasGovernadores ordena por UF e nome de urna, com destino por extenso", () => {
    const r = linhasGovernadores([
      g("Zeca", "SP", "novo"), g("Bia", "AC", "outro_cargo", { motivo: "m" }), g("Ana", "AC", "reeleito", { contatos: [{ grupo: "Governadores", nome: "Ana" }] }), g("Caio", "BA", "conferir"),
    ]);
    expect(r.map((l) => l["Nome de urna"])).toEqual(["Ana", "Bia", "Caio", "Zeca"]);
    expect(r.map((l) => l.Destino)).toEqual([
      "Reeleito — fica em Governadores", "Eleito governador — fica no cargo atual (Ata 14)", "A conferir", "Mandato novo — Governadores Eleitos",
    ]);
    expect(r[0]["Grupo no Contatos"]).toBe("Governadores");
    expect(r[1].Motivo).toBe("m");
  });
  test("linhasSegundoTurno gera uma linha por candidato", () => {
    const r = linhasSegundoTurno([
      { uf: "SP", candidatos: [{ nomeUrna: "B", partido: "P1", statusMandato: "s" }, { nomeUrna: "A", statusMandato: "s" }] },
      { uf: "AC", candidatos: [{ nomeUrna: "C", partido: "P2", statusMandato: "t" }] },
    ]);
    expect(r).toEqual([
      { UF: "AC", "Nome de urna": "C", Partido: "P2", "Status do mandato": "t" },
      { UF: "SP", "Nome de urna": "A", Partido: "", "Status do mandato": "s" },
      { UF: "SP", "Nome de urna": "B", Partido: "P1", "Status do mandato": "s" },
    ]);
  });
  test("as abas trazem os dados do retrato", () => {
    const e: ResultadoEleicao = { arquivos: [], camaraNoContatos: false, eleitos: [], governadores: { eleitos: [g("Ana", "AC", "novo")], segundoTurno: [{ uf: "SP", candidatos: [{ nomeUrna: "A", statusMandato: "s" }] }] } };
    expect(lerAba(e, "Governadores").linhas.map((l) => l["Nome de urna"])).toEqual(["Ana"]);
    expect(lerAba(e, "Governadores 2º turno").linhas.map((l) => l.UF)).toEqual(["SP"]);
  });
  test("retrato antigo, sem governadores, sai só com cabeçalho nas duas abas", () => {
    const e: ResultadoEleicao = { arquivos: [], camaraNoContatos: false, eleitos: [x("Ana", "novo", "senado")] };
    expect(lerAba(e, "Governadores")).toEqual({ linhas: [], cabecalho: [...CABECALHO_GOVERNO] });
    expect(lerAba(e, "Governadores 2º turno")).toEqual({ linhas: [], cabecalho: [...CABECALHO_SEGUNDO_TURNO] });
    expect(lerAba(e, "Grupo novo").linhas).toHaveLength(1);
  });
});
