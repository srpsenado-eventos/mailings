# Catálogo em arquivo versionado (remoção do Supabase) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o Postgres do Supabase por um catálogo TypeScript versionado, devolvendo a aplicação ao ar sem nenhuma dependência de banco.

**Architecture:** Os 33 grupos e 21 fontes migram de `data/apply-all.sql` para `data/catalogo.ts` (array tipado, validado no build). `lib/supabase.ts` vira `lib/catalogo.ts` preservando integralmente a lógica de casamento de grupo; some o cliente, some o `async`. Os dois call sites passam a chamar funções síncronas.

**Tech Stack:** Next.js 15 (App Router) · TypeScript · Vitest · Node 24 (scripts `.mjs`, ESM)

**Spec:** [docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md](../specs/2026-08-13-catalogo-em-arquivo-sem-banco.md)

## Global Constraints

- **Sem `any`.** Use `unknown` + narrowing, ou defina o tipo.
- **Imutabilidade:** funções de `lib/` nunca mutam o input. `.sort()` sempre sobre cópia (`[...arr].sort()`).
- **Normalização centralizada** em `lib/normalize.ts` — não reimplementar `lowercase + sem acento`.
- **Sem PII em log.** Nomes e e-mails de responsáveis nunca vão para `console.log`.
- **`lib/*.ts` são funções puras.** Sem JSX, sem hooks, sem `window`.
- **Comentários e nomes de teste em português.** Padrão AAA nos testes.
- **A primeira fonte ativa na ordem do array é a primária.** Substitui o "mais antiga por `created_at`" do banco.
- **Não alterar** `lib/scrape.ts`, `lib/match.ts`, `lib/normalize.ts`, `lib/planilha.ts`, `lib/gemini.ts`, `lib/export.ts`. A suíte deles continuar verde é o critério de que a troca foi cirúrgica.
- **Manter como histórico** (não apagar): `supabase/migrations/`, `data/*.sql`, `scripts/apply-migrations.mjs`, devDependency `pg`.
- Comandos: `npm test` (Vitest), `npm run typecheck` (`tsc --noEmit`), `npm run dev`.

---

### Task 1: Tipos do catálogo + gerador + `data/catalogo.ts`

Migra os dados do SQL para um arquivo TypeScript, com testes de integridade sobre o dado **real** — a rede de proteção contra uma regeneração defeituosa.

**Files:**
- Modify: `lib/types.ts` (acrescenta `FonteCatalogo` e `GrupoCatalogo`; corrige comentário de `GrupoCadastro`)
- Create: `scripts/gerar-catalogo.mjs`
- Create: `data/catalogo.ts` (gerado pelo script, commitado)
- Test: `tests/catalogo-dados.test.ts`

**Interfaces:**
- Consumes: `data/apply-all.sql` (existente, não modificado)
- Produces: `FonteCatalogo { url: string; ativo: boolean }` e `GrupoCatalogo { nome: string; responsavel1?: string; responsavel2?: string; backup?: string; emailResp1?: string; emailResp2?: string; emailBackup?: string; fontes: FonteCatalogo[] }` exportados de `@/lib/types`; `CATALOGO: readonly GrupoCatalogo[]` exportado de `@/data/catalogo`

- [ ] **Step 1: Acrescentar os tipos em `lib/types.ts`**

Adicione ao final do arquivo:

```typescript
/** Fonte oficial de um grupo no catálogo versionado (`data/catalogo.ts`). */
export interface FonteCatalogo {
  url: string;
  ativo: boolean;
}

/**
 * Grupo no catálogo versionado (`data/catalogo.ts`), com responsáveis internos
 * e fontes oficiais. A **primeira fonte ativa da lista é a primária** — a ordem
 * do array é significativa e substitui o `created_at` do antigo schema Postgres.
 */
export interface GrupoCatalogo {
  nome: string;
  responsavel1?: string;
  responsavel2?: string;
  backup?: string;
  emailResp1?: string;
  emailResp2?: string;
  emailBackup?: string;
  fontes: FonteCatalogo[];
}
```

E corrija o comentário existente de `GrupoCadastro` (linha ~124), que menciona o Supabase:

```typescript
/** Grupo do catálogo com seus responsáveis e status de fonte (para a tela de visualização). */
```

- [ ] **Step 2: Escrever o teste de integridade (vai falhar)**

Crie `tests/catalogo-dados.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { CATALOGO } from "@/data/catalogo";

describe("catálogo real (data/catalogo.ts)", () => {
  test("tem os 33 grupos migrados do banco", () => {
    expect(CATALOGO).toHaveLength(33);
  });

  test("tem as 21 fontes migradas do banco", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(21);
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
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/catalogo-dados.test.ts`
Expected: FAIL — não resolve `@/data/catalogo` (o arquivo ainda não existe).

- [ ] **Step 4: Escrever o gerador**

Crie `scripts/gerar-catalogo.mjs`. O parser lê literais SQL de verdade (com `''` escapado), porque nomes de grupo contêm apóstrofos, acentos e parênteses — `Embaixadores ( África do Sul até EUA)`, `Conselho Nacional de Justiça (CNJ)`. Regex simples quebraria nesses casos.

