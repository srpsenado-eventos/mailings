import { describe, expect, test } from "vitest";
import { comparacoesCoerencia, rotuloAchado } from "@/lib/tratamento";
import type { AchadoCoerencia, ContatoPlanilha } from "@/lib/types";

/** Contato mínimo; cada teste sobrescreve só os campos que a verificação usa. */
function contato(campos: Partial<ContatoPlanilha>): ContatoPlanilha {
  return { nome: "Fulano de Tal", grupo: "Grupo de Teste", ...campos };
}

/** Achados emitidos, na ordem, como pares campo+achado — o que os testes afirmam. */
function achados(c: ContatoPlanilha): string[] {
  return comparacoesCoerencia(c).map((x) => `${x.campo}:${x.achado}`);
}

describe("comparacoesCoerencia — cadastro coerente não gera achado", () => {
  test("não acusa quando tratamento, endereçamento e cargo concordam no masculino", () => {
    // Arrange
    const c = contato({
      tratamento: "Senhor",
      enderecamento: "A Sua Excelência o Senhor",
      cargo: "Ministro do STF",
    });

    // Act
    const resultado = comparacoesCoerencia(c);

    // Assert
    expect(resultado).toEqual([]);
  });

  test("não acusa quando o cargo não tem marca de gênero", () => {
    // Arrange
    const c = contato({
      tratamento: "Senhora",
      enderecamento: "A Sua Excelência a Senhora",
      cargo: "Presidente do Tribunal Superior Eleitoral",
    });

    // Act / Assert
    expect(comparacoesCoerencia(c)).toEqual([]);
  });

  test("não acusa com a forma extensa 'Excelentíssimo Senhor' concordando no masculino", () => {
    // Arrange
    const c = contato({
      tratamento: "Excelentíssimo Senhor",
      enderecamento: "Ao Senhor",
      cargo: "Governador do Estado do Acre",
    });

    // Act / Assert
    expect(comparacoesCoerencia(c)).toEqual([]);
  });
});

describe("comparacoesCoerencia — gênero entre Tratamento e Endereçamento", () => {
  test("acusa Tratamento masculino com Endereçamento feminino", () => {
    // Arrange — caso real: Nii Amasah Namoale, grupo Embaixadores
    const c = contato({
      nome: "Nii Amasah Namoale",
      tratamento: "Senhor",
      enderecamento: "A Sua Excelência a Senhora",
    });

    // Act
    const resultado = comparacoesCoerencia(c);

    // Assert
    expect(resultado).toEqual([
      {
        campo: "tratamento",
        valorPlanilha: "Senhor",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "genero_tratamento_enderecamento",
      },
    ]);
  });

  test("acusa Tratamento feminino com Endereçamento masculino", () => {
    // Arrange — caso real: Eleni Lianidou
    const c = contato({
      nome: "Eleni Lianidou",
      tratamento: "Senhora",
      enderecamento: "A Sua Excelência o Senhor",
    });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:genero_tratamento_enderecamento"]);
  });

  test("não acusa 'À Senhora' contra 'Senhora' — a crase não muda o gênero", () => {
    // Arrange
    const c = contato({ tratamento: "Senhora", enderecamento: "À Senhora" });

    // Act / Assert
    expect(comparacoesCoerencia(c)).toEqual([]);
  });

  test("não acusa quando o Tratamento não traz marca de gênero", () => {
    // Arrange — caso real: Edson Fachin, com 'Vossa Excelência' na coluna Tratamento.
    // É valor da coluna errada da tabela de protocolo, achado da Camada B, não desta.
    const c = contato({
      nome: "Edson Fachin",
      tratamento: "Vossa Excelência",
      enderecamento: "A Sua Excelência o Senhor",
      cargo: "Ministro do Supremo Tribunal Federal",
    });

    // Act / Assert
    expect(comparacoesCoerencia(c)).toEqual([]);
  });
});

