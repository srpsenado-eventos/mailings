# Plano B: TCU por navegador — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fonte do TCU (lista montada por JavaScript) passa a ser lida pelo Chrome instalado nesta máquina, e os 8 ministros do TCU saem de "não verificado" sem nenhum veredito falso.

**Architecture:** Uma fonte do catálogo marcada `navegador: true` é raspada por `rasparComNavegador` (`lib/navegador.ts`, `puppeteer-core` sobre o Chrome local, sem janela, teto de 30 s), que devolve o HTML montado ao **mesmo** `extrairConteudo` de hoje. A escolha fetch × navegador fica numa função pura `rasparFonte` (`lib/raspagem.ts`), injetada na rota como `deps.raspar`; nenhum teste abre navegador. O extrator ganha uma regra estreita: em página com cargo abaixo do nome, um título (`h1`..`h6`) encerra a janela do cargo, para o título da seção seguinte não virar cargo do último da lista.

**Tech Stack:** TypeScript, Next.js 15, Vitest, cheerio. **Dependência nova:** `puppeteer-core` (registrada no spec §5 e §8).

**Spec:** `docs/superpowers/specs/2026-10-02-ajustes-do-painel-genero-tcu-publicacao.md`, §5 (Plano B), §7 (falhas) e §8 (regras que mudam). Leia antes de começar.

## Global Constraints

- `lib/*.ts` puros, imutáveis, sem `any`, sem `console.*`. UI sem lógica de negócio. A rota `/api/analise` só injeta dependências; não é testada diretamente.
- **Regra de ouro:** página ilegível, Chrome ausente ou tempo esgotado viram `ScrapeError` → o orquestrador marca **indeterminado / fonte inacessível**, nunca "possível saída". `lib/analise.ts`, `lib/match.ts`, `lib/tratamento.ts`, `lib/painel.ts`, `lib/export.ts` **não são tocados**.
- Só URL do catálogo entra no navegador: `rasparFonte` recebe `FonteCatalogo`; nunca URL de busca, de IA ou de input.
- Chrome: `FISCAL_CHROME` em `.env.local`; sem a variável, os caminhos padrão do Windows. Sem Chrome: `ScrapeError` com motivo exato `navegador não encontrado`. Teto de **30 s** por página; estouro: `ScrapeError` com motivo exato `navegador: tempo esgotado`.
- Nenhum teste abre navegador: o lançador é injetado. Sem internet nos testes.
- Textos em português do Brasil, sem travessão no lugar de vírgula. Comentários e nomes de teste em português, AAA.
- npm: `npm test`, `npm run typecheck`, `npm run build`. Não commitar `PROXIMA_SESSAO*.md`, `.fiscal/`, pnpm, `.xlsx`, `.superpowers/`.
- Commit: conventional commit em português, trailer exato `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Branch: `feat/tcu-por-navegador`, criada sobre `feat/ajustes-painel` (HEAD `7b3380d`).

## Review Focus

1. **Título da seção seguinte não vira cargo** do último nome de uma lista com cargo abaixo do nome ("Rodrigo Otavio Soares Pacheco" + `h2` "Ministros-Substitutos" → cargo vazio). → Task 2, Step 1.
2. **O STM continua lendo o cargo publicado em `h5` ACIMA do nome** (orientação "antes" não muda). → Task 2, Step 3 (o teste existente "adota o cargo publicado ACIMA do nome" tem que seguir verde sem alteração).
3. **Chrome ausente**: `lancar` nunca é chamado, `ScrapeError("navegador não encontrado")`, e o orquestrador trata como fonte inacessível. → Task 1, Step 1; Task 3, Step 1 (teste de `analisar` com `raspar` lançando esse erro).
4. **Página que não termina de carregar**: estoura em `timeoutMs`, o navegador é fechado mesmo assim, motivo `navegador: tempo esgotado`. → Task 1, Step 1.
5. **Fonte sem `navegador`** continua pelo `fetch` (nada muda para as outras 23 fontes), e a fonte com `navegador` nunca cai no `fetch`. → Task 3, Step 1.

---

### Task 1: `lib/navegador.ts` — Chrome local por `puppeteer-core`

**Files:**
- Create: `lib/navegador.ts`
- Modify: `package.json` (dependência `puppeteer-core`), `next.config.ts` (`serverExternalPackages`), `.env.example` (`FISCAL_CHROME`)
- Test: `tests/navegador.test.ts` (novo)

**Interfaces:**
- Produces:
  ```ts
  export const MOTIVO_NAVEGADOR_AUSENTE = "navegador não encontrado";
  export const MOTIVO_NAVEGADOR_TEMPO = "navegador: tempo esgotado";
  export const TETO_NAVEGADOR_MS = 30_000;
  export interface PaginaNavegador { conteudo(url: string, timeoutMs: number): Promise<string>; fechar(): Promise<void> }
  export type Lancador = (caminhoChrome: string) => Promise<PaginaNavegador>;
  export interface OpcoesNavegador { timeoutMs?: number; tabela?: ExtracaoTabela; env?: NodeJS.ProcessEnv; existe?: (caminho: string) => boolean; lancar?: Lancador }
  export function localizarChrome(env?: NodeJS.ProcessEnv, existe?: (caminho: string) => boolean): string | undefined
  export async function rasparComNavegador(url: string, opcoes?: OpcoesNavegador): Promise<ConteudoFonte>
  ```
- Consumes: `extrairConteudo`, `extrairTabela`, `ScrapeError` de `@/lib/scrape`; `ConteudoFonte`, `ExtracaoTabela` de `@/lib/types`.

- [ ] **Step 1: Testes que falham**

`tests/navegador.test.ts`:

```ts
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

