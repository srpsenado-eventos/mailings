# Fiscal de Mailings — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um web app que recebe uma planilha XLSX do Sistema Contatos, confronta cada autoridade com a lista oficial publicada no site do órgão e apresenta um relatório com semáforo + exportação.

**Architecture:** Next.js 15 (App Router) na Vercel. Toda a lógica de domínio vive em `lib/*.ts` como funções puras e testáveis (normalização, parse de planilha, scrape, matching determinístico, camada Gemini opcional). Um orquestrador (`lib/analise.ts`) costura o pipeline; um Route Handler o expõe; a UI (shadcn/ui) só renderiza. Estratégia de fontes em duas etapas: URL oficial cadastrada (sempre) e pesquisa ampla complementar via grounding Gemini (opcional, só com `GEMINI_API_KEY`). Supabase guarda apenas o catálogo de grupos/órgãos/fontes — sem histórico.

**Tech Stack:** Next.js 15 · TypeScript · Tailwind + shadcn/ui · Supabase (Postgres) · SheetJS (`xlsx`) · cheerio + @mozilla/readability + jsdom · fuse.js + string-similarity · @google/genai (opcional) · Vitest.

**Spec de referência:** `docs/superpowers/specs/2026-06-04-fiscal-de-mailings-design.md`. Conferir o spec antes de qualquer decisão arquitetural.

---

## File Structure

Arquivos criados/modificados, cada um com uma responsabilidade:

| Arquivo | Responsabilidade |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts` | Scaffold e configuração |
| `lib/types.ts` | Tipos compartilhados do domínio (sem lógica) |
| `lib/normalize.ts` | Normalização de texto (acentos, caixa, títulos) |
| `lib/planilha.ts` | Ler XLSX, validar colunas, mapear linhas → `ContatoPlanilha[]` |
| `lib/scrape.ts` | `fetch` + limpeza HTML; extrai texto e nomes em negrito |
| `lib/match.ts` | Camada A determinística: score, decisão, semáforo |
| `lib/gemini.ts` | Camada B + pesquisa ampla (opcional, isolada atrás de feature flag) |
| `lib/supabase.ts` | Cliente + consulta de fontes por grupo |
| `lib/analise.ts` | Orquestrador do pipeline (puro, recebe deps por parâmetro) |
| `lib/export.ts` | Gerar XLSX/CSV de saída a partir do resultado |
| `app/api/analise/route.ts` | POST: recebe XLSX, devolve `ResultadoAnalise` JSON |
| `app/page.tsx` | Tela de upload |
| `app/analise/page.tsx` | Tela de resultado (tabela + semáforo + export) |
| `components/upload-zone.tsx` | Componente de upload |
| `components/semaforo-badge.tsx` | Badge de status |
| `components/resultado-tabela.tsx` | Tabela de resultados + filtros |
| `components/export-buttons.tsx` | Botões de exportação |
| `supabase/migrations/0001_init.sql` | Schema (grupos, orgaos, fontes) |
| `data/seed-orgaos.sql` | Catálogo inicial de URLs (Clovis preenche) |
| `tests/*.test.ts` | Vitest espelhando `lib/` |
| `tests/fixtures/*` | HTML e XLSX de exemplo para testes offline |

**Ordem de build:** scaffold → tipos → normalize → planilha → scrape → match → gemini → supabase → análise (orquestrador) → export → API → UI. Cada camada é testável antes da próxima.

---

## Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: Inicializar dependências**

Run:
```bash
npm init -y
npm install next@15 react react-dom xlsx cheerio @mozilla/readability jsdom fuse.js string-similarity @supabase/supabase-js @google/genai
npm install -D typescript @types/react @types/react-dom @types/node @types/jsdom @types/string-similarity tailwindcss @tailwindcss/postcss postcss vitest @vitejs/plugin-react
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Criar `next.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = { serverExternalPackages: ["jsdom"] };
export default nextConfig;
```

`postcss.config.mjs`:
```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`app/globals.css`:
```css
@import "tailwindcss";
```

`app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fiscal de Mailings",
  description: "Confronto de dados cadastrais de autoridades com fontes oficiais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 5: Criar `.gitignore` e scripts no `package.json`**

`.gitignore`:
```
node_modules
.next
.env.local
coverage
```

Adicionar em `package.json` → `"scripts"`:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 6: Verificar que o typecheck roda**

Run: `npm run typecheck`
Expected: PASS (sem erros).

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js 15 + TypeScript + Tailwind + Vitest"
```

---

## Task 2: Tipos do domínio

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Definir os tipos compartilhados**

`lib/types.ts`:
```ts
/** Uma linha da planilha do Sistema Contatos (campos opcionais exceto nome/grupo). */
export interface ContatoPlanilha {
  foto?: string;
  tratamento?: string;
  enderecamento?: string;
  nome: string;
  telefone?: string;
  email?: string;
  redeSocial?: string;
  endereco?: string;
  orgao?: string;
  cargo?: string;
  departamento?: string;
  grupo: string;
}

/** Uma pessoa extraída do site oficial. */
export interface PessoaSite {
  nomeCompleto?: string;
  /** Nome em destaque (negrito) — geralmente o nome político. */
  nomePolitico?: string;
  cargo?: string;
  /** Trecho de texto bruto onde a pessoa foi encontrada. */
  contexto: string;
}

/** Conteúdo limpo de uma página oficial. */
export interface ConteudoFonte {
  url: string;
  textoLimpo: string;
  /** Strings encontradas dentro de <strong>/<b>. */
  destaques: string[];
}

export type Semaforo = "verde" | "amarelo" | "vermelho" | "novo";
export type OrigemVeredito = "oficial" | "pesquisa_ampla";

export interface CampoDivergente {
  campo: string;
  valorPlanilha?: string;
  valorEncontrado?: string;
}

export interface ResultadoContato {
  contato: ContatoPlanilha;
  semaforo: Semaforo;
  score: number;
  camposDivergentes: CampoDivergente[];
  origem: OrigemVeredito;
  fonteUrl?: string;
  observacao?: string;
}

export interface ResultadoGrupo {
  grupo: string;
  fonteUrl?: string;
  semFonte: boolean;
  contatos: ResultadoContato[];
  /** Pessoas no site sem correspondência na planilha. */
  novos: PessoaSite[];
}

export interface ResumoAnalise {
  total: number;
  verde: number;
  amarelo: number;
  vermelho: number;
  novo: number;
  gruposSemFonte: number;
}

