import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { resultadoParaLinhas, gerarXlsx } from "@/lib/export";
import type { ComparacaoCampo, ContatoPlanilha, ResultadoAnalise, ResultadoContato } from "@/lib/types";

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
    total: 1, verde: 0, amarelo: 1, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0,
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

  test("novo vindo de fonte rotulada leva a situação na observação e a URL daquela fonte", () => {
    const analise: ResultadoAnalise = {
      arquivoNome: "c.xlsx",
      grupos: [
        {
          grupo: "Senadores (Maranhão ao Piauí)",
          fonteUrl: "https://senado.leg.br/em-exercicio",
          semFonte: false,
          contatos: [],
          novos: [
            {
              nome: "Wellington Dias",
              uf: "PI",
              origem: "pagina",
              contexto: "Ocupação de cargo de ministro/secretário",
              rotuloFonte: "fora de exercício",
              fonteUrl: "https://senado.leg.br/fora-de-exercicio",
            },
          ],
        },
      ],
      resumo: {
        total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 1, indeterminado: 0, enderecosAConfirmar: 0,
        gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
      },
    };
    const linha = resultadoParaLinhas(analise)[0];
    expect(linha.Status).toBe("novo");
    expect(linha.Observacao).toBe(
      "Pessoa na fonte sem correspondência na planilha — fora de exercício: Ocupação de cargo de ministro/secretário",
    );
    expect(linha.Fonte).toBe("https://senado.leg.br/fora-de-exercicio");
  });

  test("fonte que não respondeu vira ressalva na observação de quem trabalha pelo download", () => {
    // Arrange: grupo comparado com a fonte que sobrou, com o motivo técnico da que caiu.
    const analise: ResultadoAnalise = {
      arquivoNome: "c.xlsx",
      grupos: [
        {
          grupo: "Senadores (Maranhão ao Piauí)",
          fonteUrl: "https://senado.leg.br/em-exercicio",
          semFonte: false,
          erroFonte: "fora de exercício: HTTP 403",
          contatos: [
            {
              contato: { nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)" },
              semaforo: "indeterminado",
              score: 0,
              comparacoes: [],
              camposDivergentes: [],
              origem: "oficial",
              fonteUrl: "https://senado.leg.br/em-exercicio",
              observacao: "Não consta nas fontes que responderam",
            },
          ],
          novos: [],
        },
      ],
      resumo: {
        total: 1, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 1, enderecosAConfirmar: 0,
        gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
      },
    };

    // Act
    const linha = resultadoParaLinhas(analise)[0];

    // Assert: a mesma ressalva que a tela dá chega à planilha baixada.
    expect(linha.Status).toBe("indeterminado");
    expect(linha.Observacao).toBe(
      "Não consta nas fontes que responderam · fonte não respondeu — fora de exercício: HTTP 403",
    );
  });

  test("grupo inteiro inacessível não repete o motivo: a observação do contato já o diz", () => {
    // Arrange: aqui `erroFonte` é o motivo da única fonte, e a observação do contato já
    // avisa que a fonte não pôde ser lida. Somar a ressalva daria a mesma frase duas vezes
    // na mesma célula — a tela suprime pelo mesmo motivo.
    const analise: ResultadoAnalise = {
      arquivoNome: "c.xlsx",
      grupos: [
        {
          grupo: "TCU",
          fonteUrl: "https://tcu.gov.br",
          semFonte: false,
          fonteInacessivel: true,
          erroFonte: "HTTP 403",
          contatos: [
            {
              contato: { nome: "Ana", grupo: "TCU" },
              semaforo: "indeterminado",
              score: 0,
              comparacoes: [],
              camposDivergentes: [],
              origem: "oficial",
              fonteUrl: "https://tcu.gov.br",
              observacao: "Fonte cadastrada, mas inacessível — verifique manualmente",
            },
          ],
          novos: [],
        },
      ],
      resumo: {
        total: 1, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 1, enderecosAConfirmar: 0,
        gruposSemFonte: 0, gruposFonteInacessivel: 1, gruposViaPesquisaAmpla: 0,
      },
    };

    // Act
    const linha = resultadoParaLinhas(analise)[0];

    // Assert
    expect(linha.Observacao).toBe("Fonte cadastrada, mas inacessível — verifique manualmente");
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
      total: 1, verde: 0, amarelo: 1, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0,
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
    // Arrange — nome fictício
    const analise = analiseCom(
      [
        {
          campo: "nome",
          valorPlanilha: "Dr. Joaquim Bezerra Vilaça",
          valorEsperado: "Joaquim Bezerra Vilaça",
          situacao: "divergente",
          origemValor: "coerencia",
          achado: "nome_tratamento_academico",
        },
      ],
      { nome: "Dr. Joaquim Bezerra Vilaça", grupo: "Ministros do STM" },
    );

    // Act
    const linhas = resultadoParaLinhas(analise);

    // Assert
    expect(linhas[0].Coerência).toContain("Joaquim Bezerra Vilaça");
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

/** Um grupo com um contato, para testar colunas isoladas. `over` sobrescreve o contato. */
function analiseComContato(over: Partial<ResultadoContato>): ResultadoAnalise {
  return {
    arquivoNome: "c.xlsx",
    grupos: [
      {
        grupo: "ORG", fonteUrl: "https://orgao.gov.br", semFonte: false,
        contatos: [
          {
            contato: { nome: "Ana", grupo: "ORG" },
            semaforo: "verde", score: 1,
            comparacoes: [],
            camposDivergentes: [],
            origem: "oficial", fonteUrl: "https://orgao.gov.br",
            ...over,
          },
        ],
        novos: [],
      },
    ],
    resumo: {
      total: 1, verde: 1, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0,
      gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
    },
  };
}

describe("colunas do endereço auditado", () => {
  test("endereço auditado sai em colunas separadas, com situação e achados", () => {
    // Arrange
    const analise = analiseComContato({
      endereco: {
        situacao: "a_completar",
        achados: ["sem_bairro"],
        endereco: {
          contatoId: "7", logradouro: "Praça dos Três Poderes", numero: "S/N",
          cidade: "Brasília", uf: "DF", cep: "70160-900", prioritario: true,
        },
        formatado: "Praça dos Três Poderes, S/N\n70160-900 Brasília - DF",
        linhas: 1,
      },
    });

    // Act
    const linha = resultadoParaLinhas(analise)[0];

    // Assert
    expect(linha["Logradouro"]).toBe("Praça dos Três Poderes");
    expect(linha["Número"]).toBe("S/N");
    expect(linha["CEP"]).toBe("70160-900");
    expect(linha["UF"]).toBe("DF");
    expect(linha["Endereço (situação)"]).toBe("a completar");
    expect(linha["Endereço (achados)"]).toBe("sem bairro (sai do CEP)");
  });

  test("sem base de endereços, as colunas novas saem vazias e as antigas não mudam", () => {
    // Arrange
    const analise = analiseComContato({ endereco: { situacao: "sem_base", achados: [] } });

    // Act
    const linha = resultadoParaLinhas(analise)[0];

    // Assert
    expect(linha["Logradouro"]).toBe("");
    expect(linha["Endereço (situação)"]).toBe("");
    expect(linha["Endereço (achados)"]).toBe("");
  });

  test("as colunas que já existiam mantêm nome e ordem com as novas no fim", () => {
    // Arrange
    const analise = analiseComContato({ endereco: { situacao: "sem_base", achados: [] } });

    // Act
    const chaves = Object.keys(resultadoParaLinhas(analise)[0]);

    // Assert
    expect(chaves.slice(0, 6)).toEqual([
      "Grupo", "Status", "Divergencias", "Origem", "Fonte", "Observacao",
    ]);
    expect(chaves.indexOf("Coerência")).toBeLessThan(chaves.indexOf("Logradouro"));
  });

  test("a coluna montada só traz texto quando o endereço está completo", () => {
    // Arrange
    const analise = analiseComContato({
      endereco: { situacao: "pendente", achados: ["sem_logradouro"] },
    });

    // Act
    const linha = resultadoParaLinhas(analise)[0];

    // Assert
    expect(linha["Endereço (montado)"]).toBe("");
    expect(linha["Endereço (situação)"]).toBe("a confirmar");
  });
});
