# IA-first: composição com proveniência + auditoria por campo — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Tornar o Haiku o motor de composição (uma chamada por grupo), com proveniência por dado, auditoria de nome/cargo/endereço e status "possível saída" — consertando páginas JS (TCU) e os 4 pedidos do Clovis.

**Architecture:** `extrairComposicao(grupoCanonico, textoLimpo)` faz UMA chamada Haiku que devolve `PessoaSite[]` com `origem` ("pagina"/"conhecimento"); quando o texto raspado é vazio (JS) ela completa pelo conhecimento. O orquestrador raspa, chama a IA, e compara campo a campo. Sem chave → determinístico.

**Tech Stack:** Next.js 15 + TS · Anthropic Haiku via `fetch` (criarCliente já existe) · Vitest.

Spec: `docs/superpowers/specs/2026-06-14-ia-first-composicao-proveniencia.md`
Comandos: `node node_modules/vitest/vitest.mjs run` · `node node_modules/typescript/bin/tsc --noEmit` · `node node_modules/next/dist/bin/next build`
Regras: TDD, sem `any`, `lib/*` puro/imutável, AAA PT-BR, cobertura ≥80%. PII: só texto público + nome do grupo vão ao Haiku.

---

## Arquivos
- `lib/types.ts` — `OrigemDado`; `PessoaSite{+endereco,+origem}`; `ComparacaoCampo{+origemValor}`; `ResultadoContato{+possivelSaida}`.
- `lib/gemini.ts` — `extrairComposicao(grupoCanonico, textoLimpo)`; `parsePessoasComposicao`; remove `extrairComposicaoGemini`/`extrairComposicaoCore`/`pesquisarFonteAmpla`/`montarPromptComposicao`/`parsePessoas`.
- `lib/analise.ts` — `Dependencias` (troca `pesquisarAmpla`+`enriquecerPessoas` por `extrairComposicao`); `analisarGrupo` reescrito.
- `lib/match.ts` — `situacaoNome`; `montarResultado` audita nome/cargo/endereço + `possivelSaida`; remove `compararGrupoAmplo`.
- `lib/export.ts` + `components/resultado-tabela.tsx` — colunas Nome/Cargo/Endereço (planilha×site) + origem + "possível saída".
- `app/api/analise/route.ts` — injeta `extrairComposicao`.
- Testes: `gemini`, `analise`, `match`, `export`.

---

## Task 1: Tipos

**Files:** Modify `lib/types.ts`

- [ ] **Step 1: Adicionar `OrigemDado` e estender `PessoaSite`**

```ts
/** Proveniência de um dado vindo da Camada B. */
export type OrigemDado = "pagina" | "conhecimento";

export interface PessoaSite {
  nome: string;
  cargo?: string;
  endereco?: string;
  /** De onde veio o registro: lido da página ou do conhecimento do modelo. */
  origem?: OrigemDado;
  contexto?: string;
}
```
(Substitui a `PessoaSite` atual.)

- [ ] **Step 2: `ComparacaoCampo.origemValor` e `ResultadoContato.possivelSaida`**

Em `ComparacaoCampo` adicionar `origemValor?: OrigemDado;`. Em `ResultadoContato` adicionar
`/** Contato não encontrado na fonte (possível saída). */ possivelSaida?: boolean;`.

- [ ] **Step 3: Typecheck (vai quebrar nos consumidores — esperado)**

Run: `node node_modules/typescript/bin/tsc --noEmit` → erros em gemini/match/analise (corrigidos a seguir).

- [ ] **Step 4: Commit** — `git commit -am "feat: tipos de proveniência (OrigemDado, origemValor, possivelSaida)"`

---

## Task 2: `extrairComposicao` (uma chamada Haiku)

**Files:** Modify `lib/gemini.ts`; Modify `tests/gemini.test.ts`

- [ ] **Step 1: Testes (cliente fake)**

