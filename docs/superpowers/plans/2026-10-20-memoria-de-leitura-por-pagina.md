# Memória de leitura por página — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda página oficial lida com sucesso fica guardada no retrato local por URL, com data; a varredura sempre lê de novo e, só na falha total ou na leitura parcial, usa a guardada (válida por 7 dias), sem chamar a IA; o grupo sai lido, com cabeçalho "Leitura de DD/MM reaproveitada", e não trava a publicação.

**Architecture:** Um módulo puro novo, `lib/memoria-leitura.ts`, decide validade, poda, mescla e reconstrução da memória. O orquestrador `lib/analise.ts` recebe a memória por `Dependencias.leiturasAnteriores` e um relógio por `Dependencias.agora`, substitui a leitura que falhou pela guardada dentro da leitura de cada fonte (`lerFonte`), e devolve `leituras` no resultado. A rota lê o retrato anterior, injeta a memória e grava o retrato novo com ela; a web e o navegador nunca recebem `leituras`. Tela, export e catálogo recebem só texto e um campo.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Vitest. Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-10-20-memoria-de-leitura-por-pagina-design.md` (ler antes de qualquer tarefa; "§" abaixo refere-se a ela). A spec irmã `2026-10-23-leitura-resiliente-e-revisao-do-catalogo-design.md` **não** faz parte deste plano.

## Global Constraints

- `lib/*.ts` são funções puras: sem JSX, sem `window`, sem rede fora de `lib/scrape.ts` e `lib/navegador.ts`. Toda função de `lib/` devolve objeto novo; nunca muta a entrada.
- **Sem PII no log nem no prompt.** Nome de contato nunca vai para `console.*`, `erroFonte`, `reaproveitada.motivo` nem para a IA. A memória guarda só dados públicos das páginas (§4.3).
- **Regra de ouro:** "possível saída" só com composição real. Leitura reaproveitada é composição real (página oficial de até 7 dias). Memória vencida ou ausente deixa o comportamento exatamente como hoje.
- A IA (`extrairComposicao`) **não roda** quando a primária do grupo foi reaproveitada (§5.1, passo 5).
- Validade: `agora - lidaEm <= 7 dias`, inclusive (`VALIDADE_LEITURA_DIAS = 7`). Leitura parcial: `casados / contatos < 0.5` em grupo com 2 ou mais contatos (`FRACAO_MINIMA_CASADA = 0.5`, `MIN_CONTATOS_LEITURA_PARCIAL = 2`).
- Procedência de valor de página na reconstrução: `origemValor` igual a `"pagina"` **ou ausente** (§5.4); `"conhecimento"`, `"coerencia"` e `"protocolo"` ficam fora.
- Nenhum teste lê disco (fora de `tests/fixtures/`) nem acessa a rede; memória e relógio são injetados.
- Comentários, nomes, textos de UI e mensagens de commit em português, no padrão do código. Commits `<tipo>: <descrição>` terminados com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nunca `git add -A`: só os arquivos da tarefa.
- Antes de cada commit: testes do(s) arquivo(s) tocado(s) verdes; ao fim de cada tarefa, `npm test` inteiro verde e `npm run typecheck` limpo.

## Decisões do plano (ajustes registrados na spec em 23/10)

- `Dependencias.leiturasAnteriores?: LeiturasGuardadas` (o mapa inteiro), e não uma função por URL: `analisar` devolve a memória já mesclada e podada (§6, passo 3).
- `individuais.reaproveitadas` é opcional e só aparece quando maior que zero: retrato antigo não o traz, e os testes existentes comparam `individuais` com `toEqual({ lidas, caidas })`.
- Em grupo com individuais, a lista geral reaproveitada marca também `reaproveitada` no grupo (ela é a `fonteUrl` do grupo).
- `leituras` sempre sai de `analisar`, mesmo sem memória injetada (`{}` + as boas de hoje): a primeira varredura com o código novo já constrói a memória.
- O motivo "não trouxe ninguém" passa a constante `MOTIVO_SEM_NINGUEM` em `lib/memoria-leitura.ts`, importada por `lib/analise.ts` (substitui a local `MOTIVO_FONTE_VAZIA`), para a tela saber descrevê-lo sem importar `lib/analise.ts` (que puxa cheerio para o cliente).

## Review Focus

1. **Guardada cuja composição não casa nenhum contato** (grupo que trocou toda a composição em 7 dias): a regra de leitura suspeita continua valendo sobre a composição reaproveitada; o grupo sai inacessível com `MOTIVO_LEITURA_SUSPEITA`, nunca saída em massa. Teste na Task 2 ("guardada que não casa ninguém cai na leitura suspeita").
2. **`leituras` com forma estranha no retrato** (string, lista, entrada sem `conteudo`): nada quebra; a entrada ruim é descartada e a varredura segue. Teste na Task 1 ("podarLeituras descarta entrada com forma inválida e `lidaEm` ilegível").
3. **Secundária que falhou com memória e primária boa**: a anotação entra em `erroFonte`, `leituraParcial` não dispara (a reaproveitada contribuiu) e quem só constava na secundária continua casando. Teste na Task 2 ("secundária com erro e memória").
4. **Grupo de um contato com página que não o traz e memória que traz**: não é parcial; a leitura de hoje vale e é possível saída. Teste na Task 2 ("grupo de um contato nunca é parcial").
5. **Página individual reaproveitada e guarda de grupo**: duas individuais lidas hoje sem confirmar ninguém, mais reaproveitadas confirmando, é leitura suspeita (a guarda conta só as lidas hoje); uma lida hoje mais reaproveitadas não é. Teste na Task 3 ("guarda de grupo conta só as páginas lidas hoje").

---

### Task 1: Tipos, `lib/memoria-leitura.ts` e `contarContatosCasados`

**Files:**
- Modify: `lib/types.ts` (`ConteudoFonte` já existe; acrescentar tipos e campos)
- Create: `lib/memoria-leitura.ts`
- Modify: `lib/match.ts` (função nova ao lado de `mesclarComposicao`)
- Modify: `tests/armazem.test.ts:11-15`, `tests/eleitos.test.ts:181,219`, `tests/export.test.ts` (dois `resumo`), `tests/painel.test.ts` (onde houver `gruposViaPesquisaAmpla:`): acrescentar `gruposReaproveitados: 0`
- Test: `tests/memoria-leitura.test.ts` (novo), `tests/match.test.ts`

**Interfaces:**
- Produces: `LeituraGuardada`, `LeiturasGuardadas`, `Reaproveitamento`; `leituraValida(l, agora)`, `ehLeituraParcial(casados, total)`, `motivoLeituraParcial(casados, total)`, `diaMes(iso)`, `anotacaoReaproveitada(r)`, `descreverMotivoDeHoje(motivo)`, `ehLeituraGuardada(v)`, `podarLeituras(v, agora)`, `mesclarLeituras(anteriores, colhidas, agora)`, `reconstruirLeituras(retrato)`, `memoriaDoRetrato(retrato, agora)`, constantes `VALIDADE_LEITURA_DIAS`, `FRACAO_MINIMA_CASADA`, `MIN_CONTATOS_LEITURA_PARCIAL`, `MOTIVO_SEM_NINGUEM`; `contarContatosCasados(contatos, pessoas)` em `lib/match.ts`.

- [ ] **Step 1: Tipos em `lib/types.ts`**

Depois de `ConteudoFonte`:

```ts
/** Uma página oficial lida com sucesso, guardada para reaproveitamento (spec 2026-10-20 §4.1). */
export interface LeituraGuardada {
  url: string;
  /** Hora da leitura que produziu o conteúdo, ISO 8601. Reaproveitar não muda a data. */
  lidaEm: string;
  conteudo: ConteudoFonte;
}

/** Chave: a URL da página. */
export type LeiturasGuardadas = Record<string, LeituraGuardada>;

/** A leitura de hoje foi substituída pela guardada: de quando ela é e por que a de hoje não serviu. */
export interface Reaproveitamento {
  lidaEm: string;
  /** Motivo técnico de hoje ("HTTP 403", "não trouxe ninguém", "página casou 2 de 10 contatos"). Sem PII. */
  motivo: string;
}
```

Em `ResultadoContato`, depois de `observacao?`:

```ts
  /** ISO 8601 da leitura reaproveitada da página individual do contato (spec 2026-10-20 §5.2). Ausente quando lida nesta varredura. */
  leituraDe?: string;
```

Em `ResultadoGrupo`, trocar o campo `individuais` e acrescentar `reaproveitada` logo depois de `viaPesquisaAmpla`:

```ts
  /**
   * A fonte primária do grupo foi substituída pela leitura guardada (spec 2026-10-20 §4.1).
   * Nunca junto com `fonteInacessivel` nem com `viaPesquisaAmpla`.
   */
  reaproveitada?: Reaproveitamento & { url: string };
  /**
   * Páginas individuais ligadas a contatos do grupo: lidas com conteúdo hoje, caídas, e as que
   * entraram pela memória (spec 2026-10-15 §6.1; 2026-10-20 §4.1). `reaproveitadas` só aparece
   * quando maior que zero; retrato antigo não o traz.
   */
  individuais?: { lidas: number; caidas: number; reaproveitadas?: number };
```

Em `ResumoAnalise`, depois de `gruposViaPesquisaAmpla`:

```ts
  /** Grupos com `reaproveitada` ou com `individuais.reaproveitadas > 0` (spec 2026-10-20). */
  gruposReaproveitados: number;
```

Em `ResultadoAnalise`, depois de `eleicao?`:

```ts
  /** Memória de leitura que sai desta varredura (spec 2026-10-20 §6). Só no retrato local; ausente em retrato antigo. */
  leituras?: LeiturasGuardadas;
```

- [ ] **Step 2: `gruposReaproveitados: 0` nos resumos fixos dos testes**

Em `tests/armazem.test.ts`, `tests/eleitos.test.ts` (duas ocorrências), `tests/export.test.ts` (duas ocorrências) e `tests/painel.test.ts` (as que houver), toda literal de `ResumoAnalise` que termina em `gruposViaPesquisaAmpla: 0` passa a `gruposViaPesquisaAmpla: 0, gruposReaproveitados: 0`. Conferir com `grep -rn "gruposViaPesquisaAmpla:" tests` que não sobrou nenhuma sem o campo novo.

- [ ] **Step 3: Teste de `contarContatosCasados` em `tests/match.test.ts`**

```ts
import { contarContatosCasados } from "@/lib/match";

