# Painel local com retrato em arquivo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app, rodando nesta máquina, abre mostrando a última varredura com data, no layout do mockup de 2026-09-30 (etiquetas por campo, linha expansível, bloco de endereço, Copiar), e a tela "Nova varredura" grava um retrato novo em arquivo local.

**Architecture:** O `ResultadoAnalise` de hoje vira `Retrato` (mais `geradoEm` e as planilhas) e persiste em `.fiscal/retrato.json` por uma interface `Armazem` injetável. Toda a lógica de apresentação (etiquetas, situação, filtros, cartões, detalhe por campo) é função pura em `lib/painel.ts`, testada; os componentes só renderizam. A Vercel sai da stack: o app é local.

**Tech Stack:** Next.js 15 (App Router) + TypeScript + Tailwind v4 (`@theme`) + `next/font/google` + SheetJS + Vitest. Nenhuma dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md` — a autoridade. Leia antes de começar. O mockup está em `https://claude.ai/artifact/6HjpnkA5eS2Wd2DTfqv3u3`.

## Global Constraints

- `lib/*.ts` são funções puras: sem JSX, sem hooks, sem `window`. Exceção documentada no spec: `lib/armazem.ts` toca o disco, porque é a fronteira injetável (como `lib/scrape.ts` toca a rede).
- Imutabilidade: nenhuma função muta input; devolve novo objeto/array.
- **Sem `any`.** `unknown` + narrowing, ou tipo declarado.
- **Sem PII no log nem no prompt.** O retrato tem nome, telefone, e-mail e endereço: **nunca** vai para `console.*`, nunca entra no git. `.fiscal/` entra no `.gitignore` na Task 2.
- **UI sem lógica de negócio.** Componentes chamam `lib/painel.ts` e renderizam. Qualquer regra nova de "o que aparece" nasce em `lib/painel.ts` com teste.
- **Rótulos:** onde o mockup e o código já existente divergem, vale o do código (semântica dos vereditos do `CLAUDE.md`, rótulos da Fase 1 de endereço). Textos novos em português do Brasil, sem travessão no lugar de vírgula (use dois-pontos ou vírgula). Textos que já existem no código (ex.: "(via IA — confira)") continuam como estão.
- **Vereditos e comparações não mudam.** `lib/match.ts`, `lib/tratamento.ts`, `lib/endereco.ts` e `lib/export.ts` não são tocados, exceto onde este plano diz.
- Erros tipados: `RetratoIlegivelError` em `lib/armazem.ts`; a rota continua devolvendo `{ ok: false, message }` com 400/422/500.
- Comentários e nomes de teste em português do Brasil, na voz dos arquivos vizinhos. Testes em AAA.
- Gerenciador é npm: `npm test`, `npm run typecheck`, `npm run build`. Nunca criar nem commitar `pnpm-lock.yaml` / `pnpm-workspace.yaml`.
- **Não commitar `CLAUDE.md`** antes da Task 9 (ele carrega alteração não commitada do usuário; a Task 9 diz como tratar). Não commitar `PROXIMA_SESSAO*.md` nem nenhum `.xlsx`.
- Commit: conventional commit em português, terminando com a linha exata (confira com `git log -1 --format=%B`):
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Branch de trabalho: `feat/painel-local` (já criada sobre `main`, com o spec commitado em `ef3269a`).

## Review Focus

Classes de entrada que o spec pressupõe e o mundo real traz. Cada uma tem o teste apontado na tarefa dona:

1. **Retrato gravado por uma versão anterior do código**, sem campos que o resumo ganhou depois (`possivelSaida`, `contatosSemFonte`): os cartões não podem mostrar `NaN`. → Task 4, Step 1 (`cartoesDoResumo` trata campo ausente como 0).
2. **Contato de grupo sem fonte com tratamento divergente**: a situação diz "Sem fonte", mas a etiqueta "Tratamento diverge" aparece e o filtro "Só o que tem ressalva" o inclui. → Task 3, Step 1 (etiquetas) e Task 4, Step 1 (filtro).
3. **Possível saída com achado da Camada C no nome**: as duas coisas aparecem, "Sem par na fonte" e "Nome diverge" (contrato herdado de `celulaDivergencias`). → Task 3, Step 1.
4. **Busca com acento e caixa diferentes** ("joao" acha "João", "TST" acha "tst"). → Task 4, Step 1.
5. **Gravar o retrato quando `.fiscal/retrato.json` já existe** (no Windows, `rename` precisa substituir o arquivo). → Task 2, Step 1.

---

## Arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `lib/types.ts` | `Retrato`; `ResumoAnalise.possivelSaida` e `contatosSemFonte`; `ResultadoGrupo.responsavel` | 1 |
| `lib/catalogo.ts` | `FonteResolvida.responsavel` | 1 |
| `lib/analise.ts` | `resumir` com os dois contadores; `responsavel` no grupo | 1 |
| `tests/export.test.ts` | literais de resumo ganham os dois campos | 1 |
| `lib/armazem.ts` | `Armazem`, memória, arquivo, `armazemPadrao`, `RetratoIlegivelError` | 2 |
| `.gitignore` | `.fiscal/` | 2 |
| `lib/painel.ts` | etiquetas, situação, motivo, detalhe por campo | 3 |
| `lib/painel.ts` | filtros, busca, cartões, endereço para copiar, data, `montarRetrato` | 4 |
| `tests/celula-divergencias.test.ts`, `lib/celula-divergencias.ts` | saem (contrato migra para `tests/painel.test.ts`) | 3 |
| `app/api/analise/route.ts` | grava o retrato; resposta `{ ok, retrato, aviso? }`; sem diretivas da Vercel | 5 |
| `app/layout.tsx`, `app/globals.css`, `components/etiqueta.tsx` | fontes e tokens do mockup; componente de etiqueta | 6 |
| `app/nova-varredura/page.tsx`, `components/nova-varredura-form.tsx` | tela de envio | 7 |
| `components/upload-zone.tsx` | sai | 7 |
| `app/page.tsx`, `components/painel.tsx`, `components/linha-contato.tsx` | painel | 8 |
| `components/resultado-tabela.tsx`, `components/semaforo-badge.tsx` | saem | 8 |
| `CLAUDE.md` | regras que mudam; linha do spec | 9 |

---

### Task 1: Tipos do retrato, contadores novos e responsável do grupo

**Files:**
- Modify: `lib/types.ts` (depois de `ResultadoAnalise`, ~linha 177; `ResumoAnalise` ~linha 158; `ResultadoGrupo` ~linha 130)
- Modify: `lib/catalogo.ts:62-71` (`FonteResolvida`) e `resolverGrupoEFonte` (~linha 123)
- Modify: `lib/analise.ts` (`analisarGrupo` e `resumir`)
- Modify: `tests/export.test.ts` (6 literais de resumo)
- Test: `tests/analise.test.ts`, `tests/catalogo.test.ts` (se não existir, crie `tests/catalogo-responsavel.test.ts`)

**Interfaces:**
- Consumes: nada novo.
- Produces: `Retrato` (`ResultadoAnalise & { geradoEm: string; planilhaContatos: { nome: string; linhas: number }; planilhaEnderecos?: { nome: string; linhas: number } }`); `ResumoAnalise.possivelSaida: number`, `ResumoAnalise.contatosSemFonte: number`; `ResultadoGrupo.responsavel?: string`; `FonteResolvida.responsavel?: string`.

- [ ] **Step 1: Escreva os testes que falham**

Em `tests/analise.test.ts`, dentro do `describe("analisar")`, no fim:

```ts
  test("resumo conta possível saída e contatos de grupo sem fonte, separados do vermelho", async () => {
    // Arrange: "Pessoa Que Saiu" está no grupo com fonte mas não na página; "Pessoa Sem Fonte" está em grupo sem URL.
    const lista: ContatoPlanilha[] = [
      ...contatos,
      { nome: "Pessoa Que Saiu Daqui", grupo: "ORG", ...CADASTRO_OK },
    ];

    // Act
    const r = await analisar("c.xlsx", lista, deps);

    // Assert
    expect(r.resumo.possivelSaida).toBe(1);
    expect(r.resumo.contatosSemFonte).toBe(1);
    expect(r.resumo.vermelho).toBe(2);
  });

  test("grupo leva o responsável que o catálogo informa", async () => {
    // Arrange
    const comResponsavel: Dependencias = {
      ...deps,
      resolverFonte: (grupo) => ({ ...deps.resolverFonte(grupo), responsavel: "Fulana de Tal" }),
    };

    // Act
    const r = await analisar("c.xlsx", contatos, comResponsavel);

    // Assert: nos dois caminhos (com fonte e sem fonte)
    expect(r.grupos[0].responsavel).toBe("Fulana de Tal");
    expect(r.grupos[1].responsavel).toBe("Fulana de Tal");
  });

  test("sem responsável no catálogo, o campo fica ausente", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    expect(r.grupos[0].responsavel).toBeUndefined();
  });
```

Em `tests/catalogo-responsavel.test.ts` (novo):

```ts
import { describe, expect, test } from "vitest";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import type { GrupoCatalogo } from "@/lib/types";

const catalogo: readonly GrupoCatalogo[] = [
  {
    nome: "Ministros do TST",
    responsavel1: "Priscilla Flores",
    fontes: [{ url: "https://www.tst.jus.br/ministros", ativo: true }],
  },
  { nome: "Governadores", fontes: [] },
];

describe("resolverGrupoEFonte: responsável", () => {
  test("devolve o responsavel1 do grupo casado", () => {
    expect(resolverGrupoEFonte("Ministros do TST", catalogo).responsavel).toBe("Priscilla Flores");
  });

  test("grupo sem responsável não ganha o campo", () => {
    expect(resolverGrupoEFonte("Governadores", catalogo).responsavel).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/analise.test.ts tests/catalogo-responsavel.test.ts`
Expected: FAIL — `possivelSaida`, `contatosSemFonte` e `responsavel` não existem.

- [ ] **Step 3: Tipos em `lib/types.ts`**

Em `ResumoAnalise`, depois de `enderecosAConfirmar`:

```ts
  /** Contatos marcados `possivelSaida`. Subconjunto de `vermelho`. */
  possivelSaida: number;
  /** Contatos de grupo sem URL cadastrada. Subconjunto de `vermelho`. */
  contatosSemFonte: number;
```

Em `ResultadoGrupo`, depois de `sugestoesCadastro`:

```ts
  /** `responsavel1` do grupo no catálogo. Só o nome; e-mails não saem do catálogo. */
  responsavel?: string;
```

Depois de `ResultadoAnalise`:

```ts
/**
 * O que o app guarda entre uma abertura e outra: o resultado de uma varredura, a hora em
 * que terminou e as planilhas que a alimentaram. Um só, em `.fiscal/retrato.json`, fora do
 * git. Ver docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md
 */
export interface Retrato extends ResultadoAnalise {
  /** Hora em que a varredura terminou, ISO 8601. */
  geradoEm: string;
  /** Nome e linhas lidas da planilha de contatos. */
  planilhaContatos: { nome: string; linhas: number };
  /** Presente só quando a planilha de endereços foi enviada. */
  planilhaEnderecos?: { nome: string; linhas: number };
}
```

- [ ] **Step 4: `FonteResolvida.responsavel` em `lib/catalogo.ts`**

Na interface, depois de `ufs`:

```ts
  /** `responsavel1` do grupo casado, quando cadastrado. Só o nome. */
  responsavel?: string;
```

No `return` final de `resolverGrupoEFonte`:

```ts
  return {
    grupoCanonico: grupo.nome,
    fontes,
    ...(grupo.ufs ? { ufs: grupo.ufs } : {}),
    ...(grupo.responsavel1 ? { responsavel: grupo.responsavel1 } : {}),
    sugestoes: [],
  };
```

- [ ] **Step 5: `lib/analise.ts`**

Acrescente, antes de `analisarGrupo`:

```ts
/** Carimba o responsável do catálogo no grupo, nos três caminhos (com fonte, sem fonte, inacessível). */
function comResponsavel(grupo: ResultadoGrupo, responsavel?: string): ResultadoGrupo {
  return responsavel ? { ...grupo, responsavel } : grupo;
}
```

Em `analisarGrupo`, envolva os três `return` com `comResponsavel(..., resolvida.responsavel)`:

```ts
  if (!resolvida.grupoCanonico) {
    const base = compararGrupo(grupo, contatos, undefined);
    return comResponsavel(
      resolvida.sugestoes.length > 0 ? { ...base, sugestoesCadastro: resolvida.sugestoes } : base,
      resolvida.responsavel,
    );
  }
```

```ts
  if (composicao.length === 0) {
    if (urlPrimaria) {
      const motivo = lidas[0]?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO;
      return comResponsavel(
        marcarFonteInacessivel(grupo, contatos, urlPrimaria, motivo, resolvida.grupoCanonico),
        resolvida.responsavel,
      );
    }
    return comResponsavel(
      compararGrupo(grupo, contatos, undefined, resolvida.grupoCanonico),
      resolvida.responsavel,
    );
  }
```

```ts
  return comResponsavel(
    {
      ...r,
      ...(erro ? { erroFonte: erro } : {}),
      ...(usouConhecimento || !urlPrimaria ? { viaPesquisaAmpla: true } : {}),
    },
    resolvida.responsavel,
  );
```

Em `resumir`, acrescente os dois campos ao literal (`possivelSaida: 0, contatosSemFonte: 0`) e, no laço dos contatos:

```ts
      if (c.possivelSaida) resumo.possivelSaida += 1;
      if (g.semFonte) resumo.contatosSemFonte += 1;
```

- [ ] **Step 6: Literais de teste**

Em `tests/export.test.ts`, nos 6 literais de `resumo` (`grep -n "gruposViaPesquisaAmpla: 0" tests/export.test.ts`), acrescente `possivelSaida: 0, contatosSemFonte: 0,` depois de `enderecosAConfirmar: 0,`.

- [ ] **Step 7: Rode tudo**

Run: `npm test && npm run typecheck`
Expected: verde, sem erro de tipo. Se o typecheck apontar outro literal de `ResumoAnalise` fora de `tests/export.test.ts`, acrescente os dois campos nele também.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/catalogo.ts lib/analise.ts tests/analise.test.ts tests/catalogo-responsavel.test.ts tests/export.test.ts
git commit -m "feat: tipo Retrato, contadores de possível saída e sem fonte, responsável no grupo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `Armazem` em memória e em arquivo

**Files:**
- Create: `lib/armazem.ts`
- Modify: `.gitignore`
- Test: `tests/armazem.test.ts`

**Interfaces:**
- Consumes: `Retrato` (Task 1).
- Produces: `interface Armazem { lerRetrato(): Promise<Retrato | undefined>; gravarRetrato(retrato: Retrato): Promise<void> }`; `armazemEmMemoria(inicial?: Retrato): Armazem`; `armazemEmArquivo(caminho: string): Armazem`; `armazemPadrao(): Armazem` (arquivo em `<cwd>/.fiscal/retrato.json`); `class RetratoIlegivelError extends Error`; `const CAMINHO_RETRATO_PADRAO = ".fiscal/retrato.json"`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `tests/armazem.test.ts`:

```ts
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { armazemEmArquivo, armazemEmMemoria, RetratoIlegivelError } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

const retrato: Retrato = {
  arquivoNome: "c.xlsx",
  grupos: [],
  resumo: {
    total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0,
    enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0,
    gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
  },
  geradoEm: "2026-10-01T17:12:00.000Z",
  planilhaContatos: { nome: "c.xlsx", linhas: 0 },
};

describe("armazemEmMemoria", () => {
  test("começa vazio e devolve o que gravou", async () => {
    const a = armazemEmMemoria();
    expect(await a.lerRetrato()).toBeUndefined();
    await a.gravarRetrato(retrato);
    expect(await a.lerRetrato()).toEqual(retrato);
  });
});

describe("armazemEmArquivo", () => {
  let pasta: string;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), "fiscal-"));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  test("arquivo ausente devolve undefined, sem erro", async () => {
    const a = armazemEmArquivo(join(pasta, "sub", "retrato.json"));
    expect(await a.lerRetrato()).toBeUndefined();
  });

  test("grava criando a pasta e lê de volta", async () => {
    const a = armazemEmArquivo(join(pasta, "sub", "retrato.json"));
    await a.gravarRetrato(retrato);
    expect(await a.lerRetrato()).toEqual(retrato);
  });

  test("gravar de novo substitui o arquivo e não deixa temporário", async () => {
    const caminho = join(pasta, "retrato.json");
    const a = armazemEmArquivo(caminho);
    await a.gravarRetrato(retrato);
    await a.gravarRetrato({ ...retrato, geradoEm: "2026-10-02T10:00:00.000Z" });
    expect((await a.lerRetrato())?.geradoEm).toBe("2026-10-02T10:00:00.000Z");
    expect(await readdir(pasta)).toEqual(["retrato.json"]);
  });

  test("JSON inválido lança RetratoIlegivelError", async () => {
    const caminho = join(pasta, "retrato.json");
    await writeFile(caminho, "{ isto não é json", "utf8");
    await expect(armazemEmArquivo(caminho).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
  });

  test("JSON sem geradoEm lança RetratoIlegivelError", async () => {
    const caminho = join(pasta, "retrato.json");
    await writeFile(caminho, JSON.stringify({ grupos: [], resumo: {} }), "utf8");
    await expect(armazemEmArquivo(caminho).lerRetrato()).rejects.toBeInstanceOf(RetratoIlegivelError);
  });

  test("o arquivo gravado é JSON legível por fora", async () => {
    const caminho = join(pasta, "retrato.json");
    await armazemEmArquivo(caminho).gravarRetrato(retrato);
    expect(JSON.parse(await readFile(caminho, "utf8")).geradoEm).toBe(retrato.geradoEm);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/armazem.test.ts`
Expected: FAIL — `lib/armazem.ts` não existe.

- [ ] **Step 3: Implemente `lib/armazem.ts`**

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Retrato } from "@/lib/types";

/**
 * Onde o último retrato vive entre uma abertura do app e outra. É a única persistência
 * do projeto: um arquivo, nesta máquina, fora do git. Interface injetável para a rota e
 * para o painel; em teste, a versão em memória.
 * Ver docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md
 */
export interface Armazem {
  /** `undefined` quando nunca houve varredura. Lança `RetratoIlegivelError` se o arquivo existe e não serve. */
  lerRetrato(): Promise<Retrato | undefined>;
  gravarRetrato(retrato: Retrato): Promise<void>;
}

/** O arquivo existe, mas não é um retrato (JSON quebrado ou campo obrigatório ausente). */
export class RetratoIlegivelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetratoIlegivelError";
  }
}

/** Caminho relativo à raiz do projeto. A pasta está no .gitignore. */
export const CAMINHO_RETRATO_PADRAO = join(".fiscal", "retrato.json");

export function armazemEmMemoria(inicial?: Retrato): Armazem {
  let atual = inicial;
  return {
    lerRetrato: async () => atual,
    gravarRetrato: async (retrato) => {
      atual = retrato;
    },
  };
}

/** Checagem mínima: o que o painel precisa para não quebrar. O resto é o tipo gravado por nós. */
function validarRetrato(valor: unknown): Retrato {
  if (typeof valor !== "object" || valor === null) {
    throw new RetratoIlegivelError("retrato não é um objeto");
  }
  const o = valor as Record<string, unknown>;
  if (typeof o.geradoEm !== "string" || !Array.isArray(o.grupos) || typeof o.resumo !== "object" || o.resumo === null) {
    throw new RetratoIlegivelError("retrato sem geradoEm, grupos ou resumo");
  }
  return valor as Retrato;
}