Em `tests/gemini.test.ts`, substituir os blocos `pesquisarFonteAmpla` e `extrairComposicaoGemini` por:

```ts
describe("extrairComposicao", () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  test("devolve pessoas com origem e endereço", async () => {
    const cliente = { gerarJson: vi.fn().mockResolvedValue([
      { nome: "Ana Lima", cargo: "Conselheira", endereco: "Praça X", origem: "pagina" },
      { nome: "Bruno Sá", cargo: "Conselheiro", origem: "conhecimento" },
    ]) };
    const pessoas = await extrairComposicao("CNJ", "texto da página", cliente);
    expect(pessoas).toEqual([
      { nome: "Ana Lima", cargo: "Conselheira", endereco: "Praça X", origem: "pagina" },
      { nome: "Bruno Sá", cargo: "Conselheiro", endereco: undefined, origem: "conhecimento" },
    ]);
  });

  test("origem inválida/ausente vira 'conhecimento'", async () => {
    const cliente = { gerarJson: vi.fn().mockResolvedValue([{ nome: "Ana", cargo: "X" }]) };
    const p = await extrairComposicao("G", "", cliente);
    expect(p[0].origem).toBe("conhecimento");
  });

  test("sem chave e sem cliente → []", async () => {
    expect(await extrairComposicao("G", "txt")).toEqual([]);
  });

  test("falha do cliente → [] (degrada)", async () => {
    const cliente = { gerarJson: vi.fn().mockRejectedValue(new Error("cota")) };
    expect(await extrairComposicao("G", "txt", cliente)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node node_modules/vitest/vitest.mjs run tests/gemini.test.ts` → FAIL.

- [ ] **Step 3: Implementar; remover funções de composição antigas**

Remover de `lib/gemini.ts`: `pesquisarFonteAmpla`, `extrairComposicaoGemini`, `extrairComposicaoCore`,
`montarPromptComposicao`, `promptComposicao` (antiga), `parsePessoas`, `PessoaComposicao`. Manter:
`iaDisponivel`, `URL_PESQUISA_AMPLA`, `GeminiCliente`, `criarCliente`, `extrairJson`. Adicionar:

```ts
import type { ConteudoFonte, PessoaSite, OrigemDado } from "@/lib/types";

function promptComposicao(grupoCanonico: string, textoLimpo: string): string {
  return [
    `Você audita a composição ATUAL de "${grupoCanonico}" (órgão/cargo público brasileiro).`,
    "Texto da página oficial (pode estar vazio/incompleto se a página usa JavaScript):",
    textoLimpo.slice(0, 8000) || "(a página não retornou conteúdo legível)",
    "Liste APENAS pessoas reais (ignore menus, seções e links). Para cada uma devolva:",
    '- nome (como aparece no site/oficial), cargo, endereco (institucional, se souber), origem.',
    'origem = "pagina" se o dado veio do texto acima; "conhecimento" se veio do seu conhecimento.',
    "Se não souber a composição com confiança, devolva [].",
    'Responda APENAS JSON: [{"nome":string,"cargo":string,"endereco":string,"origem":"pagina"|"conhecimento"}].',
  ].join("\n\n");
}

function parsePessoasComposicao(resposta: unknown): PessoaSite[] {
  if (!Array.isArray(resposta)) return [];
  const pessoas: PessoaSite[] = [];
  for (const item of resposta) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.nome !== "string" || o.nome.trim().length === 0) continue;
    const origem: OrigemDado = o.origem === "pagina" ? "pagina" : "conhecimento";
    pessoas.push({
      nome: o.nome.trim(),
      cargo: typeof o.cargo === "string" && o.cargo.length > 0 ? o.cargo : undefined,
      endereco: typeof o.endereco === "string" && o.endereco.length > 0 ? o.endereco : undefined,
      origem,
    });
  }
  return pessoas;
}

/**
 * Camada B: composição atual do grupo em UMA chamada. Extrai do texto raspado e
 * completa pelo conhecimento quando o texto é vazio/insuficiente (páginas JS).
 * Cada pessoa traz `origem`. Sem chave/erro/lista vazia → [].
 * PII: envia só o texto público + nome do grupo, nunca os contatos.
 */
export async function extrairComposicao(
  grupoCanonico: string,
  textoLimpo: string,
  cliente?: GeminiCliente,
): Promise<PessoaSite[]> {
  if (!iaDisponivel() && !cliente) return [];
  try {
    const ia = cliente ?? (await criarCliente());
    const resposta = await ia.gerarJson(promptComposicao(grupoCanonico, textoLimpo));
    return parsePessoasComposicao(resposta);
  } catch {
    return [];
  }
}
```
> `ConteudoFonte` pode deixar de ser importado em gemini.ts (verificar e remover import órfão).

