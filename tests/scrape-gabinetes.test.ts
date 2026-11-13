import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { extrairConteudo } from "@/lib/scrape";
import { normalizarNome } from "@/lib/normalize";
import type { PessoaSite } from "@/lib/types";

const URL_STM = "https://www.stm.jus.br/institucional/conheca-o-superior-tribunal-militar/quem-e-quem?view=default";
const GABINETES = { prefixos: ["Gabinete Min.", "Gabinete Min", "Gabinete Ministro", "Gabinete Ministra"], cargo: "Ministro(a)" } as const;
const html = readFileSync(resolve(__dirname, "fixtures/stm-quem-e-quem.html"), "utf-8");

/** Ministros distintos da lista "Ministros e Gabinetes" da fixture. */
const MINISTROS_NA_FIXTURE = 15;

describe("extrairConteudo com gabinetes (STM, página Quem é Quem)", () => {
  const c = extrairConteudo(html, URL_STM, { gabinetes: GABINETES });
  const porTrecho = (trecho: string): PessoaSite | undefined => c.pessoas.find((p) => p.nome.includes(trecho));

  test("uma pessoa por ministro, nenhum juiz ou servidor", () => {
    expect(c.pessoas).toHaveLength(MINISTROS_NA_FIXTURE);
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).not.toContainEqual(expect.stringMatching(/Juiz|Juíza|Servidor/));
    expect(new Set(nomes.map(normalizarNome)).size).toBe(MINISTROS_NA_FIXTURE);
  });

  test("mantém a patente abreviada e o Dr./Dra. como a página escreve, sem o 'Gabinete Min'", () => {
    expect(c.pessoas.some((p) => /^Gen Ex /.test(p.nome))).toBe(true);
    expect(c.pessoas.some((p) => /^Ten Brig Ar /.test(p.nome))).toBe(true);
    expect(c.pessoas.some((p) => /^Dra /.test(p.nome))).toBe(true);
    expect(c.pessoas.every((p) => !/^Gabinete/i.test(p.nome))).toBe(true);
  });

  test("presidente aparece uma vez, com o cargo da direção", () => {
    expect(c.pessoas.filter((p) => p.nome.includes("Teixeira Rocha"))).toHaveLength(1);
    expect(porTrecho("Teixeira Rocha")?.cargo).toBe("Ministra-Presidente");
  });

  test("a direção dá o cargo a quem já está nos gabinetes, mesmo com o nome mais curto ou outra grafia da patente", () => {
    // Vice-Presidente (nome igual) e Corregedor (nome sem o primeiro prenome) são a mesma pessoa: vale a primeira função.
    expect(porTrecho("Parente Camelo")?.cargo).toBe("Ministro Vice-Presidente");
    expect(c.pessoas.filter((p) => p.nome.includes("Parente Camelo"))).toHaveLength(1);
    // Ouvidor: a direção escreve "Ten Brig do Ar"; o nome fica o da lista de gabinetes.
    expect(porTrecho("Vuyk de Aquino")).toMatchObject({ nome: "Ten Brig Ar Carlos Vuyk de Aquino", cargo: "Ouvidor" });
  });

  test("os demais levam o cargo fixo e a origem da página", () => {
    expect(porTrecho("Guido Amin Naves")).toMatchObject({ cargo: "Ministro(a)", origem: "pagina" });
    expect(porTrecho("Verônica Abdalla Sterman")?.cargo).toBe("Ministro(a)");
  });

  test("a repetição dos gabinetes no organograma (defasada) não entra", () => {
    expect(porTrecho("Marco Antônio de Farias")).toBeUndefined();
    expect(porTrecho("Amaral Oliveira")?.nome).toBe("Ten Brig Ar Carlos Augusto Amaral Oliveira");
  });

  test("texto e destaques continuam os da extração de sempre", () => {
    const padrao = extrairConteudo(html, URL_STM);
    expect(c.textoLimpo).toBe(padrao.textoLimpo);
    expect(c.destaques).toEqual(padrao.destaques);
  });

  test("sem a opção, a página não produz pessoas de gabinete (só a segmentação genérica)", () => {
    const padrao = extrairConteudo(html, URL_STM);
    expect(padrao.pessoas.map((p) => p.cargo)).not.toContain("Ministro(a)");
    expect(padrao.pessoas.map((p) => p.nome)).not.toContain("Gen Ex Guido Amin Naves");
    expect(padrao.pessoas.length).not.toBe(MINISTROS_NA_FIXTURE);
  });
});

describe("extrairConteudo com gabinetes (prefixos)", () => {
  const pagina = (itens: string[]) =>
    `<html><body><div class="lista">${itens.map((t) => `<div class="item"><button>${t}</button></div>`).join("")}</div></body></html>`;

  test("casa sem caixa, com espaços colapsados e o prefixo mais longo primeiro", () => {
    const c = extrairConteudo(
      pagina(["Gabinete Min. Dr. Joaquim Bezerra Vilaça", "GABINETE   MINISTRO Gen Ex Fulano de Tal", "Gabinete Ministra Dra Beltrana Souza", "Gabinete dos Ministros (GABIM)"]),
      "https://stm.jus.br",
      { gabinetes: GABINETES },
    );
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Dr. Joaquim Bezerra Vilaça", "Gen Ex Fulano de Tal", "Dra Beltrana Souza"]);
  });

  test("bloco da direção sem gabinete correspondente entra como pessoa própria; juíza e diretor nunca", () => {
    const c = extrairConteudo(
      `<html><body><div class="lista"><div><button>Gabinete Min Gen Ex Fulano de Tal</button></div><div><button>Gabinete Min Dr Sicrano Souza</button></div></div>
       <div><p>Dra. Beltrana Lima</p><p>Ministra-Presidente</p></div>
       <div><p>Dra. Juiza Ficticia</p><p>Juíza-Corregedora Auxiliar</p></div>
       <div><p>Dr. Servidor Ficticio</p><p>Diretor-Geral</p></div></body></html>`,
      "https://stm.jus.br",
      { gabinetes: GABINETES },
    );
    expect(c.pessoas).toEqual([
      { nome: "Gen Ex Fulano de Tal", cargo: "Ministro(a)", origem: "pagina" },
      { nome: "Dr Sicrano Souza", cargo: "Ministro(a)", origem: "pagina" },
      { nome: "Dra. Beltrana Lima", cargo: "Ministra-Presidente", origem: "pagina" },
    ]);
  });

  test("o prefixo tem que terminar numa palavra: 'Gabinete Ministerial' não vira pessoa", () => {
    const c = extrairConteudo(pagina(["Gabinete Ministerial de Apoio", "Gabinete Min"]), "https://stm.jus.br", { gabinetes: GABINETES });
    expect(c.pessoas).toEqual([]);
  });
});