function ehArquivoAusente(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

export function armazemEmArquivo(caminho: string): Armazem {
  return {
    async lerRetrato() {
      let texto: string;
      try {
        texto = await readFile(caminho, "utf8");
      } catch (err) {
        if (ehArquivoAusente(err)) return undefined;
        throw err;
      }
      let json: unknown;
      try {
        json = JSON.parse(texto);
      } catch {
        throw new RetratoIlegivelError("retrato não é JSON válido");
      }
      return validarRetrato(json);
    },
    async gravarRetrato(retrato) {
      // Escrita atômica: grava ao lado e renomeia, para uma queda no meio não deixar
      // um retrato pela metade. `rename` substitui o destino, inclusive no Windows.
      await mkdir(dirname(caminho), { recursive: true });
      const temporario = `${caminho}.tmp`;
      await writeFile(temporario, JSON.stringify(retrato), "utf8");
      await rename(temporario, caminho);
    },
  };
}

/** O armazém que o app usa: arquivo na raiz do projeto em que o `npm run dev` roda. */
export function armazemPadrao(): Armazem {
  return armazemEmArquivo(join(process.cwd(), CAMINHO_RETRATO_PADRAO));
}
```

- [ ] **Step 4: `.gitignore`**

Acrescente no fim de `.gitignore`:

```
# Último retrato da varredura (nome, telefone, e-mail e endereço de autoridades). Nunca versionar.
.fiscal/
```

- [ ] **Step 5: Rode e confirme que passa**

Run: `npx vitest run tests/armazem.test.ts && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/armazem.ts tests/armazem.test.ts .gitignore
git commit -m "feat: Armazem do retrato em memória e em arquivo, com escrita atômica

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `lib/painel.ts`, parte 1: etiquetas, situação, motivo e detalhe por campo

**Files:**
- Create: `lib/painel.ts`
- Test: `tests/painel.test.ts`
- Delete: `lib/celula-divergencias.ts`, `tests/celula-divergencias.test.ts` (o contrato migra para cá; `components/resultado-tabela.tsx` ainda importa `celulaDivergencias` e só sai na Task 8, então **nesta tarefa** troque a importação lá por um texto fixo, ver Step 6)

**Interfaces:**
- Consumes: `coerenciasVisiveis`, `textoCoerencia` de `@/lib/tratamento`; tipos de `@/lib/types`.
- Produces (exatas, as Tasks 4 e 8 dependem delas):

```ts
export type Tom = "ok" | "atencao" | "ruim" | "neutro";
export type CampoEtiqueta = "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte";
export interface Etiqueta { campo: CampoEtiqueta; texto: string; tom: Tom }
export function etiquetaDeEndereco(c: ResultadoContato): Etiqueta | undefined;  // undefined em sem_base ou sem auditoria
export function etiquetasDoContato(c: ResultadoContato, g: ResultadoGrupo): Etiqueta[];
export function situacaoDoContato(c: ResultadoContato, g: ResultadoGrupo): { texto: string; tom: Tom };
export function motivoDoContato(c: ResultadoContato, g: ResultadoGrupo): string | undefined;
export interface DetalheCampo {
  campo: "nome" | "cargo" | "tratamento" | "enderecamento";
  rotulo: string;
  etiqueta?: Etiqueta;
  valorPlanilha: string;
  origem: string;            // "Site do órgão diz" | "Tabela de protocolo diz"
  valorReferencia: string;   // valor esperado, ou "o site não informa", ou "sem regra de protocolo para este cargo"
  copiavel?: string;         // valor esperado puro, só quando diverge e existe
  coerencias: string[];      // textos da Camada A/C do campo
}
export function detalhesDoContato(c: ResultadoContato, g: ResultadoGrupo): DetalheCampo[];
```

- [ ] **Step 1: Escreva os testes que falham**

Crie `tests/painel.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  detalhesDoContato,
  etiquetasDoContato,
  motivoDoContato,
  situacaoDoContato,
} from "@/lib/painel";
import type { ComparacaoCampo, ResultadoContato, ResultadoGrupo } from "@/lib/types";

const grupoComFonte: ResultadoGrupo = {
  grupo: "ORG", fonteUrl: "https://orgao.gov.br", semFonte: false, contatos: [], novos: [],
};
const grupoSemFonte: ResultadoGrupo = { grupo: "SEM", semFonte: true, contatos: [], novos: [] };
const grupoInacessivel: ResultadoGrupo = {
  grupo: "ORG", fonteUrl: "https://orgao.gov.br", semFonte: false, fonteInacessivel: true,
  erroFonte: "HTTP 403", contatos: [], novos: [],
};

const confere = (campo: string, origemValor: ComparacaoCampo["origemValor"], valor = "x"): ComparacaoCampo => ({
  campo, valorPlanilha: valor, valorEsperado: valor, situacao: "confere", origemValor,
});
const diverge = (campo: string, origemValor: ComparacaoCampo["origemValor"], planilha: string, esperado: string): ComparacaoCampo => ({
  campo, valorPlanilha: planilha, valorEsperado: esperado, situacao: "divergente", origemValor,
});
const coerencia = (campo: string, achado: ComparacaoCampo["achado"], valorPlanilha = "Doutor"): ComparacaoCampo => ({
  campo, valorPlanilha, situacao: "divergente", origemValor: "coerencia", achado,
});

function contato(over: Partial<ResultadoContato>): ResultadoContato {
  return {
    contato: { nome: "Ana", grupo: "ORG", cargo: "Ministra", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" },
    semaforo: "verde", score: 1, comparacoes: [], camposDivergentes: [], origem: "oficial",
    ...over,
  };
}

const textos = (c: ResultadoContato, g: ResultadoGrupo) => etiquetasDoContato(c, g).map((e) => e.texto);

describe("etiquetasDoContato", () => {
  test("tudo conferindo: cinco etiquetas 'confere', na ordem nome, cargo, tratamento, endereçamento, endereço", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), confere("cargo", "pagina"), confere("tratamento", "protocolo"), confere("enderecamento", "protocolo")],
      endereco: { situacao: "completo", achados: [] },
    });
    expect(textos(c, grupoComFonte)).toEqual([
      "Nome confere", "Cargo confere", "Tratamento confere", "Endereçamento confere", "Endereço completo",
    ]);
    expect(etiquetasDoContato(c, grupoComFonte).every((e) => e.tom === "ok")).toBe(true);
  });

  test("cargo divergente e tratamento sem regra: 'diverge' em atenção, 'sem regra' neutro", () => {
    const c = contato({
      semaforo: "amarelo",
      comparacoes: [
        confere("nome", "pagina"),
        diverge("cargo", "pagina", "Ministra", "Ministra Presidente"),
        { campo: "tratamento", valorPlanilha: "Senhora", situacao: "sem_regra", origemValor: "protocolo" },
        confere("enderecamento", "protocolo"),
      ],
    });
    const etiquetas = etiquetasDoContato(c, grupoComFonte);
    expect(etiquetas.find((e) => e.campo === "cargo")).toEqual({ campo: "cargo", texto: "Cargo diverge", tom: "atencao" });
    expect(etiquetas.find((e) => e.campo === "tratamento")).toEqual({ campo: "tratamento", texto: "Tratamento sem regra", tom: "neutro" });
  });

  test("cargo que o site não informa não ganha etiqueta", () => {
    const c = contato({
      comparacoes: [confere("nome", "pagina"), { campo: "cargo", valorPlanilha: "Ministra", situacao: "fonte_nao_informa", origemValor: "pagina" }],
    });
    expect(textos(c, grupoComFonte)).not.toContain("Cargo confere");
    expect(textos(c, grupoComFonte).some((t) => t.startsWith("Cargo"))).toBe(false);
  });

  test("achado de coerência no tratamento vira 'Tratamento diverge' mesmo com a Camada B conferindo", () => {
    const c = contato({
      comparacoes: [confere("tratamento", "protocolo", "Senhora"), coerencia("tratamento", "genero_cargo_tratamento")],
    });
    expect(etiquetasDoContato(c, grupoComFonte).find((e) => e.campo === "tratamento")?.texto).toBe("Tratamento diverge");
  });

  test("possível saída: 'Sem par na fonte' primeiro, sem etiquetas de nome e cargo", () => {
    const c = contato({ semaforo: "vermelho", possivelSaida: true, comparacoes: [confere("tratamento", "protocolo"), confere("enderecamento", "protocolo")] });
    const t = textos(c, grupoComFonte);
    expect(t[0]).toBe("Sem par na fonte");
    expect(etiquetasDoContato(c, grupoComFonte)[0].tom).toBe("ruim");
    expect(t.some((x) => x.startsWith("Nome") || x.startsWith("Cargo"))).toBe(false);
  });

  test("possível saída com achado da Camada C no nome mostra as duas coisas (contrato herdado de celulaDivergencias)", () => {
    const c = contato({
      semaforo: "vermelho", possivelSaida: true,
      comparacoes: [{ campo: "nome", valorPlanilha: "Dr. Joaquim", valorEsperado: "Joaquim", situacao: "divergente", origemValor: "coerencia", achado: "nome_tratamento_academico" }],
    });
    expect(textos(c, grupoComFonte).slice(0, 2)).toEqual(["Sem par na fonte", "Nome diverge"]);
  });

  test("grupo sem fonte: nome e cargo 'não verificado' (neutro), e tratamento divergente continua 'diverge'", () => {
    const c = contato({
      semaforo: "vermelho",
      comparacoes: [diverge("tratamento", "protocolo", "Senhora", "Vossa Excelência"), confere("enderecamento", "protocolo")],
    });
    const etiquetas = etiquetasDoContato(c, grupoSemFonte);
    expect(etiquetas.find((e) => e.campo === "nome")).toEqual({ campo: "nome", texto: "Nome não verificado", tom: "neutro" });
    expect(etiquetas.find((e) => e.campo === "cargo")?.texto).toBe("Cargo não verificado");
    expect(etiquetas.find((e) => e.campo === "tratamento")?.texto).toBe("Tratamento diverge");
  });

  test("endereço: a_completar é neutro, pendente é atenção, nao_verificado é neutro, sem_base não aparece", () => {
    const com = (situacao: NonNullable<ResultadoContato["endereco"]>["situacao"]) =>
      etiquetasDoContato(contato({ endereco: { situacao, achados: [] } }), grupoComFonte).find((e) => e.campo === "endereco");
    expect(com("a_completar")).toEqual({ campo: "endereco", texto: "Endereço a completar", tom: "neutro" });
    expect(com("pendente")).toEqual({ campo: "endereco", texto: "Endereço a confirmar", tom: "atencao" });
    expect(com("nao_verificado")).toEqual({ campo: "endereco", texto: "Endereço não verificado", tom: "neutro" });
    expect(com("sem_base")).toBeUndefined();
  });
});

describe("situacaoDoContato", () => {
  test("ordem: possível saída, sem fonte, não verificado, tudo confere, N a revisar", () => {
    expect(situacaoDoContato(contato({ possivelSaida: true, semaforo: "vermelho" }), grupoComFonte)).toEqual({ texto: "Possível saída", tom: "ruim" });
    expect(situacaoDoContato(contato({ semaforo: "vermelho" }), grupoSemFonte)).toEqual({ texto: "Sem fonte", tom: "neutro" });
    expect(situacaoDoContato(contato({ semaforo: "indeterminado" }), grupoInacessivel)).toEqual({ texto: "Não verificado", tom: "neutro" });
    expect(situacaoDoContato(contato({ comparacoes: [confere("nome", "pagina")] }), grupoComFonte)).toEqual({ texto: "Tudo confere", tom: "ok" });
  });

  test("conta só etiquetas de atenção ou ruim; 'Endereço a completar' não entra", () => {
    const c = contato({
      semaforo: "amarelo",
      comparacoes: [diverge("cargo", "pagina", "a", "b"), diverge("tratamento", "protocolo", "a", "b")],
      endereco: { situacao: "a_completar", achados: ["sem_bairro"] },
    });
    expect(situacaoDoContato(c, grupoComFonte)).toEqual({ texto: "2 a revisar", tom: "atencao" });
  });

  test("endereço pendente sozinho é '1 a revisar'", () => {
    const c = contato({ comparacoes: [confere("nome", "pagina")], endereco: { situacao: "pendente", achados: ["sem_numero"] } });
    expect(situacaoDoContato(c, grupoComFonte).texto).toBe("1 a revisar");
  });
});

describe("motivoDoContato", () => {
  test("cada caso tem o seu texto, e o caso normal não tem motivo", () => {
    expect(motivoDoContato(contato({ possivelSaida: true }), grupoComFonte)).toBe("Não consta na fonte: confirmar se saiu");
    expect(motivoDoContato(contato({}), grupoSemFonte)).toBe("Sem fonte cadastrada");
    expect(motivoDoContato(contato({ semaforo: "indeterminado" }), grupoInacessivel)).toBe("Fonte fora do ar: confira à mão");
    expect(motivoDoContato(contato({ semaforo: "indeterminado" }), { ...grupoComFonte, erroFonte: "x: HTTP 403" })).toBe("Não verificado: uma fonte não respondeu");
    expect(motivoDoContato(contato({}), grupoComFonte)).toBeUndefined();
  });
});

describe("detalhesDoContato", () => {
  test("um cartão por campo com comparação, com origem certa e valor copiável só quando diverge", () => {
    const c = contato({
      comparacoes: [
        confere("nome", "pagina", "Ana"),
        diverge("cargo", "conhecimento", "Ministra", "Ministra Presidente"),
        diverge("tratamento", "protocolo", "Senhora", "Vossa Excelência"),
        { campo: "enderecamento", valorPlanilha: "A Sua Excelência a Senhora", situacao: "sem_regra", origemValor: "protocolo" },
      ],
    });
    const d = detalhesDoContato(c, grupoComFonte);
    expect(d.map((x) => x.campo)).toEqual(["nome", "cargo", "tratamento", "enderecamento"]);
    expect(d[0]).toMatchObject({ rotulo: "Nome", origem: "Site do órgão diz", valorPlanilha: "Ana", valorReferencia: "Ana" });
    expect(d[0].copiavel).toBeUndefined();
    expect(d[1]).toMatchObject({ origem: "Site do órgão diz", valorReferencia: "Ministra Presidente (via IA — confira)", copiavel: "Ministra Presidente" });
    expect(d[2]).toMatchObject({ origem: "Tabela de protocolo diz", valorReferencia: "Vossa Excelência", copiavel: "Vossa Excelência" });
    expect(d[3]).toMatchObject({ valorReferencia: "sem regra de protocolo para este cargo" });
    expect(d[3].copiavel).toBeUndefined();
  });

  test("site que não informa o cargo diz isso no cartão", () => {
    const c = contato({ comparacoes: [{ campo: "cargo", valorPlanilha: "Ministra", situacao: "fonte_nao_informa", origemValor: "pagina" }] });
    expect(detalhesDoContato(c, grupoComFonte)[0].valorReferencia).toBe("o site não informa");
  });

  test("achados de coerência entram no cartão do campo, com o texto de textoCoerencia", () => {
    const c = contato({ comparacoes: [confere("tratamento", "protocolo", "Senhora"), coerencia("tratamento", "genero_cargo_tratamento")] });
    const d = detalhesDoContato(c, grupoComFonte);
    expect(d).toHaveLength(1);
    expect(d[0].coerencias).toEqual(["gênero do Cargo discorda do Tratamento"]);
  });

  test("campo só com achado de coerência (sem comparação de valor) ainda ganha cartão", () => {
    const c = contato({ comparacoes: [coerencia("enderecamento", "campo_vazio", "")] });
    const d = detalhesDoContato(c, grupoComFonte);
    expect(d[0]).toMatchObject({ campo: "enderecamento", valorPlanilha: "", origem: "Tabela de protocolo diz", valorReferencia: "" });
    expect(d[0].coerencias[0]).toBe("campo vazio (Endereçamento)");
  });

  test("campo vazio com valor de protocolo não duplica (coerenciasVisiveis colapsa)", () => {
    const c = contato({ comparacoes: [diverge("tratamento", "protocolo", "", "Vossa Excelência"), coerencia("tratamento", "campo_vazio", "")] });
    expect(detalhesDoContato(c, grupoComFonte)[0].coerencias).toEqual([]);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/painel.test.ts`
Expected: FAIL — `lib/painel.ts` não existe.

- [ ] **Step 3: Implemente `lib/painel.ts`**

```ts
import { coerenciasVisiveis, textoCoerencia } from "@/lib/tratamento";
import type {
  ComparacaoCampo,
  ResultadoContato,
  ResultadoGrupo,
  SituacaoEndereco,
} from "@/lib/types";

/**
 * O que o painel mostra, decidido fora do JSX: etiquetas por campo, situação da linha,
 * motivo, cartões do detalhe. Os componentes só renderizam o que sai daqui.
 * Ver docs/superpowers/specs/2026-10-01-painel-local-retrato-em-arquivo.md, §6 e §7.
 */

export type Tom = "ok" | "atencao" | "ruim" | "neutro";
export type CampoEtiqueta = "nome" | "cargo" | "tratamento" | "enderecamento" | "endereco" | "fonte";

export interface Etiqueta {
  campo: CampoEtiqueta;
  texto: string;
  tom: Tom;
}

type CampoComparado = "nome" | "cargo" | "tratamento" | "enderecamento";

const ROTULO_CAMPO: Record<CampoComparado, string> = {
  nome: "Nome",
  cargo: "Cargo",
  tratamento: "Tratamento",
  enderecamento: "Endereçamento",
};

const ETIQUETA_ENDERECO: Record<Exclude<SituacaoEndereco, "sem_base">, { texto: string; tom: Tom }> = {
  completo: { texto: "Endereço completo", tom: "ok" },
  a_completar: { texto: "Endereço a completar", tom: "neutro" },
  pendente: { texto: "Endereço a confirmar", tom: "atencao" },
  nao_verificado: { texto: "Endereço não verificado", tom: "neutro" },
};

/** A comparação de VALOR do campo (site ou protocolo). Coerência é diagnóstico, não valor. */
function comparacaoDeValor(c: ResultadoContato, campo: CampoComparado): ComparacaoCampo | undefined {
  return c.comparacoes.find((x) => x.campo === campo && x.origemValor !== "coerencia");
}

function coerenciasDo(c: ResultadoContato, campo: CampoComparado): ComparacaoCampo[] {
  return coerenciasVisiveis(c.comparacoes).filter((x) => x.campo === campo);
}

/**
 * Etiqueta de um campo comparado. Coerência divergente (Camadas A e C) e valor divergente
 * (Camada 1 ou B) viram o mesmo "diverge": para quem lê a linha, o campo precisa de revisão.
 * `fonte_nao_informa` some; `sem_regra` fica neutro, porque não é divergência.
 */
function etiquetaDoCampo(c: ResultadoContato, campo: CampoComparado): Etiqueta | undefined {
  const rotulo = ROTULO_CAMPO[campo];
  const comp = comparacaoDeValor(c, campo);
  if (coerenciasDo(c, campo).length > 0 || comp?.situacao === "divergente") {
    return { campo, texto: `${rotulo} diverge`, tom: "atencao" };
  }
  if (!comp) return { campo, texto: `${rotulo} não verificado`, tom: "neutro" };
  if (comp.situacao === "confere") return { campo, texto: `${rotulo} confere`, tom: "ok" };
  if (comp.situacao === "sem_regra") return { campo, texto: `${rotulo} sem regra`, tom: "neutro" };
  return undefined; // fonte_nao_informa
}

export function etiquetasDoContato(c: ResultadoContato, _g: ResultadoGrupo): Etiqueta[] {
  const lista: Etiqueta[] = [];
  if (c.possivelSaida) {
    // Não há com o que comparar nome e cargo; só a Camada C (nome) ainda pode acusar.
    lista.push({ campo: "fonte", texto: "Sem par na fonte", tom: "ruim" });
    const nome = etiquetaDoCampo(c, "nome");
    if (nome?.tom === "atencao") lista.push(nome);
  } else {
    for (const campo of ["nome", "cargo"] as const) {
      const e = etiquetaDoCampo(c, campo);
      if (e) lista.push(e);
    }
  }
  for (const campo of ["tratamento", "enderecamento"] as const) {
    const e = etiquetaDoCampo(c, campo);
    if (e) lista.push(e);
  }
  const endereco = etiquetaDeEndereco(c);
  if (endereco) lista.push(endereco);
  return lista;
}

/** Etiqueta do endereço, sozinha: o bloco de endereço do detalhe a mostra de novo. */
export function etiquetaDeEndereco(c: ResultadoContato): Etiqueta | undefined {
  const situacao = c.endereco?.situacao;
  if (!situacao || situacao === "sem_base") return undefined;
  return { campo: "endereco", ...ETIQUETA_ENDERECO[situacao] };
}

const PRECISA_REVISAR: readonly Tom[] = ["atencao", "ruim"];

export function situacaoDoContato(c: ResultadoContato, g: ResultadoGrupo): { texto: string; tom: Tom } {
  if (c.possivelSaida) return { texto: "Possível saída", tom: "ruim" };
  if (g.semFonte) return { texto: "Sem fonte", tom: "neutro" };
  if (c.semaforo === "indeterminado") return { texto: "Não verificado", tom: "neutro" };
  const aRevisar = etiquetasDoContato(c, g).filter((e) => PRECISA_REVISAR.includes(e.tom)).length;
  return aRevisar === 0
    ? { texto: "Tudo confere", tom: "ok" }
    : { texto: `${aRevisar} a revisar`, tom: "atencao" };
}

export function motivoDoContato(c: ResultadoContato, g: ResultadoGrupo): string | undefined {
  if (c.possivelSaida) return "Não consta na fonte: confirmar se saiu";
  if (g.semFonte) return "Sem fonte cadastrada";
  if (g.fonteInacessivel) return "Fonte fora do ar: confira à mão";
  if (c.semaforo === "indeterminado") return "Não verificado: uma fonte não respondeu";
  return undefined;
}

export interface DetalheCampo {
  campo: CampoComparado;
  rotulo: string;
  etiqueta?: Etiqueta;
  valorPlanilha: string;
  origem: string;
  valorReferencia: string;
  copiavel?: string;
  coerencias: string[];
}

const TEXTO_FONTE_NAO_INFORMA = "o site não informa";
const TEXTO_SEM_REGRA = "sem regra de protocolo para este cargo";
const SUFIXO_VIA_IA = " (via IA — confira)";

function origemDe(campo: CampoComparado): string {
  return campo === "nome" || campo === "cargo" ? "Site do órgão diz" : "Tabela de protocolo diz";
}

function valorReferenciaDe(comp: ComparacaoCampo | undefined): string {
  if (!comp) return "";
  if (comp.situacao === "fonte_nao_informa") return TEXTO_FONTE_NAO_INFORMA;
  if (comp.situacao === "sem_regra") return TEXTO_SEM_REGRA;
  const valor = comp.valorEsperado ?? "";
  return valor && comp.origemValor === "conhecimento" ? `${valor}${SUFIXO_VIA_IA}` : valor;
}

/** Um cartão por campo que tem comparação de valor ou achado de coerência, na ordem fixa. */
export function detalhesDoContato(c: ResultadoContato, _g: ResultadoGrupo): DetalheCampo[] {
  const cartoes: DetalheCampo[] = [];
  for (const campo of ["nome", "cargo", "tratamento", "enderecamento"] as const) {
    const comp = comparacaoDeValor(c, campo);
    const coerencias = coerenciasDo(c, campo);
    if (!comp && coerencias.length === 0) continue;
    const valorPlanilha = campo === "nome" ? c.contato.nome : (comp?.valorPlanilha ?? coerencias[0]?.valorPlanilha ?? "");
    const copiavel = comp?.situacao === "divergente" && comp.valorEsperado ? comp.valorEsperado : undefined;
    cartoes.push({
      campo,
      rotulo: ROTULO_CAMPO[campo],
      etiqueta: etiquetaDoCampo(c, campo),
      valorPlanilha,
      origem: origemDe(campo),
      valorReferencia: valorReferenciaDe(comp),
      ...(copiavel ? { copiavel } : {}),
      coerencias: coerencias.map(textoCoerencia),
    });
  }
  return cartoes;
}
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/painel.test.ts`
Expected: PASS. Se o teste "um cartão por campo" falhar em `valorPlanilha` do nome, confira: para `nome` o valor vem de `c.contato.nome`, não da comparação (a comparação de nome pode trazer o nome normalizado).

- [ ] **Step 5: Apague `celula-divergencias`**

```bash
git rm lib/celula-divergencias.ts tests/celula-divergencias.test.ts
```

- [ ] **Step 6: Desligue a importação em `components/resultado-tabela.tsx`**

O componente sai na Task 8. Até lá, para o typecheck passar, troque:

```tsx
import { celulaDivergencias } from "@/lib/celula-divergencias";
```
por nada, e a célula
```tsx
                  <td>{celulaDivergencias(c.comparacoes, c.possivelSaida)}</td>
```
por
```tsx
                  <td>{etiquetasDoContato(c, g).map((e) => e.texto).join("; ") || "—"}</td>
```
com `import { etiquetasDoContato } from "@/lib/painel";` no topo. É provisório e some na Task 8.

- [ ] **Step 7: Rode tudo**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add lib/painel.ts tests/painel.test.ts components/resultado-tabela.tsx
git commit -m "feat: lib/painel.ts com etiquetas por campo, situação, motivo e detalhe; sai celula-divergencias

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(O `git rm` do Step 5 já deixou as remoções no índice; o `git add` acima não as desfaz. Confira com `git status` antes de commitar que as duas remoções estão "staged".)

---

### Task 4: `lib/painel.ts`, parte 2: filtros, busca, cartões, endereço para copiar, data e `montarRetrato`

**Files:**
- Modify: `lib/painel.ts`
- Test: `tests/painel.test.ts`

**Interfaces:**
- Consumes: Task 3; `normalizarTexto` de `@/lib/normalize`; `Retrato`, `ResumoAnalise`, `EnderecoEstruturado`.
- Produces:

```ts
export type Filtro = "tudo" | "ressalva" | "endereco" | "saida" | "inclusao";
export const FILTROS: readonly { id: Filtro; rotulo: string }[];
export function filtrarGrupos(grupos: readonly ResultadoGrupo[], filtro: Filtro, busca: string): ResultadoGrupo[];
export function contarContatos(grupos: readonly ResultadoGrupo[]): number;
export function cartoesDoResumo(r: Partial<ResumoAnalise>): { rotulo: string; valor: number }[];
export function linhasDoEndereco(e: EnderecoEstruturado): string[];
export function textoEnderecoParaCopiar(e: EnderecoEstruturado): string;
export function textoDataHora(iso: string): string;   // "01/10, 14h12"
export function montarRetrato(resultado: ResultadoAnalise, planilhas: { contatos: { nome: string; linhas: number }; enderecos?: { nome: string; linhas: number } }, agora: Date): Retrato;
```

- [ ] **Step 1: Escreva os testes que falham**

Acrescente em `tests/painel.test.ts` (importe também `cartoesDoResumo, contarContatos, filtrarGrupos, linhasDoEndereco, montarRetrato, textoDataHora, textoEnderecoParaCopiar` de `@/lib/painel` e `ResultadoAnalise`, `EnderecoEstruturado` de `@/lib/types`):

```ts
describe("filtrarGrupos", () => {
  const verde = contato({ contato: { nome: "João da Silva", grupo: "ORG", cargo: "Ministro", orgao: "TST" }, comparacoes: [confere("nome", "pagina")] });
  const saida = contato({ contato: { nome: "Pedro Que Saiu", grupo: "ORG" }, semaforo: "vermelho", possivelSaida: true });
  const pendente = contato({ contato: { nome: "Maria Pendente", grupo: "ORG" }, endereco: { situacao: "pendente", achados: ["sem_numero"] } });
  const semFonte = contato({ contato: { nome: "Carla Sem Fonte", grupo: "SEM" }, semaforo: "vermelho", comparacoes: [diverge("tratamento", "protocolo", "a", "b")] });
  const grupos: ResultadoGrupo[] = [
    { ...grupoComFonte, contatos: [verde, saida, pendente], novos: [{ nome: "Nova Pessoa", cargo: "Ministra", origem: "pagina" }] },
    { ...grupoSemFonte, contatos: [semFonte] },
  ];
  const nomes = (gs: ResultadoGrupo[]) => gs.flatMap((g) => g.contatos.map((c) => c.contato.nome));

  test("tudo: devolve tudo, inclusive novos", () => {
    const r = filtrarGrupos(grupos, "tudo", "");
    expect(nomes(r)).toHaveLength(4);
    expect(r[0].novos).toHaveLength(1);
  });

  test("ressalva: tira só quem é verde com endereço em ordem; grupo sem fonte com tratamento divergente entra", () => {
    expect(nomes(filtrarGrupos(grupos, "ressalva", ""))).toEqual(["Pedro Que Saiu", "Maria Pendente", "Carla Sem Fonte"]);
  });

  test("endereco: só pendente", () => {
    expect(nomes(filtrarGrupos(grupos, "endereco", ""))).toEqual(["Maria Pendente"]);
  });

  test("saida: só possível saída; inclusao: só os novos, e grupo sem novos some", () => {
    expect(nomes(filtrarGrupos(grupos, "saida", ""))).toEqual(["Pedro Que Saiu"]);
    const inc = filtrarGrupos(grupos, "inclusao", "");
    expect(inc).toHaveLength(1);
    expect(inc[0].contatos).toEqual([]);
    expect(inc[0].novos.map((n) => n.nome)).toEqual(["Nova Pessoa"]);
  });

  test("busca ignora acento e caixa, e procura em nome, cargo e órgão", () => {
    expect(nomes(filtrarGrupos(grupos, "tudo", "joao"))).toEqual(["João da Silva"]);
    expect(nomes(filtrarGrupos(grupos, "tudo", "MINISTRO"))).toEqual(["João da Silva"]);
    expect(nomes(filtrarGrupos(grupos, "tudo", "tst"))).toEqual(["João da Silva"]);
    expect(filtrarGrupos(grupos, "tudo", "nova pessoa")[0].novos).toHaveLength(1);
  });

  test("não muta a entrada", () => {
    const antes = JSON.stringify(grupos);
    filtrarGrupos(grupos, "saida", "x");
    expect(JSON.stringify(grupos)).toBe(antes);
  });

  test("contarContatos soma os contatos dos grupos", () => {
    expect(contarContatos(grupos)).toBe(4);
  });
});

describe("cartoesDoResumo", () => {
  test("seis cartões na ordem do mockup; 'Não verificados' soma indeterminado e sem fonte", () => {
    const cartoes = cartoesDoResumo({
      total: 10, verde: 4, amarelo: 2, vermelho: 3, novo: 1, indeterminado: 1,
      enderecosAConfirmar: 5, possivelSaida: 2, contatosSemFonte: 1,
      gruposSemFonte: 1, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
    });
    expect(cartoes).toEqual([
      { rotulo: "Conferem", valor: 4 },
      { rotulo: "Com divergência", valor: 2 },
      { rotulo: "Possível saída", valor: 2 },
      { rotulo: "Não verificados", valor: 2 },
      { rotulo: "Propostas de inclusão", valor: 1 },
      { rotulo: "Endereços a confirmar", valor: 5 },
    ]);
  });

  test("retrato gravado por versão anterior, sem os contadores novos, mostra 0 e não NaN", () => {
    const cartoes = cartoesDoResumo({ verde: 1, amarelo: 0, indeterminado: 2, novo: 0, enderecosAConfirmar: 0 });
    expect(cartoes.map((c) => c.valor)).toEqual([1, 0, 0, 2, 0, 0]);
  });
});

describe("endereço para copiar", () => {
  const e: EnderecoEstruturado = {
    contatoId: "7", logradouro: "SAUS Quadra 3", numero: "Bloco A", complemento: "sala 412",
    bairro: "Asa Sul", cep: "70070-030", cidade: "Brasília", uf: "DF", prioritario: true,
  };

  test("três linhas: logradouro/número/complemento, bairro, CEP cidade - UF", () => {
    expect(linhasDoEndereco(e)).toEqual(["SAUS Quadra 3, Bloco A, sala 412", "Asa Sul", "70070-030 Brasília - DF"]);
    expect(textoEnderecoParaCopiar(e)).toBe("SAUS Quadra 3, Bloco A, sala 412\nAsa Sul\n70070-030 Brasília - DF");
  });

  test("campos ausentes somem sem deixar separador solto; CEP sai como está no relatório", () => {
    expect(linhasDoEndereco({ contatoId: "1", logradouro: "Rua A", cep: "1049000", uf: "SP", prioritario: false }))
      .toEqual(["Rua A", "1049000 SP"]);
    expect(linhasDoEndereco({ contatoId: "1", prioritario: false })).toEqual([]);
  });
});

describe("textoDataHora", () => {
  test("dia/mês e hora em Brasília, no formato do mockup", () => {
    expect(textoDataHora("2026-10-01T17:12:00.000Z")).toBe("01/10, 14h12");
  });
});

describe("montarRetrato", () => {
  const resultado: ResultadoAnalise = {
    arquivoNome: "c.xlsx", grupos: [],
    resumo: { total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 0, indeterminado: 0, enderecosAConfirmar: 0, possivelSaida: 0, contatosSemFonte: 0, gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0 },
  };

  test("com as duas planilhas", () => {
    const r = montarRetrato(resultado, { contatos: { nome: "c.xlsx", linhas: 418 }, enderecos: { nome: "e.xlsx", linhas: 1531 } }, new Date("2026-10-01T17:12:00.000Z"));
    expect(r).toMatchObject({ arquivoNome: "c.xlsx", geradoEm: "2026-10-01T17:12:00.000Z", planilhaContatos: { nome: "c.xlsx", linhas: 418 }, planilhaEnderecos: { nome: "e.xlsx", linhas: 1531 } });
  });

  test("sem a planilha de endereços o campo fica ausente", () => {
    const r = montarRetrato(resultado, { contatos: { nome: "c.xlsx", linhas: 1 } }, new Date());
    expect("planilhaEnderecos" in r).toBe(false);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/painel.test.ts`
Expected: FAIL — as funções não existem.

- [ ] **Step 3: Implemente, no fim de `lib/painel.ts`**

Acrescente aos imports: `import { normalizarTexto } from "@/lib/normalize";` e os tipos `EnderecoEstruturado, PessoaSite, ResultadoAnalise, ResumoAnalise, Retrato`.

```ts
export type Filtro = "tudo" | "ressalva" | "endereco" | "saida" | "inclusao";

export const FILTROS: readonly { id: Filtro; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "ressalva", rotulo: "Só o que tem ressalva" },
  { id: "endereco", rotulo: "Endereço a confirmar" },
  { id: "saida", rotulo: "Possível saída" },
  { id: "inclusao", rotulo: "Propostas de inclusão" },
];

/** Ressalva: tudo que não é verde com o endereço em ordem (completo, a completar ou sem base). */
function temRessalva(c: ResultadoContato): boolean {
  const e = c.endereco?.situacao;
  return c.semaforo !== "verde" || e === "pendente" || e === "nao_verificado";
}

function passaFiltro(c: ResultadoContato, filtro: Filtro): boolean {
  switch (filtro) {
    case "tudo": return true;
    case "ressalva": return temRessalva(c);
    case "endereco": return c.endereco?.situacao === "pendente";
    case "saida": return c.possivelSaida === true;
    case "inclusao": return false;
  }
}

const FILTROS_COM_NOVOS: readonly Filtro[] = ["tudo", "ressalva", "inclusao"];

function casa(valor: string | undefined, busca: string): boolean {
  return valor !== undefined && normalizarTexto(valor).includes(busca);
}

function contatoCasaBusca(c: ResultadoContato, busca: string): boolean {
  return busca === "" || casa(c.contato.nome, busca) || casa(c.contato.cargo, busca) || casa(c.contato.orgao, busca);
}

function novoCasaBusca(n: PessoaSite, busca: string): boolean {
  return busca === "" || casa(n.nome, busca) || casa(n.cargo, busca);
}

/** Filtro e busca no navegador. Grupo que fica sem linha some. Não muta a entrada. */
export function filtrarGrupos(grupos: readonly ResultadoGrupo[], filtro: Filtro, busca: string): ResultadoGrupo[] {
  const b = normalizarTexto(busca.trim());
  return grupos
    .map((g) => ({
      ...g,
      contatos: g.contatos.filter((c) => passaFiltro(c, filtro) && contatoCasaBusca(c, b)),
      novos: FILTROS_COM_NOVOS.includes(filtro) ? g.novos.filter((n) => novoCasaBusca(n, b)) : [],
    }))
    .filter((g) => g.contatos.length > 0 || g.novos.length > 0);
}

export function contarContatos(grupos: readonly ResultadoGrupo[]): number {
  return grupos.reduce((soma, g) => soma + g.contatos.length, 0);
}

/**
 * Os seis cartões do mockup. Recebe `Partial` de propósito: um retrato gravado por uma
 * versão anterior do código pode não ter os contadores mais novos, e o painel não pode
 * mostrar NaN por isso.
 */
export function cartoesDoResumo(r: Partial<ResumoAnalise>): { rotulo: string; valor: number }[] {
  const n = (v: number | undefined) => v ?? 0;
  return [
    { rotulo: "Conferem", valor: n(r.verde) },
    { rotulo: "Com divergência", valor: n(r.amarelo) },
    { rotulo: "Possível saída", valor: n(r.possivelSaida) },
    { rotulo: "Não verificados", valor: n(r.indeterminado) + n(r.contatosSemFonte) },
    { rotulo: "Propostas de inclusão", valor: n(r.novo) },
    { rotulo: "Endereços a confirmar", valor: n(r.enderecosAConfirmar) },
  ];
}

/**
 * As três linhas do bloco de endereço e do botão Copiar. Não é o `formatado` da Fase 1
 * (que só existe em `completo`): aqui o CEP sai como está no relatório, sem formatar nem
 * propor zero à esquerda, porque isto é o que o relatório diz, não o que o app conclui.
 */
export function linhasDoEndereco(e: EnderecoEstruturado): string[] {
  const primeira = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ");
  const segunda = e.bairro ?? "";
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join(" - ");
  const terceira = [e.cep, cidadeUf].filter(Boolean).join(" ");
  return [primeira, segunda, terceira].filter((l) => l.length > 0);
}

export function textoEnderecoParaCopiar(e: EnderecoEstruturado): string {
  return linhasDoEndereco(e).join("\n");
}

const FORMATO_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  timeZone: "America/Sao_Paulo",
});

/** "01/10, 14h12", no fuso de Brasília, como o cabeçalho do mockup. */
export function textoDataHora(iso: string): string {
  const partes = FORMATO_DATA_HORA.formatToParts(new Date(iso));
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}, ${p("hour")}h${p("minute")}`;
}

