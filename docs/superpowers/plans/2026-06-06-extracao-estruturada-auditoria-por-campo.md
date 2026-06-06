# Extração estruturada + auditoria por campo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair pessoas estruturadas (`{nome, cargo}`) das páginas oficiais em vez de um blob de texto, para eliminar "novos" sujos/duplo-cont, parar divergências falsas e mostrar o valor correto do site por campo (colunas planilha×site).

**Architecture:** A raspagem passa a produzir `ConteudoFonte.pessoas: PessoaSite[]`. O matching casa cada contato à melhor pessoa por sobreposição de tokens de nome; compara campo a campo (`ComparacaoCampo` com `confere`/`divergente`/`fonte_nao_informa`); pessoa casada sai do pool → "novos" = pessoas não casadas. Camada A (determinística) sempre roda; Fase 2 (Gemini) eleva a qualidade quando há `GEMINI_API_KEY`.

**Tech Stack:** Next.js 15 + TypeScript, cheerio, string-similarity, @google/genai (opcional), Vitest.

Spec: `docs/superpowers/specs/2026-06-06-extracao-estruturada-auditoria-por-campo-design.md`

**Comandos (este projeto):**
- Testes: `node node_modules/vitest/vitest.mjs run`
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit`
- Build: `node node_modules/next/dist/bin/next build`

**Regras:** TDD, sem `any`, `lib/*` puro e imutável, AAA com nomes em PT-BR, cobertura ≥80%. Commits convencionais (sem Co-Authored-By).

---

## Arquivos

- `lib/types.ts` — MOD: `PessoaSite` reestruturada; `ConteudoFonte.pessoas`; `ComparacaoCampo`/`SituacaoCampo`; `ResultadoContato.comparacoes`.
- `lib/scrape.ts` — MOD: `extrairConteudo` insere separadores e produz `pessoas` (segmentação + filtro de rótulos).
- `lib/match.ts` — MOD: matching por token (`pontuarPessoa`/`melhorPessoa`), `compararContato`/`compararGrupo`/`compararGrupoAmplo` por campo; remove `detectarNovos` antigo.
- `lib/export.ts` — MOD: colunas largas planilha×site.
- `components/resultado-tabela.tsx` — MOD: divergência mostra "campo: planilha → site"; "novos" usam `nome`.
- `lib/gemini.ts` — MOD (Fase 1: `pesquisarFonteAmpla` preenche `pessoas`; Fase 2: `extrairComposicaoGemini`).
- `lib/analise.ts` — MOD (Fase 2: enriquecer `pessoas` via Gemini quando disponível).
- Testes: `tests/scrape.test.ts`, `tests/match.test.ts`, `tests/export.test.ts`, `tests/gemini.test.ts`, `tests/analise.test.ts`, fixture `tests/fixtures/cnj-grudado.html`.

---

# FASE 1 — Determinística (entrega completa, SEM precisar de `GEMINI_API_KEY`)

## Task 1: Modelo de dados

**Files:** Modify `lib/types.ts`

- [ ] **Step 1: Reestruturar `PessoaSite` e estender `ConteudoFonte`**

Substituir a interface `PessoaSite` e a `ConteudoFonte` por:

```ts
/** Uma pessoa extraída (estruturada) da fonte oficial. */
export interface PessoaSite {
  nome: string;
  cargo?: string;
  /** Trecho de origem (para depuração). */
  contexto?: string;
}

/** Conteúdo de uma página oficial. */
export interface ConteudoFonte {
  url: string;
  textoLimpo: string;
  /** Strings em <strong>/<b> já filtradas (dica de nomes). */
  destaques: string[];
  /** Pessoas estruturadas extraídas da página. */
  pessoas: PessoaSite[];
}
```

- [ ] **Step 2: Adicionar `ComparacaoCampo` e `comparacoes`**

Acrescentar (perto de `CampoDivergente`):

```ts
export type SituacaoCampo = "confere" | "divergente" | "fonte_nao_informa";

