# Plano C: retrato publicado na web — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O retrato da última varredura, feita nesta máquina, aparece no app publicado na Vercel, atrás de uma senha única, sem telefone, e-mail nem rede social; a Vercel nunca varre.

**Architecture:** Um único ponto de decisão, `FISCAL_MODO` (`lib/modo.ts`), escolhe o armazém e a tela. Em modo `local` (padrão) tudo fica como hoje, mais o botão "Publicar na web", que chama `POST /api/publicar`: lê `.fiscal/retrato.json`, remove os campos pessoais (`lib/publicar.ts`), carimba `publicadoEm` e grava no Vercel Blob privado por `armazemEmBlob` (`lib/armazem-blob.ts`, segunda implementação de `Armazem`). Em modo `web` (na Vercel) a página lê do Blob, não existe "Nova varredura" nem `/api/analise`, e `middleware.ts` exige o cookie assinado criado por `/api/entrar` (`lib/sessao.ts`, HMAC via WebCrypto, que roda no edge e no Node). Toda regra nova é função pura com teste; rotas, middleware e páginas só ligam as peças.

**Tech Stack:** Next.js 15 (App Router, middleware), TypeScript, Vitest, WebCrypto. **Dependência nova:** `@vercel/blob` (registrada no spec §6 e §8).

**Spec:** `docs/superpowers/specs/2026-10-02-ajustes-do-painel-genero-tcu-publicacao.md`, §6 (Plano C), §7 (falhas) e §8 (regras que mudam). Leia antes de começar. O desenho da senha é o do spec de 2026-09-04 §4, sem o cron.

## Global Constraints

- `lib/*.ts` puros, imutáveis, sem `any`, sem `console.*`, sem `window`. UI sem lógica de negócio. Rotas e middleware só injetam dependências e traduzem erro em resposta; não são testados diretamente (como as rotas de hoje).
- **Sem PII fora desta máquina além do necessário:** o retrato publicado vai **sem** `telefone`, `email` e `redeSocial` de cada contato e **sem** as comparações dos campos `telefone` e `email` (elas carregam `valorPlanilha`). Nome, cargo, tratamento, endereçamento e endereço vão, porque são o objeto do painel, e ficam atrás da senha.
- **Segredos só em variáveis de ambiente:** `BLOB_READ_WRITE_TOKEN`, `APP_SENHA`, `APP_SEGREDO_COOKIE`. Nunca em código, spec, plano, commit, teste ou comando permitido. Nenhuma variável `NEXT_PUBLIC_`.
- **A Vercel nunca lê fonte:** em modo `web`, `/api/analise` responde 404 e `/nova-varredura` não existe. `lib/navegador.ts` continua só do modo local.
- Log do servidor sem PII: só motivo técnico.
- Textos em português do Brasil, sem travessão no lugar de vírgula. Comentários e nomes de teste em português, AAA.
- npm: `npm test`, `npm run typecheck`, `npm run build`. Não commitar `PROXIMA_SESSAO*.md`, `.fiscal/`, pnpm, `.xlsx`, `.superpowers/`, `.env.local`.
- Commit: conventional commit em português, trailer exato `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Branch: `feat/retrato-na-web`, criada sobre `main` (`3f65c10`).

## Review Focus

1. **Telefone, e-mail e rede social nunca chegam ao Blob**, nem dentro de `comparacoes`. → Task 1, Step 1 (teste de `enxugarParaPublicar` com os três campos e com comparação de telefone).
2. **Token adulterado ou vencido não abre o painel**: um byte trocado na assinatura ou `agora` depois de `expira` é inválido. → Task 1, Step 1.
3. **Senha errada responde igual à certa em forma (sem dizer qual), e o atraso cresce por IP** (1 s, 2 s, 4 s, teto 30 s) e zera no acerto. → Task 1, Step 1; Task 3 (rota).
4. **Blob ausente não é erro**: `lerRetrato` devolve `undefined` e a tela diz "Nenhuma varredura publicada ainda"; Blob ilegível lança `RetratoIlegivelError`. → Task 2, Step 1.
5. **Modo `web` sem token do Blob não quebra**: a página diz que o ambiente não está configurado. → Task 3 (página) e Task 4 (conferência manual).

---

### Task 1: Núcleo puro — modo, enxugar, sessão, entrada

**Files:**
- Create: `lib/modo.ts`, `lib/publicar.ts`, `lib/sessao.ts`, `lib/entrada.ts`
- Modify: `lib/types.ts` (`Retrato.publicadoEm?`)
- Test: `tests/modo.test.ts`, `tests/publicar.test.ts`, `tests/sessao.test.ts`, `tests/entrada.test.ts` (novos)

**Interfaces (produces):**
```ts
// lib/modo.ts
export type ModoApp = "local" | "web";
export function modoDoApp(env: Pick<NodeJS.ProcessEnv, "FISCAL_MODO"> = process.env): ModoApp;
// lib/publicar.ts
export function enxugarParaPublicar(retrato: Retrato, publicadoEm: string): Retrato;
// lib/sessao.ts
export const COOKIE_SESSAO = "fiscal_sessao";
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;
export async function criarToken(segredo: string, agoraMs: number, duracaoMs?: number): Promise<string>;
export async function validarToken(token: string | undefined, segredo: string, agoraMs: number): Promise<boolean>;
// lib/entrada.ts
export function senhaConfere(informada: string, esperada: string): boolean;
export const ATRASO_INICIAL_MS = 1000; export const ATRASO_TETO_MS = 30_000;
export interface Atrasador { esperaAntes(ip: string, agoraMs: number): number; registrarErro(ip: string, agoraMs: number): void; registrarAcerto(ip: string): void }
export function criarAtrasador(): Atrasador;
```

- [ ] **Step 1: Testes que falham**

`tests/modo.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { modoDoApp } from "@/lib/modo";

describe("modoDoApp", () => {
  test("sem a variável é local", () => {
    expect(modoDoApp({})).toBe("local");
    expect(modoDoApp({ FISCAL_MODO: "" })).toBe("local");
  });
  test("web só com o valor exato, ignorando caixa e espaços", () => {
    expect(modoDoApp({ FISCAL_MODO: "web" })).toBe("web");
    expect(modoDoApp({ FISCAL_MODO: " WEB " })).toBe("web");
    expect(modoDoApp({ FISCAL_MODO: "producao" })).toBe("local");
  });
});
```

`tests/publicar.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { enxugarParaPublicar } from "@/lib/publicar";
import type { Retrato, ResultadoContato } from "@/lib/types";