export function montarRetrato(
  resultado: ResultadoAnalise,
  planilhas: { contatos: { nome: string; linhas: number }; enderecos?: { nome: string; linhas: number } },
  agora: Date,
): Retrato {
  return {
    ...resultado,
    geradoEm: agora.toISOString(),
    planilhaContatos: planilhas.contatos,
    ...(planilhas.enderecos ? { planilhaEnderecos: planilhas.enderecos } : {}),
  };
}
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/painel.test.ts`
Expected: PASS. Se `textoDataHora` devolver "24" para meia-noite, troque `hour12: false` por `hourCycle: "h23"`.

- [ ] **Step 5: Rode tudo**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add lib/painel.ts tests/painel.test.ts
git commit -m "feat: filtros, busca, cartões do resumo, endereço para copiar e montarRetrato

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: A rota grava o retrato

**Files:**
- Modify: `app/api/analise/route.ts`

**Interfaces:**
- Consumes: `armazemPadrao` (Task 2), `montarRetrato` (Task 4), `analisar` (existente), `parsePayloadAnalise` (existente, devolve `arquivoNome`, `contatos`, `arquivoEnderecosNome?`, `enderecos?`).
- Produces: resposta `{ ok: true, retrato: Retrato, aviso?: string }`. A Task 7 consome `retrato` e `aviso`.

- [ ] **Step 1: Reescreva a rota**

Substitua o conteúdo de `app/api/analise/route.ts` por:

```ts
import { NextRequest, NextResponse } from "next/server";
import { analisar, type Dependencias } from "@/lib/analise";
import { parsePayloadAnalise, PayloadInvalidoError } from "@/lib/analise-payload";
import { armazemPadrao } from "@/lib/armazem";
import { resolverGrupoEFonte } from "@/lib/catalogo";
import { montarRetrato } from "@/lib/painel";
import { raspar } from "@/lib/scrape";
import { extrairComposicao, diagnosticarIa } from "@/lib/gemini";

