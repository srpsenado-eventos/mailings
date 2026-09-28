# Segunda fonte por grupo (senadores fora de exercício) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer um grupo ser fiscalizado contra **todas** as fontes ativas cadastradas nele, para que senador afastado deixe de sair como possível saída e para que o app proponha quem falta no grupo.

**Architecture:** O catálogo (`data/catalogo.ts`) passa a declarar, por fonte, um rótulo, uma extração estruturada de tabela e se aquela fonte propõe inclusão; e, por grupo, a faixa de UFs. O orquestrador (`lib/analise.ts`) raspa todas as fontes ativas em paralelo, marca cada pessoa com a fonte de onde veio e mescla numa composição só. `lib/match.ts` continua puro: usa a proveniência para escrever a nota do veredito e para decidir quais pessoas não casadas viram "novo".

**Tech Stack:** TypeScript, Next.js 15 (App Router), cheerio, Vitest. Sem banco, sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-09-24-segunda-fonte-senadores-fora-de-exercicio.md` — leia antes de começar. O plano argumenta a partir dele.

## Global Constraints

- **`lib/*.ts` são funções puras.** Sem JSX, sem hooks, sem `window`, sem `fetch` fora de `lib/scrape.ts`.
- **Imutabilidade:** nenhuma função de `lib/` muta o input; devolve novo objeto/array.
- **Sem `any`.** `unknown` + narrowing, ou tipo definido.
- **Normalização centralizada** em `lib/normalize.ts` (`normalizarTexto`, `normalizarNome`). Não reimplementar "minúsculas + sem acento".
- **Regra de ouro:** "possível saída" só existe quando há composição real. Página ilegível e IA vazia geram indeterminado, nunca saída.
- **Sem PII no log nem no prompt.** Nada de contato da planilha em `console.*` ou na Camada 2.
- **Gerenciador de pacotes é npm.** `npm test`, `npm run typecheck`, `npm run build`. Não versionar `pnpm-lock.yaml` nem `pnpm-workspace.yaml`.
- **Testes:** Vitest, padrão AAA, nomes em português descrevendo o comportamento. Sem internet real — fixtures em `tests/fixtures/`.
- **Commits:** conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`), em português, terminando com a linha `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branch de trabalho:** `feat/segunda-fonte-senadores` (já criada, com o spec commitado).

## Review Focus

Classes de entrada que o spec pressupõe e que só existem no mundo real. Cada uma tem o teste apontado na tarefa que é dona do código:

1. **Linha da tabela mais curta que o índice cadastrado** (célula ausente, `rowspan`): tem que ser ignorada, não virar pessoa de nome vazio nem lançar. → Task 2, Step 6.
2. **Seção cadastrada escrita com acento/caixa diferente do site** ("Assunção de cargo" × "ASSUNÇÃO DE CARGO CONFORME RISF"): o casamento é normalizado e por prefixo, senão o cadastro fica refém da grafia do dia. → Task 2, Step 8.
3. **Linha de cabeçalho no meio da tabela** (`<th>` repetido, como na 2ª tabela do Senado): não pode virar pessoa chamada "Nome". → Task 2, Step 10.
4. **A mesma pessoa publicada nas duas fontes:** não pode contar duas vezes na composição nem virar "novo" depois de já ter casado pela outra fonte. → Task 3, Step 6.
5. **A página mudou de estrutura** (índice de tabela inexistente, colunas remanejadas): a extração devolve zero pessoas e o grupo cai para **indeterminado**, nunca para saída falsa. → Task 2, Step 12 e Task 3, Step 10.

---

## Arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `lib/types.ts` | `ExtracaoTabela`, campos novos de `FonteCatalogo`, `GrupoCatalogo.ufs`, proveniência em `PessoaSite` | 1 |
| `lib/catalogo.ts` | `FonteResolvida` devolve todas as fontes ativas + a faixa de UF | 1 |
| `lib/scrape.ts` | `extrairTabela` e `raspar` com opções | 2 |
| `lib/analise.ts` | lê N fontes, marca proveniência, mescla, decide indeterminado | 3 |
| `lib/match.ts` | `unirFontes`, nota do veredito, "novos" filtrados | 3 e 4 |
| `data/catalogo.ts` | cadastro das duas fontes e das faixas de UF nos 3 grupos de Senadores | 5 |
| `app/api/analise/route.ts` | injeta `raspar` com a configuração da fonte | 3 |
| `components/resultado-tabela.tsx`, `lib/export.ts` | mostram a nota da fonte | 6 |
| `tests/fixtures/senado-*.html` | recortes das duas páginas | 2 |

---

### Task 1: Catálogo aceita várias fontes, com rótulo e faixa de UF

**Files:**
- Modify: `lib/types.ts` (`FonteCatalogo`, `GrupoCatalogo`, `PessoaSite`)
- Modify: `lib/catalogo.ts:60-108` (`FonteResolvida`, `resolverGrupoEFonte`)
- Test: `tests/catalogo.test.ts`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: `ExtracaoTabela`, `FonteCatalogo` com `rotulo?`/`tabela?`/`propoeInclusao?`, `GrupoCatalogo.ufs?`, `PessoaSite` com `uf?`/`rotuloFonte?`/`fonteUrl?`/`propoeInclusao?`, e `FonteResolvida { grupoCanonico?, fontes: FonteCatalogo[], ufs?, sugestoes }`.

- [ ] **Step 1: Escreva o teste que falha**

Em `tests/catalogo.test.ts`, dentro do `describe("resolverGrupoEFonte")`:

```ts
  test("devolve todas as fontes ativas do grupo, na ordem do cadastro", () => {
    const r = resolverGrupoEFonte("Senadores (Maranhão ao Piauí)", [
      {
        nome: "Senadores (Maranhão ao Piauí)",
        ufs: ["MA", "PI"],
        fontes: [
          { url: "https://senado.leg.br/em-exercicio", ativo: true },
          { url: "https://senado.leg.br/fora-de-exercicio", ativo: true, rotulo: "fora de exercício" },
        ],
      },
    ]);
    expect(r.fontes.map((f) => f.url)).toEqual([
      "https://senado.leg.br/em-exercicio",
      "https://senado.leg.br/fora-de-exercicio",
    ]);
    expect(r.ufs).toEqual(["MA", "PI"]);
  });

  test("fonte inativa fica de fora da composição", () => {
    const r = resolverGrupoEFonte("STF", [
      {
        nome: "STF",
        fontes: [
          { url: "https://stf.jus.br/atual", ativo: true },
          { url: "https://stf.jus.br/antiga", ativo: false },
        ],
      },
    ]);
    expect(r.fontes.map((f) => f.url)).toEqual(["https://stf.jus.br/atual"]);
  });

  test("grupo sem fonte cadastrada devolve lista vazia, não undefined", () => {
    const r = resolverGrupoEFonte("Ex-Senadores", [{ nome: "Ex-Senadores", fontes: [] }]);
    expect(r.grupoCanonico).toBe("Ex-Senadores");
    expect(r.fontes).toEqual([]);
  });
```

- [ ] **Step 2: Rode o teste e confirme que falha**

Run: `npx vitest run tests/catalogo.test.ts -t "todas as fontes ativas"`
Expected: FAIL — `r.fontes` é `undefined` (a interface atual só tem `url`).

- [ ] **Step 3: Acrescente os tipos**

Em `lib/types.ts`, substitua a interface `FonteCatalogo` e acrescente `ExtracaoTabela` logo antes dela:

```ts
/**
 * Extração estruturada de uma página que publica a lista como tabela. Declarada no
 * catálogo, por fonte: os índices de coluna e os nomes de seção são cadastro, não
 * dedução em tempo de execução. Ver
 * docs/superpowers/specs/2026-09-24-segunda-fonte-senadores-fora-de-exercicio.md
 */
export interface ExtracaoTabela {
  /** Índice da tabela na página, 0-based. Padrão: 0. */
  indice?: number;
  /** Índice da coluna, 0-based. `nome` é obrigatório; as demais, quando a página publica. */
  colunas: { nome: number; uf?: number; motivo?: number };
  /**
   * Só as linhas sob estas seções entram na composição. Casamento normalizado e por
   * prefixo. Lista vazia ou ausente = todas as seções entram.
   */
  secoes?: readonly string[];
}

