import { beforeEach, describe, expect, test, vi } from "vitest";
import { comRepeticao, ehFalhaTransitoria, ESPERAS_REPETICAO_MS, MOTIVO_SESSAO_AUSENTE, RASPADORES_PADRAO, rasparFonte, type Raspadores } from "@/lib/raspagem";
import { ScrapeError } from "@/lib/scrape";
import { MIN_TEXTO_PAGINA_INDIVIDUAL } from "@/lib/match";
import type { ConteudoFonte, FonteCatalogo } from "@/lib/types";

const vazio = (url: string): ConteudoFonte => ({ url, textoLimpo: "", destaques: [], pessoas: [] });

function raspadoresFalsos(): Raspadores & {
  porFetch: ReturnType<typeof vi.fn>;
  porNavegador: ReturnType<typeof vi.fn>;
  porJanela: ReturnType<typeof vi.fn>;
} {
  return {
    porFetch: vi.fn(async (url: string) => vazio(url)),
    porNavegador: vi.fn(async (url: string) => vazio(url)),
    porJanela: vi.fn(async (url: string) => vazio(url)),
  };
}

describe("rasparFonte escolhe o caminho pela fonte do catálogo", () => {
  test("fonte comum vai pelo fetch, com a extração que ela declara", async () => {
    const r = raspadoresFalsos();
    const fonte: FonteCatalogo = { url: "https://x.gov.br/lista", ativo: true, tabela: { colunas: { nome: 0 } } };
    await rasparFonte(fonte, r);
    expect(r.porFetch).toHaveBeenCalledWith("https://x.gov.br/lista", { tabela: fonte.tabela });
    expect(r.porNavegador).not.toHaveBeenCalled();
  });

  test("marcador e tipo chegam ao fetch em `opcoes`; ausentes na fonte, ficam ausentes", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://tst.jus.br/orgaos", marcador: { textos: ["(convocado)", "(convocada)"] } }, r);
    expect(r.porFetch).toHaveBeenLastCalledWith("https://tst.jus.br/orgaos", { marcador: ["(convocado)", "(convocada)"] });
    await rasparFonte({ url: "https://stj.jus.br/lista.pdf", tipo: "pdf" }, r);
    expect(r.porFetch).toHaveBeenLastCalledWith("https://stj.jus.br/lista.pdf", { tipo: "pdf" });
    await rasparFonte({ url: "https://a.gov.br/lista" }, r);
    const opcoes = r.porFetch.mock.calls.at(-1)?.[1];
    expect(opcoes).toEqual({});
    expect(opcoes).not.toHaveProperty("marcador");
    expect(opcoes).not.toHaveProperty("tipo");
  });

  test("nomeEmDestaque chega ao fetch em `opcoes` (spec 2026-10-30 §3.1)", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1", nomeEmDestaque: true }, r);
    expect(r.porFetch).toHaveBeenLastCalledWith("https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1", { nomeEmDestaque: true });
  });

  test("fonte com navegador vai pelo Chrome e nunca pelo fetch", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades", navegador: true }, r);
    expect(r.porNavegador).toHaveBeenCalledWith("https://portal.tcu.gov.br/autoridades", {});
    expect(r.porFetch).not.toHaveBeenCalled();
  });

  test("só a URL cadastrada chega ao navegador (nenhuma transformação)", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades?x=1", navegador: true }, r);
    expect(r.porNavegador.mock.calls[0][0]).toBe("https://portal.tcu.gov.br/autoridades?x=1");
  });

  test("fonte 'janela' vai pela sessão com janela, nunca pelo headless nem pelo fetch", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://www.gov.br/planalto/lista", navegador: "janela" }, r);
    expect(r.porJanela).toHaveBeenCalledWith("https://www.gov.br/planalto/lista", {});
    expect(r.porNavegador).not.toHaveBeenCalled();
    expect(r.porFetch).not.toHaveBeenCalled();
  });

  test("fonte individual (sem `ativo` nem `tabela`) é legível pelo mesmo caminho", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://go.gov.br/governador" }, r);
    expect(r.porFetch).toHaveBeenCalledWith("https://go.gov.br/governador", {});
  });

  test("sem sessão aberta, fonte 'janela' falha com ScrapeError claro (RASPADORES_PADRAO)", async () => {
    await expect(rasparFonte({ url: "https://www.gov.br/x", navegador: "janela" }, { ...RASPADORES_PADRAO, porFetch: vi.fn(), porNavegador: vi.fn() }))
      .rejects.toMatchObject({ motivo: MOTIVO_SESSAO_AUSENTE });
  });
});

