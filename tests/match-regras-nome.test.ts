import { describe, expect, test } from "vitest";
import { compararGrupo, marcarFonteInacessivel } from "@/lib/match";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

const GRUPO_STM = "Ministros do STM";

/** Cadastro coerente e conforme à tabela de protocolo, para isolar o achado da Camada C. */
const CADASTRO_OK = {
  tratamento: "Senhor",
  enderecamento: "A Sua Excelência o Senhor",
} as const;

/** Nome fictício, usado consistentemente entre cadastro e site nos testes deste arquivo. */
function contato(p: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Dr. Joaquim Bezerra Vilaça", grupo: "STM", ...CADASTRO_OK, ...p };
}

const fonte: ConteudoFonte = {
  url: "https://stm.jus.br",
  textoLimpo: "Dr. Joaquim Bezerra Vilaça, Ministro.",
  destaques: [],
  pessoas: [{ nome: "Dr. Joaquim Bezerra Vilaça", cargo: "Ministro", origem: "pagina" }],
};

const achadosDe = (comparacoes: readonly { achado?: string }[]): (string | undefined)[] =>
  comparacoes.map((c) => c.achado);

describe("Camada C nos quatro caminhos de ResultadoContato", () => {
  test("pessoa casada: 'Dr.' no cadastro do STM pinta amarelo", () => {
    // Act
    const g = compararGrupo("STM", [contato()], fonte, GRUPO_STM);

    // Assert
    expect(g.contatos[0].semaforo).toBe("amarelo");
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_tratamento_academico");
    expect(g.contatos[0].camposDivergentes.map((d) => d.campo)).toContain("nome");
  });

  test("pessoa casada: nome já limpo volta a verde", () => {
    // Act
    const g = compararGrupo(
      "STM",
      [contato({ nome: "Joaquim Bezerra Vilaça" })],
      { ...fonte, pessoas: [{ nome: "Joaquim Bezerra Vilaça", cargo: "Ministro", origem: "pagina" }] },
      GRUPO_STM,
    );

    // Assert
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(achadosDe(g.contatos[0].comparacoes)).not.toContain("nome_tratamento_academico");
  });

  test("cadastro já limpo com o site ainda trazendo o tratamento continua casando e sai verde", () => {
    // Arrange — o site publica com "Dr." (como o STM realmente faz), mas o cadastro já foi
    // corrigido. `normalizarNome` remove o tratamento dos dois lados antes de comparar
    // (regra que não muda, ver spec), então o nome CASA normalmente; a Camada C, por sua
    // vez, não olha o site — só o campo Nome do cadastro — e por isso também não acusa.
    const fonteComTratamento: ConteudoFonte = {
      ...fonte,
      pessoas: [{ nome: "Dr. Joaquim Bezerra Vilaça", cargo: "Ministro", origem: "pagina" }],
    };

    // Act
    const g = compararGrupo(
      "STM",
      [contato({ nome: "Joaquim Bezerra Vilaça" })],
      fonteComTratamento,
      GRUPO_STM,
    );

    // Assert
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(achadosDe(g.contatos[0].comparacoes)).not.toContain("nome_tratamento_academico");
    expect(g.contatos[0].camposDivergentes).toHaveLength(0);
  });

  test("possível saída: acusa o tratamento acadêmico e continua vermelho, nunca sai da possível saída", () => {
    // Arrange
    const semPessoa: ConteudoFonte = { ...fonte, pessoas: [] };

    // Act
    const g = compararGrupo("STM", [contato()], semPessoa, GRUPO_STM);

    // Assert
    expect(g.contatos[0].possivelSaida).toBe(true);
    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_tratamento_academico");
  });

  test("fonte inacessível: acusa o tratamento acadêmico e continua indeterminado", () => {
    // Act
    const g = marcarFonteInacessivel("STM", [contato()], "https://stm.jus.br", "timeout", GRUPO_STM);

    // Assert
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_tratamento_academico");
  });

  test("grupo sem fonte: acusa o tratamento acadêmico sem perder o campo 'fonte', e continua vermelho", () => {
    // Act
    const g = compararGrupo("STM", [contato()], undefined, GRUPO_STM);

    // Assert
    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_tratamento_academico");
    expect(g.contatos[0].camposDivergentes.map((d) => d.campo)).toContain("fonte");
  });

  test("outro grupo com o mesmo problema no nome não é acusado — a regra é só do STM", () => {
    // Act
    const g = compararGrupo(
      "STF",
      [contato({ grupo: "STF" })],
      { ...fonte, pessoas: [{ nome: "Dr. Joaquim Bezerra Vilaça", cargo: "Ministro", origem: "pagina" }] },
      "Ministros do STF",
    );

    // Assert
    expect(achadosDe(g.contatos[0].comparacoes)).not.toContain("nome_tratamento_academico");
  });

  test("sem grupo canônico resolvido, não acusa (compatibilidade retroativa)", () => {
    // Act
    const g = compararGrupo("STM", [contato()], fonte);

    // Assert
    expect(achadosDe(g.contatos[0].comparacoes)).not.toContain("nome_tratamento_academico");
  });
});