```javascript
#!/usr/bin/env node
// Converte data/apply-all.sql -> data/catalogo.ts (migração única do banco para arquivo).
// Depois desta conversão, data/catalogo.ts é a fonte da verdade e pode ser editado à mão.
// Ver docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sql = readFileSync(path.join(root, "data", "apply-all.sql"), "utf8");

const PREFIXO_GRUPO =
  "insert into public.grupos (nome, responsavel_1, responsavel_2, backup, email_resp_1, email_resp_2, email_backup) values (";
const PREFIXO_FONTE = "insert into public.fontes (grupo_id, url) select id, ";
const MEIO_FONTE = " from public.grupos where nome = ";

/** Lê um literal SQL ('...', com '' escapando aspa) a partir de i, que aponta para a aspa. */
function lerLiteral(texto, i) {
  if (texto[i] !== "'") throw new Error(`esperava um literal SQL na posição ${i}`);
  let valor = "";
  i++;
  while (i < texto.length) {
    if (texto[i] === "'" && texto[i + 1] === "'") {
      valor += "'";
      i += 2;
      continue;
    }
    if (texto[i] === "'") return { valor, fim: i + 1 };
    valor += texto[i++];
  }
  throw new Error("literal SQL não fechado");
}

/** Lê a lista de um `values (...)`, aceitando literais e NULL, até o ')' de fechamento. */
function lerValores(texto, i) {
  const valores = [];
  let atual = null;
  while (i < texto.length) {
    const c = texto[i];
    if (c === "'") {
      const r = lerLiteral(texto, i);
      atual = r.valor;
      i = r.fim;
      continue;
    }
    if (c === ",") {
      valores.push(atual);
      atual = null;
      i++;
      continue;
    }
    if (c === ")") {
      valores.push(atual);
      return { valores, fim: i + 1 };
    }
    if (texto.slice(i, i + 4).toUpperCase() === "NULL") {
      atual = null;
      i += 4;
      continue;
    }
    i++;
  }
  throw new Error("`values (...)` não fechado");
}

// ---- grupos ----
const grupos = [];
for (let i = sql.indexOf(PREFIXO_GRUPO); i !== -1; i = sql.indexOf(PREFIXO_GRUPO, i + 1)) {
  const { valores } = lerValores(sql, i + PREFIXO_GRUPO.length);
  const [nome, responsavel1, responsavel2, backup, emailResp1, emailResp2, emailBackup] = valores;
  if (!nome) throw new Error("encontrado insert de grupo sem nome");
  grupos.push({ nome, responsavel1, responsavel2, backup, emailResp1, emailResp2, emailBackup, fontes: [] });
}
if (grupos.length === 0) throw new Error("nenhum grupo encontrado no SQL — prefixo mudou?");

// ---- fontes ----
const porNome = new Map(grupos.map((g) => [g.nome, g]));
for (let i = sql.indexOf(PREFIXO_FONTE); i !== -1; i = sql.indexOf(PREFIXO_FONTE, i + 1)) {
  const u = lerLiteral(sql, i + PREFIXO_FONTE.length);
  const j = sql.indexOf(MEIO_FONTE, u.fim);
  if (j === -1) throw new Error(`fonte sem cláusula de grupo: ${u.valor}`);
  const n = lerLiteral(sql, j + MEIO_FONTE.length);
  const grupo = porNome.get(n.valor);
  if (!grupo) throw new Error(`fonte aponta para grupo inexistente: ${n.valor}`);
  if (!grupo.fontes.some((f) => f.url === u.valor)) grupo.fontes.push({ url: u.valor, ativo: true });
}

// ---- emissão ----
const OPCIONAIS = ["responsavel1", "responsavel2", "backup", "emailResp1", "emailResp2", "emailBackup"];

function emitirGrupo(g) {
  const linhas = ["  {", `    nome: ${JSON.stringify(g.nome)},`];
  for (const chave of OPCIONAIS) {
    if (g[chave] !== null && g[chave] !== undefined) {
      linhas.push(`    ${chave}: ${JSON.stringify(g[chave])},`);
    }
  }
  if (g.fontes.length === 0) {
    linhas.push("    fontes: [],");
  } else {
    linhas.push("    fontes: [");
    for (const f of g.fontes) {
      linhas.push(`      { url: ${JSON.stringify(f.url)}, ativo: ${f.ativo} },`);
    }
    linhas.push("    ],");
  }
  linhas.push("  },");
  return linhas.join("\n");
}

const conteudo = `// Catálogo de grupos e fontes oficiais — FONTE DA VERDADE da aplicação.
//
// Gerado uma única vez por scripts/gerar-catalogo.mjs a partir de data/apply-all.sql,
// na migração que removeu o Supabase. A partir daqui, EDITE ESTE ARQUIVO À MÃO:
// cadastrar uma URL nova é acrescentar uma entrada em \`fontes\` e commitar.
//
// A primeira fonte com \`ativo: true\` é a primária do grupo — a ordem importa.
// Ver docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md
import type { GrupoCatalogo } from "@/lib/types";

