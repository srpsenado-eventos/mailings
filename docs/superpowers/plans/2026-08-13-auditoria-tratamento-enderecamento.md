# Auditoria de Tratamento e Endereçamento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auditar as colunas `Tratamento` e `Endereçamento` da planilha contra a tabela de protocolo, fechando o buraco em que hoje elas são lidas e ignoradas.

**Architecture:** A tabela vira `data/tratamentos.ts` (tipada, versionada). `lib/tratamento.ts` — puro — resolve o cargo do contato para uma regra e expande o padrão da tabela no **conjunto de formas aceitas** (gênero, alternativas, placeholders). `lib/match.ts` acrescenta essas comparações às já existentes, com uma terceira procedência de valor esperado (`protocolo`).

**Tech Stack:** TypeScript · Vitest · `string-similarity` (já no projeto) · Node 24 (scripts `.mjs`, ESM)

**Spec:** [docs/superpowers/specs/2026-08-13-auditoria-tratamento-enderecamento.md](../specs/2026-08-13-auditoria-tratamento-enderecamento.md)

## Global Constraints

- **Sem `any`.** Use `unknown` + narrowing, ou defina o tipo.
- **Imutabilidade:** funções de `lib/` nunca mutam o input.
- **`lib/*.ts` são funções puras.** Sem JSX, sem hooks, sem `window`, sem rede.
- **Normalização centralizada** em `lib/normalize.ts` — usar `normalizarTexto`, não reimplementar.
- **Sem PII em log.** Nomes e cargos de autoridades nunca vão para `console.log`.
- **Comentários e nomes de teste em português.** Padrão AAA.
- **Cargo não resolvido → `sem_regra`, nunca `divergente`.** Não saber a regra é diferente de saber que está errado.
- **Viés declarado: expansão permissiva.** Onde a tabela é ambígua, prefira aceitar a acusar. Um "divergente" falso num campo de protocolo destrói a confiança mais rápido que um "confere" leniente.
- **Aba que rege:** `Tratamentos Simplificado`. `Tratamento` da planilha ↔ **Vocativo epistolar**; `Endereçamento` ↔ **Endereçamento**.
- **Não alterar** `lib/scrape.ts`, `lib/planilha.ts`, `lib/gemini.ts`, `lib/catalogo.ts`, `lib/normalize.ts`.
- Comandos: `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`.

## Decisão de projeto que estende o spec

O spec diz "acrescenta as comparações de protocolo a `comparacoes`" sem dizer em quais dos
caminhos. Existem **quatro** construtores de `ResultadoContato` em `lib/match.ts`:

| # | Caminho | `comparacoes` hoje | Semáforo hoje |
|---|---|---|---|
| 1 | `montarResultado`, pessoa casada | preenchidas | verde/amarelo |
| 2 | `montarResultado`, sem pessoa (possível saída) | `[]` | vermelho |
| 3 | `marcarFonteInacessivel` | `[]` | indeterminado |
| 4 | `compararGrupo`, grupo sem fonte | `[]` | vermelho |

**Decisão: a auditoria de protocolo entra nos quatro.** Ela não depende do site, então funciona
justamente onde a auditoria de site é impossível — inclusive nos 12 grupos sem fonte cadastrada,
que hoje não recebem nenhuma informação útil.

**Os semáforos de 2, 3 e 4 não mudam.** Eles descrevem o estado da verificação contra o site, e
sobrescrevê-los apagaria um sinal que já funciona. Só o caminho 1 reage, e de graça: a regra
existente (`divergentes > 0 → amarelo`) já produz o amarelo que o spec pede.

---

### Task 1: Tipos, gerador e `data/tratamentos.ts`

**Files:**
- Modify: `lib/types.ts` (acrescenta `RegraTratamento`)
- Modify: `.gitignore` (exceção para o XLSX de protocolo)
- Create: `scripts/gerar-tratamentos.mjs`
- Create: `data/tratamentos.ts` (gerado, commitado)
- Test: `tests/tratamentos-dados.test.ts`

**Interfaces:**
- Consumes: `Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx`, aba `Tratamentos Simplificado`
- Produces: `RegraTratamento { cargoDestinatario, nominata, vocativo, pronome, enderecamento }` em `@/lib/types`; `REGRAS_TRATAMENTO: readonly RegraTratamento[]` em `@/data/tratamentos`

- [ ] **Step 1: Acrescentar o tipo em `lib/types.ts`**

Ao final do arquivo:

```typescript
/**
 * Uma entrada da tabela de protocolo (`data/tratamentos.ts`), aba "Tratamentos Simplificado".
 * Os textos são **padrões**, não valores literais: podem conter marcador de gênero `(a)`,
 * alternativas ("ou", " / "), feminino por extenso entre parênteses e os placeholders
 * `[Cargo]`, `[Patente]` e `[Nome]`. Ver lib/tratamento.ts para a expansão.
 */
export interface RegraTratamento {
  cargoDestinatario: string;
  nominata: string;
  vocativo: string;
  pronome: string;
  enderecamento: string;
}
```

- [ ] **Step 2: Abrir exceção no `.gitignore`**

A regra `*.xlsx` existe porque planilhas do Senado contêm PII. Esta não contém — só cargos e
marcadores `[Nome]`. Versioná-la preserva a proveniência do arquivo gerado.

Acrescente abaixo da linha `!tests/fixtures/*.xlsx`:

```
# Tabela de protocolo: sem PII (só cargos e marcadores [Nome]); é a origem de data/tratamentos.ts
!Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx
```

- [ ] **Step 3: Escrever o teste de integridade (vai falhar)**

