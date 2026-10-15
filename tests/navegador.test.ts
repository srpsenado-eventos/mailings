import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  abrirSessao,
  localizarChrome,
  rasparComNavegador,
  MOTIVO_NAVEGADOR_AUSENTE,
  MOTIVO_NAVEGADOR_TEMPO,
  type Lancador,
  type ModoLancamento,
  type PaginaNavegador,
} from "@/lib/navegador";
import { ScrapeError } from "@/lib/scrape";

const HTML = `<html><body><main>
  <ul>
    <li><span>Ministro Fulano de Tal Silva</span><span>Presidente</span></li>
    <li><span>Ministra Beltrana Souza Lima</span><span>Vice-Presidente</span></li>
  </ul></main></body></html>`;

/** Lançador falso: devolve o HTML dado e anota se foi fechado. */
function lancadorFalso(html: string, atraso = 0) {
  const estado = { lancado: false, fechado: false, urlPedida: "" };
  const lancar: Lancador = async () => {
    estado.lancado = true;
    const pagina: PaginaNavegador = {
      async conteudo(url) {
        estado.urlPedida = url;
        if (atraso > 0) await new Promise((r) => setTimeout(r, atraso));
        return html;
      },
      async fechar() { estado.fechado = true; },
    };
    return pagina;
  };
  return { lancar, estado };
}

const existeSempre = () => true;
/** `ProcessEnv` do Next exige NODE_ENV; os testes só querem um ambiente controlado. */
const ENV_VAZIO = {} as NodeJS.ProcessEnv;
const envCom = (chrome: string) => ({ ...ENV_VAZIO, FISCAL_CHROME: chrome });