export const CATALOGO: readonly GrupoCatalogo[] = [
${grupos.map(emitirGrupo).join("\n")}
];
`;

writeFileSync(path.join(root, "data", "catalogo.ts"), conteudo, "utf8");
const totalFontes = grupos.reduce((n, g) => n + g.fontes.length, 0);
process.stdout.write(`data/catalogo.ts gerado: ${grupos.length} grupos, ${totalFontes} fontes\n`);
```

- [ ] **Step 5: Rodar o gerador**

Run: `node scripts/gerar-catalogo.mjs`
Expected: `data/catalogo.ts gerado: 33 grupos, 21 fontes`

Se os números divergirem, **pare** — o SQL de origem mudou e o parser precisa ser revisto antes de seguir.

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/catalogo-dados.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 7: Conferir o arquivo gerado a olho**

Run: `head -30 data/catalogo.ts`

Confira: acentos íntegros (`Justiça`, `Solene`), nenhum `undefined`/`null` literal no meio do array, URLs completas.

- [ ] **Step 8: Verificar que o TypeScript aceita o arquivo gerado**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts scripts/gerar-catalogo.mjs data/catalogo.ts tests/catalogo-dados.test.ts
git commit -m "feat: catálogo de grupos/fontes em arquivo TypeScript versionado"
```

---

### Task 2: `lib/catalogo.ts` substitui `lib/supabase.ts`

Porta a lógica de casamento de grupo sem alterá-la e migra os 20 testes existentes.

**Files:**
- Create: `lib/catalogo.ts`
- Delete: `lib/supabase.ts`
- Create: `tests/catalogo.test.ts` (migrado de `tests/supabase.test.ts`)
- Delete: `tests/supabase.test.ts`

**Interfaces:**
- Consumes: `CATALOGO` de `@/data/catalogo`; `GrupoCatalogo`, `FonteCatalogo`, `GrupoCadastro` de `@/lib/types`; `normalizarTexto` de `@/lib/normalize`; `sugerirGrupos` de `@/lib/match`
- Produces, todos exportados de `@/lib/catalogo`:
  - `interface FonteResolvida { grupoCanonico?: string; url?: string; sugestoes: string[] }`
  - `buscarFontePrimaria(grupoNome: string, catalogo?: readonly GrupoCatalogo[]): string | undefined`
  - `resolverGrupoEFonte(grupoNome: string, catalogo?: readonly GrupoCatalogo[]): FonteResolvida`
  - `listarGruposComFonte(catalogo?: readonly GrupoCatalogo[]): GrupoCadastro[]`

**Atenção — uma única mudança de comportamento.** No banco, a fonte primária era a ativa **mais antiga por `created_at`**. Agora é a **primeira ativa na ordem do array**. Um teste existente codifica a regra antiga e precisa ser reescrito (Step 1, teste "escolhe a primeira fonte ativa na ordem do catálogo"). Os outros 19 migram sem mudança de intenção.

- [ ] **Step 1: Escrever `tests/catalogo.test.ts` (vai falhar)**

```typescript
import { describe, expect, test } from "vitest";
import { buscarFontePrimaria, resolverGrupoEFonte, listarGruposComFonte } from "@/lib/catalogo";
import type { GrupoCatalogo } from "@/lib/types";

/** Açúcar para declarar um grupo com uma única fonte ativa. */
function grupoComFonte(nome: string, url: string): GrupoCatalogo {
  return { nome, fontes: [{ url, ativo: true }] };
}

