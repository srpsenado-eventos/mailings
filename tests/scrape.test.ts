import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodificarCorpo, extrairConteudo, raspar, ScrapeError } from "@/lib/scrape";

const html = readFileSync(resolve(__dirname, "fixtures/orgao-exemplo.html"), "utf-8");

/** Resposta fake no formato mínimo que `raspar` consome (bytes + content-type). */
function respostaOk(corpo: string, contentType = "text/html;charset=UTF-8") {
  return {
    ok: true,
    status: 200,
    headers: { get: (nome: string) => (nome === "content-type" ? contentType : null) },
    arrayBuffer: async () => Buffer.from(corpo, "utf-8"),
  };
}
function respostaErro(status: number) {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => Buffer.alloc(0),
  };
}
/** Erro de certificado como o Node o emite no `fetch` (código dentro de `cause`). */
function erroDeCertificado(): Error {
  const causa = Object.assign(new Error("unable to verify the first certificate"), {
    code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  });
  return Object.assign(new Error("fetch failed"), { cause: causa });
}

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

describe("extrairConteudo (estruturado)", () => {
  const htmlCnj = readFileSync(resolve(__dirname, "fixtures/cnj-grudado.html"), "utf-8");

  test("separa blocos: não gruda nome com cargo/rótulo", () => {
    const c = extrairConteudo(htmlCnj, "https://cnj");
    expect(c.textoLimpo).not.toContain("MarquesCorregedor");
    expect(c.textoLimpo).toContain("Mauro Campbell Marques");
  });

  test("extrai pessoas com nome + cargo", () => {
    const c = extrairConteudo(htmlCnj, "https://cnj");
    const fachin = c.pessoas.find((p) => p.nome.includes("Fachin"));
    expect(fachin?.cargo).toMatch(/Presidente/);
    const silvio = c.pessoas.find((p) => p.nome === "Silvio Amorim Junior");
    expect(silvio?.cargo).toBe("Conselheiro");
  });

  test("filtra rótulos e cargos soltos (não viram pessoa)", () => {
    const c = extrairConteudo(htmlCnj, "https://cnj");
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Nascimento:");
    expect(nomes).not.toContain("CEP:");
    expect(nomes).not.toContain("Conselheiro");
    expect(nomes.some((n) => n.includes("Nascimento"))).toBe(false);
  });

  test("ignora itens de menu em nav/header (links de navegação)", () => {
    const c = extrairConteudo(htmlCnj, "https://cnj");
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Transparência e Prestação de Contas");
    expect(nomes).not.toContain("Atos Normativos");
    expect(nomes).not.toContain("Composição Atual");
    // as pessoas reais continuam
    expect(nomes).toContain("Luiz Edson Fachin");
    expect(nomes).toContain("Silvio Amorim Junior");
  });
});

describe("extrairConteudo (portal com menu fora de <nav>, caso STM)", () => {
  const htmlStm = readFileSync(resolve(__dirname, "fixtures/stm-composicao.html"), "utf-8");

  /** Os 15 ministros da composição da Corte, pelo trecho pessoal do nome. */
  const MINISTROS = [
    "Maria Elizabeth Guimarães Teixeira Rocha",
    "Francisco Joseli Parente Camelo",
    "Artur Vidigal de Oliveira",
    "José Barroso Filho",
    "Péricles Aurélio Lima de Queiroz",
    "Carlos Vuyk de Aquino",
    "Leonardo Puntel",
    "Celso Luiz Nazareth",
    "Carlos Augusto Amaral Oliveira",
    "Cláudio Portugal de Viveiros",
    "Lourival Carvalho Silva",
    "Guido Amin Naves",
    "Verônica Abdalla Sterman",
    "Anisio David de Oliveira Junior",
    "Flavio Marcus Lancia Barbosa",
  ];

  test("extrai os 15 ministros, inclusive os de nome precedido por título e patente", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlStm, "https://www.stm.jus.br/composicao-da-corte");

    // Assert
    const nomes = c.pessoas.map((p) => p.nome);
    for (const ministro of MINISTROS) {
      expect(nomes.some((n) => n.includes(ministro))).toBe(true);
    }
  });

  test("não transforma item de menu em pessoa (menu em div, sem <nav>)", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlStm, "https://www.stm.jus.br/composicao-da-corte");

    // Assert
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Fale Conosco");
    expect(nomes).not.toContain("Composição da Corte");
    expect(nomes).not.toContain("Agenda de Autoridades");
    expect(nomes).not.toContain("Governança e Gestão Estratégica");
  });

  test("mantém a composição na ordem de dezenas, não de centenas", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlStm, "https://www.stm.jus.br/composicao-da-corte");

    // Assert — antes da correção o menu inflava a lista para 136 "pessoas"
    expect(c.pessoas.length).toBeLessThan(30);
  });
});

describe("extrairConteudo (lista numerada, caso TST)", () => {
  const htmlTst = readFileSync(resolve(__dirname, "fixtures/tst-ministros.html"), "utf-8");

  test("extrai os 26 ministros, mesmo com o ordinal na mesma linha", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlTst, "https://www.tst.jus.br/ministros");

    // Assert — o dígito do ordinal derrubava a linha inteira e o grupo saía todo vermelho
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).toContain("Luiz Philippe Vieira de Mello Filho");
    expect(nomes).toContain("Ives Gandra da Silva Martins Filho");
    expect(nomes).toContain("Margareth Rodrigues Costa");
    expect(nomes).toContain("Antônio Fabrício de Matos Gonçalves");
    expect(nomes.length).toBeGreaterThanOrEqual(26);
  });

  test("separa o cargo do nome nos ministros com função de direção", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlTst, "https://www.tst.jus.br/ministros");

    // Assert
    const porNome = (nome: string) => c.pessoas.find((p) => p.nome === nome);
    expect(porNome("Luiz Philippe Vieira de Mello Filho")?.cargo).toBe("Presidente");
    expect(porNome("Guilherme Augusto Caputo Bastos")?.cargo).toBe("Vice-Presidente");
    expect(porNome("José Roberto Freire Pimenta")?.cargo).toBe(
      "Corregedor-Geral da Justiça do Trabalho",
    );
    expect(porNome("Ives Gandra da Silva Martins Filho")?.cargo).toBeUndefined();
  });
});

