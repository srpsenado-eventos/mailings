import { describe, expect, test } from "vitest";
import { GRUPO_DEPUTADOS_FEDERAIS, GRUPO_SENADORES_ELEITOS } from "@/data/grupos-posse";
import { resultadoParaLinhas } from "@/lib/export";
import { aplicarListas, OBSERVACAO_NOME_PARLAMENTAR } from "@/lib/grupos-lista";
import {
  compararContato,
  compararContatoIndividual,
  compararContatoSemFonteOficial,
  nomeNaPagina,
  OBSERVACAO_ACENTO_NOME,
} from "@/lib/match";
import { mesmaGrafiaDeNome, mesmosAcentos, soAcentoDiverge } from "@/lib/normalize";
import { detalhesDoContato } from "@/lib/painel";
import type {
  ContatoPlanilha,
  ConteudoFonte,
  FonteIndividual,
  ResultadoAnalise,
  ResultadoEleicao,
  ResultadoGrupo,
  ResumoAnalise,
} from "@/lib/types";

const contato = (p: Partial<ContatoPlanilha>): ContatoPlanilha => ({
  nome: "", grupo: "ORG", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor", ...p,
});

const fonteCom = (...nomes: string[]): ConteudoFonte => ({
  url: "https://orgao.gov.br", textoLimpo: nomes.join(". "), destaques: [],
  pessoas: nomes.map((nome) => ({ nome, cargo: "Ministro" })),
});

const comparacaoDoNome = (r: { comparacoes: readonly { campo: string; origemValor?: string }[] }) =>
  r.comparacoes.find((c) => c.campo === "nome" && c.origemValor !== "coerencia");

describe("comparação de acentos no nome", () => {
  test("acento diferente em qualquer sentido não é a mesma grafia", () => {
    // Act e Assert
    expect(mesmosAcentos("Rodrigo Otávio", "Rodrigo Otavio")).toBe(false);
    expect(mesmosAcentos("Ranko Vilovic", "Ranko Vilović")).toBe(false);
    expect(mesmaGrafiaDeNome("João Azevêdo", "Joao Azevêdo")).toBe(false);
    expect(soAcentoDiverge("João Azevêdo", "Joao Azevêdo")).toBe(true);
  });

  test("cedilha conta como acento", () => {
    expect(soAcentoDiverge("Margareth Purificação", "Margareth Purificacao")).toBe(true);
  });

  test.each([
    ["caixa", "Marcos José", "MARCOS JOSÉ"],
    ["tratamento", "Dra. Verônica Sterman", "Verônica Sterman"],
    ["espaço dobrado", "Guilherme  Boulos", "Guilherme Boulos"],
    ["forma decomposta do acento", "João", "João"],
  ])("%s não muda a grafia", (_motivo, a, b) => {
    expect(mesmaGrafiaDeNome(a, b)).toBe(true);
    expect(soAcentoDiverge(a, b)).toBe(false);
  });

  test("nomes diferentes não são 'só acento'", () => {
    expect(soAcentoDiverge("João Silva", "Joao Souza")).toBe(false);
    expect(mesmaGrafiaDeNome("João Silva", "João Souza")).toBe(false);
  });
});

