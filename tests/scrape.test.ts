import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extrairConteudo } from "@/lib/scrape";

const html = readFileSync(resolve(__dirname, "fixtures/orgao-exemplo.html"), "utf-8");

describe("extrairConteudo", () => {
  test("captura textos em negrito como destaques", () => {
    const c = extrairConteudo(html, "https://orgao.gov.br/dirigentes");
    expect(c.destaques).toContain("Ana Política");
    expect(c.destaques).toContain("João Destaque");
  });

  test("remove scripts/estilos do texto limpo", () => {
    const c = extrairConteudo(html, "https://orgao.gov.br/dirigentes");
    expect(c.textoLimpo).not.toContain("console.log");
    expect(c.textoLimpo).not.toContain("color:red");
  });

  test("mantém os nomes das pessoas no texto limpo", () => {
    const c = extrairConteudo(html, "https://orgao.gov.br/dirigentes");
    expect(c.textoLimpo).toContain("Ana Maria Política Completa");
    expect(c.textoLimpo).toContain("João Carlos Destaque");
  });

  test("preserva a url de origem", () => {
    const c = extrairConteudo(html, "https://orgao.gov.br/dirigentes");
    expect(c.url).toBe("https://orgao.gov.br/dirigentes");
  });
});