Crie `tests/tratamentos-dados.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { REGRAS_TRATAMENTO } from "@/data/tratamentos";

describe("tabela de protocolo real (data/tratamentos.ts)", () => {
  test("tem as 38 entradas da aba Simplificado", () => {
    expect(REGRAS_TRATAMENTO).toHaveLength(38);
  });

  test("não inclui os cabeçalhos repetidos da planilha", () => {
    const cabecalhos = REGRAS_TRATAMENTO.filter(
      (r) => r.cargoDestinatario.trim() === "Cargo do destinatário",
    );
    expect(cabecalhos).toEqual([]);
  });

  test("não inclui as linhas de seção (sem nominata)", () => {
    const semNominata = REGRAS_TRATAMENTO.filter((r) => r.nominata.trim().length === 0);
    expect(semNominata.map((r) => r.cargoDestinatario)).toEqual([]);
  });

  test("toda entrada tem cargo e vocativo não-vazios", () => {
    const incompletas = REGRAS_TRATAMENTO.filter(
      (r) => r.cargoDestinatario.trim().length === 0 || r.vocativo.trim().length === 0,
    );
    expect(incompletas).toEqual([]);
  });

  test("preserva os casos-limite que a expansão precisa tratar", () => {
    const nomes = REGRAS_TRATAMENTO.map((r) => r.cargoDestinatario);
    expect(nomes).toContain("Cardeal");
    expect(nomes).toContain("Cônsul");
    expect(nomes).toContain("Militares com patente superior");
    const cardeal = REGRAS_TRATAMENTO.find((r) => r.cargoDestinatario === "Cardeal");
    expect(cardeal?.vocativo).toContain("ou");
  });
});
```

- [ ] **Step 4: Rodar o teste e confirmar que falha**

Run: `npx vitest run tests/tratamentos-dados.test.ts`
Expected: FAIL — não resolve `@/data/tratamentos`.

- [ ] **Step 5: Escrever o gerador**

Crie `scripts/gerar-tratamentos.mjs`. Colunas da aba, por índice: 0 `Cargo do destinatário`,
1 `Nominata`, 2 `Vocativo epistolar`, 3 `Pronome de tratamento`, 4 `Endereçamento`.

```javascript
#!/usr/bin/env node
// Converte a aba "Tratamentos Simplificado" do XLSX de protocolo em data/tratamentos.ts.
// Ver docs/superpowers/specs/2026-08-13-auditoria-tratamento-enderecamento.md
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ORIGEM = path.join(root, "Regras de Atualizacao", "Posse2027_TabelaTratamentos.xlsx");
const ABA = "Tratamentos Simplificado";

const wb = XLSX.read(readFileSync(ORIGEM), { type: "buffer" });
if (!wb.Sheets[ABA]) throw new Error(`aba "${ABA}" não encontrada em ${ORIGEM}`);
const linhas = XLSX.utils.sheet_to_json(wb.Sheets[ABA], {
  header: 1,
  defval: null,
  blankrows: false,
});

/** Limpa célula: colapsa espaços e quebras, trim. null/'' => "". */
function limpar(v) {
  return v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
}
/** Preserva quebras de linha (endereçamento é multilinha), mas normaliza CRLF e apara. */
function limparMultilinha(v) {
  return v === null || v === undefined
    ? ""
    : String(v).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

const regras = [];
for (const l of linhas.slice(1)) {
  const cargo = limpar(l[0]);
  // Linha de seção: sem nominata (ex.: "Poder Legislativo").
  if (l[1] === null || limpar(l[1]).length === 0) continue;
  // Cabeçalho repetido no meio da aba.
  if (cargo === "Cargo do destinatário") continue;
  if (cargo.length === 0) continue;
  regras.push({
    cargoDestinatario: cargo,
    nominata: limparMultilinha(l[1]),
    vocativo: limparMultilinha(l[2]),
    pronome: limpar(l[3]),
    enderecamento: limparMultilinha(l[4]),
  });
}
if (regras.length === 0) throw new Error("nenhuma regra extraída — layout da aba mudou?");

const conteudo = `// Tabela de protocolo — FONTE DA VERDADE da auditoria de tratamento/endereçamento.
//
// Gerado por scripts/gerar-tratamentos.mjs a partir da aba "${ABA}" de
// Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx.
// Rode o gerador de novo se a planilha de protocolo mudar.
//
// Os textos são PADRÕES, não valores literais: contêm "(a)", alternativas com "ou" e " / ",
// feminino por extenso entre parênteses e os placeholders [Cargo], [Patente] e [Nome].
// A expansão para formas aceitas está em lib/tratamento.ts.
// Ver docs/superpowers/specs/2026-08-13-auditoria-tratamento-enderecamento.md
import type { RegraTratamento } from "@/lib/types";

export const REGRAS_TRATAMENTO: readonly RegraTratamento[] = [
${regras
  .map(
    (r) =>
      "  {\n" +
      `    cargoDestinatario: ${JSON.stringify(r.cargoDestinatario)},\n` +
      `    nominata: ${JSON.stringify(r.nominata)},\n` +
      `    vocativo: ${JSON.stringify(r.vocativo)},\n` +
      `    pronome: ${JSON.stringify(r.pronome)},\n` +
      `    enderecamento: ${JSON.stringify(r.enderecamento)},\n` +
      "  },",
  )
  .join("\n")}
];
`;

writeFileSync(path.join(root, "data", "tratamentos.ts"), conteudo, "utf8");
process.stdout.write(`data/tratamentos.ts gerado: ${regras.length} regras\n`);
```

- [ ] **Step 6: Rodar o gerador**

Run: `node scripts/gerar-tratamentos.mjs`
Expected: `data/tratamentos.ts gerado: 38 regras`

Número diferente de 38 → **pare**. O layout da aba mudou e o filtro precisa ser revisto antes
de seguir.

- [ ] **Step 7: Rodar o teste e confirmar que passa**

Run: `npx vitest run tests/tratamentos-dados.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts .gitignore scripts/gerar-tratamentos.mjs data/tratamentos.ts tests/tratamentos-dados.test.ts "Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx"
git commit -m "feat: tabela de protocolo versionada em data/tratamentos.ts"
```

---

### Task 2: Expansão das formas aceitas (`lib/tratamento.ts`)

O coração da funcionalidade, e a parte que mais precisa de teste: converter um **padrão** da
tabela no **conjunto de formas aceitáveis**, normalizadas.

**Files:**
- Create: `lib/tratamento.ts`
- Test: `tests/tratamento-expansao.test.ts`

**Interfaces:**
- Consumes: `normalizarTexto` de `@/lib/normalize`; `ContatoPlanilha` de `@/lib/types`
- Produces: `expandirFormas(padrao: string, contato: ContatoPlanilha): string[]` — formas normalizadas, sem repetição. `[]` significa **não expansível** (placeholder sem dado no contato)

- [ ] **Step 1: Escrever os testes (vão falhar)**

Crie `tests/tratamento-expansao.test.ts`. Cada caso vem de uma linha real da tabela:

```typescript
import { describe, expect, test } from "vitest";
import { expandirFormas } from "@/lib/tratamento";
import type { ContatoPlanilha } from "@/lib/types";

/** Contato mínimo; sobrescreva o que o caso precisar. */
function contato(extra: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Ana Maria Souza", grupo: "G", ...extra };
}

describe("expandirFormas — marcador de gênero", () => {
  test("sufixo em palavra terminada em o troca o 'o' pelo 'a'", () => {
    const formas = expandirFormas("Excelentíssimo(a) Senhor(a) Presidente", contato());
    expect(formas).toContain("excelentissimo senhor presidente");
    expect(formas).toContain("excelentissima senhora presidente");
  });

  test("sufixo em palavra que não termina em o apenas acrescenta o 'a'", () => {
    const formas = expandirFormas("Senhor(a) Embaixador(a)", contato());
    expect(formas).toContain("senhor embaixador");
    expect(formas).toContain("senhora embaixadora");
  });

  test("normalização absorve a irregularidade de Juiz(a)", () => {
    const formas = expandirFormas("Senhor(a) Juiz(a)", contato());
    expect(formas).toContain("senhor juiz");
    expect(formas).toContain("senhora juiza");
  });

  test("tolera a inconsistência da fonte (Excelentíssimo sem marcador)", () => {
    const formas = expandirFormas("Excelentíssimo Senhor(a) Governador(a)", contato());
    expect(formas).toContain("excelentissimo senhor governador");
    expect(formas).toContain("excelentissimo senhora governadora");
  });
});

describe("expandirFormas — alternativas", () => {
  test("alternativas separadas por 'ou' em linha isolada viram formas independentes", () => {
    const formas = expandirFormas(
      "Eminentíssimo Senhor Cardeal\nou\nEminentíssimo e Reverendíssimo Senhor Cardeal",
      contato(),
    );
    expect(formas).toContain("eminentissimo senhor cardeal");
    expect(formas).toContain("eminentissimo e reverendissimo senhor cardeal");
  });

  test("barra herda o prefixo da primeira alternativa", () => {
    // "Senhor(a) Ministro(a) / Conselheiro(a)" precisa aceitar "Senhora Conselheira",
    // e não só "Conselheira" solto.
    const formas = expandirFormas("Senhor(a) Ministro(a) / Conselheiro(a)", contato());
    expect(formas).toContain("senhor ministro");
    expect(formas).toContain("senhora conselheira");
  });

  test("barra com prefixo de duas palavras (Arcebispo / Bispo)", () => {
    const formas = expandirFormas("Reverendíssimo Senhor Arcebispo / Bispo", contato());
    expect(formas).toContain("reverendissimo senhor arcebispo");
    expect(formas).toContain("reverendissimo senhor bispo");
  });
});

describe("expandirFormas — feminino por extenso", () => {
  test("parêntese com palavra inteira gera alternativa, combinada com o gênero", () => {
    const formas = expandirFormas("Senhor(a) Cônsul (Consulesa)", contato());
    expect(formas).toContain("senhor consul");
    expect(formas).toContain("senhora consulesa");
  });
});

describe("expandirFormas — placeholders", () => {
  test("[Cargo] é substituído pelo cargo do contato", () => {
    const formas = expandirFormas("Senhor(a) [Cargo]", contato({ cargo: "Diretor-Geral" }));
    expect(formas).toContain("senhor diretor-geral");
    expect(formas).toContain("senhora diretor-geral");
  });

  test("[Patente] usa o cargo do contato", () => {
    const formas = expandirFormas("Senhor(a) [Patente]", contato({ cargo: "Coronel" }));
    expect(formas).toContain("senhor coronel");
  });

  test("placeholder sem cargo no contato devolve vazio (não auditável)", () => {
    expect(expandirFormas("Senhor(a) [Cargo]", contato())).toEqual([]);
  });

  test("[Nome] é substituído pelo nome do contato", () => {
    const formas = expandirFormas("A Sua Excelência o(a) Senhor(a)\n[Nome]", contato());
    expect(formas).toContain("a sua excelencia o senhor ana maria souza");
  });
});

describe("expandirFormas — higiene", () => {
  test("espaço sobrando na tabela não afeta o resultado", () => {
    const formas = expandirFormas("Excelentíssimo(a) Senhor(a) Presidente ", contato());
    expect(formas).toContain("excelentissimo senhor presidente");
  });

  test("quebras de linha do endereçamento viram espaço", () => {
    const formas = expandirFormas("A Sua Excelência\nPresidente\ndo Senado", contato());
    expect(formas).toContain("a sua excelencia presidente do senado");
  });

  test("não repete formas idênticas", () => {
    const formas = expandirFormas("Senhor Presidente", contato());
    expect(formas).toEqual(["senhor presidente"]);
  });

  test("padrão vazio devolve lista vazia", () => {
    expect(expandirFormas("   ", contato())).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/tratamento-expansao.test.ts`
Expected: FAIL — não resolve `@/lib/tratamento`.

- [ ] **Step 3: Implementar `lib/tratamento.ts`**

