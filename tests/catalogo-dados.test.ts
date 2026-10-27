import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";
import { normalizarNome } from "@/lib/normalize";
import { resolverGrupoEFonte } from "@/lib/catalogo";

// Tabela dos titulares em `/fora-de-exercicio/-/f/por-tipo`: a primeira das duas (fixture de
// 23/10, tests/scrape-tabela.test.ts).
const INDICE_TITULARES = 0;

describe("catálogo real (data/catalogo.ts)", () => {
  test("tem os 35 grupos (33 migrados do banco + Governadores Eleitos + Senadores titulares fora de exercício)", () => {
    expect(CATALOGO).toHaveLength(35);
  });

  test("tem as 26 fontes de grupo (24 − 3 de fora de exercício nos Senadores + grupo novo, TST /orgaos, STJ PDF, PGR e Ex-Presidentes do Senado)", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(26);
  });

  describe("planilha de 23/10 (spec 2026-10-23 §5)", () => {
    test("Senadores titulares fora de exercício: grupo novo, tabela por tipo, propõe inclusão", () => {
      const g = CATALOGO.find((x) => x.nome === "Senadores titulares fora de exercício")!;
      expect(g.fontes).toEqual([{ url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo", ativo: true, propoeInclusao: true, tabela: { indice: INDICE_TITULARES, colunas: { nome: 0, uf: 2, motivo: 3 } } }]);
    });

    test("o rótulo da base de 27/10 casa o grupo dos senadores titulares fora de exercício, e não os de Senadores", () => {
      const r = resolverGrupoEFonte("Senadores titulares fora de exercício - Posse 2027");
      expect(r.grupoCanonico).toBe("Senadores titulares fora de exercício");
      expect(r.fontes.map((f) => f.url)).toEqual(["https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo"]);
    });

    test("TST: /ministros primária e /orgaos por marcador propondo convocados", () => {
      const tst = CATALOGO.find((g) => g.nome === "Ministros do TST")!;
      expect(tst.fontes.map((f) => f.url)).toEqual(["https://www.tst.jus.br/ministros", "https://www.tst.jus.br/orgaos"]);
      expect(tst.fontes[1]).toMatchObject({ ativo: true, rotulo: "convocado", propoeInclusao: true, marcador: { textos: ["(convocado)", "(convocada)"] } });
    });

    test("STJ: segunda fonte é o PDF da composição, por marcador **", () => {
      const stj = CATALOGO.find((g) => g.nome === "Ministros do STJ")!;
      expect(stj.fontes[1]).toMatchObject({ url: "https://www.stj.jus.br/sites/portalp/SiteAssets/Paginas/Institucional/Composicao/Composicao-do-STJ.pdf", ativo: true, tipo: "pdf", rotulo: "convocado", propoeInclusao: true, marcador: { textos: ["**"] } });
    });

    test("PGR e Ex-Presidentes do Senado ganharam fonte; Garibaldi é exceção de nome", () => {
      expect(CATALOGO.find((g) => g.nome === "Procurador-Geral da República")?.fontes).toEqual([{ url: "https://www.mpf.mp.br/o-mpf/o-mpf/membros/procurador-geral-da-republica", ativo: true }]);
      expect(CATALOGO.find((g) => g.nome === "Ex-Presidentes do Senado")?.fontes).toEqual([{ url: "https://www25.senado.leg.br/web/senadores/nova-republica", ativo: true, nomesDoContatos: ["Garibaldi Alves Filho"] }]);
    });

    test("tipo pdf, marcador, nomesDoContatos e urlAlternativa só onde a spec manda; alternativas em domínio oficial", () => {
      const fontes = CATALOGO.flatMap((g) => g.fontes);
      expect(fontes.filter((f) => f.tipo === "pdf")).toHaveLength(1);
      expect(fontes.filter((f) => f.marcador)).toHaveLength(2);
      expect(fontes.filter((f) => f.nomesDoContatos)).toHaveLength(1);
      const alternativas = CATALOGO.flatMap((g) => [...g.fontes, ...(g.fontesIndividuais ?? [])]).flatMap((f) => (f.urlAlternativa ? [f.urlAlternativa] : []));
      expect(alternativas).toHaveLength(6);
      expect(alternativas.every((u) => /^https:\/\/[a-z0-9.-]+\.gov\.br\//.test(u))).toBe(true);
    });

    test("ajuste de 26/10: link da planilha de 23/10 é a principal nos quatro ministérios; AC lê a página da governadora", () => {
      const ind = CATALOGO.flatMap((g) => g.fontesIndividuais ?? []);
      const principalDe = (nome: string) => ind.find((f) => "nome" in f.chave && f.chave.nome === nome);
      expect(principalDe("Miriam Belchior")?.url).toBe("https://www.gov.br/casacivil/pt-br/composicao/gabinete-do-ministro/quem-e-quem-1");
      expect(principalDe("Margareth Menezes da Purificação")?.url).toBe("https://www.gov.br/cultura/pt-br/composicao/gabinete-da-ministra/margareth-menezes-1");
      expect(principalDe("José Mucio Monteiro Filho")?.url).toBe("https://www.gov.br/defesa/pt-br/composicao/gabinete-do-ministro/jose-mucio-monteiro-filho");
      expect(principalDe("Rachel Barros de Oliveira")?.url).toBe("https://www.gov.br/igualdaderacial/pt-br/composicao/gabinete-da-ministra/rachel-barros-de-oliveira");
      const ac = ind.find((f) => "uf" in f.chave && f.chave.uf === "AC");
      expect(ac).toMatchObject({ url: "https://agencia.ac.gov.br/governadora/", urlAlternativa: "https://estado.ac.gov.br/orgao-entidades/" });
    });
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

    test("só Governadores, Governadores Eleitos e Ministros de Estado têm fontes individuais", () => {
      expect(comIndividuais.map((g) => g.nome).sort()).toEqual(["Governadores", "Governadores Eleitos", "Ministros de Estado"]);
    });

    test("Governadores Eleitos: 3 sites de campanha (ES, RN, TO), provisórios, só nome, válidos até 5/1/2027 (spec 2026-10-26)", () => {
      const g = CATALOGO.find((x) => x.nome === "Governadores Eleitos")!;
      expect(g.fontes).toEqual([]);
      expect(g.fontesIndividuais).toEqual([
        { url: "https://lorenzopazolini10.com.br/", ativo: true, chave: { uf: "ES" }, campos: ["nome"], provisoria: "campanha", validaAte: "2027-01-05" },
        { url: "https://cadudelula.com.br/", ativo: true, chave: { uf: "RN" }, campos: ["nome"], provisoria: "campanha", validaAte: "2027-01-05" },
        { url: "https://vicentinho45.com.br/", ativo: true, chave: { uf: "TO" }, campos: ["nome"], provisoria: "campanha", validaAte: "2027-01-05" },
      ]);
    });

    test("site de campanha (domínio não oficial) só nas três individuais de Governadores Eleitos", () => {
      const todas = CATALOGO.flatMap((g) => [...g.fontes.map((f) => ({ grupo: g.nome, url: f.url, provisoria: undefined as unknown })), ...(g.fontesIndividuais ?? []).map((f) => ({ grupo: g.nome, url: f.url, provisoria: f.provisoria as unknown }))]);
      const campanha = todas.filter((f) => f.provisoria === "campanha");
      expect(campanha.map((f) => f.grupo)).toEqual(["Governadores Eleitos", "Governadores Eleitos", "Governadores Eleitos"]);
      const individuais = CATALOGO.flatMap((g) => g.fontesIndividuais ?? []);
      const naoOficiais = individuais.filter((f) => !DOMINIO_OFICIAL.test(f.url));
      expect(naoOficiais.map((f) => f.url)).toEqual(campanha.map((f) => f.url));
      expect(individuais.filter((f) => f.validaAte).map((f) => f.url)).toEqual(campanha.map((f) => f.url));
    });

    test("Governadores: 24 individuais ativas, por UF, nome e cargo, sem fonte de grupo", () => {
      const g = CATALOGO.find((x) => x.nome === "Governadores")!;
      expect(g.fontes).toEqual([]);
      const ind = g.fontesIndividuais ?? [];
      expect(ind).toHaveLength(24);
      expect(ind.every((f) => f.ativo && "uf" in f.chave && f.campos.length === 2)).toBe(true);
      const ufs = ind.map((f) => ("uf" in f.chave ? f.chave.uf : "")).sort();
      expect(ufs).toEqual(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MS","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SE","SP","TO"]);
    });

    test("Governadores: provisórias (notícia) só em PE e DF, com nome e cargo, sem validade", () => {
      const ind = CATALOGO.find((x) => x.nome === "Governadores")!.fontesIndividuais ?? [];
      expect(ind.filter((f) => f.provisoria && f.provisoria !== "noticia")).toEqual([]);
      expect(ind.filter((f) => f.validaAte)).toEqual([]);
      const provisorias = ind.filter((f) => f.provisoria === "noticia");
      expect(provisorias.map((f) => ("uf" in f.chave ? f.chave.uf : "")).sort()).toEqual(["DF", "PE"]);
      expect(provisorias.every((f) => f.campos.join(",") === "nome,cargo")).toBe(true);
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

    test("toda individual é de domínio oficial (salvo o site de campanha), tem campos com 'nome' e chave única no grupo", () => {
      for (const g of comIndividuais) {
        const ind = g.fontesIndividuais ?? [];
        expect(ind.filter((f) => f.provisoria !== "campanha" && !DOMINIO_OFICIAL.test(f.url)).map((f) => f.url)).toEqual([]);
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

    test("são três e cada um lê só a lista em exercício (fora de exercício virou grupo próprio em 23/10)", () => {
      expect(senadores).toHaveLength(3);
      for (const g of senadores) {
        expect(g.fontes.map((f) => f.url)).toEqual(["https://www25.senado.leg.br/web/senadores/em-exercicio"]);
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