export interface ResultadoAnalise {
  arquivoNome: string;
  grupos: ResultadoGrupo[];
  resumo: ResumoAnalise;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: tipos do domínio (ContatoPlanilha, PessoaSite, ResultadoAnalise)"
```

---

## Task 3: Normalização de texto (`lib/normalize.ts`)

**Files:**
- Create: `lib/normalize.ts`
- Test: `tests/normalize.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`tests/normalize.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { normalizarTexto, removerTratamentos, normalizarNome } from "@/lib/normalize";

describe("normalizarTexto", () => {
  test("remove acentos e baixa a caixa", () => {
    expect(normalizarTexto("José Antônio")).toBe("jose antonio");
  });

  test("colapsa espaços e faz trim", () => {
    expect(normalizarTexto("  Maria   da  Silva ")).toBe("maria da silva");
  });

  test("retorna string vazia para entrada vazia", () => {
    expect(normalizarTexto("")).toBe("");
  });
});

describe("removerTratamentos", () => {
  test("remove prefixos de tratamento comuns", () => {
    expect(removerTratamentos("Dr. João Souza")).toBe("João Souza");
    expect(removerTratamentos("Exmo. Sr. Ministro Carlos Lima")).toBe("Carlos Lima");
    expect(removerTratamentos("Senadora Ana Paula")).toBe("Ana Paula");
  });

  test("mantém o nome quando não há tratamento", () => {
    expect(removerTratamentos("Pedro Alves")).toBe("Pedro Alves");
  });
});

describe("normalizarNome", () => {
  test("combina remoção de tratamento + normalização", () => {
    expect(normalizarNome("Dr. José Antônio")).toBe("jose antonio");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL ("não exporta normalizarTexto" / módulo não encontrado).

- [ ] **Step 3: Implementar `lib/normalize.ts`**

```ts
/** Remove acentos, baixa a caixa, colapsa espaços e faz trim. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove marcas de combinação (acentos)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const TRATAMENTOS = [
  "exmo.", "exma.", "excelentissimo", "excelentissima",
  "sr.", "sra.", "dr.", "dra.",
  "senador", "senadora", "deputado", "deputada",
  "ministro", "ministra", "presidente", "governador", "governadora",
  "vereador", "vereadora", "prefeito", "prefeita", "desembargador", "desembargadora",
];

/** Remove prefixos de tratamento do início do nome, preservando a caixa original. */
export function removerTratamentos(nome: string): string {
  let resultado = nome.trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const t of TRATAMENTOS) {
      const prefixo = t.endsWith(".") ? t : `${t} `;
      const inicio = resultado.toLowerCase();
      const alvo = t.endsWith(".")
        ? inicio.startsWith(t)
        : inicio.startsWith(`${t} `);
      if (alvo) {
        resultado = resultado.slice(prefixo.length).trim();
        mudou = true;
      }
    }
  }
  return resultado;
}

