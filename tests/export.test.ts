import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { resultadoParaLinhas, gerarXlsx } from "@/lib/export";
import type { ComparacaoCampo, ContatoPlanilha, ResultadoAnalise } from "@/lib/types";

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
            { campo: "nome", valorPlanilha: "Ana", valorEsperado: "Ana", situacao: "confere", origemValor: "pagina" },
            { campo: "cargo", valorPlanilha: "Presidente", valorEsperado: "Diretor", situacao: "divergente", origemValor: "pagina" },
            { campo: "endereco", valorPlanilha: "Rua X", valorEsperado: "SAFS Q4", situacao: "divergente", origemValor: "conhecimento" },
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

/** Constrói uma análise de um contato só, com as comparações dadas. */
function analiseCom(comparacoes: ComparacaoCampo[], contato: ContatoPlanilha): ResultadoAnalise {
  return {
    arquivoNome: "c.xlsx",
    grupos: [
      {
        grupo: "ORG",
        fonteUrl: "https://orgao.gov.br",
        semFonte: false,
        novos: [],
        contatos: [
          {
            contato,
            semaforo: "amarelo",
            score: 1,
            comparacoes,
            camposDivergentes: comparacoes
              .filter((c) => c.situacao === "divergente")
              .map((c) => ({
                campo: c.campo,
                valorPlanilha: c.valorPlanilha,
                valorEncontrado: c.valorEsperado,
              })),
            origem: "oficial",
            fonteUrl: "https://orgao.gov.br",
          },
        ],
      },
    ],
    resumo: {
      total: 1, verde: 0, amarelo: 1, vermelho: 0, novo: 0, indeterminado: 0,
      gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
    },
  };
}