/** Fonte oficial de um grupo no catálogo versionado (`data/catalogo.ts`). */
export interface FonteCatalogo {
  url: string;
  ativo: boolean;
  /**
   * Nota curta mostrada no veredito de quem casar por esta fonte ("fora de exercício").
   * Ausente na fonte principal: casar por ela é o caso normal e não merece nota.
   */
  rotulo?: string;
  /** A página publica a lista como tabela; sem isto vale a extração de texto padrão. */
  tabela?: ExtracaoTabela;
  /**
   * Pessoas desta fonte sem par na planilha viram "novo". Padrão `false`: uma fonte só
   * compõe o grupo; propor inclusão é decisão de cadastro.
   */
  propoeInclusao?: boolean;
}
```

Ainda em `lib/types.ts`, acrescente o campo em `GrupoCatalogo`, depois de `fontes`:

```ts
  /**
   * UFs que pertencem ao grupo, quando ele é uma faixa geográfica ("Senadores (Acre a
   * Goiás)"). Filtra **apenas** a proposta de inclusão: para casar contato existente a
   * composição inteira vale, senão contato arquivado na faixa errada viraria "saída".
   */
  ufs?: readonly string[];
```

E acrescente a proveniência em `PessoaSite`, depois de `contexto`:

```ts
  /** UF publicada pela fonte (só em fonte tabular que tenha a coluna). */
  uf?: string;
  /** Rótulo da fonte de onde a pessoa veio ("fora de exercício"). */
  rotuloFonte?: string;
  /** URL da fonte de onde a pessoa veio. */
  fonteUrl?: string;
  /** A fonte de origem propõe inclusão: não casar com ninguém faz desta pessoa um "novo". */
  propoeInclusao?: boolean;
```

- [ ] **Step 4: Faça `resolverGrupoEFonte` devolver as fontes**

Em `lib/catalogo.ts`, substitua a interface `FonteResolvida` e a função `resolverGrupoEFonte`:

```ts
/** Resolução de grupo: casamento com o cadastro + fontes oficiais + sugestões. */
export interface FonteResolvida {
  /** Nome do grupo como cadastrado. `undefined` quando nenhum grupo casa. */
  grupoCanonico?: string;
  /**
   * TODAS as fontes ativas dos grupos casados, na ordem do catálogo. A primeira é a
   * primária: é ela que vai em `ResultadoGrupo.fonteUrl` e que alimenta a Camada 2.
   */
  fontes: FonteCatalogo[];
  /** Faixa de UFs do grupo casado, quando cadastrada. Filtra proposta de inclusão. */
  ufs?: readonly string[];
  /** Quando nada casa: nomes cadastrados mais próximos, para orientar o usuário. */
  sugestoes: string[];
}

export function resolverGrupoEFonte(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): FonteResolvida {
  const segmentos = segmentarGrupo(grupoNome);
  if (segmentos.length === 0) return { fontes: [], sugestoes: [] };

  const casados = gruposQueCasam(catalogo, segmentos);
  if (casados.length === 0) {
    return { fontes: [], sugestoes: sugerirGrupos(segmentos, catalogo.map((g) => g.nome)) };
  }

  const fontes = casados.flatMap((g) => g.fontes).filter((f) => f.ativo);
  // Prefere o nome do grupo que de fato fornece a fonte primária; senão, o 1º casado.
  const dono = casados.find((g) => g.fontes.some((f) => f.ativo && f.url === fontes[0]?.url));
  const grupo = dono ?? casados[0];
  return {
    grupoCanonico: grupo.nome,
    fontes,
    ...(grupo.ufs ? { ufs: grupo.ufs } : {}),
    sugestoes: [],
  };
}
```

- [ ] **Step 5: Rode os testes do arquivo**

Run: `npx vitest run tests/catalogo.test.ts`
Expected: os três testes novos passam. Os testes antigos de `resolverGrupoEFonte` que afirmam `r.url` vão falhar — é esperado, o Step 6 os converte.

- [ ] **Step 6: Converta os testes antigos que liam `r.url`**

Em `tests/catalogo.test.ts`, no `describe("resolverGrupoEFonte")`, troque cada `expect(r.url).toBe(X)` por `expect(r.fontes[0]?.url).toBe(X)` e cada `expect(r.url).toBeUndefined()` por `expect(r.fontes).toEqual([])`. Não mexa no `describe("buscarFontePrimaria")`: aquela função continua devolvendo só a URL primária e segue no ar.

- [ ] **Step 7: Rode o arquivo inteiro e o typecheck**

Run: `npx vitest run tests/catalogo.test.ts && npm run typecheck`
Expected: testes passam; `tsc` acusa `lib/analise.ts` usando `resolvida.url`, que a Task 3 corrige. Se quiser o typecheck limpo agora, pare aqui e faça a Task 3 antes de commitar — mas o commit deste passo é legítimo: `lib/analise.ts` ainda não foi tocado.

- [ ] **Step 8: Commit**

```bash
git add lib/types.ts lib/catalogo.ts tests/catalogo.test.ts
git commit -m "feat: catálogo resolve todas as fontes ativas do grupo, com rótulo e faixa de UF

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Extração estruturada de tabela

**Files:**
- Create: `tests/fixtures/senado-fora-de-exercicio.html`
- Create: `tests/fixtures/senado-em-exercicio.html`
- Create: `tests/scrape-tabela.test.ts`
- Modify: `lib/scrape.ts` (nova função `extrairTabela`; `raspar` ganha opções)

**Interfaces:**
- Consumes: `ExtracaoTabela` e `PessoaSite` da Task 1.
- Produces: `extrairTabela(html: string, url: string, cfg: ExtracaoTabela): ConteudoFonte` e `raspar(url: string, opcoes?: { tabela?: ExtracaoTabela; timeoutMs?: number }): Promise<ConteudoFonte>`.

- [ ] **Step 1: Crie a fixture da página de fora de exercício**

`tests/fixtures/senado-fora-de-exercicio.html` — recorte da página real de 2026-09-24, com as quatro seções representadas e telefone/e-mail fora (a página não os publica). Duas tabelas, como no original:

```html
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Senadores Fora de Exercício</title></head>
<body>
<nav><a href="/web/senadores/em-exercicio">Senadores em Exercício</a></nav>
<h1>Senadores Fora de Exercício</h1>
<table class="table">
  <tr><th>Nome</th><th>Partido</th><th>UF</th><th>Motivo do afastamento</th></tr>
  <tr><td colspan="4"><strong>Assunção de cargo conforme RISF Art. 39, II</strong></td></tr>
  <tr><td><a href="/perfil/5996">Diego Tavares</a></td><td>PP</td><td>PB</td><td><span>Ocupação de cargo de ministro/secretário</span></td></tr>
  <tr><td><a href="/perfil/5016">Wellington Dias</a></td><td>PT</td><td>PI</td><td><span>Ocupação de cargo de ministro/secretário</span></td></tr>
  <tr><td colspan="4"><strong>Licença com convocação de suplente (superior a 120 dias)</strong></td></tr>
  <tr><td><a href="/perfil/6000">Ana Paula Lobato</a></td><td>PSB</td><td>MA</td><td><span>Licença com convocação de suplente (superior a 120 dias)</span></td></tr>
  <tr><td><a href="/perfil/5990">Eduardo Girão</a></td><td>NOVO</td><td>CE</td><td><span>Licença com convocação de suplente (superior a 120 dias)</span></td></tr>
  <tr><td colspan="4"><strong>Suplentes que exerceram o cargo</strong></td></tr>
  <tr><td><a href="/perfil/6100">Ney Suassuna</a></td><td>REPUBLICANOS</td><td>PB</td><td><span>Retorno do titular</span></td></tr>
  <tr><td><a href="/perfil/6101">Augusta Brito</a></td><td>PT</td><td>CE</td><td><span>Retorno do titular</span></td></tr>
</table>
<table class="table">
  <tr><th>Nome</th><th>Partido</th><th>UF</th><th>Motivo do afastamento</th></tr>
  <tr><td colspan="4"><strong>Falecimento</strong></td></tr>
  <tr><td><a href="/perfil/751">Arolde de Oliveira</a></td><td>PSD</td><td>RJ</td><td><span>Falecimento</span></td></tr>
  <tr><td colspan="4"><strong>Renúncia</strong></td></tr>
  <tr><td><a href="/perfil/5352">Flávio Dino</a></td><td>PSB</td><td>MA</td><td><span>Renúncia</span></td></tr>
</table>
</body>
</html>
```