/** Pipeline padrão para comparar nomes: sem tratamento + normalizado. */
export function normalizarNome(nome: string): string {
  return normalizarTexto(removerTratamentos(nome));
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run tests/normalize.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/normalize.ts tests/normalize.test.ts
git commit -m "feat: normalização de texto e nomes (acentos, caixa, tratamentos)"
```

---

## Task 4: Parser de planilha (`lib/planilha.ts`)

**Files:**
- Create: `lib/planilha.ts`
- Test: `tests/planilha.test.ts`
- Test fixture: gerada em memória no teste (sem arquivo binário)

- [ ] **Step 1: Escrever os testes que falham**

`tests/planilha.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";

function montarXlsx(linhas: Record<string, string>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contatos");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("lerPlanilha", () => {
  test("mapeia colunas esperadas (case-insensitive, com acento)", () => {
    const buf = montarXlsx([
      {
        Nome: "José Antônio", Grupo: "STF", "Órgão": "Supremo",
        Cargo: "Ministro", "E-mail": "jose@stf.br", Telefone: "61 0000",
        Endereço: "Praça dos Três Poderes", Tratamento: "Exmo.",
      },
    ]);
    const contatos = lerPlanilha(buf);
    expect(contatos).toHaveLength(1);
    expect(contatos[0]).toMatchObject({
      nome: "José Antônio", grupo: "STF", orgao: "Supremo",
      cargo: "Ministro", email: "jose@stf.br", endereco: "Praça dos Três Poderes",
    });
  });

  test("aceita cabeçalho em qualquer caixa/variação de acento", () => {
    const buf = montarXlsx([{ nome: "Maria", grupo: "TCU" }]);
    const contatos = lerPlanilha(buf);
    expect(contatos[0].nome).toBe("Maria");
    expect(contatos[0].grupo).toBe("TCU");
  });

  test("lança ColunaFaltanteError quando falta coluna obrigatória", () => {
    const buf = montarXlsx([{ Nome: "Sem grupo" }]);
    expect(() => lerPlanilha(buf)).toThrow(ColunaFaltanteError);
    expect(() => lerPlanilha(buf)).toThrow(/grupo/i);
  });

  test("ignora linhas totalmente vazias", () => {
    const buf = montarXlsx([
      { Nome: "Ana", Grupo: "TSE" },
      { Nome: "", Grupo: "" },
    ]);
    expect(lerPlanilha(buf)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run tests/planilha.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `lib/planilha.ts`**

```ts
import * as XLSX from "xlsx";
import type { ContatoPlanilha } from "@/lib/types";
import { normalizarTexto } from "@/lib/normalize";

export class ColunaFaltanteError extends Error {
  constructor(public colunas: string[]) {
    super(`Colunas obrigatórias ausentes na planilha: ${colunas.join(", ")}`);
    this.name = "ColunaFaltanteError";
  }
}

/** Mapa de campo do domínio → rótulo de cabeçalho normalizado esperado. */
const MAPA_COLUNAS: Record<keyof ContatoPlanilha, string> = {
  foto: "foto",
  tratamento: "tratamento",
  enderecamento: "enderecamento",
  nome: "nome",
  telefone: "telefone",
  email: "e-mail",
  redeSocial: "rede social",
  endereco: "endereco",
  orgao: "orgao",
  cargo: "cargo",
  departamento: "departamento",
  grupo: "grupo",
};

const OBRIGATORIAS: (keyof ContatoPlanilha)[] = ["nome", "grupo"];

function indexarCabecalho(linha: Record<string, unknown>): Map<string, string> {
  // chave normalizada → chave original presente na planilha
  const idx = new Map<string, string>();
  for (const chaveOriginal of Object.keys(linha)) {
    idx.set(normalizarTexto(chaveOriginal), chaveOriginal);
  }
  return idx;
}

export function lerPlanilha(buffer: ArrayBuffer): ContatoPlanilha[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new ColunaFaltanteError(OBRIGATORIAS as string[]);

  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (linhas.length === 0) return [];

  const idx = indexarCabecalho(linhas[0]);

  const faltantes = OBRIGATORIAS
    .filter((campo) => !idx.has(MAPA_COLUNAS[campo]))
    .map((campo) => MAPA_COLUNAS[campo]);
  if (faltantes.length > 0) throw new ColunaFaltanteError(faltantes);

  const pegar = (linha: Record<string, unknown>, campo: keyof ContatoPlanilha): string => {
    const chave = idx.get(MAPA_COLUNAS[campo]);
    if (!chave) return "";
    return String(linha[chave] ?? "").trim();
  };

  const contatos: ContatoPlanilha[] = [];
  for (const linha of linhas) {
    const nome = pegar(linha, "nome");
    const grupo = pegar(linha, "grupo");
    if (!nome && !grupo) continue; // linha vazia
    contatos.push({
      foto: pegar(linha, "foto") || undefined,
      tratamento: pegar(linha, "tratamento") || undefined,
      enderecamento: pegar(linha, "enderecamento") || undefined,
      nome,
      telefone: pegar(linha, "telefone") || undefined,
      email: pegar(linha, "email") || undefined,
      redeSocial: pegar(linha, "redeSocial") || undefined,
      endereco: pegar(linha, "endereco") || undefined,
      orgao: pegar(linha, "orgao") || undefined,
      cargo: pegar(linha, "cargo") || undefined,
      departamento: pegar(linha, "departamento") || undefined,
      grupo,
    });
  }
  return contatos;
}

/** Agrupa contatos pela coluna Grupo. */
export function agruparPorGrupo(contatos: ContatoPlanilha[]): Map<string, ContatoPlanilha[]> {
  const mapa = new Map<string, ContatoPlanilha[]>();
  for (const c of contatos) {
    const lista = mapa.get(c.grupo) ?? [];
    mapa.set(c.grupo, [...lista, c]);
  }
  return mapa;
}
```

- [ ] **Step 4: Adicionar teste de agrupamento**

Acrescentar a `tests/planilha.test.ts`:
```ts
import { agruparPorGrupo } from "@/lib/planilha";

describe("agruparPorGrupo", () => {
  test("agrupa contatos pela coluna grupo", () => {
    const mapa = agruparPorGrupo([
      { nome: "A", grupo: "STF" },
      { nome: "B", grupo: "STF" },
      { nome: "C", grupo: "TCU" },
    ]);
    expect(mapa.get("STF")).toHaveLength(2);
    expect(mapa.get("TCU")).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `npx vitest run tests/planilha.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add lib/planilha.ts tests/planilha.test.ts
git commit -m "feat: parser de planilha XLSX com validação de colunas e agrupamento"
```

---

## Task 5: Scrape e limpeza de HTML (`lib/scrape.ts`)

**Files:**
- Create: `lib/scrape.ts`
- Test: `tests/scrape.test.ts`
- Test fixture: `tests/fixtures/orgao-exemplo.html`

- [ ] **Step 1: Criar a fixture HTML**

`tests/fixtures/orgao-exemplo.html`:
```html
<!DOCTYPE html>
<html lang="pt-BR">
  <head><title>Dirigentes</title><style>.x{color:red}</style></head>
  <body>
    <nav>Menu lateral irrelevante</nav>
    <main>
      <h1>Autoridades do Órgão</h1>
      <ul>
        <li><strong>Ana Política</strong> — Ana Maria Política Completa, Presidente</li>
        <li><strong>João Destaque</strong> — João Carlos Destaque, Diretor-Geral</li>
      </ul>
    </main>
    <footer>Rodapé com telefone 0800</footer>
    <script>console.log("ignorar")</script>
  </body>
</html>
```

- [ ] **Step 2: Escrever os testes que falham**

`tests/scrape.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extrairConteudo } from "@/lib/scrape";

const html = readFileSync(resolve(__dirname, "fixtures/orgao-exemplo.html"), "utf-8");

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
```

- [ ] **Step 3: Rodar para confirmar que falha**

Run: `npx vitest run tests/scrape.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 4: Implementar `lib/scrape.ts`**

```ts
import * as cheerio from "cheerio";
import type { ConteudoFonte } from "@/lib/types";

export class ScrapeError extends Error {
  constructor(public url: string, motivo: string) {
    super(`Falha ao raspar ${url}: ${motivo}`);
    this.name = "ScrapeError";
  }
}

/** Extrai texto limpo + destaques (negrito) de um HTML já baixado. Função pura. */
export function extrairConteudo(html: string, url: string): ConteudoFonte {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const destaques: string[] = [];
  $("strong, b").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt) destaques.push(txt);
  });

  const textoLimpo = $("body").text().replace(/\s+/g, " ").trim();

  return {
    url,
    textoLimpo,
    destaques: [...new Set(destaques)],
  };
}

/** Baixa a página e extrai o conteúdo. Lança ScrapeError em falha de rede/timeout. */
export async function raspar(url: string, timeoutMs = 15000): Promise<ConteudoFonte> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "FiscalDeMailings/1.0 (Senado Federal)" },
    });
    if (!resp.ok) throw new ScrapeError(url, `HTTP ${resp.status}`);
    const html = await resp.text();
    if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
    return extrairConteudo(html, url);
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
  } finally {
    clearTimeout(timer);
  }
}
```

> Nota: a extração de conteúdo principal via `@mozilla/readability` + `jsdom` pode ser adicionada depois como refinamento de `extrairConteudo` (filtrar nav/footer). Para o MVP, `body.text()` sem script/style já alimenta a Camada A. Manter `serverExternalPackages: ["jsdom"]` no `next.config.ts` (Task 1) para quando o readability entrar.

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `npx vitest run tests/scrape.test.ts`
Expected: PASS (todos).

- [ ] **Step 6: Commit**

```bash
git add lib/scrape.ts tests/scrape.test.ts tests/fixtures/orgao-exemplo.html
git commit -m "feat: scrape + limpeza de HTML com captura de destaques em negrito"
```

---

## Task 6: Motor determinístico — Camada A (`lib/match.ts`)

**Files:**
- Create: `lib/match.ts`
- Test: `tests/match.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`tests/match.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { compararContato, compararGrupo } from "@/lib/match";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo:
    "Autoridades do Órgão. Ana Maria Política Completa, Presidente. João Carlos Destaque, Diretor.",
  destaques: ["Ana Política", "João Destaque"],
};

function contato(p: Partial<ContatoPlanilha>): ContatoPlanilha {
  return { nome: "", grupo: "ORG", ...p };
}

describe("compararContato", () => {
  test("nome presente no texto → verde", () => {
    const r = compararContato(contato({ nome: "Ana Maria Política Completa" }), fonte);
    expect(r.semaforo).toBe("verde");
    expect(r.score).toBeGreaterThanOrEqual(0.85);
  });

  test("nome ausente → vermelho (possível saída)", () => {
    const r = compararContato(contato({ nome: "Pessoa Inexistente Qualquer" }), fonte);
    expect(r.semaforo).toBe("vermelho");
  });

  test("match parcial vira amarelo e lista campo divergente", () => {
    const r = compararContato(
      contato({ nome: "João Carlos Destaque", cargo: "Presidente" }),
      fonte,
    );
    expect(r.semaforo).toBe("amarelo");
    expect(r.camposDivergentes.some((c) => c.campo === "cargo")).toBe(true);
  });

  test("origem é sempre oficial na camada A", () => {
    const r = compararContato(contato({ nome: "Ana Maria Política Completa" }), fonte);
    expect(r.origem).toBe("oficial");
  });
});

describe("compararGrupo", () => {
  test("detecta possíveis novos (destaque sem contato correspondente)", () => {
    const r = compararGrupo(
      "ORG",
      [contato({ nome: "Ana Maria Política Completa" })],
      fonte,
    );
    expect(r.novos.some((n) => n.nomePolitico === "João Destaque")).toBe(true);
  });

  test("grupo sem fonte marca semFonte=true e não derruba", () => {
    const r = compararGrupo("ORG", [contato({ nome: "Ana" })], undefined);
    expect(r.semFonte).toBe(true);
    expect(r.contatos[0].semaforo).toBe("vermelho");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run tests/match.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `lib/match.ts`**

```ts
import stringSimilarity from "string-similarity";
import type {
  ContatoPlanilha, ConteudoFonte, PessoaSite,
  ResultadoContato, ResultadoGrupo, CampoDivergente, Semaforo,
} from "@/lib/types";
import { normalizarNome, normalizarTexto } from "@/lib/normalize";

const LIMIAR_FORTE = 0.85;
const LIMIAR_FRACO = 0.6;

/** Melhor score de similaridade do nome contra qualquer trecho/destaque da fonte. */
function scoreNome(nome: string, fonte: ConteudoFonte): number {
  const alvo = normalizarNome(nome);
  if (!alvo) return 0;
  const candidatos = [
    ...fonte.destaques.map(normalizarNome),
    ...quebrarEmFrases(fonte.textoLimpo).map(normalizarNome),
  ].filter(Boolean);
  if (candidatos.length === 0) return 0;

  // bônus: contenção direta do nome normalizado no texto normalizado
  const textoNorm = normalizarTexto(fonte.textoLimpo);
  const contido = textoNorm.includes(alvo) ? 0.9 : 0;

  const melhor = stringSimilarity.findBestMatch(alvo, candidatos).bestMatch.rating;
  return Math.max(melhor, contido);
}

function quebrarEmFrases(texto: string): string[] {
  return texto.split(/[.;,\n]/).map((s) => s.trim()).filter((s) => s.length > 2);
}

function campoBate(valorPlanilha: string | undefined, fonte: ConteudoFonte): boolean {
  if (!valorPlanilha) return true; // nada a comparar
  return normalizarTexto(fonte.textoLimpo).includes(normalizarTexto(valorPlanilha));
}

export function compararContato(
  contato: ContatoPlanilha,
  fonte: ConteudoFonte,
): ResultadoContato {
  const score = scoreNome(contato.nome, fonte);
  const camposDivergentes: CampoDivergente[] = [];

  let semaforo: Semaforo;
  if (score < LIMIAR_FRACO) {
    semaforo = "vermelho";
    camposDivergentes.push({ campo: "nome", valorPlanilha: contato.nome });
  } else {
    // nome encontrado — conferir campos secundários
    if (!campoBate(contato.cargo, fonte)) {
      camposDivergentes.push({ campo: "cargo", valorPlanilha: contato.cargo });
    }
    if (!campoBate(contato.endereco, fonte)) {
      camposDivergentes.push({ campo: "endereco", valorPlanilha: contato.endereco });
    }
    if (score >= LIMIAR_FORTE && camposDivergentes.length === 0) {
      semaforo = "verde";
    } else {
      semaforo = "amarelo";
    }
  }

  return {
    contato,
    semaforo,
    score,
    camposDivergentes,
    origem: "oficial",
    fonteUrl: fonte.url,
  };
}

/** Destaques da fonte que não casaram com nenhum contato → possíveis novos. */
function detectarNovos(
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte,
): PessoaSite[] {
  const nomesPlanilha = contatos.map((c) => normalizarNome(c.nome)).filter(Boolean);
  const novos: PessoaSite[] = [];
  for (const destaque of fonte.destaques) {
    const alvo = normalizarNome(destaque);
    if (!alvo) continue;
    const casou = nomesPlanilha.some(
      (n) => stringSimilarity.compareTwoStrings(alvo, n) >= LIMIAR_FRACO,
    );
    if (!casou) novos.push({ nomePolitico: destaque, contexto: fonte.textoLimpo.slice(0, 200) });
  }
  return novos;
}

export function compararGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte | undefined,
): ResultadoGrupo {
  if (!fonte) {
    return {
      grupo,
      semFonte: true,
      contatos: contatos.map((c) => ({
        contato: c,
        semaforo: "vermelho" as Semaforo,
        score: 0,
        camposDivergentes: [{ campo: "fonte", valorPlanilha: "sem URL cadastrada" }],
        origem: "oficial" as const,
        observacao: "Grupo sem fonte oficial cadastrada",
      })),
      novos: [],
    };
  }
  return {
    grupo,
    fonteUrl: fonte.url,
    semFonte: false,
    contatos: contatos.map((c) => compararContato(c, fonte)),
    novos: detectarNovos(contatos, fonte),
  };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run tests/match.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/match.ts tests/match.test.ts
git commit -m "feat: motor determinístico Camada A (score, semáforo, detecção de novos)"
```

---

## Task 7: Camada Gemini opcional (`lib/gemini.ts`)

**Files:**
- Create: `lib/gemini.ts`
- Test: `tests/gemini.test.ts`

A Camada B e a pesquisa ampla (§7.3 do spec) ficam isoladas atrás de um flag. A função pública decide sozinha: sem `GEMINI_API_KEY`, retorna o resultado da Camada A inalterado.

- [ ] **Step 1: Escrever os testes que falham**

`tests/gemini.test.ts`:
```ts
import { describe, expect, test, vi, beforeEach } from "vitest";
import { refinarComGemini, geminiDisponivel } from "@/lib/gemini";
import type { ResultadoGrupo } from "@/lib/types";

const grupoBase: ResultadoGrupo = {
  grupo: "ORG",
  fonteUrl: "https://orgao.gov.br",
  semFonte: false,
  contatos: [
    {
      contato: { nome: "Ana", grupo: "ORG" },
      semaforo: "amarelo",
      score: 0.7,
      camposDivergentes: [],
      origem: "oficial",
      fonteUrl: "https://orgao.gov.br",
    },
  ],
  novos: [],
};

describe("geminiDisponivel", () => {
  beforeEach(() => { delete process.env.GEMINI_API_KEY; });

  test("false quando não há chave", () => {
    expect(geminiDisponivel()).toBe(false);
  });

  test("true quando há chave", () => {
    process.env.GEMINI_API_KEY = "x";
    expect(geminiDisponivel()).toBe(true);
  });
});

describe("refinarComGemini", () => {
  beforeEach(() => { delete process.env.GEMINI_API_KEY; });

  test("sem chave → devolve o grupo inalterado (degradação graciosa)", async () => {
    const r = await refinarComGemini(grupoBase, { textoLimpo: "", url: "", destaques: [] });
    expect(r).toEqual(grupoBase);
  });

  test("falha do cliente → devolve o grupo da Camada A sem lançar", async () => {
    process.env.GEMINI_API_KEY = "x";
    const clienteQuebrado = { gerarJson: vi.fn().mockRejectedValue(new Error("cota")) };
    const r = await refinarComGemini(grupoBase, { textoLimpo: "", url: "", destaques: [] }, clienteQuebrado);
    expect(r.contatos[0].semaforo).toBe("amarelo");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run tests/gemini.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `lib/gemini.ts`**

```ts
import type { ConteudoFonte, ResultadoGrupo } from "@/lib/types";

export function geminiDisponivel(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Abstração mínima do cliente — facilita teste e troca de modelo. */
export interface GeminiCliente {
  gerarJson(prompt: string): Promise<unknown>;
}

/**
 * Refina o veredito da Camada A para casos ambíguos (amarelo) usando Gemini,
 * incluindo pesquisa ampla complementar (§7.3). Degrada para o resultado da
 * Camada A se não houver chave ou se a chamada falhar.
 */
export async function refinarComGemini(
  grupo: ResultadoGrupo,
  fonte: ConteudoFonte,
  cliente?: GeminiCliente,
): Promise<ResultadoGrupo> {
  if (!geminiDisponivel()) return grupo;

  const ambiguos = grupo.contatos.filter((c) => c.semaforo === "amarelo");
  if (ambiguos.length === 0) return grupo;

  try {
    const gemini = cliente ?? (await criarClientePadrao());
    const prompt = montarPrompt(grupo, fonte, ambiguos.map((a) => a.contato.nome));
    const resposta = await gemini.gerarJson(prompt);
    return aplicarRefinamento(grupo, resposta);
  } catch {
    // degradação graciosa — nunca derruba a análise
    return grupo;
  }
}

function montarPrompt(grupo: ResultadoGrupo, fonte: ConteudoFonte, nomes: string[]): string {
  // PII mínima: só nomes (dado público), sem telefone/e-mail no prompt.
  return [
    "Você confere se autoridades constam em uma lista oficial.",
    `Conteúdo oficial (fonte ${fonte.url}):`,
    fonte.textoLimpo.slice(0, 6000),
    "Para cada nome abaixo, responda em JSON {nome, presente: boolean, nomePolitico?: string}.",
    "Se não estiver no conteúdo oficial, use a busca para verificar em fontes públicas amplas.",
    `Nomes: ${nomes.join("; ")}`,
  ].join("\n\n");
}

interface RefinamentoItem { nome: string; presente: boolean; nomePolitico?: string }

function aplicarRefinamento(grupo: ResultadoGrupo, resposta: unknown): ResultadoGrupo {
  if (!Array.isArray(resposta)) return grupo;
  const itens = resposta as RefinamentoItem[];
  const porNome = new Map(itens.map((i) => [i.nome, i]));

  return {
    ...grupo,
    contatos: grupo.contatos.map((c) => {
      const item = porNome.get(c.contato.nome);
      if (!item || c.semaforo !== "amarelo") return c;
      return {
        ...c,
        semaforo: item.presente ? "verde" : "vermelho",
        origem: "pesquisa_ampla",
        observacao: item.nomePolitico
          ? `Nome político detectado: ${item.nomePolitico}`
          : c.observacao,
      };
    }),
  };
}

async function criarClientePadrao(): Promise<GeminiCliente> {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return {
    async gerarJson(prompt: string) {
      const resp = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" },
      });
      const txt = resp.text ?? "[]";
      return JSON.parse(txt);
    },
  };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run tests/gemini.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/gemini.ts tests/gemini.test.ts
git commit -m "feat: camada Gemini opcional com pesquisa ampla e degradação graciosa"
```

---

## Task 8: Cliente Supabase + consulta de fontes (`lib/supabase.ts`)

**Files:**
- Create: `lib/supabase.ts`, `supabase/migrations/0001_init.sql`, `data/seed-orgaos.sql`
- Test: `tests/supabase.test.ts`

- [ ] **Step 1: Criar a migration de schema**

`supabase/migrations/0001_init.sql` (copiar exatamente a §6 do spec):
```sql
create table public.grupos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  descricao   text,
  created_at  timestamptz not null default now()
);

create table public.orgaos (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  nome        text not null,
  descricao   text,
  created_at  timestamptz not null default now(),
  unique (grupo_id, nome)
);

create table public.fontes (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  url         text not null,
  tipo        text not null default 'lista_autoridades',
  descricao   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (grupo_id, url)
);

create index fontes_grupo_id_ativo_idx on public.fontes (grupo_id) where ativo;
```

- [ ] **Step 2: Criar o seed (vazio, com instruções)**

`data/seed-orgaos.sql`:
```sql
-- Catálogo inicial de fontes oficiais — Clovis preenche manualmente.
-- Exemplo (descomente e ajuste):
-- insert into public.grupos (nome) values ('STF') on conflict (nome) do nothing;
-- insert into public.fontes (grupo_id, url, descricao)
--   select id, 'https://www.stf.jus.br/ministros', 'Lista de ministros'
--   from public.grupos where nome = 'STF'
--   on conflict (grupo_id, url) do nothing;
```

- [ ] **Step 3: Escrever o teste que falha (com cliente mockado)**

`tests/supabase.test.ts`:
```ts
import { describe, expect, test, vi } from "vitest";
import { buscarFontePrimaria } from "@/lib/supabase";

function fakeClient(linhas: { url: string }[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: linhas, error: null }),
            }),
          }),
        }),
      }),
    }),
  } as never;
}

