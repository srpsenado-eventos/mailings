import { describe, expect, test } from "vitest";
import { comparacaoPrefixoNome, comparacaoRegraNome, contatoEhFeminino, nomeEsperadoComPrefixo, rotuloAchado, textoCoerencia } from "@/lib/tratamento";
import type { RegraNome } from "@/data/regras-nome";
import type { ContatoPlanilha } from "@/lib/types";

const GRUPO_STM = "Ministros do STM";

/** Contato mínimo; cada teste sobrescreve só os campos que a verificação usa. Nome fictício. */
function contato(campos: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Joaquim Bezerra Vilaça", grupo: "Grupo de Teste", ...campos };
}

describe("comparacaoRegraNome — Camada C, ministros do STM", () => {
  test("acusa 'Dr.' no nome de um contato do STM", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça" });

    // Act
    const resultado = comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(resultado).toEqual([
      {
        campo: "nome",
        valorPlanilha: "Dr. Joaquim Bezerra Vilaça",
        valorEsperado: "Joaquim Bezerra Vilaça",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "nome_tratamento_academico",
      },
    ]);
  });

  test("não acusa quando o cadastro já está limpo", () => {
    // Arrange
    const c = contato({ nome: "Joaquim Bezerra Vilaça" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test.each([
    ["Dra. Luiza Meireles Prado", "Luiza Meireles Prado"],
    ["DRA LUIZA MEIRELES PRADO", "LUIZA MEIRELES PRADO"],
    ["Doutor Joaquim Bezerra Vilaça", "Joaquim Bezerra Vilaça"],
    ["Doutora Luiza Meireles Prado", "Luiza Meireles Prado"],
    ["Dr Joaquim Bezerra Vilaça", "Joaquim Bezerra Vilaça"],
    ["dra. Luiza Meireles Prado", "Luiza Meireles Prado"],
  ])("acusa e corrige a forma '%s'", (nome, corrigido) => {
    // Arrange
    const c = contato({ nome });

    // Act
    const resultado = comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(resultado).toHaveLength(1);
    expect(resultado[0].achado).toBe("nome_tratamento_academico");
    expect(resultado[0].valorEsperado).toBe(corrigido);
  });

  test("acusa tratamento acadêmico no meio do nome, não só no início", () => {
    // Arrange
    const c = contato({ nome: "Ministra Dra. Luiza Meireles Prado" });

    // Act
    const resultado = comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(resultado).toHaveLength(1);
    expect(resultado[0].valorEsperado).toBe("Ministra Luiza Meireles Prado");
  });

  test("não acusa 'Coronel Tadeu Silva' — patente é nome parlamentar, não tratamento", () => {
    // Arrange
    const c = contato({ nome: "Coronel Tadeu Silva" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test("não casa por substring: 'Adroaldo' não é 'Dr'", () => {
    // Arrange
    const c = contato({ nome: "Marcos Adroaldo Ferreira" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test("não casa por substring: 'Andrade' e 'Dracena' não disparam", () => {
    // Arrange
    const c = contato({ nome: "Ana Dracena Andrade" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM)).toEqual([]);
  });

  test("não acusa contato de outro grupo com 'Dr.' no nome — a regra é por grupo", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça", grupo: "Ministros do STF" });

    // Act / Assert
    expect(comparacaoRegraNome(c, "Ministros do STF")).toEqual([]);
  });

  test("não acusa quando não há grupo canônico resolvido", () => {
    // Arrange — grupo desconhecido na planilha, sem casamento no catálogo
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça" });

    // Act / Assert
    expect(comparacaoRegraNome(c, undefined)).toEqual([]);
  });

  test("não muta o contato recebido", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça" });
    const antes = JSON.parse(JSON.stringify(c));

    // Act
    comparacaoRegraNome(c, GRUPO_STM);

    // Assert
    expect(c).toEqual(antes);
  });
});

describe("rotuloAchado e textoCoerencia — nome_tratamento_academico", () => {
  test("rotuloAchado descreve o problema em português", () => {
    // Act
    const rotulo = rotuloAchado("nome_tratamento_academico");

    // Assert
    expect(rotulo.length).toBeGreaterThan(0);
    expect(rotulo).not.toBe(rotuloAchado("campo_vazio"));
  });

  test("textoCoerencia traz o nome corrigido entre parênteses, para o usuário copiar", () => {
    // Arrange
    const achado = comparacaoRegraNome(
      contato({ nome: "Dr. Joaquim Bezerra Vilaça" }),
      GRUPO_STM,
    )[0];

    // Act
    const texto = textoCoerencia(achado);

    // Assert
    expect(texto).toContain("Joaquim Bezerra Vilaça");
    expect(texto.endsWith("(Joaquim Bezerra Vilaça)")).toBe(true);
  });
});

describe("comparacaoPrefixoNome — Presidente de tribunal leva \"Ministro(a)\" no nome (spec 2026-10-30 §3.3)", () => {
  const GRUPO_STF = "Ministros do STF";

  test("Presidente do STF sem o prefixo diverge, com \"Ministro\" + nome como esperado", () => {
    // Arrange
    const c = contato({ nome: "Edson Fachin", cargo: "Presidente do Supremo Tribunal Federal", tratamento: "Senhor" });

    // Act
    const resultado = comparacaoPrefixoNome(c, GRUPO_STF);

    // Assert
    expect(resultado).toEqual([
      {
        campo: "nome",
        valorPlanilha: "Edson Fachin",
        valorEsperado: "Ministro Edson Fachin",
        situacao: "divergente",
        origemValor: "coerencia",
        achado: "nome_sem_prefixo",
      },
    ]);
  });

  test("Presidente do STF com o prefixo não gera achado", () => {
    // Arrange
    const c = contato({ nome: "Ministro Edson Fachin", cargo: "Presidente do Supremo Tribunal Federal" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_STF)).toEqual([]);
  });

  test("contato feminino com cargo masculino antigo: o prefixo esperado é \"Ministra\" (ponto 3 da revisão)", () => {
    // Arrange
    const c = contato({ nome: "Cármen Lúcia", cargo: "Presidente do STF", tratamento: "Senhora" });

    // Act
    const resultado = comparacaoPrefixoNome(c, GRUPO_STF);

    // Assert
    expect(resultado).toHaveLength(1);
    expect(resultado[0].valorEsperado).toBe("Ministra Cármen Lúcia");
  });

  test("\"Ministra\" já no nome não gera achado", () => {
    // Arrange
    const c = contato({ nome: "Ministra Cármen Lúcia", cargo: "Presidente do STF", tratamento: "Senhora" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_STF)).toEqual([]);
  });

  test("prefixo em caixa alta é reconhecido", () => {
    // Arrange
    const c = contato({ nome: "MINISTRO EDSON FACHIN", cargo: "PRESIDENTE DO STF" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_STF)).toEqual([]);
  });

  test("forma genérica \"Ministro(a)\" no nome é trocada pelo prefixo no gênero do contato", () => {
    // Arrange
    const c = contato({ nome: "Ministro(a) Cármen Lúcia", cargo: "Presidente do STF", enderecamento: "A Sua Excelência a Senhora" });

    // Act
    const resultado = comparacaoPrefixoNome(c, GRUPO_STF);

    // Assert
    expect(resultado).toHaveLength(1);
    expect(resultado[0].valorEsperado).toBe("Ministra Cármen Lúcia");
  });

  test("Presidenta do tribunal também leva o prefixo", () => {
    // Arrange
    const c = contato({ nome: "Cármen Lúcia", cargo: "Presidenta do STF" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_STF)).toHaveLength(1);
  });

  test("Vice-Presidente do tribunal não leva o prefixo", () => {
    // Arrange
    const c = contato({ nome: "Joaquim Bezerra Vilaça", cargo: "Vice-Presidente do Superior Tribunal de Justiça" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, "Ministros do STJ")).toEqual([]);
  });

  test("Ministro do tribunal (não presidente) não leva o prefixo", () => {
    // Arrange
    const c = contato({ nome: "Joaquim Bezerra Vilaça", cargo: "Ministro do Superior Tribunal Militar" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_STM)).toEqual([]);
  });

  test.each([
    "Ministros do STF",
    "Ministros do STJ",
    "Ministros do TSE",
    "Ministros do TST",
    "Ministros do STM",
    "Ministros do TCU",
  ])("vale no grupo de tribunal %s", (grupo) => {
    // Arrange
    const c = contato({ nome: "Joaquim Bezerra Vilaça", cargo: "Presidente do Tribunal" });

    // Act
    const resultado = comparacaoPrefixoNome(c, grupo);

    // Assert
    expect(resultado.map((r) => r.valorEsperado)).toEqual(["Ministro Joaquim Bezerra Vilaça"]);
  });

  test("no STM, o esperado já vem sem o tratamento acadêmico proibido", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça", cargo: "Presidente do Superior Tribunal Militar" });

    // Act
    const resultado = comparacaoPrefixoNome(c, GRUPO_STM);

    // Assert
    expect(resultado.map((r) => r.valorEsperado)).toEqual(["Ministro Joaquim Bezerra Vilaça"]);
  });

  test("a regra do STM (tratamento acadêmico) continua de pé ao lado do prefixo", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça", cargo: "Presidente do Superior Tribunal Militar" });

    // Act / Assert
    expect(comparacaoRegraNome(c, GRUPO_STM).map((r) => r.achado)).toEqual(["nome_tratamento_academico"]);
  });

  test("Presidente do Senado e da Câmara ficam fora da regra", () => {
    // Arrange
    const c = contato({ nome: "Davi Alcolumbre", cargo: "Presidente do Senado Federal" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, "Presidente do Senado")).toEqual([]);
    expect(comparacaoPrefixoNome(c, "Presidente da Câmara dos Deputados")).toEqual([]);
  });

  test("Senadores: nome com \"Senador\" não é acusado nem corrigido", () => {
    // Arrange
    const c = contato({ nome: "Senador Davi Alcolumbre", cargo: "Senador" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, "Senadores")).toEqual([]);
  });

  test("sem grupo canônico resolvido, não acusa", () => {
    // Arrange
    const c = contato({ nome: "Edson Fachin", cargo: "Presidente do STF" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, undefined)).toEqual([]);
  });

  test("nome vazio não gera achado", () => {
    // Arrange
    const c = contato({ nome: "  ", cargo: "Presidente do STF" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_STF)).toEqual([]);
  });

  test("não muta o contato recebido", () => {
    // Arrange
    const c = contato({ nome: "Edson Fachin", cargo: "Presidente do STF" });
    const antes = JSON.parse(JSON.stringify(c));

    // Act
    comparacaoPrefixoNome(c, GRUPO_STF);

    // Assert
    expect(c).toEqual(antes);
  });

  test("aceita regras injetadas", () => {
    // Arrange
    const regras: Record<string, RegraNome> = { "Grupo X": { prefixoDoPresidente: "ministro" } };
    const c = contato({ nome: "Edson Fachin", cargo: "Presidente do Grupo X" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, "Grupo X", regras)).toHaveLength(1);
    expect(comparacaoPrefixoNome(c, GRUPO_STF, regras)).toEqual([]);
  });
});

describe("comparacaoPrefixoNome — Presidente da República leva \"Presidente\" no nome", () => {
  const GRUPO_PR = "Presidente da República";

  test("sem o prefixo diverge, com \"Presidente\" + nome como esperado", () => {
    // Arrange
    const c = contato({ nome: "Luís Inácio Lula da Silva", cargo: "Presidente da República Federativa do Brasil" });

    // Act
    const resultado = comparacaoPrefixoNome(c, GRUPO_PR);

    // Assert
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      campo: "nome",
      valorEsperado: "Presidente Luís Inácio Lula da Silva",
      situacao: "divergente",
      achado: "nome_sem_prefixo",
    });
  });

  test("com o prefixo não gera achado (nunca propõe tirá-lo)", () => {
    // Arrange
    const c = contato({ nome: "Presidente Luís Inácio Lula da Silva", cargo: "Presidente da República" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_PR)).toEqual([]);
  });

  test("Vice-Presidente que caia no grupo nunca recebe \"Presidente\" no nome", () => {
    // Arrange
    const c = contato({ nome: "Joaquim Bezerra Vilaça", cargo: "Vice-Presidente da República" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_PR)).toEqual([]);
  });

  test("vale para todo contato do grupo, qualquer que seja o cargo", () => {
    // Arrange
    const c = contato({ nome: "Luís Inácio Lula da Silva", cargo: "" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_PR).map((r) => r.valorEsperado)).toEqual(["Presidente Luís Inácio Lula da Silva"]);
  });
});

describe("contatoEhFeminino", () => {
  test.each([
    [{ tratamento: "Senhora" }, true],
    [{ tratamento: "Excelentíssima Senhora" }, true],
    [{ enderecamento: "A Sua Excelência a Senhora" }, true],
    [{ cargo: "Ministra do Supremo Tribunal Federal" }, true],
    [{ tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor", cargo: "Presidente do STF" }, false],
    [{ tratamento: "Senhor(a)" }, false],
    [{}, false],
  ] as [Partial<ContatoPlanilha>, boolean][])("%o → %s", (campos, esperado) => {
    // Act / Assert
    expect(contatoEhFeminino(contato(campos))).toBe(esperado);
  });
});

describe("rotuloAchado e textoCoerencia — nome_sem_prefixo", () => {
  test("rotuloAchado nomeia o achado", () => {
    expect(rotuloAchado("nome_sem_prefixo")).toBe("Nome sem o prefixo do cargo");
  });

  test("textoCoerencia traz o nome com o prefixo e explica a regra do GT", () => {
    // Arrange
    const achado = comparacaoPrefixoNome(contato({ nome: "Edson Fachin", cargo: "Presidente do STF" }), "Ministros do STF")[0];

    // Act
    const texto = textoCoerencia(achado);

    // Assert
    expect(texto).toContain("(Ministro Edson Fachin)");
    expect(texto).toContain('O Presidente de tribunal leva "Ministro(a)" antes do nome; o Presidente da República leva "Presidente" (regra do GT, 2026-10-30)');
  });
});

describe("comparacaoPrefixoNome — limpeza de tratamentos antes do prefixo", () => {
  test("\"Exmo. Ministro Fulano\" conta como nome com o prefixo", () => {
    // Arrange
    const c = contato({ nome: "Exmo. Ministro Joaquim Bezerra Vilaça", cargo: "Presidente do STF" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, "Ministros do STF")).toEqual([]);
  });

  test("\"Dr. Fulano\" no STF: o esperado é \"Ministro Fulano\", sem o Dr.", () => {
    // Arrange
    const c = contato({ nome: "Dr. Joaquim Bezerra Vilaça", cargo: "Presidente do STF" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, "Ministros do STF").map((r) => r.valorEsperado)).toEqual(["Ministro Joaquim Bezerra Vilaça"]);
  });

  test("\"Exma. Sra. Fulana\" no STF: o esperado é \"Ministra Fulana\"", () => {
    // Arrange
    const c = contato({ nome: "Exma. Sra. Luiza Meireles Prado", cargo: "Presidente do STF", tratamento: "Senhora" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, "Ministros do STF").map((r) => r.valorEsperado)).toEqual(["Ministra Luiza Meireles Prado"]);
  });

  test("patente não é tratamento: fica no esperado", () => {
    // Arrange
    const c = contato({ nome: "General Joaquim Vilaça", cargo: "Presidente do Superior Tribunal Militar" });

    // Act / Assert
    expect(comparacaoPrefixoNome(c, GRUPO_STM).map((r) => r.valorEsperado)).toEqual(["Ministro General Joaquim Vilaça"]);
  });
});

describe("nomeEsperadoComPrefixo", () => {
  test("com a regra, prefixo no gênero do contato + nome da página", () => {
    // Arrange
    const c = contato({ nome: "Ministro Joaquim Vilaça", cargo: "Presidente do STF" });

    // Act / Assert
    expect(nomeEsperadoComPrefixo(c, "Ministros do STF", "Joaquim Bezerra Vilaça")).toBe("Ministro Joaquim Bezerra Vilaça");
  });

  test("página com \"Ministro\" ou \"Exmo.\" não empilha o prefixo", () => {
    // Arrange
    const c = contato({ nome: "Ministro Joaquim Vilaça", cargo: "Presidente do STF" });

    // Act / Assert
    expect(nomeEsperadoComPrefixo(c, "Ministros do STF", "Exmo. Ministro Joaquim Bezerra Vilaça")).toBe("Ministro Joaquim Bezerra Vilaça");
  });

  test("Presidente da República: \"Presidente\" + nome da página", () => {
    // Arrange
    const c = contato({ nome: "Presidente Luís Inácio Lula da Silva" });

    // Act / Assert
    expect(nomeEsperadoComPrefixo(c, "Presidente da República", "Luiz Inácio Lula da Silva")).toBe("Presidente Luiz Inácio Lula da Silva");
  });

  test("sem a regra para o contato, devolve o nome da página como veio", () => {
    // Arrange
    const ministro = contato({ nome: "Joaquim Vilaça", cargo: "Ministro do STF" });

    // Act / Assert
    expect(nomeEsperadoComPrefixo(ministro, "Ministros do STF", "Joaquim Bezerra Vilaça")).toBe("Joaquim Bezerra Vilaça");
    expect(nomeEsperadoComPrefixo(ministro, "Senadores", "Senador Joaquim Vilaça")).toBe("Senador Joaquim Vilaça");
    expect(nomeEsperadoComPrefixo(ministro, undefined, "Joaquim Vilaça")).toBe("Joaquim Vilaça");
  });
});