```typescript
import { normalizarTexto } from "@/lib/normalize";
import type { ContatoPlanilha } from "@/lib/types";

/**
 * Passo 1 — alternativas separadas por "ou" numa linha isolada.
 * Ex.: "Eminentíssimo Senhor Cardeal\nou\nEminentíssimo e Reverendíssimo Senhor Cardeal".
 */
function porOu(padrao: string): string[] {
  return padrao.split(/\r?\n\s*ou\s*\r?\n/i);
}

/**
 * Passo 2 — alternativas separadas por " / ". A barra troca só o final: em
 * "Senhor(a) Ministro(a) / Conselheiro(a)" a segunda forma é "Senhor(a) Conselheiro(a)",
 * não "Conselheiro(a)" solto. Por isso o prefixo da primeira alternativa é herdado.
 * A forma curta também entra, pelo viés permissivo declarado no spec.
 */
function porBarra(forma: string): string[] {
  const partes = forma.split(" / ").map((p) => p.trim()).filter((p) => p.length > 0);
  if (partes.length <= 1) return [forma];
  const [primeira, ...resto] = partes;
  const palavras = primeira.split(" ");
  const prefixo = palavras.slice(0, -1).join(" ");
  return [primeira, ...resto.flatMap((p) => (prefixo ? [`${prefixo} ${p}`, p] : [p]))];
}

/**
 * Passo 3 — marcador de gênero colado à palavra: `Senhor(a)`, `Ministro(a)`.
 * Palavra terminada em "o" troca o "o" por "a" (Ministro→Ministra); caso contrário
 * acrescenta (Senhor→Senhora). Irregularidades como Juiz(a)→"Juíza" são absorvidas
 * pela normalização, que remove acentos.
 */
function porGenero(forma: string): string[] {
  const i = forma.indexOf("(a)");
  if (i === -1) return [forma];
  const antes = forma.slice(0, i);
  const depois = forma.slice(i + 3);
  const m = antes.match(/(\S+)$/);
  if (!m) return porGenero(antes + depois); // "(a)" solto: descarta o marcador
  const palavra = m[1];
  const base = antes.slice(0, antes.length - palavra.length);
  const feminino = palavra.endsWith("o") ? `${palavra.slice(0, -1)}a` : `${palavra}a`;
  return [
    ...porGenero(base + palavra + depois),
    ...porGenero(base + feminino + depois),
  ];
}

/**
 * Passo 4 — feminino por extenso: ` (Consulesa)` precedido de espaço, com palavra
 * inteira dentro dos parênteses. Distingue-se do passo 3 porque o marcador `(a)` vem
 * colado à palavra, sem espaço.
 */
function porParenteses(forma: string): string[] {
  const m = forma.match(/(\S+) \(([^)]+)\)/);
  if (!m) return [forma];
  const [inteiro, palavra, alternativa] = m;
  return [
    ...porParenteses(forma.replace(inteiro, palavra)),
    ...porParenteses(forma.replace(inteiro, alternativa)),
  ];
}

/**
 * Passo 5 — placeholders vindos do próprio contato. `[Cargo]` e `[Patente]` usam o campo
 * `cargo`; `[Nome]`, o campo `nome`. Placeholder sem dado correspondente devolve
 * `undefined`: o caso é **não auditável**, e vira `sem_regra` — nunca divergente.
 */
function substituirMarcadores(forma: string, contato: ContatoPlanilha): string | undefined {
  let resultado = forma;
  if (/\[(Cargo|Patente)\]/.test(resultado)) {
    if (!contato.cargo) return undefined;
    resultado = resultado.replace(/\[(Cargo|Patente)\]/g, contato.cargo);
  }
  if (resultado.includes("[Nome]")) {
    resultado = resultado.replace(/\[Nome\]/g, contato.nome);
  }
  return resultado;
}

/**
 * Expande um padrão da tabela de protocolo no conjunto de formas aceitas, normalizadas.
 * Lista vazia significa **não expansível** (padrão vazio, ou placeholder sem dado no
 * contato) — o chamador deve tratar como `sem_regra`, não como divergência.
 */
export function expandirFormas(padrao: string, contato: ContatoPlanilha): string[] {
  const formas = porOu(padrao)
    .flatMap(porBarra)
    .flatMap(porGenero)
    .flatMap(porParenteses)
    .map((f) => substituirMarcadores(f, contato))
    .filter((f): f is string => f !== undefined)
    .map(normalizarTexto)
    .filter((f) => f.length > 0);
  return [...new Set(formas)];
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/tratamento-expansao.test.ts`
Expected: PASS (16 testes)

- [ ] **Step 5: Commit**

```bash
git add lib/tratamento.ts tests/tratamento-expansao.test.ts
git commit -m "feat: expansão de padrões de protocolo em formas aceitas"
```

---

### Task 3: Resolução de cargo e comparações de protocolo

**Files:**
- Modify: `lib/tratamento.ts` (acrescenta resolução e comparação)
- Create: `data/cargos-tratamento.ts`
- Test: `tests/tratamento-comparacao.test.ts`

**Interfaces:**
- Consumes: `expandirFormas` (Task 2); `REGRAS_TRATAMENTO` de `@/data/tratamentos` (Task 1); `RegraTratamento`, `ComparacaoCampo`, `ContatoPlanilha` de `@/lib/types`; `compareTwoStrings` de `string-similarity`
- Produces:
  - `EXCECOES_CARGO: Readonly<Record<string, string>>` em `@/data/cargos-tratamento`
  - `resolverRegra(cargo?: string, regras?: readonly RegraTratamento[], excecoes?: Readonly<Record<string, string>>): RegraTratamento | undefined`
  - `comparacoesProtocolo(contato: ContatoPlanilha, regras?: readonly RegraTratamento[]): ComparacaoCampo[]` — sempre 2 entradas (`tratamento` e `enderecamento`)

> **Depende da Task 4** para os valores `"sem_regra"` e `"protocolo"` e para o campo
> `valorEsperado`. Execute a Task 4 antes desta se estiver seguindo fora de ordem.

- [ ] **Step 1: Criar `data/cargos-tratamento.ts`**

Mapa **vazio de propósito**: não invento correspondência de protocolo. Ele cresce a partir dos
cargos que a análise reportar como `sem_regra`.

```typescript
/**
 * Exceções de casamento cargo → tabela de protocolo.
 *
 * Chave: o cargo **como aparece na planilha** do Sistema Contatos, normalizado
 * (minúsculas, sem acento — o mesmo que `normalizarTexto` produz).
 * Valor: o `cargoDestinatario` exato de uma entrada de `data/tratamentos.ts`.
 *
 * A exceção tem precedência sobre o casamento exato e sobre a similaridade. Serve para
 * quando a taxonomia da planilha não bate com a da tabela — por exemplo, se "Ministro do STF"
 * precisar cair em "Ministro de Tribunal Superior".
 *
 * Começa vazio de propósito: cada entrada é uma decisão de cerimonial e deve ser confirmada
 * pelo Clovis, não adivinhada. Para descobrir o que falta, rode uma análise e veja os campos
 * marcados como "sem regra" — eles listam exatamente os cargos ainda não mapeados.
 *
 * Exemplo de entrada:
 *   "ministro do stf": "Ministro de Tribunal Superior",
 */
export const EXCECOES_CARGO: Readonly<Record<string, string>> = {};
```

- [ ] **Step 2: Escrever os testes (vão falhar)**

