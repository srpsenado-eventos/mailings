# Varredura Posse 2027 — Fundação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app abre atrás de uma senha mostrando o último retrato da lista da Posse 2027, com varredura agendada e botão de atualizar, sem investigação por busca ainda.

**Architecture:** Lista e retrato persistem como JSON no Vercel Blob privado atrás de uma interface `Armazem` injetada. A varredura reaproveita `analisarGrupo` de `lib/analise.ts` por grupo, com checkpoint no retrato e retomada. O painel (`/`) é Server Component que lê o Blob; o botão de atualizar é Client Component que chama `/api/varredura` e consulta `/api/retrato`. Middleware valida um cookie HMAC.

**Tech Stack:** Next.js 15.5 (App Router), TypeScript, Tailwind, `@vercel/blob`, `@vercel/config` (cron em `vercel.ts`), Web Crypto (HMAC), Vitest. Prova descartável com `puppeteer-core` + `@sparticuz/chromium`.

**Spec:** `docs/superpowers/specs/2026-09-04-varredura-continua-posse-2027-design.md` (§3 a §7, §9 parcial, §10, §11, §14). A investigação (§8) fica para o plano seguinte, `2026-09-XX-varredura-posse-2027-investigacao.md`, escrito após este.

## Global Constraints

- `lib/*.ts` são funções puras; Blob, relógio, rede e reinvocação entram por injeção (`Dependencias`, `Armazem`).
- Nenhum teste toca a internet. Fixtures em `tests/fixtures/`.
- Sem `any`. `unknown` + narrowing.
- Sem PII em `console.*`: só nome de grupo, URL, contagens e motivo técnico.
- Repositório é público: `Agrupador PP27/` e `Regras de Atualizacao/*.pdf` já estão no `.gitignore`; nada da lista entra no git.
- Gerenciador de pacotes: **npm**. Não commitar `pnpm-lock.yaml`/`pnpm-workspace.yaml`.
- Modelos: extração continua `claude-haiku-4-5` (não muda neste plano).
- Rótulos de UI em português; sem travessão no lugar de vírgula em texto novo.
- Antes de cada commit: `npm test` e `npm run typecheck` verdes.
- Commits seguem `<type>: <descrição>` e terminam com as linhas de atribuição já usadas no repositório:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01ACNVh6sqmk12SiD8NGwDPU
  ```

## Estado de partida

Branch `feat/mvp-fiscal`, commit `92cfae1`. Há mudanças não commitadas de uma sessão anterior que **fazem parte deste trabalho** e entram no commit da Task 2: `CLAUDE.md` reescrito, `.gitignore` ampliado, `.claude/settings.local.json` removido do índice (`git rm --cached`, já staged). Não reverter.

Suíte: 10 arquivos, 109 testes verdes. `npm run typecheck` limpo.

## File Structure

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `app/api/prova-chromium/route.ts` | **Descartável.** Lê o TCU com Chromium na Vercel e devolve contagem de nomes | 1 |
| `lib/types.ts` | Tipos novos: `ResponsaveisGrupo`, `ListaPosse`, `Retrato` e família, `ContatoPlanilha.alteradoEm` | 2, 3, 7 |
| `data/catalogo.ts` | Sai responsáveis; entra `apelidos`, `faixaPais`, `ignorar` | 2 |
| `lib/catalogo.ts` | `resolverGrupoEFonte` com apelidos, faixa de país e `urls[]`; `listarGruposComFonte` sem responsáveis; `gruposIgnorados` | 2 |
| `lib/planilha.ts` | Colunas extras toleradas; `Data Alteração` → `alteradoEm` ISO | 3 |
| `lib/analise-payload.ts` | `alteradoEm` no narrow; `parsePayloadLista` (contatos + responsáveis) | 3, 6 |
| `lib/analise.ts` | `analisarGrupo` exportado; lê todas as `urls` e mescla | 2 |
| `lib/armazem.ts` | Interface `Armazem` + `armazemEmMemoria()` | 4 |
| `lib/armazem-blob.ts` | Implementação com `@vercel/blob` (privado) | 4 |
| `lib/sessao.ts` | Cookie HMAC: `criarToken`, `validarToken`, `compararSenha` | 5 |
| `middleware.ts` | Bloqueia tudo exceto `/entrar`, `/api/entrar` e cron com `CRON_SECRET` | 5 |
| `app/entrar/page.tsx`, `app/api/entrar/route.ts` | Tela e rota de senha, atraso progressivo | 5 |
| `app/enviar-lista/page.tsx`, `components/enviar-lista-form.tsx`, `app/api/lista/route.ts` | Upload da lista da Posse e dos responsáveis | 6 |
| `lib/varredura.ts` | `executarVarredura`: trava, checkpoint, retomada, resumo | 7 |
| `app/api/varredura/route.ts`, `app/api/retrato/route.ts`, `vercel.ts` | Rotas e cron | 7 |
| `lib/diferenca.ts` | "Mudou desde a última varredura" | 8 |
| `app/page.tsx`, `components/painel-*.tsx`, `app/analise/page.tsx` | Painel com duas visões; análise avulsa antiga movida para `/analise` | 9 |
| `app/grupos/page.tsx` | Responsáveis vindos do Blob | 9 |
| `lib/export.ts` | Colunas "Link oficial" e "Última alteração no Contatos" | 9 |
| `CLAUDE.md`, `.env.example`, `README.md` | Regras revogadas, variáveis novas | 10 |

---

### Task 1: Prova descartável do Chromium na Vercel

Decide se o degrau 2 da cascata (§8a do spec) entra no plano de investigação. Nada desta task sobrevive além de um adendo no spec.

**Files:**
- Create: `app/api/prova-chromium/route.ts`
- Modify: `package.json` (dependências temporárias), `next.config.ts`
- Modify: `docs/superpowers/specs/2026-09-04-varredura-continua-posse-2027-design.md` (adendo §16)

**Interfaces:**
- Produces: só o adendo no spec com o veredito `chromium: viável | inviável` e o motivo.

- [ ] **Step 1: Instalar as dependências da prova**

Run: `npm install puppeteer-core@24 @sparticuz/chromium@138`
Expected: sem erro. Se a versão 138 não existir, usar a maior publicada (`npm view @sparticuz/chromium versions --json | tail -5`) e anotar no adendo.

- [ ] **Step 2: Marcar os pacotes como externos ao bundle**

`next.config.ts`:
```ts
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["jsdom", "puppeteer-core", "@sparticuz/chromium"],
};
export default nextConfig;
```

- [ ] **Step 3: Escrever a rota descartável**

`app/api/prova-chromium/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { extrairConteudo } from "@/lib/scrape";

export const runtime = "nodejs";
export const maxDuration = 120;

/** PROVA DESCARTÁVEL (Task 1 do plano de fundação). Remover após registrar o veredito no spec. */
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = "https://portal.tcu.gov.br/autoridades";
  const inicio = Date.now();
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 40_000 });
    const html = await page.content();
    const conteudo = extrairConteudo(html, url);
    return NextResponse.json({
      ok: true,
      ms: Date.now() - inicio,
      htmlBytes: html.length,
      pessoas: conteudo.pessoas.length,
      amostra: conteudo.pessoas.slice(0, 3).map((p) => p.cargo ?? ""), // só cargos, sem nomes
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, ms: Date.now() - inicio, erro: err instanceof Error ? err.message : "erro" },
      { status: 500 },
    );
  } finally {
    await browser?.close();
  }
}
```

- [ ] **Step 4: Typecheck e build local**

Run: `npm run typecheck && npm run build`
Expected: ambos sem erro. O build pode avisar sobre o tamanho do pacote; anotar o número.

- [ ] **Step 5: Publicar em preview e chamar a rota**

Run (com a CLI da Vercel instalada, `npm i -g vercel`, e o projeto linkado):
```bash
vercel env add CRON_SECRET preview   # gerar valor com: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
vercel deploy
curl -s -H "Authorization: Bearer <CRON_SECRET>" https://<url-do-preview>/api/prova-chromium
```
Expected: JSON com `ok: true`, `pessoas` maior que 0 e `ms` menor que 60000. Qualquer outra coisa é veredito "inviável" com o `erro` e o `ms` anotados.

- [ ] **Step 6: Registrar o veredito no spec**

Acrescentar ao final da §16 do spec:
```markdown
### Adendo 2026-09-XX: prova do Chromium na Vercel

Veredito: **viável** | **inviável**. Pacote de build: N MB. Tempo da leitura do TCU: N ms. Pessoas extraídas: N.
Motivo (se inviável): <erro>.
Consequência: o degrau 2 da cascata (§8a) entra | sai do plano de investigação.
```

- [ ] **Step 7: Remover a prova**

```bash
git rm app/api/prova-chromium/route.ts
npm uninstall puppeteer-core @sparticuz/chromium
```
Restaurar `next.config.ts` para `serverExternalPackages: ["jsdom"]`. Se o veredito foi "viável", o plano de investigação reinstala as mesmas versões.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-09-04-varredura-continua-posse-2027-design.md next.config.ts package.json package-lock.json
git commit -m "docs: adendo com o veredito da prova do Chromium na Vercel"
```

---

### Task 2: Catálogo com apelidos, faixa de país, grupos ignorados e várias fontes

**Files:**
- Modify: `lib/types.ts:125-158`
- Modify: `data/catalogo.ts` (todos os grupos)
- Modify: `lib/catalogo.ts`
- Modify: `lib/analise.ts:25-100`
- Modify: `app/grupos/page.tsx` (compila sem responsáveis; a versão final vem na Task 9)
- Test: `tests/catalogo.test.ts`, `tests/catalogo-dados.test.ts`, `tests/analise.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/types.ts
  export interface GrupoCatalogo { nome: string; apelidos?: string[]; faixaPais?: { de: string; ate: string }; ignorar?: boolean; fontes: FonteCatalogo[] }
  export interface GrupoCadastro { nome: string; fontes: string[]; fonteUrl?: string; temFonte: boolean; ignorar: boolean }
  // lib/catalogo.ts
  export interface FonteResolvida { grupoCanonico?: string; url?: string; urls: string[]; ignorado: boolean; sugestoes: string[] }
  export function resolverGrupoEFonte(grupoNome: string, catalogo?: readonly GrupoCatalogo[], pais?: string): FonteResolvida
  export function listarGruposComFonte(catalogo?: readonly GrupoCatalogo[]): GrupoCadastro[]
  // lib/analise.ts
  export async function analisarGrupo(grupo: string, contatos: ContatoPlanilha[], deps: Dependencias): Promise<ResultadoGrupo>
  export interface Dependencias { resolverFonte: (grupo: string, pais?: string) => FonteResolvida; raspar: (url: string) => Promise<ConteudoFonte>; extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]> }
  ```

- [ ] **Step 1: Escrever os testes novos de catálogo (vão falhar)**

Substituir o `describe("resolverGrupoEFonte")` e o `describe("listarGruposComFonte")` de `tests/catalogo.test.ts` por:

```ts
describe("resolverGrupoEFonte", () => {
  test("grupo casado devolve nome canônico, URL primária, todas as urls e sem sugestões", () => {
    const r = resolverGrupoEFonte("CNJ; MAILING RP - Sessão Especial", [
      grupoComFonte("Conselho Nacional de Justiça (CNJ)", "https://cnj"),
    ]);
    expect(r.grupoCanonico).toBe("Conselho Nacional de Justiça (CNJ)");
    expect(r.url).toBe("https://cnj");
    expect(r.urls).toEqual(["https://cnj"]);
    expect(r.ignorado).toBe(false);
    expect(r.sugestoes).toHaveLength(0);
  });

  test("grupo casado sem fonte ativa devolve canônico com url indefinida e urls vazio", () => {
    const r = resolverGrupoEFonte("Defensor Público Geral da União", [
      { nome: "Defensor Público Geral da União", fontes: [] },
    ]);
    expect(r.grupoCanonico).toBe("Defensor Público Geral da União");
    expect(r.url).toBeUndefined();
    expect(r.urls).toEqual([]);
  });

  test("nenhum grupo casa → sem canônico, com sugestões próximas", () => {
    const r = resolverGrupoEFonte("Governador de São Paulo", [grupoComFonte("Governadores", "https://gov")]);
    expect(r.grupoCanonico).toBeUndefined();
    expect(r.sugestoes).toContain("Governadores");
  });

  test("apelido tem precedência sobre contenção e similaridade", () => {
    const r = resolverGrupoEFonte("Defensor", [
      grupoComFonte("Defensoria Pública do DF", "https://errado"),
      { nome: "Defensor Público Geral da União", apelidos: ["Defensor"], fontes: [{ url: "https://dpu", ativo: true }] },
    ]);
    expect(r.grupoCanonico).toBe("Defensor Público Geral da União");
    expect(r.url).toBe("https://dpu");
  });

  test("apelido compara normalizado (caixa e acento)", () => {
    const r = resolverGrupoEFonte("presidente do senado federal", [
      { nome: "Presidente do Senado", apelidos: ["Presidente do Senado Federal"], fontes: [] },
    ]);
    expect(r.grupoCanonico).toBe("Presidente do Senado");
  });

  test("várias fontes ativas: urls traz todas na ordem e url é a primeira", () => {
    const r = resolverGrupoEFonte("Governadores", [
      { nome: "Governadores", fontes: [
        { url: "https://ac.gov.br", ativo: true },
        { url: "https://antiga", ativo: false },
        { url: "https://al.gov.br", ativo: true },
      ] },
    ]);
    expect(r.url).toBe("https://ac.gov.br");
    expect(r.urls).toEqual(["https://ac.gov.br", "https://al.gov.br"]);
  });

  test("grupo ignorado devolve ignorado: true e nenhuma url", () => {
    const r = resolverGrupoEFonte("Grupo Eventos - PP 2027 - PILOTO", [
      { nome: "Grupo Eventos - PP 2027 - PILOTO", ignorar: true, fontes: [] },
    ]);
    expect(r.ignorado).toBe(true);
    expect(r.grupoCanonico).toBe("Grupo Eventos - PP 2027 - PILOTO");
    expect(r.urls).toEqual([]);
  });

  const embaixadores: GrupoCatalogo[] = [
    { nome: "Embaixadores ( África do Sul até EUA)", apelidos: ["Embaixadores"], faixaPais: { de: "África do Sul", ate: "EUA" }, fontes: [{ url: "https://mre/1", ativo: true }] },
    { nome: "Embaixadores (Filipinas até Noruega)", apelidos: ["Embaixadores"], faixaPais: { de: "Filipinas", ate: "Noruega" }, fontes: [{ url: "https://mre/2", ativo: true }] },
    { nome: "Embaixadores (Nova Zelândia até Zimbábue)", apelidos: ["Embaixadores"], faixaPais: { de: "Nova Zelândia", ate: "Zimbábue" }, fontes: [{ url: "https://mre/3", ativo: true }] },
  ];

  test("apelido comum a vários grupos escolhe pela faixa de país (Departamento)", () => {
    expect(resolverGrupoEFonte("Embaixadores", embaixadores, "Japão").grupoCanonico).toBe("Embaixadores (Filipinas até Noruega)");
    expect(resolverGrupoEFonte("Embaixadores", embaixadores, "Suécia").grupoCanonico).toBe("Embaixadores (Nova Zelândia até Zimbábue)");
    expect(resolverGrupoEFonte("Embaixadores", embaixadores, "Alemanha").grupoCanonico).toBe("Embaixadores ( África do Sul até EUA)");
  });

  test("faixa de país inclui os extremos e ignora o prefixo 'Embaixada do'", () => {
    expect(resolverGrupoEFonte("Embaixadores", embaixadores, "Noruega").grupoCanonico).toBe("Embaixadores (Filipinas até Noruega)");
    expect(resolverGrupoEFonte("Embaixadores", embaixadores, "Embaixada do Reino dos Países Baixos").grupoCanonico).toBe("Embaixadores (Nova Zelândia até Zimbábue)");
  });

  test("sem país, ou país fora de toda faixa, cai no primeiro grupo do apelido", () => {
    expect(resolverGrupoEFonte("Embaixadores", embaixadores).grupoCanonico).toBe("Embaixadores ( África do Sul até EUA)");
    expect(resolverGrupoEFonte("Embaixadores", embaixadores, "").grupoCanonico).toBe("Embaixadores ( África do Sul até EUA)");
  });
});

describe("listarGruposComFonte", () => {
  test("marca temFonte com a primeira fonte ativa e lista todas as ativas", () => {
    const grupos = listarGruposComFonte([
      { nome: "Ministros do STF", fontes: [{ url: "https://stf.jus.br/x", ativo: true }, { url: "https://stf.jus.br/y", ativo: true }] },
    ]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].temFonte).toBe(true);
    expect(grupos[0].fonteUrl).toBe("https://stf.jus.br/x");
    expect(grupos[0].fontes).toEqual(["https://stf.jus.br/x", "https://stf.jus.br/y"]);
    expect(grupos[0].ignorar).toBe(false);
  });

  test("ignora fontes inativas: temFonte falso e fonteUrl indefinida", () => {
    const grupos = listarGruposComFonte([
      { nome: "Governadores", fontes: [{ url: "https://antiga.gov.br", ativo: false }] },
    ]);
    expect(grupos[0].temFonte).toBe(false);
    expect(grupos[0].fonteUrl).toBeUndefined();
    expect(grupos[0].fontes).toEqual([]);
  });

  test("grupo ignorado sai com ignorar: true", () => {
    const grupos = listarGruposComFonte([{ nome: "PILOTO", ignorar: true, fontes: [] }]);
    expect(grupos[0].ignorar).toBe(true);
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

Em `tests/catalogo-dados.test.ts`, substituir os dois primeiros testes e acrescentar três:

```ts
  test("tem os 34 grupos: 33 migrados do banco + o grupo PILOTO ignorado", () => {
    expect(CATALOGO).toHaveLength(34);
  });

  test("tem as 21 fontes migradas do banco", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(21);
  });

  test("nenhum grupo carrega responsáveis (saíram do repositório público)", () => {
    const comResp = CATALOGO.filter((g) => "responsavel1" in g || "emailResp1" in g);
    expect(comResp).toEqual([]);
  });

  test("apelidos da planilha da Posse resolvem os grupos certos", () => {
    const casos: [string, string][] = [
      ["CNJ", "Conselho Nacional de Justiça (CNJ)"],
      ["Defensor", "Defensor Público Geral da União"],
      ["Presidente do Senado Federal", "Presidente do Senado"],
      ["Ministros do STF", "Ministros do STF"],
    ];
    for (const [rotulo, esperado] of casos) {
      expect(resolverGrupoEFonte(rotulo).grupoCanonico, rotulo).toBe(esperado);
    }
  });

  test("os três grupos de embaixadores compartilham o apelido e têm faixa de país", () => {
    const emb = CATALOGO.filter((g) => g.apelidos?.includes("Embaixadores"));
    expect(emb).toHaveLength(3);
    expect(emb.every((g) => g.faixaPais !== undefined)).toBe(true);
  });

  test("o grupo PILOTO está marcado como ignorado", () => {
    const piloto = CATALOGO.find((g) => g.nome === "Grupo Eventos - PP 2027 - PILOTO");
    expect(piloto?.ignorar).toBe(true);
  });