export interface ComparacaoCampo {
  campo: string;
  valorPlanilha: string;
  /** Valor correto vindo do site (ausente quando a fonte não informa). */
  valorSite?: string;
  situacao: SituacaoCampo;
}
```

E em `ResultadoContato`, adicionar o campo `comparacoes` (mantendo `camposDivergentes`, que passa a ser derivado):

```ts
export interface ResultadoContato {
  contato: ContatoPlanilha;
  semaforo: Semaforo;
  score: number;
  /** Auditoria campo a campo (fonte da verdade para as colunas planilha×site). */
  comparacoes: ComparacaoCampo[];
  /** Subconjunto de `comparacoes` com situacao "divergente" (compat/badge). */
  camposDivergentes: CampoDivergente[];
  origem: OrigemVeredito;
  fonteUrl?: string;
  observacao?: string;
}
```

- [ ] **Step 3: Verificar typecheck (vai quebrar — esperado)**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: erros em `scrape.ts`, `match.ts`, `gemini.ts`, `export.ts`, `resultado-tabela.tsx` e testes (faltando `pessoas`/`comparacoes`, usando `nomePolitico`). Serão corrigidos nas tasks seguintes.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: modelo estruturado (PessoaSite, ComparacaoCampo, ConteudoFonte.pessoas)"
```

---

## Task 2: Extração estruturada determinística (`lib/scrape.ts`)

**Files:** Modify `lib/scrape.ts`; Create `tests/fixtures/cnj-grudado.html`; Modify `tests/scrape.test.ts`

- [ ] **Step 1: Criar fixture que reproduz o HTML "grudado" do CNJ**

Create `tests/fixtures/cnj-grudado.html`:

```html
<html><body>
  <div class="membros">
    <div class="card"><strong>Luiz Edson Fachin</strong><span>Presidente do Conselho Nacional de Justiça</span><p>Nascimento:</p><p>Ingresso no CNJ:</p></div>
    <div class="card"><strong>Mauro Campbell Marques</strong><span>Corregedor Nacional de Justiça</span><p>Nascimento:</p></div>
    <div class="card"><strong>Kátia Magalhães Arruda</strong><span>Conselheira</span><p>Nascimento:</p></div>
    <div class="card"><strong>Silvio Amorim Junior</strong><span>Conselheiro</span></div>
  </div>
  <div class="rodape"><p>Endereço:</p><p>CEP:</p><p>Telefone:</p><p>CNPJ:</p></div>
</body></html>
```

- [ ] **Step 2: Escrever os testes da extração estruturada**

Acrescentar em `tests/scrape.test.ts` (mantém os testes de `raspar` existentes):

```ts
describe("extrairConteudo (estruturado)", () => {
  const html = readFileSync(resolve(__dirname, "fixtures/cnj-grudado.html"), "utf-8");

  test("separa blocos: não gruda nome com cargo/rótulo", () => {
    const c = extrairConteudo(html, "https://cnj");
    expect(c.textoLimpo).not.toContain("MarquesCorregedor");
    expect(c.textoLimpo).toContain("Mauro Campbell Marques");
  });

  test("extrai pessoas com nome + cargo", () => {
    const c = extrairConteudo(html, "https://cnj");
    const fachin = c.pessoas.find((p) => p.nome.includes("Fachin"));
    expect(fachin?.cargo).toMatch(/Presidente/);
    const silvio = c.pessoas.find((p) => p.nome === "Silvio Amorim Junior");
    expect(silvio?.cargo).toBe("Conselheiro");
  });

  test("filtra rótulos e cargos soltos (não viram pessoa)", () => {
    const c = extrairConteudo(html, "https://cnj");
    const nomes = c.pessoas.map((p) => p.nome);
    expect(nomes).not.toContain("Nascimento:");
    expect(nomes).not.toContain("CEP:");
    expect(nomes).not.toContain("Conselheiro");
    expect(nomes.some((n) => n.includes("Nascimento"))).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run tests/scrape.test.ts`
Expected: FAIL (`pessoas` indefinida / texto grudado).

- [ ] **Step 4: Implementar a extração estruturada**

Substituir `extrairConteudo` em `lib/scrape.ts` por:

```ts
const TAGS_BLOCO =
  "p,li,div,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,dt,dd,span";

const CARGOS = [
  "presidente", "vice-presidente", "corregedor", "corregedora",
  "conselheiro", "conselheira", "ministro", "ministra",
  "secretario", "secretaria", "diretor", "diretora",
  "procurador", "procuradora", "defensor", "defensora",
  "governador", "governadora", "senador", "senadora",
  "deputado", "deputada", "embaixador", "embaixadora",
  "prefeito", "prefeita", "desembargador", "desembargadora",
];

function ehRotulo(linha: string): boolean {
  return linha.endsWith(":") || /^(nascimento|ingresso|vaga|cep|telefone|cnpj|endere)/i.test(linha);
}

function ehCargo(linha: string): boolean {
  const norm = normalizarTexto(linha);
  if (norm.split(" ").length > 8) return false;
  return CARGOS.some((c) => norm.includes(c));
}

function ehNome(linha: string): boolean {
  if (linha.length < 5 || linha.length > 70) return false;
  if (linha.includes(":") || /\d/.test(linha)) return false;
  if (ehRotulo(linha) || ehCargo(linha)) return false;
  const tokens = linha.split(" ").filter(Boolean);
  if (tokens.length < 2) return false;
  const conector = /^(de|da|do|das|dos|e)$/i;
  const significativos = tokens.filter((t) => !conector.test(t));
  return significativos.length >= 2 && significativos.every((t) => /^[A-ZÀ-Ý]/.test(t));
}

/** Extrai linhas limpas inserindo separador entre blocos antes do .text(). */
function extrairLinhas($: cheerio.CheerioAPI): string[] {
  $("br").replaceWith("\n");
  $(TAGS_BLOCO).each((_, el) => $(el).append("\n"));
  return $("body")
    .text()
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

/** Segmenta linhas em pessoas: linha-nome + cargo adjacente. */
function segmentarPessoas(linhas: string[]): PessoaSite[] {
  const pessoas: PessoaSite[] = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!ehNome(linhas[i])) continue;
    let cargo: string | undefined;
    for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
      if (ehCargo(linhas[j])) { cargo = linhas[j]; break; }
      if (ehNome(linhas[j])) break;
    }
    pessoas.push({ nome: linhas[i], cargo, contexto: linhas[i] });
  }
  return pessoas;
}

export function extrairConteudo(html: string, url: string): ConteudoFonte {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const destaquesBrutos: string[] = [];
  $("strong, b").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, " ").trim();
    if (txt) destaquesBrutos.push(txt);
  });

  const linhas = extrairLinhas($);
  const pessoas = segmentarPessoas(linhas);
  const destaques = [...new Set(destaquesBrutos.filter(ehNome))];

  return { url, textoLimpo: linhas.join(" "), destaques, pessoas };
}
```

Adicionar no topo de `lib/scrape.ts`: `import { normalizarTexto } from "@/lib/normalize";` e `import type { ConteudoFonte, PessoaSite } from "@/lib/types";`.

> Nota: `$(TAGS_BLOCO).each(... append("\n"))` precisa rodar **antes** de coletar destaques? Não — destaques vêm de `$("strong,b").text()` (sem o "\n" extra). Colete destaques ANTES de `extrairLinhas` (que muta o DOM). A ordem acima já faz isso.

- [ ] **Step 5: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run tests/scrape.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/scrape.ts tests/scrape.test.ts tests/fixtures/cnj-grudado.html
git commit -m "feat: extração estruturada (separadores entre blocos + pessoas com filtro de rótulos)"
```

---

## Task 3: Matching por pessoa + comparação por campo (`lib/match.ts`)

**Files:** Modify `lib/match.ts`; Modify `tests/match.test.ts`

- [ ] **Step 1: Escrever os testes do novo matching**

Substituir o `fonte` de teste e adicionar casos em `tests/match.test.ts`. O `fonte` passa a ter `pessoas`:

```ts
const fonte: ConteudoFonte = {
  url: "https://orgao.gov.br",
  textoLimpo: "Ana Maria Política Completa Presidente. João Carlos Destaque Diretor.",
  destaques: [],
  pessoas: [
    { nome: "Ana Maria Política Completa", cargo: "Presidente" },
    { nome: "João Carlos Destaque", cargo: "Diretor" },
  ],
};
```

Casos novos:

```ts
describe("pontuarPessoa", () => {
  test("casa variação de nome (sobrenomes em comum)", () => {
    expect(
      pontuarPessoa("Sívio Roberto Oliveira de Amorim Júnior", "Silvio Amorim Junior"),
    ).toBeGreaterThanOrEqual(0.6);
  });
  test("nomes sem relação não casam", () => {
    expect(pontuarPessoa("Ana Maria Política", "Carlos Eduardo Souza")).toBeLessThan(0.6);
  });
});