const AVISO_NAO_GUARDADO = "A varredura terminou, mas o retrato não pôde ser guardado: na próxima abertura o app não a terá.";

/**
 * Recebe os contatos (e, opcionalmente, os endereços) já extraídos no navegador, varre as
 * fontes a partir desta máquina e grava o retrato em `.fiscal/retrato.json`. Sem teto de
 * tempo: o app é local (spec 2026-10-01, painel local). A rota não é testada diretamente;
 * `analisar`, `montarRetrato` e o `Armazem` são.
 */
export async function POST(req: NextRequest) {
  try {
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return NextResponse.json({ ok: false, message: "Corpo inválido (esperado JSON)." }, { status: 400 });
    }

    const { arquivoNome, contatos, arquivoEnderecosNome, enderecos } = parsePayloadAnalise(corpo);

    const deps: Dependencias = {
      resolverFonte: (grupo) => resolverGrupoEFonte(grupo),
      raspar: (fonte) => raspar(fonte.url, fonte.tabela ? { tabela: fonte.tabela } : {}),
      extrairComposicao: (grupoCanonico, textoLimpo) => extrairComposicao(grupoCanonico, textoLimpo),
    };

    const resultado = await analisar(arquivoNome, contatos, deps, enderecos);
    const retrato = montarRetrato(
      resultado,
      {
        contatos: { nome: arquivoNome, linhas: contatos.length },
        ...(enderecos
          ? { enderecos: { nome: arquivoEnderecosNome ?? "endereços", linhas: enderecos.length } }
          : {}),
      },
      new Date(),
    );

    let aviso: string | undefined;
    try {
      await armazemPadrao().gravarRetrato(retrato);
    } catch (err) {
      // Só o motivo técnico: o retrato tem PII e nunca vai para o log.
      console.error("[/api/analise] retrato não guardado:", err instanceof Error ? err.message : "erro desconhecido");
      aviso = AVISO_NAO_GUARDADO;
    }

    // Diagnóstico temporário (não-PII): só roda com ?diag=1 (custo zero no fluxo normal).
    const diag = req.nextUrl.searchParams.get("diag") === "1" ? await diagnosticarIa() : undefined;
    return NextResponse.json({ ok: true, retrato, ...(aviso ? { aviso } : {}), ...(diag ? { diag } : {}) });
  } catch (err) {
    if (err instanceof PayloadInvalidoError) {
      return NextResponse.json({ ok: false, message: err.message }, { status: 422 });
    }
    // Log sem PII (só o motivo técnico).
    console.error("[/api/analise] falha:", err instanceof Error ? err.message : "erro desconhecido");
    const message = err instanceof Error ? err.message : "Erro inesperado.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
```

Repare: `export const runtime` e `export const maxDuration` **saem**. Eram diretivas da Vercel; local, 33 grupos podem passar de um minuto.

- [ ] **Step 2: Rode typecheck e build**

Run: `npm run typecheck && npm run build`
Expected: limpos. (O `build` baixa nada; só compila.)

- [ ] **Step 3: Rode a suíte**

Run: `npm test`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add app/api/analise/route.ts
git commit -m "feat: /api/analise grava o retrato em .fiscal e responde com ele

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Fontes, tokens de cor e o componente de etiqueta

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`
- Create: `components/etiqueta.tsx`

**Interfaces:**
- Consumes: `Tom` de `@/lib/painel`.
- Produces: classes utilitárias Tailwind `bg-fundo`, `text-tinta`, `text-cinza`, `text-cinza-claro`, `border-borda`, `border-borda-forte`, `border-separador`, `bg-acao`, `text-acao`, `text-ok`, `bg-ok-fundo`, `text-atencao`, `bg-atencao-fundo`, `text-ruim`, `bg-ruim-fundo`, `bg-neutro-fundo`, `bg-cartao`, `font-sans`, `font-serif`; componente `<Etiqueta texto tom />`.

- [ ] **Step 1: `app/globals.css`**

```css
@import "tailwindcss";

/* Paleta e tipografia do mockup de 2026-09-30 (https://claude.ai/artifact/6HjpnkA5eS2Wd2DTfqv3u3). */
@theme {
  --font-sans: var(--font-plex), system-ui, sans-serif;
  --font-serif: var(--font-newsreader), Georgia, serif;

  --color-fundo: #f7f5f0;
  --color-cartao: #ffffff;
  --color-tinta: #1a1a17;
  --color-cinza: #5b5b54;
  --color-cinza-claro: #6b6b62;
  --color-borda: #ddd8ce;
  --color-borda-forte: #c9c3b6;
  --color-separador: #f0ede5;
  --color-acao: #1f5d7a;
  --color-acao-escuro: #15404f;
  --color-acao-borda: #bedae6;
  --color-ok: #1f6b45;
  --color-ok-fundo: #e3efe7;
  --color-atencao: #8a5a00;
  --color-atencao-fundo: #fbefd6;
  --color-atencao-borda: #edd6a8;
  --color-ruim: #9b2c2c;
  --color-ruim-fundo: #f8e1e1;
  --color-neutro-fundo: #f1efe9;
}
```

- [ ] **Step 2: `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-newsreader" });

export const metadata: Metadata = {
  title: "Fiscal de Mailings",
  description: "Confronto de dados cadastrais de autoridades com fontes oficiais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plex.variable} ${newsreader.variable}`}>
      <body className="min-h-screen bg-fundo font-sans text-tinta">{children}</body>
    </html>
  );
}
```

`next/font/google` baixa as fontes **na hora do build/dev** e as serve do próprio app; não há `<link>` externo em runtime. Precisa de internet na primeira compilação.

- [ ] **Step 3: `components/etiqueta.tsx`**

```tsx
import type { Tom } from "@/lib/painel";

