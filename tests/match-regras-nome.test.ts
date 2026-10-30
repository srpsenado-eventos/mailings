import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { compararContatoIndividual, compararGrupo, marcarFonteInacessivel } from "@/lib/match";
import { extrairConteudo } from "@/lib/scrape";
import type { ComparacaoCampo, ContatoPlanilha, ConteudoFonte, FonteIndividual } from "@/lib/types";

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

describe("Nome da página com o prefixo do presidente: o esperado copiável nunca tira o prefixo", () => {
  const GRUPO_STF = "Ministros do STF";
  const presidenteStf = (nome: string): ContatoPlanilha => ({
    nome,
    grupo: "STF",
    cargo: "Presidente do Supremo Tribunal Federal",
    ...CADASTRO_OK,
  });
  const pagina = (nome: string): ConteudoFonte => ({
    url: "https://stf.jus.br",
    textoLimpo: `${nome}, Ministro.`,
    destaques: [],
    pessoas: [{ nome, cargo: "Ministro", origem: "pagina" }],
  });
  const nomeDeValor = (comparacoes: readonly ComparacaoCampo[]): ComparacaoCampo | undefined =>
    comparacoes.find((c) => c.campo === "nome" && c.origemValor !== "coerencia");

  test("\"Ministro X Y\" × página \"X Z Y\": diverge e o copiável é \"Ministro X Z Y\"", () => {
    // Act
    const g = compararGrupo("STF", [presidenteStf("Ministro Joaquim Vilaça")], pagina("Joaquim Bezerra Vilaça"), GRUPO_STF);

    // Assert
    const nome = nomeDeValor(g.contatos[0].comparacoes);
    expect(nome?.situacao).toBe("divergente");
    expect(nome?.valorEsperado).toBe("Ministro Joaquim Bezerra Vilaça");
    expect(achadosDe(g.contatos[0].comparacoes)).not.toContain("nome_sem_prefixo");
  });

  test("\"X Y\" sem prefixo × página \"X Y\": o nome de valor confere e a Camada C acusa com \"Ministro X Y\"", () => {
    // Act
    const g = compararGrupo("STF", [presidenteStf("Joaquim Bezerra Vilaça")], pagina("Joaquim Bezerra Vilaça"), GRUPO_STF);

    // Assert
    expect(nomeDeValor(g.contatos[0].comparacoes)?.situacao).toBe("confere");
    const camadaC = g.contatos[0].comparacoes.find((c) => c.achado === "nome_sem_prefixo");
    expect(camadaC?.valorEsperado).toBe("Ministro Joaquim Bezerra Vilaça");
  });

  test("página que já traz \"Ministro\" no nome não empilha o prefixo", () => {
    // Act
    const g = compararGrupo("STF", [presidenteStf("Ministro Joaquim Vilaça")], pagina("Ministro Joaquim Bezerra Vilaça"), GRUPO_STF);

    // Assert
    expect(nomeDeValor(g.contatos[0].comparacoes)?.valorEsperado).toBe("Ministro Joaquim Bezerra Vilaça");
  });

  test("contato feminino: o copiável leva \"Ministra\"", () => {
    // Arrange
    const c = { ...presidenteStf("Ministra Luiza Prado"), tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" };

    // Act
    const g = compararGrupo("STF", [c], pagina("Luiza Meireles Prado"), GRUPO_STF);

    // Assert
    expect(nomeDeValor(g.contatos[0].comparacoes)?.valorEsperado).toBe("Ministra Luiza Meireles Prado");
  });

  test("ministro que não é o presidente: o esperado continua o da página", () => {
    // Arrange
    const c = { ...presidenteStf("Joaquim Vilaça"), cargo: "Ministro do Supremo Tribunal Federal" };

    // Act
    const g = compararGrupo("STF", [c], pagina("Joaquim Bezerra Vilaça"), GRUPO_STF);

    // Assert
    expect(nomeDeValor(g.contatos[0].comparacoes)?.valorEsperado).toBe("Joaquim Bezerra Vilaça");
  });

  test("grupo sem regra de prefixo: o esperado continua o da página", () => {
    // Arrange
    const c: ContatoPlanilha = { nome: "Senador Joaquim Vilaça", grupo: "Senadores", cargo: "Senador", ...CADASTRO_OK };

    // Act
    const g = compararGrupo("Senadores", [c], pagina("Joaquim Bezerra Vilaça"), "Senadores");

    // Assert
    expect(nomeDeValor(g.contatos[0].comparacoes)?.valorEsperado).toBe("Joaquim Bezerra Vilaça");
  });

  test("página individual: nome mais curto no cadastro do Presidente da República sai com \"Presidente\" + nome da página", () => {
    // Arrange
    const estado = extrairConteudo(readFileSync(resolve(__dirname, "fixtures/governo-estadual.html"), "utf-8"), "https://www.exemplar.gov.br/governo");
    const fonte: FonteIndividual = { url: estado.url, ativo: true, chave: { uf: "EX" }, campos: ["nome"] };
    const c: ContatoPlanilha = { nome: "Presidente João Carlos Silva", grupo: "Presidente da República", ...CADASTRO_OK };

    // Act
    const v = compararContatoIndividual({ contato: c, fonte, lida: { conteudo: estado }, grupoCanonico: "Presidente da República" });

    // Assert
    const nome = nomeDeValor(v.resultado.comparacoes);
    expect(nome?.situacao).toBe("divergente");
    expect(nome?.valorEsperado).toBe("Presidente João Carlos Destaque Silva");
  });

  test("página individual: nome exato sem prefixo confere, e o esperado leva o prefixo", () => {
    // Arrange
    const estado = extrairConteudo(readFileSync(resolve(__dirname, "fixtures/governo-estadual.html"), "utf-8"), "https://www.exemplar.gov.br/governo");
    const fonte: FonteIndividual = { url: estado.url, ativo: true, chave: { uf: "EX" }, campos: ["nome"] };
    const c: ContatoPlanilha = { nome: "João Carlos Destaque Silva", grupo: "Presidente da República", ...CADASTRO_OK };

    // Act
    const v = compararContatoIndividual({ contato: c, fonte, lida: { conteudo: estado }, grupoCanonico: "Presidente da República" });

    // Assert
    const nome = nomeDeValor(v.resultado.comparacoes);
    expect(nome?.situacao).toBe("confere");
    expect(nome?.valorEsperado).toBe("Presidente João Carlos Destaque Silva");
    expect(achadosDe(v.resultado.comparacoes)).toContain("nome_sem_prefixo");
  });
});

describe("Cargo do ex-presidente com o período (Camada C) nos caminhos de ResultadoContato", () => {
  const GRUPO_EX = "Ex-Presidentes do Senado";
  const ex = (cargo = "Ex-Presidente do Senado Federal"): ContatoPlanilha => ({
    nome: "Rui Fictício Barbosa",
    grupo: GRUPO_EX,
    cargo,
    ...CADASTRO_OK,
  });
  // A página `nova-republica` lista os ex-presidentes sem cargo (catálogo, conferida em 23/10).
  const paginaSemCargo: ConteudoFonte = {
    url: "https://www25.senado.leg.br/web/senadores/nova-republica",
    textoLimpo: "Rui Fictício Barbosa",
    destaques: [],
    pessoas: [{ nome: "Rui Fictício Barbosa", origem: "pagina" }],
  };
  const cargoDivergente = (comparacoes: readonly ComparacaoCampo[]) =>
    comparacoes.find((c) => c.campo === "cargo" && c.achado === "cargo_ex_presidente");

  test('pessoa casada com "Ex-Presidente" pinta amarelo no cargo, com o formato do GT como esperado', () => {
    // Act
    const g = compararGrupo(GRUPO_EX, [ex()], paginaSemCargo, GRUPO_EX);

    // Assert
    const r = g.contatos[0];
    expect(r.semaforo).toBe("amarelo");
    expect(cargoDivergente(r.comparacoes)?.valorEsperado).toBe("Presidente do Senado Federal de AAAA a AAAA");
    expect(r.camposDivergentes.map((d) => d.campo)).toContain("cargo");
  });

  test("pessoa casada com o cargo no formato do GT: cargo sem achado", () => {
    // Act
    const g = compararGrupo(GRUPO_EX, [ex("Presidente do Senado Federal de 2019 a 2021")], paginaSemCargo, GRUPO_EX);

    // Assert
    expect(cargoDivergente(g.contatos[0].comparacoes)).toBeUndefined();
    expect(g.contatos[0].camposDivergentes.map((d) => d.campo)).not.toContain("cargo");
  });

  test('página com "Presidente do Senado Federal" confirma o cargo com o período', () => {
    // Arrange
    const pagina: ConteudoFonte = {
      ...paginaSemCargo,
      pessoas: [{ nome: "Rui Fictício Barbosa", cargo: "Presidente do Senado Federal", origem: "pagina" }],
    };

    // Act
    const g = compararGrupo(GRUPO_EX, [ex("Presidente do Senado Federal de 2019 a 2021")], pagina, GRUPO_EX);

    // Assert
    const cargo = g.contatos[0].comparacoes.find((c) => c.campo === "cargo" && c.origemValor !== "coerencia");
    expect(cargo?.situacao).toBe("confere");
  });

  test("possível saída: acusa o cargo e continua vermelho, nunca sai da possível saída", () => {
    // Act
    const g = compararGrupo(GRUPO_EX, [ex()], { ...paginaSemCargo, pessoas: [] }, GRUPO_EX);

    // Assert
    expect(g.contatos[0].possivelSaida).toBe(true);
    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(cargoDivergente(g.contatos[0].comparacoes)).toBeDefined();
  });

  test("fonte inacessível: acusa o cargo e continua indeterminado", () => {
    // Act
    const g = marcarFonteInacessivel(GRUPO_EX, [ex()], paginaSemCargo.url, "timeout", GRUPO_EX);

    // Assert
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(cargoDivergente(g.contatos[0].comparacoes)).toBeDefined();
  });

  test("grupo sem fonte (Ex-Presidentes da República): acusa o cargo sem perder o campo 'fonte', e continua vermelho", () => {
    // Arrange
    const c: ContatoPlanilha = { ...ex("Ex-Presidente da República"), grupo: "Ex-Presidentes da República" };

    // Act
    const g = compararGrupo("Ex-Presidentes da República", [c], undefined, "Ex-Presidentes da República");

    // Assert
    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(cargoDivergente(g.contatos[0].comparacoes)?.valorEsperado).toBe(
      "Presidente da República Federativa do Brasil de AAAA a AAAA",
    );
    expect(g.contatos[0].camposDivergentes.map((d) => d.campo)).toContain("fonte");
  });

  test('"Ex-Senador" em Senadores não é acusado', () => {
    // Act
    const g = compararGrupo("Senadores", [{ ...ex("Ex-Senador"), grupo: "Senadores" }], undefined, "Senadores");

    // Assert
    expect(cargoDivergente(g.contatos[0].comparacoes)).toBeUndefined();
  });
});