describe("compararContato (por campo)", () => {
  test("cargo igual ao site → confere, semáforo verde", () => {
    const r = compararContato(
      contato({ nome: "Ana Maria Política Completa", cargo: "Presidente" }),
      fonte,
    );
    expect(r.semaforo).toBe("verde");
    expect(r.comparacoes.find((c) => c.campo === "cargo")?.situacao).toBe("confere");
  });

  test("cargo diferente → divergente com valorSite preenchido", () => {
    const r = compararContato(
      contato({ nome: "João Carlos Destaque", cargo: "Presidente" }),
      fonte,
    );
    const cargo = r.comparacoes.find((c) => c.campo === "cargo");
    expect(cargo?.situacao).toBe("divergente");
    expect(cargo?.valorSite).toBe("Diretor");
    expect(r.camposDivergentes.some((c) => c.campo === "cargo")).toBe(true);
    expect(r.semaforo).toBe("amarelo");
  });

  test("endereço da planilha → fonte_nao_informa (não vira divergência)", () => {
    const r = compararContato(
      contato({ nome: "Ana Maria Política Completa", endereco: "Praça X" }),
      fonte,
    );
    const end = r.comparacoes.find((c) => c.campo === "endereco");
    expect(end?.situacao).toBe("fonte_nao_informa");
    expect(r.camposDivergentes.some((c) => c.campo === "endereco")).toBe(false);
  });

  test("nome ausente nas pessoas → vermelho", () => {
    const r = compararContato(contato({ nome: "Pessoa Inexistente Qualquer" }), fonte);
    expect(r.semaforo).toBe("vermelho");
  });
});

describe("compararGrupo (novos limpos, sem duplo-cont)", () => {
  test("pessoa casada sai do pool de novos", () => {
    const r = compararGrupo("ORG", [contato({ nome: "Ana Maria Política Completa" })], fonte);
    expect(r.novos.map((n) => n.nome)).toEqual(["João Carlos Destaque"]);
    expect(r.novos.map((n) => n.nome)).not.toContain("Ana Maria Política Completa");
  });
});
```

Atualizar imports do teste para incluir `pontuarPessoa`. Remover/ajustar os testes antigos que dependiam de `destaques` e `detectarNovos` por substring (ex.: o teste "detecta possíveis novos (destaque…)" deve usar `pessoas`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run tests/match.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o novo matching**

Em `lib/match.ts`: remover `melhorCorrespondencia`, `campoBate`, `detectarNovos` antigos (baseados em texto/destaques) e a constante `BONUS_CONTENCAO`/`TAMANHO_CONTEXTO` se não usadas. Adicionar:

```ts
const LIMIAR_PESSOA = 0.6;
const LIMIAR_TOKEN = 0.85;

interface CampoAuditado {
  campo: string;
  planilha: (c: ContatoPlanilha) => string | undefined;
  site: (p: PessoaSite) => string | undefined;
}

const CAMPOS_AUDITADOS: CampoAuditado[] = [
  { campo: "cargo", planilha: (c) => c.cargo, site: (p) => p.cargo },
  { campo: "endereco", planilha: (c) => c.endereco, site: () => undefined },
  { campo: "telefone", planilha: (c) => c.telefone, site: () => undefined },
  { campo: "email", planilha: (c) => c.email, site: () => undefined },
];

function tokensNome(nome: string): string[] {
  return normalizarNome(nome).split(" ").filter((t) => t.length > 1);
}