const CLASSES: Record<Tom, string> = {
  ok: "bg-ok-fundo text-ok",
  atencao: "bg-atencao-fundo text-atencao",
  ruim: "bg-ruim-fundo text-ruim",
  neutro: "bg-neutro-fundo text-cinza",
};

/** Etiqueta curta de estado (campo conferido, situação da linha). Só apresentação. */
export function Etiqueta({ texto, tom }: { texto: string; tom: Tom }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASSES[tom]}`}>
      {texto}
    </span>
  );
}
```

- [ ] **Step 4: Build e typecheck**

Run: `npm run typecheck && npm run build`
Expected: limpos. Se o build falhar ao baixar as fontes (sem internet), registre no relatório e troque temporariamente por `font-family: system-ui` no `@theme`, mantendo o `layout.tsx` com as fontes.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx components/etiqueta.tsx
git commit -m "feat: fontes e paleta do mockup como tema do Tailwind; componente Etiqueta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: A tela "Nova varredura"

**Files:**
- Create: `app/nova-varredura/page.tsx`, `components/nova-varredura-form.tsx`
- Delete: `components/upload-zone.tsx`
- Modify: `app/page.tsx` (só para não importar o `upload-zone` apagado; o painel de verdade entra na Task 8)

**Interfaces:**
- Consumes: `lerPlanilha`, `ColunaFaltanteError` de `@/lib/planilha`; `lerPlanilhaEnderecos` de `@/lib/planilha-enderecos`; a resposta da rota (Task 5) `{ ok: true, retrato, aviso? } | { ok: false, message }`.
- Produces: `components/nova-varredura-form.tsx` exporta `NovaVarreduraForm({ onRetratoNaoGuardado }: { onRetratoNaoGuardado: (retrato: Retrato, aviso: string) => void })`. A Task 8 passa esse callback para mostrar o painel em memória quando a gravação falhou.

- [ ] **Step 1: `components/nova-varredura-form.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { lerPlanilha, ColunaFaltanteError } from "@/lib/planilha";
import { lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import type { ContatoPlanilha, EnderecoEstruturado, Retrato } from "@/lib/types";

type Resposta = { ok: true; retrato: Retrato; aviso?: string } | { ok: false; message?: string };

interface ArquivoContatos { nome: string; contatos: ContatoPlanilha[]; grupos: number }
interface ArquivoEnderecos { nome: string; enderecos: EnderecoEstruturado[] }

async function lerJsonSeguro(resp: Response): Promise<Resposta | null> {
  try {
    return (await resp.json()) as Resposta;
  } catch {
    return null;
  }
}

function mensagemDeLeitura(err: unknown): string {
  if (err instanceof ColunaFaltanteError) return `Planilha inválida. ${err.message}`;
  return err instanceof Error ? `Falha ao ler a planilha: ${err.message}` : "Falha ao ler a planilha.";
}

function Passo({ numero, ativo }: { numero: number; ativo: boolean }) {
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${ativo ? "bg-ok-fundo text-ok" : "bg-neutro-fundo text-cinza"}`}>
      {numero}
    </span>
  );
}

