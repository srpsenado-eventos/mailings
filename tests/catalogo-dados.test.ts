import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";
import { normalizarNome } from "@/lib/normalize";
import { resolverGrupoEFonte } from "@/lib/catalogo";

/** Domínio oficial de órgão público; `.mil.br` entrou com as páginas das Forças Armadas (GT de 13/11). */
const DOMINIO_OFICIAL = /^https:\/\/[a-z0-9.-]+\.(gov|jus|leg|mp|def|mil)\.br(\/|$)/i;

// Tabela dos titulares em `/fora-de-exercicio/-/f/por-tipo`: a primeira das duas (fixture de
// 23/10, tests/scrape-tabela.test.ts).
const INDICE_TITULARES = 0;

describe("catálogo real (data/catalogo.ts)", () => {
  test("tem os 35 grupos (33 migrados do banco + Governadores Eleitos + Senadores titulares fora de exercício)", () => {
    expect(CATALOGO).toHaveLength(35);
  });

  test("tem as 30 fontes de grupo (as 26 da planilha de 23/10 e as 4 dos Comandantes, GT de 13/11)", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(30);
  });

  describe("planilha de 23/10 (spec 2026-10-23 §5)", () => {
    test("Senadores titulares fora de exercício: grupo novo, tabela por tipo, propõe inclusão", () => {
      const g = CATALOGO.find((x) => x.nome === "Senadores titulares fora de exercício")!;
      expect(g.fontes).toEqual([{ url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo", ativo: true, propoeInclusao: true, tabela: { indice: INDICE_TITULARES, colunas: { nome: 0, uf: 2, motivo: 3 }, secoes: ["Assunção de cargo", "Licença com convocação de suplente"] } }]);
    });

    test("o rótulo da base de 27/10 casa o grupo dos senadores titulares fora de exercício, e não os de Senadores", () => {
      const r = resolverGrupoEFonte("Senadores titulares fora de exercício - Posse 2027");
      expect(r.grupoCanonico).toBe("Senadores titulares fora de exercício");
      expect(r.fontes.map((f) => f.url)).toEqual(["https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo"]);
    });

    test("Ex-Presidentes do Congresso resolve o grupo canônico com a fonte nova-republica; o nome antigo não resolve mais", () => {
      const novo = resolverGrupoEFonte("Ex-Presidentes do Congresso");
      expect(novo.grupoCanonico).toBe("Ex-Presidentes do Congresso");
      expect(novo.fontes.map((f) => f.url)).toEqual(["https://www25.senado.leg.br/web/senadores/nova-republica"]);
      const antigo = resolverGrupoEFonte("Ex-Presidentes do Senado");
      expect(antigo.grupoCanonico).not.toBe("Ex-Presidentes do Congresso");
      expect(antigo.fontes).toEqual([]);
      expect(antigo.sugestoes).toContain("Ex-Presidentes do Congresso");
    });

    test("TST: /ministros primária e /orgaos por marcador propondo convocados", () => {
      const tst = CATALOGO.find((g) => g.nome === "Ministros do TST")!;
      expect(tst.fontes.map((f) => f.url)).toEqual(["https://www.tst.jus.br/ministros", "https://www.tst.jus.br/orgaos"]);
      expect(tst.fontes[1]).toMatchObject({ ativo: true, rotulo: "convocado", propoeInclusao: true, marcador: { textos: ["(convocado)", "(convocada)"] } });
    });

    test("STJ: a página dos ministros marca o nome em destaque; o PDF dos convocados não", () => {
      const stj = CATALOGO.find((g) => g.nome === "Ministros do STJ")!;
      expect(stj.fontes[0]).toMatchObject({ url: "https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1", ativo: true, nomeEmDestaque: true });
      expect(stj.fontes[1].nomeEmDestaque).toBeUndefined();
      expect(CATALOGO.flatMap((g) => g.fontes).filter((f) => f.nomeEmDestaque).length).toBe(1);
    });

    test("STJ: segunda fonte é o PDF da composição, por marcador **", () => {
      const stj = CATALOGO.find((g) => g.nome === "Ministros do STJ")!;
      expect(stj.fontes[1]).toMatchObject({ url: "https://www.stj.jus.br/sites/portalp/SiteAssets/Paginas/Institucional/Composicao/Composicao-do-STJ.pdf", ativo: true, tipo: "pdf", rotulo: "convocado", propoeInclusao: true, marcador: { textos: ["**"] } });
    });

    test("PGR e Ex-Presidentes do Congresso ganharam fonte", () => {
      expect(CATALOGO.find((g) => g.nome === "Procurador-Geral da República")?.fontes).toEqual([{ url: "https://www.mpf.mp.br/o-mpf/o-mpf/membros/procurador-geral-da-republica", ativo: true }]);
      expect(CATALOGO.find((g) => g.nome === "Ex-Presidentes do Congresso")?.fontes).toEqual([{ url: "https://www25.senado.leg.br/web/senadores/nova-republica", ativo: true }]);
    });

    test("STM: página Quem é Quem por gabinete, e gabinetes só nela (GT de 13/11)", () => {
      const stm = CATALOGO.find((g) => g.nome === "Ministros do STM")!;
      expect(stm.fontes).toEqual([
        {
          url: "https://www.stm.jus.br/institucional/conheca-o-superior-tribunal-militar/quem-e-quem?view=default",
          ativo: true,
          gabinetes: { prefixos: ["Gabinete Min.", "Gabinete Min", "Gabinete Ministro", "Gabinete Ministra"], cargo: "Ministro(a)" },
        },
      ]);
      const comGabinetes = CATALOGO.flatMap((g) => [...g.fontes, ...(g.fontesIndividuais ?? [])]).filter((f) => "gabinetes" in f && f.gabinetes);
      expect(comGabinetes).toHaveLength(1);
    });

    test("tipo pdf, marcador e urlAlternativa só onde a spec manda; alternativas em domínio oficial", () => {
      const fontes = CATALOGO.flatMap((g) => g.fontes);
      expect(fontes.filter((f) => f.tipo === "pdf")).toHaveLength(1);
      expect(fontes.filter((f) => f.marcador)).toHaveLength(3); // TST /orgaos, PDF do STJ e Defesa (EMCFA)
      expect(fontes.some((f) => "nomesDoContatos" in f)).toBe(false);
      const alternativas = CATALOGO.flatMap((g) => [...g.fontes, ...(g.fontesIndividuais ?? [])]).flatMap((f) => (f.urlAlternativa ? [f.urlAlternativa] : []));
      expect(alternativas).toEqual(["https://agencia.ac.gov.br/governadora/"]); // só AC: as dos ministérios saíram em 13/11
      expect(alternativas.every((u) => /^https:\/\/[a-z0-9.-]+\.gov\.br\//.test(u))).toBe(true);
    });

    test("AC lê a página da governadoria, com a agência como alternativa (GT de 05/11)", () => {
      const ind = CATALOGO.flatMap((g) => g.fontesIndividuais ?? []);
      const ac = ind.find((f) => "uf" in f.chave && f.chave.uf === "AC");
      expect(ac).toMatchObject({ url: "https://estado.ac.gov.br/orgao-entidades/governadoria/", urlAlternativa: "https://agencia.ac.gov.br/governadora/" });
    });
  });

  test("navegador headless só no MS e no MT (governadores) e no TCU; 'janela' no gov.br federal e em AM, RR e RJ", () => {
    const headless = CATALOGO.flatMap((g) => [
      ...g.fontes.filter((f) => f.navegador === true).map((f) => f.url),
      ...(g.fontesIndividuais ?? []).filter((f) => f.navegador === true).map((f) => f.url),
    ]);
    expect(headless).toEqual(["https://www.transparencia.ms.gov.br/#/QuemEQuem", "https://portal.mt.gov.br/conheca-mato-grosso/governo", "https://portal.tcu.gov.br/autoridades"]);
    const janela = CATALOGO.flatMap((g) => [
      ...g.fontes.filter((f) => f.navegador === "janela").map((f) => f.url),
      ...(g.fontesIndividuais ?? []).filter((f) => f.navegador === "janela").map((f) => f.url),
    ]);
    const estaduais = janela.filter((u) => !u.startsWith("https://www.gov.br/"));
    expect(estaduais).toEqual([
      "https://www.marinha.mil.br/comandantedamarinha",
      "https://www.fab.mil.br/a-forca-aerea/comandante/",
      "https://www.transparencia.am.gov.br/estrutura-organizacional/",
      "https://transparencia.rr.gov.br/principaiscargos",
      "https://www.rj.gov.br/pagina/sobre-o-governo9806",
    ]);
    // a geral do Planalto (Ministros de Estado), a composição da Defesa (EMCFA) e as 3 entradas de
    // Embaixadores (mesma lista do MRE).
    expect(janela.length - estaduais.length).toBe(5);
  });

  test("Comandantes das Forças Armadas e EMCFA: quatro fontes oficiais, sem proposta de inclusão (GT de 13/11)", () => {
    const g = CATALOGO.find((x) => x.nome === "Comandantes das Forças Armadas e EMCFA")!;
    expect(g.fontes).toEqual([
      { url: "https://www.marinha.mil.br/comandantedamarinha", ativo: true, navegador: "janela", pessoaUnica: { cargo: "Comandante da Marinha" } },
      { url: "https://www.gov.br/defesa/pt-br/composicao", ativo: true, navegador: "janela", marcador: { textos: ["CHEFE DO ESTADO-MAIOR CONJUNTO DAS FORÇAS ARMADAS"] } },
      { url: "https://www.eb.mil.br/web/comandante-do-exercito", ativo: true, pessoaUnica: { cargo: "Comandante do Exército Brasileiro" } },
      { url: "https://www.fab.mil.br/a-forca-aerea/comandante/", ativo: true, navegador: "janela", pessoaUnica: { cargo: "Comandante da Aeronáutica" } },
    ]);
    expect(g.fontes.every((f) => DOMINIO_OFICIAL.test(f.url))).toBe(true);
    expect(g.semInclusao).toBe(true);
    const comPessoaUnica = CATALOGO.flatMap((x) => x.fontes).filter((f) => f.pessoaUnica).map((f) => f.url);
    expect(comPessoaUnica).toHaveLength(3);
  });

  describe("fontes individuais (spec 2026-10-15)", () => {
    const comIndividuais = CATALOGO.filter((g) => (g.fontesIndividuais ?? []).length > 0);

    test("só Governadores e Governadores Eleitos têm fontes individuais (Ministros de Estado saiu em 13/11)", () => {
      expect(comIndividuais.map((g) => g.nome).sort()).toEqual(["Governadores", "Governadores Eleitos"]);
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

    test("Governadores: 27 individuais ativas, por UF, nome e cargo, sem fonte de grupo", () => {
      const g = CATALOGO.find((x) => x.nome === "Governadores")!;
      expect(g.fontes).toEqual([]);
      const ind = g.fontesIndividuais ?? [];
      expect(ind).toHaveLength(27);
      expect(ind.every((f) => f.ativo && "uf" in f.chave && f.campos.length === 2)).toBe(true);
      const ufs = ind.map((f) => ("uf" in f.chave ? f.chave.uf : "")).sort();
      expect(ufs).toEqual(["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]);
    });

    test("Governadores têm fonte individual em AC, MT, MG, RS e SC com a URL do GT de 05/11", () => {
      const ind = CATALOGO.find((x) => x.nome === "Governadores")!.fontesIndividuais ?? [];
      const da = (uf: string) => ind.find((f) => "uf" in f.chave && f.chave.uf === uf);
      expect(da("AC")).toMatchObject({ url: "https://estado.ac.gov.br/orgao-entidades/governadoria/", urlAlternativa: "https://agencia.ac.gov.br/governadora/" });
      expect(da("MT")).toMatchObject({ url: "https://portal.mt.gov.br/conheca-mato-grosso/governo", navegador: true });
      expect(da("MG")?.url).toBe("https://www.mg.gov.br/governador/mateus-simoes-de-almeida");
      expect(da("RS")?.url).toBe("https://www.estado.rs.gov.br/governador");
      expect(da("SC")?.url).toBe("https://agenda.scc.sc.gov.br/site/colegiado-de-governo");
      for (const uf of ["AC", "MT", "MG", "RS", "SC"]) {
        expect(da(uf)?.ativo).toBe(true);
        expect(da(uf)?.campos).toEqual(["nome", "cargo"]);
      }
    });

    test("Governadores: provisórias (notícia) só em PE e DF, com nome e cargo, sem validade", () => {
      const ind = CATALOGO.find((x) => x.nome === "Governadores")!.fontesIndividuais ?? [];
      expect(ind.filter((f) => f.provisoria && f.provisoria !== "noticia")).toEqual([]);
      expect(ind.filter((f) => f.validaAte)).toEqual([]);
      const provisorias = ind.filter((f) => f.provisoria === "noticia");
      expect(provisorias.map((f) => ("uf" in f.chave ? f.chave.uf : "")).sort()).toEqual(["DF", "PE"]);
      expect(provisorias.every((f) => f.campos.join(",") === "nome,cargo")).toBe(true);
    });

    test("Ministros de Estado: a página do Planalto é a fonte única, lida pela janela, sem individuais (GT de 13/11)", () => {
      const g = CATALOGO.find((x) => x.nome === "Ministros de Estado")!;
      expect(g.fontes).toEqual([{ url: "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras", ativo: true, navegador: "janela" }]);
      expect(g.fontesIndividuais ?? []).toEqual([]);
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

describe("Presidente da Câmara (2026-10-27)", () => {
  test("a fonte é a página do deputado que preside a Câmara, não a Mesa Diretora", () => {
    const g = CATALOGO.find((x) => x.nome === "Presidente da Câmara dos Deputados")!;
    expect(g.fontes).toEqual([{ url: "https://www.camara.leg.br/deputados/160674", ativo: true }]);
  });
});

describe("fontes que clicam antes de ler (GT de 05/11)", () => {
  const individuais = CATALOGO.flatMap((g) => g.fontesIndividuais ?? []);
  test("Roraima clica no título do governador e vai pela janela", () => {
    const rr = individuais.find((f) => "uf" in f.chave && f.chave.uf === "RR")!;
    expect(rr.clicarAntes).toEqual({ texto: "Governador do Estado de Roraima", prova: "Ocupado por" });
    expect(rr.navegador).toBe("janela");
  });
  test("toda fonte com clicarAntes é lida pela janela", () => {
    const comClique = individuais.filter((f) => f.clicarAntes !== undefined);
    expect(comClique.length).toBeGreaterThan(0);
    expect(comClique.every((f) => f.navegador === "janela")).toBe(true);
  });

  test("só os grupos de Embaixadores e os Comandantes não recebem proposta de inclusão (GT de 05/11 e de 13/11)", () => {
    const marcados = CATALOGO.filter((g) => g.semInclusao).map((g) => g.nome);
    expect(marcados).toHaveLength(4);
    expect(marcados.filter((n) => !n.startsWith("Embaixadores"))).toEqual(["Comandantes das Forças Armadas e EMCFA"]);
    expect(CATALOGO.filter((g) => g.nome.startsWith("Embaixadores")).every((g) => g.semInclusao === true)).toBe(true);
    expect(resolverGrupoEFonte("Embaixadores (Filipinas até Noruega)").semInclusao).toBe(true);
    expect(resolverGrupoEFonte("Ministros do STF").semInclusao).toBeUndefined();
  });
});