```
Adicionar `import { resolverGrupoEFonte } from "@/lib/catalogo";` no topo do arquivo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/catalogo.test.ts tests/catalogo-dados.test.ts`
Expected: FAIL por tipo (`apelidos`, `faixaPais`, `ignorar`, `urls`, `ignorado` inexistentes) e por contagem (33 ≠ 34).

- [ ] **Step 3: Atualizar os tipos**

Em `lib/types.ts`, substituir `GrupoCadastro` (linhas 125-137) e `GrupoCatalogo` (linhas 144-158) por:

```ts
/** Grupo do catálogo com status de fonte (para a tela /grupos). Responsáveis vêm do Blob, não daqui. */
export interface GrupoCadastro {
  nome: string;
  /** Todas as URLs ativas, na ordem do catálogo. */
  fontes: string[];
  /** Primeira URL ativa, se houver. */
  fonteUrl?: string;
  temFonte: boolean;
  ignorar: boolean;
}

/** Fonte oficial de um grupo no catálogo versionado (`data/catalogo.ts`). */
export interface FonteCatalogo {
  url: string;
  ativo: boolean;
}

/**
 * Grupo no catálogo versionado. A **primeira fonte ativa é a primária**, mas
 * TODAS as ativas são lidas e mescladas na varredura. Sem PII: os responsáveis
 * internos vivem no Blob privado (ver spec 2026-09-04, §4).
 */
export interface GrupoCatalogo {
  nome: string;
  /** Rótulos da planilha que casam este grupo (comparados normalizados). Precedem contenção e similaridade. */
  apelidos?: string[];
  /** Só embaixadores: divide um apelido comum pelo país da coluna Departamento (inclusive nos extremos). */
  faixaPais?: { de: string; ate: string };
  /** Grupo de teste do Sistema Contatos: fica fora da varredura e é contado à parte. */
  ignorar?: boolean;
  fontes: FonteCatalogo[];
}

/** Responsáveis internos por grupo. Vivem no Blob privado, nunca no repositório. */
export interface ResponsaveisGrupo {
  grupo: string;
  responsavel1?: string;
  responsavel2?: string;
  backup?: string;
  emailResp1?: string;
  emailResp2?: string;
  emailBackup?: string;
}
```

- [ ] **Step 4: Reescrever `data/catalogo.ts` sem responsáveis e com os campos novos**

Remover de **todas** as 33 entradas as chaves `responsavel1`, `responsavel2`, `backup`, `emailResp1`, `emailResp2`, `emailBackup` (um `sed` cuida: `sed -i -E '/^\s+(responsavel1|responsavel2|backup|emailResp1|emailResp2|emailBackup):/d' data/catalogo.ts`). Conferir com `grep -c "senado.leg.br" data/catalogo.ts` → deve dar 5 (só as URLs de fontes).

Depois, editar estas entradas:

```ts
  {
    nome: "Conselho Nacional de Justiça (CNJ)",
    apelidos: ["CNJ"],
    fontes: [
      { url: "https://www.cnj.jus.br/composicao-atual/", ativo: true },
    ],
  },
  {
    nome: "Defensor Público Geral da União",
    apelidos: ["Defensor", "Defensoria Pública da União", "DPU"],
    fontes: [
      { url: "https://quem-e-quem.dpu.def.br/", ativo: true },
    ],
  },
  {
    nome: "Embaixadores ( África do Sul até EUA)",
    apelidos: ["Embaixadores"],
    faixaPais: { de: "África do Sul", ate: "EUA" },
    fontes: [
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true },
    ],
  },
  {
    nome: "Embaixadores (Filipinas até Noruega)",
    apelidos: ["Embaixadores"],
    faixaPais: { de: "Filipinas", ate: "Noruega" },
    fontes: [
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true },
    ],
  },
  {
    nome: "Embaixadores (Nova Zelândia até Zimbábue)",
    apelidos: ["Embaixadores"],
    faixaPais: { de: "Nova Zelândia", ate: "Zimbábue" },
    fontes: [
      { url: "https://www.gov.br/mre/pt-br/assuntos/cerimonial/lista-do-corpo-diplomatico-e-datas-nacionais", ativo: true },
    ],
  },
  {
    nome: "Presidente do Senado",
    apelidos: ["Presidente do Senado Federal"],
    fontes: [
      { url: "https://www25.senado.leg.br/web/senadores/em-exercicio", ativo: true },
    ],
  },
```
(Manter as URLs que já existem em cada uma dessas entradas; o bloco acima mostra o formato final.)

Acrescentar ao **final** do array:

```ts
  {
    // Resíduo de teste do Sistema Contatos (17 linhas, cargo vazio). Fora da varredura.
    nome: "Grupo Eventos - PP 2027 - PILOTO",
    ignorar: true,
    fontes: [],
  },
```

Atualizar o comentário de cabeçalho do arquivo: acrescentar a linha `// Responsáveis internos NÃO ficam aqui (repositório público): vivem no Blob privado. Ver spec 2026-09-04.`

- [ ] **Step 5: Reescrever `lib/catalogo.ts`**

Substituir o arquivo inteiro por:

```ts
import { normalizarTexto } from "@/lib/normalize";
import { sugerirGrupos } from "@/lib/match";
import { CATALOGO } from "@/data/catalogo";
import type { GrupoCadastro, GrupoCatalogo } from "@/lib/types";

/**
 * Quebra o rótulo "Grupo" da planilha em segmentos normalizados.
 * No Sistema Contatos uma mesma autoridade pertence a vários mailings ao mesmo
 * tempo, e a célula "Grupo" vem com eles colados por ";".
 */
function segmentarGrupo(grupoNome: string): string[] {
  return grupoNome
    .split(";")
    .map((s) => normalizarTexto(s))
    .filter((s) => s.length > 0);
}

const TAMANHO_MIN_SEGMENTO = 3;

function casaSegmento(nomeNorm: string, seg: string): boolean {
  return seg.length >= TAMANHO_MIN_SEGMENTO && (nomeNorm === seg || nomeNorm.includes(seg));
}

/** Grupos cujo apelido (normalizado) é exatamente um dos segmentos. */
function gruposPorApelido(grupos: readonly GrupoCatalogo[], segmentos: string[]): GrupoCatalogo[] {
  return grupos.filter((g) => (g.apelidos ?? []).some((a) => segmentos.includes(normalizarTexto(a))));
}

/**
 * Filtra os grupos que casam com algum segmento da planilha, nesta ordem de
 * precedência: apelido → nome exato → contenção (sigla curta dentro do nome).
 */
function gruposQueCasam(grupos: readonly GrupoCatalogo[], segmentos: string[]): GrupoCatalogo[] {
  const porApelido = gruposPorApelido(grupos, segmentos);
  if (porApelido.length > 0) return porApelido;
  const exatos = grupos.filter((g) => segmentos.includes(normalizarTexto(g.nome)));
  if (exatos.length > 0) return exatos;
  return grupos.filter((g) => segmentos.some((seg) => casaSegmento(normalizarTexto(g.nome), seg)));
}

const PREFIXO_EMBAIXADA = /^embaixada (do|da|de|dos|das)\s+/;

/** Nome do país normalizado, sem o prefixo "Embaixada do/da/de". */
function normalizarPais(pais: string): string {
  return normalizarTexto(pais).replace(PREFIXO_EMBAIXADA, "").trim();
}

const comparador = new Intl.Collator("pt-BR", { sensitivity: "base" });

/** País dentro da faixa (inclusive nos extremos), por ordem alfabética pt-BR. */
function paisNaFaixa(pais: string, faixa: { de: string; ate: string }): boolean {
  const p = normalizarPais(pais);
  return comparador.compare(p, normalizarPais(faixa.de)) >= 0 && comparador.compare(p, normalizarPais(faixa.ate)) <= 0;
}

/**
 * Entre grupos que dividem o mesmo apelido por faixa de país, escolhe o do país.
 * Sem país, ou país fora de toda faixa, fica o primeiro (com observação a cargo do chamador).
 */
function escolherPorPais(casados: GrupoCatalogo[], pais?: string): GrupoCatalogo {
  if (pais && pais.trim().length > 0) {
    const porFaixa = casados.find((g) => g.faixaPais && paisNaFaixa(pais, g.faixaPais));
    if (porFaixa) return porFaixa;
  }
  return casados[0];
}

function urlsAtivas(grupo: GrupoCatalogo): string[] {
  return grupo.fontes.filter((f) => f.ativo).map((f) => f.url);
}

/** Resolução de grupo: casamento com o cadastro + fontes oficiais + sugestões. */
export interface FonteResolvida {
  /** Nome do grupo como cadastrado. `undefined` quando nenhum grupo casa. */
  grupoCanonico?: string;
  /** URL oficial primária ativa (a primeira de `urls`), se houver. */
  url?: string;
  /** Todas as URLs ativas do grupo, na ordem do catálogo. Vazio quando não há fonte. */
  urls: string[];
  /** Grupo marcado como `ignorar` no catálogo (fica fora da varredura). */
  ignorado: boolean;
  /** Quando nada casa: nomes cadastrados mais próximos, para orientar o usuário. */
  sugestoes: string[];
}

/** Compatibilidade: URL primária de um grupo (mantida para a análise avulsa). */
export function buscarFontePrimaria(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): string | undefined {
  return resolverGrupoEFonte(grupoNome, catalogo).url;
}

/**
 * Resolve o rótulo da planilha para o grupo cadastrado e suas fontes oficiais.
 * `pais` é a coluna Departamento do contato; só importa para grupos com `faixaPais`.
 */
export function resolverGrupoEFonte(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
  pais?: string,
): FonteResolvida {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return { urls: [], ignorado: false, sugestoes: [] };

  const casados = gruposQueCasam(catalogo, segmentos);
  if (casados.length === 0) {
    return { urls: [], ignorado: false, sugestoes: sugerirGrupos(segmentos, catalogo.map((g) => g.nome)) };
  }

  const comFaixa = casados.filter((g) => g.faixaPais);
  const escolhido = comFaixa.length > 0
    ? escolherPorPais(comFaixa, pais)
    : (casados.find((g) => urlsAtivas(g).length > 0) ?? casados[0]);
  const urls = urlsAtivas(escolhido);
  return {
    grupoCanonico: escolhido.nome,
    url: urls[0],
    urls,
    ignorado: escolhido.ignorar === true,
    sugestoes: [],
  };
}

function mapearGrupo(grupo: GrupoCatalogo): GrupoCadastro {
  const fontes = urlsAtivas(grupo);
  return {
    nome: grupo.nome,
    fontes,
    fonteUrl: fontes[0],
    temFonte: fontes.length > 0,
    ignorar: grupo.ignorar === true,
  };
}

/** Lista os grupos do catálogo com status de fonte. Ordenado por nome; não muta a entrada. */
export function listarGruposComFonte(
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): GrupoCadastro[] {
  return [...catalogo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map(mapearGrupo);
}
```

Observação sobre `buscarFontePrimaria`: o teste "escolhe a primeira fonte ativa na ordem do catálogo quando dois segmentos têm fonte" continua passando porque `casados.find(g => urlsAtivas(g).length > 0)` respeita a ordem do catálogo.

- [ ] **Step 6: `analisarGrupo` exportado, lendo todas as urls**

Em `lib/analise.ts`, trocar a assinatura de `Dependencias.resolverFonte` e o corpo de `analisarGrupo`:

```ts
export interface Dependencias {
  /** Resolve o rótulo da planilha (e o país, para embaixadores) para grupo canônico + URLs oficiais. */
  resolverFonte: (grupo: string, pais?: string) => FonteResolvida;
  raspar: (url: string) => Promise<ConteudoFonte>;
  /** Camada B: composição via IA (texto raspado + conhecimento). `[]` = indisponível. */
  extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]>;
}

/** Une as pessoas de várias fontes; a primeira ocorrência (ordem do catálogo) vence. */
function unirPessoas(conteudos: ConteudoFonte[]): PessoaSite[] {
  const vistos = new Set<string>();
  const pessoas: PessoaSite[] = [];
  for (const c of conteudos) {
    for (const p of c.pessoas) {
      const chave = normalizarNome(p.nome);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      pessoas.push(p);
    }
  }
  return pessoas;
}

export async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoGrupo> {
  const resolvida = deps.resolverFonte(grupo, contatos[0]?.departamento);
  if (!resolvida.grupoCanonico) {
    const base = compararGrupo(grupo, contatos, undefined);
    return resolvida.sugestoes.length > 0 ? { ...base, sugestoesCadastro: resolvida.sugestoes } : base;
  }

  // 1. Camada 1 (base): raspa TODAS as fontes ativas; falha individual não derruba as outras.
  const conteudos: ConteudoFonte[] = [];
  let motivoFalha = "fonte inacessível";
  for (const url of resolvida.urls) {
    try {
      conteudos.push(await deps.raspar(url));
    } catch (err) {
      motivoFalha = motivoDaFalha(err);
    }
  }
  const textoLimpo = conteudos.map((c) => c.textoLimpo).join("\n\n");
  const pessoasPagina = unirPessoas(conteudos);

  // 2. Camada 2 (refinamento/cobertura): composição via IA. Sem chave → [].
  const pessoasIA = await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo);
  const composicao = mesclarComposicao(pessoasPagina, pessoasIA, contatos);

  // 3. Sem composição (página ilegível E IA vazia): NUNCA "saída"; "não verificado".
  if (composicao.length === 0) {
    if (resolvida.url) {
      const motivo = conteudos.length > 0
        ? "página não retornou conteúdo legível (provável JavaScript)"
        : motivoFalha;
      return marcarFonteInacessivel(grupo, contatos, resolvida.url, motivo);
    }
    return compararGrupo(grupo, contatos, undefined);
  }

  // 4. Compara contra a composição (página + resgates da IA, ou só IA na página ilegível).
  const fonte: ConteudoFonte = {
    url: resolvida.url ?? URL_PESQUISA_AMPLA,
    textoLimpo,
    destaques: [],
    pessoas: composicao,
  };
  const r = compararGrupo(grupo, contatos, fonte);
  const usouConhecimento = composicao.some((p) => p.origem === "conhecimento");
  return usouConhecimento || !resolvida.url ? { ...r, viaPesquisaAmpla: true } : r;
}
```
Acrescentar `import { normalizarNome } from "@/lib/normalize";` no topo. A função `analisar` continua chamando `analisarGrupo` sem mudança.

Em `tests/analise.test.ts`, atualizar o `deps` de partida (linhas 17-24) para devolver `urls` e `ignorado`:
```ts
const deps: Dependencias = {
  resolverFonte: (grupo) =>
    grupo === "ORG"
      ? { grupoCanonico: "ORG", url: "https://orgao.gov.br", urls: ["https://orgao.gov.br"], ignorado: false, sugestoes: [] }
      : { urls: [], ignorado: false, sugestoes: [] },
  raspar: async () => fonte,
  extrairComposicao: async () => [],
};
```
E nos testes que sobrescrevem `resolverFonte` (linhas 104 e 116), acrescentar `urls: []` e `ignorado: false` ao objeto devolvido. Acrescentar um teste novo:

```ts
  test("grupo com duas fontes ativas: pessoas das duas entram, sem duplicar, e falha em uma não derruba a outra", async () => {
    const depsDuas: Dependencias = {
      ...deps,
      resolverFonte: () => ({ grupoCanonico: "ORG", url: "https://a", urls: ["https://a", "https://b", "https://c"], ignorado: false, sugestoes: [] }),
      raspar: async (url) => {
        if (url === "https://c") throw new Error("HTTP 500");
        return {
          url, destaques: [], textoLimpo: "x",
          pessoas: url === "https://a"
            ? [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "pagina" as const }]
            : [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "pagina" as const }, { nome: "Bruno Souza Lima", cargo: "Diretor", origem: "pagina" as const }],
        };
      },
    };
    const r = await analisar("c.xlsx", [contatos[0]], depsDuas);
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
    expect(r.grupos[0].novos.map((n) => n.nome)).toEqual(["Bruno Souza Lima"]);
  });
```

- [ ] **Step 7: Ajustar `app/grupos/page.tsx` e a rota de análise para compilar**

Em `app/grupos/page.tsx`, remover as três colunas de responsáveis (linhas 45-47 e 55-66) deixando só "Grupo" e "Fonte oficial"; a versão com responsáveis do Blob vem na Task 9. Em `app/api/analise/route.ts`, trocar `resolverFonte: (grupo) => resolverGrupoEFonte(grupo)` por `resolverFonte: (grupo, pais) => resolverGrupoEFonte(grupo, undefined, pais)`.

- [ ] **Step 8: Rodar a suíte inteira e o typecheck**

Run: `npm test && npm run typecheck`
Expected: tudo verde. `tests/catalogo-dados.test.ts` passa com 34 grupos e 21 fontes.

- [ ] **Step 9: Commit (inclui as mudanças pendentes da sessão anterior)**

```bash
git add CLAUDE.md .gitignore lib/types.ts data/catalogo.ts lib/catalogo.ts lib/analise.ts app/grupos/page.tsx app/api/analise/route.ts tests/catalogo.test.ts tests/catalogo-dados.test.ts tests/analise.test.ts
git commit -m "feat: catálogo com apelidos, faixa de país, grupo ignorado e várias fontes; responsáveis saem do repositório"
```
(O `git rm --cached .claude/settings.local.json` já está staged e entra neste commit.)

---

### Task 3: Planilha da Posse: colunas extras e `Data Alteração`

**Files:**
- Modify: `lib/types.ts:2-15` (`ContatoPlanilha`)
- Modify: `lib/planilha.ts`
- Modify: `lib/analise-payload.ts:28-44`
- Test: `tests/planilha.test.ts`, `tests/analise-payload.test.ts`

**Interfaces:**
- Produces: `ContatoPlanilha.alteradoEm?: string` (ISO 8601). `lerPlanilha` ignora colunas desconhecidas e aceita `Data Alteração` como número serial do Excel ou texto.
- Produces: `export function serialExcelParaIso(serial: number): string` em `lib/planilha.ts`.

- [ ] **Step 1: Escrever os testes (vão falhar)**

Acrescentar em `tests/planilha.test.ts`, dentro do `describe("lerPlanilha")`:

```ts
  test("tolera colunas extras da planilha da Posse sem quebrar", () => {
    const buf = montarXlsx([
      { Nome: "Ana", Grupo: "STF", "Tratamento Extenso": "Senhora", Grupos: "1", "Revisão": "" },
    ]);
    const contatos = lerPlanilha(buf);
    expect(contatos).toHaveLength(1);
    expect(contatos[0]).toMatchObject({ nome: "Ana", grupo: "STF" });
  });

  test("converte Data Alteração em serial do Excel para ISO", () => {
    // 46155.4407523148 = 2026-05-13T10:34:41Z (serial do Excel, base 1899-12-30)
    const ws = XLSX.utils.json_to_sheet([{ Nome: "Ana", Grupo: "STF", "Data Alteração": 46155.4407523148 }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Folha1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const contatos = lerPlanilha(buf);
    expect(contatos[0].alteradoEm).toBe("2026-05-13T10:34:41.000Z");
  });

  test("Data Alteração em texto ISO é mantida; vazia vira undefined", () => {
    const buf = montarXlsx([
      { Nome: "Ana", Grupo: "STF", "Data Alteração": "2026-07-20T19:10:00.000Z" },
      { Nome: "Bia", Grupo: "STF", "Data Alteração": "" },
    ]);
    const contatos = lerPlanilha(buf);
    expect(contatos[0].alteradoEm).toBe("2026-07-20T19:10:00.000Z");
    expect(contatos[1].alteradoEm).toBeUndefined();
  });
```

E um `describe` novo no mesmo arquivo:

```ts
describe("serialExcelParaIso", () => {
  test("converte o serial com fração de dia para UTC", () => {
    expect(serialExcelParaIso(46155.4407523148)).toBe("2026-05-13T10:34:41.000Z");
  });
  test("serial inteiro é meia-noite UTC", () => {
    expect(serialExcelParaIso(45658)).toBe("2025-01-01T00:00:00.000Z");
  });
});
```
Atualizar o import: `import { lerPlanilha, agruparPorGrupo, ColunaFaltanteError, serialExcelParaIso } from "@/lib/planilha";`

Em `tests/analise-payload.test.ts`, acrescentar:
```ts
  test("preserva alteradoEm quando é string e descarta quando não é", () => {
    const p = parsePayloadAnalise({
      arquivoNome: "a.xlsx",
      contatos: [
        { nome: "A", grupo: "G", alteradoEm: "2026-05-13T10:34:41.000Z" },
        { nome: "B", grupo: "G", alteradoEm: 123 },
      ],
    });
    expect(p.contatos[0].alteradoEm).toBe("2026-05-13T10:34:41.000Z");
    expect(p.contatos[1].alteradoEm).toBeUndefined();
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/planilha.test.ts tests/analise-payload.test.ts`
Expected: FAIL (`serialExcelParaIso` não exportado; `alteradoEm` undefined).

- [ ] **Step 3: Implementar**

`lib/types.ts`, em `ContatoPlanilha`, acrescentar após `grupo: string;`:
```ts
  /** Coluna "Data Alteração" do Sistema Contatos, em ISO 8601 (UTC). */
  alteradoEm?: string;
```

`lib/planilha.ts`: o `MAPA_COLUNAS` é tipado como `Record<keyof ContatoPlanilha, string>`, então ganha a entrada `alteradoEm: "data alteracao"`. Acrescentar antes de `lerPlanilha`:

```ts
const MS_POR_DIA = 86_400_000;
/** Excel conta dias desde 1899-12-30 (com o bug do ano 1900 já embutido nessa base). */
const EPOCA_EXCEL_MS = Date.UTC(1899, 11, 30);

/** Serial de data do Excel (dias, com fração) → ISO 8601 UTC, arredondado ao segundo. */
export function serialExcelParaIso(serial: number): string {
  const ms = Math.round((EPOCA_EXCEL_MS + serial * MS_POR_DIA) / 1000) * 1000;
  return new Date(ms).toISOString();
}

function dataAlteracaoDe(valor: unknown): string | undefined {
  if (typeof valor === "number" && Number.isFinite(valor) && valor > 0) return serialExcelParaIso(valor);
  if (typeof valor === "string" && valor.trim().length > 0) {
    const d = new Date(valor.trim());
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}
```

Dentro de `lerPlanilha`, no `contatos.push({...})`, acrescentar após `grupo,`:
```ts
      alteradoEm: dataAlteracaoDe(linha[idx.get(MAPA_COLUNAS.alteradoEm) ?? ""]),
```
(O `pegar` converte para string; para a data precisamos do valor bruto, por isso o acesso direto.)

`lib/analise-payload.ts`, em `narrowContato`, acrescentar `alteradoEm: textoOpcional(o.alteradoEm),`.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/planilha.ts lib/analise-payload.ts tests/planilha.test.ts tests/analise-payload.test.ts
git commit -m "feat: planilha da Posse com colunas extras e Data Alteração em ISO"
```

---

### Task 4: `Armazem`: interface, versão em memória e Vercel Blob

**Files:**
- Create: `lib/armazem.ts`, `lib/armazem-blob.ts`
- Modify: `lib/types.ts` (tipos `ListaPosse`, `Retrato` e família)
- Modify: `package.json` (`@vercel/blob`)
- Test: `tests/armazem.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/types.ts
  export interface ListaPosse { arquivoNome: string; enviadoEm: string; contatos: ContatoPlanilha[]; responsaveis: ResponsaveisGrupo[] }
  export type SituacaoInvestigacao = "confirmado_no_cargo" | "saiu" | "substituido" | "inconclusivo" | "nao_investigado";
  export interface Evidencia { url: string; trecho: string; oficial: boolean; data?: string }
  export interface Investigacao { situacao: SituacaoInvestigacao; sucessor?: string; sucessorNaComposicao?: string; evidencias: Evidencia[]; modelo: string; tokens: { entrada: number; saida: number; buscas: number } }
  export interface FonteProposta { url: string; trecho: string; encontradaEm: string }
  export interface FonteLida { url: string; meio: "fetch" | "chromium"; pessoas: number; erro?: string }
  export interface ContatoRetrato extends ResultadoContato { investigacao?: Investigacao; linkOficial?: string; alteradoNoContatosEm?: string }
  export interface GrupoRetrato extends Omit<ResultadoGrupo, "contatos"> { contatos: ContatoRetrato[]; fontesLidas: FonteLida[]; falhasConsecutivas: number; fontesPropostas?: FonteProposta[]; concluidoEm?: string }
  export interface ResumoRetrato extends ResumoAnalise { substituicaoProvavel: number; indicioSubstituicao: number; naoInvestigado: number; custo: { tokensEntrada: number; tokensSaida: number; buscas: number } }
  export interface Retrato { versao: 1; iniciadoEm: string; concluidoEm?: string; emAndamentoAte?: string; gruposIgnorados: { nome: string; contatos: number }[]; grupos: GrupoRetrato[]; resumo: ResumoRetrato }
  // lib/armazem.ts
  export interface Armazem {
    lerLista(): Promise<ListaPosse | null>;
    gravarLista(lista: ListaPosse): Promise<void>;
    lerRetrato(): Promise<Retrato | null>;
    gravarRetrato(retrato: Retrato): Promise<void>;
    lerRetratoAnterior(): Promise<Retrato | null>;
    gravarRetratoAnterior(retrato: Retrato): Promise<void>;
  }
  export function armazemEmMemoria(inicial?: { lista?: ListaPosse; retrato?: Retrato; anterior?: Retrato }): Armazem
  // lib/armazem-blob.ts
  export function armazemBlob(): Armazem
  ```

- [ ] **Step 1: Instalar o SDK do Blob**

Run: `npm install @vercel/blob`
Expected: sem erro.

- [ ] **Step 2: Escrever o teste do armazém em memória (vai falhar)**

`tests/armazem.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { armazemEmMemoria } from "@/lib/armazem";
import type { ListaPosse, Retrato } from "@/lib/types";

const lista: ListaPosse = {
  arquivoNome: "contatos-no-grupo.xlsx",
  enviadoEm: "2026-09-04T10:00:00.000Z",
  contatos: [{ nome: "Ana Maria Política Completa", grupo: "Ministros do STF" }],
  responsaveis: [{ grupo: "Ministros do STF", responsavel1: "Fulana" }],
};

function retratoVazio(iniciadoEm: string): Retrato {
  return {
    versao: 1, iniciadoEm, gruposIgnorados: [], grupos: [],
    resumo: {
      total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0,
      gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
      substituicaoProvavel: 0, indicioSubstituicao: 0, naoInvestigado: 0,
      custo: { tokensEntrada: 0, tokensSaida: 0, buscas: 0 },
    },
  };
}