- [ ] **Step 2: Crie a fixture da página em exercício**

`tests/fixtures/senado-em-exercicio.html` — mesma estrutura da página real (seis colunas, linha de seção por UF), com telefone e e-mail neutralizados e incluindo **Weverton**, o nome de uma palavra que o extrator de texto perde:

```html
<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Senadores em Exercício</title></head>
<body>
<h1>Senadores em Exercício</h1>
<h2>57ª Legislatura (2023 - 2027)</h2>
<table class="table">
  <tr><th>Nome</th><th>Partido</th><th>UF</th><th>Período</th><th>Telefones</th><th>Correio Eletrônico</th></tr>
  <tr class="search-group-row"><td colspan="6"><strong>AC - Acre</strong></td></tr>
  <tr><td class="nowrap"><a href="/perfil/5672">Alan Rick</a></td><td>REPUBLICANOS</td><td>AC</td><td>2023 - 2031</td><td>(61) 0000-0000</td><td>sen.exemplo@senado.leg.br</td></tr>
  <tr class="search-group-row"><td colspan="6"><strong>MA - Maranhão</strong></td></tr>
  <tr><td class="nowrap"><a href="/perfil/5000">Weverton</a></td><td>PDT</td><td>MA</td><td>2019 - 2027</td><td>(61) 0000-0000</td><td>sen.exemplo@senado.leg.br</td></tr>
  <tr class="search-group-row"><td colspan="6"><strong>PI - Piauí</strong></td></tr>
  <tr><td class="nowrap"><a href="/perfil/5001">Eliane Nogueira</a></td><td>PP</td><td>PI</td><td>2022 - 2031</td><td>(61) 0000-0000</td><td>sen.exemplo@senado.leg.br</td></tr>
</table>
</body>
</html>
```

- [ ] **Step 3: Escreva os testes que falham**

Crie `tests/scrape-tabela.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extrairTabela } from "@/lib/scrape";

const FORA = readFileSync(join(__dirname, "fixtures/senado-fora-de-exercicio.html"), "utf8");
const EXERCICIO = readFileSync(join(__dirname, "fixtures/senado-em-exercicio.html"), "utf8");
const URL_FORA = "https://www25.senado.leg.br/web/senadores/fora-de-exercicio";
const URL_EXERCICIO = "https://www25.senado.leg.br/web/senadores/em-exercicio";

const CFG_FORA = {
  colunas: { nome: 0, uf: 2, motivo: 3 },
  secoes: ["Assunção de cargo", "Licença com convocação de suplente"],
};

describe("extrairTabela", () => {
  test("traz só as seções cadastradas, com UF e motivo", () => {
    const c = extrairTabela(FORA, URL_FORA, CFG_FORA);
    expect(c.pessoas.map((p) => p.nome)).toEqual([
      "Diego Tavares",
      "Wellington Dias",
      "Ana Paula Lobato",
      "Eduardo Girão",
    ]);
    expect(c.pessoas[0].uf).toBe("PB");
    expect(c.pessoas[0].contexto).toBe("Ocupação de cargo de ministro/secretário");
  });

  test("suplente que exerceu, falecido e renunciante ficam fora da composição", () => {
    const nomes = extrairTabela(FORA, URL_FORA, CFG_FORA).pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Ney Suassuna");
    expect(nomes).not.toContain("Augusta Brito");
    expect(nomes).not.toContain("Arolde de Oliveira");
    expect(nomes).not.toContain("Flávio Dino");
  });

  test("senador de nome de uma palavra é extraído (o extrator de texto o perde)", () => {
    const c = extrairTabela(EXERCICIO, URL_EXERCICIO, { colunas: { nome: 0, uf: 2 } });
    expect(c.pessoas.map((p) => p.nome)).toContain("Weverton");
    expect(c.pessoas.find((p) => p.nome === "Weverton")?.uf).toBe("MA");
  });
});
```

- [ ] **Step 4: Rode e confirme que falha**

Run: `npx vitest run tests/scrape-tabela.test.ts`
Expected: FAIL — `extrairTabela` não existe (`SyntaxError`/import inválido).

- [ ] **Step 5: Implemente `extrairTabela`**

Em `lib/scrape.ts`, acrescente depois de `extrairConteudo` (por volta da linha 340). Importe `ExtracaoTabela` no `import type` do topo do arquivo:

```ts
/**
 * Extração estruturada de página-lista: lê a tabela linha a linha em vez de achatar o
 * texto. Existe porque o caminho de texto depende de heurística de nome (precisa de
 * sobrenome, corta linha curta) e, numa tabela, a célula JÁ é o dado — o que devolve os
 * senadores de nome de uma palavra e mantém fora as seções que não são do grupo.
 *
 * Uma linha com uma célula só é cabeçalho de seção (`colspan`) e passa a valer para as
 * linhas seguintes. Linha só de `<th>` é ignorada. Linha sem a célula do nome é ignorada:
 * se a página mudar de estrutura, o resultado é composição vazia — e o orquestrador
 * transforma isso em indeterminado, nunca em possível saída.
 */
export function extrairTabela(html: string, url: string, cfg: ExtracaoTabela): ConteudoFonte {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const tabela = $("table").eq(cfg.indice ?? 0);
  const aceitas = (cfg.secoes ?? []).map(normalizarTexto).filter((s) => s.length > 0);
  const pessoas: PessoaSite[] = [];
  const linhas: string[] = [];
  let secao = "";

  tabela.find("tr").each((_, tr) => {
    const celulas = $(tr).find("td");
    if (celulas.length === 0) return; // linha só de cabeçalho (<th>)
    const texto = (i: number): string | undefined =>
      celulas.eq(i).text().replace(/\s+/g, " ").trim() || undefined;

    if (celulas.length === 1) {
      secao = texto(0) ?? "";
      return;
    }
    const nome = texto(cfg.colunas.nome);
    if (!nome) return;
    if (aceitas.length > 0) {
      const secaoNorm = normalizarTexto(secao);
      if (!aceitas.some((s) => secaoNorm.startsWith(s))) return;
    }
    const uf = cfg.colunas.uf === undefined ? undefined : texto(cfg.colunas.uf);
    const motivo = cfg.colunas.motivo === undefined ? undefined : texto(cfg.colunas.motivo);
    pessoas.push({
      nome,
      origem: "pagina",
      ...(uf ? { uf } : {}),
      ...(motivo ? { contexto: motivo } : {}),
    });
    linhas.push([nome, uf, motivo].filter(Boolean).join(" — "));
  });

  return { url, textoLimpo: linhas.join("\n"), destaques: [], pessoas };
}
```

- [ ] **Step 6: Teste da linha curta (Review Focus 1)**

Acrescente em `tests/scrape-tabela.test.ts`:

```ts
  test("linha com menos colunas que o cadastro é ignorada, sem lançar", () => {
    const html = `<table>
      <tr><td colspan="4"><strong>Assunção de cargo conforme RISF Art. 39, II</strong></td></tr>
      <tr><td>Fulano de Tal</td><td>PP</td></tr>
      <tr><td>Beltrano de Tal</td><td>PT</td><td>PI</td><td>Ocupação de cargo</td></tr>
    </table>`;
    const c = extrairTabela(html, URL_FORA, CFG_FORA);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal", "Beltrano de Tal"]);
    expect(c.pessoas[0].uf).toBeUndefined();
  });
```

A linha curta ainda é pessoa (o nome está lá); o que não pode é quebrar nem inventar UF. Rode: `npx vitest run tests/scrape-tabela.test.ts -t "menos colunas"` → PASS.

- [ ] **Step 7: Rode os três primeiros testes**

Run: `npx vitest run tests/scrape-tabela.test.ts`
Expected: PASS em todos.