describe("localizarChrome", () => {
  test("FISCAL_CHROME vence quando o arquivo existe", () => {
    expect(localizarChrome(envCom("D:/chrome/chrome.exe"), (c) => c === "D:/chrome/chrome.exe")).toBe("D:/chrome/chrome.exe");
  });

  test("sem a variável, o primeiro caminho padrão que existe", () => {
    const existe = (c: string) => c.includes("Program Files (x86)");
    const resultado = localizarChrome(ENV_VAZIO, existe);
    expect(resultado).toBe(path.win32.join("C:\\Program Files (x86)", "Google", "Chrome", "Application", "chrome.exe"));
    expect(resultado).toMatch(/^C:\\Program Files \(x86\)\\Google\\Chrome\\Application\\chrome\.exe$/);
  });

  test("sem a variável nem Program Files, usa a instalação por usuário em LOCALAPPDATA", () => {
    const env = { ...ENV_VAZIO, LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" };
    const resultado = localizarChrome(env, (c) => c.startsWith("C:\\Users\\x\\"));
    expect(resultado).toBe(path.win32.join("C:\\Users\\x\\AppData\\Local", "Google", "Chrome", "Application", "chrome.exe"));
  });

  test("nenhum caminho existe → undefined (variável apontando para arquivo inexistente também não vale)", () => {
    expect(localizarChrome(envCom("X:/nada.exe"), () => false)).toBeUndefined();
    expect(localizarChrome(ENV_VAZIO, () => false)).toBeUndefined();
  });
});

describe("rasparComNavegador", () => {
  test("lança o Chrome, pede a URL do catálogo e passa o HTML montado pelo extrator padrão", async () => {
    const { lancar, estado } = lancadorFalso(HTML);
    const c = await rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: ENV_VAZIO });
    expect(estado.urlPedida).toBe("https://portal.tcu.gov.br/autoridades");
    expect(c.url).toBe("https://portal.tcu.gov.br/autoridades");
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal Silva", "Beltrana Souza Lima"]);
    expect(c.pessoas[0].cargo).toBe("Presidente");
    expect(c.pessoas[1].cargo).toBe("Vice-Presidente");
    await new Promise((r) => setTimeout(r, 0));
    expect(estado.fechado).toBe(true);
  });

  test("sem Chrome: ScrapeError com o motivo exato e o lançador nunca é chamado", async () => {
    const { lancar, estado } = lancadorFalso(HTML);
    await expect(rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: () => false, env: ENV_VAZIO }))
      .rejects.toMatchObject({ name: "ScrapeError", motivo: MOTIVO_NAVEGADOR_AUSENTE });
    expect(estado.lancado).toBe(false);
  });

  test("página que não termina: estoura no teto, fecha o navegador e diz o motivo exato", async () => {
    const { lancar, estado } = lancadorFalso(HTML, 500);
    await expect(rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: ENV_VAZIO, timeoutMs: 20 }))
      .rejects.toMatchObject({ name: "ScrapeError", motivo: MOTIVO_NAVEGADOR_TEMPO });
    await new Promise((r) => setTimeout(r, 0));
    expect(estado.fechado).toBe(true);
  });

  test("lançamento que passa do teto: rejeita com o motivo exato e fecha o navegador quando ele sobe", async () => {
    const fechar = vi.fn(async () => undefined);
    const lancar: Lancador = async () => {
      await new Promise((r) => setTimeout(r, 300));
      return { conteudo: async () => HTML, fechar };
    };
    await expect(rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: ENV_VAZIO, timeoutMs: 20 }))
      .rejects.toMatchObject({ name: "ScrapeError", motivo: MOTIVO_NAVEGADOR_TEMPO });
    await new Promise((r) => setTimeout(r, 400));
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  test("HTML vazio é falha, como no fetch", async () => {
    const { lancar } = lancadorFalso("   ");
    await expect(rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: ENV_VAZIO }))
      .rejects.toMatchObject({ name: "ScrapeError", motivo: "HTML vazio" });
  });

  test("erro do lançador vira ScrapeError com a mensagem, e o navegador não fica aberto", async () => {
    const fechar = vi.fn(async () => undefined);
    const lancar: Lancador = async () => ({ conteudo: async () => { throw new Error("net::ERR_NAME_NOT_RESOLVED"); }, fechar });
    const erro = await rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: ENV_VAZIO }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ScrapeError);
    expect((erro as ScrapeError).motivo).toBe("net::ERR_NAME_NOT_RESOLVED");
    await new Promise((r) => setTimeout(r, 0));
    expect(fechar).toHaveBeenCalledTimes(1);
  });

  test("com `tabela`, usa a extração tabular", async () => {
    const htmlTabela = `<html><body><table>
      <tr><th>Nome</th><th>Partido</th><th>UF</th></tr>
      <tr><td>Fulano de Tal Silva</td><td>XX</td><td>DF</td></tr>
    </table></body></html>`;
    const { lancar } = lancadorFalso(htmlTabela);
    const c = await rasparComNavegador("https://x.gov.br/lista", {
      lancar, existe: existeSempre, env: ENV_VAZIO,
      tabela: { colunas: { nome: 0, uf: 2 } },
    });
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal Silva"]);
    expect(c.pessoas[0].uf).toBe("DF");
  });
});

/** Lançador falso de sessão: anota o modo, as URLs na ordem e se fechou; devolve o HTML por URL. */
function lancadorDeSessao(htmlPorUrl: Record<string, string | (() => Promise<string>)>) {
  const estado = { lancamentos: 0, modo: undefined as ModoLancamento | undefined, urls: [] as string[], fechado: false, emAndamento: 0, maxEmAndamento: 0 };
  const lancar: Lancador = async (_caminho, modo) => {
    estado.lancamentos += 1;
    estado.modo = modo;
    return {
      async conteudo(url) {
        estado.urls.push(url);
        estado.emAndamento += 1;
        estado.maxEmAndamento = Math.max(estado.maxEmAndamento, estado.emAndamento);
        try {
          const h = htmlPorUrl[url];
          if (h === undefined) throw new Error("net::ERR_FAILED");
          return typeof h === "function" ? await h() : h;
        } finally {
          estado.emAndamento -= 1;
        }
      },
      async fechar() { estado.fechado = true; },
    };
  };
  return { lancar, estado };
}

