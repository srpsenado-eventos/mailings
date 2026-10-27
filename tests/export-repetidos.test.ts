import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { CABECALHO_REPETIDAS, descreverOcorrencia, gerarXlsxRepetidas, linhasRepetidas } from "@/lib/export-repetidos";
import { autoridadesRepetidas, type OcorrenciaRepetida } from "@/lib/repetidos";
import type { ResultadoContato, ResultadoGrupo } from "@/lib/types";

const linha = (nome: string, cargo: string): ResultadoContato => ({
  contato: { nome, cargo, grupo: "x" }, semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
});
const grupo = (nome: string, contatos: ResultadoContato[]): ResultadoGrupo => ({ grupo: nome, semFonte: false, contatos, novos: [] });

const lista = autoridadesRepetidas([
  grupo("Ministros do STF", [linha("Ana Fictícia", "Ministra do Supremo Tribunal Federal")]),
  grupo("Ministros do TSE", [linha("Ana Fictícia", "Ministra do Tribunal Superior Eleitoral")]),
  grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "")]),
  grupo("Senadores", [linha("Rui Fictício", "Senador")]),
]);

describe("export das autoridades em mais de um grupo", () => {
  test("descreve cada ocorrência com cargo e nível", () => {
    const rui = lista.find((a) => a.nome === "Rui Fictício");
    expect(rui?.ocorrencias.map(descreverOcorrencia)).toEqual([
      "Ex-Presidentes do Senado: cargo vazio (3.5, ex-)",
      "Senadores: Senador (4.13)",
    ]);
  });

  test("uma linha por pessoa, com o grupo do convite", () => {
    const linhas = linhasRepetidas(lista);
    expect(linhas[0]).toEqual({
      Nome: "Ana Fictícia",
      "Situação": "Decidido",
      "Convidar pelo grupo": "Ministros do STF",
      "Cargo do convite": "Ministra do Supremo Tribunal Federal",
      "Nível na Nominata": "4.9 Ministros do Supremo Tribunal Federal",
      Motivo: "Ministros do STF (4.9) antes de Ministros do TSE (5.9)",
      "Grupos em que está": "Ministros do STF: Ministra do Supremo Tribunal Federal (4.9); Ministros do TSE: Ministra do Tribunal Superior Eleitoral (5.9)",
    });
  });

  test("linha de caso a conferir deixa convite e nível vazios", () => {
    const conferir = autoridadesRepetidas([
      grupo("Conselho Nacional de Justiça (CNJ)", [linha("Ana Fictícia", "Conselheira")]),
      grupo("Conselho Nacional do Ministério Público (CNMP)", [linha("Ana Fictícia", "Conselheira")]),
    ]);
    const [l] = linhasRepetidas(conferir);
    expect(l["Situação"]).toBe("Conferir");
    expect(l["Convidar pelo grupo"]).toBe("");
    expect(l["Nível na Nominata"]).toBe("");
  });

  test("ocorrência sem nível aparece como fora da Nominata", () => {
    const o: OcorrenciaRepetida = {
      grupo: "g", grupoRegra: "Embaixadores", chave: "ana", cargo: "Embaixadora", ex: false, possivelSaida: false, origem: "contatos",
    };
    expect(descreverOcorrencia(o)).toBe("Embaixadores: Embaixadora (fora da Nominata)");
  });

  test("gera a aba com o cabeçalho, mesmo vazia", () => {
    for (const entrada of [lista, []]) {
      const wb = XLSX.read(gerarXlsxRepetidas(entrada), { type: "array" });
      expect(wb.SheetNames).toEqual(["Em mais de um grupo"]);
      const [cab] = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Em mais de um grupo"], { header: 1 });
      expect(cab).toEqual([...CABECALHO_REPETIDAS]);
    }
  });
});