describe("nome com acento diferente da página do grupo", () => {
  test("cadastro com acento e fonte sem acento diverge, com o nome da fonte como esperado", () => {
    // Arrange
    const c = contato({ nome: "Rodrigo Otávio Soares Pacheco" });

    // Act
    const r = compararContato(c, fonteCom("Rodrigo Otavio Soares Pacheco"));

    // Assert
    expect(r.semaforo).toBe("amarelo");
    expect(r.possivelSaida).toBeFalsy();
    expect(comparacaoDoNome(r)).toMatchObject({
      situacao: "divergente", valorEsperado: "Rodrigo Otavio Soares Pacheco", observacao: OBSERVACAO_ACENTO_NOME,
    });
  });

  test("cadastro sem acento e fonte com acento também diverge", () => {
    // Act
    const r = compararContato(contato({ nome: "Ranko Vilovic" }), fonteCom("Ranko Vilović"));

    // Assert
    expect(r.semaforo).toBe("amarelo");
    expect(comparacaoDoNome(r)).toMatchObject({ situacao: "divergente", valorEsperado: "Ranko Vilović", observacao: OBSERVACAO_ACENTO_NOME });
  });

  test("só caixa diferente continua conferindo, sem observação de acento", () => {
    // Act
    const r = compararContato(contato({ nome: "Marcos José Rocha" }), fonteCom("MARCOS JOSÉ ROCHA"));

    // Assert
    expect(r.semaforo).toBe("verde");
    expect(comparacaoDoNome(r)).toMatchObject({ situacao: "confere" });
    expect(comparacaoDoNome(r)).not.toHaveProperty("observacao");
  });

  test("grafia lembrada pela IA não é fonte: acento diferente continua conferindo", () => {
    // Arrange
    const conteudo: ConteudoFonte = { url: "https://orgao.gov.br", textoLimpo: "", destaques: [], pessoas: [{ nome: "Rodrigo Otavio", cargo: "Ministro", origem: "conhecimento" }] };

    // Act
    const r = compararContato(contato({ nome: "Rodrigo Otávio" }), conteudo);

    // Assert
    expect(r.semaforo).toBe("verde");
    expect(comparacaoDoNome(r)).toMatchObject({ situacao: "confere" });
    expect(comparacaoDoNome(r)).not.toHaveProperty("observacao");
  });

  test("o cartão do nome e o export dizem que a diferença é de acento", () => {
    // Arrange
    const r = compararContato(contato({ nome: "Rodrigo Otávio" }), fonteCom("Rodrigo Otavio"));
    const grupo = { grupo: "ORG", semFonte: false, contatos: [r], novos: [] } as unknown as ResultadoGrupo;
    const analise = { grupos: [grupo] } as unknown as ResultadoAnalise;

    // Act
    const cartao = detalhesDoContato(r, grupo).find((d) => d.campo === "nome");
    const [linha] = resultadoParaLinhas(analise);

    // Assert
    expect(cartao).toMatchObject({ observacao: OBSERVACAO_ACENTO_NOME, copiavel: "Rodrigo Otavio" });
    expect(String(linha.Observacao)).toContain(OBSERVACAO_ACENTO_NOME);
  });
});

describe("nome com acento diferente na página individual", () => {
  const url = "https://www.exemplar.gov.br/governo";
  const individual: FonteIndividual = { url, ativo: true, chave: { uf: "EX" }, campos: ["nome"] };
  const preenchimento = " Página oficial do governo estadual com a agenda, as notícias e a composição.".repeat(8);
  const pagina = (nome: string, pessoas: ConteudoFonte["pessoas"] = []): ConteudoFonte => ({
    url, textoLimpo: `${preenchimento} ${nome}, governador do estado. ${preenchimento}`, destaques: [], pessoas,
  });

  test("pessoa da página sem acento diverge e continua confirmando a pessoa", () => {
    // Arrange
    const lida = { conteudo: pagina("Joao Azevedo", [{ nome: "Joao Azevedo" }]) };

    // Act
    const v = compararContatoIndividual({ contato: contato({ nome: "João Azevedo" }), fonte: individual, lida });

    // Assert
    expect(v.nomeConfirmado).toBe(true);
    expect(v.resultado.semaforo).toBe("amarelo");
    expect(v.resultado.possivelSaida).toBeUndefined();
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "divergente", valorEsperado: "Joao Azevedo", observacao: OBSERVACAO_ACENTO_NOME });
  });

  test("nome só no texto corrido, sem acento, diverge com a grafia da página", () => {
    // Act
    const v = compararContatoIndividual({ contato: contato({ nome: "João Azevedo" }), fonte: individual, lida: { conteudo: pagina("Joao Azevedo") } });

    // Assert
    expect(v.resultado.semaforo).toBe("amarelo");
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "divergente", valorEsperado: "Joao Azevedo", observacao: OBSERVACAO_ACENTO_NOME });
  });

  test("nome no texto corrido com a mesma grafia confere, mesmo com outra ocorrência sem acento", () => {
    // Arrange
    const conteudo = pagina("Joao Azevedo. O governador João Azevedo");

    // Act
    const achado = nomeNaPagina("João Azevedo", conteudo);
    const v = compararContatoIndividual({ contato: contato({ nome: "João Azevedo" }), fonte: individual, lida: { conteudo } });

    // Assert
    expect(achado).toMatchObject({ exato: true, nomeNaPagina: "João Azevedo" });
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "confere" });
  });

  test.each([
    ["Governador:João Azevedo, do estado."],
    ["João Azevedo/PB esteve na agenda."],
    ["(Governador)João Azevedo-PB esteve."],
  ])("pontuação colada ao nome não é diferença de acento: %s", (trecho) => {
    // Act
    const v = compararContatoIndividual({ contato: contato({ nome: "João Azevedo" }), fonte: individual, lida: { conteudo: pagina(trecho) } });

    // Assert
    expect(v.resultado.semaforo).toBe("verde");
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "confere", valorEsperado: "João Azevedo" });
  });

  test("sem acento e com pontuação colada, o esperado traz só o nome", () => {
    // Act
    const v = compararContatoIndividual({ contato: contato({ nome: "João Azevedo" }), fonte: individual, lida: { conteudo: pagina("Governador:Joao Azevedo/PB") } });

    // Assert
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "divergente", valorEsperado: "Joao Azevedo", observacao: OBSERVACAO_ACENTO_NOME });
  });

  test("nome com palavra repetida confere no texto corrido", () => {
    // Act
    const v = compararContatoIndividual({ contato: contato({ nome: "Ana Silva Silva" }), fonte: individual, lida: { conteudo: pagina("Ana Silva Silva") } });

    // Assert
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "confere" });
  });

  test("título sem acento não vence o texto com a grafia do Contatos", () => {
    // Arrange
    const conteudo = pagina("O governador João Azevedo", [{ nome: "JOAO AZEVEDO" }]);

    // Act
    const v = compararContatoIndividual({ contato: contato({ nome: "João Azevedo" }), fonte: individual, lida: { conteudo } });

    // Assert
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "confere" });
  });

  test("hífen no texto corrido não vira falsa diferença de acento", () => {
    // Act
    const v = compararContatoIndividual({ contato: contato({ nome: "Ana Maria Silva" }), fonte: individual, lida: { conteudo: pagina("Ana-Maria Silva") } });

    // Assert
    expect(comparacaoDoNome(v.resultado)).toMatchObject({ situacao: "confere" });
  });
});