describe("abrirSessao (Chrome com janela, spec 2026-10-15 §4.2)", () => {
  test("lança o Chrome uma vez, com janela, só no primeiro raspar, e lê as páginas uma por vez na ordem", async () => {
    const lento = () => new Promise<string>((r) => setTimeout(() => r(HTML), 20));
    const { lancar, estado } = lancadorDeSessao({ "https://www.gov.br/a": lento, "https://www.gov.br/b": HTML });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    expect(estado.lancamentos).toBe(0);
    const [a, b] = await Promise.all([sessao.raspar("https://www.gov.br/a"), sessao.raspar("https://www.gov.br/b")]);
    expect(estado.lancamentos).toBe(1);
    expect(estado.modo).toEqual({ janela: true });
    expect(estado.urls).toEqual(["https://www.gov.br/a", "https://www.gov.br/b"]);
    expect(estado.maxEmAndamento).toBe(1);
    expect(a.pessoas.length).toBeGreaterThan(0);
    expect(b.url).toBe("https://www.gov.br/b");
    await sessao.fechar();
    expect(estado.fechado).toBe(true);
  });

  test("falha de uma página vira ScrapeError com o motivo e não derruba a seguinte", async () => {
    const { lancar } = lancadorDeSessao({ "https://www.gov.br/ok": HTML });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await expect(sessao.raspar("https://www.gov.br/falha")).rejects.toMatchObject({ motivo: "net::ERR_FAILED" });
    const ok = await sessao.raspar("https://www.gov.br/ok");
    expect(ok.pessoas.length).toBeGreaterThan(0);
    await sessao.fechar();
  });

  test("página com status de erro (HTTP 404) vira ScrapeError com o motivo 'HTTP 404'", async () => {
    const fechar = vi.fn(async () => undefined);
    const lancar: Lancador = async () => ({ conteudo: async () => { throw new Error("HTTP 404"); }, fechar });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await expect(sessao.raspar("https://www.gov.br/sumiu")).rejects.toMatchObject({ name: "ScrapeError", motivo: "HTTP 404" });
    await sessao.fechar();
  });

  test("página que estoura o teto sai 'navegador: tempo esgotado' e a sessão continua", async () => {
    const eterna = () => new Promise<string>(() => undefined);
    const { lancar } = lancadorDeSessao({ "https://www.gov.br/lenta": eterna, "https://www.gov.br/ok": HTML });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar, timeoutMs: 30 });
    await expect(sessao.raspar("https://www.gov.br/lenta")).rejects.toMatchObject({ motivo: MOTIVO_NAVEGADOR_TEMPO });
    expect((await sessao.raspar("https://www.gov.br/ok")).pessoas.length).toBeGreaterThan(0);
    await sessao.fechar();
  });

  test("HTML vazio é ScrapeError('HTML vazio')", async () => {
    const { lancar } = lancadorDeSessao({ "https://www.gov.br/vazia": "   " });
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await expect(sessao.raspar("https://www.gov.br/vazia")).rejects.toMatchObject({ motivo: "HTML vazio" });
    await sessao.fechar();
  });

  test("sem Chrome, cada raspar falha com navegador ausente, nada é lançado e fechar não lança", async () => {
    const { lancar, estado } = lancadorDeSessao({ "https://www.gov.br/a": HTML });
    const sessao = abrirSessao({ env: ENV_VAZIO, existe: () => false, lancar });
    await expect(sessao.raspar("https://www.gov.br/a")).rejects.toMatchObject({ motivo: MOTIVO_NAVEGADOR_AUSENTE });
    await expect(sessao.raspar("https://www.gov.br/a")).rejects.toMatchObject({ motivo: MOTIVO_NAVEGADOR_AUSENTE });
    expect(estado.lancamentos).toBe(0);
    await expect(sessao.fechar()).resolves.toBeUndefined();
  });

  test("Chrome que não sobe: cada raspar falha com a mensagem do lançamento, fechar não lança", async () => {
    const lancar: Lancador = async () => { throw new Error("spawn EACCES"); };
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await expect(sessao.raspar("https://www.gov.br/a")).rejects.toMatchObject({ motivo: "spawn EACCES" });
    await expect(sessao.fechar()).resolves.toBeUndefined();
  });

  test("fechar sem nenhum raspar não lança e não lança o Chrome", async () => {
    const { lancar, estado } = lancadorDeSessao({});
    const sessao = abrirSessao({ env: envCom("D:/chrome.exe"), existe: existeSempre, lancar });
    await sessao.fechar();
    expect(estado.lancamentos).toBe(0);
  });
});