export function pontuarPessoa(nomePlanilha: string, nomeSite: string): number {
  const a = tokensNome(nomePlanilha);
  const b = tokensNome(nomeSite);
  if (a.length === 0 || b.length === 0) return 0;
  let fortes = 0;
  for (const ta of a) {
    const melhor = Math.max(...b.map((tb) => stringSimilarity.compareTwoStrings(ta, tb)));
    if (melhor >= LIMIAR_TOKEN) fortes += 1;
  }
  return fortes / Math.min(a.length, b.length);
}

function melhorPessoa(nome: string, pessoas: PessoaSite[]): { indice: number; score: number } {
  let indice = -1;
  let score = 0;
  pessoas.forEach((p, i) => {
    const s = pontuarPessoa(nome, p.nome);
    if (s > score) {
      score = s;
      indice = i;
    }
  });
  return { indice, score };
}

function situacaoCampo(valorPlanilha: string, valorSite?: string): SituacaoCampo {
  if (valorSite === undefined) return "fonte_nao_informa";
  const p = normalizarTexto(valorPlanilha);
  const s = normalizarTexto(valorSite);
  return s.includes(p) || p.includes(s) ? "confere" : "divergente";
}

function montarResultado(
  contato: ContatoPlanilha,
  pessoa: PessoaSite | undefined,
  score: number,
  origem: OrigemVeredito,
  url?: string,
): ResultadoContato {
  if (!pessoa) {
    return {
      contato,
      semaforo: "vermelho",
      score,
      comparacoes: [],
      camposDivergentes: [{ campo: "nome", valorPlanilha: contato.nome }],
      origem,
      fonteUrl: url,
    };
  }
  const comparacoes: ComparacaoCampo[] = [];
  for (const campo of CAMPOS_AUDITADOS) {
    const valorPlanilha = campo.planilha(contato);
    if (!valorPlanilha) continue; // nada a auditar
    const valorSite = campo.site(pessoa);
    comparacoes.push({ campo: campo.campo, valorPlanilha, valorSite, situacao: situacaoCampo(valorPlanilha, valorSite) });
  }
  const camposDivergentes: CampoDivergente[] = comparacoes
    .filter((c) => c.situacao === "divergente")
    .map((c) => ({ campo: c.campo, valorPlanilha: c.valorPlanilha, valorEncontrado: c.valorSite }));
  const semaforo: Semaforo = camposDivergentes.length > 0 ? "amarelo" : "verde";
  return { contato, semaforo, score, comparacoes, camposDivergentes, origem, fonteUrl: url };
}

export function compararContato(
  contato: ContatoPlanilha,
  fonte: ConteudoFonte,
  origem: OrigemVeredito = "oficial",
): ResultadoContato {
  const { indice, score } = melhorPessoa(contato.nome, fonte.pessoas);
  const casou = indice >= 0 && score >= LIMIAR_PESSOA;
  return montarResultado(contato, casou ? fonte.pessoas[indice] : undefined, score, origem, fonte.url);
}
```

Reescrever `compararGrupo` para rastrear pessoas usadas e derivar "novos":

```ts
export function compararGrupo(
  grupo: string,
  contatos: ContatoPlanilha[],
  fonte: ConteudoFonte | undefined,
  origem: OrigemVeredito = "oficial",
): ResultadoGrupo {
  if (!fonte) {
    return {
      grupo,
      semFonte: true,
      contatos: contatos.map((c) => ({
        contato: c,
        semaforo: "vermelho" as Semaforo,
        score: 0,
        comparacoes: [],
        camposDivergentes: [{ campo: "fonte", valorPlanilha: "sem URL cadastrada" }],
        origem: "oficial" as const,
        observacao: "Grupo sem fonte oficial cadastrada",
      })),
      novos: [],
    };
  }
  const usados = new Set<number>();
  const resultados = contatos.map((c) => {
    const { indice, score } = melhorPessoa(c.nome, fonte.pessoas);
    const casou = indice >= 0 && score >= LIMIAR_PESSOA;
    if (casou) usados.add(indice);
    return montarResultado(c, casou ? fonte.pessoas[indice] : undefined, score, origem, fonte.url);
  });
  const novos = fonte.pessoas.filter((_, i) => !usados.has(i));
  return { grupo, fonteUrl: fonte.url, semFonte: false, contatos: resultados, novos };
}
```

`compararGrupoAmplo` permanece (chama `compararGrupo(..., "pesquisa_ampla")` e marca `viaPesquisaAmpla`). `marcarFonteInacessivel` ganha `comparacoes: []` em cada contato (campo novo obrigatório).

Atualizar imports de tipos em `match.ts`: `ComparacaoCampo`, `SituacaoCampo`, `PessoaSite`.

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run tests/match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/match.ts tests/match.test.ts
git commit -m "feat: matching por token + comparação por campo (valorSite/fonte_nao_informa) e novos limpos"
```