const comConteudo = (url: string): ConteudoFonte => ({ url, textoLimpo: "x".repeat(MIN_TEXTO_PAGINA_INDIVIDUAL), destaques: [], pessoas: [{ nome: "Ana Maria Política Completa" }] });

describe("HTTP 403 ao fetch vai para a janela (spec 2026-10-23 §3.1)", () => {
  test("fetch 403 → a mesma URL é lida pela janela e o conteúdo da janela vale", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://portal.stf.jus.br/x", "HTTP 403"));
    r.porJanela.mockResolvedValue(comConteudo("https://portal.stf.jus.br/x"));
    const c = await rasparFonte({ url: "https://portal.stf.jus.br/x", tabela: { colunas: { nome: 0 } } }, r);
    expect(c.pessoas).toHaveLength(1);
    expect(r.porJanela).toHaveBeenCalledWith("https://portal.stf.jus.br/x", { tabela: { colunas: { nome: 0 } } });
  });
  test("fetch 403 de fonte com nome em destaque: a janela recebe a marca", async () => {
    const r = raspadoresFalsos();
    const url = "https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1";
    r.porFetch.mockRejectedValue(new ScrapeError(url, "HTTP 403"));
    r.porJanela.mockResolvedValue(comConteudo(url));
    await rasparFonte({ url, nomeEmDestaque: true }, r);
    expect(r.porJanela).toHaveBeenCalledWith(url, { nomeEmDestaque: true });
  });
  test("fetch 401 também vai para a janela; 404 e 500 não", async () => {
    for (const [motivo, vaiParaJanela] of [["HTTP 401", true], ["HTTP 404", false], ["HTTP 500", false]] as const) {
      const r = raspadoresFalsos();
      r.porFetch.mockRejectedValue(new ScrapeError("https://a.gov.br", motivo));
      r.porJanela.mockResolvedValue(comConteudo("https://a.gov.br"));
      await rasparFonte({ url: "https://a.gov.br" }, r).catch(() => undefined);
      expect(r.porJanela.mock.calls.length > 0).toBe(vaiParaJanela);
    }
  });
  test("janela que também falha → vale o erro do fetch (HTTP 403), não o da janela", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://a.gov.br", "HTTP 403"));
    r.porJanela.mockRejectedValue(new ScrapeError("https://a.gov.br", MOTIVO_SESSAO_AUSENTE));
    await expect(rasparFonte({ url: "https://a.gov.br" }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
  });
  test("janela sem conteúdo legível (CAPTCHA) devolve o erro do fetch", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://a.gov.br", "HTTP 403"));
    r.porJanela.mockResolvedValue({ url: "https://a.gov.br", textoLimpo: "What code is in the image?", destaques: [], pessoas: [] });
    await expect(rasparFonte({ url: "https://a.gov.br" }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
  });
  test("fonte com marcador e 403: vale o erro do fetch, a janela não é chamada (ela ignora o marcador)", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://tst.jus.br/orgaos", "HTTP 403"));
    r.porJanela.mockResolvedValue(comConteudo("https://tst.jus.br/orgaos"));
    await expect(rasparFonte({ url: "https://tst.jus.br/orgaos", marcador: { textos: ["(convocado)"] } }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
    expect(r.porJanela).not.toHaveBeenCalled();
  });
  test("fonte PDF e 403: vale o erro do fetch, a janela não é chamada (ela não lê PDF)", async () => {
    const r = raspadoresFalsos();
    r.porFetch.mockRejectedValue(new ScrapeError("https://stj.jus.br/lista.pdf", "HTTP 403"));
    r.porJanela.mockResolvedValue(comConteudo("https://stj.jus.br/lista.pdf"));
    await expect(rasparFonte({ url: "https://stj.jus.br/lista.pdf", tipo: "pdf" }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
    expect(r.porJanela).not.toHaveBeenCalled();
  });
  test("fonte com navegador (headless) nunca passa pela janela", async () => {
    const r = raspadoresFalsos();
    r.porNavegador.mockRejectedValue(new ScrapeError("https://portal.tcu.gov.br/autoridades", "HTTP 403"));
    await expect(rasparFonte({ url: "https://portal.tcu.gov.br/autoridades", navegador: true }, r)).rejects.toMatchObject({ motivo: "HTTP 403" });
    expect(r.porJanela).not.toHaveBeenCalled();
  });
});

describe("comRepeticao (spec 2026-10-23 §3.2)", () => {
  const esperas: number[] = [];
  const esperar = async (ms: number) => { esperas.push(ms); };
  beforeEach(() => { esperas.length = 0; });
  const fonte = { url: "https://a.gov.br" };

  test("esperas são 30 s e 120 s", () => {
    expect(ESPERAS_REPETICAO_MS).toEqual([30_000, 120_000]);
  });
  test("429 duas vezes e sucesso na terceira: devolve o conteúdo, esperando 30 s e depois 120 s", async () => {
    const raspar = vi.fn()
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 429"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 429"))
      .mockResolvedValueOnce(vazio(fonte.url));
    const c = await comRepeticao(raspar, { esperar })(fonte);
    expect(c.url).toBe(fonte.url);
    expect(raspar).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([30_000, 120_000]);
  });
  test("três falhas transitórias: o motivo é o da última tentativa com o sufixo (3 tentativas)", async () => {
    const raspar = vi.fn()
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 503"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 503"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "navegador: tempo esgotado"));
    await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toMatchObject({ motivo: "navegador: tempo esgotado (3 tentativas)" });
  });
  test("404, 403, HTML vazio e navegador ausente não são repetidos: uma tentativa, sem sufixo", async () => {
    for (const motivo of ["HTTP 404", "HTTP 403", "HTML vazio", "navegador não encontrado", "página individual sem conteúdo legível (CAPTCHA ou só menu)"]) {
      const raspar = vi.fn().mockRejectedValue(new ScrapeError(fonte.url, motivo));
      await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toMatchObject({ motivo });
      expect(raspar).toHaveBeenCalledTimes(1);
    }
    expect(esperas).toEqual([]);
  });
  test("falha não transitória na segunda tentativa interrompe, com o sufixo (2 tentativas)", async () => {
    const raspar = vi.fn()
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 429"))
      .mockRejectedValueOnce(new ScrapeError(fonte.url, "HTTP 404"));
    await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toMatchObject({ motivo: "HTTP 404 (2 tentativas)" });
    expect(esperas).toEqual([30_000]);
  });
  test("fonte 'janela' não é repetida pelo envoltório", async () => {
    const raspar = vi.fn().mockRejectedValue(new ScrapeError(fonte.url, "HTTP 429"));
    await expect(comRepeticao(raspar, { esperar })({ ...fonte, navegador: "janela" })).rejects.toMatchObject({ motivo: "HTTP 429" });
    expect(raspar).toHaveBeenCalledTimes(1);
  });
  test("erro que não é ScrapeError sobe sem repetição", async () => {
    const raspar = vi.fn().mockRejectedValue(new TypeError("boom"));
    await expect(comRepeticao(raspar, { esperar })(fonte)).rejects.toBeInstanceOf(TypeError);
    expect(raspar).toHaveBeenCalledTimes(1);
  });
  test("ehFalhaTransitoria", () => {
    for (const m of ["HTTP 429", "HTTP 500", "HTTP 503", "navegador: tempo esgotado", "This operation was aborted", "fetch failed", "ECONNRESET", "HTTP 429 (3 tentativas)"]) expect(ehFalhaTransitoria(m)).toBe(true);
    for (const m of ["HTTP 403", "HTTP 401", "HTTP 404", "HTML vazio", "navegador não encontrado", "sessão do navegador com janela não aberta"]) expect(ehFalhaTransitoria(m)).toBe(false);
  });
});