const contato: ResultadoContato = {
  contato: { nome: "Ana Maria Política Completa", grupo: "ORG", cargo: "Presidente", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora", telefone: "(61) 99999-0000", email: "ana@exemplo.gov.br", redeSocial: "@ana", endereco: "Praça dos Três Poderes" },
  semaforo: "verde",
  comparacoes: [
    { campo: "nome", valorPlanilha: "Ana Maria Política Completa", situacao: "confere", origemValor: "pagina" },
    { campo: "telefone", valorPlanilha: "(61) 99999-0000", situacao: "fonte_nao_informa", origemValor: "pagina" },
    { campo: "email", valorPlanilha: "ana@exemplo.gov.br", situacao: "fonte_nao_informa", origemValor: "pagina" },
  ],
  camposDivergentes: [],
} as unknown as ResultadoContato;

const retrato: Retrato = {
  arquivoNome: "c.xlsx",
  grupos: [{ grupo: "ORG", contatos: [contato], novos: [], semFonte: false, fonteInacessivel: false } as unknown as Retrato["grupos"][number]],
  resumo: { total: 1 } as unknown as Retrato["resumo"],
  sugestoesCadastro: [],
  geradoEm: "2026-10-03T14:20:22.969Z",
  planilhaContatos: { nome: "c.xlsx", linhas: 1 },
} as unknown as Retrato;

describe("enxugarParaPublicar", () => {
  test("remove telefone, e-mail e rede social do contato e as comparações de telefone e e-mail", () => {
    const p = enxugarParaPublicar(retrato, "2026-10-04T10:00:00.000Z");
    const c = p.grupos[0].contatos[0];
    expect(c.contato.telefone).toBeUndefined();
    expect(c.contato.email).toBeUndefined();
    expect(c.contato.redeSocial).toBeUndefined();
    expect(c.comparacoes.map((x) => x.campo)).toEqual(["nome"]);
    expect(JSON.stringify(p)).not.toMatch(/99999-0000|ana@exemplo|@ana/);
  });
  test("mantém nome, cargo, tratamento, endereçamento e endereço, e carimba publicadoEm", () => {
    const p = enxugarParaPublicar(retrato, "2026-10-04T10:00:00.000Z");
    const c = p.grupos[0].contatos[0].contato;
    expect(c).toMatchObject({ nome: "Ana Maria Política Completa", cargo: "Presidente", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora", endereco: "Praça dos Três Poderes" });
    expect(p.publicadoEm).toBe("2026-10-04T10:00:00.000Z");
    expect(p.geradoEm).toBe(retrato.geradoEm);
  });
  test("não muta o retrato de entrada", () => {
    enxugarParaPublicar(retrato, "2026-10-04T10:00:00.000Z");
    expect(retrato.grupos[0].contatos[0].contato.telefone).toBe("(61) 99999-0000");
    expect(retrato.grupos[0].contatos[0].comparacoes).toHaveLength(3);
  });
});
```

Confira em `lib/types.ts` os campos obrigatórios de `Retrato`/`ResultadoAnalise` e de `ResultadoContato`; os `as unknown as` acima existem para o teste não depender de campos que não interessam. Se `ComparacaoCampo` exigir mais campos, acrescente os mínimos.

`tests/sessao.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { criarToken, validarToken, DURACAO_SESSAO_MS } from "@/lib/sessao";

const SEGREDO = "segredo-de-teste-com-tamanho-razoavel";
const AGORA = Date.parse("2026-10-04T10:00:00.000Z");

describe("sessão assinada", () => {
  test("token criado agora é válido agora e um pouco antes de vencer", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    expect(await validarToken(t, SEGREDO, AGORA)).toBe(true);
    expect(await validarToken(t, SEGREDO, AGORA + DURACAO_SESSAO_MS - 1)).toBe(true);
  });
  test("vencido é inválido", async () => {
    const t = await criarToken(SEGREDO, AGORA, 1000);
    expect(await validarToken(t, SEGREDO, AGORA + 1001)).toBe(false);
  });
  test("assinatura adulterada, segredo diferente, formato estranho ou ausente são inválidos", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    const [expira, assinatura] = t.split(".");
    const trocada = assinatura.slice(0, -1) + (assinatura.endsWith("A") ? "B" : "A");
    expect(await validarToken(`${expira}.${trocada}`, SEGREDO, AGORA)).toBe(false);
    expect(await validarToken(t, "outro-segredo", AGORA)).toBe(false);
    expect(await validarToken("lixo", SEGREDO, AGORA)).toBe(false);
    expect(await validarToken("", SEGREDO, AGORA)).toBe(false);
    expect(await validarToken(undefined, SEGREDO, AGORA)).toBe(false);
  });
  test("o token não carrega o segredo nem a senha, só expiração e assinatura em base64url", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(t).not.toContain(SEGREDO);
  });
});
```

`tests/entrada.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { senhaConfere, criarAtrasador, ATRASO_INICIAL_MS, ATRASO_TETO_MS } from "@/lib/entrada";

describe("senhaConfere", () => {
  test("igual confere; diferente, vazia ou com tamanho diferente não confere", () => {
    expect(senhaConfere("abc123", "abc123")).toBe(true);
    expect(senhaConfere("abc124", "abc123")).toBe(false);
    expect(senhaConfere("", "abc123")).toBe(false);
    expect(senhaConfere("abc1234", "abc123")).toBe(false);
  });
  test("esperada vazia nunca confere (ambiente sem senha não abre)", () => {
    expect(senhaConfere("", "")).toBe(false);
  });
});