---

## Task 4: Saída em colunas largas (`lib/export.ts`)

**Files:** Modify `lib/export.ts`; Modify `tests/export.test.ts`

- [ ] **Step 1: Escrever o teste das colunas planilha×site**

Atualizar `tests/export.test.ts`: o `analise` de teste passa a ter `comparacoes` no contato; assertar colunas:

```ts
test("achata em colunas planilha×site por campo", () => {
  const linhas = resultadoParaLinhas(analise);
  expect(linhas[0]).toMatchObject({
    Grupo: "ORG",
    Nome: "Ana",
    Status: "amarelo",
    "Cargo (planilha)": "Presidente",
    "Cargo (site)": "Diretor",
  });
});
```

Ajustar o objeto `analise` do teste para incluir `comparacoes: [{ campo: "cargo", valorPlanilha: "Presidente", valorSite: "Diretor", situacao: "divergente" }]` e `pessoas`/novos conforme novos tipos.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node node_modules/vitest/vitest.mjs run tests/export.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar colunas largas**

Reescrever `lib/export.ts` `resultadoParaLinhas` para gerar pares por campo. `LinhaExport` vira `Record<string, string>`:

```ts
import * as XLSX from "xlsx";
import type { ResultadoAnalise, ResultadoContato } from "@/lib/types";

const CAMPOS = [
  { campo: "cargo", rotulo: "Cargo" },
  { campo: "endereco", rotulo: "Endereço" },
  { campo: "telefone", rotulo: "Telefone" },
  { campo: "email", rotulo: "E-mail" },
];

function valorSiteDe(c: ResultadoContato, campo: string): string {
  const comp = c.comparacoes.find((x) => x.campo === campo);
  if (!comp) return "";
  return comp.situacao === "fonte_nao_informa" ? "fonte não informa" : comp.valorSite ?? "";
}

export function resultadoParaLinhas(analise: ResultadoAnalise): Record<string, string>[] {
  const linhas: Record<string, string>[] = [];
  for (const g of analise.grupos) {
    for (const c of g.contatos) {
      const linha: Record<string, string> = {
        Grupo: g.grupo,
        Nome: c.contato.nome,
        Status: c.semaforo,
        Divergencias: c.camposDivergentes.map((d) => d.campo).join(", "),
        Origem: c.origem,
        Fonte: c.fonteUrl ?? "",
        Observacao: c.observacao ?? "",
      };
      for (const f of CAMPOS) {
        const planilhaVal = c.comparacoes.find((x) => x.campo === f.campo)?.valorPlanilha ?? "";
        linha[`${f.rotulo} (planilha)`] = planilhaVal;
        linha[`${f.rotulo} (site)`] = valorSiteDe(c, f.campo);
      }
      linhas.push(linha);
    }
    for (const novo of g.novos) {
      const linha: Record<string, string> = {
        Grupo: g.grupo, Nome: novo.nome, Status: "novo",
        Divergencias: "", Origem: "oficial", Fonte: g.fonteUrl ?? "",
        Observacao: "Pessoa no site sem correspondência na planilha",
      };
      for (const f of CAMPOS) {
        linha[`${f.rotulo} (planilha)`] = "";
        linha[`${f.rotulo} (site)`] = f.campo === "cargo" ? novo.cargo ?? "" : "";
      }
      linhas.push(linha);
    }
  }
  return linhas;
}
```

`gerarXlsx`/`gerarCsv` permanecem (usam `resultadoParaLinhas`).