describe("buscarFontePrimaria", () => {
  test("retorna a primeira URL ativa do grupo com nome idêntico", () => {
    const url = buscarFontePrimaria("STF", [grupoComFonte("STF", "https://a.gov.br")]);
    expect(url).toBe("https://a.gov.br");
  });

  test("tolera diferença de caixa e acento entre planilha e cadastro", () => {
    const url = buscarFontePrimaria("governador de sao paulo", [
      grupoComFonte("Governador de São Paulo", "https://gov.br/sp"),
    ]);
    expect(url).toBe("https://gov.br/sp");
  });

  test("escolhe o grupo certo quando há fontes de vários grupos", () => {
    const url = buscarFontePrimaria("STF", [
      grupoComFonte("STJ", "https://a.gov.br/stj"),
      grupoComFonte("STF", "https://a.gov.br/stf"),
    ]);
    expect(url).toBe("https://a.gov.br/stf");
  });

  test("retorna undefined quando não há fonte", () => {
    expect(buscarFontePrimaria("SEM", [])).toBeUndefined();
  });

  test("retorna undefined quando nenhum grupo corresponde", () => {
    const url = buscarFontePrimaria("STJ", [grupoComFonte("STF", "https://a.gov.br/stf")]);
    expect(url).toBeUndefined();
  });

  test("ignora fonte inativa e retorna undefined quando só há inativa", () => {
    const url = buscarFontePrimaria("STF", [
      { nome: "STF", fontes: [{ url: "https://antiga", ativo: false }] },
    ]);
    expect(url).toBeUndefined();
  });

  test("grupo correspondente sem nenhuma fonte retorna undefined", () => {
    const url = buscarFontePrimaria("STF", [{ nome: "STF", fontes: [] }]);
    expect(url).toBeUndefined();
  });

  test("casa um segmento quando o rótulo da planilha junta vários grupos com ponto e vírgula", () => {
    const url = buscarFontePrimaria(
      "MAILING RP - Sessão Especial; MAILING RP - Sessão Solene; Ministros do STF",
      [grupoComFonte("Ministros do STF", "https://stf.jus.br/min")],
    );
    expect(url).toBe("https://stf.jus.br/min");
  });

  test("escolhe a primeira fonte ativa na ordem do catálogo quando dois segmentos têm fonte", () => {
    // Regra nova (substitui "mais antiga por created_at" do banco): vence quem vem antes no array.
    const url = buscarFontePrimaria("MAILING RP - Sessão Solene; Ministros do STF", [
      grupoComFonte("Ministros do STF", "https://primeira.gov.br"),
      grupoComFonte("MAILING RP - Sessão Solene", "https://segunda.gov.br"),
    ]);
    expect(url).toBe("https://primeira.gov.br");
  });

  test("ignora segmentos vazios gerados por ponto e vírgula sobrando", () => {
    const url = buscarFontePrimaria("; Ministros do STF ;", [
      grupoComFonte("Ministros do STF", "https://stf.jus.br/min"),
    ]);
    expect(url).toBe("https://stf.jus.br/min");
  });

  test("sigla curta da planilha casa o nome formal cadastrado (contenção)", () => {
    // Planilha manda "CNJ"; cadastro tem o nome completo "Conselho Nacional de Justiça (CNJ)".
    const url = buscarFontePrimaria("CNJ; MAILING RP - Sessão Especial; MAILING RP - Sessão Solene", [
      grupoComFonte("Conselho Nacional de Justiça (CNJ)", "https://www.cnj.jus.br/composicao-atual/"),
    ]);
    expect(url).toBe("https://www.cnj.jus.br/composicao-atual/");
  });

  test("contenção não confunde siglas parecidas (CNJ ≠ CNMP)", () => {
    const url = buscarFontePrimaria("CNJ", [
      grupoComFonte("Conselho Nacional do Ministério Público (CNMP)", "https://cnmp"),
      grupoComFonte("Conselho Nacional de Justiça (CNJ)", "https://cnj"),
    ]);
    expect(url).toBe("https://cnj");
  });

  test("match exato tem precedência sobre contenção", () => {
    const url = buscarFontePrimaria("MAILING RP - Sessão Solene; Ministros do STF", [
      grupoComFonte("Ministros do STM", "https://stm"),
      grupoComFonte("Ministros do STF", "https://stf"),
    ]);
    expect(url).toBe("https://stf");
  });

  test("segmento curto demais (<3) não casa por contenção", () => {
    // "PR" (2 letras) não pode casar "Presidente da República" só porque cabe dentro.
    const url = buscarFontePrimaria("PR", [grupoComFonte("Presidente da República", "https://planalto")]);
    expect(url).toBeUndefined();
  });
});

describe("resolverGrupoEFonte", () => {
  test("grupo casado devolve nome canônico, URL e sem sugestões", () => {
    const r = resolverGrupoEFonte("CNJ; MAILING RP - Sessão Especial", [
      grupoComFonte("Conselho Nacional de Justiça (CNJ)", "https://cnj"),
    ]);
    expect(r.grupoCanonico).toBe("Conselho Nacional de Justiça (CNJ)");
    expect(r.url).toBe("https://cnj");
    expect(r.sugestoes).toHaveLength(0);
  });

  test("grupo casado sem fonte ativa devolve canônico com url indefinida", () => {
    const r = resolverGrupoEFonte("Defensor Público Geral da União", [
      { nome: "Defensor Público Geral da União", fontes: [] },
    ]);
    expect(r.grupoCanonico).toBe("Defensor Público Geral da União");
    expect(r.url).toBeUndefined();
  });

  test("nenhum grupo casa → sem canônico, com sugestões próximas", () => {
    const r = resolverGrupoEFonte("Governador de São Paulo", [grupoComFonte("Governadores", "https://gov")]);
    expect(r.grupoCanonico).toBeUndefined();
    expect(r.sugestoes).toContain("Governadores");
  });
});