- [ ] **Step 4: Rodar e ver passar** — `node node_modules/vitest/vitest.mjs run tests/gemini.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add lib/gemini.ts tests/gemini.test.ts && git commit -m "feat: extrairComposicao numa só chamada Haiku com proveniência"`

---

## Task 3: Orquestrador (`lib/analise.ts`)

**Files:** Modify `lib/analise.ts`; Modify `tests/analise.test.ts`

- [ ] **Step 1: Atualizar `Dependencias` e reescrever `analisarGrupo`**

```ts
import { compararGrupo, marcarFonteInacessivel } from "@/lib/match";
import { URL_PESQUISA_AMPLA } from "@/lib/gemini";
import type { FonteResolvida } from "@/lib/supabase";
import type { ContatoPlanilha, ConteudoFonte, PessoaSite, ResultadoAnalise, ResultadoGrupo, ResumoAnalise } from "@/lib/types";

export interface Dependencias {
  resolverFonte: (grupo: string) => Promise<FonteResolvida>;
  raspar: (url: string) => Promise<ConteudoFonte>;
  /** Camada B: composição via Haiku (texto raspado + conhecimento). [] = indisponível. */
  extrairComposicao: (grupoCanonico: string, textoLimpo: string) => Promise<PessoaSite[]>;
}

async function analisarGrupo(grupo: string, contatos: ContatoPlanilha[], deps: Dependencias): Promise<ResultadoGrupo> {
  const resolvida = await deps.resolverFonte(grupo);
  if (!resolvida.grupoCanonico) {
    const base = compararGrupo(grupo, contatos, undefined);
    return resolvida.sugestoes.length > 0 ? { ...base, sugestoesCadastro: resolvida.sugestoes } : base;
  }

  // 1. tenta raspar a URL oficial (se houver); falha → texto vazio
  let fonteRaspada: ConteudoFonte | undefined;
  if (resolvida.url) {
    try { fonteRaspada = await deps.raspar(resolvida.url); } catch { fonteRaspada = undefined; }
  }
  const textoLimpo = fonteRaspada?.textoLimpo ?? "";

  // 2. Camada B: composição (texto + conhecimento). Sem chave → []
  const pessoas = await deps.extrairComposicao(resolvida.grupoCanonico, textoLimpo);
  if (pessoas.length > 0) {
    const usouConhecimento = pessoas.some((p) => p.origem === "conhecimento");
    const fonte: ConteudoFonte = {
      url: resolvida.url ?? URL_PESQUISA_AMPLA,
      textoLimpo,
      destaques: [],
      pessoas,
    };
    const r = compararGrupo(grupo, contatos, fonte);
    return usouConhecimento || !resolvida.url ? { ...r, viaPesquisaAmpla: true } : r;
  }

  // 3. sem IA (ou IA vazia): usa o determinístico do scrape, se houve
  if (fonteRaspada) return compararGrupo(grupo, contatos, fonteRaspada);
  // 4. tinha URL mas não raspou e IA vazia → inacessível
  if (resolvida.url) return marcarFonteInacessivel(grupo, contatos, resolvida.url, "fonte inacessível");
  // 5. sem URL e IA vazia → sem fonte
  return compararGrupo(grupo, contatos, undefined);
}
```
Remover `motivoDaFalha`/`ScrapeError`/`compararGrupoAmplo` imports não usados.