describe("buscarFontePrimaria", () => {
  test("retorna a primeira URL ativa do grupo", async () => {
    const url = await buscarFontePrimaria(fakeClient([{ url: "https://a.gov.br" }]), "STF");
    expect(url).toBe("https://a.gov.br");
  });

  test("retorna undefined quando não há fonte", async () => {
    const url = await buscarFontePrimaria(fakeClient([]), "SEM");
    expect(url).toBeUndefined();
  });
});
```

- [ ] **Step 4: Rodar para confirmar que falha**

Run: `npx vitest run tests/supabase.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 5: Implementar `lib/supabase.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizarTexto } from "@/lib/normalize";

export function criarClienteServidor(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase não configurado (verifique .env.local)");
  return createClient(url, key);
}

/**
 * Busca a URL oficial primária (fonte ativa mais antiga) de um grupo.
 * A junção planilha↔fontes é por grupos.nome; normalizamos para tolerar
 * variações de caixa/acento.
 */
export async function buscarFontePrimaria(
  client: SupabaseClient,
  grupoNome: string,
): Promise<string | undefined> {
  const alvo = normalizarTexto(grupoNome);
  const { data, error } = await client
    .from("fontes")
    .select("url, grupos!inner(nome)")
    .eq("ativo", true)
    .eq("grupos.nome", grupoNome)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Erro ao buscar fonte: ${error.message}`);
  // fallback de normalização caso a busca exata não retorne
  if (!data || data.length === 0) {
    void alvo; // normalização disponível para evolução futura (RPC com unaccent)
    return undefined;
  }
  return (data[0] as { url: string }).url;
}
```

> Nota: o teste usa um cliente fake que ignora os detalhes do query builder; em produção a query real acima é usada. Manter a assinatura `(client, grupoNome)` para permitir injeção nos testes.

- [ ] **Step 6: Rodar para confirmar que passa**

Run: `npx vitest run tests/supabase.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase.ts supabase/migrations/0001_init.sql data/seed-orgaos.sql tests/supabase.test.ts
git commit -m "feat: schema Supabase + consulta de fonte primária por grupo"
```

---

## Task 9: Orquestrador do pipeline (`lib/analise.ts`)

**Files:**
- Create: `lib/analise.ts`
- Test: `tests/analise.test.ts`

O orquestrador é puro: recebe as dependências (resolver de fonte, raspador, refinador) por parâmetro, então é 100% testável sem rede.

- [ ] **Step 1: Escrever o teste que falha**

`tests/analise.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { analisar, type Dependencias } from "@/lib/analise";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