- [ ] **Step 8: Teste da grafia da seção (Review Focus 2)**

```ts
  test("seção casa sem depender de acento, caixa ou do resto da frase", () => {
    const html = `<table>
      <tr><td colspan="4"><strong>ASSUNÇÃO DE CARGO CONFORME RISF ART. 39, II</strong></td></tr>
      <tr><td>Fulano de Tal</td><td>PP</td><td>PB</td><td>Ocupação de cargo</td></tr>
    </table>`;
    const c = extrairTabela(html, URL_FORA, CFG_FORA);
    expect(c.pessoas.map((p) => p.nome)).toEqual(["Fulano de Tal"]);
  });
```

Run: `npx vitest run tests/scrape-tabela.test.ts -t "sem depender de acento"`
Expected: PASS (`normalizarTexto` + `startsWith` já resolvem).

- [ ] **Step 9: Rode e confirme**

Run: `npx vitest run tests/scrape-tabela.test.ts`
Expected: PASS.

- [ ] **Step 10: Teste do cabeçalho repetido (Review Focus 3)**

```ts
  test("cabeçalho repetido no meio da tabela não vira pessoa", () => {
    const nomes = extrairTabela(FORA, URL_FORA, { colunas: { nome: 0, uf: 2, motivo: 3 } })
      .pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Nome");
    expect(nomes).not.toContain("Partido");
  });
```

Sem `secoes`, todas as seções da 1ª tabela entram — o que este teste checa é só que linha de `<th>` não vira gente. Run: `npx vitest run tests/scrape-tabela.test.ts -t "cabeçalho repetido"` → PASS.

- [ ] **Step 11: Rode o arquivo**

Run: `npx vitest run tests/scrape-tabela.test.ts`
Expected: PASS.

- [ ] **Step 12: Teste da página que mudou de estrutura (Review Focus 5)**

```ts
  test("índice de tabela inexistente devolve composição vazia, não lança", () => {
    const c = extrairTabela(FORA, URL_FORA, { ...CFG_FORA, indice: 9 });
    expect(c.pessoas).toEqual([]);
    expect(c.textoLimpo).toBe("");
  });

  test("seção cadastrada que sumiu da página devolve composição vazia", () => {
    const c = extrairTabela(FORA, URL_FORA, { colunas: { nome: 0 }, secoes: ["Seção que não existe"] });
    expect(c.pessoas).toEqual([]);
  });
```

Run: `npx vitest run tests/scrape-tabela.test.ts` → PASS.

- [ ] **Step 13: Ligue a configuração ao `raspar`**

Em `lib/scrape.ts`, substitua a assinatura de `raspar` (linha 345) por uma que aceita a configuração da fonte:

```ts
/** Opções de raspagem de uma fonte cadastrada. */
export interface OpcoesRaspagem {
  /** Extração estruturada declarada no catálogo. Ausente → extração de texto padrão. */
  tabela?: ExtracaoTabela;
  timeoutMs?: number;
}

export async function raspar(url: string, opcoes: OpcoesRaspagem = {}): Promise<ConteudoFonte> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opcoes.timeoutMs ?? 15000);
  try {
    const html = await baixarHtml(url, ctrl.signal);
    if (!html.trim()) throw new ScrapeError(url, "HTML vazio");
    return opcoes.tabela
      ? extrairTabela(html, url, opcoes.tabela)
      : extrairConteudo(html, url);
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    throw new ScrapeError(url, err instanceof Error ? err.message : "erro desconhecido");
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 14: Rode a suíte de scrape e o typecheck**

Run: `npx vitest run tests/scrape.test.ts tests/scrape-tabela.test.ts && npm run typecheck`
Expected: testes passam. Se algum teste antigo chamava `raspar(url, 5000)`, troque por `raspar(url, { timeoutMs: 5000 })`. O `tsc` ainda acusa `lib/analise.ts` (Task 3).

- [ ] **Step 15: Commit**

```bash
git add lib/scrape.ts tests/scrape-tabela.test.ts tests/fixtures/senado-em-exercicio.html tests/fixtures/senado-fora-de-exercicio.html
git commit -m "feat: extração estruturada de tabela para páginas-lista

Devolve os senadores de nome de uma palavra, que a extração de texto
perde, e permite cadastrar quais seções da página entram na composição.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Orquestrador lê todas as fontes e compõe com proveniência

**Files:**
- Modify: `lib/match.ts` (nova função `unirFontes`)
- Modify: `lib/analise.ts` (`Dependencias.raspar`, `analisarGrupo`)
- Modify: `app/api/analise/route.ts:28-31`
- Test: `tests/match.test.ts`, `tests/analise.test.ts`

**Interfaces:**
- Consumes: `FonteResolvida.fontes` (Task 1), `raspar(url, opcoes)` (Task 2).
- Produces: `unirFontes(listas: PessoaSite[][]): PessoaSite[]`; `Dependencias.raspar: (fonte: FonteCatalogo) => Promise<ConteudoFonte>`; `ResultadoGrupo.erroFonte` passa a existir também em grupo que leu alguma fonte.

- [ ] **Step 1: Escreva o teste de `unirFontes`**

Em `tests/match.test.ts`:

```ts
describe("unirFontes", () => {
  test("mantém a ordem das fontes e não duplica quem aparece nas duas", () => {
    const primaria = [{ nome: "Alan Rick", fonteUrl: "https://a" }];
    const secundaria = [
      { nome: "Alan Rick", fonteUrl: "https://b", rotuloFonte: "fora de exercício" },
      { nome: "Wellington Dias", fonteUrl: "https://b", rotuloFonte: "fora de exercício" },
    ];
    const unida = unirFontes([primaria, secundaria]);
    expect(unida.map((p) => p.nome)).toEqual(["Alan Rick", "Wellington Dias"]);
    expect(unida[0].fonteUrl).toBe("https://a");
  });

  test("lista vazia de fontes devolve composição vazia", () => {
    expect(unirFontes([])).toEqual([]);
  });
});
```

Acrescente `unirFontes` ao import de `@/lib/match` no topo do arquivo.

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/match.test.ts -t "unirFontes"`
Expected: FAIL — `unirFontes` não é exportada.

- [ ] **Step 3: Implemente `unirFontes`**

Em `lib/match.ts`, logo depois de `mesclarComposicao`:

```ts
/**
 * Une as composições das várias fontes ativas de um grupo, na ordem do catálogo. A
 * primeira fonte que publica alguém vence: a mesma autoridade pode constar em duas
 * páginas do mesmo órgão, e contá-la duas vezes duplicaria a proposta de inclusão e
 * bagunçaria o casamento por índice de `compararGrupo`.
 */