function SeletorDeArquivo({ id, rotulo, desabilitado, onArquivo }: { id: string; rotulo: string; desabilitado: boolean; onArquivo: (f: File) => void }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-borda-forte bg-fundo p-5 text-center">
      <label htmlFor={id} className="cursor-pointer rounded-md border border-acao-borda bg-cartao px-3.5 py-1.5 text-sm font-medium text-acao">
        {rotulo}
      </label>
      <input
        id={id}
        type="file"
        accept=".xlsx,.csv"
        className="sr-only"
        disabled={desabilitado}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onArquivo(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ArquivoLido({ nome, resumo, onTrocar, desabilitado }: { nome: string; resumo: string; onTrocar: () => void; desabilitado: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-3 rounded-lg border border-ok-fundo bg-ok-fundo/40 p-4">
      <span aria-hidden="true" className="text-ok">✓</span>
      <div className="grow">
        <div className="text-sm font-medium">{nome}</div>
        <div className="text-xs text-cinza">{resumo}</div>
      </div>
      <button type="button" onClick={onTrocar} disabled={desabilitado} className="rounded-md border border-borda-forte bg-cartao px-2.5 py-1 text-xs">
        Trocar
      </button>
    </div>
  );
}

export function NovaVarreduraForm({ onRetratoNaoGuardado }: { onRetratoNaoGuardado: (retrato: Retrato, aviso: string) => void }) {
  const router = useRouter();
  const [contatos, setContatos] = useState<ArquivoContatos | null>(null);
  const [enderecos, setEnderecos] = useState<ArquivoEnderecos | null>(null);
  const [erroContatos, setErroContatos] = useState<string | null>(null);
  const [erroEnderecos, setErroEnderecos] = useState<string | null>(null);
  const [erroVarredura, setErroVarredura] = useState<string | null>(null);
  const [varrendo, setVarrendo] = useState(false);

  async function lerContatos(arquivo: File) {
    setErroContatos(null);
    try {
      const lista = lerPlanilha(await arquivo.arrayBuffer());
      setContatos({ nome: arquivo.name, contatos: lista, grupos: new Set(lista.map((c) => c.grupo)).size });
    } catch (err) {
      setContatos(null);
      setErroContatos(mensagemDeLeitura(err));
    }
  }

  async function lerEnderecos(arquivo: File) {
    setErroEnderecos(null);
    try {
      setEnderecos({ nome: arquivo.name, enderecos: lerPlanilhaEnderecos(await arquivo.arrayBuffer()) });
    } catch (err) {
      setEnderecos(null);
      setErroEnderecos(mensagemDeLeitura(err));
    }
  }

  async function varrer() {
    if (!contatos) return;
    setVarrendo(true);
    setErroVarredura(null);
    try {
      const resp = await fetch("/api/analise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arquivoNome: contatos.nome,
          contatos: contatos.contatos,
          ...(enderecos ? { enderecos: enderecos.enderecos, arquivoEnderecosNome: enderecos.nome } : {}),
        }),
      });
      const json = await lerJsonSeguro(resp);
      if (!json) {
        setErroVarredura(`O servidor respondeu de forma inesperada (HTTP ${resp.status}). Tente novamente.`);
        return;
      }
      if (!json.ok) {
        setErroVarredura(json.message ?? "Falha ao varrer.");
        return;
      }
      if (json.aviso) {
        onRetratoNaoGuardado(json.retrato, json.aviso);
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setVarrendo(false);
    }
  }

  return (
    <div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-borda-forte bg-cartao p-6">
          <div className="flex items-center gap-2.5">
            <Passo numero={1} ativo={contatos !== null} />
            <h2 className="text-lg font-semibold">Contatos e grupos</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-cinza">
            Exportação do Sistema Contatos. Os grupos a varrer saem da coluna <strong className="font-medium">Grupo</strong> desta planilha.
          </p>
          {contatos ? (
            <ArquivoLido nome={contatos.nome} resumo={`${contatos.contatos.length} contatos · ${contatos.grupos} grupos`} onTrocar={() => setContatos(null)} desabilitado={varrendo} />
          ) : (
            <SeletorDeArquivo id="planilha-contatos" rotulo="Escolher arquivo" desabilitado={varrendo} onArquivo={lerContatos} />
          )}
          {erroContatos && <p className="mt-2 text-sm text-ruim">{erroContatos}</p>}
        </section>

        <section className="rounded-xl border border-borda-forte bg-cartao p-6">
          <div className="flex items-center gap-2.5">
            <Passo numero={2} ativo={enderecos !== null} />
            <h2 className="text-lg font-semibold">Relatório de endereços</h2>
            <span className="rounded-full bg-neutro-fundo px-2 py-0.5 text-[11px] text-cinza">opcional</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-cinza">
            Sem ele, o endereço continua saindo como <em>fonte não informa</em>: os sites dos órgãos não publicam endereço.
          </p>
          {enderecos ? (
            <ArquivoLido nome={enderecos.nome} resumo={`${enderecos.enderecos.length} endereços`} onTrocar={() => setEnderecos(null)} desabilitado={varrendo} />
          ) : (
            <SeletorDeArquivo id="planilha-enderecos" rotulo="Escolher arquivo" desabilitado={varrendo} onArquivo={lerEnderecos} />
          )}
          {erroEnderecos && <p className="mt-2 text-sm text-ruim">{erroEnderecos}</p>}
        </section>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          type="button"
          onClick={varrer}
          disabled={!contatos || varrendo}
          className="rounded-lg bg-acao px-6 py-3 text-base font-semibold text-white disabled:opacity-50"
        >
          {varrendo ? "Varrendo…" : contatos ? `Varrer ${contatos.grupos} grupos` : "Varrer"}
        </button>
        {varrendo && <p className="text-sm text-cinza">Esta máquina está lendo as fontes oficiais. Pode levar mais de um minuto.</p>}
        {erroVarredura && <p className="text-sm text-ruim">{erroVarredura}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `app/nova-varredura/page.tsx`**

A página precisa de estado para o caso "retrato não guardado" (mostrar o painel em memória). Para isso ela é Client Component fina; o painel em si entra na Task 8, então **nesta tarefa** mostre só o aviso e os contadores crus:

```tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { NovaVarreduraForm } from "@/components/nova-varredura-form";
import type { Retrato } from "@/lib/types";

export default function NovaVarreduraPage() {
  const [naoGuardado, setNaoGuardado] = useState<{ retrato: Retrato; aviso: string } | null>(null);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-serif text-3xl font-semibold">Nova varredura</h1>
        <Link href="/grupos" className="text-sm text-acao underline">Grupos cadastrados</Link>
      </div>
      <p className="max-w-2xl text-sm leading-relaxed text-cinza">
        As duas planilhas são lidas aqui no seu navegador. Esta máquina lê as fontes oficiais e guarda o resultado em um arquivo local; nada sai daqui.
      </p>
      {naoGuardado ? (
        <p className="mt-6 rounded-lg border border-atencao-borda bg-atencao-fundo p-4 text-sm text-atencao">
          {naoGuardado.aviso} Resultado: {naoGuardado.retrato.resumo.total} contatos varridos.
        </p>
      ) : (
        <NovaVarreduraForm onRetratoNaoGuardado={(retrato, aviso) => setNaoGuardado({ retrato, aviso })} />
      )}
    </main>
  );
}
```

(A Task 8 troca o `<p>` do aviso por `<Painel retrato={naoGuardado.retrato} aviso={naoGuardado.aviso} />`.)

- [ ] **Step 3: Tire o `upload-zone`**

```bash
git rm components/upload-zone.tsx
```

Em `app/page.tsx`, troque a linha `{!analise && <UploadZone onResultado={(r) => setAnalise(r as ResultadoAnalise)} />}` por `{!analise && <Link href="/nova-varredura" className="underline">Nova varredura</Link>}` e remova o import de `UploadZone` (e o de `ResultadoAnalise`, se ficar sem uso e o typecheck reclamar). É provisório; a Task 8 reescreve `app/page.tsx` inteiro.

- [ ] **Step 4: Typecheck, build, suíte**

Run: `npm run typecheck && npm run build && npm test`
Expected: limpos.

- [ ] **Step 5: Conferência manual rápida**

Run: `npm run dev`, abra `http://localhost:3000/nova-varredura`. Escolha uma planilha de `Bases de comparação -PLANILHAS CONTATOS/` no cartão 1: deve aparecer "nome · N contatos · M grupos" e o botão "Varrer M grupos" habilitar. **Não precisa varrer** nesta tarefa. Pare o servidor. Registre no relatório o que viu.

- [ ] **Step 6: Commit**

```bash
git add app/nova-varredura/page.tsx components/nova-varredura-form.tsx app/page.tsx
git commit -m "feat: tela Nova varredura com os dois cartões; sai upload-zone

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Confira com `git status` que a remoção de `components/upload-zone.tsx` está no índice antes do commit.)

---

### Task 8: O painel

**Files:**
- Create: `components/painel.tsx`, `components/linha-contato.tsx`
- Modify: `app/page.tsx` (reescrever), `app/nova-varredura/page.tsx` (usar o painel no caso "não guardado"), `components/export-buttons.tsx` (só o rótulo dos botões)
- Delete: `components/resultado-tabela.tsx`, `components/semaforo-badge.tsx`

**Interfaces:**
- Consumes: tudo de `@/lib/painel` (Tasks 3 e 4); `rotuloAchadoEndereco` de `@/lib/endereco`; `armazemPadrao`, `RetratoIlegivelError` de `@/lib/armazem`; `Etiqueta` (Task 6); `ExportButtons` (existente, recebe `analise: ResultadoAnalise`; `Retrato` é compatível).
- Produces: `Painel({ retrato, aviso? })`.

- [ ] **Step 1: `components/linha-contato.tsx`**

```tsx
"use client";
import { useState } from "react";
import { Etiqueta } from "@/components/etiqueta";
import { rotuloAchadoEndereco } from "@/lib/endereco";
import {
  detalhesDoContato,
  etiquetaDeEndereco,
  etiquetasDoContato,
  linhasDoEndereco,
  motivoDoContato,
  situacaoDoContato,
  textoDataHora,
  textoEnderecoParaCopiar,
} from "@/lib/painel";
import type { ResultadoContato, ResultadoGrupo, Retrato } from "@/lib/types";

const COLUNAS = "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,2.6fr)_minmax(0,1fr)] items-start gap-4 px-4 py-3";

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  if (typeof navigator === "undefined" || !navigator.clipboard) return null;
  return (
    <button
      type="button"
      className="mt-1.5 rounded border border-acao-borda bg-cartao px-2 py-0.5 text-[11px] text-acao"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      }}
    >
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

function BlocoEndereco({ c, retrato }: { c: ResultadoContato; retrato: Retrato }) {
  const a = c.endereco;
  if (!a || a.situacao === "sem_base") return null;
  const etiqueta = etiquetaDeEndereco(c);
  return (
    <div className="rounded-lg border border-atencao-borda bg-[#fffdf8] p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Endereço</span>
        {etiqueta && <Etiqueta texto={etiqueta.texto} tom={etiqueta.tom} />}
        {retrato.planilhaEnderecos && (
          <span className="ml-auto text-xs text-cinza-claro">{retrato.planilhaEnderecos.nome}{a.endereco?.enderecoId ? ` · id ${a.endereco.enderecoId}` : ""}</span>
        )}
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs text-cinza-claro">No cadastro</div>
          <div className="mt-1 text-sm leading-relaxed">{c.contato.endereco?.trim() || "(vazio)"}</div>
        </div>
        <div>
          <div className="text-xs text-cinza-claro">No relatório de endereços</div>
          {a.endereco ? (
            <>
              <div className="mt-1 text-sm font-medium leading-relaxed">
                {linhasDoEndereco(a.endereco).map((l, i) => <div key={i}>{l}</div>)}
              </div>
              <BotaoCopiar texto={textoEnderecoParaCopiar(a.endereco)} />
            </>
          ) : (
            <div className="mt-1 text-sm text-cinza">sem linha no relatório</div>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1 border-t border-atencao-borda pt-3 text-xs text-atencao">
        {a.achados.map((ach) => <li key={ach}>{rotuloAchadoEndereco(ach)}</li>)}
        <li className="text-cinza">Correios: não conferido nesta versão</li>
      </ul>
    </div>
  );
}

function Detalhe({ c, g, retrato }: { c: ResultadoContato; g: ResultadoGrupo; retrato: Retrato }) {
  const cartoes = detalhesDoContato(c, g);
  return (
    <div className="space-y-4 border-t border-separador bg-fundo/60 px-4 py-4">
      {cartoes.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cartoes.map((d) => (
            <div key={d.campo} className="rounded-lg border border-borda bg-cartao p-3.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{d.rotulo}</span>
                {d.etiqueta && <Etiqueta texto={d.etiqueta.texto.replace(`${d.rotulo} `, "")} tom={d.etiqueta.tom} />}
              </div>
              <div className="mt-2 text-xs text-cinza-claro">No cadastro</div>
              <div className="text-sm">{d.valorPlanilha || "(vazio)"}</div>
              <div className="mt-2 text-xs text-cinza-claro">{d.origem}</div>
              <div className="text-sm font-medium">{d.valorReferencia || "—"}</div>
              {d.copiavel && <BotaoCopiar texto={d.copiavel} />}
              {d.coerencias.map((t) => <div key={t} className="mt-1.5 text-xs text-atencao">{t}</div>)}
            </div>
          ))}
        </div>
      )}
      <BlocoEndereco c={c} retrato={retrato} />
      <ul className="text-xs leading-relaxed text-cinza">
        {g.fonteUrl && g.fonteUrl.startsWith("http") && (
          <li>Nome e cargo: <a href={g.fonteUrl} target="_blank" rel="noreferrer" className="text-acao underline">{g.fonteUrl}</a>, lido em {textoDataHora(retrato.geradoEm)}</li>
        )}
        <li>Tratamento e endereçamento: tabela de protocolo (Posse2027_TabelaTratamentos.xlsx)</li>
        {retrato.planilhaEnderecos && <li>Endereço: {retrato.planilhaEnderecos.nome}</li>}
      </ul>
    </div>
  );
}

export function LinhaContato({ c, g, retrato }: { c: ResultadoContato; g: ResultadoGrupo; retrato: Retrato }) {
  const [aberto, setAberto] = useState(false);
  const etiquetas = etiquetasDoContato(c, g);
  const situacao = situacaoDoContato(c, g);
  const motivo = motivoDoContato(c, g);
  const subtitulo = motivo ?? [c.contato.tratamento, c.contato.enderecamento].filter(Boolean).join(" · ");
  return (
    <div className="border-t border-separador">
      <div className={COLUNAS}>
        <button type="button" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} className="text-left">
          <span className="block text-sm font-medium text-tinta">{c.contato.nome}</span>
          {subtitulo && <span className={`block text-xs ${motivo ? "text-atencao" : "text-cinza"}`}>{subtitulo}</span>}
        </button>
        <div className="text-sm text-cinza">{c.contato.cargo ?? "—"}</div>
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((e) => <Etiqueta key={`${e.campo}-${e.texto}`} texto={e.texto} tom={e.tom} />)}
        </div>
        <div><Etiqueta texto={situacao.texto} tom={situacao.tom} /></div>
      </div>
      {aberto && <Detalhe c={c} g={g} retrato={retrato} />}
    </div>
  );
}

/** `nota`: fonte rotulada ("fora de exercício: Ocupação de cargo de ministro"), quando a pessoa veio de uma fonte secundária. */
export function LinhaNovo({ nome, cargo, viaIa, nota }: { nome: string; cargo?: string; viaIa: boolean; nota?: string }) {
  return (
    <div className="border-t border-separador">
      <div className={COLUNAS}>
        <div>
          <span className="block text-sm font-medium">{nome}</span>
          <span className="block text-xs text-atencao">Está na fonte, falta no cadastro</span>
        </div>
        <div className="text-sm text-cinza">—</div>
        <div className="flex flex-wrap gap-1.5">
          {cargo && <Etiqueta texto={`Site: ${cargo}${viaIa ? " (via IA)" : ""}`} tom="neutro" />}
          {nota && <Etiqueta texto={nota} tom="neutro" />}
        </div>
        <div><Etiqueta texto="Avaliar inclusão" tom="atencao" /></div>
      </div>
    </div>
  );
}

export { COLUNAS as CLASSES_COLUNAS };
```

- [ ] **Step 2: `components/painel.tsx`**

```tsx
"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ExportButtons } from "@/components/export-buttons";
import { CLASSES_COLUNAS, LinhaContato, LinhaNovo } from "@/components/linha-contato";
import { cartoesDoResumo, contarContatos, filtrarGrupos, FILTROS, textoDataHora, type Filtro } from "@/lib/painel";
import type { ResultadoGrupo, Retrato } from "@/lib/types";