- [ ] **Step 2: Atualizar testes de `analise`**

Em `tests/analise.test.ts`: trocar a dep `pesquisarAmpla`/`enriquecerPessoas` por
`extrairComposicao: async () => []` no `deps` base (sem IA). Ajustar/!remover testes que usavam
`pesquisarAmpla`/`compararGrupoAmplo`/`viaPesquisaAmpla`. Adicionar:

```ts
test("página vazia (JS) + IA completa pelo conhecimento → casa e marca viaPesquisaAmpla", async () => {
  const depsIa: Dependencias = {
    ...deps,
    raspar: async () => ({ url: "https://tcu", textoLimpo: "", destaques: [], pessoas: [] }),
    extrairComposicao: async () => [
      { nome: "Ana Maria Política Completa", cargo: "Presidente", origem: "conhecimento" },
    ],
  };
  const r = await analisar("c.xlsx", [contatos[0]], depsIa);
  expect(r.grupos[0].viaPesquisaAmpla).toBe(true);
  expect(r.grupos[0].contatos[0].semaforo).toBe("verde");
});

test("sem IA cai no determinístico do scrape", async () => {
  const r = await analisar("c.xlsx", [contatos[0]], deps); // deps.extrairComposicao → []
  expect(r.grupos[0].contatos[0].semaforo).toBe("verde"); // fonte raspada tem a pessoa
});
```
> `deps.raspar` base já devolve `fonte` com `pessoas: [{nome:"Ana Maria Política Completa", cargo:"Presidente"}]` (manter).

- [ ] **Step 3: Rodar testes de analise** — `node node_modules/vitest/vitest.mjs run tests/analise.test.ts` → PASS.

- [ ] **Step 4: Commit** — `git add lib/analise.ts tests/analise.test.ts && git commit -m "feat: orquestrador IA-first (composição via Haiku + fallback por conhecimento)"`

---

## Task 4: Auditoria por campo (`lib/match.ts`)

**Files:** Modify `lib/match.ts`; Modify `tests/match.test.ts`

- [ ] **Step 1: Testes**

Adicionar em `tests/match.test.ts` (o `fonte` base ganha pessoas com origem):

```ts
test("nome divergente do site é flagrado (site é parâmetro)", () => {
  const f: ConteudoFonte = { url: "https://x", textoLimpo: "", destaques: [],
    pessoas: [{ nome: "Bruno Dantas", cargo: "Ministro", origem: "pagina" }] };
  const r = compararContato(contato({ nome: "Bruno Dantas Nascimento", cargo: "Ministro" }), f);
  const nome = r.comparacoes.find((c) => c.campo === "nome");
  expect(nome?.situacao).toBe("divergente");
  expect(nome?.valorSite).toBe("Bruno Dantas");
  expect(r.semaforo).toBe("amarelo");
});

test("endereço carrega a origem do dado (conhecimento → confira)", () => {
  const f: ConteudoFonte = { url: "https://x", textoLimpo: "", destaques: [],
    pessoas: [{ nome: "Ana Lima", cargo: "Conselheira", endereco: "SAFS Q4", origem: "conhecimento" }] };
  const r = compararContato(contato({ nome: "Ana Lima", endereco: "Rua Antiga" }), f);
  const end = r.comparacoes.find((c) => c.campo === "endereco");
  expect(end?.situacao).toBe("divergente");
  expect(end?.origemValor).toBe("conhecimento");
});

test("não casado → possivelSaida (não é 'fonte não informa')", () => {
  const f: ConteudoFonte = { url: "https://x", textoLimpo: "", destaques: [],
    pessoas: [{ nome: "Outra Pessoa Qualquer", cargo: "X", origem: "pagina" }] };
  const r = compararContato(contato({ nome: "Zzz Inexistente Pessoa" }), f);
  expect(r.possivelSaida).toBe(true);
  expect(r.semaforo).toBe("vermelho");
  expect(r.observacao).toMatch(/possível saída/i);
});
```

