import { describe, expect, test, vi } from "vitest";
import {
  localizarChrome,
  rasparComNavegador,
  MOTIVO_NAVEGADOR_AUSENTE,
  MOTIVO_NAVEGADOR_TEMPO,
  type Lancador,
  type PaginaNavegador,
} from "@/lib/navegador";
import { ScrapeError } from "@/lib/scrape";

const HTML = `<html><body><main>
  <h2>Ministros</h2>
  <ul>
    <li><span>Ministro Fulano de Tal Silva</span><span>Presidente</span></li>
    <li><span>Ministra Beltrana Souza Lima</span></li>
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
    expect(localizarChrome(ENV_VAZIO, existe)).toBe("C:\Program Files (x86)\Google\Chrome\Application\chrome.exe");
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
    expect(c.pessoas[0].cargo).toBe("Ministros");
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
    expect(estado.fechado).toBe(true);
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