describe("contarContatosCasados (spec 2026-10-20 §5.1)", () => {
  const contatos = [
    { nome: "Ana Maria Política Completa", grupo: "G" },
    { nome: "Beto Carlos Exemplo", grupo: "G" },
    { nome: "Carla Ninguém Sabe", grupo: "G" },
  ];
  test("conta quantos contatos casam alguém da composição pela régua de mesclarComposicao", () => {
    const pessoas = [{ nome: "Ana Maria Política Completa" }, { nome: "Beto Exemplo" }, { nome: "Zé Outro" }];
    expect(contarContatosCasados(contatos, pessoas)).toBe(2);
  });
  test("composição vazia casa zero", () => {
    expect(contarContatosCasados(contatos, [])).toBe(0);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tests/match.test.ts`
Expected: FAIL ("contarContatosCasados" não exportado).

- [ ] **Step 5: `contarContatosCasados` em `lib/match.ts`**

Logo depois de `mesclarComposicao`:

```ts
/**
 * Quantos contatos casam alguém da composição, pela mesma régua de `mesclarComposicao`.
 * Serve à leitura parcial da spec 2026-10-20 (§5.1, passo 4): a página de hoje casou
 * menos da metade do grupo?
 */
export function contarContatosCasados(contatos: readonly ContatoPlanilha[], pessoas: readonly PessoaSite[]): number {
  return contatos.filter((c) => pessoas.some((p) => pontuarPessoa(c.nome, p.nome) >= LIMIAR_PESSOA)).length;
}
```

Run: `npx vitest run tests/match.test.ts` → PASS.

- [ ] **Step 6: Testes de `lib/memoria-leitura.ts` em `tests/memoria-leitura.test.ts`**

```ts
import { describe, expect, test } from "vitest";
import {
  anotacaoReaproveitada,
  descreverMotivoDeHoje,
  diaMes,
  ehLeituraGuardada,
  ehLeituraParcial,
  leituraValida,
  memoriaDoRetrato,
  mesclarLeituras,
  motivoLeituraParcial,
  MOTIVO_SEM_NINGUEM,
  podarLeituras,
  reconstruirLeituras,
} from "@/lib/memoria-leitura";
import type { LeituraGuardada, LeiturasGuardadas, ResultadoGrupo, Retrato } from "@/lib/types";

const AGORA = new Date("2026-10-20T12:00:00.000Z");
const URL_A = "https://orgao.gov.br/a";
const URL_B = "https://orgao.gov.br/b";

function leitura(url: string, lidaEm: string, nomes: string[] = ["Ana Exemplo"]): LeituraGuardada {
  return { url, lidaEm, conteudo: { url, textoLimpo: nomes.join("\n"), destaques: [], pessoas: nomes.map((nome) => ({ nome })) } };
}

describe("leituraValida", () => {
  test("6 dias: válida", () => expect(leituraValida(leitura(URL_A, "2026-10-14T12:00:00.000Z"), AGORA)).toBe(true));
  test("7 dias exatos: válida (inclusive)", () => expect(leituraValida(leitura(URL_A, "2026-10-13T12:00:00.000Z"), AGORA)).toBe(true));
  test("8 dias: vencida", () => expect(leituraValida(leitura(URL_A, "2026-10-12T12:00:00.000Z"), AGORA)).toBe(false));
  test("lidaEm ilegível: vencida", () => expect(leituraValida(leitura(URL_A, "ontem"), AGORA)).toBe(false));
});

describe("ehLeituraParcial e motivo", () => {
  test("2 de 10 é parcial; 9 de 10 não; 1 de 2 não (metade exata); grupo de 1 nunca", () => {
    expect(ehLeituraParcial(2, 10)).toBe(true);
    expect(ehLeituraParcial(9, 10)).toBe(false);
    expect(ehLeituraParcial(1, 2)).toBe(false);
    expect(ehLeituraParcial(0, 1)).toBe(false);
  });
  test("motivo", () => expect(motivoLeituraParcial(2, 10)).toBe("página casou 2 de 10 contatos"));
});

describe("textos", () => {
  test("diaMes no fuso de Brasília", () => expect(diaMes("2026-10-16T15:50:29.000Z")).toBe("16/10"));
  test("anotação curta", () => expect(anotacaoReaproveitada({ lidaEm: "2026-10-16T15:50:29.000Z", motivo: "HTTP 403" })).toBe("leitura de 16/10 reaproveitada (HTTP 403)"));
  test("descreverMotivoDeHoje", () => {
    expect(descreverMotivoDeHoje("HTTP 403")).toBe("hoje a página não respondeu (HTTP 403)");
    expect(descreverMotivoDeHoje(MOTIVO_SEM_NINGUEM)).toBe("hoje a página não trouxe ninguém");
    expect(descreverMotivoDeHoje("página casou 2 de 10 contatos")).toBe("hoje a página casou 2 de 10 contatos");
  });
});

describe("podarLeituras", () => {
  test("mantém só as válidas e com forma certa; chave e url têm que bater", () => {
    const entrada: unknown = {
      [URL_A]: leitura(URL_A, "2026-10-16T12:00:00.000Z"),
      [URL_B]: leitura(URL_B, "2026-10-01T12:00:00.000Z"),
      "https://x": "texto solto",
      "https://y": { url: "https://y", lidaEm: "2026-10-19T00:00:00.000Z" },
      "https://z": leitura("https://outra", "2026-10-19T00:00:00.000Z"),
    };
    expect(Object.keys(podarLeituras(entrada, AGORA))).toEqual([URL_A]);
  });
  test("entrada que não é objeto vira memória vazia", () => {
    expect(podarLeituras("nada", AGORA)).toEqual({});
    expect(podarLeituras(undefined, AGORA)).toEqual({});
  });
  test("ehLeituraGuardada exige url, lidaEm e conteudo com pessoas em lista", () => {
    expect(ehLeituraGuardada(leitura(URL_A, "2026-10-16T12:00:00.000Z"))).toBe(true);
    expect(ehLeituraGuardada({ url: URL_A, lidaEm: "x", conteudo: { url: URL_A, textoLimpo: "", destaques: [], pessoas: "não" } })).toBe(false);
  });
});

describe("mesclarLeituras", () => {
  const anteriores: LeiturasGuardadas = {
    [URL_A]: leitura(URL_A, "2026-10-16T12:00:00.000Z", ["Velha"]),
    [URL_B]: leitura(URL_B, "2026-10-15T12:00:00.000Z"),
    "https://vencida": leitura("https://vencida", "2026-10-01T12:00:00.000Z"),
  };
  test("a boa de hoje vence a anterior; URL não visitada permanece; vencida é podada; não muta a entrada", () => {
    const saida = mesclarLeituras(anteriores, [leitura(URL_A, AGORA.toISOString(), ["Nova"])], AGORA);
    expect(saida[URL_A].conteudo.pessoas).toEqual([{ nome: "Nova" }]);
    expect(saida[URL_B].lidaEm).toBe("2026-10-15T12:00:00.000Z");
    expect(saida["https://vencida"]).toBeUndefined();
    expect(anteriores[URL_A].conteudo.pessoas).toEqual([{ nome: "Velha" }]);
  });
  test("reaproveitada colhida mantém a data original", () => {
    const saida = mesclarLeituras(anteriores, [leitura(URL_A, "2026-10-16T12:00:00.000Z", ["Velha"])], AGORA);
    expect(saida[URL_A].lidaEm).toBe("2026-10-16T12:00:00.000Z");
  });
});

describe("reconstruirLeituras (§5.4)", () => {
  const base = { semFonte: false, novos: [] as ResultadoGrupo["novos"] };
  const contato = (nome: string, comparacoes: ResultadoGrupo["contatos"][number]["comparacoes"], extra: Partial<ResultadoGrupo["contatos"][number]> = {}) =>
    ({ contato: { nome, grupo: "G" }, semaforo: "verde", score: 1, comparacoes, camposDivergentes: [], origem: "oficial", ...extra }) as ResultadoGrupo["contatos"][number];
  const lido: ResultadoGrupo = {
    ...base, grupo: "Lido", fonteUrl: URL_A,
    contatos: [
      // origemValor ausente: é como a raspagem real grava valor de página
      contato("Ana Exemplo", [{ campo: "nome", valorPlanilha: "Ana Exemplo", valorEsperado: "Ana Maria Exemplo", situacao: "divergente" }, { campo: "cargo", valorPlanilha: "Ministra", valorEsperado: "Ministra", situacao: "confere" }]),
      contato("Beto Caso", [{ campo: "nome", valorPlanilha: "Beto Caso", valorEsperado: "Beto Caso", situacao: "confere", origemValor: "pagina" }, { campo: "cargo", valorPlanilha: "Ministro", situacao: "fonte_nao_informa" }]),
      // resgatado pela IA: fica fora
      contato("Ciro IA", [{ campo: "nome", valorPlanilha: "Ciro IA", valorEsperado: "Ciro IA", situacao: "confere", origemValor: "conhecimento" }]),
      // Camada C tem valorEsperado, mas é coerência: fica fora
      contato("Dr. Dino", [{ campo: "nome", valorPlanilha: "Dr. Dino", valorEsperado: "Dino", situacao: "divergente", origemValor: "coerencia", achado: "nome_tratamento_academico" }]),
      // possível saída: sem valor de página
      contato("Eva Saiu", [], { semaforo: "vermelho", possivelSaida: true }),
    ],
    novos: [{ nome: "Fábio Novo", cargo: "Ministro" }, { nome: "Gil IA", cargo: "Ministro", origem: "conhecimento" }],
  };
  const retrato = { geradoEm: "2026-10-16T15:50:29.000Z", grupos: [
    lido,
    { ...base, grupo: "Via IA", fonteUrl: URL_B, viaPesquisaAmpla: true, contatos: [contato("X", [{ campo: "nome", valorPlanilha: "X", valorEsperado: "X", situacao: "confere" }])] },
    { ...base, grupo: "Inacessível", fonteUrl: "https://c", fonteInacessivel: true, contatos: [] },
    { ...base, grupo: "Sem fonte", semFonte: true, contatos: [] },
    { ...base, grupo: "Individuais", fonteUrl: "https://d", individuais: { lidas: 2, caidas: 0 }, contatos: [contato("Y", [{ campo: "nome", valorPlanilha: "Y", valorEsperado: "Y", situacao: "confere" }])] },
    { ...base, grupo: "Só IA sem URL", fonteUrl: "pesquisa-ampla://anthropic-haiku", contatos: [] },
    { ...base, grupo: "Nada aproveitável", fonteUrl: "https://e", contatos: [contato("Z", [], { semaforo: "vermelho", possivelSaida: true })] },
  ] } as unknown as Pick<Retrato, "geradoEm" | "grupos">;

  test("grupo lido vira composição com nome e cargo da página e novos da página; lidaEm é geradoEm", () => {
    const m = reconstruirLeituras(retrato);
    expect(Object.keys(m)).toEqual([URL_A]);
    expect(m[URL_A].lidaEm).toBe("2026-10-16T15:50:29.000Z");
    expect(m[URL_A].conteudo.url).toBe(URL_A);
    expect(m[URL_A].conteudo.pessoas).toEqual([
      { nome: "Ana Maria Exemplo", cargo: "Ministra" },
      { nome: "Beto Caso" },
      { nome: "Fábio Novo", cargo: "Ministro" },
    ]);
    expect(m[URL_A].conteudo.textoLimpo).toBe("Ana Maria Exemplo\nBeto Caso\nFábio Novo");
  });
});

describe("memoriaDoRetrato (§6 passo 1 e §10)", () => {
  test("sem retrato: vazia", () => expect(memoriaDoRetrato(undefined, AGORA)).toEqual({}));
  test("retrato com leituras usa as leituras, podadas", () => {
    const r = { geradoEm: "2026-10-19T00:00:00.000Z", grupos: [], leituras: { [URL_A]: leitura(URL_A, "2026-10-19T00:00:00.000Z"), [URL_B]: leitura(URL_B, "2026-09-01T00:00:00.000Z") } } as unknown as Retrato;
    expect(Object.keys(memoriaDoRetrato(r, AGORA))).toEqual([URL_A]);
  });
  test("retrato com leituras de forma inesperada: nada é reaproveitado", () => {
    const r = { geradoEm: "2026-10-19T00:00:00.000Z", grupos: [{ grupo: "G", fonteUrl: URL_A, semFonte: false, novos: [], contatos: [] }], leituras: "quebrado" } as unknown as Retrato;
    expect(memoriaDoRetrato(r, AGORA)).toEqual({});
  });
  test("retrato sem leituras é reconstruído", () => {
    const r = {
      geradoEm: "2026-10-16T15:50:29.000Z",
      grupos: [{ grupo: "G", fonteUrl: URL_A, semFonte: false, novos: [], contatos: [{ contato: { nome: "Ana", grupo: "G" }, semaforo: "verde", score: 1, camposDivergentes: [], origem: "oficial", comparacoes: [{ campo: "nome", valorPlanilha: "Ana", valorEsperado: "Ana", situacao: "confere" }] }] }],
    } as unknown as Retrato;
    expect(memoriaDoRetrato(r, AGORA)[URL_A].conteudo.pessoas).toEqual([{ nome: "Ana" }]);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `npx vitest run tests/memoria-leitura.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 8: Criar `lib/memoria-leitura.ts`**

```ts
import type { LeituraGuardada, LeiturasGuardadas, PessoaSite, Reaproveitamento, ResultadoContato, ResultadoGrupo, Retrato } from "@/lib/types";

/**
 * Memória de leitura por página (spec 2026-10-20): validade, poda, mescla e reconstrução.
 * Funções puras; a rota e `lib/analise.ts` as usam. Nada aqui lê disco nem rede.
 */

/** Uma leitura guardada vale até este prazo, inclusive (decisão 4). */
export const VALIDADE_LEITURA_DIAS = 7;
/** Leitura parcial: a página casou menos desta fração dos contatos do grupo (§4.2). */
export const FRACAO_MINIMA_CASADA = 0.5;
/** Grupo de um contato só nunca é leitura parcial: uma pessoa pode mesmo ter saído. */
export const MIN_CONTATOS_LEITURA_PARCIAL = 2;
/** Motivo de hoje quando a página respondeu e não trouxe ninguém. */
export const MOTIVO_SEM_NINGUEM = "não trouxe ninguém";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** §5.3: a única função que decide validade, para grupo, individual e geral. */
export function leituraValida(leitura: LeituraGuardada, agora: Date): boolean {
  const lidaEm = Date.parse(leitura.lidaEm);
  if (Number.isNaN(lidaEm)) return false;
  return agora.getTime() - lidaEm <= VALIDADE_LEITURA_DIAS * MS_POR_DIA;
}

export function ehLeituraParcial(casados: number, totalContatos: number): boolean {
  return totalContatos >= MIN_CONTATOS_LEITURA_PARCIAL && casados / totalContatos < FRACAO_MINIMA_CASADA;
}

export function motivoLeituraParcial(casados: number, totalContatos: number): string {
  return `página casou ${casados} de ${totalContatos} contatos`;
}

const FORMATO_DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** "16/10", no fuso de Brasília. */
export function diaMes(iso: string): string {
  return FORMATO_DIA_MES.format(new Date(iso));
}

/** "leitura de 16/10 reaproveitada (HTTP 403)": anotação para `erroFonte` e para o export (§5.1 passo 6, §7). */
export function anotacaoReaproveitada(r: Reaproveitamento): string {
  return `leitura de ${diaMes(r.lidaEm)} reaproveitada (${r.motivo})`;
}

/** Segunda metade do cabeçalho do grupo reaproveitado (§7). */
export function descreverMotivoDeHoje(motivo: string): string {
  if (motivo.startsWith("página casou ")) return `hoje a ${motivo}`;
  if (motivo === MOTIVO_SEM_NINGUEM) return "hoje a página não trouxe ninguém";
  return `hoje a página não respondeu (${motivo})`;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function ehConteudoFonte(v: unknown): boolean {
  return ehObjeto(v) && typeof v.url === "string" && typeof v.textoLimpo === "string" && Array.isArray(v.destaques) && Array.isArray(v.pessoas);
}

/** Forma mínima de uma leitura guardada (§10). O que falta disso é descartado, sem log de conteúdo. */
export function ehLeituraGuardada(v: unknown): v is LeituraGuardada {
  return ehObjeto(v) && typeof v.url === "string" && typeof v.lidaEm === "string" && ehConteudoFonte(v.conteudo);
}

/** Só as entradas com forma certa, chave igual à `url` e dentro do prazo. Devolve objeto novo. */
export function podarLeituras(leituras: unknown, agora: Date): LeiturasGuardadas {
  if (!ehObjeto(leituras)) return {};
  const validas: LeiturasGuardadas = {};
  for (const [url, l] of Object.entries(leituras)) {
    if (ehLeituraGuardada(l) && l.url === url && leituraValida(l, agora)) validas[url] = l;
  }
  return validas;
}

/**
 * §6 passo 3: a memória anterior podada, sobreposta pelas leituras desta varredura (as boas de
 * hoje, com a data de hoje, e as reaproveitadas, com a data original). Não muta a entrada.
 */
export function mesclarLeituras(anteriores: LeiturasGuardadas, colhidas: readonly LeituraGuardada[], agora: Date): LeiturasGuardadas {
  const saida = podarLeituras(anteriores, agora);
  for (const l of colhidas) saida[l.url] = l;
  return saida;
}

/** Valor de página: `origemValor` "pagina" OU ausente (a raspagem real não carimba a origem). IA, coerência e protocolo ficam fora. */
function valorDaPagina(c: ResultadoContato, campo: "nome" | "cargo"): string | undefined {
  const comp = c.comparacoes.find((x) => x.campo === campo && (x.origemValor === undefined || x.origemValor === "pagina"));
  return comp?.valorEsperado || undefined;
}

function grupoLidoDaPagina(g: ResultadoGrupo): boolean {
  return !g.semFonte && !g.fonteInacessivel && !g.viaPesquisaAmpla && !g.individuais && typeof g.fonteUrl === "string" && g.fonteUrl.startsWith("http");
}

function pessoa(nome: string, cargo: string | undefined): PessoaSite {
  return { nome, ...(cargo ? { cargo } : {}) };
}

/**
 * §5.4: memória reconstruída de um retrato gravado antes do mecanismo, só das fontes de grupo
 * lidas da página. Uma pessoa por contato com nome vindo da página (e o cargo, quando também
 * veio), mais os `novos` que não são da IA. `lidaEm` é o `geradoEm` do retrato. Grupo sem
 * nada aproveitável fica fora (§10).
 */
export function reconstruirLeituras(retrato: Pick<Retrato, "grupos" | "geradoEm">): LeiturasGuardadas {
  const leituras: LeiturasGuardadas = {};
  for (const g of retrato.grupos) {
    if (!grupoLidoDaPagina(g)) continue;
    const url = g.fonteUrl as string;
    const pessoas: PessoaSite[] = [
      ...g.contatos.flatMap((c) => {
        const nome = valorDaPagina(c, "nome");
        return nome ? [pessoa(nome, valorDaPagina(c, "cargo"))] : [];
      }),
      ...g.novos.filter((n) => n.origem !== "conhecimento").map((n) => pessoa(n.nome, n.cargo)),
    ];
    if (pessoas.length === 0) continue;
    leituras[url] = { url, lidaEm: retrato.geradoEm, conteudo: { url, textoLimpo: pessoas.map((p) => p.nome).join("\n"), destaques: [], pessoas } };
  }
  return leituras;
}

/**
 * §6 passo 1: a memória a injetar na varredura. Retrato com `leituras` usa-as (podadas);
 * `leituras` com forma inesperada vale como "nada a reaproveitar" (§10); retrato de antes do
 * mecanismo é reconstruído; sem retrato, vazia.
 */
export function memoriaDoRetrato(retrato: Retrato | undefined, agora: Date): LeiturasGuardadas {
  if (!retrato) return {};
  if ("leituras" in retrato) return ehObjeto(retrato.leituras) ? podarLeituras(retrato.leituras, agora) : {};
  return podarLeituras(reconstruirLeituras(retrato), agora);
}
```

- [ ] **Step 9: Rodar os testes da tarefa e a suíte**

Run: `npx vitest run tests/memoria-leitura.test.ts tests/match.test.ts` → PASS.
Run: `npm test` → verde (os resumos fixos dos testes ganharam o campo novo). `npm run typecheck` → limpo.

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/memoria-leitura.ts lib/match.ts tests/memoria-leitura.test.ts tests/match.test.ts tests/armazem.test.ts tests/eleitos.test.ts tests/export.test.ts tests/painel.test.ts
git commit -m "feat: tipos e módulo da memória de leitura por página

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Caminho de grupo em `lib/analise.ts`

**Files:**
- Modify: `lib/analise.ts` (imports, `Dependencias`, `FonteLida`, `analisarGrupo`, `lerFonte`, `resumir`, `analisar`)
- Test: `tests/analise.test.ts`

**Interfaces:**
- Consumes: Task 1 (`leituraValida`, `ehLeituraParcial`, `motivoLeituraParcial`, `anotacaoReaproveitada`, `mesclarLeituras`, `MOTIVO_SEM_NINGUEM`, `contarContatosCasados`, tipos).
- Produces: `Dependencias.leiturasAnteriores?: LeiturasGuardadas`, `Dependencias.agora?: () => Date`; `ResultadoAnalise.leituras` sempre presente na saída de `analisar`; `ResultadoGrupo.reaproveitada`; `ResumoAnalise.gruposReaproveitados`. A Task 3 reaproveita `Leitura<F>`, `lerHoje`, `lerFonte`, `guardadaValida`, `guardar`, `AnaliseDoGrupo`, `SEM_LEITURAS` definidos aqui; `analisarGrupoIndividual` ganha o parâmetro `agora` já nesta tarefa (ver passo 3), sem mudar de comportamento.

- [ ] **Step 1: Testes novos em `tests/analise.test.ts`**

Acrescentar no fim do arquivo (os fixtures `contatos`, `fonte`, `deps`, `CADASTRO_OK` já existem no topo):

```ts
import type { LeituraGuardada, LeiturasGuardadas } from "@/lib/types";

describe("memória de leitura por página (spec 2026-10-20 §5.1)", () => {
  const AGORA = new Date("2026-10-20T12:00:00.000Z");
  const LIDA_EM_16 = "2026-10-16T15:50:29.000Z";
  const URL = "https://orgao.gov.br";
  const guardada = (conteudo: ConteudoFonte = fonte, lidaEm = LIDA_EM_16): LeituraGuardada => ({ url: conteudo.url, lidaEm, conteudo });
  const paginaCom = (nomes: string[]): ConteudoFonte => ({ url: URL, textoLimpo: nomes.join(". "), destaques: [], pessoas: nomes.map((nome) => ({ nome, cargo: "Ministro" })) });
  // Nomes sem token em comum: `pontuarPessoa` casaria "Pessoa Número Um" com "Pessoa Número Dois".
  const dez = ["Alberto Caminho Verde", "Beatriz Lagoa Azul", "Carlos Monte Claro", "Dalva Serra Branca", "Eduardo Vale Fundo", "Fátima Rio Manso", "Gustavo Campo Largo", "Helena Praia Grande", "Ivo Morro Alto", "Joana Bosque Novo"];
  const dezContatos: ContatoPlanilha[] = dez.map((nome) => ({ nome, grupo: "ORG", ...CADASTRO_OK }));

  function comMemoria(raspar: Dependencias["raspar"], leituras: LeiturasGuardadas, extra: Partial<Dependencias> = {}): Dependencias {
    return { ...deps, raspar, leiturasAnteriores: leituras, agora: () => AGORA, ...extra };
  }
  const erro403: Dependencias["raspar"] = async () => { throw new Error("HTTP 403"); };
  const semNinguem: Dependencias["raspar"] = async () => ({ url: URL, textoLimpo: "", destaques: [], pessoas: [] });

  test("primária com erro e memória válida → grupo lido, reaproveitada com o motivo, IA não chamada, contato verde", async () => {
    let iaChamada = false;
    const r = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, { [URL]: guardada() }, { extrairComposicao: async () => { iaChamada = true; return []; } }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.viaPesquisaAmpla).toBeUndefined();
    expect(g.reaproveitada).toEqual({ url: URL, lidaEm: LIDA_EM_16, motivo: "HTTP 403" });
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].origem).toBe("oficial");
    expect(iaChamada).toBe(false);
    expect(r.resumo.gruposReaproveitados).toBe(1);
    expect(r.resumo.gruposFonteInacessivel).toBe(0);
  });

  test("primária com erro e memória vencida (8 dias) → comportamento de hoje: IA sozinha e via IA; sem IA, inacessível", async () => {
    const vencida = { [URL]: guardada(fonte, "2026-10-12T11:00:00.000Z") };
    const comIa = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, vencida, { extrairComposicao: async () => [{ nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" }] }));
    expect(comIa.grupos[0].viaPesquisaAmpla).toBe(true);
    expect(comIa.grupos[0].reaproveitada).toBeUndefined();
    const semIa = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, vencida));
    expect(semIa.grupos[0].fonteInacessivel).toBe(true);
    expect(semIa.resumo.gruposReaproveitados).toBe(0);
  });

  test("primária que respondeu sem ninguém e memória válida → reaproveitada com 'não trouxe ninguém'", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], comMemoria(semNinguem, { [URL]: guardada() }));
    expect(r.grupos[0].reaproveitada).toMatchObject({ motivo: "não trouxe ninguém" });
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
  });

  test("leitura parcial (2 de 10) com memória que casa os 10 → reaproveitada com o motivo, todos verdes", async () => {
    const hoje = async () => paginaCom(dez.slice(0, 2));
    const r = await analisar("c.xlsx", dezContatos, comMemoria(hoje, { [URL]: guardada(paginaCom(dez)) }));
    const g = r.grupos[0];
    expect(g.reaproveitada).toEqual({ url: URL, lidaEm: LIDA_EM_16, motivo: "página casou 2 de 10 contatos" });
    expect(g.contatos.every((c) => c.semaforo === "verde")).toBe(true);
  });

  test("leitura parcial sem memória → como hoje: 2 verdes e 8 possíveis saídas", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 2)), {}));
    const g = r.grupos[0];
    expect(g.reaproveitada).toBeUndefined();
    expect(g.contatos.filter((c) => c.possivelSaida).length).toBe(8);
  });

  test("leitura parcial com memória que não casa melhor → fica a de hoje", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 2)), { [URL]: guardada(paginaCom(dez.slice(0, 2))) }));
    expect(r.grupos[0].reaproveitada).toBeUndefined();
  });

  test("9 de 10 com memória → a leitura de hoje vale; quem falta é possível saída", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 9)), { [URL]: guardada(paginaCom(dez)) }));
    const g = r.grupos[0];
    expect(g.reaproveitada).toBeUndefined();
    expect(g.contatos.filter((c) => c.possivelSaida).length).toBe(1);
  });

  test("grupo de um contato nunca é parcial: página de hoje sem ele e memória com ele → possível saída", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], comMemoria(async () => paginaCom(["Outra Pessoa Qualquer"]), { [URL]: guardada() }));
    expect(r.grupos[0].reaproveitada).toBeUndefined();
    expect(r.grupos[0].contatos[0].possivelSaida).toBe(true);
  });

  test("guardada que não casa ninguém de um grupo com 2+ contatos cai na leitura suspeita, nunca saída em massa", async () => {
    const r = await analisar("c.xlsx", dezContatos, comMemoria(erro403, { [URL]: guardada(paginaCom(["Fulano Estranho", "Beltrano Estranho"])) }));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBe(true);
    expect(g.erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
    expect(g.contatos.every((c) => c.semaforo === "indeterminado")).toBe(true);
  });

  test("leituras de saída: a boa de hoje com a data de hoje; a parcial não entra; a reaproveitada mantém a data original; vencida é podada", async () => {
    const boa = await analisar("c.xlsx", [contatos[0]], comMemoria(async () => fonte, { "https://nao-visitada": guardada({ ...fonte, url: "https://nao-visitada" }), "https://vencida": guardada({ ...fonte, url: "https://vencida" }, "2026-10-01T00:00:00.000Z") }));
    expect(boa.leituras?.[URL]).toEqual({ url: URL, lidaEm: AGORA.toISOString(), conteudo: fonte });
    expect(boa.leituras?.["https://nao-visitada"]).toBeDefined();
    expect(boa.leituras?.["https://vencida"]).toBeUndefined();

    const parcial = await analisar("c.xlsx", dezContatos, comMemoria(async () => paginaCom(dez.slice(0, 2)), {}));
    expect(parcial.leituras?.[URL]).toBeUndefined();

    const reaproveitada = await analisar("c.xlsx", [contatos[0]], comMemoria(erro403, { [URL]: guardada() }));
    expect(reaproveitada.leituras?.[URL].lidaEm).toBe(LIDA_EM_16);
  });

  test("sem memória injetada, leituras sai só com as boas de hoje e nada é reaproveitado", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], { ...deps, agora: () => AGORA });
    expect(Object.keys(r.leituras ?? {})).toEqual([URL]);
    const caido = await analisar("c.xlsx", [contatos[0]], { ...deps, raspar: erro403 });
    expect(caido.grupos[0].fonteInacessivel).toBe(true);
  });
});