export function unirFontes(listas: PessoaSite[][]): PessoaSite[] {
  const unida: PessoaSite[] = [];
  for (const lista of listas) {
    for (const pessoa of lista) {
      const repetida = unida.some((p) => pontuarPessoa(p.nome, pessoa.nome) >= LIMIAR_PESSOA);
      if (!repetida) unida.push(pessoa);
    }
  }
  return unida;
}
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/match.test.ts -t "unirFontes"`
Expected: PASS.

- [ ] **Step 5: Escreva o teste do orquestrador com duas fontes**

Em `tests/analise.test.ts`, acrescente um bloco novo. Note que `resolverFonte` agora devolve `fontes` e `raspar` recebe a fonte inteira:

```ts
describe("analisar com duas fontes no mesmo grupo", () => {
  const PRIMARIA = "https://senado.leg.br/em-exercicio";
  const SECUNDARIA = "https://senado.leg.br/fora-de-exercicio";

  const depsSenadores: Dependencias = {
    resolverFonte: () => ({
      grupoCanonico: "Senadores (Maranhão ao Piauí)",
      fontes: [
        { url: PRIMARIA, ativo: true },
        { url: SECUNDARIA, ativo: true, rotulo: "fora de exercício", propoeInclusao: true },
      ],
      ufs: ["MA", "PI"],
      sugestoes: [],
    }),
    raspar: async (fonte) =>
      fonte.url === PRIMARIA
        ? {
            url: PRIMARIA,
            textoLimpo: "Weverton — MA",
            destaques: [],
            pessoas: [{ nome: "Weverton", uf: "MA", origem: "pagina" as const }],
          }
        : {
            url: SECUNDARIA,
            textoLimpo: "Wellington Dias — PI",
            destaques: [],
            pessoas: [
              { nome: "Wellington Dias", uf: "PI", contexto: "Ocupação de cargo de ministro/secretário", origem: "pagina" as const },
            ],
          },
    extrairComposicao: async () => [],
  };

  const senadores: ContatoPlanilha[] = [
    { nome: "Weverton", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
    { nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK },
  ];

  test("contato que só consta na fonte secundária não é possível saída", async () => {
    const r = await analisar("c.xlsx", senadores, depsSenadores);
    const wellington = r.grupos[0].contatos.find((c) => c.contato.nome === "Wellington Dias");
    expect(wellington?.possivelSaida).toBeUndefined();
    expect(wellington?.semaforo).toBe("verde");
  });

  test("o grupo aponta para a fonte primária", async () => {
    const r = await analisar("c.xlsx", senadores, depsSenadores);
    expect(r.grupos[0].fonteUrl).toBe(PRIMARIA);
    expect(r.grupos[0].semFonte).toBe(false);
  });
});
```

- [ ] **Step 6: Teste da pessoa publicada nas duas fontes (Review Focus 4)**

Ainda no mesmo `describe`:

```ts
  test("quem aparece nas duas fontes conta uma vez só e não vira novo", async () => {
    const depsRepetido: Dependencias = {
      ...depsSenadores,
      raspar: async (fonte) => ({
        url: fonte.url,
        textoLimpo: "Weverton — MA",
        destaques: [],
        pessoas: [{ nome: "Weverton", uf: "MA", origem: "pagina" as const }],
      }),
    };
    const r = await analisar("c.xlsx", [senadores[0]], depsRepetido);
    expect(r.grupos[0].contatos).toHaveLength(1);
    expect(r.grupos[0].novos).toEqual([]);
  });
```

- [ ] **Step 7: Rode e confirme que falha**

Run: `npx vitest run tests/analise.test.ts -t "duas fontes"`
Expected: FAIL — `resolverFonte` devolve `fontes`, que `lib/analise.ts` ainda não lê; o grupo sai como sem fonte.

- [ ] **Step 8: Reescreva `analisarGrupo`**

Em `lib/analise.ts`, troque o import de tipos para incluir `FonteCatalogo`, ajuste `Dependencias` e substitua `analisarGrupo`:

```ts
export interface Dependencias {
  /** Resolve o rótulo da planilha para grupo canônico + fontes oficiais. Lê o catálogo versionado. */
  resolverFonte: (grupo: string) => FonteResolvida;
  /** Raspa UMA fonte cadastrada, com a extração que ela declara. */
  raspar: (fonte: FonteCatalogo) => Promise<ConteudoFonte>;
  /** Camada B: composição via IA (texto raspado + conhecimento). `[]` = indisponível. */
  extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]>;
}

/** Resultado da leitura de uma fonte: conteúdo OU motivo técnico da falha, nunca os dois. */
interface FonteLida {
  fonte: FonteCatalogo;
  conteudo?: ConteudoFonte;
  erro?: string;
}

/** Carimba em cada pessoa de onde ela veio, para o veredito saber o que dizer depois. */
function marcarProveniencia(pessoas: PessoaSite[], fonte: FonteCatalogo): PessoaSite[] {
  return pessoas.map((p) => ({
    ...p,
    fonteUrl: fonte.url,
    ...(fonte.rotulo ? { rotuloFonte: fonte.rotulo } : {}),
    ...(fonte.propoeInclusao ? { propoeInclusao: true } : {}),
  }));
}

async function analisarGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  deps: Dependencias,
): Promise<ResultadoGrupo> {
  const resolvida = await deps.resolverFonte(grupo);
  // Grupo desconhecido (nenhum cadastro casa) → sem fonte; orienta com sugestões.
  if (!resolvida.grupoCanonico) {
    const base = compararGrupo(grupo, contatos, undefined);
    return resolvida.sugestoes.length > 0
      ? { ...base, sugestoesCadastro: resolvida.sugestoes }
      : base;
  }

  // 1. Camada 1 (base): todas as fontes ativas, em paralelo. Uma falhar não derruba a outra.
  const lidas: FonteLida[] = await Promise.all(
    resolvida.fontes.map(async (fonte) => {
      try {
        return { fonte, conteudo: await deps.raspar(fonte) };
      } catch (err) {
        return { fonte, erro: motivoDaFalha(err) };
      }
    }),
  );
  const pessoasPagina = unirFontes(
    lidas.map((l) => (l.conteudo ? marcarProveniencia(l.conteudo.pessoas, l.fonte) : [])),
  );
  // A Camada 2 recebe o texto da fonte primária — uma chamada por grupo, como sempre.
  const textoLimpo = lidas[0]?.conteudo?.textoLimpo ?? "";

  // 2. Camada 2 (refinamento/cobertura): composição via IA. Sem chave → [].
  const pessoasIA = await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo);
  const composicao = mesclarComposicao(pessoasPagina, pessoasIA, contatos);
  const urlPrimaria = resolvida.fontes[0]?.url;

  // 3. Sem composição (nenhuma fonte legível E IA vazia): NUNCA "saída" — "não verificado".
  if (composicao.length === 0) {
    if (urlPrimaria) {
      // Diferencia scrape que lançou erro de página que veio sem conteúdo legível (JS).
      const motivo =
        lidas.find((l) => l.erro)?.erro ??
        "página não retornou conteúdo legível (provável JavaScript)";
      return marcarFonteInacessivel(grupo, contatos, urlPrimaria, motivo, resolvida.grupoCanonico);
    }
    return compararGrupo(grupo, contatos, undefined, resolvida.grupoCanonico); // sem URL → sem fonte
  }

  // 4. Compara contra a composição (todas as fontes + resgates da IA).
  const fonte: ConteudoFonte = {
    url: urlPrimaria ?? URL_PESQUISA_AMPLA,
    textoLimpo,
    destaques: [],
    pessoas: composicao,
  };
  const r = compararGrupo(grupo, contatos, fonte, resolvida.grupoCanonico, resolvida.ufs);
  // Uma fonte caiu e a outra respondeu: compara com a que sobrou e expõe o motivo técnico.
  const erro = lidas.find((l) => l.erro)?.erro;
  // Marca o grupo quando a composição dependeu do conhecimento da IA (não 100% oficial).
  const usouConhecimento = composicao.some((p) => p.origem === "conhecimento");
  return {
    ...r,
    ...(erro ? { erroFonte: erro } : {}),
    ...(usouConhecimento || !urlPrimaria ? { viaPesquisaAmpla: true } : {}),
  };
}
```

Acrescente `unirFontes` ao import de `@/lib/match` no topo de `lib/analise.ts`.

- [ ] **Step 9: Rode os testes do orquestrador**

Run: `npx vitest run tests/analise.test.ts`
Expected: os testes novos passam; os antigos que montam `resolverFonte: () => ({ grupoCanonico: "ORG", url: "...", sugestoes: [] })` falham. Converta-os para `fontes: [{ url: "https://orgao.gov.br", ativo: true }]` e `fontes: []` no caso sem fonte, e troque `raspar: async () => fonte` por `raspar: async (_fonte) => fonte`. Rode de novo até ficar verde.

- [ ] **Step 10: Teste da fonte que caiu (Review Focus 5 no orquestrador)**

```ts
  test("uma fonte cai e a outra responde: compara com a que sobrou e guarda o motivo", async () => {
    const depsPrimariaQuebrada: Dependencias = {
      ...depsSenadores,
      raspar: async (fonte) => {
        if (fonte.url === PRIMARIA) throw new Error("HTTP 403");
        return {
          url: SECUNDARIA,
          textoLimpo: "Wellington Dias — PI",
          destaques: [],
          pessoas: [{ nome: "Wellington Dias", uf: "PI", origem: "pagina" as const }],
        };
      },
    };
    const r = await analisar("c.xlsx", senadores, depsPrimariaQuebrada);
    const g = r.grupos[0];
    expect(g.fonteInacessivel).toBeUndefined();
    expect(g.erroFonte).toBe("HTTP 403");
    expect(g.contatos.find((c) => c.contato.nome === "Wellington Dias")?.semaforo).toBe("verde");
    expect(g.contatos.find((c) => c.contato.nome === "Weverton")?.possivelSaida).toBe(true);
  });

  test("as duas fontes caem: todos indeterminados, nenhuma saída", async () => {
    const depsTudoQuebrado: Dependencias = {
      ...depsSenadores,
      raspar: async () => {
        throw new Error("timeout");
      },
    };
    const r = await analisar("c.xlsx", senadores, depsTudoQuebrado);
    expect(r.grupos[0].fonteInacessivel).toBe(true);
    expect(r.grupos[0].contatos.every((c) => c.semaforo === "indeterminado")).toBe(true);
    expect(r.grupos[0].contatos.some((c) => c.possivelSaida)).toBe(false);
  });