describe("listarGruposComFonte", () => {
  test("mapeia responsáveis e marca temFonte com a primeira fonte ativa", () => {
    const grupos = listarGruposComFonte([
      {
        nome: "Ministros do STF",
        responsavel1: "Ramena",
        responsavel2: "Daniela",
        backup: "Maria Ines",
        emailResp1: "ramena@senado.leg.br",
        fontes: [{ url: "https://stf.jus.br/x", ativo: true }],
      },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].responsavel1).toBe("Ramena");
    expect(grupos[0].emailResp2).toBeUndefined();
    expect(grupos[0].temFonte).toBe(true);
    expect(grupos[0].fonteUrl).toBe("https://stf.jus.br/x");
  });

  test("ignora fontes inativas: temFonte falso e fonteUrl indefinida", () => {
    const grupos = listarGruposComFonte([
      { nome: "Governadores", responsavel1: "Marcus", fontes: [{ url: "https://antiga.gov.br", ativo: false }] },
    ]);
    expect(grupos[0].temFonte).toBe(false);
    expect(grupos[0].fonteUrl).toBeUndefined();
  });

  test("grupo sem fontes resulta em temFonte falso", () => {
    const grupos = listarGruposComFonte([{ nome: "Ex-Senadores", responsavel1: "Fernanda", fontes: [] }]);
    expect(grupos[0].temFonte).toBe(false);
  });

  test("ordena por nome e não muta o catálogo recebido", () => {
    const entrada: GrupoCatalogo[] = [
      { nome: "Zeladoria", fontes: [] },
      { nome: "Assessorias", fontes: [] },
    ];
    const grupos = listarGruposComFonte(entrada);
    expect(grupos.map((g) => g.nome)).toEqual(["Assessorias", "Zeladoria"]);
    expect(entrada.map((g) => g.nome)).toEqual(["Zeladoria", "Assessorias"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/catalogo.test.ts`
Expected: FAIL — não resolve `@/lib/catalogo`.

- [ ] **Step 3: Implementar `lib/catalogo.ts`**

```typescript
import { normalizarTexto } from "@/lib/normalize";
import { sugerirGrupos } from "@/lib/match";
import { CATALOGO } from "@/data/catalogo";
import type { FonteCatalogo, GrupoCadastro, GrupoCatalogo } from "@/lib/types";

/**
 * Quebra o rótulo "Grupo" da planilha em segmentos normalizados.
 * No Sistema Contatos uma mesma autoridade pertence a vários mailings ao mesmo
 * tempo, e a célula "Grupo" vem com eles colados por ";" (ex.: "MAILING RP -
 * Sessão Especial; ...; Ministros do STF"). Cada segmento é um grupo candidato
 * que pode ter fonte oficial cadastrada.
 */
function segmentarGrupo(grupoNome: string): string[] {
  return grupoNome
    .split(";")
    .map((s) => normalizarTexto(s))
    .filter((s) => s.length > 0);
}

const TAMANHO_MIN_SEGMENTO = 3;

/** Casa um nome de grupo normalizado contra um segmento da planilha. */
function casaSegmento(nomeNorm: string, seg: string): boolean {
  // Contenção: a sigla curta da planilha ("cnj") cabe no nome formal cadastrado
  // ("conselho nacional de justica (cnj)"). Guarda de tamanho evita que pedaços
  // de 1-2 letras casem grupos longos por engano (ex.: "pr" em "presidente...").
  return seg.length >= TAMANHO_MIN_SEGMENTO && (nomeNorm === seg || nomeNorm.includes(seg));
}

/**
 * Filtra os grupos que casam com algum segmento da planilha.
 * Exato-primeiro: se algum grupo casa exatamente um segmento, só esses contam
 * (preserva casos já corretos, como "Ministros do STF"). Só quando não há
 * nenhum exato cai para a contenção (sigla curta dentro do nome formal).
 */
function gruposQueCasam(
  grupos: readonly GrupoCatalogo[],
  segmentos: string[],
): GrupoCatalogo[] {
  const exatos = grupos.filter((g) => segmentos.includes(normalizarTexto(g.nome)));
  if (exatos.length > 0) return exatos;
  return grupos.filter((g) => segmentos.some((seg) => casaSegmento(normalizarTexto(g.nome), seg)));
}

/**
 * Fonte primária dentre os grupos casados: a **primeira ativa na ordem do
 * catálogo**. No schema Postgres anterior era a mais antiga por `created_at`;
 * sem banco, a ordem do array é o critério — explícita e revisável no diff.
 */
function fontePrimariaDe(grupos: readonly GrupoCatalogo[]): FonteCatalogo | undefined {
  return grupos.flatMap((g) => g.fontes).find((f) => f.ativo);
}

/** Resolução de grupo: casamento com o cadastro + fonte oficial + sugestões. */
export interface FonteResolvida {
  /** Nome do grupo como cadastrado. `undefined` quando nenhum grupo casa. */
  grupoCanonico?: string;
  /** URL oficial primária ativa, se o grupo casado tiver fonte cadastrada. */
  url?: string;
  /** Quando nada casa: nomes cadastrados mais próximos, para orientar o usuário. */
  sugestoes: string[];
}

/**
 * Busca a URL oficial primária de um grupo.
 * A junção planilha↔catálogo é por nome, comparado normalizado (sem acento, sem
 * caixa) e por segmento — o rótulo da planilha pode juntar vários grupos com ";",
 * então casa qualquer segmento contra o cadastro, evitando falsos "sem fonte".
 */
export function buscarFontePrimaria(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): string | undefined {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return undefined;
  return fontePrimariaDe(gruposQueCasam(catalogo, segmentos))?.url;
}

/**
 * Resolve o rótulo da planilha para o grupo cadastrado e sua fonte oficial.
 * Sempre devolve um objeto: com `grupoCanonico` quando casa (e `url` se houver
 * fonte), ou só com `sugestoes` (nomes próximos) quando nenhum grupo casa — para
 * a UI orientar o usuário a alinhar a planilha em vez de um beco sem saída.
 */
export function resolverGrupoEFonte(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): FonteResolvida {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return { sugestoes: [] };

  const casados = gruposQueCasam(catalogo, segmentos);
  if (casados.length === 0) {
    return { sugestoes: sugerirGrupos(segmentos, catalogo.map((g) => g.nome)) };
  }

  const primaria = fontePrimariaDe(casados);
  // Prefere o nome do grupo que de fato fornece a fonte primária; senão, o 1º casado.
  const canonico = casados.find((g) => g.fontes.some((f) => f.ativo && f.url === primaria?.url));
  return { grupoCanonico: (canonico ?? casados[0]).nome, url: primaria?.url, sugestoes: [] };
}

function mapearGrupo(grupo: GrupoCatalogo): GrupoCadastro {
  const fonteAtiva = grupo.fontes.find((f) => f.ativo);
  return {
    nome: grupo.nome,
    responsavel1: grupo.responsavel1,
    responsavel2: grupo.responsavel2,
    backup: grupo.backup,
    emailResp1: grupo.emailResp1,
    emailResp2: grupo.emailResp2,
    emailBackup: grupo.emailBackup,
    fonteUrl: fonteAtiva?.url,
    temFonte: fonteAtiva !== undefined,
  };
}

/**
 * Lista os grupos do catálogo com seus responsáveis e o status de fonte oficial.
 * Alimenta a tela de visualização (/grupos). Ordenado por nome; não muta a entrada.
 */
export function listarGruposComFonte(
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): GrupoCadastro[] {
  return [...catalogo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(mapearGrupo);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/catalogo.test.ts`
Expected: PASS (21 testes)

- [ ] **Step 5: Remover os arquivos do Supabase**

```bash
git rm lib/supabase.ts tests/supabase.test.ts
```

Neste ponto `npm run typecheck` **vai falhar** em `lib/analise.ts`, `app/api/analise/route.ts` e `app/grupos/page.tsx`, que ainda importam `@/lib/supabase`. É esperado; a Task 3 conserta.

- [ ] **Step 6: Commit**

```bash
git add lib/catalogo.ts tests/catalogo.test.ts
git commit -m "feat: lib/catalogo.ts lê o catálogo versionado; remove lib/supabase.ts"
```

---

### Task 3: Ligar os call sites

Troca as três referências restantes ao Supabase e devolve a árvore a um estado compilável e verde.

**Files:**
- Modify: `lib/analise.ts:13` (import) e `lib/analise.ts:26` (tipo de `resolverFonte`)
- Modify: `app/api/analise/route.ts:4,27-32`
- Modify: `app/grupos/page.tsx:1-32`

**Interfaces:**
- Consumes: `resolverGrupoEFonte`, `listarGruposComFonte`, `FonteResolvida` de `@/lib/catalogo` (Task 2)
- Produces: `Dependencias.resolverFonte: (grupo: string) => FonteResolvida` — agora síncrono

- [ ] **Step 1: Ajustar `lib/analise.ts`**

Troque o import da linha 13:

```typescript
import type { FonteResolvida } from "@/lib/catalogo";
```

E o campo em `Dependencias` (linha ~26):

```typescript
  /** Resolve o rótulo da planilha para grupo canônico + URL oficial. Síncrono: lê o catálogo versionado. */
  resolverFonte: (grupo: string) => FonteResolvida;
```

O `const resolvida = await deps.resolverFonte(grupo);` em `analisarGrupo` **não muda** — `await` sobre valor não-promise é válido e mantém o restante da função intacta.

- [ ] **Step 2: Ajustar `app/api/analise/route.ts`**

Troque o import da linha 4:

```typescript
import { resolverGrupoEFonte } from "@/lib/catalogo";
```

E o bloco de dependências (remova a linha `const supabase = criarClienteServidor();`):

```typescript
    const deps: Dependencias = {
      resolverFonte: (grupo) => resolverGrupoEFonte(grupo),
      raspar,
      extrairComposicao: (grupoCanonico, textoLimpo) => extrairComposicao(grupoCanonico, textoLimpo),
    };
```

- [ ] **Step 3: Reescrever `app/grupos/page.tsx`**

O `try/catch` e o banner de erro saem: sem rede, não há caminho de falha. A página deixa de ser `async` e perde o `force-dynamic` — passa a ser pré-renderizada no build.

```tsx
import Link from "next/link";
import { listarGruposComFonte } from "@/lib/catalogo";
import type { GrupoCadastro } from "@/lib/types";

export const runtime = "nodejs";

function FonteStatus({ grupo }: { grupo: GrupoCadastro }) {
  if (!grupo.temFonte) {
    return <span className="text-amber-600">— sem fonte</span>;
  }
  return (
    <a
      href={grupo.fonteUrl}
      target="_blank"
      rel="noreferrer"
      className="text-blue-700 underline break-all"
    >
      {grupo.fonteUrl}
    </a>
  );
}

export default function GruposPage() {
  const grupos = listarGruposComFonte();
  const comFonte = grupos.filter((g) => g.temFonte).length;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Grupos cadastrados</h1>
        <Link href="/" className="text-sm underline">
          ← Análise de planilha
        </Link>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        {grupos.length} grupos · {comFonte} com fonte oficial · {grupos.length - comFonte} sem
        fonte
      </p>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="p-2">Grupo</th>
              <th className="p-2">Responsável 1</th>
              <th className="p-2">Responsável 2</th>
              <th className="p-2">Backup</th>
              <th className="p-2">Fonte oficial</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.nome} className="border-t border-gray-100 align-top">
                <td className="p-2 font-medium">{g.nome}</td>
                <td className="p-2">
                  {g.responsavel1 ?? "—"}
                  {g.emailResp1 && <div className="text-xs text-gray-500">{g.emailResp1}</div>}
                </td>
                <td className="p-2">
                  {g.responsavel2 ?? "—"}
                  {g.emailResp2 && <div className="text-xs text-gray-500">{g.emailResp2}</div>}
                </td>
                <td className="p-2">
                  {g.backup ?? "—"}
                  {g.emailBackup && <div className="text-xs text-gray-500">{g.emailBackup}</div>}
                </td>
                <td className="p-2">
                  <FonteStatus grupo={g} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Confirmar que não sobrou nenhuma referência ao Supabase no código**

Run: `grep -rn "@/lib/supabase\|createClient\|criarClienteServidor\|SUPABASE_" lib app tests data --include=*.ts --include=*.tsx`
Expected: nenhuma saída.

O padrão busca **imports e identificadores**, não a palavra solta: o cabeçalho de `data/catalogo.ts` cita o Supabase ao explicar a origem dos dados, e isso é intencional.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Suíte completa**

Run: `npm test`
Expected: **todos** os testes passam — incluindo `analise`, `match`, `scrape`, `planilha`, `normalize`, que não foram tocados. Qualquer falha fora de `catalogo*` significa que a troca vazou para onde não devia.

- [ ] **Step 7: Build de produção**

Run: `npm run build`
Expected: build conclui sem erro. Observe a tabela de rotas: com o `force-dynamic` removido, `/grupos` tende a ser pré-renderizada (`○`) em vez de dinâmica (`ƒ`). Isso é um bônus, **não** um critério de aprovação — se sair dinâmica, siga em frente e registre a observação.

- [ ] **Step 8: Commit**

```bash
git add lib/analise.ts app/api/analise/route.ts app/grupos/page.tsx
git commit -m "feat: call sites usam o catálogo versionado; /grupos volta a renderizar"
```

---

### Task 4: Limpeza de dependência, ambiente e documentação

Remove a dependência morta e alinha a documentação com a arquitetura nova. Sem isso, o próximo leitor do repositório recebe instruções que não funcionam mais.

**Files:**
- Modify: `package.json` (remove `@supabase/supabase-js`)
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remover a dependência**

```bash
npm uninstall @supabase/supabase-js
```

- [ ] **Step 2: Reescrever `.env.example`**

O app passa a não ter nenhuma variável obrigatória:

```bash
# =============================================================================
# Fiscal de Mailings — variáveis de ambiente
# Copie este arquivo para .env.local se for usar a Camada B.
# Nunca commitar .env.local.
#
# O app roda SEM NENHUMA variável obrigatória: o catálogo de grupos e fontes
# oficiais vive em data/catalogo.ts, versionado no repositório.
# =============================================================================

# -----------------------------------------------------------------------------
# Anthropic Claude Haiku (OPCIONAL — Camada B)
# -----------------------------------------------------------------------------
# Quando definida, ativa a Camada B: (1) extração estruturada da composição a
# partir da página oficial já raspada (corrige cargos e limpa "novos") e
# (2) a pesquisa ampla complementar (2ª etapa) para fontes não resolvidas pela
# URL oficial, pelo conhecimento do modelo (rotulada como não oficial).
# Sem essa chave, o app usa só a Camada A determinística sobre a URL oficial.
# Obtenha em: https://console.anthropic.com  (modelo: claude-haiku-4-5)
# ANTHROPIC_API_KEY=
```

- [ ] **Step 3: Atualizar o `README.md`**

Quatro trechos mudam:

1. Em **Stack**, troque a linha do banco por:

```markdown
- **Catálogo:** `data/catalogo.ts` — arquivo TypeScript versionado com os grupos e as URLs oficiais. **Sem banco de dados**; sem histórico de análises
```

2. Em **Setup local**, substitua todo o bloco de pré-requisitos, `.env.local` e **Banco** por:

````markdown
> Pré-requisitos: Node 20+.

```bash
npm install
npm run dev
# abre em http://localhost:3000
```

Não há banco para configurar nem variável de ambiente obrigatória.
````

3. Em **Variáveis de ambiente**, deixe só:

```markdown
| Variável | Obrigatória? | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | não | Ativa a Camada B (Claude Haiku): extração estruturada da composição. Sem ela, só a camada determinística roda. |
```

4. Em **Cadastro de URLs oficiais**, substitua o parágrafo por:

```markdown
O cadastro das URLs por órgão é **manual**: o arquivo [data/catalogo.ts](data/catalogo.ts) é a fonte da verdade. Para adicionar um órgão novo, acrescente uma entrada no array e commite — o `tsc` valida no build. A primeira fonte com `ativo: true` é a primária do grupo.

Por que manual? Cada URL oficial é checada antes de entrar — é o que garante que a comparação não vai trazer lixo de notícias, Wikipedia ou páginas antigas.

> **Histórico:** `supabase/migrations/`, `data/*.sql` e `scripts/apply-migrations.mjs` são resquícios da fase em que o catálogo vivia num Postgres no Supabase. Ficam no repositório como registro de proveniência e **não fazem parte do caminho de execução**. Ver [o spec da migração](docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md).
```

- [ ] **Step 4: Atualizar o `CLAUDE.md`**

Quatro trechos mudam:

1. **Stack (fixa):** remova `Supabase (Postgres)` da lista.

2. **Layout do código:** substitua as duas linhas afetadas por:

```
lib/         ← lógica pura: planilha, catalogo, scrape, match, gemini, normalize
data/        ← catalogo.ts (fonte da verdade de grupos/fontes) + SQL histórico
supabase/migrations/  ← histórico; fora do caminho de execução
```

3. **Princípios de implementação:** substitua o bullet "Sem histórico no banco" e o "Fontes cadastradas manualmente" por:

```markdown
- **Sem banco de dados.** O catálogo de grupos e fontes vive em `data/catalogo.ts`, versionado. Não reintroduzir Postgres/Supabase sem um novo spec. Resultado de análise continua em memória durante a request. Ver `docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md`.
- **Fontes cadastradas manualmente** em `data/catalogo.ts`. Não implementar cadastro/descoberta automática de URLs — a pesquisa ampla da 2ª etapa é leitura efêmera e nunca persiste URLs.
```

4. **Workflow** e **O que NÃO fazer:** troque as regras que citam migration e tabelas por:

```markdown
2. Nova URL oficial → acrescentar em `data/catalogo.ts` e rodar `npm run typecheck`.
```

```markdown
- Não reintroduzir banco de dados (Supabase, Postgres, ORM) sem novo spec.
- Não persistir resultados de análise.
```

- [ ] **Step 5: Verificar que a árvore continua sã**

Run: `npm run typecheck && npm test && npm run build`
Expected: tudo verde. (A remoção da dependência não deve afetar nada — o código que a usava já saiu na Task 2.)

- [ ] **Step 6: Confirmar que a dependência sumiu**

Run: `grep -rn "supabase" package.json README.md CLAUDE.md .env.example`
Expected: apenas as menções **históricas** intencionais no README e no CLAUDE.md (a linha de `supabase/migrations/` e a nota de histórico). Nenhuma menção em `package.json` nem em `.env.example`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.example README.md CLAUDE.md
git commit -m "chore: remove dependência do Supabase e alinha documentação"
```

---

### Task 5: Verificação local ponta a ponta

O critério de pronto acordado com o Clovis: a `/grupos` renderizando as 33 linhas na máquina dele, sem nenhum setup.

**Files:** nenhum — é verificação.

- [ ] **Step 1: Subir o servidor de desenvolvimento**

Run: `npm run dev`
Expected: `Ready` em `http://localhost:3000`, sem aviso de variável de ambiente faltando.

- [ ] **Step 2: Conferir a `/grupos`**

Abra `http://localhost:3000/grupos`.

Confira:
- **não** aparece o banner vermelho "Não foi possível carregar os grupos";
- o resumo mostra **33 grupos · 21 com fonte oficial · 12 sem fonte**;
- a tabela tem 33 linhas com acentuação correta (`Conselho Nacional de Justiça (CNJ)`);
- as URLs da coluna "Fonte oficial" são links clicáveis.

- [ ] **Step 3: Conferir a home**

Abra `http://localhost:3000`. A tela de upload deve renderizar normalmente — ela não depende do catálogo, e serve para confirmar que nada mais quebrou.

- [ ] **Step 4: Registrar o resultado**

Se os três passos acima estiverem corretos, a migração está completa localmente. O deploy na Vercel publica a correção em produção.

---

## Pós-implementação — ações do Clovis (fora do código)

1. Fazer merge/deploy e confirmar `https://mailings-theta.vercel.app/grupos` renderizando.
2. Apagar as 3 variáveis Supabase nas configurações do projeto na Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) — passaram a ser lixo.
3. Apagar o projeto pausado no Supabase, liberando o slot do plano free.