describe("memória de leitura com duas fontes no grupo (§5.1 passo 6)", () => {
  const PRIMARIA = "https://senado.leg.br/em-exercicio";
  const SECUNDARIA = "https://senado.leg.br/fora-de-exercicio";
  const AGORA = new Date("2026-10-20T12:00:00.000Z");
  const paginaPrimaria: ConteudoFonte = { url: PRIMARIA, textoLimpo: "Weverton — MA", destaques: [], pessoas: [{ nome: "Weverton", uf: "MA" }] };
  const paginaSecundaria: ConteudoFonte = { url: SECUNDARIA, textoLimpo: "Wellington Dias — PI", destaques: [], pessoas: [{ nome: "Wellington Dias", uf: "PI" }] };
  const senadores: ContatoPlanilha[] = [
    { nome: "Weverton", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
    { nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
    { nome: "Fulano Que Saiu", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
  ];
  const depsSenadores: Dependencias = {
    resolverFonte: () => ({
      grupoCanonico: "Senadores (Maranhão ao Piauí)",
      fontes: [{ url: PRIMARIA, ativo: true }, { url: SECUNDARIA, ativo: true, rotulo: "fora de exercício", propoeInclusao: true }],
      ufs: ["MA", "PI"], fontesIndividuais: [], sugestoes: [],
    }),
    raspar: async (f) => { if (f.url === SECUNDARIA) throw new Error("HTTP 403"); return paginaPrimaria; },
    extrairComposicao: async () => [],
    leiturasAnteriores: { [SECUNDARIA]: { url: SECUNDARIA, lidaEm: "2026-10-16T15:50:29.000Z", conteudo: paginaSecundaria } },
    agora: () => AGORA,
  };

  test("secundária com erro e memória → anotação em erroFonte, grupo não reaproveitado, quem só constava nela casa, e a saída continua de pé", async () => {
    const r = await analisar("c.xlsx", senadores, depsSenadores);
    const g = r.grupos[0];
    expect(g.reaproveitada).toBeUndefined();
    expect(g.erroFonte).toBe("fora de exercício: leitura de 16/10 reaproveitada (HTTP 403)");
    expect(g.contatos.map((c) => c.semaforo)).toEqual(["verde", "verde", "vermelho"]);
    expect(g.contatos[2].possivelSaida).toBe(true);
    expect(r.resumo.gruposReaproveitados).toBe(0);
  });
});
```

Acrescentar `ContatoPlanilha` e `ConteudoFonte` ao `import type` do topo se ainda não estiverem (estão).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/analise.test.ts`
Expected: FAIL nos testes novos (`leiturasAnteriores` desconhecido em `Dependencias`, `reaproveitada` ausente).

- [ ] **Step 3: Implementar em `lib/analise.ts`**

Imports: acrescentar `LeituraGuardada`, `LeiturasGuardadas`, `Reaproveitamento` ao `import type` de `@/lib/types`; acrescentar `contarContatosCasados` ao import de `@/lib/match`; acrescentar

```ts
import {
  anotacaoReaproveitada,
  ehLeituraParcial,
  leituraValida,
  mesclarLeituras,
  motivoLeituraParcial,
  MOTIVO_SEM_NINGUEM,
} from "@/lib/memoria-leitura";
```

Remover a constante local `MOTIVO_FONTE_VAZIA` e usar `MOTIVO_SEM_NINGUEM` onde ela aparecia (o comentário acima dela fica, ajustado ao nome novo).

`Dependencias`:

```ts
export interface Dependencias {
  resolverFonte: (grupo: string) => FonteResolvida;
  raspar: (fonte: FonteLegivel) => Promise<ConteudoFonte>;
  extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]>;
  /**
   * Memória de leitura por página (spec 2026-10-20), por URL. Ausente: nada é reaproveitado e o
   * comportamento é o de antes; `leituras` sai só com as boas de hoje.
   */
  leiturasAnteriores?: LeiturasGuardadas;
  /** Relógio injetável (validade de 7 dias e data das leituras de hoje). Ausente: `new Date()`. */
  agora?: () => Date;
}
```

Substituir `FonteLida`, `IndividualLida` e `lerFonte` por:

```ts
/**
 * Leitura de uma fonte, de grupo ou individual: conteúdo OU motivo técnico da falha, nunca os
 * dois. Quando o conteúdo veio da memória (spec 2026-10-20), `reaproveitada` diz de quando ele
 * é e por que a leitura de hoje não serviu.
 */
interface Leitura<F extends FonteLegivel> {
  fonte: F;
  conteudo?: ConteudoFonte;
  erro?: string;
  reaproveitada?: Reaproveitamento;
}
type FonteLida = Leitura<FonteCatalogo>;
type IndividualLida = Leitura<FonteIndividual>;

async function lerHoje<F extends FonteLegivel>(fonte: F, deps: Dependencias): Promise<Leitura<F>> {
  try {
    return { fonte, conteudo: await deps.raspar(fonte) };
  } catch (err) {
    return { fonte, erro: motivoDaFalha(err) };
  }
}

/** A leitura guardada da URL, se existe e está no prazo (§5.3). */
function guardadaValida(url: string, deps: Dependencias, agora: Date): LeituraGuardada | undefined {
  const guardada = deps.leiturasAnteriores?.[url];
  return guardada && leituraValida(guardada, agora) ? guardada : undefined;
}

/**
 * Lê a fonte hoje e, se a leitura não serviu (`serviu` falsa: erro, sem ninguém ou sem conteúdo
 * legível, conforme quem chama), sai pela leitura guardada válida da mesma URL, com a data
 * original e o motivo de hoje (§5.1 passo 2, §5.2). Sem memória válida, devolve a de hoje.
 */
async function lerFonte<F extends FonteLegivel>(
  fonte: F,
  deps: Dependencias,
  agora: Date,
  serviu: (l: Leitura<F>) => boolean,
  motivoPadrao: string,
): Promise<Leitura<F>> {
  const hoje = await lerHoje(fonte, deps);
  if (serviu(hoje)) return hoje;
  const guardada = guardadaValida(fonte.url, deps, agora);
  if (!guardada) return hoje;
  return { fonte, conteudo: guardada.conteudo, reaproveitada: { lidaEm: guardada.lidaEm, motivo: hoje.erro ?? motivoPadrao } };
}

/** O que entra na memória por esta leitura: reaproveitada volta com a data original (§4.3). */
function guardar<F extends FonteLegivel>(l: Leitura<F>, agora: Date): LeituraGuardada {
  return { url: l.fonte.url, lidaEm: l.reaproveitada?.lidaEm ?? agora.toISOString(), conteudo: l.conteudo as ConteudoFonte };
}

/** O que a análise de um grupo devolve: o resultado e as leituras boas desta varredura (§4.3). */
interface AnaliseDoGrupo {
  grupo: ResultadoGrupo;
  leituras: LeituraGuardada[];
}

const SEM_LEITURAS: LeituraGuardada[] = [];

/**
 * §5.1 passo 4: a primária lida hoje casou menos da metade dos contatos. Se a guardada casa
 * mais, ela entra no lugar, com o motivo "página casou X de N contatos"; senão fica a de hoje,
 * que não será guardada (`primariaParcial`). Primária reaproveitada, sem ninguém ou que é só
 * lista de cargos não passa por aqui.
 */
function reaproveitarParcial(
  lidas: FonteLida[],
  contatos: ContatoPlanilha[],
  deps: Dependencias,
  agora: Date,
): { lidas: FonteLida[]; primariaParcial: boolean } {
  const primaria = lidas[0];
  const naoSeAplica = { lidas, primariaParcial: false };
  if (!primaria || primaria.reaproveitada || !contribuiu(primaria) || primaria.fonte.casamento === "cargo") return naoSeAplica;
  const casadosHoje = contarContatosCasados(contatos, primaria.conteudo!.pessoas);
  if (!ehLeituraParcial(casadosHoje, contatos.length)) return naoSeAplica;
  const guardada = guardadaValida(primaria.fonte.url, deps, agora);
  if (!guardada || contarContatosCasados(contatos, guardada.conteudo.pessoas) <= casadosHoje) return { lidas, primariaParcial: true };
  const trocada: FonteLida = {
    fonte: primaria.fonte,
    conteudo: guardada.conteudo,
    reaproveitada: { lidaEm: guardada.lidaEm, motivo: motivoLeituraParcial(casadosHoje, contatos.length) },
  };
  return { lidas: [trocada, ...lidas.slice(1)], primariaParcial: false };
}

/** §4.3: fontes que contribuíram entram na memória; a primária parcial de hoje não. */
function leiturasBoas(lidas: readonly FonteLida[], primariaParcial: boolean, agora: Date): LeituraGuardada[] {
  return lidas.flatMap((l, i) => (!contribuiu(l) || (i === 0 && primariaParcial) ? [] : [guardar(l, agora)]));
}
```

`analisarGrupo` passa a receber `agora: Date` e a devolver `AnaliseDoGrupo`. Corpo completo:

```ts
async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
  agora: Date,
): Promise<AnaliseDoGrupo> {
  const resolvida = await deps.resolverFonte(grupo);
  // Grupo desconhecido (nenhum cadastro casa) → sem fonte; orienta com sugestões.
  if (!resolvida.grupoCanonico) {
    const base = compararGrupo(grupo, contatos, undefined);
    return {
      grupo: comResponsavel(
        resolvida.sugestoes.length > 0 ? { ...base, sugestoesCadastro: resolvida.sugestoes } : base,
        resolvida.responsavel,
      ),
      leituras: SEM_LEITURAS,
    };
  }

  // Grupo com fontes individuais (spec 2026-10-15): caminho por contato. Os demais seguem abaixo.
  if (resolvida.fontesIndividuais.length > 0) {
    const a = await analisarGrupoIndividual(grupo, contatos, resolvida, deps, agora);
    return { ...a, grupo: comResponsavel(a.grupo, resolvida.responsavel) };
  }

  // 1. Camada 1 (base): todas as fontes ativas, em paralelo. Uma falhar não derruba a outra.
  //    Fonte que FALHOU hoje (ver `falhou`) sai pela leitura guardada válida, se houver, com o
  //    motivo de hoje anotado (spec 2026-10-20 §5.1, passo 2).
  const lidasHoje: FonteLida[] = await Promise.all(
    resolvida.fontes.map((fonte, i) => lerFonte(fonte, deps, agora, (l) => !falhou(l, i === 0), MOTIVO_SEM_NINGUEM)),
  );
  // Leitura parcial da primária (§5.1, passo 4): só a guardada que casa mais contatos a substitui.
  const { lidas, primariaParcial } = reaproveitarParcial(lidasHoje, contatos, deps, agora);
  const urlPrimaria = resolvida.fontes[0]?.url;
  const primariaReaproveitada = lidas[0]?.reaproveitada;
  // Toda fonte que contribuiu entra na composição, na ordem do catálogo: dado oficial da
  // Camada 1 nunca é descartado, nem quando a primária caiu. O que a falha de UMA fonte
  // entre várias suspende é a CONCLUSÃO, não a comparação — ver `leituraParcial` abaixo.
  const pessoasPagina = unirFontes(
    lidas.map((l) => (l.conteudo ? marcarProveniencia(l.conteudo.pessoas, l.fonte) : [])),
  );
  const naoContribuiram = lidas.filter((l) => !contribuiu(l));
  const algumaContribuiu = lidas.some(contribuiu);
  // LEITURA PARCIAL (no sentido de 2026-09-24): alguma fonte ativa compôs o grupo e outra
  // FALHOU (ver `falhou`). É a única situação em que o veredito de saída fica suspenso — ver o
  // passo 4. Fonte reaproveitada pela memória contribuiu e não falhou. Fonte que respondeu e
  // não tinha ninguém a listar não entra aqui: vira só ressalva em `erroFonte`. Quando NENHUMA
  // fonte contribuiu nada muda em relação ao que já existia: a composição da IA, se houver, é
  // composição real e continua podendo apontar saída (marcada `viaPesquisaAmpla`); sem IA,
  // cai em fonte inacessível.
  const leituraParcial = algumaContribuiu && lidas.some((l, i) => falhou(l, i === 0));
  // A Camada 2 recebe o texto da fonte primária — uma chamada por grupo, como sempre.
  const textoLimpo = lidas[0]?.conteudo?.textoLimpo ?? "";

  // 2. Camada 2 (refinamento/cobertura): composição via IA. Sem chave → [].
  // Fonte que é só lista de cargos não tem composição de pessoas a refinar: a IA não roda.
  // Com a primária reaproveitada a IA também não roda (spec 2026-10-20 §5.1, passo 5): a
  // composição guardada é a de um dia bom e não precisa de resgate. Primária que falhou SEM
  // memória válida segue como sempre: a IA compõe sozinha (decisão 3).
  const primariaCasaPessoa = (resolvida.fontes[0]?.casamento ?? "pessoa") === "pessoa";
  const pessoasIA = primariaCasaPessoa && !primariaReaproveitada ? await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo) : [];
  const composicao = mesclarComposicao(pessoasPagina, pessoasIA, contatos);

  // 3. Sem composição (nenhuma fonte legível E IA vazia): NUNCA "saída" — "não verificado".
  if (composicao.length === 0) {
    if (urlPrimaria) {
      // Diferencia scrape que lançou erro de página que veio sem conteúdo legível (JS).
      const motivo = lidas[0]?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO;
      return {
        grupo: comResponsavel(
          marcarFonteInacessivel(grupo, contatos, urlPrimaria, motivo, resolvida.grupoCanonico),
          resolvida.responsavel,
        ),
        leituras: SEM_LEITURAS,
      };
    }
    // sem URL → sem fonte
    return {
      grupo: comResponsavel(compararGrupo(grupo, contatos, undefined, resolvida.grupoCanonico), resolvida.responsavel),
      leituras: SEM_LEITURAS,
    };
  }

  // 4. Compara contra a composição (fontes que sobreviveram + resgates da IA).
  const fonte: ConteudoFonte = {
    url: urlPrimaria ?? URL_PESQUISA_AMPLA,
    textoLimpo,
    destaques: [],
    pessoas: composicao,
  };
  // Leitura parcial: parte da composição oficial ficou de fora, então ninguém deste grupo
  // pode ser dado como saída — e o usuário precisa saber disso, na tela e no export.
  const r = compararGrupo(grupo, contatos, fonte, resolvida.grupoCanonico, resolvida.ufs, leituraParcial);
  // LEITURA SUSPEITA: composição real (página, memória e/ou IA) que não casa nenhum contato de
  // um grupo com 2+ contatos é, na prática, página que não montou, layout que mudou ou página
  // errada, nunca um grupo inteiro que saiu. Não se confia nela: o grupo fica indeterminado,
  // com o motivo, e o fiscal confere à mão; sem `novos`, que viriam da mesma leitura ruim. A
  // leitura parcial já suspende a saída (ninguém vira possível saída) e nunca dispara aqui.
  // Grupo SEM URL no catálogo (composição só da IA) cai no caminho "sem fonte": a tela diz
  // "cadastrar fonte", e não aparece um link "abrir" apontando para o sentinela da IA.
  // Leitura ruim de hoje não entra na memória.
  if (leituraSuspeita(r)) {
    return {
      grupo: comResponsavel(
        urlPrimaria
          ? marcarFonteInacessivel(grupo, contatos, urlPrimaria, MOTIVO_LEITURA_SUSPEITA, resolvida.grupoCanonico)
          : compararGrupo(grupo, contatos, undefined, resolvida.grupoCanonico),
        resolvida.responsavel,
      ),
      leituras: SEM_LEITURAS,
    };
  }
  // Ressalva atribuída A CADA fonte que não compôs — sem identificar qual, "HTTP 403" parece
  // falha da primária. Vale para as duas formas de não compor, inclusive a que NÃO suspende o
  // veredito: o usuário tem que saber que aquela fonte não trouxe nada. Fonte secundária
  // reaproveitada pela memória também é anotada aqui (spec 2026-10-20 §5.1, passo 6), sem
  // mudar o veredito. Só rótulo/URL e o motivo técnico: nunca um contato.
  const anotacoes = [
    ...naoContribuiram.map((l) => `${identificarFonte(l.fonte)}: ${l.erro ?? MOTIVO_SEM_NINGUEM}`),
    ...lidas.slice(1).flatMap((l) => (l.reaproveitada ? [`${identificarFonte(l.fonte)}: ${anotacaoReaproveitada(l.reaproveitada)}`] : [])),
  ];
  const erro = algumaContribuiu && anotacoes.length > 0 ? anotacoes.join(" · ") : undefined;
  // Marca o grupo quando a composição dependeu do conhecimento da IA (não 100% oficial).
  const usouConhecimento = composicao.some((p) => p.origem === "conhecimento");
  return {
    grupo: comResponsavel(
      {
        ...r,
        ...(erro ? { erroFonte: erro } : {}),
        // Primária substituída pela guardada: o grupo sai LIDO, com a data e o motivo (§5.1, passo 6).
        ...(primariaReaproveitada && urlPrimaria ? { reaproveitada: { url: urlPrimaria, ...primariaReaproveitada } } : {}),
        ...(usouConhecimento || !urlPrimaria ? { viaPesquisaAmpla: true } : {}),
      },
      resolvida.responsavel,
    ),
    leituras: leiturasBoas(lidas, primariaParcial, agora),
  };
}
```

`analisarGrupoIndividual`: nesta tarefa só muda a assinatura e o tipo de retorno, para o typecheck fechar; o comportamento vem na Task 3. Trocar a assinatura para `(grupo, contatos, resolvida, deps, agora: Date): Promise<AnaliseDoGrupo>`, trocar as duas chamadas `lerFonte(geral, deps)` / `lerFonte(f, deps)` por `lerHoje(geral, deps)` / `lerHoje(f, deps)`, e embrulhar cada `return { ... }` em `{ grupo: { ... }, leituras: SEM_LEITURAS }`.

`resumir`: acrescentar `gruposReaproveitados: 0` na inicialização e, no laço, logo depois da linha de `gruposViaPesquisaAmpla`:

```ts
    if (g.reaproveitada || (g.individuais?.reaproveitadas ?? 0) > 0) resumo.gruposReaproveitados += 1;
```

`analisar`:

```ts
export async function analisar(
  arquivoNome: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
  enderecos?: EnderecoEstruturado[],
): Promise<ResultadoAnalise> {
  const agora = deps.agora?.() ?? new Date();
  const indice = enderecos && enderecos.length > 0 ? indexarEnderecos(enderecos) : undefined;
  const porGrupo = agruparPorGrupo(contatos);
  const analisados = await Promise.all(
    [...porGrupo.entries()].map(([grupo, lista]) => analisarGrupo(grupo, lista, deps, agora)),
  );
  const grupos = analisados.map((a) => anexarEnderecos(a.grupo, indice));
  // A memória que sai desta varredura (spec 2026-10-20 §6, passo 3): a anterior podada,
  // sobreposta pelas leituras boas de hoje e pelas reaproveitadas, com a data original.
  const leituras = mesclarLeituras(deps.leiturasAnteriores ?? {}, analisados.flatMap((a) => a.leituras), agora);
  return { arquivoNome, grupos, resumo: resumir(grupos), leituras };
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/analise.test.ts tests/analise-individual.test.ts` → PASS (os testes antigos continuam passando: sem memória, nada muda).
Run: `npm test` → verde. `npm run typecheck` → limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/analise.ts tests/analise.test.ts
git commit -m "feat: memória de leitura no caminho de grupo (falha total, leitura parcial, IA só sem memória)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Páginas individuais e lista geral (`analisarGrupoIndividual`)

**Files:**
- Modify: `lib/analise.ts` (`analisarGrupoIndividual`)
- Test: `tests/analise-individual.test.ts`

**Interfaces:**
- Consumes: Task 2 (`lerFonte`, `guardar`, `AnaliseDoGrupo`, `SEM_LEITURAS`, `contribuiu`, `individualComConteudo`).
- Produces: `ResultadoContato.leituraDe`, `individuais.reaproveitadas`, `reaproveitada` no grupo quando a geral foi reaproveitada.

- [ ] **Step 1: Testes em `tests/analise-individual.test.ts`**

Acrescentar no fim (fixtures `URL_GERAL`, `URL_MIN`, `URL_GO`, `URL_RS`, `paginaMin`, `paginaGeral`, `paginaGo`, `paginaRs`, `ministra`, `govGo`, `govRs`, `deps` já existem):

```ts
import type { LeiturasGuardadas } from "@/lib/types";

describe("memória de leitura nas páginas individuais e na lista geral (spec 2026-10-20 §5.2)", () => {
  const AGORA = new Date("2026-10-20T12:00:00.000Z");
  const LIDA_EM_16 = "2026-10-16T15:50:29.000Z";
  const memoria = (...conteudos: ConteudoFonte[]): LeiturasGuardadas =>
    Object.fromEntries(conteudos.map((c) => [c.url, { url: c.url, lidaEm: LIDA_EM_16, conteudo: c }]));
  const comMemoria = (mapa: Record<string, ConteudoFonte | string>, leituras: LeiturasGuardadas) => deps(mapa, { leiturasAnteriores: leituras, agora: () => AGORA });

  test("individual com erro e memória válida → contato comparado, verde, leituraDe, individuais.reaproveitadas, grupo lido", async () => {
    const r = await analisar("c.xlsx", [ministra], comMemoria({ [URL_MIN]: "HTTP 429", [URL_GERAL]: paginaGeral }, memoria(paginaMin)));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].leituraDe).toBe(LIDA_EM_16);
    expect(g.individuais).toEqual({ lidas: 0, caidas: 0, reaproveitadas: 1 });
    expect(g.erroFonte).toBeUndefined();
    expect(g.reaproveitada).toBeUndefined();
    expect(r.resumo.gruposReaproveitados).toBe(1);
  });

  test("individual com erro e memória vencida → como hoje: indeterminado, caída, sem leituraDe", async () => {
    const vencida: LeiturasGuardadas = { [URL_MIN]: { url: URL_MIN, lidaEm: "2026-10-12T11:00:00.000Z", conteudo: paginaMin } };
    const r = await analisar("c.xlsx", [ministra], comMemoria({ [URL_MIN]: "HTTP 429", [URL_GERAL]: paginaGeral }, vencida));
    const g = r.grupos[0];
    expect(g.contatos[0].semaforo).toBe("indeterminado");
    expect(g.contatos[0].leituraDe).toBeUndefined();
    expect(g.individuais).toEqual({ lidas: 0, caidas: 1 });
    expect(r.resumo.gruposReaproveitados).toBe(0);
  });

  test("lista geral com erro e memória → cargo conferido, grupo com reaproveitada da geral, conta em reaproveitadas", async () => {
    const r = await analisar("c.xlsx", [ministra], comMemoria({ [URL_MIN]: paginaMin, [URL_GERAL]: "HTTP 403" }, memoria(paginaGeral)));
    const g = r.grupos[0];
    expect(g.contatos[0].semaforo).toBe("verde");
    expect(g.contatos[0].comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
    expect(g.contatos[0].leituraDe).toBeUndefined();
    expect(g.reaproveitada).toEqual({ url: URL_GERAL, lidaEm: LIDA_EM_16, motivo: "HTTP 403" });
    expect(g.individuais).toEqual({ lidas: 1, caidas: 0, reaproveitadas: 1 });
    expect(g.erroFonte).toBeUndefined();
  });

  test("página sem conteúdo legível (CAPTCHA) com memória válida → reaproveitada com o motivo da página vazia", async () => {
    const captcha: ConteudoFonte = { url: URL_MIN, textoLimpo: "What code is in the image?", destaques: [], pessoas: [] };
    const r = await analisar("c.xlsx", [ministra], comMemoria({ [URL_MIN]: captcha, [URL_GERAL]: paginaGeral }, memoria(paginaMin)));
    expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
    expect(r.grupos[0].contatos[0].leituraDe).toBe(LIDA_EM_16);
  });

  test("guarda de grupo conta só as páginas lidas hoje: uma lida hoje sem o nome e uma reaproveitada com o nome → saída e verde, não suspeita", async () => {
    const trocada: ConteudoFonte = { ...paginaGo, pessoas: [{ nome: "Novo Titular do Estado", cargo: "Governador" }], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Novo Titular do Estado") };
    const r = await analisar("c.xlsx", [govGo, govRs], comMemoria({ [URL_GO]: trocada, [URL_RS]: "HTTP 503" }, memoria(paginaRs)));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.contatos[0]).toMatchObject({ semaforo: "vermelho", possivelSaida: true });
    expect(g.contatos[1]).toMatchObject({ semaforo: "verde", leituraDe: LIDA_EM_16 });
    expect(g.individuais).toEqual({ lidas: 1, caidas: 0, reaproveitadas: 1 });
  });

  test("duas lidas hoje sem confirmar ninguém continuam leitura suspeita, mesmo com reaproveitadas confirmando", async () => {
    const semNomes = (url: string): ConteudoFonte => ({ ...paginaGo, url, pessoas: [], textoLimpo: paginaGo.textoLimpo.replace("João Carlos Destaque Silva", "Outro Governador Qualquer") });
    const govMg: ContatoPlanilha = { nome: "Terceiro Governador Exemplo", cargo: "Governador do Estado de Minas Gerais", grupo: "Governadores", ...PROTOCOLO_M };
    const URL_MG = "https://mg.gov.br/governador";
    const paginaMg: ConteudoFonte = { url: URL_MG, textoLimpo: `${paginaGo.textoLimpo} Terceiro Governador Exemplo`, destaques: [], pessoas: [{ nome: "Terceiro Governador Exemplo", cargo: "Governador" }] };
    const resolvida: FonteResolvida = { ...RESOLVIDA_GOV, fontesIndividuais: [...individuaisGov, { url: URL_MG, ativo: true, chave: { uf: "MG" }, campos: ["nome", "cargo"] }] };
    const d = deps({ [URL_GO]: semNomes(URL_GO), [URL_RS]: semNomes(URL_RS), [URL_MG]: "HTTP 503" }, { resolverFonte: resolver(RESOLVIDA_MIN, resolvida), leiturasAnteriores: memoria(paginaMg), agora: () => AGORA });
    const r = await analisar("c.xlsx", [govGo, govRs, govMg], d);
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(r.grupos[0].erroFonte).toBe(MOTIVO_LEITURA_SUSPEITA);
  });

  test("nenhuma página lida hoje, todas pela memória → grupo lido, não inacessível", async () => {
    const r = await analisar("c.xlsx", [govGo, govRs], comMemoria({ [URL_GO]: "HTTP 503", [URL_RS]: "HTTP 503" }, memoria(paginaGo, paginaRs)));
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.contatos.map((c) => c.semaforo)).toEqual(["verde", "verde"]);
    expect(g.individuais).toEqual({ lidas: 0, caidas: 0, reaproveitadas: 2 });
  });

  test("leituras de saída traz a individual lida hoje e a geral, e mantém a reaproveitada com a data original", async () => {
    const r = await analisar("c.xlsx", [ministra, govGo], comMemoria({ [URL_MIN]: paginaMin, [URL_GERAL]: paginaGeral, [URL_GO]: "HTTP 503" }, memoria(paginaGo)));
    expect(r.leituras?.[URL_MIN].lidaEm).toBe(AGORA.toISOString());
    expect(r.leituras?.[URL_GERAL].lidaEm).toBe(AGORA.toISOString());
    expect(r.leituras?.[URL_GO].lidaEm).toBe(LIDA_EM_16);
  });

  test("página individual caída hoje sem memória não entra em leituras; página lida hoje sem conteúdo também não", async () => {
    const captcha: ConteudoFonte = { url: URL_GO, textoLimpo: "What code is in the image?", destaques: [], pessoas: [] };
    const r = await analisar("c.xlsx", [govGo, govRs], comMemoria({ [URL_GO]: captcha, [URL_RS]: "HTTP 503" }, {}));
    expect(r.leituras).toEqual({});
  });
});
```

Se `PROTOCOLO_M`, `RESOLVIDA_GOV`, `RESOLVIDA_MIN`, `individuaisGov` e `resolver` não forem visíveis no escopo do novo `describe` (são `const` de módulo: são), nada a fazer.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/analise-individual.test.ts` → FAIL nos testes novos.

- [ ] **Step 3: Implementar `analisarGrupoIndividual`**

Corpo completo (substitui o da Task 2):

```ts
/**
 * Caminho por contato (spec 2026-10-15 §4 e §5): cada contato é verificado na SUA página
 * individual; a fonte de grupo, quando existe, é a lista de denominações de cargo
 * (`casamento: "cargo"`) ou, se compõe pessoas, só alimenta `novos`. Nenhuma leitura parcial
 * entre individuais: cada contato responde pela sua. A IA não participa. Página individual sem
 * conteúdo legível e geral sem ninguém saem pela leitura guardada válida (spec 2026-10-20 §5.2).
 */
async function analisarGrupoIndividual(
  grupo: string,
  contatos: ContatoPlanilha[],
  resolvida: FonteResolvida,
  deps: Dependencias,
  agora: Date,
): Promise<AnaliseDoGrupo> {
  const grupoCanonico = resolvida.grupoCanonico;
  const ligacoes = contatos.map((c) => ({ contato: c, fonte: fonteIndividualDe(c, resolvida.fontesIndividuais) }));
  // Cada URL é lida UMA vez, mesmo com dois contatos ligados a ela; individual sem contato não é lida.
  const aLer = [...new Map(ligacoes.flatMap((l) => (l.fonte ? [[l.fonte.url, l.fonte] as const] : []))).values()];
  const geral = resolvida.fontes[0];
  // A geral entra na fila do Chrome ANTES das individuais: lida por último, chegava quando o
  // gov.br já limitava os pedidos (HTTP 429 em 2026-10-15) e o cargo de todos ficava sem fonte.
  const leituraGeral = geral ? lerFonte(geral, deps, agora, contribuiu, MOTIVO_PAGINA_SEM_CONTEUDO) : Promise.resolve(undefined);
  const [lidaGeral, lidasInd] = await Promise.all([
    leituraGeral,
    Promise.all(aLer.map((f) => lerFonte(f, deps, agora, individualComConteudo, MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO))),
  ]);
  const porUrl = new Map<string, IndividualLida>(lidasInd.map((l) => [l.fonte.url, l]));

  // Fonte do cargo do grupo: a lista de denominações, ou o motivo de ela não ter vindo.
  const geralContribuiu = lidaGeral !== undefined && contribuiu(lidaGeral);
  const listaCargos: ListaCargos | undefined =
    geral && geral.casamento === "cargo"
      ? geralContribuiu
        ? { url: geral.url, cargos: listaDeCargos(lidaGeral!.conteudo!) }
        : { url: geral.url, erro: lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO }
      : undefined;

  const vereditos = ligacoes.map((l) => {
    if (!l.fonte) {
      return {
        resultado: compararContatoSemIndividual(l.contato, { grupoCanonico, listaCargos, uf: ufDoContato(l.contato) }),
        nomeConfirmado: false,
        lidaHoje: false,
        novos: [] as PessoaSite[],
      };
    }
    const lida = porUrl.get(l.fonte.url)!;
    const v = compararContatoIndividual({ contato: l.contato, fonte: l.fonte, lida, listaCargos, grupoCanonico });
    // Página reaproveitada: o contato é comparado como se ela fosse de hoje; só a data fica registrada (§5.2).
    return {
      ...v,
      resultado: lida.reaproveitada ? { ...v.resultado, leituraDe: lida.reaproveitada.lidaEm } : v.resultado,
      lidaHoje: lida.reaproveitada === undefined,
    };
  });

  // Página reaproveitada não é lida nem caída (§4.1).
  const lidas = lidasInd.filter((l) => individualComConteudo(l) && !l.reaproveitada).length;
  const reaproveitadasInd = lidasInd.filter((l) => l.reaproveitada !== undefined).length;
  const caidas = lidasInd.length - lidas - reaproveitadasInd;
  const geralReaproveitada = lidaGeral?.reaproveitada;
  const reaproveitadas = reaproveitadasInd + (geralReaproveitada ? 1 : 0);
  const individuais = { lidas, caidas, ...(reaproveitadas > 0 ? { reaproveitadas } : {}) };
  const geralFalhou = geral !== undefined && !geralContribuiu;

  // Nenhuma fonte, de grupo ou individual, com conteúdo (hoje ou pela memória): grupo inacessível, como sempre.
  if (aLer.length + (geral ? 1 : 0) > 0 && lidas + reaproveitadasInd === 0 && (geral === undefined || geralFalhou)) {
    const motivo = [
      geral ? `${identificarFonte(geral)}: ${lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO}` : undefined,
      caidas > 0 ? textoIndividuaisCaidas(caidas) : undefined,
    ].filter(Boolean).join(" · ");
    return { grupo: { ...marcarFonteInacessivel(grupo, contatos, geral?.url, motivo, grupoCanonico), individuais }, leituras: SEM_LEITURAS };
  }

  // GUARDA DE GRUPO (§4.3 de 2026-10-15): duas ou mais individuais lidas HOJE com conteúdo e
  // nenhuma confirmou o nome do seu contato é layout que mudou ou bloqueio devolvendo outra
  // página, nunca todo mundo saindo de uma vez. Indeterminado, com o motivo, sem novos. As
  // páginas reaproveitadas não contam: já foram leituras boas (spec 2026-10-20 §5.2).
  const confirmadasHoje = vereditos.filter((v) => v.lidaHoje && v.nomeConfirmado).length;
  if (lidas >= MIN_CONTATOS_LEITURA_SUSPEITA && confirmadasHoje === 0) {
    return { grupo: { ...marcarFonteInacessivel(grupo, contatos, geral?.url, MOTIVO_LEITURA_SUSPEITA, grupoCanonico), individuais }, leituras: SEM_LEITURAS };
  }

  const erros = [
    ...(geralFalhou ? [`${identificarFonte(geral!)}: ${lidaGeral?.erro ?? MOTIVO_PAGINA_SEM_CONTEUDO}`] : []),
    ...lidasInd.filter((l) => !individualComConteudo(l)).map((l) => `${l.fonte.url}: ${l.erro ?? MOTIVO_PAGINA_INDIVIDUAL_SEM_CONTEUDO}`),
  ];
  // Fonte de grupo que compõe pessoas (não é o caso do catálogo de hoje): só propõe inclusão.
  const novosDaGeral =
    geral && geral.casamento !== "cargo" && geralContribuiu
      ? novosForaDaPlanilha(marcarProveniencia(lidaGeral!.conteudo!.pessoas, geral), contatos)
      : [];
  return {
    grupo: {
      grupo,
      ...(geral ? { fonteUrl: geral.url } : {}),
      semFonte: false,
      contatos: vereditos.map((v) => v.resultado),
      novos: [...vereditos.flatMap((v) => v.novos), ...novosDaGeral],
      ...(erros.length > 0 ? { erroFonte: erros.join(" · ") } : {}),
      // A geral é a `fonteUrl` do grupo: reaproveitada, o cabeçalho diz a data e o motivo.
      ...(geral && geralReaproveitada ? { reaproveitada: { url: geral.url, ...geralReaproveitada } } : {}),
      individuais,
    },
    // §4.3: individuais com conteúdo e geral com denominação entram na memória; reaproveitadas voltam com a data original.
    leituras: [
      ...lidasInd.filter(individualComConteudo).map((l) => guardar(l, agora)),
      ...(lidaGeral && contribuiu(lidaGeral) ? [guardar(lidaGeral, agora)] : []),
    ],
  };
}
```

- [ ] **Step 4: Rodar**

Run: `npx vitest run tests/analise-individual.test.ts tests/analise.test.ts` → PASS.
Run: `npm test` → verde. `npm run typecheck` → limpo.

- [ ] **Step 5: Commit**

```bash
git add lib/analise.ts tests/analise-individual.test.ts
git commit -m "feat: memória de leitura nas páginas individuais e na lista geral de cargos

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Rota, páginas e publicação

**Files:**
- Modify: `app/api/analise/route.ts`
- Modify: `app/page.tsx:11`
- Modify: `lib/publicar.ts`
- Test: `tests/publicar.test.ts`

**Interfaces:**
- Consumes: `memoriaDoRetrato` (Task 1), `Dependencias.leiturasAnteriores`/`agora` (Task 2).
- Produces: retrato gravado com `leituras`; resposta ao navegador, painel e Blob sem `leituras`.

- [ ] **Step 1: Teste em `tests/publicar.test.ts`**

```ts
  test("o retrato publicado não leva a memória de leitura (spec 2026-10-20 §6)", () => {
    const comLeituras = {
      ...retrato,
      leituras: { "https://orgao.gov.br": { url: "https://orgao.gov.br", lidaEm: "2026-10-16T15:50:29.000Z", conteudo: { url: "https://orgao.gov.br", textoLimpo: "Texto da página guardada", destaques: [], pessoas: [{ nome: "Pessoa Guardada" }] } } },
    } as unknown as Retrato;
    const pub = enxugarParaPublicar(comLeituras, "2026-10-20T18:00:00.000Z");
    expect("leituras" in pub).toBe(false);
    expect(JSON.stringify(pub)).not.toContain("Pessoa Guardada");
    expect(comLeituras.leituras).toBeDefined();
  });
```

Run: `npx vitest run tests/publicar.test.ts` → FAIL.

- [ ] **Step 2: `lib/publicar.ts`**

Trocar a linha do destructuring por:

```ts
  // A base de endereços inteira (PII) e a memória de leitura (só interessa à máquina) ficam aqui; só `numeroNaBase` segue (spec 2026-10-06 §3; 2026-10-20 §6).
  const { baseEnderecos: _baseEnderecos, leituras: _leituras, ...semBase } = retrato;
```

Run: `npx vitest run tests/publicar.test.ts` → PASS.

- [ ] **Step 3: `app/page.tsx`**

```ts
  // O painel não usa a base de endereços (só o /prodasen) nem a memória de leitura; não vão ao cliente.
  const { baseEnderecos: _base, leituras: _leituras, ...retratoDoPainel } = carga.retrato;
```

- [ ] **Step 4: `app/api/analise/route.ts`**

Imports: `import { armazemPadrao, type Armazem } from "@/lib/armazem";`, `import { memoriaDoRetrato } from "@/lib/memoria-leitura";`, `import type { Retrato } from "@/lib/types";`.

Função auxiliar, antes de `POST`:

```ts
/** Retrato anterior, só para a memória de leitura: ausente ou ilegível vale como "sem memória" (spec 2026-10-20 §10). */
async function lerRetratoAnterior(armazem: Armazem): Promise<Retrato | undefined> {
  try {
    return await armazem.lerRetrato();
  } catch (err) {
    // Só o motivo técnico: o retrato tem PII e nunca vai para o log.
    console.error("[/api/analise] retrato anterior ilegível, varredura sem memória:", err instanceof Error ? err.message : "erro desconhecido");
    return undefined;
  }
}
```

No corpo de `POST`, logo depois de `parsePayloadAnalise`:

```ts
    // Memória de leitura por página (spec 2026-10-20 §6): a do retrato anterior, reconstruída
    // quando ele é de antes do mecanismo. O mesmo relógio vale para a validade e para a data das leituras.
    const agora = new Date();
    const armazem = armazemPadrao();
    const leiturasAnteriores = memoriaDoRetrato(await lerRetratoAnterior(armazem), agora);
```

Em `deps`, acrescentar `leiturasAnteriores, agora: () => agora,`. Trocar `armazemPadrao().gravarRetrato(retrato)` por `armazem.gravarRetrato(retrato)`. Na resposta:

```ts
    // A base inteira tem PII e a memória só interessa à máquina: ambas já estão no arquivo local.
    const { baseEnderecos: _baseGuardada, leituras: _memoria, ...retratoDaResposta } = retrato;
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck` → limpo. `npm test` → verde. `npm run build` → verde.

- [ ] **Step 6: Commit**

```bash
git add app/api/analise/route.ts app/page.tsx lib/publicar.ts tests/publicar.test.ts
git commit -m "feat: rota injeta a memória de leitura e grava o retrato com ela; web e navegador não a recebem

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Painel e export

**Files:**
- Modify: `lib/painel.ts` (`textoIndividuais`, `LinhaProcedencia`, `procedenciaDoContato`; novas `textoReaproveitada`, `textoSituacaoDosGrupos`)
- Modify: `components/painel.tsx` (`EstadoDaFonte`; linha abaixo dos cartões)
- Modify: `components/linha-contato.tsx` (procedência)
- Modify: `lib/export.ts` (`ressalvaDoGrupo` → `ressalvasDoGrupo`, `observacaoCom`)
- Test: `tests/painel.test.ts`, `tests/export.test.ts`

**Interfaces:**
- Consumes: `diaMes`, `descreverMotivoDeHoje`, `anotacaoReaproveitada` (Task 1); campos `reaproveitada`, `leituraDe`, `individuais.reaproveitadas`, `gruposReaproveitados`.
- Produces: `textoReaproveitada(r)`, `textoSituacaoDosGrupos(resumo)`, `LinhaProcedencia.leituraDe?`.

- [ ] **Step 1: Testes em `tests/painel.test.ts`**

Acrescentar `textoReaproveitada` e `textoSituacaoDosGrupos` ao import de `@/lib/painel` e, no fim do arquivo:

```ts
describe("memória de leitura no painel (spec 2026-10-20 §7)", () => {
  const LIDA_EM_16 = "2026-10-16T15:50:29.000Z";

  test("textoReaproveitada descreve a data e o motivo de hoje", () => {
    expect(textoReaproveitada({ url: "https://x", lidaEm: LIDA_EM_16, motivo: "HTTP 403" })).toBe("Leitura de 16/10 reaproveitada: hoje a página não respondeu (HTTP 403)");
    expect(textoReaproveitada({ url: "https://x", lidaEm: LIDA_EM_16, motivo: "página casou 2 de 10 contatos" })).toBe("Leitura de 16/10 reaproveitada: hoje a página casou 2 de 10 contatos");
    expect(textoReaproveitada({ url: "https://x", lidaEm: LIDA_EM_16, motivo: "não trouxe ninguém" })).toBe("Leitura de 16/10 reaproveitada: hoje a página não trouxe ninguém");
  });

  test("textoIndividuais com reaproveitadas; zero some; retrato antigo sem o campo continua igual", () => {
    expect(textoIndividuais({ lidas: 38, caidas: 2, reaproveitadas: 4 })).toBe("38 páginas individuais lidas · 4 reaproveitadas · 2 inacessíveis");
    expect(textoIndividuais({ lidas: 0, caidas: 0, reaproveitadas: 1 })).toBe("0 páginas individuais lidas · 1 reaproveitada");
    expect(textoIndividuais({ lidas: 36, caidas: 2 })).toBe("36 páginas individuais lidas · 2 inacessíveis");
  });

  test("procedência do grupo comum reaproveitado leva leituraDe", () => {
    const g: ResultadoGrupo = { ...grupoComFonte, reaproveitada: { url: "https://orgao.gov.br", lidaEm: LIDA_EM_16, motivo: "HTTP 403" } };
    expect(procedenciaDoContato(contato({}), g)).toEqual([{ rotulo: "Nome e cargo", texto: "https://orgao.gov.br", url: "https://orgao.gov.br", lida: true, leituraDe: LIDA_EM_16 }]);
    expect(procedenciaDoContato(contato({}), grupoComFonte)[0].leituraDe).toBeUndefined();
  });

  test("procedência por contato: leituraDe na linha do nome (página individual) e na do cargo (geral reaproveitada)", () => {
    const g: ResultadoGrupo = { grupo: "Ministros de Estado", fonteUrl: "https://www.gov.br/planalto/lista", semFonte: false, contatos: [], novos: [], individuais: { lidas: 36, caidas: 0, reaproveitadas: 2 }, reaproveitada: { url: "https://www.gov.br/planalto/lista", lidaEm: LIDA_EM_16, motivo: "HTTP 429" } };
    const c: ResultadoContato = {
      ...contato({}), fonteUrl: "https://www.gov.br/exemplo/ministra", leituraDe: "2026-10-19T10:00:00.000Z",
      comparacoes: [
        { campo: "nome", valorPlanilha: "Ana", valorEsperado: "Ana", situacao: "confere", origemValor: "pagina", fonteUrl: "https://www.gov.br/exemplo/ministra" },
        { campo: "cargo", valorPlanilha: "Ministra", valorEsperado: "Ministra", situacao: "confere", origemValor: "pagina", fonteUrl: "https://www.gov.br/planalto/lista" },
      ],
    };
    expect(procedenciaDoContato(c, g).map((l) => [l.rotulo, l.leituraDe])).toEqual([["Nome", "2026-10-19T10:00:00.000Z"], ["Cargo", LIDA_EM_16]]);
  });

  test("textoSituacaoDosGrupos omite zeros, põe 'grupo(s)' na primeira parte e sai vazio com tudo zero", () => {
    expect(textoSituacaoDosGrupos({ gruposSemFonte: 3, gruposFonteInacessivel: 1, gruposViaPesquisaAmpla: 2, gruposReaproveitados: 2 })).toBe("3 grupos sem fonte · 1 inacessível · 2 via IA · 2 com leitura reaproveitada");
    expect(textoSituacaoDosGrupos({ gruposFonteInacessivel: 1 })).toBe("1 grupo inacessível");
    expect(textoSituacaoDosGrupos({ gruposViaPesquisaAmpla: 4, gruposReaproveitados: 1 })).toBe("4 grupos via IA · 1 com leitura reaproveitada");
    expect(textoSituacaoDosGrupos({})).toBe("");
  });

  test("cartoesDoResumo não ganha cartão novo", () => {
    expect(cartoesDoResumo({ gruposReaproveitados: 5 }).map((c) => c.rotulo)).toEqual(["Conferem", "Com divergência", "Possível saída", "Não verificados", "Propostas de inclusão", "Endereços a confirmar"]);
  });
});
```

Em `tests/export.test.ts`, no fim:

```ts
describe("memória de leitura no export (spec 2026-10-20 §7)", () => {
  test("grupo reaproveitado leva a anotação na observação de cada contato, junto com a ressalva de fonte", () => {
    const comMemoria: ResultadoAnalise = {
      ...analise,
      grupos: [{ ...analise.grupos[0], reaproveitada: { url: "https://orgao.gov.br", lidaEm: "2026-10-16T15:50:29.000Z", motivo: "HTTP 403" }, erroFonte: "fora de exercício: HTTP 403" }],
    };
    const linha = resultadoParaLinhas(comMemoria)[0];
    expect(linha.Observacao).toBe("Leitura de 16/10 reaproveitada (HTTP 403) · fonte não respondeu — fora de exercício: HTTP 403");
  });
  test("sem erroFonte, só a anotação", () => {
    const comMemoria: ResultadoAnalise = {
      ...analise,
      grupos: [{ ...analise.grupos[0], reaproveitada: { url: "https://orgao.gov.br", lidaEm: "2026-10-16T15:50:29.000Z", motivo: "página casou 2 de 10 contatos" } }],
    };
    expect(resultadoParaLinhas(comMemoria)[0].Observacao).toBe("Leitura de 16/10 reaproveitada (página casou 2 de 10 contatos)");
  });
});
```

Run: `npx vitest run tests/painel.test.ts tests/export.test.ts` → FAIL.

- [ ] **Step 2: `lib/painel.ts`**

Import: `import { descreverMotivoDeHoje, diaMes } from "@/lib/memoria-leitura";` e `Reaproveitamento` no `import type`.

```ts
/** Cabeçalho do grupo reaproveitado (spec 2026-10-20 §7): "Leitura de 16/10 reaproveitada: hoje a página não respondeu (HTTP 403)". */
export function textoReaproveitada(r: Reaproveitamento): string {
  return `Leitura de ${diaMes(r.lidaEm)} reaproveitada: ${descreverMotivoDeHoje(r.motivo)}`;
}

/** "38 páginas individuais lidas · 4 reaproveitadas · 2 inacessíveis", no cabeçalho do grupo. Partes zeradas somem; retrato antigo não traz `reaproveitadas`. */
export function textoIndividuais(i: { lidas: number; caidas: number; reaproveitadas?: number }): string {
  const partes = [i.lidas === 1 ? "1 página individual lida" : `${i.lidas} páginas individuais lidas`];
  const r = i.reaproveitadas ?? 0;
  if (r > 0) partes.push(`${r} ${r === 1 ? "reaproveitada" : "reaproveitadas"}`);
  if (i.caidas > 0) partes.push(`${i.caidas} ${i.caidas === 1 ? "inacessível" : "inacessíveis"}`);
  return partes.join(" · ");
}

/** Linha de situação dos grupos, abaixo dos cartões (spec 2026-10-20 §7). Vazia quando tudo é zero. */
export function textoSituacaoDosGrupos(r: Partial<ResumoAnalise>): string {
  const n = (v: number | undefined) => v ?? 0;
  const itens = [
    { n: n(r.gruposSemFonte), um: "sem fonte", varios: "sem fonte" },
    { n: n(r.gruposFonteInacessivel), um: "inacessível", varios: "inacessíveis" },
    { n: n(r.gruposViaPesquisaAmpla), um: "via IA", varios: "via IA" },
    { n: n(r.gruposReaproveitados), um: "com leitura reaproveitada", varios: "com leitura reaproveitada" },
  ].filter((i) => i.n > 0);
  return itens
    .map((i, idx) => `${i.n} ${idx === 0 ? (i.n === 1 ? "grupo " : "grupos ") : ""}${i.n === 1 ? i.um : i.varios}`)
    .join(" · ");
}
```

`LinhaProcedencia` e `procedenciaDoContato`:

```ts
/** Uma linha do rodapé de procedência. `lida` é falsa quando a página daquele campo não foi lida nesta varredura; `leituraDe` é a data da leitura reaproveitada (spec 2026-10-20 §7). */
export interface LinhaProcedencia { rotulo: string; texto: string; url?: string; lida: boolean; leituraDe?: string }

export function procedenciaDoContato(c: ResultadoContato, g: ResultadoGrupo): LinhaProcedencia[] {
  const deGrupo = g.reaproveitada ? { leituraDe: g.reaproveitada.lidaEm } : {};
  if (!g.individuais) {
    const p = procedenciaNomeCargo(g);
    return p ? [{ rotulo: "Nome e cargo", ...p, lida: true, ...deGrupo }] : [];
  }
  // Página individual reaproveitada: data no contato; geral reaproveitada: data no grupo, pela URL.
  const leituraDe = (url: string, daIndividual: boolean): { leituraDe?: string } => {
    if (daIndividual && c.leituraDe) return { leituraDe: c.leituraDe };
    if (g.reaproveitada && g.reaproveitada.url === url) return { leituraDe: g.reaproveitada.lidaEm };
    return {};
  };
  const linhas: LinhaProcedencia[] = [];
  const compNome = comparacaoDeValor(c, "nome");
  const nome = compNome?.fonteUrl ?? c.fonteUrl;
  if (nome) linhas.push({ rotulo: "Nome", texto: nome, url: nome, lida: compNome?.situacao !== "nao_verificado", ...leituraDe(nome, true) });
  const compCargo = comparacaoDeValor(c, "cargo");
  const cargo = compCargo?.fonteUrl;
  if (cargo) linhas.push({ rotulo: "Cargo", texto: cargo, url: cargo, lida: compCargo?.situacao !== "nao_verificado", ...leituraDe(cargo, cargo === c.fonteUrl) });
  return linhas;
}
```

- [ ] **Step 3: `components/painel.tsx`**

Import `textoReaproveitada` e `textoSituacaoDosGrupos` de `@/lib/painel`. No ramo "lido" de `EstadoDaFonte`, antes de `{g.viaPesquisaAmpla && ...}`:

```tsx
      {g.reaproveitada && <span className="text-atencao">{textoReaproveitada(g.reaproveitada)} · </span>}
```

Logo depois do `</div>` da grade dos cartões (`cartoesDoResumo`):

```tsx
      {textoSituacaoDosGrupos(retrato.resumo) && <p className="mt-2 text-xs text-cinza">{textoSituacaoDosGrupos(retrato.resumo)}</p>}
```

- [ ] **Step 4: `components/linha-contato.tsx`**

Import `import { diaMes } from "@/lib/memoria-leitura";`. Na lista de procedência:

```tsx
          <li key={p.rotulo}>{p.rotulo}: {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-acao underline">{p.texto}</a> : p.texto}{p.leituraDe ? `, leitura de ${diaMes(p.leituraDe)} reaproveitada` : p.lida ? `, lido em ${textoDataHora(retrato.geradoEm)}` : ", não lida nesta varredura"}</li>
```

- [ ] **Step 5: `lib/export.ts`**

Import `import { anotacaoReaproveitada } from "@/lib/memoria-leitura";`. Substituir `observacaoCom` e `ressalvaDoGrupo`:

```ts
/**
 * Observação do contato mais as ressalvas do grupo (leitura reaproveitada, fonte que não
 * respondeu). Quem trabalha a partir do download precisa das mesmas ressalvas que a tela dá:
 * sem elas, a linha parece um veredito completo.
 */
function observacaoCom(observacao: string | undefined, ressalvas: readonly string[]): string {
  return [observacao, ...ressalvas].filter(Boolean).join(" · ");
}

function primeiraMaiuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Ressalvas do grupo a repetir na linha de cada contato. No grupo inteiro inacessível a
 * observação do contato já diz que a fonte não pôde ser lida: repetir o motivo aqui daria a
 * mesma frase duas vezes na mesma célula. A tela suprime pelo mesmo motivo.
 */
function ressalvasDoGrupo(g: ResultadoGrupo): string[] {
  if (g.fonteInacessivel) return [];
  return [
    ...(g.reaproveitada ? [primeiraMaiuscula(anotacaoReaproveitada(g.reaproveitada))] : []),
    ...(g.erroFonte ? [`fonte não respondeu — ${g.erroFonte}`] : []),
  ];
}
```

Em `resultadoParaLinhas`, `const ressalva = ressalvaDoGrupo(g);` vira `const ressalvas = ressalvasDoGrupo(g);` e as duas chamadas `observacaoCom(…, ressalva)` passam `ressalvas`.

- [ ] **Step 6: Rodar**

Run: `npx vitest run tests/painel.test.ts tests/export.test.ts` → PASS. `npm test` → verde. `npm run typecheck` → limpo. `npm run build` → verde.

- [ ] **Step 7: Commit**

```bash
git add lib/painel.ts components/painel.tsx components/linha-contato.tsx lib/export.ts tests/painel.test.ts tests/export.test.ts
git commit -m "feat: leitura reaproveitada no cabeçalho, na procedência, na linha de situação dos grupos e no export

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Catálogo do TST, CLAUDE.md e script de carga inicial

**Files:**
- Modify: `data/catalogo.ts:402`
- Modify: `tests/catalogo-dados.test.ts`
- Modify: `CLAUDE.md` (estado do projeto, princípios, rotina, tabela de specs)
- Create (fora do git, na pasta de rascunho da sessão): `<scratchpad>/carga/tests/carga-inicial.test.ts`

**Interfaces:**
- Consumes: `reconstruirLeituras`, `mesclarLeituras`, `podarLeituras` (Task 1); `armazemEmArquivo`, `validarRetrato` (`lib/armazem.ts`).

- [ ] **Step 1: Teste do catálogo em `tests/catalogo-dados.test.ts`**

Dentro do `describe("catálogo real …")`:

```ts
  test("Ministros do TST lê /ministros (a antiga /en/ministros responde 404 desde 2026-10-19)", () => {
    const tst = CATALOGO.find((g) => g.nome === "Ministros do TST");
    expect(tst?.fontes.map((f) => f.url)).toEqual(["https://www.tst.jus.br/ministros"]);
  });
```

Run: `npx vitest run tests/catalogo-dados.test.ts` → FAIL.

- [ ] **Step 2: `data/catalogo.ts`**

```ts
    fontes: [
      // 2026-10-20: a antiga `/en/ministros` passou a responder HTTP 404 (medido em 19/10); a
      // página em português responde 200 com a lista (título "Ministros - TST").
      { url: "https://www.tst.jus.br/ministros", ativo: true },
    ],
```

Run: `npx vitest run tests/catalogo-dados.test.ts` → PASS (a contagem de 24 fontes não muda).

- [ ] **Step 3: CLAUDE.md**

- Tabela de specs: a linha de 2026-10-20 passa de "Vigente; a implementar" para "Vigente; implementado".
- "Estado do projeto": acrescentar à suíte o total novo de testes (ler do `npm test`) e a data; registrar "memória de leitura em `.fiscal/retrato.json` (`leituras`)".
- "Princípios de implementação", bullet novo depois de "Fontes individuais por contato":

> - **Memória de leitura por página (spec 2026-10-20).** Toda página lida com sucesso fica em `retrato.leituras`, por URL, com `lidaEm`. A varredura sempre lê de novo; só a fonte que **falhou** (erro, ou primária sem ninguém; individual sem conteúdo legível; geral sem denominação) ou a primária com **leitura parcial** (casou menos da metade dos contatos, em grupo com 2+, e a guardada casa mais) sai pela guardada, válida por 7 dias (`lib/memoria-leitura.ts`). Com a primária reaproveitada a IA não roda; sem memória válida, tudo segue como antes. O grupo reaproveitado sai **lido**, com `reaproveitada: { url, lidaEm, motivo }`; secundária reaproveitada vira anotação em `erroFonte`; página individual reaproveitada marca `leituraDe` no contato. Retrato de antes do mecanismo tem a memória reconstruída das comparações (`reconstruirLeituras`). A memória nunca vai ao navegador nem ao Blob.

- Rotina, passo 4: "(lido, inacessível, via IA, sem fonte, **reaproveitado**)".
- Rotina, passo 5, acrescentar: "Grupo **reaproveitado** pela memória de leitura (cabeçalho "Leitura de DD/MM reaproveitada") **não** trava: a composição é oficial, de até 7 dias. Continua travando o grupo lido antes que vem inacessível ou via IA **sem** leitura guardada válida (memória vencida, ou primeira coleta depois de 7 dias de falha). O relatório lista cada grupo e cada página individual reaproveitados, com a data da leitura e o motivo de hoje."
- Rotina, passo 9: acrescentar "grupos reaproveitados (data e motivo)" na lista.

- [ ] **Step 4: Script de carga inicial (§5.5), fora do git**

Criar `<scratchpad>/carga/tests/carga-inicial.test.ts` (o caminho do scratchpad vem do ambiente da sessão; a pasta `carga/` precisa da subpasta `tests/` por causa do `include` do Vitest). Sem a variável `CARGA_GRAVAR=1` o script só mede e imprime contagens; com ela, grava.

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { armazemEmArquivo, validarRetrato } from "@/lib/armazem";
import { mesclarLeituras, podarLeituras, reconstruirLeituras } from "@/lib/memoria-leitura";

const RAIZ = process.cwd(); // raiz do projeto: o Vitest roda de lá
const ATUAL = join(RAIZ, ".fiscal", "retrato.json");
const DE_16 = join(RAIZ, ".fiscal", "retrato-anterior-2026-10-19.json"); // cópia do retrato de 16/10

test("carga inicial da memória de leitura (spec 2026-10-20 §5.5)", async () => {
  const agora = new Date();
  const atual = validarRetrato(JSON.parse(readFileSync(ATUAL, "utf8")));
  const de16 = validarRetrato(JSON.parse(readFileSync(DE_16, "utf8")));
  if ("leituras" in atual) throw new Error("o retrato atual já tem leituras: a carga inicial não se aplica");
  // 16/10 primeiro, 20/10 por cima: onde os dois têm a URL, vence o mais novo.
  const memoria = mesclarLeituras(reconstruirLeituras(de16), Object.values(reconstruirLeituras(atual)), agora);
  const podada = podarLeituras(memoria, agora);
  // Só URL, data e contagem: nenhum nome no log.
  for (const l of Object.values(podada)) console.log(`${l.lidaEm.slice(0, 10)}  ${l.conteudo.pessoas.length.toString().padStart(3)} pessoas  ${l.url}`);
  console.log(`${Object.keys(podada).length} URLs na memória; retrato de ${atual.geradoEm}`);
  if (process.env.CARGA_GRAVAR !== "1") return;
  await armazemEmArquivo(ATUAL).gravarRetrato({ ...atual, leituras: podada });
  console.log("gravado em", ATUAL);
});
```

Rodar a medição (sem gravar): `npx vitest run --dir "<scratchpad>/carga"`. Esperado: lista de URLs com data e contagem, entre elas a do STF com data 2026-10-16 e 10 pessoas, e a do TST antigo (`/en/ministros`) com 2026-10-16, que não será usada (a URL do catálogo mudou). A gravação (`CARGA_GRAVAR=1`) **não** é passo deste plano: é feita na rotina, depois do merge, imediatamente antes da primeira coleta com o código novo, para não ser perdida por uma coleta com o código antigo.

Observação: a memória de leitura vale 7 dias a partir de `lidaEm`. O retrato de 16/10 vale até 23/10, inclusive; a carga só aproveita o STF de 16/10 se a coleta rodar até essa data. Depois disso a reconstrução de 16/10 é podada e vale só a de 20/10 (STF e TST via IA ficam fora, como manda o §5.4).

- [ ] **Step 5: Verificar e commitar**

Run: `npm test` → verde; `npm run typecheck` → limpo; `npm run build` → verde.

```bash
git add data/catalogo.ts tests/catalogo-dados.test.ts CLAUDE.md
git commit -m "fix: URL do TST para /ministros; rotina e princípios da memória de leitura no CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Autorrevisão do plano

- **Cobertura da spec:** §4.1 tipos (T1); §4.2 constantes (T1); §4.3 o que é guardado (T2 `leiturasBoas`, T3 `leituras` do individual); §4.4 resposta sem `leituras` (T4); §5.1 passos 1 a 7 (T2); §5.2 (T3); §5.3 (T1); §5.4 (T1 `reconstruirLeituras`); §5.5 (T6 script); §6 rota (T4); §7 exibição (T5); §8 rotina (T6 CLAUDE.md); §9 catálogo (T6); §10 erros (T1 `podarLeituras`/`memoriaDoRetrato`, T4 `lerRetratoAnterior`); §11 testes (T1 a T6).
- **Placeholders:** nenhum; todo passo de código traz o código.
- **Consistência de nomes:** `leiturasAnteriores`, `agora`, `Leitura<F>`, `lerHoje`, `lerFonte(fonte, deps, agora, serviu, motivoPadrao)`, `guardar`, `AnaliseDoGrupo`, `SEM_LEITURAS`, `reaproveitarParcial`, `leiturasBoas` definidos na T2 e usados na T3; `textoReaproveitada`, `textoSituacaoDosGrupos`, `LinhaProcedencia.leituraDe` definidos na T5 e usados nos componentes da T5; `MOTIVO_SEM_NINGUEM`, `diaMes`, `anotacaoReaproveitada`, `descreverMotivoDeHoje` definidos na T1 e usados em T2 e T5.
- **Review Focus:** os cinco itens têm teste nomeado na tarefa dona (T1 poda; T2 leitura suspeita com guardada, secundária com memória, grupo de um contato; T3 guarda de grupo).
