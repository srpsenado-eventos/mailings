import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extrairConteudo, raspar, ScrapeError } from "@/lib/scrape";

const html = readFileSync(resolve(__dirname, "fixtures/orgao-exemplo.html"), "utf-8");

/** Resposta fake no formato mínimo que `raspar` consome. */
function respostaOk(corpo: string) {
  return { ok: true, status: 200, text: async () => corpo };
}
function respostaErro(status: number) {
  return { ok: false, status, text: async () => "" };
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