describe("comparacoesCoerencia — gênero entre Cargo e Tratamento", () => {
  test("acusa Tratamento feminino com Cargo masculino", () => {
    // Arrange — caso real: Katarína Tomková
    const c = contato({
      nome: "Katarína Tomková",
      tratamento: "Senhora",
      enderecamento: "A Sua Excelência a Senhora",
      cargo: "Embaixador da Eslováquia",
    });

    // Act
    const resultado = comparacoesCoerencia(c);

    // Assert
    expect(resultado).toEqual([
      {
        campo: "tratamento",
        valorPlanilha: "Senhora",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "genero_cargo_tratamento",
      },
    ]);
  });

  test("acusa Tratamento masculino com Cargo feminino", () => {
    // Arrange — caso real: Antti Petteri Kaski
    const c = contato({
      nome: "Antti Petteri Kaski",
      tratamento: "Senhor",
      enderecamento: "A Sua Excelência o Senhor",
      cargo: "Embaixadora da Finlândia",
    });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:genero_cargo_tratamento"]);
  });

  test("emite os dois achados de gênero quando o contato contradiz os dois campos", () => {
    // Arrange — caso real: Nii Amasah Namoale, que erra endereçamento e cargo de uma vez
    const c = contato({
      nome: "Nii Amasah Namoale",
      tratamento: "Senhor",
      enderecamento: "A Sua Excelência a Senhora",
      cargo: "Embaixadora de Gana",
    });

    // Act / Assert
    expect(achados(c)).toEqual([
      "tratamento:genero_tratamento_enderecamento",
      "tratamento:genero_cargo_tratamento",
    ]);
  });

  test("não acusa cargo cujas palavras não distinguem gênero", () => {
    // Arrange — 'Cônsul', 'Chefe' e 'Embaixatriz' não flexionam como Ministro/Ministra:
    // palavra que não distingue gênero não gera sinal, e sem sinal não há acusação.
    const cargos = ["Cônsul-Geral em Nova York", "Chefe de Gabinete", "Embaixatriz"];
    const feminino = { tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" };
    const masculino = { tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };

    // Act / Assert
    for (const cargo of cargos) {
      expect(comparacoesCoerencia(contato({ ...feminino, cargo }))).toEqual([]);
      expect(comparacoesCoerencia(contato({ ...masculino, cargo }))).toEqual([]);
    }
  });

  test("não trata 'Secretaria' como feminino de secretário — é nome de órgão", () => {
    // Arrange — caso real da planilha: 'Secretaria-Geral da Presidência da República'
    const c = contato({
      tratamento: "Senhor",
      enderecamento: "A Sua Excelência o Senhor",
      cargo: "Ministro de Estado Chefe da Secretaria-Geral da Presidência da República",
    });

    // Act / Assert
    expect(comparacoesCoerencia(c)).toEqual([]);
  });

  test("não acusa quando o cargo traz marcas de gênero conflitantes", () => {
    // Arrange — sinal ambíguo é sinal nenhum; na dúvida, não acusa
    const c = contato({
      tratamento: "Senhora",
      enderecamento: "A Sua Excelência a Senhora",
      cargo: "Ministra Chefe do Gabinete do Advogado-Geral da União",
    });

    // Act / Assert
    expect(comparacoesCoerencia(c)).toEqual([]);
  });

  test("não acusa cargo ausente", () => {
    // Arrange
    const c = contato({ tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" });

    // Act / Assert
    expect(comparacoesCoerencia(c)).toEqual([]);
  });
});

describe("comparacoesCoerencia — forma genérica", () => {
  test("acusa 'Senhor(a)' no Tratamento", () => {
    // Arrange — caso real: Jerônimo Rodrigues
    const c = contato({
      nome: "Jerônimo Rodrigues",
      tratamento: "Senhor(a)",
      enderecamento: "A Sua Excelência o Senhor",
      cargo: "Governador do Estado da Bahia",
    });

    // Act
    const resultado = comparacoesCoerencia(c);

    // Assert — o campo genérico não gera, além disso, acusação de gênero
    expect(resultado).toEqual([
      {
        campo: "tratamento",
        valorPlanilha: "Senhor(a)",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "forma_generica",
      },
    ]);
  });

  test("acusa 'A(o) Senhor(a)' no Endereçamento", () => {
    // Arrange — caso real do grupo piloto
    const c = contato({ tratamento: "Senhora", enderecamento: "A(o) Senhor(a)" });

    // Act / Assert
    expect(achados(c)).toEqual(["enderecamento:forma_generica"]);
  });

  test("acusa os dois campos quando os dois são genéricos", () => {
    // Arrange
    const c = contato({ tratamento: "Senhor(a)", enderecamento: "A(o) Senhor(a)" });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:forma_generica", "enderecamento:forma_generica"]);
  });

  test("acusa 'Excelentíssimo(a) Senhor(a)' como forma genérica", () => {
    // Arrange — caso real: Victor Manuel Cairo Palomo
    const c = contato({
      tratamento: "Excelentíssimo(a) Senhor(a)",
      enderecamento: "A Sua Excelência a Senhora",
    });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:forma_generica"]);
  });
});

describe("comparacoesCoerencia — campo vazio", () => {
  test("acusa Endereçamento vazio como divergente", () => {
    // Arrange — caso real: Dias Toffoli no grupo Ministros do TSE
    const c = contato({
      nome: "Dias Toffoli",
      grupo: "Ministros do TSE",
      tratamento: "Senhor",
      enderecamento: "",
      cargo: "Ministro do Tribunal Superior Eleitoral",
    });

    // Act
    const resultado = comparacoesCoerencia(c);

    // Assert
    expect(resultado).toEqual([
      {
        campo: "enderecamento",
        valorPlanilha: "",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "campo_vazio",
      },
    ]);
  });

  test("acusa Tratamento ausente como divergente", () => {
    // Arrange — coluna ausente na linha equivale a célula vazia
    const c = contato({ enderecamento: "A Sua Excelência o Senhor" });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:campo_vazio"]);
  });

  test("acusa campo só com espaços em branco", () => {
    // Arrange
    const c = contato({ tratamento: "   ", enderecamento: "Ao Senhor" });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:campo_vazio"]);
  });

  test("campo vazio não acumula acusação de gênero nem de forma genérica", () => {
    // Arrange — sem valor não há gênero a comparar com o endereçamento nem com o cargo
    const c = contato({
      tratamento: "",
      enderecamento: "A Sua Excelência a Senhora",
      cargo: "Embaixador do Haiti",
    });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:campo_vazio"]);
  });

  test("acusa os dois campos quando os dois estão vazios", () => {
    // Arrange — caso real: 'A SER DESIGNADO', no grupo Embaixadores
    const c = contato({ nome: "A SER DESIGNADO", tratamento: "", enderecamento: "" });

    // Act / Assert
    expect(achados(c)).toEqual(["tratamento:campo_vazio", "enderecamento:campo_vazio"]);
  });
});

describe("comparacoesCoerencia — contrato", () => {
  test("nunca emite 'confere': a Camada A só aponta contradição, não confirma valor", () => {
    // Arrange
    const c = contato({
      tratamento: "Senhor",
      enderecamento: "A Sua Excelência o Senhor",
      cargo: "Ministro do STF",
    });

    // Act
    const situacoes = comparacoesCoerencia(c).map((x) => x.situacao);

    // Assert
    expect(situacoes).not.toContain("confere");
  });

  test("não muta o contato recebido", () => {
    // Arrange
    const c = contato({ tratamento: "Senhor(a)", enderecamento: "", cargo: "Embaixadora de Gana" });
    const antes = JSON.parse(JSON.stringify(c));

    // Act
    comparacoesCoerencia(c);

    // Assert
    expect(c).toEqual(antes);
  });
});

describe("rotuloAchado", () => {
  test("devolve texto em português para cada achado", () => {
    // Arrange
    const todos: AchadoCoerencia[] = [
      "genero_tratamento_enderecamento",
      "genero_cargo_tratamento",
      "forma_generica",
      "campo_vazio",
    ];

    // Act
    const rotulos = todos.map(rotuloAchado);

    // Assert
    expect(rotulos).toEqual([
      "gênero do Tratamento discorda do Endereçamento",
      "gênero do Cargo discorda do Tratamento",
      "forma genérica: falta o gênero da pessoa",
      "campo vazio",
    ]);
    expect(new Set(rotulos).size).toBe(todos.length);
  });
});