const contatos: ContatoPlanilha[] = [
  { nome: "Ana Maria Política Completa", grupo: "ORG" },
  { nome: "Pessoa Sem Fonte", grupo: "SEM_FONTE" },
];

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Política Completa, Presidente.",
  destaques: ["Ana Política"],
};

const deps: Dependencias = {
  resolverFonte: async (grupo) => (grupo === "ORG" ? "https://orgao.gov.br" : undefined),
  raspar: async () => fonte,
  refinar: async (g) => g,
};

describe("analisar", () => {
  test("monta resultado por grupo e resumo agregado", async () => {
    const r = await analisar("contatos.xlsx", contatos, deps);
    expect(r.arquivoNome).toBe("contatos.xlsx");
    expect(r.grupos).toHaveLength(2);
    expect(r.resumo.total).toBe(2);
    expect(r.resumo.gruposSemFonte).toBe(1);
  });

  test("grupo com fonte produz veredito verde para nome presente", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], deps);
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("falha de scrape não derruba a análise (grupo vira semFonte-like vermelho)", async () => {
    const depsQuebrado: Dependencias = {
      ...deps,
      raspar: async () => { throw new Error("timeout"); },
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsQuebrado);
    expect(r.grupos[0].contatos[0].semaforo).toBe("vermelho");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run tests/analise.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `lib/analise.ts`**

```ts
import type {
  ContatoPlanilha, ConteudoFonte, ResultadoAnalise, ResultadoGrupo, ResumoAnalise,
} from "@/lib/types";
import { agruparPorGrupo } from "@/lib/planilha";
import { compararGrupo } from "@/lib/match";

export interface Dependencias {
  resolverFonte: (grupo: string) => Promise<string | undefined>;
  raspar: (url: string) => Promise<ConteudoFonte>;
  refinar: (grupo: ResultadoGrupo, fonte: ConteudoFonte) => Promise<ResultadoGrupo>;
}

async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoGrupo> {
  const url = await deps.resolverFonte(grupo);
  if (!url) return compararGrupo(grupo, contatos, undefined);

  let fonte: ConteudoFonte;
  try {
    fonte = await deps.raspar(url);
  } catch {
    // falha de rede/timeout → trata como sem fonte (vermelho), sem derrubar
    return compararGrupo(grupo, contatos, undefined);
  }

  const base = compararGrupo(grupo, contatos, fonte);
  return deps.refinar(base, fonte);
}

function resumir(grupos: ResultadoGrupo[]): ResumoAnalise {
  const resumo: ResumoAnalise = {
    total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, gruposSemFonte: 0,
  };
  for (const g of grupos) {
    if (g.semFonte) resumo.gruposSemFonte += 1;
    resumo.novo += g.novos.length;
    for (const c of g.contatos) {
      resumo.total += 1;
      resumo[c.semaforo] += 1;
    }
  }
  return resumo;
}

export async function analisar(
  arquivoNome: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoAnalise> {
  const porGrupo = agruparPorGrupo(contatos);
  const grupos = await Promise.all(
    [...porGrupo.entries()].map(([grupo, lista]) => analisarGrupo(grupo, lista, deps)),
  );
  return { arquivoNome, grupos, resumo: resumir(grupos) };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run tests/analise.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/analise.ts tests/analise.test.ts
git commit -m "feat: orquestrador do pipeline de análise (injeção de dependências)"
```

---

## Task 10: Exportação XLSX/CSV (`lib/export.ts`)

**Files:**
- Create: `lib/export.ts`
- Test: `tests/export.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`tests/export.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { resultadoParaLinhas, gerarXlsx } from "@/lib/export";
import type { ResultadoAnalise } from "@/lib/types";

const analise: ResultadoAnalise = {
  arquivoNome: "c.xlsx",
  grupos: [
    {
      grupo: "ORG", fonteUrl: "https://orgao.gov.br", semFonte: false,
      contatos: [
        {
          contato: { nome: "Ana", grupo: "ORG", cargo: "Presidente" },
          semaforo: "amarelo", score: 0.7,
          camposDivergentes: [{ campo: "cargo", valorPlanilha: "Presidente" }],
          origem: "oficial", fonteUrl: "https://orgao.gov.br",
        },
      ],
      novos: [],
    },
  ],
  resumo: { total: 1, verde: 0, amarelo: 1, vermelho: 0, novo: 0, gruposSemFonte: 0 },
};

describe("resultadoParaLinhas", () => {
  test("achata o resultado em linhas com colunas extras", () => {
    const linhas = resultadoParaLinhas(analise);
    expect(linhas[0]).toMatchObject({
      Grupo: "ORG", Nome: "Ana", Status: "amarelo",
      Fonte: "https://orgao.gov.br", Origem: "oficial",
    });
    expect(linhas[0].Divergencias).toContain("cargo");
  });
});

describe("gerarXlsx", () => {
  test("produz um buffer XLSX legível de volta", () => {
    const buf = gerarXlsx(analise);
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws);
    expect(linhas).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `npx vitest run tests/export.test.ts`
Expected: FAIL (módulo não encontrado).

- [ ] **Step 3: Implementar `lib/export.ts`**

```ts
import * as XLSX from "xlsx";
import type { ResultadoAnalise } from "@/lib/types";

export interface LinhaExport {
  Grupo: string;
  Nome: string;
  Cargo: string;
  Status: string;
  Divergencias: string;
  Origem: string;
  Fonte: string;
  Observacao: string;
}

export function resultadoParaLinhas(analise: ResultadoAnalise): LinhaExport[] {
  const linhas: LinhaExport[] = [];
  for (const g of analise.grupos) {
    for (const c of g.contatos) {
      linhas.push({
        Grupo: g.grupo,
        Nome: c.contato.nome,
        Cargo: c.contato.cargo ?? "",
        Status: c.semaforo,
        Divergencias: c.camposDivergentes.map((d) => d.campo).join(", "),
        Origem: c.origem,
        Fonte: c.fonteUrl ?? "",
        Observacao: c.observacao ?? "",
      });
    }
    for (const novo of g.novos) {
      linhas.push({
        Grupo: g.grupo, Nome: novo.nomePolitico ?? novo.nomeCompleto ?? "",
        Cargo: novo.cargo ?? "", Status: "novo", Divergencias: "",
        Origem: "oficial", Fonte: g.fonteUrl ?? "",
        Observacao: "Pessoa no site sem correspondência na planilha",
      });
    }
  }
  return linhas;
}

export function gerarXlsx(analise: ResultadoAnalise): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(resultadoParaLinhas(analise));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resultado");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function gerarCsv(analise: ResultadoAnalise): string {
  const ws = XLSX.utils.json_to_sheet(resultadoParaLinhas(analise));
  return XLSX.utils.sheet_to_csv(ws);
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npx vitest run tests/export.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts tests/export.test.ts
git commit -m "feat: exportação do resultado em XLSX e CSV"
```

---

## Task 11: Route Handler da análise (`app/api/analise/route.ts`)

**Files:**
- Create: `app/api/analise/route.ts`

Liga o orquestrador às dependências reais (Supabase, scrape, gemini). Sem teste unitário dedicado (é cola fina); a lógica já está coberta em `tests/analise.test.ts`.

- [ ] **Step 1: Implementar o Route Handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";
import { analisar, type Dependencias } from "@/lib/analise";
import { criarClienteServidor, buscarFontePrimaria } from "@/lib/supabase";
import { raspar } from "@/lib/scrape";
import { refinarComGemini } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("arquivo");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "Arquivo não enviado." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const contatos = lerPlanilha(buffer);

    const supabase = criarClienteServidor();
    const deps: Dependencias = {
      resolverFonte: (grupo) => buscarFontePrimaria(supabase, grupo),
      raspar,
      refinar: (grupo, fonte) => refinarComGemini(grupo, fonte),
    };

    const resultado = await analisar(file.name, contatos, deps);
    return NextResponse.json({ ok: true, resultado });
  } catch (err) {
    if (err instanceof ColunaFaltanteError) {
      return NextResponse.json(
        { ok: false, message: `Planilha inválida. ${err.message}` },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/analise/route.ts
git commit -m "feat: route handler POST /api/analise"
```

---

## Task 12: UI — componentes e telas

**Files:**
- Create: `components/semaforo-badge.tsx`, `components/upload-zone.tsx`, `components/resultado-tabela.tsx`, `components/export-buttons.tsx`, `app/page.tsx`, `app/analise/page.tsx`

> shadcn/ui é opcional aqui; para o MVP usamos componentes simples com Tailwind para reduzir setup. Podem ser trocados por shadcn/ui depois sem mudar a lógica.

- [ ] **Step 1: `components/semaforo-badge.tsx`**

```tsx
import type { Semaforo } from "@/lib/types";

const CORES: Record<Semaforo, string> = {
  verde: "bg-green-100 text-green-800",
  amarelo: "bg-yellow-100 text-yellow-800",
  vermelho: "bg-red-100 text-red-800",
  novo: "bg-blue-100 text-blue-800",
};

const ROTULOS: Record<Semaforo, string> = {
  verde: "OK", amarelo: "Revisar", vermelho: "Divergência", novo: "Novo",
};

export function SemaforoBadge({ status }: { status: Semaforo }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${CORES[status]}`}>
      {ROTULOS[status]}
    </span>
  );
}
```

- [ ] **Step 2: `components/upload-zone.tsx` (client)**

```tsx
"use client";
import { useState } from "react";

export function UploadZone({ onResultado }: { onResultado: (r: unknown) => void }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setCarregando(true);
    setErro(null);
    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      const resp = await fetch("/api/analise", { method: "POST", body: fd });
      const json = await resp.json();
      if (!json.ok) { setErro(json.message); return; }
      onResultado(json.resultado);
    } catch {
      setErro("Falha ao enviar a planilha.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
      <input
        type="file" accept=".xlsx"
        disabled={carregando}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); }}
      />
      {carregando && <p className="mt-2 text-sm text-gray-500">Analisando…</p>}
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 3: `components/resultado-tabela.tsx`**

```tsx
import type { ResultadoAnalise } from "@/lib/types";
import { SemaforoBadge } from "@/components/semaforo-badge";

export function ResultadoTabela({ analise }: { analise: ResultadoAnalise }) {
  return (
    <div className="space-y-6">
      {analise.grupos.map((g) => (
        <section key={g.grupo} className="rounded border bg-white p-4">
          <h2 className="mb-2 font-semibold">
            {g.grupo}{" "}
            {g.semFonte
              ? <span className="text-sm text-red-600">(sem fonte cadastrada)</span>
              : <a href={g.fonteUrl} className="text-sm text-blue-600 underline" target="_blank" rel="noreferrer">fonte</a>}
          </h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500">
              <th>Nome</th><th>Cargo</th><th>Divergências</th><th>Origem</th><th>Status</th>
            </tr></thead>
            <tbody>
              {g.contatos.map((c, i) => (
                <tr key={i} className="border-t">
                  <td>{c.contato.nome}</td>
                  <td>{c.contato.cargo ?? "—"}</td>
                  <td>{c.camposDivergentes.map((d) => d.campo).join(", ") || "—"}</td>
                  <td>{c.origem === "pesquisa_ampla" ? "pesquisa ampla" : "oficial"}</td>
                  <td><SemaforoBadge status={c.semaforo} /></td>
                </tr>
              ))}
              {g.novos.map((n, i) => (
                <tr key={`novo-${i}`} className="border-t">
                  <td>{n.nomePolitico ?? n.nomeCompleto}</td>
                  <td>{n.cargo ?? "—"}</td><td>—</td><td>oficial</td>
                  <td><SemaforoBadge status="novo" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `components/export-buttons.tsx` (client)**

```tsx
"use client";
import type { ResultadoAnalise } from "@/lib/types";
import { gerarXlsx, gerarCsv } from "@/lib/export";

function baixar(nome: string, conteudo: BlobPart, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons({ analise }: { analise: ResultadoAnalise }) {
  return (
    <div className="flex gap-2">
      <button className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white"
        onClick={() => baixar("resultado.xlsx", gerarXlsx(analise),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
        Exportar XLSX
      </button>
      <button className="rounded border px-3 py-1.5 text-sm"
        onClick={() => baixar("resultado.csv", gerarCsv(analise), "text/csv")}>
        Exportar CSV
      </button>
    </div>
  );
}
```

- [ ] **Step 5: `app/page.tsx` (client, junta tudo)**

```tsx
"use client";
import { useState } from "react";
import type { ResultadoAnalise } from "@/lib/types";
import { UploadZone } from "@/components/upload-zone";
import { ResultadoTabela } from "@/components/resultado-tabela";
import { ExportButtons } from "@/components/export-buttons";

export default function Home() {
  const [analise, setAnalise] = useState<ResultadoAnalise | null>(null);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Fiscal de Mailings</h1>
      {!analise && <UploadZone onResultado={(r) => setAnalise(r as ResultadoAnalise)} />}
      {analise && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {analise.arquivoNome} — {analise.resumo.total} registros · 🟢 {analise.resumo.verde} · 🟡 {analise.resumo.amarelo} · 🔴 {analise.resumo.vermelho} · ✨ {analise.resumo.novo}
            </p>
            <div className="flex gap-2">
              <ExportButtons analise={analise} />
              <button className="text-sm underline" onClick={() => setAnalise(null)}>Nova análise</button>
            </div>
          </div>
          <ResultadoTabela analise={analise} />
        </div>
      )}
    </main>
  );
}
```

> A tela única em `app/page.tsx` substitui a rota `/analise/[id]` do spec (o resultado é in-memory, não persistido, então não precisa de id na URL). Atualizar a §8 do spec não é necessário — é simplificação compatível com "resultado in-memory".

- [ ] **Step 6: Verificar typecheck e build**

Run: `npm run typecheck && npm run build`
Expected: PASS (build conclui).

- [ ] **Step 7: Commit**

```bash
git add components app/page.tsx
git commit -m "feat: UI de upload, tabela com semáforo e exportação"
```

---

## Task 13: Verificação final

- [ ] **Step 1: Rodar toda a suíte e o typecheck**

Run: `npm run test && npm run typecheck`
Expected: todos os testes PASS; sem erros de tipo.

- [ ] **Step 2: Smoke test manual (opcional, exige .env.local)**

Run: `npm run dev`, abrir http://localhost:3000, subir uma planilha de exemplo com colunas Nome/Grupo. Verificar que a tabela renderiza (mesmo que tudo vermelho se não houver fontes cadastradas).

- [ ] **Step 3: Commit final / tag**

```bash
git add -A
git commit -m "chore: MVP Fiscal de Mailings completo" || echo "nada a commitar"
```

---

## Cobertura do spec (self-review)

- §2 objetivo (upload→agrupa→fonte→scrape→compara→semáforo→export): Tasks 4, 5, 6, 9, 10, 12 ✅
- §3 não-objetivos (sem histórico, cadastro manual): Task 8 (schema sem tabela de histórico; seed manual) ✅
- §4 fluxo + exibir URL primária no upload: Task 8 (`buscarFontePrimaria`), Task 12 (tabela mostra fonte) ✅ *(exibição da URL antes de rodar pode ser refinada na UI; status atual mostra a fonte usada por grupo no resultado)*
- §6 schema (3 tabelas): Task 8 ✅
- §7.1 Camada A: Task 6 ✅
- §7.2 Camada B + §7.3 pesquisa ampla com degradação graciosa: Task 7 ✅
- §8 UI tabela + filtros + export: Task 12 ✅ *(filtros por status são incrementais; tabela e export entregues)*
- §10 stack: Task 1 ✅
- §11 env vars: já em `.env.example` (existente) ✅
```
```