- [ ] **Step 4: Rodar e ver passar**

Run: `node node_modules/vitest/vitest.mjs run tests/export.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export.ts tests/export.test.ts
git commit -m "feat: export em colunas largas planilha×site por campo"
```

---

## Task 5: UI — divergência mostra planilha → site (`components/resultado-tabela.tsx`)

**Files:** Modify `components/resultado-tabela.tsx`

- [ ] **Step 1: Atualizar a célula de divergências e os "novos"**

Trocar a coluna "Divergências" para mostrar, por divergência, `campo: «planilha» → «site»`, e os "novos" para usar `n.nome`:

```tsx
<td>
  {c.camposDivergentes.length === 0
    ? "—"
    : c.camposDivergentes
        .map((d) => `${d.campo}: ${d.valorPlanilha ?? "—"} → ${d.valorEncontrado ?? "fonte não informa"}`)
        .join("; ")}
</td>
```

E na linha de "novos": `<td>{n.nome}</td>` (substituindo `n.nomePolitico ?? n.nomeCompleto`).

- [ ] **Step 2: Verificar typecheck e build**

Run: `node node_modules/typescript/bin/tsc --noEmit`
Expected: 0 erros nos arquivos de UI.

- [ ] **Step 3: Commit**

```bash
git add components/resultado-tabela.tsx
git commit -m "feat: tabela mostra divergência como planilha → site e novos por nome"
```

---

## Task 6: Reconciliar consumidores restantes + verde geral

**Files:** Modify `lib/gemini.ts`, `lib/analise.ts` (se necessário), `tests/analise.test.ts`, `tests/gemini.test.ts`

- [ ] **Step 1: `pesquisarFonteAmpla` passa a preencher `pessoas`**

Em `lib/gemini.ts`, no retorno de `pesquisarFonteAmpla`, incluir `pessoas`:

```ts
return {
  url: URL_PESQUISA_AMPLA,
  textoLimpo: pessoas.map((p) => `${p.nome}${p.cargo ? `, ${p.cargo}` : ""}.`).join(" "),
  destaques: pessoas.map((p) => p.nome),
  pessoas: pessoas.map((p) => ({ nome: p.nome, cargo: p.cargo })),
};
```

(`refinarComGemini` continua operando sobre `ResultadoGrupo`; só garantir que não referencia campos removidos.)

- [ ] **Step 2: Ajustar fixtures de teste que constroem `ConteudoFonte`**

Em `tests/analise.test.ts` e `tests/gemini.test.ts`, todo literal `ConteudoFonte` ganha `pessoas: [...]` coerente (ex.: a `fonte`/`fonteAmpla` com `pessoas: [{ nome: "Ana Maria Política Completa", cargo: "Presidente" }]`). Onde os testes de `analise` checavam `semaforo: "verde"`, manter — agora o verde vem de pessoa casada + cargo conferindo (ou sem cargo na planilha → sem divergência → verde).

- [ ] **Step 3: Rodar a suíte inteira**

Run: `node node_modules/vitest/vitest.mjs run`
Expected: PASS (todos).

- [ ] **Step 4: Typecheck + build**

Run: `node node_modules/typescript/bin/tsc --noEmit` → 0 erros
Run: `node node_modules/next/dist/bin/next build` → sucesso

- [ ] **Step 5: Commit**

```bash
git add lib/gemini.ts tests/analise.test.ts tests/gemini.test.ts
git commit -m "chore: reconciliar ConteudoFonte.pessoas em gemini e testes; suíte verde"
```

---

## Task 7: Verificação fim-a-fim da Fase 1

- [ ] **Step 1: Suíte + typecheck + build verdes** (comandos acima).
- [ ] **Step 2: Sanidade manual** — `node node_modules/next/dist/bin/next dev`, subir o CNJ real e conferir: "novos" só com nomes reais; sem duplo-cont; colunas `Cargo (planilha)`/`Cargo (site)`; endereço como "fonte não informa".
- [ ] **Step 3: Atualizar `CLAUDE.md`** se necessário (a auditoria agora é por pessoa estruturada).
- [ ] **Step 4: Commit final da fase.**

