import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { resultadoParaLinhas, gerarXlsx } from "@/lib/export";
import type { ResultadoAnalise } from "@/lib/types";

const analise: ResultadoAnalise = {
  arquivoNome: "c.xlsx",
  grupos: [
    {
      grupo: "ORG", fonteUrl: "https://orgao.gov.br", semFonte: false,
      contatos: [
        {
          contato: { nome: "Ana", grupo: "ORG", cargo: "Presidente" },
          semaforo: "amarelo", score: 0.7,
          comparacoes: [
            { campo: "cargo", valorPlanilha: "Presidente", valorSite: "Diretor", situacao: "divergente" },
          ],
          camposDivergentes: [{ campo: "cargo", valorPlanilha: "Presidente", valorEncontrado: "Diretor" }],
          origem: "oficial", fonteUrl: "https://orgao.gov.br",
        },
      ],
      novos: [],
    },
  ],
  resumo: {
    total: 1, verde: 0, amarelo: 1, vermelho: 0, novo: 0, indeterminado: 0,
    gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
  },
};

describe("resultadoParaLinhas", () => {
  test("achata em colunas planilha×site por campo", () => {
    const linhas = resultadoParaLinhas(analise);
    expect(linhas[0]).toMatchObject({
      Grupo: "ORG", Nome: "Ana", Status: "amarelo",
      Fonte: "https://orgao.gov.br", Origem: "oficial",
      "Cargo (planilha)": "Presidente", "Cargo (site)": "Diretor",
    });
    expect(linhas[0].Divergencias).toContain("cargo");
  });
});

describe("gerarXlsx", () => {
  test("produz um buffer XLSX legível de volta", () => {
    const buf = gerarXlsx(analise);
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws);
    expect(linhas).toHaveLength(1);
  });
});