- [ ] **Step 2: Implementar — `situacaoNome` + `montarResultado` por campo**

Adicionar `situacaoNome` e reescrever `montarResultado`:

```ts
/** Nome: o site é o parâmetro — confere só se igual normalizado. */
function situacaoNome(planilha: string, site: string): SituacaoCampo {
  return normalizarNome(planilha) === normalizarNome(site) ? "confere" : "divergente";
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
      contato, semaforo: "vermelho", score,
      comparacoes: [],
      camposDivergentes: [{ campo: "nome", valorPlanilha: contato.nome }],
      possivelSaida: true,
      origem, fonteUrl: url,
      observacao: "Não consta na fonte (possível saída)",
    };
  }
  const comparacoes: ComparacaoCampo[] = [];
  const ov = pessoa.origem;
  comparacoes.push({ campo: "nome", valorPlanilha: contato.nome, valorSite: pessoa.nome, origemValor: ov, situacao: situacaoNome(contato.nome, pessoa.nome) });
  if (contato.cargo) comparacoes.push({ campo: "cargo", valorPlanilha: contato.cargo, valorSite: pessoa.cargo, origemValor: ov, situacao: situacaoCampo(contato.cargo, pessoa.cargo) });
  if (contato.endereco) comparacoes.push({ campo: "endereco", valorPlanilha: contato.endereco, valorSite: pessoa.endereco, origemValor: ov, situacao: situacaoCampo(contato.endereco, pessoa.endereco) });
  for (const campo of ["telefone", "email"] as const) {
    const v = contato[campo];
    if (v) comparacoes.push({ campo, valorPlanilha: v, valorSite: undefined, situacao: "fonte_nao_informa" });
  }
  const camposDivergentes: CampoDivergente[] = comparacoes
    .filter((c) => c.situacao === "divergente")
    .map((c) => ({ campo: c.campo, valorPlanilha: c.valorPlanilha, valorEncontrado: c.valorSite }));
  const semaforo: Semaforo = camposDivergentes.length > 0 ? "amarelo" : "verde";
  return { contato, semaforo, score, comparacoes, camposDivergentes, origem, fonteUrl: url };
}
```
Remover `CAMPOS_AUDITADOS` antigo (substituído pela lógica acima) e `compararGrupoAmplo`. Importar
`ComparacaoCampo`, `OrigemVeredito`, `PessoaSite` (já há). `compararGrupo` permanece (usa
`montarResultado`; novos = pessoas não casadas com cargo).

- [ ] **Step 3: Rodar** — `node node_modules/vitest/vitest.mjs run tests/match.test.ts` → PASS (ajustar testes antigos que assumiam `CAMPOS_AUDITADOS`/`compararGrupoAmplo`).

- [ ] **Step 4: Commit** — `git add lib/match.ts tests/match.test.ts && git commit -m "feat: auditoria de nome (site=parâmetro), endereço com origem e 'possível saída'"`

---

## Task 5: Saída/UI (`lib/export.ts`, `components/resultado-tabela.tsx`)

**Files:** Modify `lib/export.ts`; Modify `components/resultado-tabela.tsx`; Modify `tests/export.test.ts`

- [ ] **Step 1: Export — colunas Nome/Cargo/Endereço (planilha×site) + origem**

Em `lib/export.ts`, `CAMPOS = [{campo:"nome",rotulo:"Nome"},{campo:"cargo",rotulo:"Cargo"},{campo:"endereco",rotulo:"Endereço"}]`.
Para cada campo gerar `"<rotulo> (planilha)"` e `"<rotulo> (site)"`, e o site exibe origem:

```ts
function valorSiteDe(c: ResultadoContato, campo: string): string {
  const comp = c.comparacoes.find((x) => x.campo === campo);
  if (!comp) return "";
  if (comp.situacao === "fonte_nao_informa") return "fonte não informa";
  const v = comp.valorSite ?? "";
  return comp.origemValor === "conhecimento" ? `${v} (via IA — confira)` : v;
}
```
Na linha do contato, `Status` usa `c.possivelSaida ? "possível saída" : c.semaforo`. Manter `Divergencias`.
Atualizar o teste de `export` para o novo cabeçalho (`"Nome (planilha)"`/`"Nome (site)"`).

- [ ] **Step 2: Tabela — Nome (site), origem, possível saída**

Em `components/resultado-tabela.tsx`: na linha do contato, mostrar a divergência com origem
(`d.valorEncontrado` + " (via IA — confira)" quando a comparação for de conhecimento) e o status
"possível saída" quando `c.possivelSaida`. Para "novos", mostrar `n.cargo` e, se `n.origem ===
"conhecimento"`, sufixo "(via IA)".

- [ ] **Step 3: Rodar export tests + typecheck** — `node node_modules/vitest/vitest.mjs run tests/export.test.ts` e `tsc --noEmit`.

- [ ] **Step 4: Commit** — `git commit -am "feat: saída com Nome/Endereço (planilha×site), origem e 'possível saída'"`

---

## Task 6: Rota + reconciliação final

**Files:** Modify `app/api/analise/route.ts`; full suite

- [ ] **Step 1: Injetar `extrairComposicao` no route**

```ts
import { criarClienteServidor, resolverGrupoEFonte } from "@/lib/supabase";
import { raspar } from "@/lib/scrape";
import { extrairComposicao } from "@/lib/gemini";
// ...
const deps: Dependencias = {
  resolverFonte: (grupo) => resolverGrupoEFonte(supabase, grupo),
  raspar,
  extrairComposicao: (grupoCanonico, textoLimpo) => extrairComposicao(grupoCanonico, textoLimpo),
};
```
Remover imports/wiring de `pesquisarFonteAmpla`/`refinarComGemini`/`enriquecerPessoas`.

- [ ] **Step 2: Suíte + typecheck + build verdes**

Run: `node node_modules/vitest/vitest.mjs run` · `node node_modules/typescript/bin/tsc --noEmit` · `node node_modules/next/dist/bin/next build`. Corrigir resíduos (imports órfãos, fixtures de teste sem `origem`).

- [ ] **Step 3: `CLAUDE.md`** — atualizar a nota da Camada B para "composição em uma chamada com proveniência; página JS completa por conhecimento".

- [ ] **Step 4: Commit** — `git commit -am "chore: rota IA-first + CLAUDE.md; suíte verde"`

---

## Verificação fim-a-fim
1. Suíte + typecheck + build verdes.
2. Após deploy (com `ANTHROPIC_API_KEY`): probe sintético do **TCU** (nomes reais, autoridades públicas) → ministros casam (origem "conhecimento", rotulada), "novos" limpos. STF/CNJ → nome/cargo conferem; endereço com origem.
3. Sem chave: determinístico, com a nova semântica ("possível saída").

## Self-Review (preenchido)
- **Cobertura do spec:** tipos+proveniência (T1), extrairComposicao 1-call+origem (T2), orquestrador+fallback 0-pessoas (T3), nome=parâmetro+endereço+possívelSaída (T4), colunas+origem+saída (T5), rota (T6). ✔
- **Placeholders:** nenhum. ✔
- **Consistência de tipos:** `OrigemDado`, `PessoaSite.origem/endereco`, `ComparacaoCampo.origemValor`, `ResultadoContato.possivelSaida`, `extrairComposicao(grupoCanonico,textoLimpo)` usados igual em T1→T6. `compararGrupoAmplo`/`pesquisarFonteAmpla`/`enriquecerPessoas` removidos consistentemente. ✔