```

Repare no primeiro teste: Weverton **é** possível saída ali, e está certo — a fonte que o publica não pôde ser lida, mas a outra fonte deu composição real. Esse é o limite conhecido da regra de ouro com fontes parciais; `erroFonte` é o que avisa o usuário.

- [ ] **Step 11: Rode e confirme**

Run: `npx vitest run tests/analise.test.ts`
Expected: PASS.

- [ ] **Step 12: Ligue a rota**

Em `app/api/analise/route.ts`, troque o objeto `deps`:

```ts
    const deps: Dependencias = {
      resolverFonte: (grupo) => resolverGrupoEFonte(grupo),
      raspar: (fonte) => raspar(fonte.url, fonte.tabela ? { tabela: fonte.tabela } : {}),
      extrairComposicao: (grupoCanonico, textoLimpo) => extrairComposicao(grupoCanonico, textoLimpo),
    };
```

- [ ] **Step 13: Rode a suíte inteira e o typecheck**

Run: `npm test && npm run typecheck`
Expected: tudo verde. O typecheck agora fecha: era a Task 1 que o deixava vermelho.

- [ ] **Step 14: Commit**

```bash
git add lib/analise.ts lib/match.ts app/api/analise/route.ts tests/analise.test.ts tests/match.test.ts
git commit -m "feat: grupo é comparado contra todas as fontes ativas cadastradas

Cada pessoa carrega a fonte de onde veio. Uma fonte cair não derruba a
outra: o grupo é comparado com a que sobrou e o motivo técnico vai em
erroFonte. Sem nenhuma fonte legível, segue indeterminado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Nota da fonte no veredito e inclusão filtrada por UF

**Files:**
- Modify: `lib/match.ts` (`montarResultado`, `compararGrupo`)
- Test: `tests/match.test.ts`

**Interfaces:**
- Consumes: `PessoaSite.rotuloFonte`/`contexto`/`propoeInclusao`/`uf` (Tasks 1 e 3).
- Produces: `compararGrupo(grupo, contatos, fonte, grupoCanonico?, ufsDoGrupo?)` — quinto parâmetro opcional; `ResultadoContato.observacao` passa a trazer a nota da fonte secundária.

- [ ] **Step 1: Escreva os testes que falham**

Em `tests/match.test.ts`:

```ts
describe("veredito com fonte rotulada", () => {
  const fonteSenadores: ConteudoFonte = {
    url: "https://senado.leg.br/em-exercicio",
    textoLimpo: "",
    destaques: [],
    pessoas: [
      { nome: "Weverton", uf: "MA", origem: "pagina", fonteUrl: "https://senado.leg.br/em-exercicio" },
      {
        nome: "Wellington Dias",
        uf: "PI",
        origem: "pagina",
        contexto: "Ocupação de cargo de ministro/secretário",
        rotuloFonte: "fora de exercício",
        fonteUrl: "https://senado.leg.br/fora-de-exercicio",
        propoeInclusao: true,
      },
      {
        nome: "Eduardo Girão",
        uf: "CE",
        origem: "pagina",
        contexto: "Licença com convocação de suplente (superior a 120 dias)",
        rotuloFonte: "fora de exercício",
        fonteUrl: "https://senado.leg.br/fora-de-exercicio",
        propoeInclusao: true,
      },
    ],
  };

  test("quem casa pela fonte rotulada sai verde, com a nota e o motivo", () => {
    const r = compararGrupo(
      "Senadores (Maranhão ao Piauí)",
      [{ nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK }],
      fonteSenadores,
      "Senadores (Maranhão ao Piauí)",
      ["MA", "PI"],
    );
    const c = r.contatos[0];
    expect(c.semaforo).toBe("verde");
    expect(c.possivelSaida).toBeUndefined();
    expect(c.observacao).toBe("fora de exercício — Ocupação de cargo de ministro/secretário");
    expect(c.fonteUrl).toBe("https://senado.leg.br/fora-de-exercicio");
  });

  test("proposta de inclusão só sai no grupo da faixa de UF", () => {
    const r = compararGrupo(
      "Senadores (Maranhão ao Piauí)",
      [{ nome: "Weverton", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK }],
      fonteSenadores,
      "Senadores (Maranhão ao Piauí)",
      ["MA", "PI"],
    );
    expect(r.novos.map((n) => n.nome)).toEqual(["Wellington Dias"]);
  });

  test("pessoa de fonte que não propõe inclusão e não tem cargo não vira novo", () => {
    const r = compararGrupo(
      "Senadores (Maranhão ao Piauí)",
      [{ nome: "Wellington Dias", grupo: "Senadores (Maranhão ao Piauí)", ...CADASTRO_OK }],
      fonteSenadores,
      "Senadores (Maranhão ao Piauí)",
      ["MA", "PI"],
    );
    expect(r.novos.map((n) => n.nome)).not.toContain("Weverton");
  });
});
```

Use o mesmo `CADASTRO_OK` dos outros testes do arquivo (`{ tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" }`); se `tests/match.test.ts` ainda não tiver essa constante, declare-a no topo do `describe`.

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/match.test.ts -t "fonte rotulada"`
Expected: FAIL — `observacao` vem `undefined` e `novos` sai vazio (hoje "novo" exige cargo).

- [ ] **Step 3: Escreva a nota no veredito**

Em `lib/match.ts`, dentro de `montarResultado`, no `return` do caminho em que **há** pessoa casada, substitua a última linha:

```ts
  const camposDivergentes = divergenciasDe(comparacoes);
  const semaforo: Semaforo = camposDivergentes.length > 0 ? "amarelo" : "verde";
  // Casou por fonte rotulada (ex.: a lista de fora de exercício): o cadastro está certo,
  // e o que o usuário precisa saber é a situação, não uma divergência.
  const nota = pessoa.rotuloFonte
    ? [pessoa.rotuloFonte, pessoa.contexto].filter(Boolean).join(" — ")
    : undefined;
  return {
    contato,
    semaforo,
    score,
    comparacoes,
    camposDivergentes,
    origem,
    fonteUrl: pessoa.fonteUrl ?? url,
    ...(nota ? { observacao: nota } : {}),
  };
```

- [ ] **Step 4: Filtre a proposta de inclusão**

Ainda em `lib/match.ts`, acrescente o helper antes de `compararGrupo`:

```ts
/**
 * A pessoa pertence à faixa de UF do grupo? Sem faixa cadastrada, ou sem UF publicada
 * pela fonte, não há o que filtrar e a resposta é sim — o filtro nunca inventa exclusão.
 */