describe("colunas de tratamento e endereçamento", () => {
  test("a coluna de referência do tratamento é rotulada (protocolo), não (site)", () => {
    // Arrange
    const analise = analiseCom(
      [
        {
          campo: "tratamento",
          valorPlanilha: "Senhor Governador",
          valorEsperado: "Excelentíssimo Senhor Governador",
          situacao: "divergente",
          origemValor: "protocolo",
        },
      ],
      { nome: "Ana", grupo: "ORG" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0]["Tratamento (planilha)"]).toBe("Senhor Governador");
    expect(linhas[0]["Tratamento (protocolo)"]).toBe("Excelentíssimo Senhor Governador");
  });

  test("linha de coerência não ocupa o par de colunas do campo", () => {
    // Arrange — a comparação de coerência vem ANTES da de protocolo, como em match.ts
    const analise = analiseCom(
      [
        {
          campo: "tratamento",
          valorPlanilha: "Excelentíssimo Senhor",
          situacao: "divergente",
          origemValor: "coerencia",
          achado: "genero_cargo_tratamento",
        },
        {
          campo: "tratamento",
          valorPlanilha: "Excelentíssimo Senhor",
          valorEsperado: "Excelentíssima Senhora Ministra",
          situacao: "divergente",
          origemValor: "protocolo",
        },
      ],
      { nome: "Maria", grupo: "ORG", cargo: "Ministra do STJ" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0]["Tratamento (protocolo)"]).toBe("Excelentíssima Senhora Ministra");
    expect(linhas[0]["Coerência"]).toBe("gênero do Cargo discorda do Tratamento");
  });

  test("sem regra de protocolo aparece como aviso, não como valor esperado vazio", () => {
    // Arrange
    const analise = analiseCom(
      [{ campo: "tratamento", valorPlanilha: "Senhor(a)", situacao: "sem_regra", origemValor: "protocolo" }],
      { nome: "João", grupo: "ORG" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0]["Tratamento (protocolo)"]).toBe("sem regra de protocolo");
  });

  test("célula vazia com regra sai numa linha só: nada em Coerência e um campo em Divergencias", () => {
    // Arrange
    const analise = analiseCom(
      [
        { campo: "tratamento", valorPlanilha: "", situacao: "divergente", origemValor: "coerencia", achado: "campo_vazio" },
        {
          campo: "tratamento",
          valorPlanilha: "",
          valorEsperado: "Excelentíssimo Senhor Ministro",
          situacao: "divergente",
          origemValor: "protocolo",
        },
      ],
      { nome: "Ana", grupo: "ORG" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0]["Coerência"]).toBe("");
    expect(linhas[0]["Tratamento (protocolo)"]).toBe("Excelentíssimo Senhor Ministro");
    expect(linhas[0].Divergencias).toBe("tratamento");
  });

  test("célula vazia sem regra continua acusada na coluna Coerência", () => {
    // Arrange
    const analise = analiseCom(
      [
        { campo: "enderecamento", valorPlanilha: "", situacao: "divergente", origemValor: "coerencia", achado: "campo_vazio" },
        { campo: "enderecamento", valorPlanilha: "", situacao: "sem_regra", origemValor: "protocolo" },
      ],
      { nome: "Ana", grupo: "ORG" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0]["Coerência"]).toBe("campo vazio (Endereçamento)");
    expect(linhas[0]["Endereçamento (protocolo)"]).toBe("sem regra de protocolo");
  });

  test("dois achados no mesmo contato saem separados por ponto e vírgula", () => {
    // Arrange
    const analise = analiseCom(
      [
        {
          campo: "tratamento",
          valorPlanilha: "Excelentíssimo Senhor",
          situacao: "divergente",
          origemValor: "coerencia",
          achado: "genero_tratamento_enderecamento",
        },
        {
          campo: "enderecamento",
          valorPlanilha: "A Sua Excelência o Senhor(a)",
          situacao: "divergente",
          origemValor: "coerencia",
          achado: "forma_generica",
        },
      ],
      { nome: "Ana", grupo: "ORG" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0]["Coerência"]).toBe(
      "gênero do Tratamento discorda do Endereçamento; forma genérica: falta o gênero da pessoa (Endereçamento)",
    );
  });

  test("Divergencias não repete o nome do campo quando há mais de um achado nele", () => {
    // Arrange
    const analise = analiseCom(
      [
        {
          campo: "tratamento",
          valorPlanilha: "Excelentíssimo Senhor",
          situacao: "divergente",
          origemValor: "coerencia",
          achado: "genero_cargo_tratamento",
        },
        {
          campo: "tratamento",
          valorPlanilha: "Excelentíssimo Senhor",
          valorEsperado: "Excelentíssima Senhora Ministra",
          situacao: "divergente",
          origemValor: "protocolo",
        },
      ],
      { nome: "Maria", grupo: "ORG" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0].Divergencias).toBe("tratamento");
  });

  test("achado da Camada C (nome com tratamento acadêmico) sai na coluna Coerência com o nome corrigido", () => {
    // Arrange
    const analise = analiseCom(
      [
        {
          campo: "nome",
          valorPlanilha: "Dr. Artur Vidigal de Oliveira",
          valorEsperado: "Artur Vidigal de Oliveira",
          situacao: "divergente",
          origemValor: "coerencia",
          achado: "nome_tratamento_academico",
        },
      ],
      { nome: "Dr. Artur Vidigal de Oliveira", grupo: "Ministros do STM" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0].Coerência).toContain("Artur Vidigal de Oliveira");
    expect(linhas[0].Divergencias).toBe("nome");
  });

  test("linhas de novos trazem as mesmas colunas, vazias", () => {
    // Arrange
    const analise = analiseCom([], { nome: "Ana", grupo: "ORG" });
    const comNovo: ResultadoAnalise = {
      ...analise,
      grupos: [
        {
          ...analise.grupos[0],
          novos: [{ nome: "Carlos Lima", cargo: "Ministro", origem: "pagina" }],
        },
      ],
    };

    // Act
    const linhas = resultadoParaLinhas(comNovo);

    // Assert — todas as linhas do arquivo têm exatamente as mesmas chaves
    expect(Object.keys(linhas[1])).toEqual(Object.keys(linhas[0]));
    expect(linhas[1]["Tratamento (protocolo)"]).toBe("");
    expect(linhas[1]["Coerência"]).toBe("");
  });
});
