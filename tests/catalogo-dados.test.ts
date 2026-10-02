import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";

describe("catálogo real (data/catalogo.ts)", () => {
  test("tem os 33 grupos migrados do banco", () => {
    expect(CATALOGO).toHaveLength(33);
  });

  test("tem as 24 fontes cadastradas (21 migradas do banco + 3 de fora de exercício)", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(24);
  });

  test("todo grupo tem nome não-vazio", () => {
    const semNome = CATALOGO.filter((g) => g.nome.trim().length === 0);
    expect(semNome).toEqual([]);
  });

  test("não há nome de grupo repetido", () => {
    const nomes = CATALOGO.map((g) => g.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  test("toda fonte tem URL http(s)", () => {
    const invalidas = CATALOGO.flatMap((g) => g.fontes)
      .map((f) => f.url)
      .filter((url) => !/^https?:\/\//i.test(url));
    expect(invalidas).toEqual([]);
  });

  test("todo grupo com fonte tem ao menos uma ativa", () => {
    const semAtiva = CATALOGO.filter((g) => g.fontes.length > 0 && !g.fontes.some((f) => f.ativo));
    expect(semAtiva.map((g) => g.nome)).toEqual([]);
  });

  describe("grupos de Senadores", () => {
    const senadores = CATALOGO.filter((g) => g.nome.startsWith("Senadores ("));

    test("são três e cada um tem as duas fontes, na ordem", () => {
      expect(senadores).toHaveLength(3);
      for (const g of senadores) {
        expect(g.fontes.map((f) => f.url)).toEqual([
          "https://www25.senado.leg.br/web/senadores/em-exercicio",
          "https://www25.senado.leg.br/web/senadores/fora-de-exercicio",
        ]);
      }
    });

    test("só a fonte de fora de exercício propõe inclusão, e ela tem rótulo e seções", () => {
      for (const g of senadores) {
        const [primaria, secundaria] = g.fontes;
        expect(primaria.propoeInclusao).toBeUndefined();
        expect(secundaria.propoeInclusao).toBe(true);
        expect(secundaria.rotulo).toBe("fora de exercício");
        expect(secundaria.tabela?.secoes).toEqual([
          "Assunção de cargo",
          "Licença com convocação de suplente",
        ]);
      }
    });

    test("as três faixas cobrem as 27 UFs, sem repetição", () => {
      const todas = senadores.flatMap((g) => g.ufs ?? []);
      expect(todas).toHaveLength(27);
      expect(new Set(todas).size).toBe(27);
    });

    test("cada faixa cobre exatamente as UFs do seu intervalo alfabético", () => {
      const faixaDe = (nome: string) => CATALOGO.find((g) => g.nome === nome)?.ufs;
      expect(faixaDe("Senadores (Acre a Goiás)")).toEqual(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO"]);
      expect(faixaDe("Senadores (Maranhão ao Piauí)")).toEqual(["MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI"]);
      expect(faixaDe("Senadores (Rio a Tocantins)")).toEqual(["RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);
    });
  });
});