describe("nome com acento diferente nos grupos de lista", () => {
  const resumo = { total: 1, verde: 0, amarelo: 0, vermelho: 0, indeterminado: 0 } as unknown as ResumoAnalise;
  const eleicao = {
    arquivos: [], deputadosAtuais: [{ nomeParlamentar: "Leo Fictício", nomeCivil: "Leonardo Fictício", uf: "SP", sexo: "M" }],
    eleitos: [{
      eleito: { casa: "senado", uf: "PB", nomeUrna: "Joao Azevêdo", nomeCompleto: "João Azevêdo Lins", situacaoTse: "Eleito", statusMandato: "Mandato novo" },
      destino: "novo", projecao: false, contatos: [], grupoDestino: GRUPO_SENADORES_ELEITOS,
    }],
  } as unknown as ResultadoEleicao;
  const grupoDe = (grupo: string, c: ContatoPlanilha) =>
    ({ grupo, semFonte: false, novos: [], contatos: [compararContatoSemFonteOficial(c, "lista")], fiscalizacao: "lista" }) as unknown as ResultadoGrupo;
  const analise = (g: ResultadoGrupo) => ({ grupos: [g], resumo, eleicao }) as unknown as ResultadoAnalise;

  test("eleito com acento diferente do nome de urna diverge e não fala em nome político", () => {
    // Arrange
    const c = contato({ nome: "João Azevêdo", grupo: GRUPO_SENADORES_ELEITOS, departamento: "PB", cargo: "Senador" });

    // Act
    const [r] = aplicarListas(analise(grupoDe(GRUPO_SENADORES_ELEITOS, c)), "06/11").grupos[0].contatos;

    // Assert
    expect(r.semaforo).toBe("amarelo");
    expect(r.observacao).toBe(OBSERVACAO_ACENTO_NOME);
    expect(comparacaoDoNome(r)).toMatchObject({ situacao: "divergente", valorEsperado: "Joao Azevêdo", observacao: OBSERVACAO_ACENTO_NOME });
  });

  test("deputado com acento diferente do nome parlamentar diverge com a observação de acento", () => {
    // Arrange
    const c = contato({ nome: "Leo Ficticio", grupo: GRUPO_DEPUTADOS_FEDERAIS, departamento: "SP", cargo: "Deputado Federal" });

    // Act
    const [r] = aplicarListas(analise(grupoDe(GRUPO_DEPUTADOS_FEDERAIS, c)), "06/11").grupos[0].contatos;

    // Assert
    expect(r.semaforo).toBe("amarelo");
    expect(r.observacao).toBe(OBSERVACAO_ACENTO_NOME);
    expect(r.observacao).not.toBe(OBSERVACAO_NOME_PARLAMENTAR);
  });
});