describe("Prefixo do presidente (Camada C) nos caminhos de ResultadoContato", () => {
  const GRUPO_STF = "Ministros do STF";
  const presidente = (p: Partial<ContatoPlanilha> = {}): ContatoPlanilha => ({
    nome: "Joaquim Bezerra Vilaça",
    grupo: "STF",
    cargo: "Presidente do Supremo Tribunal Federal",
    ...CADASTRO_OK,
    ...p,
  });
  const fonteStf: ConteudoFonte = {
    url: "https://stf.jus.br",
    textoLimpo: "Joaquim Bezerra Vilaça, Ministro.",
    destaques: [],
    pessoas: [{ nome: "Joaquim Bezerra Vilaça", cargo: "Ministro", origem: "pagina" }],
  };

  test("pessoa casada sem o prefixo pinta amarelo no nome", () => {
    // Act
    const g = compararGrupo("STF", [presidente()], fonteStf, GRUPO_STF);

    // Assert
    expect(g.contatos[0].semaforo).toBe("amarelo");
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_sem_prefixo");
  });

  test("pessoa casada com o prefixo: a página sem o prefixo confere e não há achado", () => {
    // Act
    const g = compararGrupo("STF", [presidente({ nome: "Ministro Joaquim Bezerra Vilaça" })], fonteStf, GRUPO_STF);

    // Assert
    expect(achadosDe(g.contatos[0].comparacoes)).not.toContain("nome_sem_prefixo");
    expect(g.contatos[0].camposDivergentes.map((d) => d.campo)).not.toContain("nome");
  });

  test("possível saída: acusa o prefixo e continua vermelho", () => {
    // Act
    const g = compararGrupo("STF", [presidente()], { ...fonteStf, pessoas: [] }, GRUPO_STF);

    // Assert
    expect(g.contatos[0].possivelSaida).toBe(true);
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_sem_prefixo");
  });

  test("fonte inacessível: acusa o prefixo e continua indeterminado", () => {
    // Act
    const g = marcarFonteInacessivel("STF", [presidente()], "https://stf.jus.br", "timeout", GRUPO_STF);

    // Assert
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_sem_prefixo");
  });

  test("grupo sem fonte: acusa o prefixo sem perder o campo 'fonte', e continua vermelho", () => {
    // Act
    const g = compararGrupo("STF", [presidente()], undefined, GRUPO_STF);

    // Assert
    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(achadosDe(g.contatos[0].comparacoes)).toContain("nome_sem_prefixo");
    expect(g.contatos[0].camposDivergentes.map((d) => d.campo)).toContain("fonte");
  });

  test("Presidente da República sem fonte: \"Presidente\" + nome como esperado", () => {
    // Act
    const g = compararGrupo(
      "Presidente da República",
      [presidente({ nome: "Luís Inácio Lula da Silva", cargo: "Presidente da República", grupo: "Presidente da República" })],
      undefined,
      "Presidente da República",
    );

    // Assert
    const achado = g.contatos[0].comparacoes.find((c) => c.achado === "nome_sem_prefixo");
    expect(achado?.valorEsperado).toBe("Presidente Luís Inácio Lula da Silva");
  });

  test("Senadores: \"Senador Davi Alcolumbre\" não ganha achado de prefixo", () => {
    // Act
    const g = compararGrupo(
      "Senadores",
      [presidente({ nome: "Senador Davi Alcolumbre", cargo: "Senador", grupo: "Senadores" })],
      undefined,
      "Senadores",
    );

    // Assert
    expect(achadosDe(g.contatos[0].comparacoes)).not.toContain("nome_sem_prefixo");
  });
});