```bash
git commit -am "docs: nota da auditoria por campo (Fase 1)"
```

---

# FASE 2 — Gemini estruturado (OPCIONAL — executar SÓ quando o Clovis adicionar `GEMINI_API_KEY`)

> Não traz benefício sem a chave (degrada para a Fase 1). Implementar quando a chave existir na Vercel.

## Task 8: `extrairComposicaoGemini` (`lib/gemini.ts`)

**Files:** Modify `lib/gemini.ts`; Modify `tests/gemini.test.ts`

- [ ] **Step 1: Teste com cliente fake**

```ts
describe("extrairComposicaoGemini", () => {
  test("converte texto raspado em pessoas estruturadas", async () => {
    const cliente = { gerarJson: vi.fn().mockResolvedValue([{ nome: "Ana Lima", cargo: "Conselheira" }]) };
    const pessoas = await extrairComposicaoGemini("...texto bagunçado...", cliente);
    expect(pessoas).toEqual([{ nome: "Ana Lima", cargo: "Conselheira" }]);
  });
  test("sem chave e sem cliente → []", async () => {
    expect(await extrairComposicaoGemini("x")).toEqual([]);
  });
});
```

- [ ] **Step 2: Implementar** (reusa `extrairJson`/`parsePessoas`):

```ts
export async function extrairComposicaoGemini(
  textoLimpo: string,
  cliente?: GeminiCliente,
): Promise<PessoaSite[]> {
  if (!geminiDisponivel() && !cliente) return [];
  try {
    const gemini = cliente ?? (await criarClientePadrao());
    const prompt = [
      "Extraia a composição atual a partir do texto a seguir.",
      'Responda APENAS um array JSON [{"nome": string, "cargo": string}], sem texto extra.',
      textoLimpo.slice(0, 8000),
    ].join("\n\n");
    return parsePessoas(await gemini.gerarJson(prompt)).map((p) => ({ nome: p.nome, cargo: p.cargo }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 3:** Rodar testes; commit.

```bash
git add lib/gemini.ts tests/gemini.test.ts
git commit -m "feat: extrairComposicaoGemini (Fase 2, dormente sem chave)"
```

## Task 9: Enriquecer `pessoas` no orquestrador (`lib/analise.ts`)

**Files:** Modify `lib/analise.ts`, `app/api/analise/route.ts`, `tests/analise.test.ts`

- [ ] **Step 1: Nova dep opcional** `enriquecerPessoas?: (fonte: ConteudoFonte) => Promise<ConteudoFonte>` em `Dependencias`. Após `raspar` bem-sucedido, se presente, `fonte = await deps.enriquecerPessoas(fonte)` (degrada para a mesma `fonte` em erro). Teste: com enriquecedor que troca `pessoas`, o matching usa as novas.
- [ ] **Step 2: Implementar** o enriquecedor no `route.ts`:

```ts
enriquecerPessoas: async (fonte) => {
  const pessoas = await extrairComposicaoGemini(fonte.textoLimpo);
  return pessoas.length > 0 ? { ...fonte, pessoas } : fonte;
},
```

- [ ] **Step 3:** Suíte + typecheck + build verdes; commit.

```bash
git add lib/analise.ts app/api/analise/route.ts tests/analise.test.ts
git commit -m "feat: enriquecer pessoas via Gemini quando há chave (Fase 2)"
```

---

## Self-Review (preenchido)

- **Cobertura do spec:** modelo (T1), extração determinística+separadores+filtro (T2), matching por token + comparação por campo + novos limpos (T3), colunas largas (T4), UI (T5), pesquisa ampla com `pessoas` (T6), Gemini estruturado (T8/T9). ✔
- **Placeholders:** nenhum "TODO"/"etc." em passos de código. ✔
- **Consistência de tipos:** `PessoaSite.nome`/`cargo`, `ConteudoFonte.pessoas`, `ComparacaoCampo{campo,valorPlanilha,valorSite?,situacao}`, `ResultadoContato.comparacoes` usados igualmente em T1→T9. `marcarFonteInacessivel` recebe `comparacoes: []` (T3). ✔