Crie `tests/tratamento-comparacao.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { resolverRegra, comparacoesProtocolo } from "@/lib/tratamento";
import type { ContatoPlanilha, RegraTratamento } from "@/lib/types";

function regra(cargoDestinatario: string, vocativo: string, enderecamento = ""): RegraTratamento {
  return { cargoDestinatario, nominata: "", vocativo, pronome: "", enderecamento };
}

const REGRAS: RegraTratamento[] = [
  regra("Ministro de Tribunal Superior", "Senhor(a) Ministro(a)", "A Sua Excelência o(a) Senhor(a)\n[Nome]\nMinistro(a)"),
  regra("Governador", "Excelentíssimo Senhor(a) Governador(a)"),
  regra("Presidente do Congresso Nacional / Senado Federal", "Excelentíssimo(a) Senhor(a) Presidente"),
];

function contato(extra: Partial<ContatoPlanilha> = {}): ContatoPlanilha {
  return { nome: "Ana Maria Souza", grupo: "G", ...extra };
}

describe("resolverRegra", () => {
  test("casa exatamente pelo nome normalizado", () => {
    expect(resolverRegra("governador", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("tolera acento e caixa", () => {
    expect(resolverRegra("GOVERNADOR", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("casa uma das alternativas separadas por barra no nome do cargo", () => {
    // Casamento exato contra a alternativa "Senado Federal" — determinístico, sem depender
    // do limiar de similaridade.
    const r = resolverRegra("Senado Federal", REGRAS, {});
    expect(r?.cargoDestinatario).toBe("Presidente do Congresso Nacional / Senado Federal");
  });

  test("similaridade cobre variação de gênero no cargo da planilha", () => {
    // "Governadora" × "Governador": bigramas quase idênticos, bem acima do limiar.
    expect(resolverRegra("Governadora", REGRAS, {})?.cargoDestinatario).toBe("Governador");
  });

  test("exceção manual tem precedência sobre similaridade", () => {
    const r = resolverRegra("Ministro do STF", REGRAS, { "ministro do stf": "Ministro de Tribunal Superior" });
    expect(r?.cargoDestinatario).toBe("Ministro de Tribunal Superior");
  });

  test("cargo ausente devolve undefined", () => {
    expect(resolverRegra(undefined, REGRAS, {})).toBeUndefined();
  });

  test("cargo sem correspondência plausível devolve undefined", () => {
    expect(resolverRegra("Zelador do Anexo II", REGRAS, {})).toBeUndefined();
  });
});

describe("comparacoesProtocolo", () => {
  test("tratamento correto confere, com origem protocolo", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Excelentíssimo Senhor Governador" }),
      REGRAS,
    );
    expect(t.campo).toBe("tratamento");
    expect(t.situacao).toBe("confere");
    expect(t.origemValor).toBe("protocolo");
  });

  test("forma feminina também confere", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Excelentíssimo Senhora Governadora" }),
      REGRAS,
    );
    expect(t.situacao).toBe("confere");
  });

  test("tratamento errado diverge e informa a forma esperada", () => {
    const [t] = comparacoesProtocolo(
      contato({ cargo: "Governador", tratamento: "Senhor Governador" }),
      REGRAS,
    );
    expect(t.situacao).toBe("divergente");
    expect(t.valorEsperado).toBe("Excelentíssimo Senhor(a) Governador(a)");
  });

  test("campo vazio com regra existente é divergente, não ausência de informação", () => {
    const [t] = comparacoesProtocolo(contato({ cargo: "Governador" }), REGRAS);
    expect(t.situacao).toBe("divergente");
    expect(t.valorPlanilha).toBe("");
  });

  test("cargo não mapeado vira sem_regra, nunca divergente", () => {
    const comps = comparacoesProtocolo(
      contato({ cargo: "Zelador do Anexo II", tratamento: "Qualquer coisa" }),
      REGRAS,
    );
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("contato sem cargo vira sem_regra", () => {
    const comps = comparacoesProtocolo(contato({ tratamento: "Senhor Fulano" }), REGRAS);
    expect(comps.map((c) => c.situacao)).toEqual(["sem_regra", "sem_regra"]);
  });

  test("endereçamento substitui [Nome] e confere", () => {
    const [, e] = comparacoesProtocolo(
      contato({
        cargo: "Ministro de Tribunal Superior",
        enderecamento: "A Sua Excelência o Senhor Ana Maria Souza Ministro",
      }),
      REGRAS,
    );
    expect(e.campo).toBe("enderecamento");
    expect(e.situacao).toBe("confere");
  });

  test("regra sem endereçamento cadastrado vira sem_regra nesse campo", () => {
    const [, e] = comparacoesProtocolo(
      contato({ cargo: "Governador", enderecamento: "Qualquer coisa" }),
      REGRAS,
    );
    expect(e.situacao).toBe("sem_regra");
  });

  test("devolve sempre as duas comparações, na ordem tratamento, enderecamento", () => {
    const comps = comparacoesProtocolo(contato({ cargo: "Governador" }), REGRAS);
    expect(comps.map((c) => c.campo)).toEqual(["tratamento", "enderecamento"]);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx vitest run tests/tratamento-comparacao.test.ts`
Expected: FAIL — `resolverRegra` e `comparacoesProtocolo` não existem.

- [ ] **Step 4: Implementar no fim de `lib/tratamento.ts`**

Ajuste os imports no topo do arquivo. `string-similarity` é **import default** neste projeto
(veja `lib/match.ts:1`), não namespace. E o import de tipos já existe desde a Task 2 — **amplie
a linha existente**, não crie uma segunda:

```typescript
import stringSimilarity from "string-similarity";
import { normalizarTexto } from "@/lib/normalize";
import { REGRAS_TRATAMENTO } from "@/data/tratamentos";
import { EXCECOES_CARGO } from "@/data/cargos-tratamento";
import type { ComparacaoCampo, ContatoPlanilha, RegraTratamento } from "@/lib/types";
```

E ao final:

```typescript
/** Abaixo disso o cargo é considerado não correspondente — vira `sem_regra`. */
const LIMIAR_CARGO = 0.6;

/**
 * Nomes candidatos de uma regra: primeira linha (o resto são notas explicativas entre
 * parênteses) e cada alternativa separada por " / ".
 * "Presidente do Congresso Nacional / Senado Federal" também casa "Presidente do Senado Federal":
 * a barra troca o final, herdando o prefixo — mesma regra da expansão de vocativo.
 */
function nomesCandidatos(regra: RegraTratamento): string[] {
  const primeira = regra.cargoDestinatario.split("\n")[0].trim();
  const partes = primeira.split(" / ").map((p) => p.trim()).filter((p) => p.length > 0);
  if (partes.length <= 1) return [primeira];
  const palavras = partes[0].split(" ");
  const prefixo = palavras.slice(0, -1).join(" ");
  return [
    partes[0],
    ...partes.slice(1).flatMap((p) => (prefixo ? [`${prefixo} ${p}`, p] : [p])),
  ];
}

/**
 * Resolve o `Cargo` livre da planilha para uma entrada da tabela de protocolo.
 * Ordem: exceção manual → casamento exato normalizado → similaridade acima do limiar.
 * Nada correspondendo devolve `undefined` — o chamador marca `sem_regra`.
 */
export function resolverRegra(
  cargo?: string,
  regras: readonly RegraTratamento[] = REGRAS_TRATAMENTO,
  excecoes: Readonly<Record<string, string>> = EXCECOES_CARGO,
): RegraTratamento | undefined {
  if (!cargo) return undefined;
  const alvo = normalizarTexto(cargo);
  if (alvo.length === 0) return undefined;

  const excecao = excecoes[alvo];
  if (excecao) {
    const norm = normalizarTexto(excecao);
    return regras.find((r) => normalizarTexto(r.cargoDestinatario) === norm);
  }

  const exata = regras.find((r) =>
    nomesCandidatos(r).some((n) => normalizarTexto(n) === alvo),
  );
  if (exata) return exata;

  const pontuadas = regras.map((r) => ({
    regra: r,
    score: Math.max(
      ...nomesCandidatos(r).map((n) => stringSimilarity.compareTwoStrings(alvo, normalizarTexto(n))),
    ),
  }));
  const melhor = pontuadas.sort((a, b) => b.score - a.score)[0];
  return melhor && melhor.score >= LIMIAR_CARGO ? melhor.regra : undefined;
}

/** Monta uma comparação de protocolo para um campo, dado o padrão da tabela. */
function compararCampoProtocolo(
  campo: "tratamento" | "enderecamento",
  valorPlanilha: string,
  padrao: string | undefined,
  contato: ContatoPlanilha,
): ComparacaoCampo {
  const semRegra: ComparacaoCampo = {
    campo,
    valorPlanilha,
    situacao: "sem_regra",
    origemValor: "protocolo",
  };
  if (!padrao || padrao.trim().length === 0) return semRegra;

  const aceitas = expandirFormas(padrao, contato);
  if (aceitas.length === 0) return semRegra; // placeholder sem dado no contato

  const situacao = aceitas.includes(normalizarTexto(valorPlanilha)) ? "confere" : "divergente";
  return {
    campo,
    valorPlanilha,
    // A forma canônica da tabela orienta melhor que uma das variantes expandidas.
    valorEsperado: padrao,
    situacao,
    origemValor: "protocolo",
  };
}

/**
 * Auditoria de protocolo de um contato: tratamento (↔ vocativo epistolar) e endereçamento.
 * Independe do site — roda mesmo quando não há fonte oficial ou ela está inacessível.
 * Devolve sempre as duas comparações, nesta ordem, para que a cobertura seja visível:
 * `sem_regra` informa ao usuário quais cargos ainda faltam mapear.
 */
export function comparacoesProtocolo(
  contato: ContatoPlanilha,
  regras: readonly RegraTratamento[] = REGRAS_TRATAMENTO,
): ComparacaoCampo[] {
  const regra = resolverRegra(contato.cargo, regras);
  return [
    compararCampoProtocolo("tratamento", contato.tratamento ?? "", regra?.vocativo, contato),
    compararCampoProtocolo("enderecamento", contato.enderecamento ?? "", regra?.enderecamento, contato),
  ];
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npx vitest run tests/tratamento-comparacao.test.ts`
Expected: PASS (17 testes)

- [ ] **Step 6: Commit**

```bash
git add lib/tratamento.ts data/cargos-tratamento.ts tests/tratamento-comparacao.test.ts
git commit -m "feat: resolução de cargo e comparações de protocolo"
```

---

### Task 4: Contrato — `sem_regra`, `protocolo` e `valorEsperado`

Refatoração mecânica e isolada: nenhum comportamento muda, a suíte inteira continua verde. Faça
antes da Task 3 se estiver executando fora de ordem.

**Files:**
- Modify: `lib/types.ts:50,56`
- Modify: `lib/match.ts` (todas as ocorrências de `valorSite`)
- Modify: `lib/export.ts:12-19`
- Modify: `components/resultado-tabela.tsx:81`
- Modify: `tests/export.test.ts`, `tests/match.test.ts`

- [ ] **Step 1: Ampliar as uniões em `lib/types.ts`**

```typescript
/**
 * `fonte_nao_informa` = o site não publica esse campo.
 * `sem_regra` = não há regra de protocolo aplicável (cargo não mapeado, ou contato sem cargo).
 * São coisas diferentes: a primeira é limite da fonte, a segunda é limite do cadastro de regras.
 */
export type SituacaoCampo = "confere" | "divergente" | "fonte_nao_informa" | "sem_regra";

/** Procedência do valor esperado: página oficial, conhecimento da IA, ou tabela de protocolo. */
export type OrigemDado = "pagina" | "conhecimento" | "protocolo";
```

- [ ] **Step 2: Renomear `valorSite` para `valorEsperado` em `ComparacaoCampo`**

Em `lib/types.ts`:

```typescript
  /** Valor correto — do site, da IA ou da tabela de protocolo. Ausente quando não há referência. */
  valorEsperado?: string;
```

- [ ] **Step 3: Propagar o nome no restante do código**

Run: `grep -rn "valorSite" lib app components tests --include=*.ts --include=*.tsx`

Renomeie todas as ocorrências para `valorEsperado`, incluindo a função local
`valorSiteDe` → `valorEsperadoDe` em `lib/export.ts` e o parâmetro `valorSite` de
`situacaoCampo` em `lib/match.ts`. São 21 ocorrências em 5 arquivos.

- [ ] **Step 4: Rodar a suíte — deve continuar verde**

