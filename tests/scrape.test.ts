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

  test("adota o cargo publicado ACIMA do nome (o STM também inverte a ordem)", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlStm, "https://www.stm.jus.br/composicao-da-corte");

    // Assert — a página põe "Presidente" na linha antes do nome; olhando só para
    // frente, os 15 ministros saíam todos sem cargo
    const porTrecho = (trecho: string) => c.pessoas.find((p) => p.nome.includes(trecho));
    expect(porTrecho("Maria Elizabeth")?.cargo).toBe("Presidente");
    expect(porTrecho("Francisco Joseli")?.cargo).toBe("Vice-presidente");
    expect(porTrecho("Artur Vidigal")?.cargo).toBe("Ministro(a)");
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

describe("extrairConteudo (cargo antes do nome, caso Ministros de Estado)", () => {
  const htmlMinistros = readFileSync(resolve(__dirname, "fixtures/ministros-estado.html"), "utf-8");
  const URL_MINISTROS =
    "https://www.gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras";

  test("pareia o ministro com o cargo da linha anterior, não com o do ministro seguinte", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlMinistros, URL_MINISTROS);

    // Assert — olhando só para frente, cada nome herdava o cargo do próximo
    const porNome = (nome: string) => c.pessoas.find((p) => p.nome === nome);
    expect(porNome("Miriam Belchior")?.cargo).toBe(
      "Ministra de Estado da Casa Civil da Presidência da República",
    );
    expect(porNome("André Carlos Alves de Paula Filho")?.cargo).toBe(
      "Ministro de Estado da Agricultura e Pecuária",
    );
    expect(porNome("Antonio Vladimir Moura Lima")?.cargo).toBe("Ministro de Estado das Cidades");
    expect(porNome("Luciana Barbosa de Oliveira Santos")?.cargo).toBe(
      "Ministra de Estado da Ciência, Tecnologia e Inovação",
    );
  });

  test("não atribui cargo de gênero trocado a quem está uma linha depois", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlMinistros, URL_MINISTROS);

    // Assert — "Antonio Vladimir Moura Lima || Ministra de ..." era o sintoma do erro de um
    const vladimir = c.pessoas.find((p) => p.nome === "Antonio Vladimir Moura Lima");
    expect(vladimir?.cargo).not.toMatch(/^Ministra\b/);
    // o título dele na página é "Controladoria-Geral da União", que não está no
    // léxico de cargos; o que não pode é herdar a Agricultura do ministro seguinte
    const vinicius = c.pessoas.find((p) => p.nome === "Vinícius Marques de Carvalho");
    expect(vinicius?.cargo ?? "").not.toMatch(/Agricultura/);
  });

  test("linha que é só cargo não entra como pessoa, por mais longa que seja", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlMinistros, URL_MINISTROS);

    // Assert — dez tokens escapavam do limite de oito do rótulo curto de cargo
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Ministra de Estado da Casa Civil da Presidência da República");
    expect(nomes.some((n) => /^Minist(ro|ra) de Estado/.test(n))).toBe(false);
    expect(nomes.some((n) => /^Minist(ro|ra) d[aeo]/.test(n))).toBe(false);
  });

  test("extrai todos os ministros do recorte, com o cargo preenchido", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlMinistros, URL_MINISTROS);

    // Assert
    const comCargoDeMinistro = c.pessoas.filter((p) => /^Minist(ro|ra) de Estado/.test(p.cargo ?? ""));
    expect(comCargoDeMinistro.length).toBe(16);
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).toContain("Guilherme Castro Boulos");
    expect(nomes).toContain("Leonardo Osvaldo Barchini Rosa");
  });

  test("não transforma item do menu do portal em pessoa", () => {
    // Arrange / Act
    const c = extrairConteudo(htmlMinistros, URL_MINISTROS);

    // Assert
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Estrutura da Presidência");
    expect(nomes).not.toContain("Perfil Profissional");
    expect(nomes).not.toContain("Ministros e Ministras");
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

describe("título de seção encerra a janela do cargo (TCU, página montada pelo navegador)", () => {
  const html = readFileSync(resolve(__dirname, "fixtures/tcu-autoridades.html"), "utf-8");
  const c = extrairConteudo(html, "https://portal.tcu.gov.br/autoridades");
  const porTrecho = (t: string) => c.pessoas.find((p) => p.nome.includes(t));

  test("lê os nove ministros, com o tratamento 'Ministro' fora do nome", () => {
    const nomes = [
      "Vital do Rêgo Filho", "Jorge Antonio de Oliveira Francisco", "Walton Alencar Rodrigues",
      "Benjamin Zymler", "João Augusto Ribeiro Nardes", "Antonio Augusto Junho Anastasia",
      "Jhonatan Pereira de Jesus", "Odair Jose da Cunha", "Rodrigo Otavio Soares Pacheco",
    ];
    for (const n of nomes) expect(c.pessoas.map((p) => p.nome)).toContain(n);
  });

  test("cargo só onde a página publica: Presidente e Vice-Presidente", () => {
    expect(porTrecho("Vital do Rêgo")?.cargo).toBe("Presidente");
    expect(porTrecho("Jorge Antonio")?.cargo).toBe("Vice-Presidente");
    expect(porTrecho("Walton Alencar")?.cargo).toBeUndefined();
  });

  test("o título 'Ministros-Substitutos' não vira cargo do último ministro da lista", () => {
    expect(porTrecho("Rodrigo Otavio")?.cargo).toBeUndefined();
  });

  test("título e item de menu não formam pessoa com cargo (nada de 'novo' falso)", () => {
    const comCargo = c.pessoas.filter((p) => p.cargo).map((p) => p.nome);
    expect(comCargo).toEqual(["Vital do Rêgo Filho", "Jorge Antonio de Oliveira Francisco"]);
    expect(c.pessoas.some((p) => p.cargo === "Corregedoria")).toBe(false);
    expect(c.pessoas.some((p) => p.cargo === "Sobre a Corregedoria")).toBe(false);
  });

  test("moldura fora: nada do cabeçalho ou do rodapé", () => {
    expect(c.textoLimpo).not.toMatch(/Fale conosco|Assinatura de Conteúdo|CEP 70042/);
  });
});

describe("título de seção (h1..h6) e a janela do cargo", () => {
  test("em página com cargo ABAIXO do nome, o título seguinte não é adotado como cargo", () => {
    const html = `<html><body><main>
      <p>Fulano de Tal Silva</p><p>Conselheiro</p>
      <p>Beltrano de Souza Lima</p>
      <h2>Conselheiros Substitutos</h2>
      <p>Sicrano Pereira Costa</p><p>Conselheiro Substituto</p>
    </main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/composicao");
    expect(c.pessoas.find((p) => p.nome.startsWith("Beltrano"))?.cargo).toBeUndefined();
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBe("Conselheiro");
    expect(c.pessoas.find((p) => p.nome.startsWith("Sicrano"))?.cargo).toBe("Conselheiro Substituto");
  });

  test("em página com cargo ACIMA do nome, o título continua valendo como cargo (caso STM, h5)", () => {
    const html = `<html><body><main>
      <h5>Presidente</h5><h6>Fulano de Tal Silva</h6>
      <h5>Vice-presidente</h5><h6>Beltrano de Souza Lima</h6>
      <h5>Conselheiro</h5><h6>Sicrano Pereira Costa</h6>
    </main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/composicao");
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBe("Presidente");
    expect(c.pessoas.find((p) => p.nome.startsWith("Sicrano"))?.cargo).toBe("Conselheiro");
  });

  test("UM título de seção acima da lista não inverte a orientação nem vira cargo do primeiro nome", () => {
    // Defeito evitado: "Ministros" contado como cargo-antes do primeiro nome e, com
    // "Presidente" entre os dois nomes, a página inteira lida como cargo-acima: o primeiro
    // levaria "Ministros" e o segundo roubaria "Presidente".
    const html = `<html><body><main>
      <h2>Ministros</h2>
      <ul>
        <li><span>Ministro Fulano de Tal Silva</span><span>Presidente</span></li>
        <li><span>Ministra Beltrana Souza Lima</span></li>
      </ul></main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/autoridades");
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBe("Presidente");
    expect(c.pessoas.find((p) => p.nome.startsWith("Beltrana"))?.cargo).toBeUndefined();
  });

  test("página com cargo ACIMA do nome em negrito (padrão Ministros de Estado) continua lendo os cargos", () => {
    const html = `<html><body><main>
      <h1>Ministros de Estado</h1>
      <p><b>Ministro da Fazenda</b></p><p>Fulano de Tal Silva</p>
      <p><b>Ministra da Saúde</b></p><p>Beltrana Souza Lima</p>
      <p><b>Ministro da Educação</b></p><p>Sicrano Pereira Costa</p>
    </main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/ministros");
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBe("Ministro da Fazenda");
    expect(c.pessoas.find((p) => p.nome.startsWith("Sicrano"))?.cargo).toBe("Ministro da Educação");
  });

  test("o texto limpo não carrega marcador de título", () => {
    const c = extrairConteudo("<html><body><main><h2>Ministros</h2><p>Fulano de Tal Silva</p></main></body></html>", "https://x.gov.br");
    expect(c.textoLimpo).toBe("Ministros Fulano de Tal Silva");
    expect(c.textoLimpo).not.toMatch(/\uE000/);
  });

  test("título com <br> mantém as duas linhas e o cargo do título repetido", () => {
    const html = `<html><body><main>
      <h3>Presidente<br>Fulano de Tal Silva</h3>
      <h3>Vice-presidente<br>Beltrano de Souza Lima</h3>
    </main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/composicao");
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBe("Presidente");
    expect(c.pessoas.find((p) => p.nome.startsWith("Beltrano"))?.cargo).toBe("Vice-presidente");
    expect(c.textoLimpo).toBe("Presidente Fulano de Tal Silva Vice-presidente Beltrano de Souza Lima");
  });

  test("dois títulos de seção em página de cargo em negrito acima do nome não viram cargo", () => {
    const html = `<html><body><main>
      <h2>Ministros</h2>
      <p><b>Ministro da Fazenda</b></p><p>Fulano de Tal Silva</p>
      <p><b>Ministra da Saúde</b></p><p>Beltrana Souza Lima</p>
      <h2>Ministros-Substitutos</h2>
      <p><b>Ministro da Educação</b></p><p>Sicrano Pereira Costa</p>
      <p><b>Ministro da Justiça</b></p><p>Cicrano Alves Duarte</p>
    </main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/ministros");
    const cargos = c.pessoas.map((p) => p.cargo);
    expect(cargos).not.toContain("Ministros");
    expect(cargos).not.toContain("Ministros-Substitutos");
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBe("Ministro da Fazenda");
    expect(c.pessoas.find((p) => p.nome.startsWith("Sicrano"))?.cargo).toBe("Ministro da Educação");
  });

  test("um único par título-cargo e nome não basta para o título valer como cargo", () => {
    const html = `<html><body><main>
      <h5>Presidente</h5><h6>Fulano de Tal Silva</h6><p>Beltrano de Souza Lima</p>
    </main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/composicao");
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBeUndefined();
  });

  test("com dois pares consecutivos de título-cargo e nome, os dois cargos são adotados", () => {
    const html = `<html><body><main>
      <h5>Presidente</h5><h6>Fulano de Tal Silva</h6>
      <h5>Conselheiro</h5><h6>Beltrano de Souza Lima</h6>
    </main></body></html>`;
    const c = extrairConteudo(html, "https://x.gov.br/composicao");
    expect(c.pessoas.find((p) => p.nome.startsWith("Fulano"))?.cargo).toBe("Presidente");
    expect(c.pessoas.find((p) => p.nome.startsWith("Beltrano"))?.cargo).toBe("Conselheiro");
  });
});

describe("cargo casa por palavra inteira, não por pedaço de palavra", () => {
  const cargoApos = (linha: string) => {
    const html = `<html><body><main><p>Fulano de Tal Silva</p><p>${linha}</p></main></body></html>`;
    return extrairConteudo(html, "https://x.gov.br/composicao").pessoas.find((p) => p.nome === "Fulano de Tal Silva")?.cargo;
  };

  test.each([
    "Sobre a Corregedoria",
    "Diretoria de Pessoal",
    "Procuradoria Regional",
    "Defensoria Pública",
    "Ouvidoria",
    "Prefeitura Municipal",
  ])("nome de órgão não é cargo: %s", (linha) => {
    // Arrange + Act
    const cargo = cargoApos(linha);

    // Assert
    expect(cargo).toBeUndefined();
  });

  test.each([
    "Corregedor-Geral",
    "Subprocurador-Geral da República",
    "Procurador-Geral",
    "Ministro-Substituto",
    "Vice-Presidente",
    "Ex-Ministro",
    "Conselheiros",
  ])("palavra de cargo, com prefixo, hífen ou plural, é cargo: %s", (linha) => {
    // Arrange + Act
    const cargo = cargoApos(linha);

    // Assert
    expect(cargo).toBe(linha);
  });

  test("'Sobre a Corregedoria' não vira cargo do item de menu acima (caso real do TCU)", () => {
    // Arrange
    const html = readFileSync(resolve(__dirname, "fixtures/tcu-autoridades.html"), "utf-8");

    // Act
    const c = extrairConteudo(html, "https://portal.tcu.gov.br/autoridades");

    // Assert
    expect(c.pessoas.some((p) => p.cargo === "Sobre a Corregedoria")).toBe(false);
    expect(c.pessoas.filter((p) => p.cargo).map((p) => p.nome)).toEqual([
      "Vital do Rêgo Filho",
      "Jorge Antonio de Oliveira Francisco",
    ]);
  });
});

describe("título que abre seção não toma a linha de cima como cargo", () => {
  test("dois títulos de seção com cara de cargo e nomes sem cargo: ninguém recebe cargo", () => {
    // Arrange
    const html = `<html><body><main>
      <h2>Ministros</h2><p>Fulano de Tal Silva</p><p>Beltrano de Souza Lima</p>
      <h2>Ministros-Substitutos</h2><p>Sicrano Pereira Costa</p>
    </main></body></html>`;

    // Act
    const c = extrairConteudo(html, "https://x.gov.br/autoridades");

    // Assert
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal Silva", "Beltrano de Souza Lima", "Sicrano Pereira Costa"]);
    expect(c.pessoas.every((p) => p.cargo === undefined)).toBe(true);
  });

  test("título com cara de nome depois de uma lista não herda a última linha da seção anterior", () => {
    // Arrange: o desenho do TCU. Dois cargos depois do nome contra dois "antes" por acaso;
    // "Primeira Câmara" (h2) logo abaixo da linha do último substituto (lida como cargo)
    // seria o terceiro "antes" e viraria a página, trocando os cargos de dono.
    const html = `<html><body><main>
      <p>Fulano de Tal Silva</p><p>Presidente</p>
      <p>Beltrano de Souza Lima</p><p>Vice-Presidente</p>
      <p>Cicrano Alves Duarte</p>
      <h2>Substitutos</h2>
      <p>Ministro-Substituto Weder de Oliveira</p>
      <h2>Primeira Câmara</h2>
    </main></body></html>`;

    // Act
    const c = extrairConteudo(html, "https://x.gov.br/autoridades");

    // Assert
    expect(c.pessoas.find((p) => p.nome === "Fulano de Tal Silva")?.cargo).toBe("Presidente");
    expect(c.pessoas.find((p) => p.nome === "Beltrano de Souza Lima")?.cargo).toBe("Vice-Presidente");
    expect(c.pessoas.find((p) => p.nome === "Cicrano Alves Duarte")?.cargo).toBeUndefined();
    expect(c.pessoas.find((p) => p.nome === "Primeira Câmara")?.cargo).toBeUndefined();
  });
});
