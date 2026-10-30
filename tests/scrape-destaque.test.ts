import { describe, expect, test } from "vitest";
import * as cheerio from "cheerio";
import { colherDestaquesPorLinha, comDestaque, destaqueDoNome } from "@/lib/scrape-destaque";

const SEPARAR = "div,span,a,li";

describe("colherDestaquesPorLinha (spec 2026-10-30 §3.1)", () => {
  test("junta as partes em negrito do bloco-folha, na ordem, pela chave da linha", () => {
    // Arrange
    const $ = cheerio.load('<div><span><a><b>Sérgio</b> Luíz <b>Kukina</b></a></span></div>');

    // Act
    const destaques = colherDestaquesPorLinha($, SEPARAR);

    // Assert
    expect([...destaques.values()]).toEqual(["Sérgio Kukina"]);
  });

  test("bloco com outro separador dentro não é folha e não entra", () => {
    const $ = cheerio.load("<div><b>Fulano</b> <span>Beltrano</span></div>");
    expect(colherDestaquesPorLinha($, SEPARAR).size).toBe(0);
  });

  test("negrito dentro de negrito conta uma vez", () => {
    const $ = cheerio.load("<li><b><strong>Ana</strong> Lima</b> Souza</li>");
    expect([...colherDestaquesPorLinha($, SEPARAR).values()]).toEqual(["Ana Lima"]);
  });
});

describe("destaqueDoNome", () => {
  test("vale quando todo token do destaque está no nome", () => {
    expect(destaqueDoNome("Sérgio Luíz Kukina", "Sérgio Kukina")).toBe("Sérgio Kukina");
  });

  test("negrito fora do nome não vale; ausente continua ausente", () => {
    expect(destaqueDoNome("Fulano de Tal", "Presidente")).toBeUndefined();
    expect(destaqueDoNome("Fulano de Tal", undefined)).toBeUndefined();
  });
});

describe("comDestaque", () => {
  test("anexa o destaque da linha sem mutar a pessoa", () => {
    // Arrange
    const $ = cheerio.load("<li><b>Sérgio</b> Luíz <b>Kukina</b></li>");
    const destaques = colherDestaquesPorLinha($, SEPARAR);
    const pessoa = { nome: "Sérgio Luíz Kukina" };

    // Act
    const resultado = comDestaque(pessoa, "Sérgio  Luíz Kukina", destaques);

    // Assert
    expect(resultado).toEqual({ nome: "Sérgio Luíz Kukina", nomeDestaque: "Sérgio Kukina" });
    expect(pessoa).toEqual({ nome: "Sérgio Luíz Kukina" });
  });

  test("sem destaques, devolve a mesma pessoa", () => {
    const pessoa = { nome: "Ana Lima" };
    expect(comDestaque(pessoa, "Ana Lima")).toBe(pessoa);
  });
});
