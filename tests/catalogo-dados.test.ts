import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";
import { normalizarNome } from "@/lib/normalize";

describe("catálogo real (data/catalogo.ts)", () => {
  test("Ministros do TST lê /ministros (a antiga /en/ministros responde 404 desde 2026-10-19)", () => {
    const tst = CATALOGO.find((g) => g.nome === "Ministros do TST");
    expect(tst?.fontes.map((f) => f.url)).toEqual(["https://www.tst.jus.br/ministros"]);
  });

  test("tem os 34 grupos (33 migrados do banco + Governadores Eleitos)", () => {
    expect(CATALOGO).toHaveLength(34);
  });

  test("tem as 24 fontes cadastradas (21 migradas do banco + 3 de fora de exercício)", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(24);
  });

  test("navegador headless só no MS (governador) e no TCU; 'janela' no gov.br federal e em AM, RR e RJ", () => {
    const headless = CATALOGO.flatMap((g) => [
      ...g.fontes.filter((f) => f.navegador === true).map((f) => f.url),
      ...(g.fontesIndividuais ?? []).filter((f) => f.navegador === true).map((f) => f.url),
    ]);
    expect(headless).toEqual(["https://www.transparencia.ms.gov.br/#/QuemEQuem", "https://portal.tcu.gov.br/autoridades"]);
    const janela = CATALOGO.flatMap((g) => [
      ...g.fontes.filter((f) => f.navegador === "janela").map((f) => f.url),
      ...(g.fontesIndividuais ?? []).filter((f) => f.navegador === "janela").map((f) => f.url),
    ]);
    const estaduais = janela.filter((u) => !u.startsWith("https://www.gov.br/"));
    expect(estaduais).toEqual([
      "https://www.transparencia.am.gov.br/estrutura-organizacional/",
      "https://transparencia.rr.gov.br/principaiscargos",
      "https://www.rj.gov.br/pagina/sobre-o-governo9806",
    ]);
    // 38 ministros + a geral do Planalto + as 3 entradas de Embaixadores (mesma lista do MRE).
    expect(janela.length - estaduais.length).toBe(42);
  });

  describe("fontes individuais (spec 2026-10-15)", () => {
    const DOMINIO_OFICIAL = /^https:\/\/[a-z0-9.-]+\.(gov|jus|leg|mp|def)\.br(\/|$)/i;
    const comIndividuais = CATALOGO.filter((g) => (g.fontesIndividuais ?? []).length > 0);

    test("só Governadores e Ministros de Estado têm fontes individuais", () => {
      expect(comIndividuais.map((g) => g.nome).sort()).toEqual(["Governadores", "Ministros de Estado"]);
    });

    test("Governadores: 22 individuais ativas, por UF, nome e cargo, sem fonte de grupo", () => {
      const g = CATALOGO.find((x) => x.nome === "Governadores")!;
      expect(g.fontes).toEqual([]);
      const ind = g.fontesIndividuais ?? [];
      expect(ind).toHaveLength(22);
      expect(ind.every((f) => f.ativo && "uf" in f.chave && f.campos.length === 2)).toBe(true);
      const ufs = ind.map((f) => ("uf" in f.chave ? f.chave.uf : "")).sort();
      expect(ufs).toEqual(["AC","AL","AM","AP","BA","CE","ES","GO","MA","MS","PA","PB","PI","PR","RJ","RN","RO","RR","RS","SE","SP","TO"]);
    });

    test("Ministros de Estado: geral é lista de cargos com janela; 38 individuais por nome; AGU e CGU cobrem cargo", () => {
      const g = CATALOGO.find((x) => x.nome === "Ministros de Estado")!;
      expect(g.fontes).toHaveLength(1);
      expect(g.fontes[0]).toMatchObject({ ativo: true, casamento: "cargo", campos: ["cargo"], navegador: "janela" });
      const ind = g.fontesIndividuais ?? [];
      expect(ind).toHaveLength(38);
      expect(ind.every((f) => f.ativo && "nome" in f.chave && f.navegador === "janela")).toBe(true);
      const cobremCargo = ind.filter((f) => f.campos.includes("cargo")).map((f) => f.url).sort();
      expect(cobremCargo).toEqual([
        "https://www.gov.br/agu/pt-br/acesso-a-informacao/institucional/quem",
        "https://www.gov.br/cgu/pt-br/composicao/ministro",
      ]);
    });

    test("toda individual é de domínio oficial, tem campos com 'nome' e chave única no grupo", () => {
      for (const g of comIndividuais) {
        const ind = g.fontesIndividuais ?? [];
        expect(ind.filter((f) => !DOMINIO_OFICIAL.test(f.url)).map((f) => f.url)).toEqual([]);
        expect(ind.filter((f) => f.campos.length === 0 || !f.campos.includes("nome")).map((f) => f.url)).toEqual([]);
        const chaves = ind.map((f) => ("uf" in f.chave ? `uf:${f.chave.uf}` : `nome:${normalizarNome(f.chave.nome)}`));
        expect(new Set(chaves).size).toBe(chaves.length);
      }
    });

    test("fonte 'casamento: cargo' só existe em grupo com individual ativa, e cobre só cargo", () => {
      for (const g of CATALOGO) {
        for (const f of g.fontes.filter((x) => x.casamento === "cargo")) {
          expect(f.campos).toEqual(["cargo"]);
          expect((g.fontesIndividuais ?? []).some((i) => i.ativo)).toBe(true);
        }
      }
    });
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