function naFaixaDeUf(pessoa: PessoaSite, ufs?: readonly string[]): boolean {
  if (!ufs || ufs.length === 0 || !pessoa.uf) return true;
  return ufs.includes(pessoa.uf.toUpperCase());
}
```

E troque a assinatura e o cálculo de `novos` em `compararGrupo`:

```ts
export function compararGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte | undefined,
  grupoCanonico?: string,
  ufsDoGrupo?: readonly string[],
): ResultadoGrupo {
```

```ts
  // "novos": de fonte que propõe inclusão, só quem está na faixa de UF do grupo. Das
  // demais fontes, mantém a regra antiga — só pessoa com cargo, que corta item de menu
  // do texto achatado. Numa fonte tabular toda linha já é pessoa.
  const novos = fonte.pessoas.filter((p, i) => {
    if (usados.has(i)) return false;
    return p.propoeInclusao ? naFaixaDeUf(p, ufsDoGrupo) : Boolean(p.cargo);
  });
```

- [ ] **Step 5: Rode e confirme que passa**

Run: `npx vitest run tests/match.test.ts`
Expected: PASS, inclusive os testes antigos de "novos" dos outros grupos (nenhuma pessoa deles tem `propoeInclusao`).

- [ ] **Step 6: Rode a suíte inteira**

Run: `npm test && npm run typecheck`
Expected: verde.

- [ ] **Step 7: Commit**

```bash
git add lib/match.ts tests/match.test.ts
git commit -m "feat: nota da fonte no veredito e inclusão filtrada pela faixa de UF

Quem casa pela fonte rotulada sai verde com a situação (fora de
exercício e o motivo). Proposta de inclusão só sai da fonte que a
declara e só para a UF do grupo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cadastro das duas fontes nos três grupos de Senadores

**Files:**
- Modify: `data/catalogo.ts:348-383` (os três grupos de Senadores)
- Test: `tests/catalogo-dados.test.ts`

**Interfaces:**
- Consumes: `FonteCatalogo` com `rotulo`/`tabela`/`propoeInclusao` e `GrupoCatalogo.ufs` (Task 1).
- Produces: cadastro real que as Tasks 6 e 7 consomem.

- [ ] **Step 1: Escreva os testes de cadastro que falham**

Em `tests/catalogo-dados.test.ts`, ajuste a contagem de fontes e acrescente o bloco dos Senadores:

```ts
  test("tem as 24 fontes cadastradas (21 migradas do banco + 3 de fora de exercício)", () => {
    const total = CATALOGO.reduce((n, g) => n + g.fontes.length, 0);
    expect(total).toBe(24);
  });
```

```ts
describe("grupos de Senadores", () => {
  const senadores = CATALOGO.filter((g) => g.nome.startsWith("Senadores ("));

  test("são três e cada um tem as duas fontes, na ordem", () => {
    expect(senadores).toHaveLength(3);
    for (const g of senadores) {
      expect(g.fontes.map((f) => f.url)).toEqual([
        "https://www25.senado.leg.br/web/senadores/em-exercicio",
        "https://www25.senado.leg.br/web/senadores/fora-de-exercicio",
      ]);
    }
  });

  test("só a fonte de fora de exercício propõe inclusão, e ela tem rótulo e seções", () => {
    for (const g of senadores) {
      const [primaria, secundaria] = g.fontes;
      expect(primaria.propoeInclusao).toBeUndefined();
      expect(secundaria.propoeInclusao).toBe(true);
      expect(secundaria.rotulo).toBe("fora de exercício");
      expect(secundaria.tabela?.secoes).toEqual([
        "Assunção de cargo",
        "Licença com convocação de suplente",
      ]);
    }
  });

  test("as três faixas cobrem as 27 UFs, sem repetição", () => {
    const todas = senadores.flatMap((g) => g.ufs ?? []);
    expect(todas).toHaveLength(27);
    expect(new Set(todas).size).toBe(27);
  });
});
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/catalogo-dados.test.ts`
Expected: FAIL — 21 fontes, uma por grupo, sem `ufs`.

- [ ] **Step 3: Cadastre as fontes e as faixas**

Em `data/catalogo.ts`, substitua o bloco `fontes` dos três grupos de Senadores e acrescente `ufs` a cada um. Para **"Senadores (Acre a Goiás)"** (linha ~348):

```ts
    ufs: ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO"],
    fontes: [
      {
        url: "https://www25.senado.leg.br/web/senadores/em-exercicio",
        ativo: true,
        // Tabela de 6 colunas, seções por UF. Extração estruturada porque o caminho de
        // texto perde os senadores de nome de uma palavra (Weverton, Cleitinho, Romário,
        // Giordano, Irajá). Não propõe inclusão: a lista traz também suplente convocado,
        // que o GT não convida (e-mail de 2026-07-20).
        tabela: { colunas: { nome: 0, uf: 2 } },
      },
      {
        url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio",
        ativo: true,
        rotulo: "fora de exercício",
        propoeInclusao: true,
        // Só os titulares afastados. Ficam de fora "Suplentes que exerceram o cargo" e a
        // 2ª tabela (falecimento, perda de mandato, renúncia): não são senadores em
        // mandato. Ver docs/superpowers/specs/2026-09-24-segunda-fonte-senadores-fora-de-exercicio.md
        tabela: {
          colunas: { nome: 0, uf: 2, motivo: 3 },
          secoes: ["Assunção de cargo", "Licença com convocação de suplente"],
        },
      },
    ],
```

Para **"Senadores (Maranhão ao Piauí)"**, o mesmo bloco `fontes` (repita-o na íntegra) com `ufs: ["MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI"]`.

Para **"Senadores (Rio a Tocantins)"**, o mesmo bloco `fontes` com `ufs: ["RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]`.

As faixas são as 27 UFs em ordem alfabética por **nome do estado** — é assim que os rótulos dos grupos foram escritos.

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/catalogo-dados.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data/catalogo.ts tests/catalogo-dados.test.ts
git commit -m "feat: cadastra a lista de senadores fora de exercício nos três grupos

Só as seções de titular afastado entram na composição; a extração passa
a ser por tabela nas duas fontes. Cada grupo ganha a faixa de UF, que
roteia a proposta de inclusão.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: A nota da fonte chega à tela e ao export

**Files:**
- Modify: `components/resultado-tabela.tsx:67-91`
- Modify: `lib/export.ts:63-88` (bloco dos novos)
- Test: `tests/export.test.ts`

**Interfaces:**
- Consumes: `ResultadoContato.observacao` (Task 4) e `PessoaSite.rotuloFonte`/`contexto`/`fonteUrl` (Task 3).
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Escreva os testes do export que falham**

Em `tests/export.test.ts`:

```ts
  test("novo vindo de fonte rotulada leva a situação na observação e a URL daquela fonte", () => {
    const analise: ResultadoAnalise = {
      arquivoNome: "c.xlsx",
      grupos: [
        {
          grupo: "Senadores (Maranhão ao Piauí)",
          fonteUrl: "https://senado.leg.br/em-exercicio",
          semFonte: false,
          contatos: [],
          novos: [
            {
              nome: "Wellington Dias",
              uf: "PI",
              origem: "pagina",
              contexto: "Ocupação de cargo de ministro/secretário",
              rotuloFonte: "fora de exercício",
              fonteUrl: "https://senado.leg.br/fora-de-exercicio",
            },
          ],
        },
      ],
      resumo: {
        total: 0, verde: 0, amarelo: 0, vermelho: 0, novo: 1, indeterminado: 0,
        gruposSemFonte: 0, gruposFonteInacessivel: 0, gruposViaPesquisaAmpla: 0,
      },
    };
    const linha = resultadoParaLinhas(analise)[0];
    expect(linha.Status).toBe("novo");
    expect(linha.Observacao).toBe(
      "Pessoa na fonte sem correspondência na planilha — fora de exercício: Ocupação de cargo de ministro/secretário",
    );
    expect(linha.Fonte).toBe("https://senado.leg.br/fora-de-exercicio");
  });
```

- [ ] **Step 2: Rode e confirme que falha**

Run: `npx vitest run tests/export.test.ts -t "fonte rotulada"`
Expected: FAIL — `Observacao` vem sem a situação e `Fonte` traz a URL do grupo.

- [ ] **Step 3: Ajuste o export**

Em `lib/export.ts`, no laço `for (const novo of g.novos)`, troque as chaves `Fonte` e `Observacao`:

```ts
      const situacao = novo.rotuloFonte
        ? ` — ${[novo.rotuloFonte, novo.contexto].filter(Boolean).join(": ")}`
        : "";
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Status: "novo",
        Divergencias: "",
        Origem: novo.origem === "conhecimento" ? "pesquisa_ampla" : "oficial",
        Fonte: novo.fonteUrl ?? g.fonteUrl ?? "",
        Observacao: `Pessoa na fonte sem correspondência na planilha${situacao}`,
      };
```

- [ ] **Step 4: Rode e confirme que passa**

Run: `npx vitest run tests/export.test.ts`
Expected: PASS. A linha de contato já carrega a nota: `Observacao` lê `c.observacao`, que a Task 4 preenche.

- [ ] **Step 5: Mostre a nota na tela**

Em `components/resultado-tabela.tsx`, na linha do contato, troque a célula do nome para incluir a observação quando houver:

```tsx
                  <td>
                    {c.contato.nome}
                    {c.observacao && !c.possivelSaida ? (
                      <span className="block text-xs text-gray-500">{c.observacao}</span>
                    ) : null}
                  </td>
```

E na linha de "novo", troque a célula do cargo, que para fonte tabular vem vazia, pela situação:

```tsx
                  <td>{n.cargo ?? (n.rotuloFonte ? `${n.rotuloFonte}${n.contexto ? ` — ${n.contexto}` : ""}` : "—")}</td>
```

O `!c.possivelSaida` evita repetir texto: quem é possível saída já tem a observação "Não consta na fonte (possível saída)" dita pelo badge vermelho.

- [ ] **Step 6: Rode a suíte e o build**

Run: `npm test && npm run typecheck && npm run build`
Expected: verde nos três.

- [ ] **Step 7: Commit**

```bash
git add components/resultado-tabela.tsx lib/export.ts tests/export.test.ts
git commit -m "feat: situação da fonte secundária aparece na tela e no export

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Regressão de ponta a ponta com as páginas reais

**Files:**
- Modify: `tests/analise.test.ts` (bloco novo, usando as fixtures da Task 2)
- Modify: `CLAUDE.md` (linha na tabela de specs e nota de estado)

**Interfaces:**
- Consumes: tudo das Tasks 1 a 6.
- Produces: nada.

- [ ] **Step 1: Escreva o teste de ponta a ponta**

Em `tests/analise.test.ts`, acrescente o bloco que liga fixture → extração → composição → veredito, com o cadastro real do grupo:

```ts
describe("Senadores de ponta a ponta (fixtures das duas páginas reais)", () => {
  const EM_EXERCICIO = "https://www25.senado.leg.br/web/senadores/em-exercicio";
  const FORA = "https://www25.senado.leg.br/web/senadores/fora-de-exercicio";
  const html = (arquivo: string) =>
    readFileSync(join(__dirname, "fixtures", arquivo), "utf8");

  const grupoMA = CATALOGO.find((g) => g.nome === "Senadores (Maranhão ao Piauí)")!;

  const deps: Dependencias = {
    resolverFonte: () => ({
      grupoCanonico: grupoMA.nome,
      fontes: grupoMA.fontes.filter((f) => f.ativo),
      ufs: grupoMA.ufs,
      sugestoes: [],
    }),
    raspar: async (fonte) =>
      extrairTabela(
        html(fonte.url === FORA ? "senado-fora-de-exercicio.html" : "senado-em-exercicio.html"),
        fonte.url,
        fonte.tabela!,
      ),
    extrairComposicao: async () => [],
  };

  const contatos: ContatoPlanilha[] = [
    { nome: "Weverton", grupo: grupoMA.nome, ...CADASTRO_OK },
    { nome: "Wellington Dias", grupo: grupoMA.nome, ...CADASTRO_OK },
  ];

  test("senador de nome de uma palavra não é possível saída", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    const weverton = r.grupos[0].contatos.find((c) => c.contato.nome === "Weverton");
    expect(weverton?.possivelSaida).toBeUndefined();
    expect(weverton?.semaforo).toBe("verde");
  });

  test("titular afastado casa pela segunda fonte e carrega o motivo", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    const wd = r.grupos[0].contatos.find((c) => c.contato.nome === "Wellington Dias");
    expect(wd?.semaforo).toBe("verde");
    expect(wd?.observacao).toBe("fora de exercício — Ocupação de cargo de ministro/secretário");
  });

  test("titular afastado que falta na planilha vira novo, e só na faixa de UF do grupo", async () => {
    const r = await analisar("c.xlsx", [contatos[0]], deps);
    expect(r.grupos[0].novos.map((n) => n.nome).sort()).toEqual(["Ana Paula Lobato", "Wellington Dias"]);
  });

  test("suplente, falecido e renunciante nunca entram no grupo", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    const nomes = r.grupos[0].novos.map((n) => n.nome);
    expect(nomes).not.toContain("Ney Suassuna");
    expect(nomes).not.toContain("Arolde de Oliveira");
    expect(nomes).not.toContain("Flávio Dino");
  });

  test("Eduardo Girão (CE) não é proposto no grupo de Maranhão ao Piauí", async () => {
    const r = await analisar("c.xlsx", contatos, deps);
    expect(r.grupos[0].novos.map((n) => n.nome)).not.toContain("Eduardo Girão");
  });

  test("grupo de uma fonte só continua se comportando como antes", async () => {
    const umaFonte: Dependencias = {
      ...deps,
      resolverFonte: () => ({
        grupoCanonico: grupoMA.nome,
        fontes: [grupoMA.fontes[0]],
        ufs: grupoMA.ufs,
        sugestoes: [],
      }),
    };
    const r = await analisar("c.xlsx", contatos, umaFonte);
    const g = r.grupos[0];
    expect(g.fonteUrl).toBe(EM_EXERCICIO);
    expect(g.erroFonte).toBeUndefined();
    // Sem a segunda fonte, o titular afastado volta a ser possível saída — é o
    // comportamento de hoje, e o que a fonte nova existe para corrigir.
    expect(g.contatos.find((c) => c.contato.nome === "Wellington Dias")?.possivelSaida).toBe(true);
    expect(g.novos).toEqual([]);
  });
});
```

Acrescente ao topo de `tests/analise.test.ts` os imports que faltarem: `readFileSync`, `join`, `extrairTabela` de `@/lib/scrape` e `CATALOGO` de `@/data/catalogo`.

- [ ] **Step 2: Rode e ajuste**

Run: `npx vitest run tests/analise.test.ts -t "ponta a ponta"`
Expected: PASS. Se "Ana Paula Lobato" (MA) não aparecer nos novos, confira a faixa `ufs` do grupo — ela é da faixa e **deve** ser proposta.

- [ ] **Step 3: Rode a suíte inteira, typecheck e build**

Run: `npm test && npm run typecheck && npm run build`
Expected: os três verdes.

- [ ] **Step 4: Atualize o `CLAUDE.md`**

Na tabela "Documentos de decisão", acrescente a linha, mantendo a ordem cronológica:

```markdown
| 2026-09-24 | `segunda-fonte-senadores-fora-de-exercicio.md` | Todas as fontes ativas do grupo compõem a composição; extração por tabela; inclusão filtrada por UF | Vigente |
```

Na seção "Princípios de implementação", troque a frase sobre a fonte primária por:

```markdown
- **Todas as fontes ativas do grupo compõem a composição**, na ordem do catálogo; a primeira é a primária (vai em `fonteUrl` e alimenta a Camada 2). Uma fonte cair não derruba o grupo: compara-se com a que sobrou e o motivo técnico vai em `erroFonte`. Sem nenhuma fonte legível, segue indeterminado.
```

E, na seção "Estado do projeto", atualize a contagem de fontes do catálogo: 24 fontes, 21 grupos com fonte.

- [ ] **Step 5: Commit**

```bash
git add tests/analise.test.ts CLAUDE.md
git commit -m "test: regressão de ponta a ponta dos Senadores com as duas páginas

docs: registra a segunda fonte por grupo no CLAUDE.md

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final

- [ ] `npm test` — suíte inteira verde (10 arquivos anteriores + `scrape-tabela.test.ts`).
- [ ] `npm run typecheck` — sem erro.
- [ ] `npm run build` — sem erro.
- [ ] `git log --oneline feat/mvp-fiscal..HEAD` — um commit por tarefa, nenhum arquivo do pnpm versionado.
- [ ] Rodar a análise com a planilha real de Senadores e conferir à mão: nenhum senador em exercício aparece como possível saída, os titulares afastados saem verdes com a nota, e as propostas de inclusão são só de titular afastado da faixa do grupo.