function EstadoDaFonte({ g }: { g: ResultadoGrupo }) {
  if (g.semFonte) {
    return (
      <span className="text-xs text-ruim">
        Sem fonte cadastrada
        {g.sugestoesCadastro && g.sugestoesCadastro.length > 0 ? ` (você quis dizer: ${g.sugestoesCadastro.join(" · ")}?)` : ""}
        {" · "}<Link href="/grupos" className="underline">grupos cadastrados</Link>
      </span>
    );
  }
  if (g.fonteInacessivel) {
    return (
      <span className="text-xs text-atencao">
        Fonte inacessível, confira à mão{g.erroFonte ? `: ${g.erroFonte}` : ""}
        {g.fonteUrl && <> · <a href={g.fonteUrl} target="_blank" rel="noreferrer" className="underline">abrir</a></>}
      </span>
    );
  }
  return (
    <span className="text-xs text-cinza">
      {g.viaPesquisaAmpla && <span className="text-atencao">≈ via IA — confira · </span>}
      {g.erroFonte && <span className="text-atencao">uma fonte não respondeu: {g.erroFonte} · </span>}
      {g.fonteUrl && g.fonteUrl.startsWith("http") && (
        <a href={g.fonteUrl} target="_blank" rel="noreferrer" className="text-acao underline">abrir fonte</a>
      )}
    </span>
  );
}

export function Painel({ retrato, aviso }: { retrato: Retrato; aviso?: string }) {
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");
  const grupos = useMemo(() => filtrarGrupos(retrato.grupos, filtro, busca), [retrato, filtro, busca]);
  const total = retrato.resumo.total;
  const visiveis = contarContatos(grupos);
  const filtrando = filtro !== "tudo" || busca.trim() !== "";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Fiscal de Mailings</h1>
          <p className="mt-1 text-sm text-cinza">
            Contatos <strong className="font-medium text-tinta">{retrato.planilhaContatos.nome}</strong>
            {retrato.planilhaEnderecos && <> · Endereços <strong className="font-medium text-tinta">{retrato.planilhaEnderecos.nome}</strong></>}
            {" · "}varredura de {textoDataHora(retrato.geradoEm)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/nova-varredura" className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm">Nova varredura</Link>
          <ExportButtons analise={retrato} />
        </div>
      </header>

      {aviso && <p className="mt-4 rounded-lg border border-atencao-borda bg-atencao-fundo p-3 text-sm text-atencao">{aviso}</p>}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cartoesDoResumo(retrato.resumo).map((c) => (
          <div key={c.rotulo} className="rounded-lg border border-borda bg-cartao px-4 py-3">
            <div className="font-serif text-3xl font-semibold">{c.valor}</div>
            <div className="text-xs text-cinza">{c.rotulo}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-cinza-claro">Mostrar</span>
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`rounded-full border px-3 py-1 text-xs ${filtro === f.id ? "border-acao bg-acao text-white" : "border-borda-forte bg-cartao text-tinta"}`}
          >
            {f.rotulo}
          </button>
        ))}
        <div className="grow" />
        <label htmlFor="busca" className="text-xs text-cinza-claro">Buscar</label>
        <input
          id="busca"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="nome, cargo ou órgão"
          className="w-56 rounded-md border border-borda-forte bg-cartao px-2.5 py-1 text-sm"
        />
      </div>
      {filtrando && <p className="mt-2 text-xs text-cinza">{visiveis} contatos de {total}</p>}

      <div className="mt-5 space-y-5">
        {grupos.map((g) => (
          <section key={g.grupo} className="overflow-hidden rounded-xl border border-borda bg-cartao">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-separador px-4 py-3">
              <h2 className="font-serif text-lg font-semibold">{g.grupo}</h2>
              <span className="text-xs text-cinza">
                {g.contatos.length} contatos{g.responsavel ? ` · responsável ${g.responsavel}` : ""}
              </span>
              <div className="grow" />
              <EstadoDaFonte g={g} />
            </div>
            <div className={`${CLASSES_COLUNAS} text-xs text-cinza-claro`}>
              <div>Contato</div><div>Cargo no cadastro</div><div>Campos conferidos</div><div>Situação</div>
            </div>
            {g.contatos.map((c, i) => <LinhaContato key={`${c.contato.nome}-${i}`} c={c} g={g} retrato={retrato} />)}
            {g.novos.map((n, i) => (
              <LinhaNovo
                key={`novo-${i}`}
                nome={n.nome}
                cargo={n.cargo}
                viaIa={n.origem === "conhecimento"}
                nota={n.rotuloFonte ? [n.rotuloFonte, n.contexto].filter(Boolean).join(": ") : undefined}
              />
            ))}
          </section>
        ))}
        {grupos.length === 0 && <p className="text-sm text-cinza">Nada para mostrar com este filtro.</p>}
      </div>
    </main>
  );
}
```

Como `Etiqueta` é importado e não usado neste arquivo, remova a importação se o lint reclamar.

- [ ] **Step 3: `app/page.tsx` (reescrever inteiro)**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Painel } from "@/components/painel";
import { armazemPadrao, RetratoIlegivelError } from "@/lib/armazem";
import type { Retrato } from "@/lib/types";

// Lê o arquivo a cada abertura: o retrato muda fora do ciclo de build.
export const dynamic = "force-dynamic";

export default async function Home() {
  let retrato: Retrato | undefined;
  try {
    retrato = await armazemPadrao().lerRetrato();
  } catch (err) {
    if (err instanceof RetratoIlegivelError) {
      return (
        <main className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="font-serif text-3xl font-semibold">O último retrato não pôde ser lido</h1>
          <p className="mt-2 text-sm text-cinza">O arquivo .fiscal/retrato.json existe, mas não é um retrato válido. Faça uma nova varredura; ela substitui o arquivo.</p>
          <Link href="/nova-varredura" className="mt-6 inline-block rounded-lg bg-acao px-5 py-2.5 text-sm font-semibold text-white">Nova varredura</Link>
        </main>
      );
    }
    throw err;
  }
  if (!retrato) redirect("/nova-varredura");
  return <Painel retrato={retrato} />;
}
```

- [ ] **Step 4: `app/nova-varredura/page.tsx`**

Troque o `<p>` do aviso (ramo `naoGuardado`) por:

```tsx
        <Painel retrato={naoGuardado.retrato} aviso={naoGuardado.aviso} />
```

com `import { Painel } from "@/components/painel";`. Como o `Painel` já traz `<main>`, nesse ramo devolva **só** o `Painel`, sem o `<main>` da página em volta: estruture o `return` como `naoGuardado ? <Painel … /> : <main>…</main>`.

- [ ] **Step 5: `components/export-buttons.tsx`**

Só rótulos e classes, para casar com o tema. A função `baixar` e os `onClick` não mudam. Substitua o `return`:

```tsx
  return (
    <div className="flex gap-2">
      <button
        className="rounded-md bg-acao px-3 py-1.5 text-sm font-medium text-white"
        onClick={() => baixar("resultado.xlsx", gerarXlsx(analise),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
        Baixar planilha
      </button>
      <button
        className="rounded-md border border-borda-forte bg-cartao px-3 py-1.5 text-sm"
        onClick={() => baixar("resultado.csv", gerarCsv(analise), "text/csv")}>
        CSV
      </button>
    </div>
  );
```

- [ ] **Step 6: Apague o que saiu**

```bash
git rm components/resultado-tabela.tsx components/semaforo-badge.tsx
```

Confira que nada mais importa os dois: `grep -rn "resultado-tabela\|semaforo-badge\|SemaforoBadge\|ResultadoTabela" app components lib tests` deve devolver nada.

- [ ] **Step 7: Typecheck, build, suíte**

Run: `npm run typecheck && npm run build && npm test`
Expected: limpos.

- [ ] **Step 8: Conferência manual com as planilhas reais**

Run: `npm run dev`. Em `http://localhost:3000/nova-varredura`, escolha as duas planilhas de `Bases de comparação -PLANILHAS CONTATOS/` e clique "Varrer N grupos". Espere terminar (pode passar de um minuto; esta máquina lê os sites). Confira e registre no relatório, **sem copiar nomes de pessoas**:

1. O navegador foi para `/` e o cabeçalho mostra os dois nomes de arquivo e "varredura de DD/MM, HHhMM".
2. Os seis cartões: "Endereços a confirmar" deve ser 29 (medido em 2026-10-01 com estas planilhas); os demais, anote.
3. Clique num contato com "N a revisar": a linha expande, os cartões por campo aparecem, o bloco de endereço aparece quando há relatório, "Copiar" copia.
4. Filtro "Endereço a confirmar" mostra 29 contatos; a busca por um sobrenome encontra.
5. Pare o `npm run dev`, rode de novo, abra `/`: o painel abre direto com a mesma varredura e a mesma hora.
6. `git status` **não** mostra `.fiscal/`.

- [ ] **Step 9: Commit**

```bash
git add app/page.tsx app/nova-varredura/page.tsx components/painel.tsx components/linha-contato.tsx components/export-buttons.tsx
git commit -m "feat: painel do retrato com etiquetas por campo, filtros, linha expansível e Copiar; saem resultado-tabela e semaforo-badge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

(Confira com `git status` que as duas remoções do Step 6 estão no índice.)

---

### Task 9: `CLAUDE.md` e encerramento

**Files:**
- Modify: `CLAUDE.md`

O arquivo tem alteração não commitada do usuário (feita em 2026-10-01, antes desta branch: a linha do spec de endereço e o princípio da Camada D). **Esta tarefa commita o `CLAUDE.md` inteiro**, incluindo essa alteração, porque ela é parte do mesmo estado do projeto e o usuário pediu para avançar. Antes, leia o `git diff CLAUDE.md` e confirme que o diff só contém texto do projeto (nenhum segredo, nenhum dado pessoal).

- [ ] **Step 1: Edite `CLAUDE.md`**

1. Na tabela "Documentos de decisão", mude a linha de `2026-09-04` (se existir; se não existir, acrescente-a) para:
   `| 2026-09-04 | \`varredura-continua-posse-2027-design.md\` | Abrir o app e ver o último retrato, com data; investigação por busca | **Parcialmente substituído** por 2026-10-01 (painel local): fica o retrato; caem Blob, senha, cron e varredura na Vercel |`
   e acrescente, depois da linha de `2026-10-01 | auditoria-de-endereco-camada-d.md`:
   `| 2026-10-01 | \`painel-local-retrato-em-arquivo.md\` | **App só local.** Retrato em \`.fiscal/retrato.json\`; painel do mockup (etiquetas por campo, linha expansível, Copiar); tela Nova varredura | Vigente |`
2. Em "Stack (em uso)", troque "· Vercel" por "· roda local com `npm run dev` (a Vercel saiu da stack em 2026-10-01; o deploy antigo é sobra)".
3. Em "Princípios de implementação", acrescente:
   `- **O retrato é a única persistência.** \`lib/armazem.ts\` grava o último \`Retrato\` em \`.fiscal/retrato.json\`, fora do git, com escrita atômica; um só, sem histórico. O painel (\`/\`) lê o retrato; sem retrato, manda para \`/nova-varredura\`. A lógica de apresentação (etiquetas, situação, filtros, cartões, detalhe) é função pura em \`lib/painel.ts\`, testada; componentes só renderizam.`
4. Em "Layout do código", acrescente `lib/armazem.ts` e `lib/painel.ts` à linha de `lib/`, troque os componentes listados por `painel, linha-contato, etiqueta, nova-varredura-form, export-buttons`, e acrescente a linha `.fiscal/            ← último retrato (PII); fora do git`.
5. Em "O que NÃO fazer", troque "Não persistir resultados de análise." por "Não persistir nada além do último retrato em `.fiscal/`; não reintroduzir histórico, Blob ou banco sem novo spec." e acrescente "Não voltar a depender da Vercel para ler fontes: ela é bloqueada por IP (medido em 2026-09-17)."
6. Em "Estado do projeto", atualize a contagem: rode `npm test` e escreva o número real de arquivos e testes, com a data de hoje.

- [ ] **Step 2: Rode tudo uma última vez**

Run: `npm test && npm run typecheck && npm run build`
Expected: verdes.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md com o painel local, o retrato em arquivo e a saída da Vercel

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm test`, `npm run typecheck`, `npm run build` verdes.
- [ ] `git log --oneline main..HEAD`: um commit por tarefa mais o spec; nenhum `.xlsx`, nenhum `.fiscal/`, nenhum arquivo do pnpm, nenhum `PROXIMA_SESSAO*.md`.
- [ ] A conferência manual da Task 8, Step 8, feita e registrada.
- [ ] `grep -rn "console\." lib components app | grep -v "motivo\|message\|erro desconhecido"`: nenhum log com dado de contato.
- [ ] Spec §12 coberto: `CLAUDE.md` atualizado (Task 9).