Run: `npm test`
Expected: todos os testes passam. Esta task não muda comportamento; qualquer falha significa
que o rename quebrou algo e precisa ser corrigido antes de seguir.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/match.ts lib/export.ts components/resultado-tabela.tsx tests/export.test.ts tests/match.test.ts
git commit -m "refactor: valorSite vira valorEsperado; situações sem_regra e origem protocolo"
```

---

### Task 5: Integrar a auditoria de protocolo em `lib/match.ts`

**Files:**
- Modify: `lib/match.ts` (4 construtores de `ResultadoContato`)
- Test: `tests/match-protocolo.test.ts`

**Interfaces:**
- Consumes: `comparacoesProtocolo` de `@/lib/tratamento` (Task 3)

- [ ] **Step 1: Escrever os testes (vão falhar)**

Crie `tests/match-protocolo.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { compararGrupo, marcarFonteInacessivel } from "@/lib/match";
import type { ContatoPlanilha, ConteudoFonte } from "@/lib/types";

const contatoBase: ContatoPlanilha = {
  nome: "Ana Maria Souza",
  grupo: "G",
  cargo: "Governador",
  tratamento: "Senhor Governador", // errado: o correto começa com "Excelentíssimo"
};

const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Souza, Governador.",
  destaques: [],
  pessoas: [{ nome: "Ana Maria Souza", cargo: "Governador", origem: "pagina" }],
};

