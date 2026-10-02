import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extrairTabela } from "@/lib/scrape";

const FORA = readFileSync(join(__dirname, "fixtures/senado-fora-de-exercicio.html"), "utf8");
const EXERCICIO = readFileSync(join(__dirname, "fixtures/senado-em-exercicio.html"), "utf8");
const URL_FORA = "https://www25.senado.leg.br/web/senadores/fora-de-exercicio";
const URL_EXERCICIO = "https://www25.senado.leg.br/web/senadores/em-exercicio";

const CFG_FORA = {
  colunas: { nome: 0, uf: 2, motivo: 3 },
  secoes: ["Assunção de cargo", "Licença com convocação de suplente"],
};

describe("extrairTabela", () => {
  test("traz só as seções cadastradas, com UF e motivo", () => {
    const c = extrairTabela(FORA, URL_FORA, CFG_FORA);
    expect(c.pessoas.map((p) => p.nome)).toEqual([
      "Diego Tavares",
      "Wellington Dias",
      "Ana Paula Lobato",
      "Eduardo Girão",
    ]);
    expect(c.pessoas[0].uf).toBe("PB");
    expect(c.pessoas[0].contexto).toBe("Ocupação de cargo de ministro/secretário");
  });

  test("suplente que exerceu, falecido e renunciante ficam fora da composição", () => {
    const nomes = extrairTabela(FORA, URL_FORA, CFG_FORA).pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Ney Suassuna");
    expect(nomes).not.toContain("Augusta Brito");
    expect(nomes).not.toContain("Arolde de Oliveira");
    expect(nomes).not.toContain("Flávio Dino");
  });

  test("senador de nome de uma palavra é extraído (o extrator de texto o perde)", () => {
    const c = extrairTabela(EXERCICIO, URL_EXERCICIO, { colunas: { nome: 0, uf: 2 } });
    expect(c.pessoas.map((p) => p.nome)).toContain("Weverton");
    expect(c.pessoas.find((p) => p.nome === "Weverton")?.uf).toBe("MA");
  });

  test("linha com menos colunas que o cadastro é ignorada, sem lançar", () => {
    const html = `<table>
      <tr><td colspan="4"><strong>Assunção de cargo conforme RISF Art. 39, II</strong></td></tr>
      <tr><td>Fulano de Tal</td><td>PP</td></tr>
      <tr><td>Beltrano de Tal</td><td>PT</td><td>PI</td><td>Ocupação de cargo</td></tr>
    </table>`;
    const c = extrairTabela(html, URL_FORA, CFG_FORA);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal", "Beltrano de Tal"]);
    expect(c.pessoas[0].uf).toBeUndefined();
  });

  test("linha de uma célula SEM colspan não é cabeçalho e não apaga a seção corrente", () => {
    // Arrange: uma linha malformada (célula solta, sem colspan) no meio da seção aceita.
    // Tratá-la como cabeçalho reescreveria a seção e derrubaria todas as linhas seguintes
    // — composição vazia, que é a entrada do falso "possível saída".
    const html = `<table>
      <tr><td colspan="4"><strong>Assunção de cargo conforme RISF Art. 39, II</strong></td></tr>
      <tr><td>Fulano de Tal</td><td>PP</td><td>PB</td><td>Ocupação de cargo</td></tr>
      <tr><td>Nota de rodapé qualquer</td></tr>
      <tr><td>Beltrano de Tal</td><td>PT</td><td>PI</td><td>Ocupação de cargo</td></tr>
    </table>`;

    // Act
    const c = extrairTabela(html, URL_FORA, CFG_FORA);

    // Assert
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal", "Beltrano de Tal"]);
  });

  test("seção casa sem depender de acento, caixa ou do resto da frase", () => {
    const html = `<table>
      <tr><td colspan="4"><strong>ASSUNÇÃO DE CARGO CONFORME RISF ART. 39, II</strong></td></tr>
      <tr><td>Fulano de Tal</td><td>PP</td><td>PB</td><td>Ocupação de cargo</td></tr>
    </table>`;
    const c = extrairTabela(html, URL_FORA, CFG_FORA);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal"]);
  });

  test("cabeçalho repetido no meio da tabela não vira pessoa", () => {
    const nomes = extrairTabela(FORA, URL_FORA, { colunas: { nome: 0, uf: 2, motivo: 3 } })
      .pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Nome");
    expect(nomes).not.toContain("Partido");
  });

  test("índice de tabela inexistente devolve composição vazia, não lança", () => {
    const c = extrairTabela(FORA, URL_FORA, { ...CFG_FORA, indice: 9 });
    expect(c.pessoas).toEqual([]);
    expect(c.textoLimpo).toBe("");
  });

  test("seção cadastrada que sumiu da página devolve composição vazia", () => {
    const c = extrairTabela(FORA, URL_FORA, { colunas: { nome: 0 }, secoes: ["Seção que não existe"] });
    expect(c.pessoas).toEqual([]);
  });
});