describe("armazemEmMemoria", () => {
  test("começa vazio e devolve null para tudo", async () => {
    const a = armazemEmMemoria();
    expect(await a.lerLista()).toBeNull();
    expect(await a.lerRetrato()).toBeNull();
    expect(await a.lerRetratoAnterior()).toBeNull();
  });

  test("grava e lê a lista sem compartilhar referência", async () => {
    const a = armazemEmMemoria();
    await a.gravarLista(lista);
    const lida = await a.lerLista();
    expect(lida).toEqual(lista);
    expect(lida).not.toBe(lista);
  });

  test("grava retrato atual e anterior de forma independente", async () => {
    const a = armazemEmMemoria();
    await a.gravarRetrato(retratoVazio("2026-09-04T05:00:00.000Z"));
    await a.gravarRetratoAnterior(retratoVazio("2026-09-03T05:00:00.000Z"));
    expect((await a.lerRetrato())?.iniciadoEm).toBe("2026-09-04T05:00:00.000Z");
    expect((await a.lerRetratoAnterior())?.iniciadoEm).toBe("2026-09-03T05:00:00.000Z");
  });

  test("aceita estado inicial", async () => {
    const a = armazemEmMemoria({ lista });
    expect((await a.lerLista())?.arquivoNome).toBe("contatos-no-grupo.xlsx");
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run tests/armazem.test.ts`
Expected: FAIL (módulo `@/lib/armazem` não existe).

- [ ] **Step 4: Tipos do retrato em `lib/types.ts`**

Acrescentar ao final do arquivo:

```ts
/** Lista da Posse enviada pelo usuário. Vive só no Blob privado. */
export interface ListaPosse {
  arquivoNome: string;
  enviadoEm: string;
  contatos: ContatoPlanilha[];
  responsaveis: ResponsaveisGrupo[];
}

export type SituacaoInvestigacao =
  | "confirmado_no_cargo" | "saiu" | "substituido" | "inconclusivo" | "nao_investigado";

export interface Evidencia {
  url: string;
  /** Até 300 caracteres. */
  trecho: string;
  /** Domínio na lista de domínios oficiais. */
  oficial: boolean;
  data?: string;
}

/** Resultado da investigação de substituição (plano seguinte). Presente no tipo desde já para o retrato ser estável. */
export interface Investigacao {
  situacao: SituacaoInvestigacao;
  sucessor?: string;
  sucessorNaComposicao?: string;
  evidencias: Evidencia[];
  modelo: string;
  tokens: { entrada: number; saida: number; buscas: number };
}

export interface FonteProposta {
  url: string;
  trecho: string;
  encontradaEm: string;
}

export interface FonteLida {
  url: string;
  meio: "fetch" | "chromium";
  pessoas: number;
  erro?: string;
}

export interface ContatoRetrato extends ResultadoContato {
  investigacao?: Investigacao;
  /** URL da fonte que confirmou o contato. */
  linkOficial?: string;
  alteradoNoContatosEm?: string;
}

export interface GrupoRetrato extends Omit<ResultadoGrupo, "contatos"> {
  contatos: ContatoRetrato[];
  fontesLidas: FonteLida[];
  /** Varreduras seguidas em que nenhuma fonte rendeu pessoas; herdado do retrato anterior. */
  falhasConsecutivas: number;
  fontesPropostas?: FonteProposta[];
  /** Checkpoint: preenchido quando o grupo terminou nesta varredura. */
  concluidoEm?: string;
}

export interface ResumoRetrato extends ResumoAnalise {
  substituicaoProvavel: number;
  indicioSubstituicao: number;
  naoInvestigado: number;
  custo: { tokensEntrada: number; tokensSaida: number; buscas: number };
}

export interface Retrato {
  versao: 1;
  iniciadoEm: string;
  /** Ausente enquanto a varredura corre ou foi interrompida. */
  concluidoEm?: string;
  /** Trava de concorrência: outra varredura só começa depois deste instante. */
  emAndamentoAte?: string;
  gruposIgnorados: { nome: string; contatos: number }[];
  grupos: GrupoRetrato[];
  resumo: ResumoRetrato;
}
```

- [ ] **Step 5: Interface e versão em memória**

`lib/armazem.ts`:
```ts
import type { ListaPosse, Retrato } from "@/lib/types";

/**
 * Persistência mínima do app: três objetos JSON. A implementação de produção é
 * `lib/armazem-blob.ts` (Vercel Blob privado); testes usam `armazemEmMemoria`.
 */
export interface Armazem {
  lerLista(): Promise<ListaPosse | null>;
  gravarLista(lista: ListaPosse): Promise<void>;
  lerRetrato(): Promise<Retrato | null>;
  gravarRetrato(retrato: Retrato): Promise<void>;
  lerRetratoAnterior(): Promise<Retrato | null>;
  gravarRetratoAnterior(retrato: Retrato): Promise<void>;
}

function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Armazém volátil para testes e desenvolvimento sem Blob. Clona na entrada e na saída. */
export function armazemEmMemoria(inicial: { lista?: ListaPosse; retrato?: Retrato; anterior?: Retrato } = {}): Armazem {
  let lista = inicial.lista ? clonar(inicial.lista) : null;
  let retrato = inicial.retrato ? clonar(inicial.retrato) : null;
  let anterior = inicial.anterior ? clonar(inicial.anterior) : null;
  return {
    async lerLista() { return lista ? clonar(lista) : null; },
    async gravarLista(l) { lista = clonar(l); },
    async lerRetrato() { return retrato ? clonar(retrato) : null; },
    async gravarRetrato(r) { retrato = clonar(r); },
    async lerRetratoAnterior() { return anterior ? clonar(anterior) : null; },
    async gravarRetratoAnterior(r) { anterior = clonar(r); },
  };
}
```

- [ ] **Step 6: Implementação com Vercel Blob**

`lib/armazem-blob.ts`:
```ts
import { get, put } from "@vercel/blob";
import type { Armazem } from "@/lib/armazem";
import type { ListaPosse, Retrato } from "@/lib/types";

const CAMINHOS = {
  lista: "pp27/lista.json",
  retrato: "pp27/retrato.json",
  anterior: "pp27/retrato-anterior.json",
} as const;

async function lerJson<T>(caminho: string): Promise<T | null> {
  const r = await get(caminho, { access: "private" });
  if (!r || r.statusCode === 404) return null;
  const texto = await new Response(r.stream).text();
  return JSON.parse(texto) as T;
}

async function gravarJson(caminho: string, valor: unknown): Promise<void> {
  await put(caminho, JSON.stringify(valor), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** Armazém de produção: Vercel Blob privado. Exige BLOB_READ_WRITE_TOKEN (injetado pelo Marketplace). */
export function armazemBlob(): Armazem {
  return {
    lerLista: () => lerJson<ListaPosse>(CAMINHOS.lista),
    gravarLista: (l) => gravarJson(CAMINHOS.lista, l),
    lerRetrato: () => lerJson<Retrato>(CAMINHOS.retrato),
    gravarRetrato: (r) => gravarJson(CAMINHOS.retrato, r),
    lerRetratoAnterior: () => lerJson<Retrato>(CAMINHOS.anterior),
    gravarRetratoAnterior: (r) => gravarJson(CAMINHOS.anterior, r),
  };
}
```

Conferir a assinatura real de `get` e `put` em `node_modules/@vercel/blob/dist/index.d.ts` (nomes das opções `access`, `allowOverwrite`, campos `stream` e `statusCode` do retorno de `get`). Se a versão instalada divergir, ajustar **só** `lerJson`/`gravarJson`; a interface `Armazem` não muda.

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `npm test && npm run typecheck`
Expected: verde (o Blob real não é exercitado por teste).

- [ ] **Step 8: Provisionar o Blob no projeto da Vercel**

Run: `vercel integration add blob` (ou pelo painel: Storage → Create → Blob, ligado ao projeto). Depois `vercel env pull .env.local --yes` para trazer `BLOB_READ_WRITE_TOKEN` para o ambiente local.
Expected: `.env.local` contém `BLOB_READ_WRITE_TOKEN`. Não commitar.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/armazem.ts lib/armazem-blob.ts tests/armazem.test.ts package.json package-lock.json
git commit -m "feat: tipos do retrato e armazém (memória + Vercel Blob privado)"
```

---

### Task 5: Senha única: cookie HMAC, middleware e tela `/entrar`

**Files:**
- Create: `lib/sessao.ts`, `middleware.ts`, `app/entrar/page.tsx`, `app/api/entrar/route.ts`
- Modify: `.env.example`
- Test: `tests/sessao.test.ts`

**Interfaces:**
- Produces (`lib/sessao.ts`, roda em Edge e Node, só Web Crypto):
  ```ts
  export const NOME_COOKIE = "fm_sessao";
  export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;
  export async function criarToken(segredo: string, agoraMs?: number): Promise<string>;   // "<expiraMs>.<hmac hex>"
  export async function validarToken(token: string | undefined, segredo: string, agoraMs?: number): Promise<boolean>;
  export function compararSenha(informada: string, esperada: string): boolean;          // tempo constante
  ```
- Variáveis de ambiente novas: `APP_SENHA`, `APP_SEGREDO_COOKIE`, `CRON_SECRET`.

- [ ] **Step 1: Escrever os testes (vão falhar)**

`tests/sessao.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { criarToken, validarToken, compararSenha, DURACAO_SESSAO_MS } from "@/lib/sessao";

const SEGREDO = "segredo-de-teste-com-tamanho-razoavel";
const AGORA = Date.UTC(2026, 8, 4, 12, 0, 0);

describe("sessão por cookie assinado", () => {
  test("token recém-criado é válido", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    expect(await validarToken(t, SEGREDO, AGORA + 1000)).toBe(true);
  });

  test("token tem a forma <expira>.<hex de 64>", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    const [expira, hex] = t.split(".");
    expect(Number(expira)).toBe(AGORA + DURACAO_SESSAO_MS);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  test("token expirado é inválido", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    expect(await validarToken(t, SEGREDO, AGORA + DURACAO_SESSAO_MS + 1)).toBe(false);
  });

  test("token adulterado (expiração empurrada) é inválido", async () => {
    const t = await criarToken(SEGREDO, AGORA);
    const [, hex] = t.split(".");
    const adulterado = `${AGORA + DURACAO_SESSAO_MS * 10}.${hex}`;
    expect(await validarToken(adulterado, SEGREDO, AGORA)).toBe(false);
  });

  test("token assinado com outro segredo é inválido", async () => {
    const t = await criarToken("outro-segredo", AGORA);
    expect(await validarToken(t, SEGREDO, AGORA)).toBe(false);
  });

  test("token ausente, vazio ou malformado é inválido", async () => {
    expect(await validarToken(undefined, SEGREDO, AGORA)).toBe(false);
    expect(await validarToken("", SEGREDO, AGORA)).toBe(false);
    expect(await validarToken("abc", SEGREDO, AGORA)).toBe(false);
    expect(await validarToken("123.zzz", SEGREDO, AGORA)).toBe(false);
  });
});

describe("compararSenha", () => {
  test("iguais → true; diferentes ou tamanho diferente → false", () => {
    expect(compararSenha("Posse2027!", "Posse2027!")).toBe(true);
    expect(compararSenha("Posse2027!", "Posse2027?")).toBe(false);
    expect(compararSenha("Posse", "Posse2027!")).toBe(false);
    expect(compararSenha("", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/sessao.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/sessao.ts`**

```ts
/**
 * Sessão por cookie assinado (HMAC-SHA256 via Web Crypto, para rodar no
 * middleware e nas rotas). Valor: "<expiraMs>.<hex>". Sem estado no servidor.
 */
export const NOME_COOKIE = "fm_sessao";
export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

const codificador = new TextEncoder();

async function assinar(segredo: string, dados: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw", codificador.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", chave, codificador.encode(dados)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante para strings do mesmo tamanho; tamanhos diferentes → false. */
function igualConstante(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function criarToken(segredo: string, agoraMs: number = Date.now()): Promise<string> {
  const expira = String(agoraMs + DURACAO_SESSAO_MS);
  return `${expira}.${await assinar(segredo, expira)}`;
}

export async function validarToken(
  token: string | undefined,
  segredo: string,
  agoraMs: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const partes = token.split(".");
  if (partes.length !== 2) return false;
  const [expira, hex] = partes;
  if (!/^\d+$/.test(expira) || !/^[0-9a-f]{64}$/.test(hex)) return false;
  if (Number(expira) <= agoraMs) return false;
  return igualConstante(await assinar(segredo, expira), hex);
}

export function compararSenha(informada: string, esperada: string): boolean {
  return igualConstante(informada, esperada);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/sessao.test.ts`
Expected: PASS.

- [ ] **Step 5: Middleware**

`middleware.ts` na raiz do projeto (Next 15.5 usa este nome; o spec fala em `proxy.ts`, que é o nome no Next 16):
```ts
import { NextResponse, type NextRequest } from "next/server";
import { NOME_COOKIE, validarToken } from "@/lib/sessao";

const ROTAS_LIVRES = new Set(["/entrar", "/api/entrar"]);

function ehCronAutorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  return Boolean(segredo) && req.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (ROTAS_LIVRES.has(pathname)) return NextResponse.next();
  if (pathname === "/api/varredura" && ehCronAutorizado(req)) return NextResponse.next();

  const segredo = process.env.APP_SEGREDO_COOKIE;
  if (!segredo) return new NextResponse("APP_SEGREDO_COOKIE não configurada.", { status: 500 });

  if (await validarToken(req.cookies.get(NOME_COOKIE)?.value, segredo)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
  }
  const destino = req.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = "";
  destino.searchParams.set("voltar", pathname);
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Rota de senha com atraso progressivo**

`app/api/entrar/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { NOME_COOKIE, DURACAO_SESSAO_MS, compararSenha, criarToken } from "@/lib/sessao";

export const runtime = "nodejs";

const ATRASO_BASE_MS = 1000;
const ATRASO_TETO_MS = 30_000;
/** Tentativas erradas por IP nesta instância (best-effort; Fluid Compute reaproveita instâncias). */
const erradas = new Map<string, number>();

function ipDe(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
}

function atrasoPara(tentativas: number): number {
  return Math.min(ATRASO_BASE_MS * 2 ** Math.max(0, tentativas - 1), ATRASO_TETO_MS);
}

export async function POST(req: NextRequest) {
  const senhaEsperada = process.env.APP_SENHA;
  const segredo = process.env.APP_SEGREDO_COOKIE;
  if (!senhaEsperada || !segredo) {
    return NextResponse.json({ ok: false, message: "Senha do app não configurada." }, { status: 500 });
  }
  let senha = "";
  try {
    const corpo = (await req.json()) as { senha?: unknown };
    senha = typeof corpo.senha === "string" ? corpo.senha : "";
  } catch {
    return NextResponse.json({ ok: false, message: "Corpo inválido." }, { status: 400 });
  }

  const ip = ipDe(req);
  const tentativas = erradas.get(ip) ?? 0;
  if (tentativas > 0) await new Promise((r) => setTimeout(r, atrasoPara(tentativas)));

  if (!compararSenha(senha, senhaEsperada)) {
    erradas.set(ip, tentativas + 1);
    return NextResponse.json({ ok: false, message: "Senha incorreta." }, { status: 401 });
  }
  erradas.delete(ip);

  const resp = NextResponse.json({ ok: true });
  resp.cookies.set({
    name: NOME_COOKIE,
    value: await criarToken(segredo),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000),
  });
  return resp;
}
```

- [ ] **Step 7: Tela `/entrar`**

`app/entrar/page.tsx`:
```tsx
"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function EntrarPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch("/api/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      const json = (await resp.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        setErro(json.message ?? "Não foi possível entrar.");
        return;
      }
      const voltar = params.get("voltar");
      router.replace(voltar && voltar.startsWith("/") ? voltar : "/");
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-bold">Fiscal de Mailings</h1>
      <form onSubmit={entrar} className="space-y-3">
        <label className="block text-sm">
          Senha de acesso
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            autoFocus
          />
        </label>
        <button
          type="submit"
          disabled={enviando || senha.length === 0}
          className="w-full rounded bg-gray-800 px-3 py-2 text-white disabled:opacity-50"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </form>
    </main>
  );
}
```
Como usa `useSearchParams`, envolver em `Suspense` para o build não reclamar: renomear o componente acima para `Formulario` e exportar `export default function EntrarPage() { return <Suspense><Formulario /></Suspense>; }` com `import { Suspense } from "react";`.

- [ ] **Step 8: `.env.example`**

Substituir o arquivo por:
```
# =============================================================================
# Fiscal de Mailings — variáveis de ambiente
# Copie para .env.local. Nunca commitar .env.local.
# =============================================================================

# Senha única de acesso ao app (obrigatória em produção).
APP_SENHA=

# Segredo que assina o cookie de sessão. Gerar com:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
APP_SEGREDO_COOKIE=

# Segredo do cron da Vercel (a Vercel envia "Authorization: Bearer <valor>").
# Mesmo formato do anterior. Também autoriza a reinvocação da varredura.
CRON_SECRET=

# Vercel Blob privado (injetada pelo Marketplace ao ligar o Blob ao projeto).
BLOB_READ_WRITE_TOKEN=

# Anthropic (opcional): Camada 2 de extração (claude-haiku-4-5). Sem ela, só a
# camada determinística roda.
ANTHROPIC_API_KEY=
```

- [ ] **Step 9: Verificar localmente**

Criar `.env.local` com `APP_SENHA`, `APP_SEGREDO_COOKIE` e `CRON_SECRET` de teste. Run: `npm run dev`, abrir `http://localhost:3000/` → redireciona para `/entrar?voltar=%2F`; senha errada mostra "Senha incorreta." e a segunda tentativa demora 1 s; senha certa volta para `/`. `curl -i http://localhost:3000/api/analise` → 401 JSON.

Run: `npm test && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 10: Commit**

```bash
git add lib/sessao.ts middleware.ts app/entrar/page.tsx app/api/entrar/route.ts .env.example tests/sessao.test.ts
git commit -m "feat: senha única com cookie HMAC, middleware e tela de entrada"
```

---

### Task 6: Upload da lista da Posse e dos responsáveis

**Files:**
- Create: `lib/responsaveis.ts`, `app/api/lista/route.ts`, `app/enviar-lista/page.tsx`, `components/enviar-lista-form.tsx`
- Modify: `lib/analise-payload.ts`
- Test: `tests/responsaveis.test.ts`, `tests/analise-payload.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/responsaveis.ts
  export function lerResponsaveis(buffer: ArrayBuffer): ResponsaveisGrupo[];
  // lib/analise-payload.ts
  export interface PayloadLista { arquivoNome: string; contatos: ContatoPlanilha[]; responsaveis: ResponsaveisGrupo[] }
  export function parsePayloadLista(corpo: unknown): PayloadLista;
  ```
- Rota `POST /api/lista` recebe `PayloadLista`, grava `ListaPosse` com `enviadoEm = agora`. `GET /api/lista` devolve `{ ok, lista: { arquivoNome, enviadoEm, contatos: number, grupos: number, responsaveis: number } | null }` (sem PII).

- [ ] **Step 1: Testes (vão falhar)**

`tests/responsaveis.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { lerResponsaveis } from "@/lib/responsaveis";

function montarXlsx(linhas: Record<string, string>[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Responsáveis");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("lerResponsaveis", () => {
  test("mapeia as colunas de responsáveis por grupo, tolerando caixa e acento", () => {
    const r = lerResponsaveis(montarXlsx([
      { Grupo: "Ministros do STF", "Responsável 1": "Ana", "E-mail 1": "ana@senado.leg.br", "Responsável 2": "Bia", "E-mail 2": "bia@senado.leg.br", Backup: "Caio", "E-mail Backup": "caio@senado.leg.br" },
    ]));
    expect(r).toEqual([{
      grupo: "Ministros do STF", responsavel1: "Ana", emailResp1: "ana@senado.leg.br",
      responsavel2: "Bia", emailResp2: "bia@senado.leg.br", backup: "Caio", emailBackup: "caio@senado.leg.br",
    }]);
  });

  test("linha sem grupo é ignorada; campos vazios viram undefined", () => {
    const r = lerResponsaveis(montarXlsx([
      { Grupo: "", "Responsável 1": "Ninguém" },
      { Grupo: "Governadores", "Responsável 1": "Dora", "Responsável 2": "" },
    ]));
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ grupo: "Governadores", responsavel1: "Dora" });
  });

  test("planilha sem coluna Grupo lança erro claro", () => {
    expect(() => lerResponsaveis(montarXlsx([{ "Responsável 1": "Ana" }]))).toThrow(/grupo/i);
  });
});
```

Em `tests/analise-payload.test.ts`, acrescentar (com `import { parsePayloadLista } from "@/lib/analise-payload";`):
```ts
describe("parsePayloadLista", () => {
  test("aceita contatos e responsáveis; responsáveis ausentes viram []", () => {
    const p = parsePayloadLista({ arquivoNome: "l.xlsx", contatos: [{ nome: "A", grupo: "G" }] });
    expect(p.responsaveis).toEqual([]);
    const q = parsePayloadLista({
      arquivoNome: "l.xlsx", contatos: [],
      responsaveis: [{ grupo: "G", responsavel1: "Ana", emailResp1: "a@b" }, { grupo: "", responsavel1: "x" }, 42],
    });
    expect(q.responsaveis).toEqual([{ grupo: "G", responsavel1: "Ana", emailResp1: "a@b" }]);
  });

  test("rejeita corpo sem contatos", () => {
    expect(() => parsePayloadLista({ arquivoNome: "l.xlsx" })).toThrow(/contatos/i);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/responsaveis.test.ts tests/analise-payload.test.ts`
Expected: FAIL.

- [ ] **Step 3: `lib/responsaveis.ts`**

```ts
import * as XLSX from "xlsx";
import { normalizarTexto } from "@/lib/normalize";
import type { ResponsaveisGrupo } from "@/lib/types";

/** Cabeçalhos aceitos (normalizados) → campo. */
const COLUNAS: Record<Exclude<keyof ResponsaveisGrupo, "grupo">, string[]> = {
  responsavel1: ["responsavel 1", "responsavel1"],
  responsavel2: ["responsavel 2", "responsavel2"],
  backup: ["backup"],
  emailResp1: ["e-mail 1", "email 1", "e-mail resp1"],
  emailResp2: ["e-mail 2", "email 2", "e-mail resp2"],
  emailBackup: ["e-mail backup", "email backup"],
};

/**
 * Lê a planilha de responsáveis por grupo (uma linha por grupo). Pura e isomórfica,
 * como `lerPlanilha`: roda no navegador; só o JSON viaja.
 */
export function lerResponsaveis(buffer: ArrayBuffer): ResponsaveisGrupo[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("Planilha de responsáveis vazia: coluna Grupo ausente.");
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (linhas.length === 0) return [];

  const idx = new Map<string, string>();
  for (const chave of Object.keys(linhas[0])) idx.set(normalizarTexto(chave), chave);
  const chaveGrupo = idx.get("grupo");
  if (!chaveGrupo) throw new Error("Planilha de responsáveis sem a coluna Grupo.");

  const valor = (linha: Record<string, unknown>, nomes: string[]): string | undefined => {
    for (const n of nomes) {
      const chave = idx.get(n);
      if (chave) {
        const v = String(linha[chave] ?? "").trim();
        if (v) return v;
      }
    }
    return undefined;
  };

  const saida: ResponsaveisGrupo[] = [];
  for (const linha of linhas) {
    const grupo = String(linha[chaveGrupo] ?? "").trim();
    if (!grupo) continue;
    const r: ResponsaveisGrupo = { grupo };
    for (const campo of Object.keys(COLUNAS) as (keyof typeof COLUNAS)[]) {
      const v = valor(linha, COLUNAS[campo]);
      if (v) r[campo] = v;
    }
    saida.push(r);
  }
  return saida;
}
```

- [ ] **Step 4: `parsePayloadLista` em `lib/analise-payload.ts`**

Acrescentar ao final do arquivo:
```ts
export interface PayloadLista {
  arquivoNome: string;
  contatos: ContatoPlanilha[];
  responsaveis: ResponsaveisGrupo[];
}

function narrowResponsavel(v: unknown): ResponsaveisGrupo | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const grupo = texto(o.grupo);
  if (!grupo) return null;
  const r: ResponsaveisGrupo = { grupo };
  for (const campo of ["responsavel1", "responsavel2", "backup", "emailResp1", "emailResp2", "emailBackup"] as const) {
    const t = textoOpcional(o[campo]);
    if (t) r[campo] = t;
  }
  return r;
}

/** Corpo de `POST /api/lista`: contatos da planilha da Posse + responsáveis por grupo (opcional). */
export function parsePayloadLista(corpo: unknown): PayloadLista {
  const base = parsePayloadAnalise(corpo);
  const { responsaveis } = corpo as Record<string, unknown>;
  const lista = Array.isArray(responsaveis) ? responsaveis : [];
  return {
    ...base,
    responsaveis: lista.map(narrowResponsavel).filter((r): r is ResponsaveisGrupo => r !== null),
  };
}
```
Ajustar o import do topo para `import type { ContatoPlanilha, ResponsaveisGrupo } from "@/lib/types";`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/responsaveis.test.ts tests/analise-payload.test.ts`
Expected: PASS.

- [ ] **Step 6: Rota `/api/lista`**

`app/api/lista/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { parsePayloadLista, PayloadInvalidoError } from "@/lib/analise-payload";
import { armazemBlob } from "@/lib/armazem-blob";
import { agruparPorGrupo } from "@/lib/planilha";
import type { ListaPosse } from "@/lib/types";

export const runtime = "nodejs";

/** Metadados da lista atual, sem PII. */
export async function GET() {
  try {
    const lista = await armazemBlob().lerLista();
    if (!lista) return NextResponse.json({ ok: true, lista: null });
    return NextResponse.json({
      ok: true,
      lista: {
        arquivoNome: lista.arquivoNome,
        enviadoEm: lista.enviadoEm,
        contatos: lista.contatos.length,
        grupos: agruparPorGrupo(lista.contatos).size,
        responsaveis: lista.responsaveis.length,
      },
    });
  } catch (err) {
    console.error("[/api/lista GET] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Não foi possível ler a lista." }, { status: 500 });
  }
}

/** Substitui a lista da Posse (e os responsáveis) no Blob privado. */
export async function POST(req: NextRequest) {
  try {
    const corpo: unknown = await req.json().catch(() => null);
    const payload = parsePayloadLista(corpo);
    const lista: ListaPosse = {
      arquivoNome: payload.arquivoNome,
      enviadoEm: new Date().toISOString(),
      contatos: payload.contatos,
      responsaveis: payload.responsaveis,
    };
    await armazemBlob().gravarLista(lista);
    return NextResponse.json({ ok: true, contatos: lista.contatos.length, responsaveis: lista.responsaveis.length });
  } catch (err) {
    if (err instanceof PayloadInvalidoError) {
      return NextResponse.json({ ok: false, message: err.message }, { status: 422 });
    }
    console.error("[/api/lista POST] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Não foi possível gravar a lista." }, { status: 500 });
  }
}
```

- [ ] **Step 7: Formulário e página**

`components/enviar-lista-form.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";
import { lerResponsaveis } from "@/lib/responsaveis";
import type { ResponsaveisGrupo } from "@/lib/types";

export function EnviarListaForm() {
  const router = useRouter();
  const [lista, setLista] = useState<File | null>(null);
  const [respArquivo, setRespArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function enviar() {
    if (!lista) return;
    setEnviando(true);
    setErro(null);
    setOk(null);
    try {
      const contatos = lerPlanilha(await lista.arrayBuffer());
      let responsaveis: ResponsaveisGrupo[] = [];
      if (respArquivo) responsaveis = lerResponsaveis(await respArquivo.arrayBuffer());
      const resp = await fetch("/api/lista", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arquivoNome: lista.name, contatos, responsaveis }),
      });
      const json = (await resp.json()) as { ok: boolean; message?: string; contatos?: number };
      if (!json.ok) {
        setErro(json.message ?? "Falha ao gravar a lista.");
        return;
      }
      setOk(`Lista gravada: ${json.contatos} contatos.`);
      router.refresh();
    } catch (err) {
      setErro(err instanceof ColunaFaltanteError ? `Planilha inválida. ${err.message}` : err instanceof Error ? err.message : "Falha ao ler a planilha.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4 rounded border bg-white p-4">
      <label className="block text-sm">
        Planilha da lista da Posse (.xlsx ou .csv exportado do Sistema Contatos)
        <input type="file" accept=".xlsx,.csv" className="mt-1 block" onChange={(e) => setLista(e.target.files?.[0] ?? null)} />
      </label>
      <label className="block text-sm">
        Planilha de responsáveis por grupo (opcional; colunas Grupo, Responsável 1, E-mail 1, Responsável 2, E-mail 2, Backup, E-mail Backup)
        <input type="file" accept=".xlsx,.csv" className="mt-1 block" onChange={(e) => setRespArquivo(e.target.files?.[0] ?? null)} />
      </label>
      <button
        onClick={enviar}
        disabled={!lista || enviando}
        className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {enviando ? "Enviando…" : "Substituir lista"}
      </button>
      {ok && <p className="text-sm text-green-700">{ok}</p>}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
```

`app/enviar-lista/page.tsx` (Server Component):
```tsx
import Link from "next/link";
import { armazemBlob } from "@/lib/armazem-blob";
import { agruparPorGrupo } from "@/lib/planilha";
import { EnviarListaForm } from "@/components/enviar-lista-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function EnviarListaPage() {
  const lista = await armazemBlob().lerLista();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Enviar lista da Posse</h1>
        <Link href="/" className="text-sm underline">← Painel</Link>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        {lista
          ? `Lista atual: ${lista.arquivoNome}, enviada em ${new Date(lista.enviadoEm).toLocaleString("pt-BR")}, ${lista.contatos.length} contatos em ${agruparPorGrupo(lista.contatos).size} grupos, ${lista.responsaveis.length} grupos com responsáveis.`
          : "Nenhuma lista enviada ainda."}
      </p>
      <EnviarListaForm />
    </main>
  );
}
```

- [ ] **Step 8: Verificar localmente com a planilha real**

Run: `npm run dev`; entrar com a senha; abrir `/enviar-lista`; enviar `Agrupador PP27/contatos-no-grupo.xlsx`.
Expected: "Lista gravada: 346 contatos." e o cabeçalho passa a mostrar 17 grupos. `curl` com o cookie em `/api/lista` devolve os metadados sem nomes.

Run: `npm test && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add lib/responsaveis.ts lib/analise-payload.ts app/api/lista/route.ts app/enviar-lista/page.tsx components/enviar-lista-form.tsx tests/responsaveis.test.ts tests/analise-payload.test.ts
git commit -m "feat: upload da lista da Posse e dos responsáveis para o Blob privado"
```

---

### Task 7: Varredura com trava, checkpoint, retomada e cron

**Files:**
- Create: `lib/varredura.ts`, `app/api/varredura/route.ts`, `app/api/retrato/route.ts`, `vercel.ts`
- Modify: `lib/analise.ts` (exportar `resumir`)
- Modify: `package.json` (`@vercel/functions`, `@vercel/config`)
- Test: `tests/varredura.test.ts`

**Interfaces:**
- Consumes: `analisarGrupo`, `Dependencias` (Task 2); `Armazem`, `armazemEmMemoria` (Task 4); tipos `Retrato`, `GrupoRetrato`, `ContatoRetrato`, `ListaPosse` (Task 4).
- Produces (`lib/varredura.ts`):
  ```ts
  export const TRAVA_MS = 15 * 60 * 1000;
  export const RESERVA_MS = 60 * 1000;
  export interface DependenciasVarredura extends Dependencias {
    armazem: Armazem;
    agora: () => Date;
    /** Milissegundos que ainda restam à função atual. */
    tempoRestanteMs: () => number;
    /** Dispara outra execução da varredura sem esperar por ela. */
    reinvocar: () => Promise<void>;
  }
  export type ResultadoVarredura =
    | { status: "sem_lista" }
    | { status: "em_andamento"; ate: string }
    | { status: "parcial"; concluidos: number; total: number }
    | { status: "concluida"; concluidos: number; total: number };
  export async function executarVarredura(deps: DependenciasVarredura): Promise<ResultadoVarredura>;
  export function gruposDaLista(lista: ListaPosse, resolverFonte: Dependencias["resolverFonte"]): { ativos: Map<string, ContatoPlanilha[]>; ignorados: { nome: string; contatos: number }[] };
  export function resumirRetrato(grupos: GrupoRetrato[]): ResumoRetrato;
  ```
- `lib/analise.ts` passa a exportar `resumir(grupos: ResultadoGrupo[]): ResumoAnalise`.
- Rota: `GET|POST /api/varredura` → `{ ok: true, ...ResultadoVarredura }` (409 para `em_andamento` e `sem_lista`). `GET /api/retrato` → `{ ok: true, retrato: Retrato | null, progresso: { concluidos, total, emAndamento: boolean } }`.

- [ ] **Step 1: Escrever os testes (vão falhar)**

`tests/varredura.test.ts`:
```ts
import { describe, expect, test, vi } from "vitest";
import { executarVarredura, gruposDaLista, TRAVA_MS, type DependenciasVarredura } from "@/lib/varredura";
import { armazemEmMemoria } from "@/lib/armazem";
import type { ConteudoFonte, ListaPosse, Retrato } from "@/lib/types";

const T0 = Date.UTC(2026, 8, 4, 8, 0, 0);

const lista: ListaPosse = {
  arquivoNome: "l.xlsx",
  enviadoEm: "2026-09-04T00:00:00.000Z",
  contatos: [
    { nome: "Ana Maria Política Completa", grupo: "STF", cargo: "Ministra", alteradoEm: "2026-05-13T10:34:41.000Z" },
    { nome: "Bruno Souza Lima", grupo: "STF", cargo: "Ministro" },
    { nome: "Carla Dias Rocha", grupo: "TCU", cargo: "Ministra" },
    { nome: "Teste Piloto", grupo: "PILOTO" },
  ],
  responsaveis: [],
};

function fonteCom(url: string, nomes: string[]): ConteudoFonte {
  return { url, textoLimpo: nomes.join(", "), destaques: [], pessoas: nomes.map((nome) => ({ nome, cargo: "Ministro", origem: "pagina" as const })) };
}

function depsBase(extra: Partial<DependenciasVarredura> = {}): DependenciasVarredura & { reinvocar: ReturnType<typeof vi.fn> } {
  const reinvocar = vi.fn(async () => {});
  let agoraMs = T0;
  return {
    armazem: armazemEmMemoria({ lista }),
    resolverFonte: (grupo) =>
      grupo === "PILOTO"
        ? { grupoCanonico: "PILOTO", urls: [], ignorado: true, sugestoes: [] }
        : { grupoCanonico: grupo, url: `https://${grupo}`, urls: [`https://${grupo}`], ignorado: false, sugestoes: [] },
    raspar: async (url) => (url === "https://STF" ? fonteCom(url, ["Ana Maria Política Completa", "Bruno Souza Lima"]) : fonteCom(url, [])),
    extrairComposicao: async () => [],
    agora: () => new Date((agoraMs += 1000)),
    tempoRestanteMs: () => 200_000,
    reinvocar,
    ...extra,
  };
}

describe("gruposDaLista", () => {
  test("separa grupos ativos de ignorados", () => {
    const d = depsBase();
    const { ativos, ignorados } = gruposDaLista(lista, d.resolverFonte);
    expect([...ativos.keys()]).toEqual(["STF", "TCU"]);
    expect(ignorados).toEqual([{ nome: "PILOTO", contatos: 1 }]);
  });
});

describe("executarVarredura", () => {
  test("sem lista → sem_lista e nada gravado", async () => {
    const d = depsBase({ armazem: armazemEmMemoria() });
    expect(await executarVarredura(d)).toEqual({ status: "sem_lista" });
    expect(await d.armazem.lerRetrato()).toBeNull();
  });

  test("varredura completa: retrato concluído, grupos ignorados contados, link oficial e data do Contatos", async () => {
    const d = depsBase();
    const r = await executarVarredura(d);
    expect(r).toEqual({ status: "concluida", concluidos: 2, total: 2 });
    const retrato = (await d.armazem.lerRetrato()) as Retrato;
    expect(retrato.concluidoEm).toBeDefined();
    expect(retrato.emAndamentoAte).toBeUndefined();
    expect(retrato.gruposIgnorados).toEqual([{ nome: "PILOTO", contatos: 1 }]);
    const stf = retrato.grupos.find((g) => g.grupo === "STF");
    expect(stf?.contatos[0].semaforo).toBe("verde");
    expect(stf?.contatos[0].linkOficial).toBe("https://STF");
    expect(stf?.contatos[0].alteradoNoContatosEm).toBe("2026-05-13T10:34:41.000Z");
    expect(stf?.fontesLidas).toEqual([{ url: "https://STF", meio: "fetch", pessoas: 2 }]);
    expect(stf?.falhasConsecutivas).toBe(0);
    const tcu = retrato.grupos.find((g) => g.grupo === "TCU");
    expect(tcu?.contatos[0].semaforo).toBe("indeterminado");
    expect(tcu?.contatos[0].linkOficial).toBeUndefined();
    expect(tcu?.falhasConsecutivas).toBe(1);
    expect(retrato.resumo.total).toBe(3);
    expect(retrato.resumo.verde).toBe(2);
    expect(retrato.resumo.indeterminado).toBe(1);
    expect(d.reinvocar).not.toHaveBeenCalled();
  });

  test("scrape que lança erro registra o motivo em fontesLidas", async () => {
    const d = depsBase({ raspar: async () => { throw new Error("HTTP 403"); } });
    await executarVarredura(d);
    const retrato = (await d.armazem.lerRetrato()) as Retrato;
    expect(retrato.grupos[0].fontesLidas[0]).toEqual({ url: "https://STF", meio: "fetch", pessoas: 0, erro: "HTTP 403" });
  });

  test("falhasConsecutivas é herdado do retrato anterior concluído", async () => {
    const d = depsBase();
    await executarVarredura(d);          // TCU: 1
    await executarVarredura(d);          // TCU: 2
    const retrato = (await d.armazem.lerRetrato()) as Retrato;
    expect(retrato.grupos.find((g) => g.grupo === "TCU")?.falhasConsecutivas).toBe(2);
    expect(retrato.grupos.find((g) => g.grupo === "STF")?.falhasConsecutivas).toBe(0);
  });

  test("retrato concluído anterior vai para retrato-anterior ao iniciar outra varredura", async () => {
    const d = depsBase();
    await executarVarredura(d);
    const primeiro = (await d.armazem.lerRetrato()) as Retrato;
    await executarVarredura(d);
    const anterior = (await d.armazem.lerRetratoAnterior()) as Retrato;
    expect(anterior.iniciadoEm).toBe(primeiro.iniciadoEm);
    expect(((await d.armazem.lerRetrato()) as Retrato).iniciadoEm).not.toBe(primeiro.iniciadoEm);
  });

  test("pouco tempo restante: grava checkpoint, reinvoca e devolve parcial; a próxima execução retoma só o que falta", async () => {
    let chamadas = 0;
    const raspar = vi.fn(async (url: string) => (url === "https://STF" ? fonteCom(url, ["Ana Maria Política Completa", "Bruno Souza Lima"]) : fonteCom(url, [])));
    const d = depsBase({
      raspar,
      // Primeira execução: sobra tempo para 1 grupo, depois cai abaixo da reserva.
      tempoRestanteMs: () => (chamadas++ === 0 ? 200_000 : 10_000),
    });
    const r1 = await executarVarredura(d);
    expect(r1).toEqual({ status: "parcial", concluidos: 1, total: 2 });
    expect(d.reinvocar).toHaveBeenCalledTimes(1);
    const parcial = (await d.armazem.lerRetrato()) as Retrato;
    expect(parcial.concluidoEm).toBeUndefined();
    expect(parcial.emAndamentoAte).toBeDefined();
    expect(parcial.grupos.map((g) => g.grupo)).toEqual(["STF"]);

    // Segunda execução (a reinvocação): a trava está no futuro, mas a mesma varredura retoma.
    const d2 = { ...d, tempoRestanteMs: () => 200_000, agora: () => new Date(T0 + 30_000) };
    const r2 = await executarVarredura(d2);
    expect(r2).toEqual({ status: "concluida", concluidos: 2, total: 2 });
    expect(raspar).toHaveBeenCalledTimes(2); // STF na 1ª, TCU na 2ª; nada repetido
    const final = (await d.armazem.lerRetrato()) as Retrato;
    expect(final.iniciadoEm).toBe(parcial.iniciadoEm);
    expect(final.grupos.map((g) => g.grupo)).toEqual(["STF", "TCU"]);
  });

  test("varredura em andamento com trava viva e chamada externa (não retomada) é recusada", async () => {
    const d = depsBase();
    const emCurso: Retrato = {
      versao: 1, iniciadoEm: new Date(T0).toISOString(), emAndamentoAte: new Date(T0 + TRAVA_MS).toISOString(),
      gruposIgnorados: [], grupos: [],
      resumo: { total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0, substituicaoProvavel: 0, indicioSubstituicao: 0, naoInvestigado: 0, custo: { tokensEntrada: 0, tokensSaida: 0, buscas: 0 } },
    };
    await d.armazem.gravarRetrato(emCurso);
    const r = await executarVarredura({ ...d, retomar: false });
    expect(r).toEqual({ status: "em_andamento", ate: emCurso.emAndamentoAte });
  });

  test("trava expirada: assume a varredura interrompida e retoma", async () => {
    const d = depsBase();
    const interrompido: Retrato = {
      versao: 1, iniciadoEm: new Date(T0 - 2 * TRAVA_MS).toISOString(), emAndamentoAte: new Date(T0 - TRAVA_MS).toISOString(),
      gruposIgnorados: [], grupos: [],
      resumo: { total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0, substituicaoProvavel: 0, indicioSubstituicao: 0, naoInvestigado: 0, custo: { tokensEntrada: 0, tokensSaida: 0, buscas: 0 } },
    };
    await d.armazem.gravarRetrato(interrompido);
    const r = await executarVarredura({ ...d, retomar: false });
    expect(r.status).toBe("concluida");
    expect(((await d.armazem.lerRetrato()) as Retrato).iniciadoEm).toBe(interrompido.iniciadoEm);
  });
});
```

Observação de contrato que os testes fixam: `DependenciasVarredura.retomar?: boolean` (default `true` na reinvocação interna; a rota passa `false` para chamadas de cron e do botão). Com `retomar: false` e trava viva, devolve `em_andamento`; com trava expirada, retoma.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/varredura.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Exportar `resumir` em `lib/analise.ts`**

Trocar `function resumir(` por `export function resumir(`.

- [ ] **Step 4: Implementar `lib/varredura.ts`**

```ts
import { analisarGrupo, resumir, type Dependencias } from "@/lib/analise";
import { agruparPorGrupo } from "@/lib/planilha";
import type { Armazem } from "@/lib/armazem";
import type {
  ContatoPlanilha, ContatoRetrato, FonteLida, GrupoRetrato, ListaPosse, ResultadoGrupo, Retrato, ResumoRetrato,
} from "@/lib/types";

export const TRAVA_MS = 15 * 60 * 1000;
export const RESERVA_MS = 60 * 1000;

export interface DependenciasVarredura extends Dependencias {
  armazem: Armazem;
  agora: () => Date;
  /** Milissegundos que ainda restam à função atual. */
  tempoRestanteMs: () => number;
  /** Dispara outra execução da varredura sem esperar por ela. */
  reinvocar: () => Promise<void>;
  /** `true` na reinvocação interna (continua mesmo com trava viva). Cron e botão passam `false`. */
  retomar?: boolean;
}

export type ResultadoVarredura =
  | { status: "sem_lista" }
  | { status: "em_andamento"; ate: string }
  | { status: "parcial"; concluidos: number; total: number }
  | { status: "concluida"; concluidos: number; total: number };

/** Grupos da lista, separando os marcados como `ignorar` no catálogo. Ordem: a da lista. */
export function gruposDaLista(
  lista: ListaPosse,
  resolverFonte: Dependencias["resolverFonte"],
): { ativos: Map<string, ContatoPlanilha[]>; ignorados: { nome: string; contatos: number }[] } {
  const ativos = new Map<string, ContatoPlanilha[]>();
  const ignorados: { nome: string; contatos: number }[] = [];
  for (const [grupo, contatos] of agruparPorGrupo(lista.contatos)) {
    if (resolverFonte(grupo, contatos[0]?.departamento).ignorado) ignorados.push({ nome: grupo, contatos: contatos.length });
    else ativos.set(grupo, contatos);
  }
  return { ativos, ignorados };
}

export function resumirRetrato(grupos: GrupoRetrato[]): ResumoRetrato {
  const base = resumir(grupos);
  let substituicaoProvavel = 0;
  let indicioSubstituicao = 0;
  let naoInvestigado = 0;
  const custo = { tokensEntrada: 0, tokensSaida: 0, buscas: 0 };
  for (const g of grupos) {
    for (const c of g.contatos) {
      const inv = c.investigacao;
      if (!inv) continue;
      const trocou = inv.situacao === "saiu" || inv.situacao === "substituido";
      if (trocou && inv.evidencias.some((e) => e.oficial)) substituicaoProvavel += 1;
      else if (trocou) indicioSubstituicao += 1;
      if (inv.situacao === "nao_investigado") naoInvestigado += 1;
      custo.tokensEntrada += inv.tokens.entrada;
      custo.tokensSaida += inv.tokens.saida;
      custo.buscas += inv.tokens.buscas;
    }
  }
  return { ...base, substituicaoProvavel, indicioSubstituicao, naoInvestigado, custo };
}

function retratoNovo(iniciadoEm: Date, ignorados: { nome: string; contatos: number }[]): Retrato {
  return {
    versao: 1,
    iniciadoEm: iniciadoEm.toISOString(),
    gruposIgnorados: ignorados,
    grupos: [],
    resumo: resumirRetrato([]),
  };
}

function travaViva(retrato: Retrato, agora: Date): boolean {
  return Boolean(retrato.emAndamentoAte) && new Date(retrato.emAndamentoAte as string) > agora;
}

function linkOficialDe(c: ResultadoGrupo["contatos"][number]): string | undefined {
  if (c.possivelSaida || c.semaforo === "indeterminado") return undefined;
  return c.fonteUrl && c.fonteUrl.startsWith("http") ? c.fonteUrl : undefined;
}

function paraGrupoRetrato(
  r: ResultadoGrupo,
  fontesLidas: FonteLida[],
  falhasAnteriores: number,
  concluidoEm: Date,
): GrupoRetrato {
  const contatos: ContatoRetrato[] = r.contatos.map((c) => ({
    ...c,
    linkOficial: linkOficialDe(c),
    alteradoNoContatosEm: c.contato.alteradoEm,
  }));
  const rendeu = fontesLidas.some((f) => f.pessoas > 0);
  return {
    ...r,
    contatos,
    fontesLidas,
    falhasConsecutivas: rendeu ? 0 : falhasAnteriores + 1,
    concluidoEm: concluidoEm.toISOString(),
  };
}

/** Envolve `raspar` para registrar, por URL, quantas pessoas vieram ou qual erro houve. */
function rasparRegistrando(deps: Dependencias, registro: FonteLida[]): Dependencias["raspar"] {
  return async (url) => {
    try {
      const conteudo = await deps.raspar(url);
      registro.push({ url, meio: "fetch", pessoas: conteudo.pessoas.length });
      return conteudo;
    } catch (err) {
      registro.push({ url, meio: "fetch", pessoas: 0, erro: err instanceof Error ? err.message : "erro" });
      throw err;
    }
  };
}

/**
 * Uma execução da varredura. Cada grupo é um checkpoint no retrato; com pouco
 * tempo restante, grava, reinvoca e devolve `parcial`. A execução seguinte
 * retoma do primeiro grupo sem `concluidoEm`.
 */
export async function executarVarredura(deps: DependenciasVarredura): Promise<ResultadoVarredura> {
  const lista = await deps.armazem.lerLista();
  if (!lista) return { status: "sem_lista" };

  const agora = deps.agora();
  const { ativos, ignorados } = gruposDaLista(lista, deps.resolverFonte);
  const total = ativos.size;

  const atual = await deps.armazem.lerRetrato();
  let retrato: Retrato;
  let anterior: Retrato | null;
  if (atual && !atual.concluidoEm) {
    // Varredura em curso ou interrompida.
    if (travaViva(atual, agora) && deps.retomar === false) {
      return { status: "em_andamento", ate: atual.emAndamentoAte as string };
    }
    retrato = atual;
    anterior = await deps.armazem.lerRetratoAnterior();
  } else {
    if (atual) await deps.armazem.gravarRetratoAnterior(atual);
    anterior = atual;
    retrato = retratoNovo(agora, ignorados);
  }

  const falhasAnteriores = new Map((anterior?.grupos ?? []).map((g) => [g.grupo, g.falhasConsecutivas]));
  const concluidos = new Set(retrato.grupos.map((g) => g.grupo));

  for (const [grupo, contatos] of ativos) {
    if (concluidos.has(grupo)) continue;

    if (deps.tempoRestanteMs() < RESERVA_MS) {
      retrato = { ...retrato, emAndamentoAte: new Date(deps.agora().getTime() + TRAVA_MS).toISOString() };
      await deps.armazem.gravarRetrato(retrato);
      await deps.reinvocar();
      return { status: "parcial", concluidos: concluidos.size, total };
    }

    retrato = { ...retrato, emAndamentoAte: new Date(deps.agora().getTime() + TRAVA_MS).toISOString() };
    await deps.armazem.gravarRetrato(retrato);

    const fontesLidas: FonteLida[] = [];
    const resultado = await analisarGrupo(grupo, contatos, { ...deps, raspar: rasparRegistrando(deps, fontesLidas) });
    const grupoRetrato = paraGrupoRetrato(resultado, fontesLidas, falhasAnteriores.get(grupo) ?? 0, deps.agora());
    const grupos = [...retrato.grupos, grupoRetrato];
    retrato = { ...retrato, grupos, resumo: resumirRetrato(grupos) };
    concluidos.add(grupo);
    await deps.armazem.gravarRetrato(retrato);
  }

  const { emAndamentoAte: _descartada, ...semTrava } = retrato;
  void _descartada;
  const final: Retrato = { ...semTrava, gruposIgnorados: ignorados, concluidoEm: deps.agora().toISOString() };
  await deps.armazem.gravarRetrato(final);
  return { status: "concluida", concluidos: concluidos.size, total };
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/varredura.test.ts && npm run typecheck`
Expected: PASS. Se o teste "parcial" falhar por contagem de `tempoRestanteMs`, a ordem esperada é: 1ª chamada antes do STF (200 s, segue), 2ª antes do TCU (10 s, grava e reinvoca).

- [ ] **Step 6: Instalar utilitários da Vercel**

Run: `npm install @vercel/functions && npm install -D @vercel/config`

- [ ] **Step 7: Rotas e cron**

`app/api/varredura/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { executarVarredura, type DependenciasVarredura } from "@/lib/varredura";
import { armazemBlob } from "@/lib/armazem-blob";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { raspar } from "@/lib/scrape";
import { extrairComposicao } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;
/** Orçamento de trabalho abaixo do maxDuration, para a reinvocação sair antes do corte. */
const ORCAMENTO_MS = 280_000;

function ehReinvocacao(req: NextRequest): boolean {
  return req.headers.get("x-fm-reinvocacao") === "1";
}

async function rodar(req: NextRequest) {
  const inicio = Date.now();
  const origem = req.nextUrl.origin;
  const deps: DependenciasVarredura = {
    armazem: armazemBlob(),
    resolverFonte: (grupo, pais) => resolverGrupoEFonte(grupo, undefined, pais),
    raspar,
    extrairComposicao,
    agora: () => new Date(),
    tempoRestanteMs: () => ORCAMENTO_MS - (Date.now() - inicio),
    reinvocar: async () => {
      waitUntil(
        fetch(`${origem}/api/varredura`, {
          method: "POST",
          headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`, "x-fm-reinvocacao": "1" },
        }).catch((err: unknown) => {
          console.error("[/api/varredura] reinvocação falhou:", err instanceof Error ? err.message : "erro");
        }),
      );
    },
    retomar: ehReinvocacao(req),
  };
  try {
    const r = await executarVarredura(deps);
    const status = r.status === "em_andamento" || r.status === "sem_lista" ? 409 : 200;
    return NextResponse.json({ ok: status === 200, ...r }, { status });
  } catch (err) {
    console.error("[/api/varredura] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Falha na varredura." }, { status: 500 });
  }
}

/** Cron da Vercel chama por GET; o botão e a reinvocação, por POST. */
export const GET = rodar;
export const POST = rodar;
```

`app/api/retrato/route.ts`:
```ts
import { NextResponse } from "next/server";
import { armazemBlob } from "@/lib/armazem-blob";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { gruposDaLista } from "@/lib/varredura";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const armazem = armazemBlob();
    const [retrato, lista] = await Promise.all([armazem.lerRetrato(), armazem.lerLista()]);
    const total = lista ? gruposDaLista(lista, (g, p) => resolverGrupoEFonte(g, undefined, p)).ativos.size : 0;
    const emAndamento = Boolean(retrato && !retrato.concluidoEm && retrato.emAndamentoAte && new Date(retrato.emAndamentoAte) > new Date());
    return NextResponse.json({
      ok: true,
      retrato,
      progresso: { concluidos: retrato?.grupos.length ?? 0, total, emAndamento },
    });
  } catch (err) {
    console.error("[/api/retrato] falha:", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ ok: false, message: "Não foi possível ler o retrato." }, { status: 500 });
  }
}
```

`vercel.ts` na raiz:
```ts
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  // 08:00 UTC = 05:00 em Brasília. A Vercel envia "Authorization: Bearer <CRON_SECRET>".
  crons: [{ path: "/api/varredura", schedule: "0 8 * * *" }],
};
```
Se o projeto já tiver `vercel.json`, remover: os dois não coexistem.

- [ ] **Step 8: Verificar localmente**

Run: `npm run dev`; com a lista enviada na Task 6 e `.env.local` completo (inclusive `BLOB_READ_WRITE_TOKEN`):
```bash
curl -s -X POST -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/varredura
curl -s -H "Cookie: fm_sessao=<token>" http://localhost:3000/api/retrato | head -c 600
```
Expected: primeira resposta `{"ok":true,"status":"concluida","concluidos":16,"total":16}` (17 grupos menos o PILOTO), em menos de 5 minutos; a segunda mostra `concluidoEm` preenchido e `progresso.emAndamento: false`. Chamar a varredura duas vezes seguidas rapidamente devolve 409 `em_andamento` na segunda.

Run: `npm test && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 9: Commit**

```bash
git add lib/varredura.ts lib/analise.ts app/api/varredura/route.ts app/api/retrato/route.ts vercel.ts tests/varredura.test.ts package.json package-lock.json
git commit -m "feat: varredura com trava, checkpoint por grupo, retomada e cron diário"
```

---

### Task 8: "Mudou desde a última varredura"

**Files:**
- Create: `lib/diferenca.ts`
- Test: `tests/diferenca.test.ts`

**Interfaces:**
- Consumes: `Retrato`, `GrupoRetrato`, `ContatoRetrato` (Task 4); `normalizarNome` (`lib/normalize.ts`).
- Produces:
  ```ts
  export interface MudancaContato { grupo: string; nome: string; de: string; para: string }
  export interface Diferenca {
    mudaram: MudancaContato[];          // semáforo, possívelSaida ou situação de investigação diferente
    novosApareceram: { grupo: string; nome: string; cargo?: string }[];
    novosSumiram: { grupo: string; nome: string; cargo?: string }[];
    gruposNovos: string[];              // presentes só no atual
    gruposSumiram: string[];            // presentes só no anterior
  }
  export function rotuloEstado(c: ContatoRetrato): string;   // "possível saída" | "não verificado" | semáforo | com sufixo da investigação
  export function calcularDiferenca(atual: Retrato, anterior: Retrato | null): Diferenca;
  ```

- [ ] **Step 1: Escrever os testes (vão falhar)**

`tests/diferenca.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { calcularDiferenca, rotuloEstado } from "@/lib/diferenca";
import type { ContatoRetrato, GrupoRetrato, Retrato } from "@/lib/types";

function contato(nome: string, semaforo: ContatoRetrato["semaforo"], extra: Partial<ContatoRetrato> = {}): ContatoRetrato {
  return {
    contato: { nome, grupo: "G" }, semaforo, score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial", ...extra,
  };
}

function grupo(nome: string, contatos: ContatoRetrato[], novos: { nome: string; cargo?: string }[] = []): GrupoRetrato {
  return {
    grupo: nome, semFonte: false, contatos, novos: novos.map((n) => ({ ...n, origem: "pagina" as const })),
    fontesLidas: [], falhasConsecutivas: 0, concluidoEm: "2026-09-04T05:10:00.000Z",
  };
}

function retrato(grupos: GrupoRetrato[]): Retrato {
  return {
    versao: 1, iniciadoEm: "2026-09-04T05:00:00.000Z", concluidoEm: "2026-09-04T05:10:00.000Z", gruposIgnorados: [], grupos,
    resumo: { total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0, substituicaoProvavel: 0, indicioSubstituicao: 0, naoInvestigado: 0, custo: { tokensEntrada: 0, tokensSaida: 0, buscas: 0 } },
  };
}

describe("rotuloEstado", () => {
  test("prioriza possível saída, depois não verificado, depois o semáforo", () => {
    expect(rotuloEstado(contato("A", "vermelho", { possivelSaida: true }))).toBe("possível saída");
    expect(rotuloEstado(contato("A", "indeterminado"))).toBe("não verificado");
    expect(rotuloEstado(contato("A", "verde"))).toBe("verde");
  });
  test("acrescenta a situação da investigação quando existe", () => {
    const c = contato("A", "vermelho", { possivelSaida: true, investigacao: { situacao: "substituido", evidencias: [], modelo: "m", tokens: { entrada: 0, saida: 0, buscas: 0 } } });
    expect(rotuloEstado(c)).toBe("possível saída · substituido");
  });
});

describe("calcularDiferenca", () => {
  test("sem retrato anterior: nada mudou, mas todos os grupos são novos", () => {
    const d = calcularDiferenca(retrato([grupo("STF", [contato("Ana Lima", "verde")])]), null);
    expect(d.mudaram).toEqual([]);
    expect(d.gruposNovos).toEqual(["STF"]);
  });

  test("detecta contato cujo estado mudou, comparando por grupo + nome normalizado", () => {
    const antes = retrato([grupo("STF", [contato("Ana Maria Lima", "verde")])]);
    const depois = retrato([grupo("STF", [contato("ANA MARIA LIMA", "vermelho", { possivelSaida: true })])]);
    const d = calcularDiferenca(depois, antes);
    expect(d.mudaram).toEqual([{ grupo: "STF", nome: "ANA MARIA LIMA", de: "verde", para: "possível saída" }]);
  });

  test("contato sem mudança não aparece", () => {
    const antes = retrato([grupo("STF", [contato("Ana Lima", "amarelo")])]);
    const depois = retrato([grupo("STF", [contato("Ana Lima", "amarelo")])]);
    expect(calcularDiferenca(depois, antes).mudaram).toEqual([]);
  });

  test("novos que apareceram e que sumiram", () => {
    const antes = retrato([grupo("STF", [], [{ nome: "Bruno Souza", cargo: "Ministro" }])]);
    const depois = retrato([grupo("STF", [], [{ nome: "Carla Dias", cargo: "Ministra" }])]);
    const d = calcularDiferenca(depois, antes);
    expect(d.novosApareceram).toEqual([{ grupo: "STF", nome: "Carla Dias", cargo: "Ministra" }]);
    expect(d.novosSumiram).toEqual([{ grupo: "STF", nome: "Bruno Souza", cargo: "Ministro" }]);
  });

  test("grupos que entraram e saíram entre retratos", () => {
    const antes = retrato([grupo("STF", []), grupo("TCU", [])]);
    const depois = retrato([grupo("STF", []), grupo("STJ", [])]);
    const d = calcularDiferenca(depois, antes);
    expect(d.gruposNovos).toEqual(["STJ"]);
    expect(d.gruposSumiram).toEqual(["TCU"]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/diferenca.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/diferenca.ts`**

```ts
import { normalizarNome } from "@/lib/normalize";
import type { ContatoRetrato, GrupoRetrato, Retrato } from "@/lib/types";

export interface MudancaContato { grupo: string; nome: string; de: string; para: string }
export interface PessoaNova { grupo: string; nome: string; cargo?: string }

export interface Diferenca {
  mudaram: MudancaContato[];
  novosApareceram: PessoaNova[];
  novosSumiram: PessoaNova[];
  gruposNovos: string[];
  gruposSumiram: string[];
}

/** Estado legível de um contato, para comparação e para a tela. */
export function rotuloEstado(c: ContatoRetrato): string {
  const base = c.possivelSaida ? "possível saída" : c.semaforo === "indeterminado" ? "não verificado" : c.semaforo;
  return c.investigacao ? `${base} · ${c.investigacao.situacao}` : base;
}

/** Separador improvável num nome de grupo, para a chave não colidir. */
const SEP = " :: ";

function chave(grupo: string, nome: string): string {
  return `${grupo}${SEP}${normalizarNome(nome)}`;
}

function indexarContatos(grupos: GrupoRetrato[]): Map<string, ContatoRetrato & { grupo: string }> {
  const m = new Map<string, ContatoRetrato & { grupo: string }>();
  for (const g of grupos) for (const c of g.contatos) m.set(chave(g.grupo, c.contato.nome), { ...c, grupo: g.grupo });
  return m;
}

function indexarNovos(grupos: GrupoRetrato[]): Map<string, PessoaNova> {
  const m = new Map<string, PessoaNova>();
  for (const g of grupos) for (const n of g.novos) m.set(chave(g.grupo, n.nome), { grupo: g.grupo, nome: n.nome, cargo: n.cargo });
  return m;
}

export function calcularDiferenca(atual: Retrato, anterior: Retrato | null): Diferenca {
  const gruposAtual = atual.grupos.map((g) => g.grupo);
  if (!anterior) {
    return { mudaram: [], novosApareceram: [], novosSumiram: [], gruposNovos: gruposAtual, gruposSumiram: [] };
  }
  const gruposAnterior = new Set(anterior.grupos.map((g) => g.grupo));
  const antes = indexarContatos(anterior.grupos);
  const mudaram: MudancaContato[] = [];
  for (const [k, c] of indexarContatos(atual.grupos)) {
    const a = antes.get(k);
    if (!a) continue;
    const de = rotuloEstado(a);
    const para = rotuloEstado(c);
    if (de !== para) mudaram.push({ grupo: c.grupo, nome: c.contato.nome, de, para });
  }
  const novosAntes = indexarNovos(anterior.grupos);
  const novosAgora = indexarNovos(atual.grupos);
  return {
    mudaram,
    novosApareceram: [...novosAgora].filter(([k]) => !novosAntes.has(k)).map(([, v]) => v),
    novosSumiram: [...novosAntes].filter(([k]) => !novosAgora.has(k)).map(([, v]) => v),
    gruposNovos: gruposAtual.filter((g) => !gruposAnterior.has(g)),
    gruposSumiram: [...gruposAnterior].filter((g) => !gruposAtual.includes(g)),
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/diferenca.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/diferenca.ts tests/diferenca.test.ts
git commit -m "feat: diferença entre retratos (mudou desde a última varredura)"
```

---

### Task 9: Painel com duas visões, botão de atualizar, `/grupos` com responsáveis e exportação

**Files:**
- Create: `components/painel-cabecalho.tsx`, `components/painel-mudancas.tsx`, `components/painel-lista-posse.tsx`, `components/painel-por-grupo.tsx`, `components/botao-atualizar.tsx`, `components/detalhes-contato.tsx`, `app/analise/page.tsx`
- Modify: `app/page.tsx` (reescrito), `app/grupos/page.tsx`, `components/resultado-tabela.tsx`, `lib/export.ts`, `components/export-buttons.tsx`
- Test: `tests/export.test.ts`

**Interfaces:**
- Consumes: `armazemBlob` (Task 4), `calcularDiferenca`/`rotuloEstado` (Task 8), `listarGruposComFonte` (Task 2), `gruposDaLista` (Task 7).
- Produces: `lib/export.ts` aceita `{ arquivoNome, grupos, resumo }` onde `grupos` pode ser `GrupoRetrato[]` (superconjunto de `ResultadoGrupo`), e as linhas ganham as colunas `Link oficial` e `Última alteração no Contatos`. Assinatura: `export function resultadoParaLinhas(analise: { arquivoNome: string; grupos: ResultadoGrupo[] }): Record<string, string>[]`.

- [ ] **Step 1: Teste da exportação (vai falhar)**

Em `tests/export.test.ts`, acrescentar (ajustar os imports para incluir `GrupoRetrato`):
```ts
  test("linhas de retrato trazem Link oficial e Última alteração no Contatos", () => {
    const grupo: GrupoRetrato = {
      grupo: "STF", semFonte: false, fonteUrl: "https://stf", novos: [], fontesLidas: [], falhasConsecutivas: 0,
      contatos: [{
        contato: { nome: "Ana Lima", grupo: "STF", alteradoEm: "2026-05-13T10:34:41.000Z" },
        semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial", fonteUrl: "https://stf",
        linkOficial: "https://stf", alteradoNoContatosEm: "2026-05-13T10:34:41.000Z",
      }],
    };
    const linhas = resultadoParaLinhas({ arquivoNome: "r", grupos: [grupo] });
    expect(linhas[0]["Link oficial"]).toBe("https://stf");
    expect(linhas[0]["Última alteração no Contatos"]).toBe("2026-05-13T10:34:41.000Z");
  });

  test("linhas de análise avulsa (sem campos de retrato) saem com as colunas novas vazias", () => {
    const linhas = resultadoParaLinhas({
      arquivoNome: "r",
      grupos: [{ grupo: "STF", semFonte: true, novos: [], contatos: [{ contato: { nome: "Ana", grupo: "STF" }, semaforo: "vermelho", score: 0, comparacoes: [], camposDivergentes: [], origem: "oficial" }] }],
    });
    expect(linhas[0]["Link oficial"]).toBe("");
    expect(linhas[0]["Última alteração no Contatos"]).toBe("");
  });
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/export.test.ts`
Expected: FAIL (colunas ausentes / tipo).

- [ ] **Step 3: `lib/export.ts`**

Trocar a assinatura e o corpo de `resultadoParaLinhas`:
```ts
import type { ContatoRetrato, ResultadoContato, ResultadoGrupo } from "@/lib/types";

/** Entrada mínima da exportação: serve para a análise avulsa e para o retrato. */
export interface Exportavel {
  arquivoNome: string;
  grupos: ResultadoGrupo[];
}

function camposRetrato(c: ResultadoContato): Pick<ContatoRetrato, "linkOficial" | "alteradoNoContatosEm"> {
  const r = c as ContatoRetrato;
  return { linkOficial: r.linkOficial, alteradoNoContatosEm: r.alteradoNoContatosEm };
}

export function resultadoParaLinhas(analise: Exportavel): Record<string, string>[] {
  const linhas: Record<string, string>[] = [];
  for (const g of analise.grupos) {
    for (const c of g.contatos) {
      const extra = camposRetrato(c);
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Status: c.possivelSaida ? "possível saída" : c.semaforo,
        Divergencias: c.camposDivergentes.map((d) => d.campo).join(", "),
        Origem: c.origem,
        Fonte: c.fonteUrl ?? "",
        "Link oficial": extra.linkOficial ?? "",
        "Última alteração no Contatos": extra.alteradoNoContatosEm ?? "",
        Observacao: c.observacao ?? "",
      };
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = valorPlanilhaDe(c, f.campo);
        linha[`${f.rotulo} (site)`] = valorSiteDe(c, f.campo);
      }
      linhas.push(linha);
    }
    for (const novo of g.novos) {
      const siteNome = novo.origem === "conhecimento" ? `${novo.nome} (via IA)` : novo.nome;
      const siteCargo = novo.cargo
        ? novo.origem === "conhecimento"
          ? `${novo.cargo} (via IA)`
          : novo.cargo
        : "";
      linhas.push({
        Grupo: g.grupo,
        Status: "novo",
        Divergencias: "",
        Origem: novo.origem === "conhecimento" ? "pesquisa_ampla" : "oficial",
        Fonte: g.fonteUrl ?? "",
        "Link oficial": g.fonteUrl ?? "",
        "Última alteração no Contatos": "",
        Observacao: "Pessoa na fonte sem correspondência na planilha",
        "Nome (planilha)": "",
        "Nome (site)": siteNome,
        "Cargo (planilha)": "",
        "Cargo (site)": siteCargo,
        "Endereço (planilha)": "",
        "Endereço (site)": novo.endereco ?? "",
      });
    }
  }
  return linhas;
}
```
`gerarXlsx` e `gerarCsv` passam a receber `Exportavel`. Em `components/export-buttons.tsx`, trocar o tipo da prop para `Exportavel` e o nome do arquivo para `props.nomeArquivo ?? "resultado"`:
```tsx
export function ExportButtons({ analise, nomeArquivo = "resultado" }: { analise: Exportavel; nomeArquivo?: string })
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/export.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Mover a análise avulsa para `/analise`**

`git mv app/page.tsx app/analise/page.tsx`. Nesse arquivo, trocar o título para "Análise avulsa de planilha" e o link do topo para `<Link href="/">← Painel</Link>`. Em `components/resultado-tabela.tsx`, linha 38, trocar o texto "(verificado por pesquisa ampla — Gemini + Google Search; fonte oficial não acessível" por "(composição dependeu do conhecimento da IA; confira na fonte oficial".

- [ ] **Step 6: Componentes do painel**

`components/botao-atualizar.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Progresso = { concluidos: number; total: number; emAndamento: boolean };

export function BotaoAtualizar({ inicial }: { inicial: Progresso }) {
  const router = useRouter();
  const [progresso, setProgresso] = useState<Progresso>(inicial);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!progresso.emAndamento) return;
    const id = setInterval(async () => {
      try {
        const resp = await fetch("/api/retrato");
        const json = (await resp.json()) as { ok: boolean; progresso?: Progresso };
        if (json.ok && json.progresso) {
          setProgresso(json.progresso);
          if (!json.progresso.emAndamento) router.refresh();
        }
      } catch {
        // rede instável: tenta no próximo tick
      }
    }, 5000);
    return () => clearInterval(id);
  }, [progresso.emAndamento, router]);

  async function atualizar() {
    setErro(null);
    const resp = await fetch("/api/varredura", { method: "POST" });
    const json = (await resp.json()) as { ok: boolean; status?: string; message?: string; total?: number };
    if (!json.ok && json.status !== "em_andamento") {
      setErro(json.status === "sem_lista" ? "Envie a lista da Posse antes de varrer." : json.message ?? "Falha ao iniciar.");
      return;
    }
    setProgresso({ concluidos: 0, total: json.total ?? progresso.total, emAndamento: true });
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={atualizar}
        disabled={progresso.emAndamento}
        className="rounded bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {progresso.emAndamento ? `Varrendo… ${progresso.concluidos}/${progresso.total} grupos` : "Atualizar agora"}
      </button>
      {erro && <span className="text-sm text-red-600">{erro}</span>}
    </div>
  );
}
```

`components/painel-cabecalho.tsx`:
```tsx
import Link from "next/link";
import type { Retrato } from "@/lib/types";
import { BotaoAtualizar } from "@/components/botao-atualizar";

function fmt(iso?: string): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca";
}

export function PainelCabecalho({ retrato, progresso }: { retrato: Retrato | null; progresso: { concluidos: number; total: number; emAndamento: boolean } }) {
  const r = retrato?.resumo;
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fiscal de Mailings · Posse 2027</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/grupos" className="underline">Grupos</Link>
          <Link href="/enviar-lista" className="underline">Enviar lista</Link>
          <Link href="/analise" className="underline">Análise avulsa</Link>
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-white p-3 text-sm">
        <div>
          Última varredura: <strong>{fmt(retrato?.concluidoEm)}</strong>
          {retrato && !retrato.concluidoEm && <span className="text-amber-700"> (interrompida: {retrato.grupos.length} de {progresso.total} grupos)</span>}
        </div>
        <BotaoAtualizar inicial={progresso} />
      </div>
      {r && (
        <p className="text-sm text-gray-700">
          {r.total} contatos · confere {r.verde} · revisar {r.amarelo} · divergência {r.vermelho} · não verificado {r.indeterminado} · novos {r.novo}
          {retrato && retrato.gruposIgnorados.length > 0 && (
            <span className="text-gray-500"> · {retrato.gruposIgnorados.reduce((n, g) => n + g.contatos, 0)} registros ignorados (grupo de teste)</span>
          )}
        </p>
      )}
    </header>
  );
}
```

`components/painel-mudancas.tsx`:
```tsx
import type { Diferenca } from "@/lib/diferenca";

export function PainelMudancas({ diferenca, desde }: { diferenca: Diferenca; desde?: string }) {
  const vazio = diferenca.mudaram.length + diferenca.novosApareceram.length + diferenca.novosSumiram.length === 0;
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">
        Mudou desde a última varredura{desde ? ` (${new Date(desde).toLocaleDateString("pt-BR")})` : ""}
      </h2>
      {vazio ? (
        <p className="text-sm text-gray-500">Nenhuma mudança.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {diferenca.mudaram.map((m) => (
            <li key={`${m.grupo}-${m.nome}`}>{m.grupo}: {m.nome} passou de <em>{m.de}</em> para <strong>{m.para}</strong></li>
          ))}
          {diferenca.novosApareceram.map((n) => (
            <li key={`n-${n.grupo}-${n.nome}`}>{n.grupo}: apareceu {n.nome}{n.cargo ? ` (${n.cargo})` : ""}</li>
          ))}
          {diferenca.novosSumiram.map((n) => (
            <li key={`s-${n.grupo}-${n.nome}`}>{n.grupo}: {n.nome} deixou de aparecer como novo</li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`components/detalhes-contato.tsx`:
```tsx
import type { ContatoRetrato } from "@/lib/types";

export function DetalhesContato({ c }: { c: ContatoRetrato }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer underline">detalhes</summary>
      <ul className="mt-1 space-y-0.5">
        {c.comparacoes.map((x) => (
          <li key={x.campo}>
            {x.campo}: planilha "{x.valorPlanilha}" · site {x.situacao === "fonte_nao_informa" ? "não informa" : `"${x.valorSite ?? ""}"`} · {x.situacao}
            {x.origemValor === "conhecimento" ? " (≈ via IA, confira)" : ""}
          </li>
        ))}
        {c.observacao && <li>{c.observacao}</li>}
        {c.investigacao && (
          <li>
            Investigação: {c.investigacao.situacao}
            {c.investigacao.sucessor ? ` · sucessor: ${c.investigacao.sucessor}` : ""}
            {c.investigacao.evidencias.map((e) => (
              <div key={e.url}><a href={e.url} target="_blank" rel="noreferrer" className="underline">{e.oficial ? "oficial" : "imprensa"}</a>: {e.trecho}</div>
            ))}
          </li>
        )}
      </ul>
    </details>
  );
}
```

`components/painel-lista-posse.tsx` (client, com filtro):
```tsx
"use client";
import { useMemo, useState } from "react";
import type { ContatoRetrato, Retrato, Semaforo } from "@/lib/types";
import { rotuloEstado } from "@/lib/diferenca";
import { SemaforoBadge } from "@/components/semaforo-badge";
import { DetalhesContato } from "@/components/detalhes-contato";

type Linha = ContatoRetrato & { grupo: string };
type Filtro = "todos" | Semaforo | "possivel_saida";

function origemDe(c: ContatoRetrato): string {
  return c.origem === "pesquisa_ampla" ? "≈ via IA" : "oficial";
}

export function PainelListaPosse({ retrato }: { retrato: Retrato }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [grupo, setGrupo] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const linhas = useMemo<Linha[]>(
    () => retrato.grupos.flatMap((g) => g.contatos.map((c) => ({ ...c, grupo: g.grupo }))),
    [retrato],
  );
  const grupos = useMemo(() => retrato.grupos.map((g) => g.grupo), [retrato]);
  const visiveis = linhas.filter((l) => {
    if (grupo !== "todos" && l.grupo !== grupo) return false;
    if (filtro === "possivel_saida" ? !l.possivelSaida : filtro !== "todos" && l.semaforo !== filtro) return false;
    if (busca && !l.contato.nome.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR"))) return false;
    return true;
  });

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="rounded border px-2 py-1">
          <option value="todos">Todos os status</option>
          <option value="verde">Confere</option>
          <option value="amarelo">Revisar</option>
          <option value="possivel_saida">Possível saída</option>
          <option value="vermelho">Divergência</option>
          <option value="indeterminado">Não verificado</option>
        </select>
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="rounded border px-2 py-1">
          <option value="todos">Todos os grupos</option>
          {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome" className="rounded border px-2 py-1" />
        <span className="self-center text-gray-500">{visiveis.length} de {linhas.length}</span>
      </div>
      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr><th className="p-2">Nome</th><th className="p-2">Cargo</th><th className="p-2">Grupo</th><th className="p-2">Status</th><th className="p-2">Site oficial</th><th className="p-2">Origem</th><th className="p-2">Alterado no Contatos</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {visiveis.map((l, i) => (
              <tr key={`${l.grupo}-${i}`} className="border-t align-top">
                <td className="p-2">{l.contato.nome}</td>
                <td className="p-2">{l.contato.cargo ?? ""}</td>
                <td className="p-2">{l.grupo}</td>
                <td className="p-2">
                  {l.possivelSaida ? <span className="text-red-600">possível saída</span> : <SemaforoBadge status={l.semaforo} />}
                  {l.investigacao && <div className="text-xs text-gray-600">{rotuloEstado(l).split(" · ")[1]}</div>}
                </td>
                <td className="p-2">{l.linkOficial ? <a href={l.linkOficial} target="_blank" rel="noreferrer" className="underline">ver no site</a> : ""}</td>
                <td className="p-2">{origemDe(l)}</td>
                <td className="p-2">{l.alteradoNoContatosEm ? new Date(l.alteradoNoContatosEm).toLocaleDateString("pt-BR") : ""}</td>
                <td className="p-2"><DetalhesContato c={l} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

`components/painel-por-grupo.tsx` (Server Component, reaproveita a tabela existente):
```tsx
import type { GrupoRetrato, ResponsaveisGrupo, ResumoRetrato } from "@/lib/types";
import { ResultadoTabela } from "@/components/resultado-tabela";

export function PainelPorGrupo({ grupos, resumo, responsaveis }: { grupos: GrupoRetrato[]; resumo: ResumoRetrato; responsaveis: ResponsaveisGrupo[] }) {
  const porGrupo = new Map(responsaveis.map((r) => [r.grupo, r]));
  return (
    <section className="space-y-4">
      {grupos.map((g) => {
        const r = porGrupo.get(g.grupo);
        return (
          <div key={g.grupo}>
            {r && (
              <p className="mb-1 text-xs text-gray-600">
                Responsáveis: {[r.responsavel1, r.responsavel2, r.backup].filter(Boolean).join(" · ")}
              </p>
            )}
            <ResultadoTabela analise={{ arquivoNome: "retrato", grupos: [g], resumo }} />
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 7: Página `/` (painel)**

`app/page.tsx`:
```tsx
import Link from "next/link";
import { armazemBlob } from "@/lib/armazem-blob";
import { calcularDiferenca } from "@/lib/diferenca";
import { gruposDaLista } from "@/lib/varredura";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { PainelCabecalho } from "@/components/painel-cabecalho";
import { PainelMudancas } from "@/components/painel-mudancas";
import { PainelListaPosse } from "@/components/painel-lista-posse";
import { PainelPorGrupo } from "@/components/painel-por-grupo";
import { ExportButtons } from "@/components/export-buttons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ visao?: string }> }) {
  const { visao = "posse" } = await searchParams;
  const armazem = armazemBlob();
  const [retrato, anterior, lista] = await Promise.all([armazem.lerRetrato(), armazem.lerRetratoAnterior(), armazem.lerLista()]);
  const total = lista ? gruposDaLista(lista, (g, p) => resolverGrupoEFonte(g, undefined, p)).ativos.size : 0;
  const emAndamento = Boolean(retrato && !retrato.concluidoEm && retrato.emAndamentoAte && new Date(retrato.emAndamentoAte) > new Date());
  const progresso = { concluidos: retrato?.grupos.length ?? 0, total, emAndamento };

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-6">
      <PainelCabecalho retrato={retrato} progresso={progresso} />
      {!lista && (
        <p className="rounded border bg-white p-4 text-sm">
          Passo 1: <Link href="/enviar-lista" className="underline">envie a lista da Posse</Link>. Passo 2: clique em "Atualizar agora".
        </p>
      )}
      {retrato && (
        <>
          <PainelMudancas diferenca={calcularDiferenca(retrato, anterior)} desde={anterior?.concluidoEm} />
          <div className="flex items-center justify-between text-sm">
            <nav className="flex gap-3">
              <Link href="/?visao=posse" className={visao === "posse" ? "font-semibold underline" : "underline"}>Lista da Posse</Link>
              <Link href="/?visao=grupo" className={visao === "grupo" ? "font-semibold underline" : "underline"}>Por grupo</Link>
            </nav>
            <ExportButtons analise={{ arquivoNome: "retrato", grupos: retrato.grupos }} nomeArquivo="retrato-posse-2027" />
          </div>
          {visao === "grupo"
            ? <PainelPorGrupo grupos={retrato.grupos} resumo={retrato.resumo} responsaveis={lista?.responsaveis ?? []} />
            : <PainelListaPosse retrato={retrato} />}
        </>
      )}
    </main>
  );
}
```
`ResultadoTabela` recebe `ResultadoAnalise`; `{ arquivoNome, grupos: [g], resumo }` satisfaz o tipo porque `GrupoRetrato` estende `ResultadoGrupo` e `ResumoRetrato` estende `ResumoAnalise`.

- [ ] **Step 8: `/grupos` com responsáveis do Blob**

`app/grupos/page.tsx`: tornar `async`, ler `const lista = await armazemBlob().lerLista();`, montar `const resp = new Map((lista?.responsaveis ?? []).map((r) => [r.grupo, r]));` e reintroduzir as três colunas de responsáveis lendo de `resp.get(g.nome)` (com `?? ""` em cada campo). Manter `FonteStatus`; se `g.fontes.length > 1`, listar todas as URLs, uma por linha. Acrescentar `export const dynamic = "force-dynamic";`. Marcar grupos com `ignorar` com o texto "(ignorado na varredura)".

- [ ] **Step 9: Verificar no navegador**

Run: `npm run dev`; entrar; rodar "Atualizar agora"; conferir: cabeçalho com data e contadores, bloco de mudanças, filtros da lista, links "ver no site", visão por grupo com responsáveis, exportação com as colunas novas; `/analise` continua funcionando; `/grupos` mostra responsáveis quando enviados.

Run: `npm test && npm run typecheck && npm run build`
Expected: verde.

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx app/analise/page.tsx app/grupos/page.tsx components lib/export.ts tests/export.test.ts
git commit -m "feat: painel da Posse com duas visões, mudanças desde a última varredura e exportação ampliada"
```

---

### Task 10: Documentação e variáveis na Vercel

**Files:**
- Modify: `CLAUDE.md`, `README.md`

**Interfaces:** nenhuma.

- [ ] **Step 1: CLAUDE.md**

Na tabela "Documentos de decisão", acrescentar a linha:
```
| 2026-09-04 | `varredura-continua-posse-2027-design.md` | Lista da Posse + retrato no Blob privado; senha única; varredura agendada; investigação por busca (plano seguinte) | **Vigente** |
```
Em "Princípios de implementação", trocar o item "Sem banco de dados" por:
```
- **Sem banco de dados, com Blob.** Catálogo em `data/catalogo.ts`. Lista da Posse e retrato vivem em três JSON no Vercel Blob privado, atrás da interface `Armazem` (`lib/armazem.ts`). Não reintroduzir Postgres/ORM sem novo spec.
```
Em "O que NÃO fazer", substituir "Não persistir resultados de análise." por "Não persistir nada fora dos três objetos do `Armazem`." e "Não adicionar autenticação..." por "Não adicionar multiusuário, login institucional ou RLS. A senha única em `APP_SENHA` é o limite."
Em "Segurança e dados", acrescentar: "Variáveis obrigatórias em produção: `APP_SENHA`, `APP_SEGREDO_COOKIE`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`."
Em "Layout do código", acrescentar `middleware.ts`, `vercel.ts`, `lib/armazem*.ts`, `lib/varredura.ts`, `lib/diferenca.ts`, `lib/sessao.ts`, `lib/responsaveis.ts` e as rotas `/entrar`, `/enviar-lista`, `/analise`, `/api/lista`, `/api/varredura`, `/api/retrato`.
Em "Estado do projeto", atualizar a data e a contagem de testes com o resultado real de `npm test`.

- [ ] **Step 2: README.md**

Reescrever "Como funciona" e "Setup local":
```markdown
## Como funciona

1. Entre com a senha única do GT.
2. Envie a planilha da lista da Posse exportada do Sistema Contatos (e, se quiser, a planilha de responsáveis por grupo).
3. O app varre os sites oficiais de cada grupo todo dia às 5h, ou quando você clica em "Atualizar agora", e guarda o retrato.
4. O painel abre com o retrato: lista da Posse com status por pessoa e link para o site oficial, visão por grupo, o que mudou desde a última varredura, exportação em XLSX/CSV.

A análise avulsa de uma planilha qualquer continua em `/analise`.

## Setup local

Pré-requisitos: Node 20+, projeto ligado a um Vercel Blob (`vercel integration add blob`).

```bash
npm install
cp .env.example .env.local   # preencher APP_SENHA, APP_SEGREDO_COOKIE, CRON_SECRET; BLOB_READ_WRITE_TOKEN via `vercel env pull`
npm run dev
```
```
Atualizar a tabela de variáveis com as quatro obrigatórias e a `ANTHROPIC_API_KEY` opcional.

- [ ] **Step 3: Variáveis na Vercel**

```bash
vercel env add APP_SENHA production
vercel env add APP_SEGREDO_COOKIE production
vercel env add CRON_SECRET production
```
(e o mesmo para `preview`). Confirmar no painel que `BLOB_READ_WRITE_TOKEN` já existe.

- [ ] **Step 4: Verificação de ponta a ponta na Vercel**

`vercel deploy --prod`. Abrir a URL, entrar, enviar a lista real, clicar em "Atualizar agora", esperar concluir. Conferir: 16 grupos no retrato, TCU como "não verificado" (até o plano de investigação), STF verde para os ministros presentes na página, exportação baixa. No painel da Vercel, a aba Crons mostra o job às 08:00 UTC.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: CLAUDE.md e README refletem lista da Posse, Blob, senha e varredura agendada"
```

---

## Cobertura do spec

O que este plano entrega, por seção do spec:

| Seção | Onde |
|---|---|
| §3 Visão geral | Tasks 2, 3, 4, 6, 7, 9 |
| §4 Armazenamento e acesso | Tasks 4 e 5 |
| §5 Modelo de dados do retrato | Task 4 (inclusive os tipos da investigação, para o retrato já nascer estável) |
| §6 Catálogo | Task 2 |
| §7 Varredura | Task 7 |
| §9 Interface | Task 9 (menos as fontes propostas, que dependem do §8b) |
| §10 Falhas | Tasks 5, 6, 7, 9 |
| §11 Testes | Tasks 2 a 9 |
| §13 Segurança e PII | Global Constraints, Tasks 2, 4, 5, 6 |
| §14 Regras alteradas | Task 10 |

O que fica explicitamente para o plano seguinte, e por quê:

- **§8 inteiro (motor de investigação).** Cascata com Chromium, fonte proposta e investigação de substituição. A Task 1 só decide se o Chromium é viável; nada dele entra em produção aqui.
- **§8d rótulos novos.** `substituicaoProvavel`, `indicioSubstituicao` e `naoInvestigado` já são contados por `resumirRetrato`, mas sempre valem zero até a investigação existir. O painel não os exibe ainda.
- **§12 custo na tela.** `resumo.custo` existe e fica zerado; o painel passa a mostrá-lo quando houver o que mostrar.
- **§10, cache do navegador.** O spec prevê exibir o último retrato guardado em IndexedDB quando o Blob estiver indisponível. Aqui a falha de leitura do Blob mostra mensagem de erro clara na página; o cache local entra depois, se o problema aparecer na prática.

## Plano seguinte

`docs/superpowers/plans/2026-09-XX-varredura-posse-2027-investigacao.md`, a escrever depois desta fundação estar em produção, cobrindo o §8 do spec: cascata com Chromium (se a Task 1 disse "viável"), fonte proposta, investigação de substituição com Sonnet 5 e busca, rótulos novos no painel e nas exportações, contadores `substituicaoProvavel`/`indicioSubstituicao`/`naoInvestigado` e custo por varredura.