describe("auditoria de protocolo integrada ao match", () => {
  test("contato casado ganha as comparações de tratamento e endereçamento", () => {
    const g = compararGrupo("G", [contatoBase], fonte);
    const campos = g.contatos[0].comparacoes.map((c) => c.campo);
    expect(campos).toContain("tratamento");
    expect(campos).toContain("enderecamento");
  });

  test("divergência de protocolo deixa o semáforo amarelo, não vermelho", () => {
    const g = compararGrupo("G", [contatoBase], fonte);
    expect(g.contatos[0].semaforo).toBe("amarelo");
  });

  test("grupo sem fonte também recebe auditoria de protocolo", () => {
    const g = compararGrupo("G", [contatoBase], undefined);
    const campos = g.contatos[0].comparacoes.map((c) => c.campo);
    expect(campos).toEqual(["tratamento", "enderecamento"]);
  });

  test("grupo sem fonte mantém o semáforo vermelho existente", () => {
    const g = compararGrupo("G", [contatoBase], undefined);
    expect(g.contatos[0].semaforo).toBe("vermelho");
  });

  test("fonte inacessível recebe auditoria de protocolo e segue indeterminada", () => {
    const g = marcarFonteInacessivel("G", [contatoBase], "https://x", "timeout");
    expect(g.contatos[0].comparacoes.map((c) => c.campo)).toEqual(["tratamento", "enderecamento"]);
    expect(g.contatos[0].semaforo).toBe("indeterminado");
  });

  test("possível saída recebe auditoria de protocolo e segue vermelho", () => {
    const semPessoa: ConteudoFonte = { ...fonte, pessoas: [] };
    const g = compararGrupo("G", [contatoBase], semPessoa);
    expect(g.contatos[0].possivelSaida).toBe(true);
    expect(g.contatos[0].semaforo).toBe("vermelho");
    expect(g.contatos[0].comparacoes.map((c) => c.campo)).toContain("tratamento");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/match-protocolo.test.ts`
Expected: FAIL — as comparações de protocolo ainda não são acrescentadas.

- [ ] **Step 3: Importar em `lib/match.ts`**

```typescript
import { comparacoesProtocolo } from "@/lib/tratamento";
```

- [ ] **Step 4: Acrescentar no caminho da pessoa casada**

Em `montarResultado`, logo antes da linha `const camposDivergentes: CampoDivergente[] = ...`:

```typescript
  // Auditoria de protocolo: independe do site (deriva do cargo pela tabela de cerimonial).
  comparacoes.push(...comparacoesProtocolo(contato));
```

Nada mais muda aqui: `camposDivergentes` e o semáforo já derivam de `comparacoes`, então uma
divergência de protocolo produz amarelo automaticamente.

- [ ] **Step 5: Acrescentar no caminho de possível saída**

No início de `montarResultado`, o bloco `if (!pessoa)` passa a:

```typescript
  if (!pessoa) {
    return {
      contato,
      semaforo: "vermelho",
      score,
      // A auditoria de protocolo vale mesmo para quem saiu: não depende da fonte.
      comparacoes: comparacoesProtocolo(contato),
      camposDivergentes: [{ campo: "nome", valorPlanilha: contato.nome }],
      possivelSaida: true,
      origem: "oficial",
      fonteUrl: url,
      observacao: "Não consta na fonte (possível saída)",
    };
  }
```

- [ ] **Step 6: Acrescentar em `marcarFonteInacessivel`**

Troque `comparacoes: [],` por:

```typescript
      // A página não pôde ser lida, mas a regra de protocolo continua verificável.
      comparacoes: comparacoesProtocolo(c),
```

O semáforo continua `"indeterminado"`: ele descreve a verificação contra o site, que de fato
não aconteceu.

- [ ] **Step 7: Acrescentar no caminho de grupo sem fonte**

Em `compararGrupo`, no bloco `if (!fonte)`, troque `comparacoes: [],` por:

```typescript
        // Sem URL cadastrada não há o que comparar com o site — mas o protocolo é auditável.
        comparacoes: comparacoesProtocolo(c),
```

O semáforo continua `"vermelho"` e a observação "Grupo sem fonte oficial cadastrada" segue
válida.

- [ ] **Step 8: Rodar os testes novos**

Run: `npx vitest run tests/match-protocolo.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 9: Rodar a suíte completa**

Run: `npm test`
Expected: tudo verde. Testes existentes de `match` que contam entradas em `comparacoes` podem
precisar de ajuste — agora há 2 entradas a mais por contato. Ajuste a **contagem esperada**,
nunca o comportamento.

- [ ] **Step 10: Commit**

```bash
git add lib/match.ts tests/match-protocolo.test.ts tests/match.test.ts
git commit -m "feat: auditoria de protocolo nos quatro caminhos de resultado"
```

---

### Task 6: Exportação e interface

**Files:**
- Modify: `lib/export.ts`
- Modify: `components/resultado-tabela.tsx`
- Test: `tests/export.test.ts`

- [ ] **Step 1: Escrever o teste de exportação (vai falhar)**

Acrescente a `tests/export.test.ts`:

```typescript
test("coluna de protocolo é rotulada como (protocolo), não (site)", () => {
  const linhas = resultadoParaLinhas({
    arquivoNome: "c.xlsx",
    grupos: [
      {
        grupo: "G",
        semFonte: false,
        novos: [],
        contatos: [
          {
            contato: { nome: "Ana", grupo: "G" },
            semaforo: "amarelo",
            score: 1,
            comparacoes: [
              {
                campo: "tratamento",
                valorPlanilha: "Senhor Governador",
                valorEsperado: "Excelentíssimo Senhor(a) Governador(a)",
                situacao: "divergente",
                origemValor: "protocolo",
              },
            ],
            camposDivergentes: [],
            origem: "oficial",
          },
        ],
      },
    ],
    resumo: {
      total: 1,
      verde: 0,
      amarelo: 1,
      vermelho: 0,
      novo: 0,
      indeterminado: 0,
      gruposSemFonte: 0,
      gruposFonteInacessivel: 0,
      gruposViaPesquisaAmpla: 0,
    },
  });
  expect(linhas[0]["Tratamento (protocolo)"]).toBe("Excelentíssimo Senhor(a) Governador(a)");
  expect(linhas[0]["Tratamento (planilha)"]).toBe("Senhor Governador");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run tests/export.test.ts`
Expected: FAIL — a coluna `Tratamento (protocolo)` não existe.

- [ ] **Step 3: Ajustar `lib/export.ts`**

Acrescente os dois campos e faça o rótulo da segunda coluna depender da procedência:

```typescript
/** Campos mostrados em pares de colunas planilha × referência. */
const CAMPOS = [
  { campo: "nome", rotulo: "Nome" },
  { campo: "cargo", rotulo: "Cargo" },
  { campo: "endereco", rotulo: "Endereço" },
  { campo: "tratamento", rotulo: "Tratamento" },
  { campo: "enderecamento", rotulo: "Endereçamento" },
];

/** Sufixo da coluna de referência: de onde veio o valor esperado. */
function sufixoDe(c: ResultadoContato, campo: string): string {
  return c.comparacoes.find((x) => x.campo === campo)?.origemValor === "protocolo"
    ? "protocolo"
    : "site";
}

/** Valor de referência: valor correto (com origem), aviso de ausência, ou vazio. */
function valorEsperadoDe(c: ResultadoContato, campo: string): string {
  const comp = c.comparacoes.find((x) => x.campo === campo);
  if (!comp) return "";
  if (comp.situacao === "fonte_nao_informa") return "fonte não informa";
  if (comp.situacao === "sem_regra") return "sem regra de protocolo";
  const v = comp.valorEsperado ?? "";
  return v && comp.origemValor === "conhecimento" ? `${v} (via IA — confira)` : v;
}
```

E no laço que monta as colunas:

```typescript
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = valorPlanilhaDe(c, f.campo);
        linha[`${f.rotulo} (${sufixoDe(c, f.campo)})`] = valorEsperadoDe(c, f.campo);
      }
```

No bloco de `novos`, acrescente as duas colunas vazias para manter as linhas homogêneas:

```typescript
        "Tratamento (planilha)": "",
        "Tratamento (site)": "",
        "Endereçamento (planilha)": "",
        "Endereçamento (site)": "",
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run tests/export.test.ts`
Expected: PASS

- [ ] **Step 5: Exibir a nova situação na tabela**

Em `components/resultado-tabela.tsx:81`, o texto do detalhe usa
`d.valorSite ?? "fonte não informa"`. Após o rename da Task 4 ele já é `d.valorEsperado`.
Troque a expressão por uma que distinga as duas ausências:

```tsx
                                  `${d.campo}: ${d.valorPlanilha} → ${
                                    d.valorEsperado ?? "sem referência"
                                  }` +
```

- [ ] **Step 6: Suíte completa, typecheck e build**

Run: `npm test && npm run typecheck && npm run build`
Expected: tudo verde.

- [ ] **Step 7: Commit**

```bash
git add lib/export.ts components/resultado-tabela.tsx tests/export.test.ts
git commit -m "feat: colunas de tratamento e endereçamento na exportação e na tela"
```

---

### Task 7: Verificação local e levantamento dos cargos não mapeados

O `data/cargos-tratamento.ts` nasce vazio de propósito. Esta task descobre, com dados reais, o
que precisa entrar nele — e entrega essa lista ao Clovis.

**Files:** nenhum — é verificação.

- [ ] **Step 1: Subir o servidor**

Run: `npm run dev`
Expected: `Ready`, sem aviso de variável faltando.

- [ ] **Step 2: Rodar uma análise real**

Abra `http://localhost:3000`, suba uma planilha do Sistema Contatos e rode a análise.

- [ ] **Step 3: Conferir a auditoria de protocolo na tela**

Confira que:
- as linhas de contato passaram a mostrar `tratamento` e `enderecamento` nas comparações;
- contatos com cargo reconhecido mostram "confere" ou "divergente" com a forma esperada;
- contatos com cargo não reconhecido mostram "sem regra" — **nunca** "divergente".

- [ ] **Step 4: Exportar e conferir as colunas**

Exporte em XLSX. Devem existir `Tratamento (planilha)` e `Tratamento (protocolo)` (ou
`(site)` quando não houver comparação de protocolo naquela linha), idem para `Endereçamento`.

- [ ] **Step 5: Levantar os cargos sem regra**

Na exportação, filtre as linhas cuja coluna de protocolo diga "sem regra de protocolo" e
levante os valores distintos de `Cargo (planilha)`. Essa é a lista de cargos que precisam de
entrada em `data/cargos-tratamento.ts`.

- [ ] **Step 6: Entregar a lista ao Clovis**

Apresente os cargos distintos sem regra, com a contagem de contatos afetados por cargo, e
pergunte a que `cargoDestinatario` da tabela cada um corresponde. **Não preencha o mapa por
conta própria:** cada entrada é uma decisão de cerimonial.

---

## Pós-implementação

1. Preencher `data/cargos-tratamento.ts` com as correspondências que o Clovis confirmar e rodar
   a análise de novo para medir a cobertura.
2. Avaliar, com dados reais em mãos, se o viés permissivo da expansão está deixando passar
   erros que deveriam ser pegos — e ajustar o `LIMIAR_CARGO` se o casamento por similaridade
   estiver produzindo correspondências ruins.