describe("atraso progressivo por IP", () => {
  test("sem erro não espera; cada erro dobra: 1 s, 2 s, 4 s; teto 30 s", () => {
    const a = criarAtrasador();
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(0);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(ATRASO_INICIAL_MS);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(2 * ATRASO_INICIAL_MS);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(4 * ATRASO_INICIAL_MS);
    for (let i = 0; i < 10; i++) a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(ATRASO_TETO_MS);
  });
  test("acerto zera; outro IP não é afetado", () => {
    const a = criarAtrasador();
    a.registrarErro("1.1.1.1", 0);
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("2.2.2.2", 0)).toBe(0);
    a.registrarAcerto("1.1.1.1");
    expect(a.esperaAntes("1.1.1.1", 0)).toBe(0);
  });
  test("erros com mais de uma hora são esquecidos", () => {
    const a = criarAtrasador();
    a.registrarErro("1.1.1.1", 0);
    expect(a.esperaAntes("1.1.1.1", 61 * 60 * 1000)).toBe(0);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/modo.test.ts tests/publicar.test.ts tests/sessao.test.ts tests/entrada.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implemente**

`lib/types.ts`, em `Retrato`, depois de `planilhaEnderecos?`:

```ts
  /** Presente só no retrato publicado na web: hora em que esta máquina o publicou, ISO 8601. */
  publicadoEm?: string;
```

`lib/modo.ts`:

```ts
/**
 * Único ponto de decisão entre o app local (varre e grava em .fiscal/) e o app publicado
 * (só exibe o retrato do Blob, atrás de senha). Spec 2026-10-02, §6.2.
 */
export type ModoApp = "local" | "web";

export function modoDoApp(env: Pick<NodeJS.ProcessEnv, "FISCAL_MODO"> = process.env): ModoApp {
  return (env.FISCAL_MODO ?? "").trim().toLowerCase() === "web" ? "web" : "local";
}
```

`lib/publicar.ts`:

```ts
import type { ComparacaoCampo, ContatoPlanilha, Retrato } from "@/lib/types";

/** Campos do contato que o painel não mostra e que não precisam sair desta máquina. */
const CAMPOS_PESSOAIS = ["telefone", "email", "redeSocial"] as const;
/** Comparações cujo `valorPlanilha` carrega esses mesmos dados. */
const COMPARACOES_PESSOAIS: ReadonlySet<ComparacaoCampo["campo"]> = new Set(["telefone", "email"]);

function semCamposPessoais(contato: ContatoPlanilha): ContatoPlanilha {
  const copia: ContatoPlanilha = { ...contato };
  for (const campo of CAMPOS_PESSOAIS) delete copia[campo];
  return copia;
}

/**
 * O retrato que vai para o Blob: o mesmo da máquina, sem telefone, e-mail e rede social, e
 * com `publicadoEm`. Nome, cargo, tratamento, endereçamento e endereço ficam, porque são o
 * objeto do painel e viajam atrás da senha. Spec 2026-10-02, §6.3 e §6.5. Não muta a entrada.
 */
export function enxugarParaPublicar(retrato: Retrato, publicadoEm: string): Retrato {
  return {
    ...retrato,
    publicadoEm,
    grupos: retrato.grupos.map((g) => ({
      ...g,
      contatos: g.contatos.map((c) => ({
        ...c,
        contato: semCamposPessoais(c.contato),
        comparacoes: c.comparacoes.filter((x) => !COMPARACOES_PESSOAIS.has(x.campo)),
      })),
    })),
  };
}
```

`lib/sessao.ts` (WebCrypto: roda no middleware, que é edge, e nas rotas Node):

```ts
/**
 * Sessão do modo web (spec 2026-09-04 §4 e 2026-10-02 §6.4): cookie com `expira.assinatura`,
 * assinatura HMAC-SHA256 do próprio `expira` com `APP_SEGREDO_COOKIE`. Sem estado no servidor
 * e sem identidade: a senha é única e compartilhada. WebCrypto, porque o middleware roda no
 * edge, onde não existe `node:crypto`.
 */
export const COOKIE_SESSAO = "fiscal_sessao";
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

const codificador = new TextEncoder();

function paraBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function assinar(texto: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", codificador.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return paraBase64Url(await crypto.subtle.sign("HMAC", chave, codificador.encode(texto)));
}

/** Comparação em tempo constante de duas strings ASCII do mesmo alfabeto. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

export async function criarToken(segredo: string, agoraMs: number, duracaoMs: number = DURACAO_SESSAO_MS): Promise<string> {
  const expira = paraBase64Url(codificador.encode(String(agoraMs + duracaoMs)));
  return `${expira}.${await assinar(expira, segredo)}`;
}

export async function validarToken(token: string | undefined, segredo: string, agoraMs: number): Promise<boolean> {
  if (!token || !segredo) return false;
  const partes = token.split(".");
  if (partes.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(partes[0]) || !/^[A-Za-z0-9_-]+$/.test(partes[1])) return false;
  const [expira, assinatura] = partes;
  if (!iguais(assinatura, await assinar(expira, segredo))) return false;
  const expiraMs = Number(atob(expira.replace(/-/g, "+").replace(/_/g, "/")));
  return Number.isFinite(expiraMs) && agoraMs < expiraMs;
}
```

`lib/entrada.ts`:

```ts
/**
 * Entrada do modo web: senha única comparada em tempo constante, e atraso progressivo por IP
 * contra tentativa em massa (spec 2026-09-04 §4: 1 s, 2 s, 4 s, teto 30 s). O registro vive na
 * memória da instância; em função serverless cada instância tem o seu, o que o spec aceita.
 */
export const ATRASO_INICIAL_MS = 1000;
export const ATRASO_TETO_MS = 30_000;
/** Erro mais velho que isto é esquecido. */
const JANELA_MS = 60 * 60 * 1000;

export function senhaConfere(informada: string, esperada: string): boolean {
  if (esperada.length === 0 || informada.length !== esperada.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperada.length; i++) diferenca |= informada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diferenca === 0;
}

export interface Atrasador {
  /** Quanto esperar antes de responder a este IP, em ms. */
  esperaAntes(ip: string, agoraMs: number): number;
  registrarErro(ip: string, agoraMs: number): void;
  registrarAcerto(ip: string): void;
}

interface Registro { erros: number; ultimoMs: number }

export function criarAtrasador(): Atrasador {
  const registros = new Map<string, Registro>();
  const vivo = (ip: string, agoraMs: number): Registro | undefined => {
    const r = registros.get(ip);
    if (!r) return undefined;
    if (agoraMs - r.ultimoMs > JANELA_MS) {
      registros.delete(ip);
      return undefined;
    }
    return r;
  };
  return {
    esperaAntes(ip, agoraMs) {
      const r = vivo(ip, agoraMs);
      if (!r) return 0;
      return Math.min(ATRASO_TETO_MS, ATRASO_INICIAL_MS * 2 ** (r.erros - 1));
    },
    registrarErro(ip, agoraMs) {
      const r = vivo(ip, agoraMs);
      registros.set(ip, { erros: (r?.erros ?? 0) + 1, ultimoMs: agoraMs });
    },
    registrarAcerto(ip) {
      registros.delete(ip);
    },
  };
}
```

(`criarAtrasador` guarda estado por desenho: é o registro de tentativas, injetável e testado; o `lib/` continua sem `window` e sem efeito fora do objeto devolvido.)

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/modo.test.ts tests/publicar.test.ts tests/sessao.test.ts tests/entrada.test.ts`
Expected: PASS.

- [ ] **Step 5: Rode tudo**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/modo.ts lib/publicar.ts lib/sessao.ts lib/entrada.ts lib/types.ts tests/modo.test.ts tests/publicar.test.ts tests/sessao.test.ts tests/entrada.test.ts
git commit -m "feat: modo do app, retrato enxuto para publicar, sessão assinada e entrada com atraso progressivo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `armazemEmBlob` com `@vercel/blob`

**Files:**
- Create: `lib/armazem-blob.ts`
- Modify: `lib/armazem.ts` (exportar `validarRetrato`), `package.json`/`package-lock.json` (`@vercel/blob`), `.env.example`
- Test: `tests/armazem-blob.test.ts` (novo)

**Interfaces (produces):**
```ts
export interface ClienteBlob { ler(caminho: string): Promise<string | undefined>; gravar(caminho: string, corpo: string): Promise<void> }
export const CAMINHO_RETRATO_BLOB = "retratos/retrato.json";
export function clienteBlobPadrao(token: string): ClienteBlob;   // @vercel/blob, objeto privado
export function armazemEmBlob(cliente: ClienteBlob): Armazem;
```

- [ ] **Step 1: Testes que falham**

`tests/armazem-blob.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { armazemEmBlob, CAMINHO_RETRATO_BLOB, type ClienteBlob } from "@/lib/armazem-blob";
import { RetratoIlegivelError } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

const retrato = {
  arquivoNome: "c.xlsx", grupos: [], resumo: { total: 0 }, sugestoesCadastro: [],
  geradoEm: "2026-10-03T14:20:22.969Z", planilhaContatos: { nome: "c.xlsx", linhas: 0 }, publicadoEm: "2026-10-04T10:00:00.000Z",
} as unknown as Retrato;

function clienteFalso(inicial?: string) {
  const objetos = new Map<string, string>();
  if (inicial !== undefined) objetos.set(CAMINHO_RETRATO_BLOB, inicial);
  const cliente: ClienteBlob = {
    ler: async (caminho) => objetos.get(caminho),
    gravar: async (caminho, corpo) => { objetos.set(caminho, corpo); },
  };
  return { cliente, objetos };
}

describe("armazemEmBlob", () => {
  test("ausente devolve undefined, sem erro", async () => {
    expect(await armazemEmBlob(clienteFalso().cliente).lerRetrato()).toBeUndefined();
  });
  test("grava no caminho fixo e lê de volta igual", async () => {
    const { cliente, objetos } = clienteFalso();
    await armazemEmBlob(cliente).gravarRetrato(retrato);
    expect([...objetos.keys()]).toEqual([CAMINHO_RETRATO_BLOB]);
    expect(await armazemEmBlob(cliente).lerRetrato()).toEqual(retrato);
  });
  test("JSON inválido e retrato sem campos lançam RetratoIlegivelError", async () => {
    await expect(armazemEmBlob(clienteFalso("{nao é json").cliente).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
    await expect(armazemEmBlob(clienteFalso('{"geradoEm":"x"}').cliente).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
  });
  test("erro do cliente ao ler ou gravar sobe como está (não vira retrato ausente)", async () => {
    const quebrado: ClienteBlob = { ler: async () => { throw new Error("blob fora do ar"); }, gravar: async () => { throw new Error("blob fora do ar"); } };
    await expect(armazemEmBlob(quebrado).lerRetrato()).rejects.toThrow("blob fora do ar");
    await expect(armazemEmBlob(quebrado).gravarRetrato(retrato)).rejects.toThrow("blob fora do ar");
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/armazem-blob.test.ts`
Expected: FAIL.

- [ ] **Step 3: Dependência, `validarRetrato` exportado e `lib/armazem-blob.ts`**

```bash
npm install @vercel/blob@^2
```

Em `lib/armazem.ts`, troque `function validarRetrato(` por `export function validarRetrato(` (sem outra mudança).

`lib/armazem-blob.ts`:

```ts
import { get, put } from "@vercel/blob";
import { RetratoIlegivelError, validarRetrato, type Armazem } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

/**
 * Segunda implementação de `Armazem` (spec 2026-10-02 §6.1): um objeto PRIVADO no Vercel
 * Blob, um só, sem histórico, como o arquivo local. O cliente é injetável para teste; o
 * padrão usa `@vercel/blob` com o token de leitura e escrita do store. Quem lê o retrato
 * publicado é a página em modo web, atrás da senha; quem grava é `POST /api/publicar`,
 * só em modo local.
 */
export const CAMINHO_RETRATO_BLOB = "retratos/retrato.json";

export interface ClienteBlob {
  /** Texto do objeto, ou `undefined` se não existe. */
  ler(caminho: string): Promise<string | undefined>;
  gravar(caminho: string, corpo: string): Promise<void>;
}

async function textoDe(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

/** Cliente real. Não coberto por teste (fala com a rede). */
export function clienteBlobPadrao(token: string): ClienteBlob {
  return {
    async ler(caminho) {
      // `useCache: false`: a leitura tem que refletir a publicação mais recente.
      const r = await get(caminho, { access: "private", token, useCache: false });
      if (!r || r.statusCode === 404 || !r.stream) return undefined;
      return textoDe(r.stream);
    },
    async gravar(caminho, corpo) {
      await put(caminho, corpo, {
        access: "private",
        token,
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    },
  };
}

export function armazemEmBlob(cliente: ClienteBlob): Armazem {
  return {
    async lerRetrato() {
      const texto = await cliente.ler(CAMINHO_RETRATO_BLOB);
      if (texto === undefined) return undefined;
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new RetratoIlegivelError("retrato publicado não é JSON válido");
      }
      return validarRetrato(json);
    },
    async gravarRetrato(retrato: Retrato) {
      await cliente.gravar(CAMINHO_RETRATO_BLOB, JSON.stringify(retrato));
    },
  };
}
```

**Confira as assinaturas reais** em `node_modules/@vercel/blob/dist/index.d.ts` (`get`, `put`, opções `access`, `token`, `useCache`, `allowOverwrite`, `addRandomSuffix`, forma do retorno de `get`: `statusCode`, `stream`). Ajuste **só** `clienteBlobPadrao` ao que o pacote expõe (por exemplo, se `get` com objeto privado devolver `null` quando não existe, trate `null` como ausente). Se `get` não existir nesta versão, use `head` + `fetch` do `url` com o token no cabeçalho `Authorization: Bearer`, e registre no relatório.

`.env.example`, no fim:

```
# -----------------------------------------------------------------------------
# Publicação do retrato na web (OPCIONAL — Plano C, spec 2026-10-02 §6)
# -----------------------------------------------------------------------------
# Token de leitura e escrita do store PRIVADO do Vercel Blob. Aqui (modo local) ele liga o
# botão "Publicar na web"; na Vercel ele permite ler o retrato publicado.
# BLOB_READ_WRITE_TOKEN=
# Só na Vercel: liga o modo web (só exibe; nunca varre; exige senha).
# FISCAL_MODO=web
# Só na Vercel: senha única de entrada e segredo que assina o cookie de sessão (30 dias).
# Use valores longos e aleatórios; nunca os commite.
# APP_SENHA=
# APP_SEGREDO_COOKIE=
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/armazem-blob.test.ts tests/armazem.test.ts`
Expected: PASS.

- [ ] **Step 5: Rode tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: verde (o build prova que `@vercel/blob` empacota).

- [ ] **Step 6: Commit**

```bash
git add lib/armazem-blob.ts lib/armazem.ts tests/armazem-blob.test.ts package.json package-lock.json .env.example
git commit -m "feat: armazém do retrato no Vercel Blob privado, com cliente injetável

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Rotas, middleware e páginas por modo

**Files:**
- Create: `app/api/publicar/route.ts`, `app/api/entrar/route.ts`, `app/entrar/page.tsx`, `components/entrar-form.tsx`, `components/nova-varredura-tela.tsx`, `middleware.ts` (raiz)
- Modify: `app/page.tsx`, `app/api/analise/route.ts`, `app/nova-varredura/page.tsx`

**Interfaces:**
- Consumes: `modoDoApp`, `enxugarParaPublicar`, `criarToken`/`validarToken`/`COOKIE_SESSAO`/`DURACAO_SESSAO_MS`, `senhaConfere`/`criarAtrasador`, `armazemEmBlob`/`clienteBlobPadrao`.
- Produces: `POST /api/publicar` → `{ ok: true, publicadoEm }` | `{ ok: false, message }`; `POST /api/entrar` `{ senha }` → `{ ok: true }` com cookie | `{ ok: false, message: "Senha incorreta." }` (401, sempre a mesma frase); `Painel` recebe `modo`, `publicadoEm`, `podePublicar` (a Task 4 consome).

- [ ] **Step 1: `app/api/publicar/route.ts`**

```ts
import { NextResponse } from "next/server";
import { armazemPadrao, RetratoIlegivelError } from "@/lib/armazem";
import { armazemEmBlob, clienteBlobPadrao } from "@/lib/armazem-blob";
import { modoDoApp } from "@/lib/modo";
import { enxugarParaPublicar } from "@/lib/publicar";

/**
 * Publica o último retrato desta máquina no Blob, sem telefone, e-mail e rede social
 * (spec 2026-10-02 §6.3). Só em modo local; na Vercel não existe. O retrato local não muda.
 */
export async function POST() {
  if (modoDoApp() === "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ ok: false, message: "Publicação não configurada: falta BLOB_READ_WRITE_TOKEN em .env.local." }, { status: 400 });
  try {
    const retrato = await armazemPadrao().lerRetrato();
    if (!retrato) return NextResponse.json({ ok: false, message: "Não há varredura para publicar." }, { status: 400 });
    const publicadoEm = new Date().toISOString();
    await armazemEmBlob(clienteBlobPadrao(token)).gravarRetrato(enxugarParaPublicar(retrato, publicadoEm));
    return NextResponse.json({ ok: true, publicadoEm });
  } catch (err) {
    if (err instanceof RetratoIlegivelError) return NextResponse.json({ ok: false, message: "O retrato local não pôde ser lido." }, { status: 422 });
    // Só o motivo técnico: nunca o retrato.
    console.error("[/api/publicar] falha:", err instanceof Error ? err.message : "erro desconhecido");
    return NextResponse.json({ ok: false, message: "Não foi possível publicar. Tente de novo." }, { status: 500 });
  }
}
```

- [ ] **Step 2: `app/api/entrar/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { criarAtrasador, senhaConfere } from "@/lib/entrada";
import { modoDoApp } from "@/lib/modo";
import { COOKIE_SESSAO, criarToken, DURACAO_SESSAO_MS } from "@/lib/sessao";

const MENSAGEM_ERRO = "Senha incorreta.";
/** Um registro por instância do servidor; spec 2026-09-04 §4 aceita. */
const atrasador = criarAtrasador();

function ipDe(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconhecido";
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Entrada do modo web: senha única, resposta igual para qualquer erro, atraso progressivo por IP. */
export async function POST(req: NextRequest) {
  if (modoDoApp() !== "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
  const senha = process.env.APP_SENHA ?? "";
  const segredo = process.env.APP_SEGREDO_COOKIE ?? "";
  if (!senha || !segredo) return NextResponse.json({ ok: false, message: "Ambiente não configurado." }, { status: 503 });

  const ip = ipDe(req);
  const agora = Date.now();
  await esperar(atrasador.esperaAntes(ip, agora));

  let informada = "";
  try {
    const corpo = (await req.json()) as { senha?: unknown };
    if (typeof corpo.senha === "string") informada = corpo.senha;
  } catch {
    // corpo inválido conta como senha errada: mesma resposta
  }
  if (!senhaConfere(informada, senha)) {
    atrasador.registrarErro(ip, agora);
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO }, { status: 401 });
  }
  atrasador.registrarAcerto(ip);
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set({
    name: COOKIE_SESSAO,
    value: await criarToken(segredo, agora),
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000),
  });
  return resposta;
}
```

- [ ] **Step 3: `middleware.ts` (raiz do projeto)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { modoDoApp } from "@/lib/modo";
import { COOKIE_SESSAO, validarToken } from "@/lib/sessao";

/**
 * Em modo web tudo fica atrás da senha, menos a tela de entrada e sua rota
 * (spec 2026-10-02 §6.4). Em modo local não há senha. Roda no edge: só WebCrypto.
 */
const LIVRES = ["/entrar", "/api/entrar"];

export async function middleware(req: NextRequest) {
  if (modoDoApp() !== "web") return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (LIVRES.includes(pathname)) return NextResponse.next();
  const valido = await validarToken(req.cookies.get(COOKIE_SESSAO)?.value, process.env.APP_SEGREDO_COOKIE ?? "", Date.now());
  if (valido) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ ok: false, message: "Entre com a senha." }, { status: 401 });
  const destino = req.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = "";
  return NextResponse.redirect(destino);
}

export const config = {
  // Tudo, menos os arquivos estáticos do Next e o favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: `components/entrar-form.tsx` e `app/entrar/page.tsx`**

`components/entrar-form.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EntrarForm() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (resp.ok && json?.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setErro(json?.message ?? "Não foi possível entrar. Tente de novo.");
    } catch {
      setErro("Não foi possível entrar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-6 flex max-w-sm flex-col gap-3">
      <label htmlFor="senha" className="text-sm text-cinza">Senha</label>
      <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required className="rounded-md border border-borda-forte bg-cartao px-3 py-2 text-sm" />
      {erro && <p className="rounded-lg border border-atencao-borda bg-atencao-fundo p-2 text-sm text-atencao">{erro}</p>}
      <button type="submit" disabled={enviando} className="rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{enviando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
```

`app/entrar/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { EntrarForm } from "@/components/entrar-form";
import { modoDoApp } from "@/lib/modo";

export const dynamic = "force-dynamic";

export default function EntrarPage() {
  if (modoDoApp() !== "web") notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold">Fiscal de Mailings</h1>
      <p className="mt-2 text-sm text-cinza">Painel do GT Gestão de Convidados. Informe a senha para ver a última varredura publicada.</p>
      <EntrarForm />
    </main>
  );
}
```

(O texto do `useState` usa reticências "…" de propósito; não é travessão.)

- [ ] **Step 5: `/nova-varredura` e `/api/analise` só no modo local**

Mova o conteúdo atual de `app/nova-varredura/page.tsx` (o componente cliente inteiro, com `"use client"`) para `components/nova-varredura-tela.tsx`, exportando `NovaVarreduraTela`. O novo `app/nova-varredura/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { NovaVarreduraTela } from "@/components/nova-varredura-tela";
import { modoDoApp } from "@/lib/modo";

export const dynamic = "force-dynamic";

export default function NovaVarreduraPage() {
  if (modoDoApp() === "web") notFound();
  return <NovaVarreduraTela />;
}
```

Em `app/api/analise/route.ts`, importe `modoDoApp` de `@/lib/modo` e, como primeira linha do `POST`, antes do `try`:

```ts
  // A Vercel nunca lê fonte (spec 2026-10-02 §6.5): em modo web a rota não existe.
  if (modoDoApp() === "web") return NextResponse.json({ ok: false, message: "Não disponível." }, { status: 404 });
```

- [ ] **Step 6: `app/page.tsx` por modo**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Painel } from "@/components/painel";
import { armazemPadrao, RetratoIlegivelError, type Armazem } from "@/lib/armazem";
import { armazemEmBlob, clienteBlobPadrao } from "@/lib/armazem-blob";
import { modoDoApp } from "@/lib/modo";
import type { Retrato } from "@/lib/types";

// Lê a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

function Aviso({ titulo, texto, acao }: { titulo: string; texto: string; acao?: { href: string; rotulo: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-cinza">{texto}</p>
      {acao && <Link href={acao.href} className="mt-6 inline-block rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white">{acao.rotulo}</Link>}
    </main>
  );
}

export default async function Home() {
  const modo = modoDoApp();
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (modo === "web" && !token) {
    return <Aviso titulo="Ambiente não configurado" texto="Falta a variável BLOB_READ_WRITE_TOKEN neste ambiente. Nada quebrou; só não há de onde ler a varredura publicada." />;
  }
  const armazem: Armazem = modo === "web" ? armazemEmBlob(clienteBlobPadrao(token as string)) : armazemPadrao();

  let retrato: Retrato | undefined;
  try {
    retrato = await armazem.lerRetrato();
  } catch (err) {
    if (err instanceof RetratoIlegivelError) {
      return modo === "web"
        ? <Aviso titulo="A varredura publicada não pôde ser lida" texto="O retrato publicado existe, mas não é um retrato válido para esta versão do painel. Publique de novo a partir da máquina do GT." />
        : <Aviso titulo="O último retrato não pôde ser lido" texto="O arquivo .fiscal/retrato.json existe, mas não é um retrato válido. Faça uma nova varredura; ela substitui o arquivo." acao={{ href: "/nova-varredura", rotulo: "Nova varredura" }} />;
    }
    if (modo === "web") {
      // Blob fora do ar: nada de cache, nada de retrato velho (spec §7).
      console.error("[/] retrato publicado não lido:", err instanceof Error ? err.message : "erro desconhecido");
      return <Aviso titulo="Não foi possível ler a varredura publicada" texto="O serviço de armazenamento não respondeu. Recarregue a página em instantes." />;
    }
    throw err;
  }
  if (!retrato) {
    if (modo === "web") return <Aviso titulo="Nenhuma varredura publicada ainda" texto="Quando a máquina do GT publicar uma varredura, ela aparece aqui." />;
    redirect("/nova-varredura");
  }
  return <Painel retrato={retrato} modo={modo} podePublicar={modo === "local" && Boolean(token)} />;
}
```

(`Painel` ganha `modo` e `podePublicar` na Task 4; até lá o typecheck desta task reclama. Para o commit desta task fechar verde, acrescente já em `components/painel.tsx` as duas props **opcionais** na assinatura, sem usá-las: `modo?: "local" | "web"; podePublicar?: boolean`. A Task 4 dá uso a elas.)

- [ ] **Step 7: Rode tudo**

Run: `npm test && npm run typecheck && npm run build`
Expected: verde. O build tem que listar `middleware` (ƒ Middleware) e as rotas `/api/publicar`, `/api/entrar`, `/entrar`.

- [ ] **Step 8: Conferência local do modo web sem token**

Com o servidor parado, rode `FISCAL_MODO=web npm run dev` (no PowerShell: `$env:FISCAL_MODO="web"; npm run dev`) e abra `http://localhost:3000/`: tem que redirecionar para `/entrar`; `POST /api/entrar` responde 503 "Ambiente não configurado" (sem `APP_SENHA`); `/nova-varredura` responde 404; `POST /api/analise` responde 404. Pare o servidor e limpe a variável. Registre no relatório.

- [ ] **Step 9: Commit**

```bash
git add app/api/publicar/route.ts app/api/entrar/route.ts app/entrar/page.tsx components/entrar-form.tsx components/nova-varredura-tela.tsx middleware.ts app/page.tsx app/api/analise/route.ts app/nova-varredura/page.tsx components/painel.tsx
git commit -m "feat: modo web com senha (middleware e /entrar), publicação do retrato (/api/publicar) e página por modo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Painel por modo, botão "Publicar na web", `CLAUDE.md`

**Files:**
- Create: `components/publicar-button.tsx`
- Modify: `components/painel.tsx`, `lib/painel.ts`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-02-ajustes-do-painel-genero-tcu-publicacao.md` (nada além da tabela do `CLAUDE.md`; o spec não muda)
- Test: `tests/painel.test.ts` (acrescentar)

**Interfaces:**
- Produces em `lib/painel.ts`: `export function textoCabecalhoWeb(geradoEm: string, publicadoEm?: string): string`.
- `Painel` passa a usar `modo` e `podePublicar` (já na assinatura desde a Task 3) e lê `retrato.publicadoEm`.

- [ ] **Step 1: Teste que falha**

Em `tests/painel.test.ts`:

```ts
describe("cabeçalho do modo web", () => {
  test("diz quando a varredura foi feita e quando foi publicada", () => {
    const t = textoCabecalhoWeb("2026-10-03T14:20:22.969Z", "2026-10-04T10:05:00.000Z");
    expect(t).toMatch(/^Varredura feita na máquina do GT em \d\d\/\d\d, \d\dh\d\d\. Publicada em \d\d\/\d\d, \d\dh\d\d\.$/);
  });
  test("sem publicadoEm (retrato antigo) omite a segunda frase", () => {
    expect(textoCabecalhoWeb("2026-10-03T14:20:22.969Z")).toMatch(/^Varredura feita na máquina do GT em \d\d\/\d\d, \d\dh\d\d\.$/);
  });
});
```

(importe `textoCabecalhoWeb` de `@/lib/painel` no topo do arquivo.)

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/painel.test.ts`
Expected: FAIL (função não existe).

- [ ] **Step 3: `lib/painel.ts`**

Depois de `textoDataHora`:

```ts
/** Cabeçalho do painel publicado: quando a máquina do GT varreu e quando publicou (spec 2026-10-02 §6.2). */
export function textoCabecalhoWeb(geradoEm: string, publicadoEm?: string): string {
  const base = `Varredura feita na máquina do GT em ${textoDataHora(geradoEm)}.`;
  return publicadoEm ? `${base} Publicada em ${textoDataHora(publicadoEm)}.` : base;
}
```

- [ ] **Step 4: `components/publicar-button.tsx`**

```tsx
"use client";
import { useState } from "react";
import { textoDataHora } from "@/lib/painel";

/** Botão do modo local: manda o retrato desta máquina para a web (POST /api/publicar). */
export function PublicarButton() {
  const [estado, setEstado] = useState<{ tipo: "parado" } | { tipo: "enviando" } | { tipo: "ok"; publicadoEm: string } | { tipo: "erro"; mensagem: string }>({ tipo: "parado" });

  async function publicar() {
    setEstado({ tipo: "enviando" });
    try {
      const resp = await fetch("/api/publicar", { method: "POST" });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; publicadoEm?: string; message?: string } | null;
      if (resp.ok && json?.ok && json.publicadoEm) setEstado({ tipo: "ok", publicadoEm: json.publicadoEm });
      else setEstado({ tipo: "erro", mensagem: json?.message ?? `O servidor respondeu de forma inesperada (HTTP ${resp.status}).` });
    } catch {
      setEstado({ tipo: "erro", mensagem: "Não foi possível publicar. Tente de novo." });
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button type="button" onClick={publicar} disabled={estado.tipo === "enviando"} className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm disabled:opacity-60">
        {estado.tipo === "enviando" ? "Publicando…" : "Publicar na web"}
      </button>
      {estado.tipo === "ok" && <span className="text-xs text-cinza">Publicado às {textoDataHora(estado.publicadoEm).split(", ")[1]}</span>}
      {estado.tipo === "erro" && <span className="text-xs text-atencao">{estado.mensagem}</span>}
    </span>
  );
}
```

- [ ] **Step 5: `components/painel.tsx`**

Na assinatura, use as props: `{ retrato, aviso, onNovaVarredura, modo = "local", podePublicar = false }`. Importe `textoCabecalhoWeb` de `@/lib/painel` e `PublicarButton` de `@/components/publicar-button`. No cabeçalho:

- O parágrafo abaixo do `h1`: em modo `web`, `<p className="mt-1 text-sm text-cinza">{textoCabecalhoWeb(retrato.geradoEm, retrato.publicadoEm)}</p>`; em modo local, o parágrafo de hoje.
- O bloco de botões: em modo `web`, só `<Link href="/grupos">Grupos cadastrados</Link>` e `<ExportButtons analise={retrato} />` (sem "Nova varredura"); em modo local, o de hoje mais `{podePublicar && <PublicarButton />}` antes de `<ExportButtons>`.

Nada de lógica além desses dois condicionais.

- [ ] **Step 6: `CLAUDE.md`**

Edite só estes pontos:

1. "Contexto rápido": troque "Single-user, sem banco; persiste só o último retrato da varredura em arquivo local." por "Single-user, sem banco; persiste só o último retrato da varredura em arquivo local, e pode publicá-lo na web (Vercel, atrás de senha) só para leitura."
2. "Estado do projeto": a linha `Suíte:` com o número real de `npm test` e a data de hoje.
3. "Stack (em uso)": troque "roda local com `npm run dev` (a Vercel saiu da stack em 2026-10-01; o deploy antigo é sobra)" por "roda local com `npm run dev`; a Vercel exibe o retrato publicado em modo `web` (`FISCAL_MODO=web`, `@vercel/blob`), nunca varre".
4. Tabela de documentos de decisão, linha `2026-10-02`: situação `Vigente; Planos A, B e C implementados`.
5. "Princípios de implementação", depois do princípio "O retrato é a única persistência.": novo item
   `- **Dois modos, um ponto de decisão.** \`modoDoApp()\` (\`lib/modo.ts\`, \`FISCAL_MODO\`) escolhe o armazém e a tela. Local (padrão): \`.fiscal/\`, Nova varredura, botão "Publicar na web" quando há \`BLOB_READ_WRITE_TOKEN\`. Web (Vercel): lê o Blob privado (\`lib/armazem-blob.ts\`), tudo atrás da senha única (\`middleware.ts\`, \`/entrar\`, cookie HMAC de \`lib/sessao.ts\`), sem \`/nova-varredura\` e com \`/api/analise\` em 404. \`POST /api/publicar\` (só local) manda o retrato **sem telefone, e-mail e rede social** (\`lib/publicar.ts\`), com \`publicadoEm\`.`
6. "Segurança e dados": troque a frase das variáveis por `As variáveis de ambiente são \`ANTHROPIC_API_KEY\`, \`FISCAL_CHROME\` e \`BLOB_READ_WRITE_TOKEN\` (opcionais, modo local) e, só na Vercel, \`FISCAL_MODO=web\`, \`APP_SENHA\` e \`APP_SEGREDO_COOKIE\`.` e acrescente o item `- O retrato publicado vai sem telefone, e-mail e rede social; o resto fica atrás da senha. O token do Blob, a senha e o segredo do cookie nunca entram em código, spec, plano, commit ou comando permitido.`
7. "O que NÃO fazer": troque "Não adicionar autenticação, multi-tenant, RLS. Fora do MVP." por "Não adicionar login individual, multi-tenant, RLS. A única autenticação é a senha compartilhada do modo web (spec 2026-10-02 §6.4)." e troque "Não voltar a depender da Vercel para ler fontes: ela é bloqueada por IP (medido em 2026-09-17)." por "Não voltar a depender da Vercel para ler fontes: ela é bloqueada por IP (medido em 2026-09-17). Em modo web ela só exibe."
8. "Layout do código": a linha de `app/` ganha `/entrar`, `/api/publicar` e `/api/entrar`; a de `lib/` ganha `modo, publicar, sessao, entrada, armazem-blob`; acrescente a linha `middleware.ts        ← senha do modo web; em modo local deixa tudo passar`.

- [ ] **Step 7: Rode tudo e confira no navegador (modo local)**

Run: `npm test && npm run typecheck && npm run build`. Depois `npm run dev` e abra `http://localhost:3000/`: o cabeçalho é o de hoje; **sem** `BLOB_READ_WRITE_TOKEN` em `.env.local` o botão "Publicar na web" não aparece; o resto do painel é igual. Pare o servidor. Registre no relatório.

- [ ] **Step 8: Commit**

```bash
git add components/publicar-button.tsx components/painel.tsx lib/painel.ts tests/painel.test.ts CLAUDE.md
git commit -m "feat: painel por modo, botão Publicar na web e cabeçalho do retrato publicado; CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verificação final (controlador, fora das tarefas)

- [ ] `npm test`, `npm run typecheck`, `npm run build` verdes; o build lista o middleware.
- [ ] **Com o token do Blob em `.env.local` (insumo do Clovis):** `npm run dev`, abrir o painel, clicar "Publicar na web", ver "Publicado às HHhMM"; depois `FISCAL_MODO=web`, `APP_SENHA` e `APP_SEGREDO_COOKIE` definidos no ambiente do `npm run dev`: `/` redireciona para `/entrar`; senha errada responde "Senha incorreta." e a segunda tentativa demora 1 s a mais; senha certa abre o painel com o cabeçalho "Varredura feita na máquina do GT em …. Publicada em ….", sem "Nova varredura"; `JSON` do retrato publicado (ler pelo cliente do Blob, fora do app) não contém telefone nem e-mail; `/nova-varredura` 404; `POST /api/analise` 404.
- [ ] Sem o token: nada muda no modo local, e o modo web diz "Ambiente não configurado".
- [ ] `git log --oneline main..HEAD`: plano + quatro commits; nenhum `.env.local`, `.xlsx`, `.fiscal/`, pnpm, `PROXIMA_SESSAO*`, `.superpowers/`.

## O que fica com o Clovis (fora do código)

1. Criar um store **privado** do Vercel Blob no projeto da Vercel e gerar o `BLOB_READ_WRITE_TOKEN`; colocar o token em `.env.local` nesta máquina (nunca no repositório) e nas variáveis do projeto na Vercel.
2. Definir na Vercel `FISCAL_MODO=web`, `APP_SENHA` (a senha do GT) e `APP_SEGREDO_COOKIE` (string longa e aleatória). Nenhuma delas nesta máquina, exceto para a conferência local acima.
3. Fazer o deploy do `main` na Vercel (o projeto `mailings-theta.vercel.app` existe com a versão de junho; decidir se é ele que recebe o `main` ou se cria outro). A build na Vercel não precisa de Chrome: `lib/navegador.ts` só roda em modo local.
4. Conferir no deploy: `/entrar`, senha, painel, `/nova-varredura` 404.

## Limites conhecidos (não são defeito deste plano)

- Senha compartilhada: quem a tem vê tudo o que foi publicado (spec §10). Sem perfis, sem auditoria de acesso.
- O atraso progressivo vive na memória de cada instância serverless; instâncias novas começam do zero (spec §10, aceito).
- Um só retrato publicado, sem histórico, como no arquivo local.
- Export CSV/XLSX no modo web exporta o retrato publicado, portanto também sem telefone e e-mail.
