import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { extrairConteudo, extrairPorMarcador } from "@/lib/scrape";

const fixture = (nome: string) => readFileSync(path.resolve(__dirname, "fixtures", nome), "utf-8");

const URL_EXERCITO = "https://www.eb.mil.br/web/comandante-do-exercito";
const URL_DEFESA = "https://www.gov.br/defesa/pt-br/composicao";
const CARGO_EMCFA = "CHEFE DO ESTADO-MAIOR CONJUNTO DAS FORÇAS ARMADAS";

const pagina = (corpo: string) => `<html><body>${corpo}</body></html>`;

describe("pessoaUnica: página de uma só autoridade (GT de 13/11)", () => {
  const opcoes = { pessoaUnica: { cargo: "Comandante da Marinha" } };

  test("a pessoa é o h1, com a patente como a página escreve, e o cargo é o fixo do catálogo", () => {
    // Arrange
    const html = pagina(`<main><h2>Biografia</h2><h1>Alte Esq Fulano de Tal Souza</h1><p>Nasceu em 1960.</p></main>`);

    // Act
    const c = extrairConteudo(html, "https://exemplo.mil.br/comandante", opcoes);

    // Assert
    expect(c.pessoas).toEqual([{ nome: "Alte Esq Fulano de Tal Souza", cargo: "Comandante da Marinha", origem: "pagina" }]);
  });

  test("o h1 do cabeçalho (moldura) não conta", () => {
    const html = pagina(`<header><h1>Marinha do Brasil</h1></header><main><h1>Alte Esq Fulano de Tal Souza</h1></main>`);
    const c = extrairConteudo(html, "https://exemplo.mil.br/comandante", opcoes);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Alte Esq Fulano de Tal Souza"]);
  });

  test("sem h1 com cara de nome, vale o primeiro h2 ou h3 que parece nome", () => {
    const html = pagina(`<main><h2>Comandante da Marinha</h2><h3>Alte Esq Beltrano Pereira</h3><h3>Ciclano Dias</h3></main>`);
    const c = extrairConteudo(html, "https://exemplo.mil.br/comandante", opcoes);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Alte Esq Beltrano Pereira"]);
  });

  test("título que é o próprio cargo nunca vira a pessoa", () => {
    const html = pagina(`<main><h1>Comandante da Marinha do Brasil</h1><h2>Alte Esq Beltrano Pereira</h2></main>`);
    const c = extrairConteudo(html, "https://exemplo.mil.br/comandante", opcoes);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Alte Esq Beltrano Pereira"]);
  });

  test("nenhum título com cara de nome: ninguém (a fonte sai sem pessoas, nunca uma pessoa inventada)", () => {
    const html = pagina(`<main><h1>Comandante</h1><p>Texto qualquer da página.</p></main>`);
    expect(extrairConteudo(html, "https://exemplo.mil.br/comandante", opcoes).pessoas).toEqual([]);
  });

  test("Exército (recorte real): o h1 com 'Gen Ex' e o cargo como a página escreve", () => {
    const c = extrairConteudo(fixture("comandante-exercito.html"), URL_EXERCITO, {
      pessoaUnica: { cargo: "Comandante do Exército Brasileiro" },
    });
    expect(c.pessoas).toEqual([
      { nome: "Gen Ex TOMÁS Miguel Miné Ribeiro Paiva", cargo: "Comandante do Exército Brasileiro", origem: "pagina" },
    ]);
  });
});

describe("marcador em linha própria (Defesa, chefe do EMCFA)", () => {
  test("recorte real: só o chefe do EMCFA, com a patente no nome e o cargo como a página escreve", () => {
    // Act
    const c = extrairConteudo(fixture("defesa-composicao.html"), URL_DEFESA, { marcador: [CARGO_EMCFA] });

    // Assert: o ministro e o chefe de gabinete do EMCFA ficam de fora.
    expect(c.pessoas).toEqual([
      { nome: "Alte Esq Renato Rodrigues de Aguiar Freire", cargo: CARGO_EMCFA, origem: "pagina" },
    ]);
  });

  test("a linha do marcador é comparada sem caixa nem acento", () => {
    const c = extrairConteudo(fixture("defesa-composicao.html"), URL_DEFESA, {
      marcador: ["Chefe do Estado-Maior Conjunto das Forcas Armadas"],
    });
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Alte Esq Renato Rodrigues de Aguiar Freire"]);
    expect(c.pessoas[0].cargo).toBe(CARGO_EMCFA);
  });

  test("linha do marcador sem nome na linha de cima não vira pessoa", () => {
    expect(extrairPorMarcador(`Composição\n${CARGO_EMCFA}`, [CARGO_EMCFA])).toEqual([]);
  });

  test("o marcador no meio da linha continua como antes", () => {
    expect(extrairPorMarcador("Desembargador Fulano de Tal (convocado)", ["(convocado)"])).toEqual([
      { nome: "Fulano de Tal", cargo: "Desembargador convocado", origem: "pagina" },
    ]);
  });
});