describe("decodificarCorpo", () => {
  test("decodifica o corpo no charset declarado no cabeçalho", () => {
    // Arrange
    const corpo = Buffer.from("<html><body>Luis Felipe Salomão</body></html>", "latin1");

    // Act
    const html = decodificarCorpo(corpo, "text/html;charset=ISO-8859-1");

    // Assert
    expect(html).toContain("Luis Felipe Salomão");
  });

  test("usa UTF-8 quando o cabeçalho não declara charset", () => {
    const corpo = Buffer.from("<html><body>José Antônio</body></html>", "utf-8");
    expect(decodificarCorpo(corpo, "text/html")).toContain("José Antônio");
  });

  test("cai no charset do <meta> quando o cabeçalho não declara", () => {
    const corpo = Buffer.from(
      '<html><head><meta charset="iso-8859-1"></head><body>Salomão</body></html>',
      "latin1",
    );
    expect(decodificarCorpo(corpo, undefined)).toContain("Salomão");
  });

  test("cai em UTF-8 quando o charset declarado é desconhecido", () => {
    const corpo = Buffer.from("<html><body>José</body></html>", "utf-8");
    expect(decodificarCorpo(corpo, "text/html;charset=inexistente-9")).toContain("José");
  });
});

describe("extrairConteudo (nome partido pelo negrito, caso STJ)", () => {
  const bytesStj = readFileSync(resolve(__dirname, "fixtures/stj-ministros.html"));
  const htmlStj = decodificarCorpo(bytesStj, "text/html;charset=ISO-8859-1");

  test("mantém o nome inteiro quando o negrito marca só parte dele", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlStj, "https://www.stj.jus.br/web/verMinistrosSTJ");

    // Assert — o site marca "<b>Marco Aurélio Bellizze</b> Oliveira"
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).toContain("Marco Aurélio Bellizze Oliveira");
    expect(nomes).toContain("Antonio Herman de Vasconcellos e Benjamin");
    expect(nomes).toContain("Maria Isabel Diniz Gallotti Rodrigues");
    expect(nomes).not.toContain("Oliveira");
    expect(nomes.length).toBeGreaterThanOrEqual(32);
  });

  test("não adota a linha da próxima pessoa como cargo", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlStj, "https://www.stj.jus.br/web/verMinistrosSTJ");

    // Assert — a linha seguinte é "Benedito Gonçalves - Diretor-Geral da ENFAM"
    const porNome = (nome: string) => c.pessoas.find((p) => p.nome === nome);
    expect(porNome("Antonio Herman de Vasconcellos e Benjamin")?.cargo).toBeUndefined();
    expect(porNome("José Afrânio Vilela")?.cargo).toBeUndefined();
  });

  test("preserva os acentos da página em ISO-8859-1", () => {
    const c = extrairConteudo(htmlStj, "https://www.stj.jus.br/web/verMinistrosSTJ");
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).toContain("Luis Felipe Salomão");
    expect(nomes).toContain("Fátima Nancy Andrighi");
    expect(nomes.some((n) => n.includes("�"))).toBe(false);
  });

  test("separa nome e cargo quando os dois vêm na mesma linha", () => {
    const c = extrairConteudo(htmlStj, "https://www.stj.jus.br/web/verMinistrosSTJ");
    expect(c.pessoas.find((p) => p.nome === "Luis Felipe Salomão")?.cargo).toBe("Presidente");
    expect(c.pessoas.find((p) => p.nome === "Benedito Gonçalves")?.cargo).toBe(
      "Diretor-Geral da ENFAM",
    );
  });
});

describe("raspar", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("envia headers de navegador (passa por WAF que bloqueia bot)", async () => {
    const fetchMock = vi.fn((_url: string, _opcoes?: RequestInit) =>
      Promise.resolve(respostaOk("<html><body>ok</body></html>")),
    );
    vi.stubGlobal("fetch", fetchMock);

    await raspar("https://orgao.gov.br");

    const opcoes = fetchMock.mock.calls[0][1];
    const headers = (opcoes?.headers ?? {}) as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/Mozilla/);
    expect(headers["Accept-Language"]).toMatch(/pt-BR/);
  });

  test("em erro de certificado, repete com TLS relaxado (dispatcher)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(erroDeCertificado())
      .mockResolvedValueOnce(respostaOk("<html><body>ok</body></html>"));
    vi.stubGlobal("fetch", fetchMock);

    const c = await raspar("https://stf.jus.br");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, opcoesRetry] = fetchMock.mock.calls[1];
    expect((opcoesRetry as { dispatcher?: unknown }).dispatcher).toBeDefined();
    expect(c.textoLimpo).toContain("ok");
  });

  test("erro de rede comum NÃO dispara retry de TLS", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(raspar("https://orgao.gov.br")).rejects.toBeInstanceOf(ScrapeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("status HTTP não-OK vira ScrapeError com o motivo, sem retry", async () => {
    const fetchMock = vi.fn(async () => respostaErro(403));
    vi.stubGlobal("fetch", fetchMock);

    await expect(raspar("https://stf.jus.br")).rejects.toMatchObject({
      name: "ScrapeError",
      motivo: "HTTP 403",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
