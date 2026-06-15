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
          contato: { nome: "Ana", grupo: "ORG", cargo: "Presidente", endereco: "Rua X" },
          semaforo: "amarelo", score: 0.7,
          comparacoes: [
            { campo: "nome", valorPlanilha: "Ana", valorSite: "Ana", situacao: "confere", origemValor: "pagina" },
            { campo: "cargo", valorPlanilha: "Presidente", valorSite: "Diretor", situacao: "divergente", origemValor: "pagina" },
            { campo: "endereco", valorPlanilha: "Rua X", valorSite: "SAFS Q4", situacao: "divergente", origemValor: "conhecimento" },
          ],
          camposDivergentes: [
            { campo: "cargo", valorPlanilha: "Presidente", valorEncontrado: "Diretor" },
            { campo: "endereco", valorPlanilha: "Rua X", valorEncontrado: "SAFS Q4" },
          ],
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
  test("achata em colunas planilha×site por campo (com origem do dado)", () => {
    const linhas = resultadoParaLinhas(analise);
    expect(linhas[0]).toMatchObject({
      Grupo: "ORG", Status: "amarelo",
      Fonte: "https://orgao.gov.br", Origem: "oficial",
      "Nome (planilha)": "Ana", "Nome (site)": "Ana",
      "Cargo (planilha)": "Presidente", "Cargo (site)": "Diretor",
      // endereço veio do conhecimento da IA → rotulado
      "Endereço (planilha)": "Rua X", "Endereço (site)": "SAFS Q4 (via IA — confira)",
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