describe("localizarChrome", () => {
  test("FISCAL_CHROME vence quando o arquivo existe", () => {
    expect(localizarChrome({ FISCAL_CHROME: "D:/chrome/chrome.exe" }, (c) => c === "D:/chrome/chrome.exe")).toBe("D:/chrome/chrome.exe");
  });

  test("sem a variável, o primeiro caminho padrão que existe", () => {
    const existe = (c: string) => c.includes("Program Files (x86)");
    expect(localizarChrome({}, existe)).toBe("C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");
  });

  test("nenhum caminho existe → undefined (variável apontando para arquivo inexistente também não vale)", () => {
    expect(localizarChrome({ FISCAL_CHROME: "X:/nada.exe" }, () => false)).toBeUndefined();
    expect(localizarChrome({}, () => false)).toBeUndefined();
  });
});

describe("rasparComNavegador", () => {
  test("lança o Chrome, pede a URL do catálogo e passa o HTML montado pelo extrator padrão", async () => {
    const { lancar, estado } = lancadorFalso(HTML);
    const c = await rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: {} });
    expect(estado.urlPedida).toBe("https://portal.tcu.gov.br/autoridades");
    expect(c.url).toBe("https://portal.tcu.gov.br/autoridades");
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal Silva", "Beltrana Souza Lima"]);
    expect(c.pessoas[0].cargo).toBe("Presidente");
    expect(estado.fechado).toBe(true);
  });

  test("sem Chrome: ScrapeError com o motivo exato e o lançador nunca é chamado", async () => {
    const { lancar, estado } = lancadorFalso(HTML);
    await expect(rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: () => false, env: {} }))
      .rejects.toMatchObject({ name: "ScrapeError", motivo: MOTIVO_NAVEGADOR_AUSENTE });
    expect(estado.lancado).toBe(false);
  });

  test("página que não termina: estoura no teto, fecha o navegador e diz o motivo exato", async () => {
    const { lancar, estado } = lancadorFalso(HTML, 500);
    await expect(rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: {}, timeoutMs: 20 }))
      .rejects.toMatchObject({ name: "ScrapeError", motivo: MOTIVO_NAVEGADOR_TEMPO });
    expect(estado.fechado).toBe(true);
  });

  test("HTML vazio é falha, como no fetch", async () => {
    const { lancar } = lancadorFalso("   ");
    await expect(rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: {} }))
      .rejects.toMatchObject({ name: "ScrapeError", motivo: "HTML vazio" });
  });

  test("erro do lançador vira ScrapeError com a mensagem, e o navegador não fica aberto", async () => {
    const fechar = vi.fn(async () => undefined);
    const lancar: Lancador = async () => ({ conteudo: async () => { throw new Error("net::ERR_NAME_NOT_RESOLVED"); }, fechar });
    const erro = await rasparComNavegador("https://portal.tcu.gov.br/autoridades", { lancar, existe: existeSempre, env: {} }).catch((e: unknown) => e);
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
      lancar, existe: existeSempre, env: {},
      tabela: { colunas: { nome: 0, uf: 2 } },
    });
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal Silva"]);
    expect(c.pessoas[0].uf).toBe("DF");
  });
});
```

(`ExtracaoTabela` é `{ indice?: number; colunas: { nome: number; uf?: number; motivo?: number }; secoes?: readonly string[] }`, em `lib/types.ts`. O que o teste pina é: com `tabela`, o caminho é `extrairTabela`, não `extrairConteudo`.)

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/navegador.test.ts`
Expected: FAIL (módulo `@/lib/navegador` não existe).

- [ ] **Step 3: Instale a dependência e registre o ambiente**

```bash
npm install puppeteer-core@^25
```

`next.config.ts`:

```ts
import type { NextConfig } from "next";
// puppeteer-core abre o Chrome local pelo processo do servidor; o bundler do Next não deve empacotá-lo.
const nextConfig: NextConfig = { serverExternalPackages: ["jsdom", "puppeteer-core"] };
export default nextConfig;
```

`.env.example`, no fim:

```
# -----------------------------------------------------------------------------
# Chrome local (OPCIONAL — fontes do catálogo marcadas `navegador: true`, caso TCU)
# -----------------------------------------------------------------------------
# Caminho do executável do Chrome usado para ler páginas montadas por JavaScript.
# Sem a variável, o app procura nos caminhos padrão do Windows (Program Files,
# Program Files (x86) e LocalAppData). Sem Chrome, a fonte sai "inacessível"
# com o motivo "navegador não encontrado"; nada mais muda.
# FISCAL_CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
```

- [ ] **Step 4: `lib/navegador.ts`**

```ts
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { extrairConteudo, extrairTabela, ScrapeError } from "@/lib/scrape";
import type { ConteudoFonte, ExtracaoTabela } from "@/lib/types";

/**
 * Leitura de fonte do catálogo marcada `navegador: true` (spec 2026-10-02, §5): abre o
 * Chrome instalado nesta máquina sem janela, carrega a página, espera a rede sossegar e
 * entrega o HTML montado ao MESMO extrator das outras fontes. Existe para a página do
 * TCU, cuja lista é montada por JavaScript e vinha vazia pelo `fetch`.
 *
 * Só URL do catálogo chega aqui. Toda falha vira `ScrapeError` com motivo técnico: o
 * orquestrador marca a fonte inacessível e ninguém vira "possível saída" (regra de ouro).
 * Nenhum teste abre navegador: o lançador é injetado por `OpcoesNavegador.lancar`.
 */

export const MOTIVO_NAVEGADOR_AUSENTE = "navegador não encontrado";
export const MOTIVO_NAVEGADOR_TEMPO = "navegador: tempo esgotado";
/** Teto por página. A do TCU carrega em poucos segundos; 30 s cobre rede lenta sem travar a varredura. */
export const TETO_NAVEGADOR_MS = 30_000;

/** Caminhos padrão do Chrome no Windows, na ordem de procura. */
const CAMINHOS_PADRAO = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
] as const;

/** Uma página aberta num navegador lançado: lê uma URL e fecha o navegador. */
export interface PaginaNavegador {
  conteudo(url: string, timeoutMs: number): Promise<string>;
  fechar(): Promise<void>;
}

export type Lancador = (caminhoChrome: string) => Promise<PaginaNavegador>;

export interface OpcoesNavegador {
  timeoutMs?: number;
  tabela?: ExtracaoTabela;
  env?: NodeJS.ProcessEnv;
  existe?: (caminho: string) => boolean;
  lancar?: Lancador;
}

/**
 * `FISCAL_CHROME` vence quando aponta para um arquivo que existe; senão os caminhos
 * padrão, inclusive a instalação por usuário em LocalAppData. Nada existindo, `undefined`.
 */
export function localizarChrome(
  env: NodeJS.ProcessEnv = process.env,
  existe: (caminho: string) => boolean = existsSync,
): string | undefined {
  const daVariavel = env.FISCAL_CHROME?.trim();
  if (daVariavel && existe(daVariavel)) return daVariavel;
  const porUsuario = env.LOCALAPPDATA ? [`${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`] : [];
  return [...CAMINHOS_PADRAO, ...porUsuario].find((caminho) => existe(caminho));
}

class TempoEsgotadoError extends Error {}

/** Rejeita com `TempoEsgotadoError` se `promessa` não resolver em `ms`. */
function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const teto = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TempoEsgotadoError()), ms);
  });
  return Promise.race([promessa, teto]).finally(() => clearTimeout(timer));
}

/** Lançador real: Chrome sem janela via puppeteer-core. Não coberto por teste (abre navegador). */
export const lancarChrome: Lancador = async (caminhoChrome) => {
  const browser = await puppeteer.launch({ executablePath: caminhoChrome, headless: true });
  return {
    async conteudo(url, timeoutMs) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle2", timeout: timeoutMs });
      return page.content();
    },
    async fechar() {
      await browser.close();
    },
  };
};

export async function rasparComNavegador(url: string, opcoes: OpcoesNavegador = {}): Promise<ConteudoFonte> {
  const timeoutMs = opcoes.timeoutMs ?? TETO_NAVEGADOR_MS;
  const caminho = localizarChrome(opcoes.env ?? process.env, opcoes.existe ?? existsSync);
  if (!caminho) throw new ScrapeError(url, MOTIVO_NAVEGADOR_AUSENTE);
  const lancar = opcoes.lancar ?? lancarChrome;

  let pagina: PaginaNavegador | undefined;
  try {
    // O teto cobre lançar + carregar: um Chrome que não sobe também é tempo esgotado.
    const html = await comTeto(
      (async () => {
        pagina = await lancar(caminho);
        return pagina.conteudo(url, timeoutMs);
      })(),
      timeoutMs,
    );
    if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
    return opcoes.tabela ? extrairTabela(html, url, opcoes.tabela) : extrairConteudo(html, url);
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    if (err instanceof TempoEsgotadoError) throw new ScrapeError(url, MOTIVO_NAVEGADOR_TEMPO);
    throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
  } finally {
    // Nunca deixar Chrome órfão: fecha mesmo em erro ou teto; falha ao fechar não muda o resultado.
    await pagina?.fechar().catch(() => undefined);
  }
}
```

Se o `import puppeteer from "puppeteer-core"` reclamar no typecheck, use `import puppeteer, { type Browser } from "puppeteer-core"` ou `import * as puppeteer from "puppeteer-core"` conforme o que o pacote exporta; o `tsconfig` já tem `esModuleInterop: true` e `moduleResolution: "bundler"`.

- [ ] **Step 5: Rode e confirme que passa**

Run: `npx vitest run tests/navegador.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 6: Rode tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: verde. O `build` é o que prova que `puppeteer-core` não quebra o empacotamento do servidor; se quebrar, reporte com a mensagem em vez de mexer na rota.

- [ ] **Step 7: Commit**

```bash
git add lib/navegador.ts tests/navegador.test.ts package.json package-lock.json next.config.ts .env.example
git commit -m "feat: leitura de fonte pelo Chrome local (puppeteer-core), com teto e motivo técnico

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Título encerra a janela do cargo + fixture do TCU

**Files:**
- Modify: `lib/scrape.ts` (`extrairLinhas`, `orientacaoDoCargo`, `indiceDoCargoDepois`, `segmentarPessoas`, `extrairConteudo`)
- Test: `tests/scrape.test.ts` (acrescentar), fixture `tests/fixtures/tcu-autoridades.html` (**já existe na árvore de trabalho, sem commit**; recorte real da página montada, colhido em 2026-10-02)

**Interfaces:**
- Assinaturas públicas iguais: `extrairConteudo(html, url)` e `extrairTabela(html, url, cfg)`.
- Interno: `extrairLinhas($)` passa a devolver `{ linhas: string[]; titulos: ReadonlySet<number> }`; `segmentarPessoas(linhas, titulos)`.

- [ ] **Step 1: Testes que falham**

No fim de `tests/scrape.test.ts` (o arquivo já importa `readFileSync`, `resolve` e `extrairConteudo`):

```ts
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
    // Hoje "Ministros" conta como cargo-antes do primeiro nome e, com "Presidente" entre
    // os dois nomes, a página inteira sai como cargo-acima: o primeiro leva "Ministros"
    // e o segundo rouba "Presidente".
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
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/scrape.test.ts`
Expected: FAIL em "o título 'Ministros-Substitutos' não vira cargo", "nada de 'novo' falso", "o título seguinte não é adotado como cargo" e "UM título de seção acima da lista não inverte a orientação". Os demais podem já passar.

- [ ] **Step 3: Implemente em `lib/scrape.ts`**

Acima de `extrairLinhas`:

```ts
/**
 * Marca interna de linha que veio de um título (h1..h6). Caractere de uso privado:
 * nunca aparece em página real, e sai do texto antes de qualquer uso.
 */
const MARCA_TITULO = "\uE000";
const TAGS_TITULO = "h1,h2,h3,h4,h5,h6";

interface LinhasDaPagina {
  linhas: string[];
  /** Índices, em `linhas`, das que vieram de um título. */
  titulos: ReadonlySet<number>;
}
```

Substitua `extrairLinhas` por:

```ts
/** Quebra o corpo em linhas limpas, inserindo separador entre blocos antes do .text(). */
function extrairLinhas($: RaizCheerio): LinhasDaPagina {
  // Título vira texto plano marcado ANTES dos separadores: um `<a>` dentro do h2 geraria
  // "\n" entre a marca e o texto e a linha do título ficaria vazia.
  $(TAGS_TITULO).each((_, el) => {
    const alvo = $(el);
    alvo.text(MARCA_TITULO + alvo.text());
  });
  $("br").replaceWith("\n");
  $(TAGS_SEPARAR).each((_, el) => {
    $(el).prepend("\n").append("\n");
  });
  const linhas: string[] = [];
  const titulos = new Set<number>();
  for (const bruta of $("body").text().split("\n")) {
    const ehTitulo = bruta.includes(MARCA_TITULO);
    const linha = bruta.replace(MARCA_TITULO, "").replace(/\s+/g, " ").trim();
    if (linha.length === 0) continue;
    if (ehTitulo) titulos.add(linhas.length);
    linhas.push(linha);
  }
  return { linhas, titulos };
}
```

Substitua o tipo `OrientacaoDoCargo` e a função `orientacaoDoCargo` por:

```ts
/** De que lado da linha do nome a página publica o cargo. */
type OrientacaoDoCargo = "depois" | "antes";

/**
 * Como a página publica o cargo, medido nela mesma. Um título (h1..h6) logo antes de UM
 * nome é título de seção ("Ministros" acima da lista do TCU) e não conta como cargo; só
 * quando a página repete o título antes de cada nome (o STM publica o cargo em `h5`,
 * e o nome em `h6`) o título é o próprio cargo, e então vale como tal.
 */
interface LeituraDeCargo {
  orientacao: OrientacaoDoCargo;
  /** A página publica o cargo como título repetido acima do nome (STM). */
  tituloEhCargo: boolean;
}

/** Quantos títulos-cargo antes de nomes a página precisa ter para o título contar como cargo. */
const MIN_TITULOS_CARGO = 2;

/**
 * Mede a própria página antes de montar as pessoas. STF, STJ, STM, TST, TSE,
 * Câmara e Defensoria põem o nome primeiro e o cargo embaixo; a página de
 * Ministros de Estado do Planalto faz o contrário — o cargo em negrito e o nome
 * recuado na linha seguinte. Olhando só para frente, cada ministro herdava o
 * cargo do ministro SEGUINTE, e um homem chegava a sair rotulado "Ministra".
 * Vence o padrão majoritário da página; empate ou nenhuma adjacência mantém
 * "depois", que é o comportamento já validado pelas outras fontes.
 * Título nunca conta como cargo "depois"; como cargo "antes", só quando se repete.
 */
function orientacaoDoCargo(linhas: string[], titulos: ReadonlySet<number>): LeituraDeCargo {
  let antes = 0;
  let antesPorTitulo = 0;
  let depois = 0;
  for (let i = 0; i < linhas.length; i++) {
    if (pessoaEmLinhaUnica(linhas[i]) !== undefined) continue;
    if (!ehNome(linhas[i])) continue;
    if (i > 0 && ehCargo(linhas[i - 1])) {
      if (titulos.has(i - 1)) antesPorTitulo++;
      else antes++;
    }
    if (i + 1 < linhas.length && !titulos.has(i + 1) && ehCargo(linhas[i + 1])) depois++;
  }
  const tituloEhCargo = antesPorTitulo >= MIN_TITULOS_CARGO;
  const totalAntes = tituloEhCargo ? antes + antesPorTitulo : antes;
  return { orientacao: totalAntes > depois ? "antes" : "depois", tituloEhCargo };
}
```

Em `indiceDoCargoAntes`, o título só vale como cargo quando a página o usa assim:

```ts
/**
 * Só a linha imediatamente anterior, e só enquanto nenhuma outra pessoa já a
 * tiver tomado: numa página cargo-antes-do-nome um mesmo título não pode servir
 * a dois nomes. Título de seção ("Ministros") não é cargo; título repetido (STM) é.
 */
function indiceDoCargoAntes(
  linhas: string[],
  i: number,
  consumidas: ReadonlySet<number>,
  titulos: ReadonlySet<number>,
  tituloEhCargo: boolean,
): number | undefined {
  const j = i - 1;
  if (j < 0 || consumidas.has(j)) return undefined;
  if (titulos.has(j) && !tituloEhCargo) return undefined;
  return ehCargo(linhas[j]) ? j : undefined;
}
```

Em `indiceDoCargoDepois`, o título encerra a janela:

```ts
/** Janela curta para frente: o cargo vem logo abaixo do nome. */
function indiceDoCargoDepois(linhas: string[], i: number, titulos: ReadonlySet<number>): number | undefined {
  for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
    // Um título abre outra seção: "Ministros-Substitutos" não é o cargo do último ministro
    // da lista anterior, e "Corregedoria" não é o cargo do item de menu que o antecede.
    if (titulos.has(j)) break;
    // a linha da PRÓXIMA pessoa encerra a janela: no STJ ela cita um cargo
    // ("Fulano - Diretor-Geral da ENFAM") e era adotada como cargo desta.
    if (pessoaEmLinhaUnica(linhas[j]) !== undefined || ehNome(linhas[j])) break;
    if (ehCargo(linhas[j])) return j;
  }
  return undefined;
}
```

Em `segmentarPessoas`:

```ts
function segmentarPessoas(linhas: string[], titulos: ReadonlySet<number>): PessoaSite[] {
  const pessoas: PessoaSite[] = [];
  const { orientacao, tituloEhCargo } = orientacaoDoCargo(linhas, titulos);
  const consumidas = new Set<number>();
  for (let i = 0; i < linhas.length; i++) {
    const emLinhaUnica = pessoaEmLinhaUnica(linhas[i]);
    if (emLinhaUnica) {
      pessoas.push(emLinhaUnica);
      continue;
    }
    const nome = nomeDaLinha(linhas[i]);
    if (nome === undefined) continue;
    const indiceCargo =
      orientacao === "antes"
        ? indiceDoCargoAntes(linhas, i, consumidas, titulos, tituloEhCargo)
        : indiceDoCargoDepois(linhas, i, titulos);
    if (indiceCargo !== undefined) consumidas.add(indiceCargo);
    const cargo = indiceCargo === undefined ? undefined : linhas[indiceCargo];
    pessoas.push({ nome, cargo, contexto: linhas[i] });
  }
  return pessoas;
}
```

Em `extrairConteudo`:

```ts
  const { linhas, titulos } = extrairLinhas($);
  const pessoas = segmentarPessoas(linhas, titulos);
```

Se `extrairTabela` ou outra função também chamar `extrairLinhas`, adapte a chamada para `.linhas` sem mudar o comportamento dela.

- [ ] **Step 4: Rode e confirme que passa, sem alterar teste antigo**

Run: `npx vitest run tests/scrape.test.ts`
Expected: PASS, inclusive "adota o cargo publicado ACIMA do nome (o STM também inverte a ordem)" e todos os testes de STJ, TST, Senado, CNJ e Ministros de Estado. **Se algum teste antigo falhar, pare e reporte**: é o sinal de que a regra do título atinge uma página real, e a decisão é do controlador, não ajuste de teste.

- [ ] **Step 5: Rode tudo**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/scrape.ts tests/scrape.test.ts tests/fixtures/tcu-autoridades.html
git commit -m "fix: título de seção encerra a janela do cargo; fixture da página montada do TCU

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `navegador: true` no catálogo, `rasparFonte` na rota, `CLAUDE.md`

**Files:**
- Modify: `lib/types.ts` (`FonteCatalogo`), `data/catalogo.ts` (entrada do TCU), `app/api/analise/route.ts`, `CLAUDE.md`
- Create: `lib/raspagem.ts`
- Test: `tests/raspagem.test.ts` (novo), `tests/catalogo-dados.test.ts` (acrescentar), `tests/analise.test.ts` (acrescentar)

**Interfaces:**
- Consumes: `rasparComNavegador`, `OpcoesNavegador`, `MOTIVO_NAVEGADOR_AUSENTE` (Task 1); `raspar`, `OpcoesRaspagem` de `@/lib/scrape`.
- Produces:
  ```ts
  // lib/types.ts
  export interface FonteCatalogo { …; /** Página montada por JavaScript: lida pelo Chrome local (lib/navegador.ts), não pelo fetch. */ navegador?: true }
  // lib/raspagem.ts
  export interface Raspadores { porFetch: (url: string, opcoes: OpcoesRaspagem) => Promise<ConteudoFonte>; porNavegador: (url: string, opcoes: OpcoesNavegador) => Promise<ConteudoFonte> }
  export function rasparFonte(fonte: FonteCatalogo, raspadores?: Raspadores): Promise<ConteudoFonte>
  ```

- [ ] **Step 1: Testes que falham**

`tests/raspagem.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { rasparFonte, type Raspadores } from "@/lib/raspagem";
import type { ConteudoFonte, FonteCatalogo } from "@/lib/types";

const vazio = (url: string): ConteudoFonte => ({ url, textoLimpo: "", destaques: [], pessoas: [] });

function raspadoresFalsos(): Raspadores & { porFetch: ReturnType<typeof vi.fn>; porNavegador: ReturnType<typeof vi.fn> } {
  return {
    porFetch: vi.fn(async (url: string) => vazio(url)),
    porNavegador: vi.fn(async (url: string) => vazio(url)),
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

  test("fonte com navegador vai pelo Chrome e nunca pelo fetch", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades", ativo: true, navegador: true }, r);
    expect(r.porNavegador).toHaveBeenCalledWith("https://portal.tcu.gov.br/autoridades", {});
    expect(r.porFetch).not.toHaveBeenCalled();
  });

  test("só a URL cadastrada chega ao navegador (nenhuma transformação)", async () => {
    const r = raspadoresFalsos();
    await rasparFonte({ url: "https://portal.tcu.gov.br/autoridades?x=1", ativo: true, navegador: true }, r);
    expect(r.porNavegador.mock.calls[0][0]).toBe("https://portal.tcu.gov.br/autoridades?x=1");
  });
});
```

Em `tests/catalogo-dados.test.ts`, no `describe` principal:

```ts
  test("só a fonte do TCU é lida por navegador, e ela é do domínio oficial", () => {
    const porNavegador = CATALOGO.flatMap((g) => g.fontes.filter((f) => f.navegador).map((f) => ({ grupo: g.nome, url: f.url })));
    expect(porNavegador).toEqual([{ grupo: "Ministros do TCU", url: "https://portal.tcu.gov.br/autoridades" }]);
    expect(porNavegador[0].url).toMatch(/^https:\/\/[a-z.]+\.gov\.br\//);
  });
```

Em `tests/analise.test.ts`: troque o import `import { extrairTabela } from "@/lib/scrape";` por `import { extrairTabela, ScrapeError } from "@/lib/scrape";`, acrescente `import { MOTIVO_NAVEGADOR_AUSENTE } from "@/lib/navegador";` e, ao lado do teste "página vazia (JS) + IA completa pelo conhecimento…", usando o `deps` e o `contatos` já definidos no topo do arquivo (o grupo "ORG" resolve para `https://orgao.gov.br`):

```ts
  test("Chrome ausente: fonte inacessível com o motivo do navegador, ninguém vira possível saída", async () => {
    const depsSemChrome: Dependencias = {
      ...deps,
      raspar: async () => { throw new ScrapeError("https://orgao.gov.br", MOTIVO_NAVEGADOR_AUSENTE); },
      extrairComposicao: async () => [],
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsSemChrome);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.fonteUrl).toBe("https://orgao.gov.br");
    expect(g.erroFonte).toBe(MOTIVO_NAVEGADOR_AUSENTE);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado" && !c.possivelSaida)).toBe(true);
  });
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/raspagem.test.ts tests/catalogo-dados.test.ts tests/analise.test.ts`
Expected: FAIL (`@/lib/raspagem` não existe; `navegador` não é campo de `FonteCatalogo`; catálogo sem a marca).

- [ ] **Step 3: Tipos, catálogo e `lib/raspagem.ts`**

`lib/types.ts`, em `FonteCatalogo`, depois de `propoeInclusao`:

```ts
  /**
   * A página monta a lista por JavaScript: é lida pelo Chrome local (`lib/navegador.ts`),
   * não pelo `fetch`. Só em modo local; sem Chrome a fonte sai inacessível.
   */
  navegador?: true;
```

`data/catalogo.ts`, entrada "Ministros do TCU":

```ts
    fontes: [
      // Página em JavaScript: o fetch recebe o esqueleto vazio. Lida pelo navegador
      // (spec 2026-10-02, §5); a Camada 2 deixa de ser a única composição do grupo.
      { url: "https://portal.tcu.gov.br/autoridades", ativo: true, navegador: true },
    ],
```

`lib/raspagem.ts`:

```ts
import { raspar, type OpcoesRaspagem } from "@/lib/scrape";
import { rasparComNavegador, type OpcoesNavegador } from "@/lib/navegador";
import type { ConteudoFonte, FonteCatalogo } from "@/lib/types";

/**
 * Escolhe como ler UMA fonte do catálogo: `fetch` + cheerio (padrão) ou Chrome local
 * (`navegador: true`, spec 2026-10-02 §5). Recebe só `FonteCatalogo`: nenhuma URL fora do
 * catálogo chega ao navegador. Os dois leitores são injetáveis para teste.
 */
export interface Raspadores {
  porFetch: (url: string, opcoes: OpcoesRaspagem) => Promise<ConteudoFonte>;
  porNavegador: (url: string, opcoes: OpcoesNavegador) => Promise<ConteudoFonte>;
}

const RASPADORES_PADRAO: Raspadores = { porFetch: raspar, porNavegador: rasparComNavegador };

export function rasparFonte(fonte: FonteCatalogo, raspadores: Raspadores = RASPADORES_PADRAO): Promise<ConteudoFonte> {
  const opcoes = fonte.tabela ? { tabela: fonte.tabela } : {};
  return fonte.navegador ? raspadores.porNavegador(fonte.url, opcoes) : raspadores.porFetch(fonte.url, opcoes);
}
```

`app/api/analise/route.ts`: troque o import de `raspar` por `import { rasparFonte } from "@/lib/raspagem";` e, em `deps`:

```ts
      raspar: (fonte) => rasparFonte(fonte),
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/raspagem.test.ts tests/catalogo-dados.test.ts tests/analise.test.ts`
Expected: PASS.

- [ ] **Step 5: `CLAUDE.md`**

Edite só estes pontos:

1. "Estado do projeto": a linha `Suíte: …` com o número real de `npm test` e a data 2026-10-02.
2. "Stack (em uso)": depois de `cheerio ·`, acrescente `puppeteer-core (só fontes do catálogo com `navegador: true`, caso TCU; abre o Chrome local, nunca na Vercel) ·`.
3. Tabela de documentos de decisão, linha `2026-10-02`: situação passa a `Vigente; Planos A e B implementados`.
4. "Princípios de implementação", depois do princípio "Todas as fontes ativas do grupo compõem a composição…": novo item
   `- **Fonte em JavaScript é lida pelo Chrome local.** \`FonteCatalogo.navegador: true\` manda \`rasparFonte\` (\`lib/raspagem.ts\`) usar \`rasparComNavegador\` (\`lib/navegador.ts\`, \`puppeteer-core\`) em vez do \`fetch\`; o HTML montado passa pelo mesmo \`extrairConteudo\`. Chrome ausente ou página que passa de 30 s viram \`ScrapeError\` ("navegador não encontrado", "navegador: tempo esgotado") e o grupo cai em fonte inacessível, como qualquer outra falha. Nenhum teste abre navegador: o lançador é injetado.`
5. "Catálogo: como cadastrar ou trocar uma URL", passo 2: `Se a lista vem por JavaScript (caso TCU), cadastrar com \`navegador: true\` e registrar no comentário da entrada que a página é montada por JavaScript e lida pelo navegador.`
6. "Segurança e dados": a frase sobre variável de ambiente passa a `As variáveis de ambiente são \`ANTHROPIC_API_KEY\` e \`FISCAL_CHROME\`, ambas opcionais.`
7. "O que NÃO fazer", item do Firecrawl/Puppeteer: `Não usar Firecrawl, Puppeteer ou Playwright dentro do app **fora de \`lib/navegador.ts\`**: só fonte do catálogo marcada \`navegador: true\`, só em modo local, com \`puppeteer-core\` e o Chrome desta máquina (spec 2026-10-02 §8). Scraping padrão continua \`fetch\` + cheerio. (Usar Firecrawl ou o navegador como ferramenta de desenvolvimento, para inspecionar uma página candidata antes de cadastrar, é permitido.)`
8. Em "Dívidas conhecidas", o item do `diagnosticarIa`: trocar "remover quando o TCU estiver confirmado em produção" por "remover depois que a leitura do TCU pelo navegador for confirmada numa varredura real".

- [ ] **Step 6: Rode tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts data/catalogo.ts lib/raspagem.ts app/api/analise/route.ts tests/raspagem.test.ts tests/catalogo-dados.test.ts tests/analise.test.ts CLAUDE.md
git commit -m "feat: TCU lido pelo Chrome local (navegador: true no catálogo, rasparFonte na rota); CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verificação final (controlador, fora das tarefas)

- [ ] `npm test`, `npm run typecheck`, `npm run build` verdes.
- [ ] Varredura real com as duas planilhas de 01/10 pela rota local (`npm run dev`): o grupo "Ministros do TCU" sai **sem `erroFonte`**, **sem `viaPesquisaAmpla`**, com composição de 9 pessoas da página; os 8 contatos deixam de ser indeterminados e **nenhum deles vira possível saída** sem que o nome realmente falte na página; os demais grupos não mudam de semáforo em relação ao retrato de 2026-10-02 22:46 UTC. Registrar as contagens, sem nomes.
- [ ] Com `FISCAL_CHROME=X:\nao-existe.exe` em `.env.local` (temporário), o TCU sai "fonte inacessível" com motivo `navegador não encontrado` e ninguém vira possível saída. Remover a variável depois.
- [ ] `git log --oneline feat/ajustes-painel..HEAD`: plano + três commits; nenhum `.xlsx`, `.fiscal/`, pnpm, `PROXIMA_SESSAO*`, `.superpowers/`.

## Limites conhecidos (não são defeito deste plano)

- A página do TCU publica cargo só para Presidente e Vice-Presidente; os outros sete ministros ficam com cargo `fonte_nao_informa`, e um ministro novo sem cargo não vira proposta de inclusão (regra "novos só com cargo"). Aproveitar o "Ministro" que antecede o nome como cargo mudaria vereditos em STJ, STM e TSE; é spec próprio.
- "Ministro-Substituto Fulano" não é reconhecido como nome (o tratamento composto não é removido); os três substitutos ficam fora da composição. A planilha não tem substituto no grupo. Se um dia tiver, ele sairia "possível saída": tratar no mesmo spec acima.
- A orientação do cargo na página do TCU é decidida por um empate de 2 a 2 ("depois" contra "antes"), que cai em "depois" só porque o título de seção é `h1..h6`. Se o site trocasse o título por um `<p>`, a página viraria "antes" e produziria cargos falsos (comportamento anterior a este plano).
- Duas seções de um nome cada, com títulos que parecem cargo, são indistinguíveis do padrão do STM e adotam o título como cargo.
- Dois rótulos da planilha que resolvam para a mesma fonte `navegador` abrem dois Chromes. Aceitável hoje; deduplicar por URL se uma segunda fonte por navegador for cadastrada.
