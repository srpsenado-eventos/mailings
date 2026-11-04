# Bloqueio no Posse por grupo, regras do GT em vigor, tabela v02 e nome como no site — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** o Fiscal passa a dizer, por pessoa e por grupo, onde bloquear no Sistema Posse na hora de autorizar o grupo, registra o bloqueio feito, mostra as regras do GT em vigor, adota a tabela de tratamentos v02, deixa de ter exceção de nome (Garibaldi) e avisa o nome do STM acima de 50 caracteres.

**Arquitetura:** o bloqueio é um tipo novo de registro no histórico de decisões (`.fiscal/decisoes.json`), gravado pela rota existente `POST /api/decisoes` com um corpo próprio; nunca é decisão. Toda a lógica (grupos a bloquear, bloqueio vigente por grupo, pendências, textos) é função pura em `lib/decisoes.ts` e `lib/repetidos-decisoes.ts`, reaproveitada pela coleta, pelo painel, por `/repetidos` e pelo export; componentes só renderizam e chamam a rota. As regras do GT vivem em `data/regras-gt.ts`. A tabela v02 entra pelo gerador que já existe. O limite de caracteres é regra da Camada C num módulo novo (`lib/limite-nome.ts`), porque `lib/tratamento.ts` está a 8 linhas do limite de 800.

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind, Vitest, SheetJS (`scripts/gerar-tratamentos.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-04-bloqueio-no-posse-e-regras-do-gt-design.md`. Ler inteira antes da primeira tarefa; em caso de conflito entre este plano e a spec, a spec manda.

## Restrições globais

- `lib/*.ts` puro e imutável (nunca muta a entrada; devolve objeto novo); sem `any`; normalização só por `lib/normalize.ts` (`normalizarTexto`, `normalizarNome`); testes em português, padrão AAA, nomes descrevendo o comportamento.
- O app **nunca** escreve no Contatos nem no Posse. O bloqueio é só um registro.
- Um registro de bloqueio **nunca** muda o grupo do convite nem é "decisão": `vigente(caso)` continua devolvendo só `RegistroManual`.
- Grupos comparados sempre por `normalizarTexto` (`mesmoGrupo` em `lib/repetidos-base.ts`); grupo gravado no bloqueio é a forma equivalente (`grupoEquivalente(grupo, "contatos")`).
- Lista de fora (planilha da Câmara, eleitos do TSE) nunca é grupo a bloquear.
- Nenhuma mudança cria `possivelSaida`; o eixo de duplicidade continua fora do semáforo e das contagens Conferem/Com divergência.
- `.fiscal/decisoes.json` antigo (sem bloqueios, coletas sem `pendencias`) continua válido; `versao` continua `1`.
- Sem PII em log, prompt, nome de arquivo de teste ou mensagem de commit. Nomes de autoridades em testes só como já se faz na suíte (nomes fictícios ou de autoridades públicas já usados).
- Limites de arquivo: `lib/tratamento.ts` (792 linhas) **não pode passar de 800**; `lib/match.ts` e `lib/scrape.ts` já passam (dívida registrada), não crescer de propósito.
- Textos fixados pela spec (copiar exatamente):
  - situação: "Tratado", "Pendente de bloqueio no Posse", "Pendente: a cadastrar no grupo do convite", "Pendente: bloqueio no grupo do convite, desbloquear", "Reaberto"; mais de uma pendência separada por " · ", nessa ordem.
  - linha do painel: "Bloquear no Posse neste grupo ao autorizar · convite pelo grupo X (decisão do GT de DD/MM)"; "Bloqueada no Posse em DD/MM · convite pelo grupo X (decisão do GT de DD/MM)"; "Bloquear no Posse neste grupo ao autorizar · não recebe convite (decisão do GT de DD/MM)"; "Bloqueada no Posse em DD/MM · não recebe convite (decisão do GT de DD/MM)"; "Bloqueada no Posse em DD/MM, mas é o grupo do convite: desbloquear"; "Grupo do convite X sem a pessoa no Contatos" (já existe).
  - cabeçalho do grupo: "N a bloquear no Posse ao autorizar este grupo"; "M bloqueadas no Posse" (com M = 1: "1 bloqueada no Posse").
  - botões: "Marcar bloqueio no Posse", "Desfazer bloqueio". Cartão e filtro: "A bloquear no Posse". Filtro de `/repetidos`: "Tratadas". Colunas: "Grupos a bloquear no Posse", "Bloqueios registrados".
  - quadro: "Regras do GT em vigor"; linha curta no cabeçalho: "Regra do GT de DD/MM: título". Textos das 5 regras: §3.2 da spec.
  - rota: 422 com "Registre a decisão do GT antes de marcar o bloqueio."
  - limite do STM: "Nome com N caracteres, acima do limite de 50 do Posse: abreviar o sobrenome, nunca a patente (regra do GT de 04/11)".
- npm; antes de cada commit `npm test` e `npm run typecheck`; `npm run build` ao fim das tarefas 7, 10 e 11. Commits `<tipo>: <descrição>` em português, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nunca `git add -A` (há arquivos soltos na raiz que não entram); adicionar arquivo por arquivo.
- Branch de trabalho: `feat/bloqueio-posse-e-regras-gt` (já existe, criada de `main`).

## Pontos de atenção da revisão

1. **Histórico antigo**: coleta sem `pendencias` e caso sem bloqueio são lidos sem erro e produzem a situação nova. Teste na Tarefa 2 (`validarHistorico`) e na Tarefa 1 (`registrarColetas` com coleta antiga).
2. **Bloqueio num grupo que virou grupo do convite** (decisão nova com outro `convidaPor`): sai "mas é o grupo do convite: desbloquear", nunca "Bloqueada" fosca. Teste na Tarefa 1 (`quadroDeBloqueio`) e na Tarefa 3 (`marcaDaDecisao`).
3. **Bloqueio e desbloqueio no mesmo dia**: vale o gravado por último. Teste na Tarefa 1 (`bloqueioVigente`).
4. **Pessoa com dois casos** (Jader Barbalho × Ex-Presidentes e × Jader Filho): o bloqueio vai ao caso dos grupos informados, nunca ao outro. Teste na Tarefa 2 (`tratarRegistroDeDecisao` com `grupos`).
5. **Nome com exatamente 50 caracteres** não acusa; 51 acusa; espaços nas pontas não contam. Teste na Tarefa 10.
6. **Reaparecimento dos 12 retirados** na base nova: caso não reabre e passa a "Pendente de bloqueio no Posse". Teste na Tarefa 1 (`situacaoDoCaso` com os grupos da decisão de volta).

---

### Tarefa 1: Contrato do bloqueio e situação nova (`lib/decisoes.ts`)

**Arquivos:**
- Modificar `lib/decisoes.ts` (tipos, `ehManual`, `situacaoDoCaso`, `registrarColetas`; funções novas).
- Modificar `lib/registro-decisao.ts:79` (`textoDoRegistro`, ramo do bloqueio) e `lib/armazem-decisoes.ts` (`lerRegistro`, ramo mínimo) só o bastante para o typecheck passar; a validação completa é a Tarefa 2.
- Testes: `tests/decisoes.test.ts`.

**Interfaces (produz):**
```ts
export type Pendencia = "bloqueio" | "cadastrar_convite" | "desbloquear_convite";
export interface RegistroBloqueio { tipo: "bloqueio" | "desbloqueio"; grupo: string; data: string; quem: string; observacao: string }
export interface RegistroColeta { tipo: "coleta"; data: string; situacao: SituacaoNoContatos; grupos: string[]; pendencias?: Pendencia[] }
export type Registro = RegistroManual | RegistroColeta | RegistroBloqueio;
export const TIPOS_DECISAO: readonly TipoDecisao[]; // ["mesma_pessoa", "pessoas_diferentes", "nao_recebe_convite", "ajustar_contatos"]
export interface BloqueioDoGrupo { grupo: string; bloqueado: boolean; data?: string; grupoDoConvite?: true }
export interface QuadroDeBloqueio { aBloquear: string[]; bloqueios: BloqueioDoGrupo[]; pendencias: Pendencia[] }
export function gruposABloquear(decisao: RegistroManual, gruposAtuais: readonly string[]): string[];
export function bloqueioVigente(c: CasoDecidido, grupo: string): RegistroBloqueio | undefined; // só quando o mais recente do grupo é "bloqueio"
export function quadroDeBloqueio(c: CasoDecidido, gruposAtuais: readonly string[]): QuadroDeBloqueio;
export const TEXTO_PENDENCIA: Readonly<Record<Pendencia, string>>;
export function textoDasPendencias(p: readonly Pendencia[]): string; // join " · "
export class BloqueioSemDecisaoError extends Error {}
export function registrarBloqueio(h: HistoricoDecisoes, nome: string, nomes: readonly string[], grupos: readonly string[], r: RegistroBloqueio): HistoricoDecisoes;
export interface PedidoDeBloqueio { nome: string; nomes: string[]; grupos: string[]; bloqueio: RegistroBloqueio }
```

Regras (spec §3.1.1 a §3.1.3):
- `ehManual(r)` passa a ser `TIPOS_DECISAO.includes(r.tipo)`.
- `gruposABloquear`: `mesma_pessoa` → grupos atuais que não são o convite (comparação por `normalizarTexto(grupoEquivalente(convidaPor, "contatos"))`); `nao_recebe_convite` → todos os atuais; demais → `[]`. Devolve os grupos como vieram em `gruposAtuais`, sem repetição por `normalizarTexto`.
- `bloqueioVigente`: entre os registros `bloqueio`/`desbloqueio` cujo `grupo` casa por `normalizarTexto`, o de maior `data`; no empate, o último na ordem do array. Devolve o registro se `tipo === "bloqueio"`, senão `undefined`.
- `quadroDeBloqueio`: sem vigente, ou caso reaberto (a regra de hoje: algum atual fora de `grupos` do vigente que não é o convite), devolve `{ aBloquear: [], bloqueios: [], pendencias: [] }`. Senão: `aBloquear = gruposABloquear`; `bloqueios` = um por grupo a bloquear com `bloqueado = bloqueioVigente !== undefined` e `data` do registro (só quando bloqueado); para `mesma_pessoa` com convite e `bloqueioVigente(c, convite)`, acrescenta no fim `{ grupo: convidaPor.trim(), bloqueado: true, data, grupoDoConvite: true }`. `pendencias`, nesta ordem: `"bloqueio"` se algum item sem `grupoDoConvite` tem `bloqueado === false`; `"cadastrar_convite"` se `mesma_pessoa` com convite e o convite não está nos atuais; `"desbloquear_convite"` se há item com `grupoDoConvite`. `nao_recebe_convite` só pode ter `"bloqueio"`; `ajustar_contatos` e `pessoas_diferentes` sempre `[]`.
- `situacaoDoCaso`: reaberto como hoje; `mesma_pessoa` sem `convidaPor` continua `"pendente"` (decisão incompleta, regra de hoje); `mesma_pessoa` e `nao_recebe_convite` → `"pendente"` se `quadroDeBloqueio(c, atuais).pendencias.length > 0`, senão `"tratado"`; `ajustar_contatos` e `pessoas_diferentes` como hoje.
- `registrarColetas`: a entrada leva `pendencias` quando não vazio; "mudou" compara `situacao` **e** `pendencias` (ausente = `[]`).
- `registrarBloqueio`: `grupo` vazio após `trim` → `DecisaoInvalidaError("O grupo do bloqueio está vazio.")`; `acharCaso(h, [nome, ...nomes], grupos)` sem caso ou sem `vigente` → `BloqueioSemDecisaoError("Registre a decisão do GT antes de marcar o bloqueio.")`; senão acrescenta cópia do registro ao fim de `registros`, sem mexer em `chaves`.
- `TEXTO_PENDENCIA = { bloqueio: "Pendente de bloqueio no Posse", cadastrar_convite: "Pendente: a cadastrar no grupo do convite", desbloquear_convite: "Pendente: bloqueio no grupo do convite, desbloquear" }`.
- `textoDoRegistro` (lib/registro-decisao.ts): bloqueio → `"${dia} · Bloqueio no Posse em ${grupo} (${quem})"`, desbloqueio → `"${dia} · Desbloqueio no Posse em ${grupo} (${quem})"`, com ` · ${observacao}` ao fim quando houver; coleta com `pendencias` não vazio → `"${dia} · Coleta: ${textoDasPendencias(pendencias)}"` (sem pendências, como hoje).

- [ ] **Passo 1: testes que falham** em `tests/decisoes.test.ts`, num `describe("bloqueio no Posse (spec 2026-11-04 §3.1)")`. Fixtures: `manual()` como nos describes existentes; `const bloqueio = (grupo: string, data: string, tipo: "bloqueio" | "desbloqueio" = "bloqueio"): RegistroBloqueio => ({ tipo, grupo, data, quem: "Marina", observacao: "" })`. Casos:

```ts
it("gruposABloquear: mesma_pessoa tira o grupo do convite; nao_recebe_convite leva todos; os outros, nenhum", () => {
  const d = manual({ tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"] });
  expect(gruposABloquear(d, ["Ministros do STJ", "Ministros do TSE"])).toEqual(["Ministros do STJ"]);
  expect(gruposABloquear(manual({ tipo: "nao_recebe_convite", grupos: ["Senadores"] }), ["Senadores", "Ex-Presidentes do Senado"])).toEqual(["Senadores", "Ex-Presidentes do Senado"]);
  expect(gruposABloquear(manual({ tipo: "pessoas_diferentes", grupos: ["A", "B"] }), ["A", "B"])).toEqual([]);
  expect(gruposABloquear(manual({ tipo: "ajustar_contatos", grupos: ["A", "B"] }), ["A", "B"])).toEqual([]);
});
it("bloqueioVigente: vale o mais recente do grupo; desbloqueio no mesmo dia gravado depois desfaz; outro grupo não conta", () => {
  const caso = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"] })).casos[0];
  const comBloqueio = { ...caso, registros: [...caso.registros, bloqueio("A", "2026-11-05")] };
  expect(bloqueioVigente(comBloqueio, "a ")?.data).toBe("2026-11-05");
  expect(bloqueioVigente(comBloqueio, "B")).toBeUndefined();
  const desfeito = { ...comBloqueio, registros: [...comBloqueio.registros, bloqueio("A", "2026-11-05", "desbloqueio")] };
  expect(bloqueioVigente(desfeito, "A")).toBeUndefined();
  const refeito = { ...desfeito, registros: [...desfeito.registros, bloqueio("A", "2026-11-06")] };
  expect(bloqueioVigente(refeito, "A")?.data).toBe("2026-11-06");
});
it("quadroDeBloqueio: a bloquear sem bloqueio é pendência; bloqueado fecha; falta no convite é outra pendência", () => {
  const caso = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"] })).casos[0];
  expect(quadroDeBloqueio(caso, ["A", "B"])).toEqual({ aBloquear: ["A"], bloqueios: [{ grupo: "A", bloqueado: false }], pendencias: ["bloqueio"] });
  expect(quadroDeBloqueio(caso, ["A"]).pendencias).toEqual(["bloqueio", "cadastrar_convite"]);
  expect(quadroDeBloqueio(caso, ["B"])).toEqual({ aBloquear: [], bloqueios: [], pendencias: [] });
  expect(quadroDeBloqueio(caso, [])).toEqual({ aBloquear: [], bloqueios: [], pendencias: ["cadastrar_convite"] });
  const bloqueado = { ...caso, registros: [...caso.registros, bloqueio("A", "2026-11-05")] };
  expect(quadroDeBloqueio(bloqueado, ["A", "B"])).toEqual({ aBloquear: ["A"], bloqueios: [{ grupo: "A", bloqueado: true, data: "2026-11-05" }], pendencias: [] });
});
it("quadroDeBloqueio: bloqueio registrado no grupo do convite pede desbloqueio", () => {
  const caso = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"] })).casos[0];
  const errado = { ...caso, registros: [...caso.registros, bloqueio("A", "2026-11-05"), bloqueio("B", "2026-11-05")] };
  expect(quadroDeBloqueio(errado, ["A", "B"])).toEqual({
    aBloquear: ["A"],
    bloqueios: [{ grupo: "A", bloqueado: true, data: "2026-11-05" }, { grupo: "B", bloqueado: true, data: "2026-11-05", grupoDoConvite: true }],
    pendencias: ["desbloquear_convite"],
  });
});
it("quadroDeBloqueio: decisão nova que troca o convite reclassifica o bloqueio antigo como bloqueio no grupo do convite", () => {
  const h1 = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"], data: "2026-10-26" }));
  const comBloqueio = { ...h1.casos[0], registros: [...h1.casos[0].registros, bloqueio("A", "2026-11-05")] };
  const h2 = registrar({ versao: 1, casos: [comBloqueio] }, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "A", grupos: ["A", "B"], data: "2026-11-10" }));
  const q = quadroDeBloqueio(h2.casos[0], ["A", "B"]);
  expect(q.aBloquear).toEqual(["B"]);
  expect(q.bloqueios).toEqual([{ grupo: "B", bloqueado: false }, { grupo: "A", bloqueado: true, data: "2026-11-05", grupoDoConvite: true }]);
  expect(q.pendencias).toEqual(["bloqueio", "desbloquear_convite"]);
});
it("quadroDeBloqueio: nao_recebe_convite só tem a pendência de bloqueio; caso reaberto não tem quadro", () => {
  const caso = registrar(HISTORICO_VAZIO, "Rui Fictício", [], manual({ tipo: "nao_recebe_convite", grupos: ["A", "B"] })).casos[0];
  expect(quadroDeBloqueio(caso, ["A", "B"]).pendencias).toEqual(["bloqueio"]);
  expect(quadroDeBloqueio({ ...caso, registros: [...caso.registros, bloqueio("A", "2026-11-05"), bloqueio("B", "2026-11-05")] }, ["A", "B"]).pendencias).toEqual([]);
  expect(quadroDeBloqueio(caso, ["A", "B", "C"])).toEqual({ aBloquear: [], bloqueios: [], pendencias: [] });
});
it("situacaoDoCaso: mesma_pessoa nos dois grupos é pendente até o bloqueio; bloqueada vira tratado; só no convite é tratado", () => {
  const caso = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"] })).casos[0];
  expect(situacaoDoCaso(caso, ["A", "B"])).toBe("pendente");
  expect(situacaoDoCaso({ ...caso, registros: [...caso.registros, bloqueio("A", "2026-11-05")] }, ["A", "B"])).toBe("tratado");
  expect(situacaoDoCaso(caso, ["B"])).toBe("tratado");
  expect(situacaoDoCaso(caso, ["A", "B", "C"])).toBe("reaberto");
});
it("situacaoDoCaso: os retirados que voltam aos grupos da decisão não reabrem; ficam pendentes de bloqueio", () => {
  const caso = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"] })).casos[0];
  expect(situacaoDoCaso(caso, ["Ministros do TSE"])).toBe("tratado");
  expect(situacaoDoCaso(caso, ["Ministros do STJ", "Ministros do TSE"])).toBe("pendente");
  expect(quadroDeBloqueio(caso, ["Ministros do STJ", "Ministros do TSE"]).pendencias).toEqual(["bloqueio"]);
});
it("situacaoDoCaso: nao_recebe_convite bloqueada em todos os grupos é tratado; mesma_pessoa sem convidaPor continua pendente", () => {
  const caso = registrar(HISTORICO_VAZIO, "Rui Fictício", [], manual({ tipo: "nao_recebe_convite", grupos: ["A"] })).casos[0];
  expect(situacaoDoCaso(caso, ["A"])).toBe("pendente");
  expect(situacaoDoCaso({ ...caso, registros: [...caso.registros, bloqueio("A", "2026-11-05")] }, ["A"])).toBe("tratado");
  const semConvite = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", grupos: ["A", "B"] })).casos[0];
  expect(situacaoDoCaso(semConvite, ["A"])).toBe("pendente");
});
it("registrarColetas grava as pendências e registra de novo quando só elas mudam", () => {
  const h = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"] }));
  const c1 = registrarColetas(h, () => ["A", "B"], "2026-11-05");
  expect(c1.casos[0].registros.at(-1)).toEqual({ tipo: "coleta", data: "2026-11-05", situacao: "pendente", grupos: ["A", "B"], pendencias: ["bloqueio"] });
  const c2 = registrarColetas(c1, () => ["A"], "2026-11-06");
  expect(c2.casos[0].registros.at(-1)).toEqual({ tipo: "coleta", data: "2026-11-06", situacao: "pendente", grupos: ["A"], pendencias: ["bloqueio", "cadastrar_convite"] });
  expect(registrarColetas(c2, () => ["A"], "2026-11-07")).toBe(c2);
});
it("coleta antiga sem pendencias conta como sem pendência; a mesma situação com pendência nova é mudança", () => {
  const h = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"] }));
  const antiga: HistoricoDecisoes = { versao: 1, casos: [{ ...h.casos[0], registros: [...h.casos[0].registros, { tipo: "coleta", data: "2026-10-30", situacao: "pendente", grupos: ["A", "B"] }] }] };
  const nova = registrarColetas(antiga, () => ["A", "B"], "2026-11-05");
  expect(nova.casos[0].registros).toHaveLength(3);
  expect(nova.casos[0].registros.at(-1)).toMatchObject({ pendencias: ["bloqueio"] });
});
it("vigente ignora bloqueios e desbloqueios", () => {
  const caso = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"], data: "2026-10-26" })).casos[0];
  expect(vigente({ ...caso, registros: [...caso.registros, bloqueio("A", "2026-11-05")] })?.tipo).toBe("mesma_pessoa");
});
it("registrarBloqueio acrescenta ao caso dos grupos informados e recusa caso sem decisão", () => {
  const h = registrar(HISTORICO_VAZIO, "Ana Fictícia", [], manual({ tipo: "mesma_pessoa", convidaPor: "B", grupos: ["A", "B"] }));
  const novo = registrarBloqueio(h, "Ana Fictícia", [], ["A", "B"], bloqueio("A", "2026-11-05"));
  expect(novo.casos[0].registros.at(-1)).toEqual(bloqueio("A", "2026-11-05"));
  expect(h.casos[0].registros).toHaveLength(1);
  expect(() => registrarBloqueio(h, "Rui Fictício", [], ["A", "B"], bloqueio("A", "2026-11-05"))).toThrow(BloqueioSemDecisaoError);
  expect(() => registrarBloqueio(h, "Ana Fictícia", [], ["A", "B"], bloqueio("  ", "2026-11-05"))).toThrow(DecisaoInvalidaError);
});
it("registrarBloqueio com dois casos da mesma pessoa vai ao caso dos grupos", () => {
  const h = registrar(
    registrar(HISTORICO_VAZIO, "Jader Fictício", [], manual({ tipo: "mesma_pessoa", convidaPor: "Senadores", grupos: ["Senadores", "Ex-Presidentes do Senado"] })),
    "Jader Fictício", [], manual({ tipo: "pessoas_diferentes", grupos: ["Senadores", "Deputados Federais"] }),
  );
  const novo = registrarBloqueio(h, "Jader Fictício", [], ["Senadores", "Ex-Presidentes do Senado"], bloqueio("Ex-Presidentes do Senado", "2026-11-05"));
  expect(novo.casos.map((c) => c.registros.length)).toEqual([2, 1]);
});
it("textoDasPendencias junta na ordem fixa com ' · '", () => {
  expect(textoDasPendencias(["bloqueio", "cadastrar_convite"])).toBe("Pendente de bloqueio no Posse · Pendente: a cadastrar no grupo do convite");
  expect(textoDasPendencias([])).toBe("");
});
```
Também estender o teste "imutabilidade — nenhuma função muta a entrada" para `registrarBloqueio` e `quadroDeBloqueio` (congelar a entrada como o teste já faz).

- [ ] **Passo 2:** `npx vitest run tests/decisoes.test.ts`. Esperado: FAIL (funções não exportadas).
- [ ] **Passo 3:** implementar em `lib/decisoes.ts` com as assinaturas acima. Extrair a condição de reaberto de `situacaoDoCaso` para `function ehReaberto(decisao: RegistroManual, atuais: readonly string[]): boolean`, reaproveitada por `quadroDeBloqueio`. Manter o arquivo abaixo de 450 linhas. Conferir com `grep -rn '"coleta"' lib components` que nenhum outro lugar trata "tudo que não é coleta" como registro manual (hoje só `lib/registro-decisao.ts:79` e `lib/armazem-decisoes.ts`, cobertos pelo Passo 5 e pela Tarefa 2).
- [ ] **Passo 4:** `npx vitest run tests/decisoes.test.ts tests/decisoes-coleta.test.ts tests/repetidos.test.ts` → PASS. Nenhum teste antigo de `situacaoDoCaso` deve mudar de resultado (quem estava pendente por estar nos dois grupos continua pendente, agora pela pendência de bloqueio).
- [ ] **Passo 5:** `npm run typecheck` limpo (ajustar `textoDoRegistro` e `lerRegistro` como descrito acima; `lerRegistro` pode chamar um `lerRegistroBloqueio` mínimo que a Tarefa 2 completa). Acrescentar em `tests/registro-decisao.test.ts` (`describe("textoDoRegistro")`):
```ts
it("bloqueio e desbloqueio no histórico", () => {
  expect(textoDoRegistro({ tipo: "bloqueio", grupo: "Ministros do STJ", data: "2026-11-05", quem: "Marina", observacao: "na autorização" }))
    .toBe("05/11 · Bloqueio no Posse em Ministros do STJ (Marina) · na autorização");
  expect(textoDoRegistro({ tipo: "desbloqueio", grupo: "Ministros do STJ", data: "2026-11-06", quem: "Marina", observacao: "" }))
    .toBe("06/11 · Desbloqueio no Posse em Ministros do STJ (Marina)");
  expect(textoDoRegistro({ tipo: "coleta", data: "2026-11-05", situacao: "pendente", grupos: ["A"], pendencias: ["bloqueio", "cadastrar_convite"] }))
    .toBe("05/11 · Coleta: Pendente de bloqueio no Posse · Pendente: a cadastrar no grupo do convite");
});
```
- [ ] **Passo 6:** commit `feat: registro de bloqueio no Posse por grupo e situação com pendências`.

### Tarefa 2: Armazém, validação e rota (`lib/armazem-decisoes.ts`)

**Arquivos:**
- Modificar `lib/armazem-decisoes.ts` (`lerRegistroBloqueio`, `lerRegistroColeta` com `pendencias`, `lerRegistro`, `lerPedido`, `tratarRegistroDeDecisao`).
- Modificar o comentário de `app/api/decisoes/route.ts` (corpo `{ nome, nomes, registro }` **ou** `{ nome, nomes, grupos, bloqueio }`); a rota em si não muda.
- Testes: `tests/armazem-decisoes.test.ts`, `tests/decisoes-rota.test.ts`.

**Interfaces:**
- Consome: `registrarBloqueio`, `BloqueioSemDecisaoError`, `RegistroBloqueio`, `Pendencia`, `PedidoDeBloqueio` (Tarefa 1).
- Produz: `export function lerRegistroBloqueio(valor: unknown): Leitura<RegistroBloqueio>`; corpo aceito pela rota `{ nome, nomes, grupos, bloqueio: { tipo, grupo, data, quem, observacao } }`.

Regras: `lerRegistroBloqueio` exige `tipo` em `["bloqueio", "desbloqueio"]`, `grupo` texto não vazio após `trim`, `data` válida (`ehData`), `quem` texto não vazio, `observacao` texto; devolve objeto novo só com esses campos. `lerRegistroColeta` aceita `pendencias` ausente ou lista com valores em `["bloqueio", "cadastrar_convite", "desbloquear_convite"]` (copia só quando presente). `lerPedido`: com `bloqueio` no corpo exige `grupos` lista de textos com algum não vazio e devolve o `PedidoDeBloqueio`; sem `bloqueio` segue como hoje (tipo de retorno: união discriminada `{ tipo: "decisao"; pedido: PedidoDeDecisao } | { tipo: "bloqueio"; pedido: PedidoDeBloqueio }`). `tratarRegistroDeDecisao`: pedido de bloqueio chama `registrarBloqueio` dentro de `atualizarDecisoes`; `BloqueioSemDecisaoError` → `{ status: 422, corpo: { ok: false, message: err.message } }`.

- [ ] **Passo 1: testes que falham.** Em `tests/armazem-decisoes.test.ts`:
```ts
test("validarHistorico aceita bloqueio, desbloqueio e coleta com pendencias; recusa bloqueio sem grupo e pendência desconhecida", () => {
  const base = { id: "ana#a|b", nome: "Ana Fictícia", chaves: ["ana ficticia"], registros: [
    { tipo: "mesma_pessoa", data: "2026-10-26", quem: "GT", observacao: "", validacao: "validado", convidaPor: "B", grupos: ["A", "B"] },
    { tipo: "coleta", data: "2026-10-30", situacao: "pendente", grupos: ["A", "B"] },
    { tipo: "coleta", data: "2026-11-05", situacao: "pendente", grupos: ["A", "B"], pendencias: ["bloqueio"] },
    { tipo: "bloqueio", grupo: "A", data: "2026-11-06", quem: "Marina", observacao: "feito na autorização", telefone: "x" },
    { tipo: "desbloqueio", grupo: "A", data: "2026-11-06", quem: "Marina", observacao: "" },
  ] };
  const h = validarHistorico({ versao: 1, casos: [base] });
  expect(h.casos[0].registros[3]).toEqual({ tipo: "bloqueio", grupo: "A", data: "2026-11-06", quem: "Marina", observacao: "feito na autorização" });
  expect(h.casos[0].registros[1]).not.toHaveProperty("pendencias");
  expect(h.casos[0].registros[2]).toMatchObject({ pendencias: ["bloqueio"] });
  expect(() => validarHistorico({ versao: 1, casos: [{ ...base, registros: [{ tipo: "bloqueio", grupo: " ", data: "2026-11-06", quem: "M", observacao: "" }] }] })).toThrow(DecisoesIlegiveisError);
  expect(() => validarHistorico({ versao: 1, casos: [{ ...base, registros: [{ tipo: "coleta", data: "2026-11-05", situacao: "pendente", grupos: [], pendencias: ["x"] }] }] })).toThrow(DecisoesIlegiveisError);
});
```
Em `tests/decisoes-rota.test.ts`:
```ts
test("bloqueio em caso decidido grava o registro no caso e responde 200", async () => {
  const armazem = armazemDecisoesEmArquivo(caminho);
  await tratarRegistroDeDecisao(corpo(), armazem);
  const r = await tratarRegistroDeDecisao({ nome: "Ana Fictícia", nomes: [], grupos: ["Ministros do STJ", "Ministros do TSE"],
    bloqueio: { tipo: "bloqueio", grupo: "Ministros do STJ", data: "2026-11-05", quem: "Marina", observacao: "" } }, armazem);
  expect(r.status).toBe(200);
  expect(r.corpo.historico?.casos[0].registros.at(-1)).toEqual({ tipo: "bloqueio", grupo: "Ministros do STJ", data: "2026-11-05", quem: "Marina", observacao: "" });
});
test("bloqueio sem decisão registrada responde 422 e não grava", async () => {
  const armazem = armazemDecisoesEmMemoria();
  const r = await tratarRegistroDeDecisao({ nome: "Rui Fictício", nomes: [], grupos: ["A", "B"],
    bloqueio: { tipo: "bloqueio", grupo: "A", data: "2026-11-05", quem: "Marina", observacao: "" } }, armazem);
  expect(r.status).toBe(422);
  expect(r.corpo.message).toBe("Registre a decisão do GT antes de marcar o bloqueio.");
  expect((await armazem.ler()).casos).toHaveLength(0);
});
test("bloqueio com corpo inválido (sem grupos, tipo errado, quem vazio) responde 400", async () => {
  const armazem = armazemDecisoesEmMemoria();
  const b = { tipo: "bloqueio", grupo: "A", data: "2026-11-05", quem: "Marina", observacao: "" };
  expect((await tratarRegistroDeDecisao({ nome: "Ana", nomes: [], bloqueio: b }, armazem)).status).toBe(400);
  expect((await tratarRegistroDeDecisao({ nome: "Ana", nomes: [], grupos: ["A"], bloqueio: { ...b, tipo: "bloquear" } }, armazem)).status).toBe(400);
  expect((await tratarRegistroDeDecisao({ nome: "Ana", nomes: [], grupos: ["A"], bloqueio: { ...b, quem: " " } }, armazem)).status).toBe(400);
});
test("pessoa com dois casos: o bloqueio vai ao caso dos grupos informados", async () => {
  const armazem = armazemDecisoesEmMemoria();
  await tratarRegistroDeDecisao({ nome: "Jader Fictício", nomes: [], registro: registro({ convidaPor: "Senadores", grupos: ["Senadores", "Ex-Presidentes do Senado"] }) }, armazem);
  await tratarRegistroDeDecisao({ nome: "Jader Fictício", nomes: [], registro: registro({ tipo: "pessoas_diferentes", convidaPor: undefined, grupos: ["Senadores", "Deputados Federais"] }) }, armazem);
  const r = await tratarRegistroDeDecisao({ nome: "Jader Fictício", nomes: [], grupos: ["Senadores", "Ex-Presidentes do Senado"],
    bloqueio: { tipo: "bloqueio", grupo: "Ex-Presidentes do Senado", data: "2026-11-05", quem: "Marina", observacao: "" } }, armazem);
  expect(r.corpo.historico?.casos.map((c) => c.registros.length)).toEqual([2, 1]);
});
```
- [ ] **Passo 2:** `npx vitest run tests/armazem-decisoes.test.ts tests/decisoes-rota.test.ts` → FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npx vitest run tests/armazem-decisoes.test.ts tests/decisoes-rota.test.ts tests/decisoes-coleta.test.ts` → PASS; `npm run typecheck` limpo.
- [ ] **Passo 5:** commit `feat: POST /api/decisoes aceita o registro de bloqueio no Posse`.

### Tarefa 3: Bloqueio nas autoridades repetidas e nas marcas da linha (`lib/repetidos-decisoes.ts`, `lib/repetidos.ts`)

**Arquivos:**
- Modificar `lib/repetidos-base.ts` (`AutoridadeRepetida.pendencias?`, `.bloqueios?`).
- Modificar `lib/repetidos-decisoes.ts` (`comDecisao`, `noContatosDoCaso`, `TEXTO_SITUACAO_REPETIDA`, `textoNoContatos`, `marcaDaDecisao`, `MarcaDeRepeticao`; funções novas).
- Modificar `lib/repetidos.ts` (`etiquetaDeRepeticao`, `FiltroRepetidas`, `filtrarRepetidas`).
- Testes: `tests/repetidos.test.ts`.

**Interfaces:**
- Consome: `quadroDeBloqueio`, `BloqueioDoGrupo`, `Pendencia`, `TEXTO_PENDENCIA`, `textoDasPendencias` (Tarefa 1).
- Produz:
```ts
// lib/repetidos-base.ts
export interface AutoridadeRepetida { …; pendencias?: Pendencia[]; bloqueios?: BloqueioDoGrupo[] }
// lib/repetidos-decisoes.ts
export interface AlvoDeBloqueio { nome: string; nomes: string[]; grupos: string[] }
export interface AcaoBloqueio { alvo: AlvoDeBloqueio; grupo: string; bloqueado: boolean; grupoDoConvite?: true }
export interface MarcaDeRepeticao { etiquetas: Etiqueta[]; fosca: boolean; acao?: AcaoBloqueio }
export function alvoDeBloqueio(a: AutoridadeRepetida): AlvoDeBloqueio | undefined; // undefined sem `caso`/`decisao`
export function textoDaSituacao(a: AutoridadeRepetida): string;
export function textoDoBloqueio(b: BloqueioDoGrupo): string;
export function temGrupoABloquear(a: AutoridadeRepetida): boolean; // algum bloqueio sem grupoDoConvite e não bloqueado
export const TEXTO_SITUACAO_REPETIDA: Record<SituacaoRepetida, string>; // tratado passa a "Tratado"
// lib/repetidos.ts
export type FiltroRepetidas = "todas" | "conferir" | "decidido" | "decidido_gt" | "tratado" | "a_bloquear";
```

Regras:
- `noContatosDoCaso` passa a devolver `{ situacao, quadro }` com `quadro = quadroDeBloqueio(caso, gruposAtuaisParaOCaso(…))`; `comDecisao` grava `pendencias: quadro.pendencias` e `bloqueios: quadro.bloqueios` na autoridade (só quando não vazios).
- `textoDaSituacao(a)`: sem `noContatos` ou `sem_efeito` → `""`; `ajustar_contatos` → textos de hoje (`textoNoContatos`); `reaberto` → "Reaberto"; `tratado` → "Tratado"; `pendente` → `textoDasPendencias(a.pendencias)` ou "Pendente" quando vazio.
- `TEXTO_SITUACAO_REPETIDA.tratado = "Tratado"`. `textoNoContatos` continua para `ajustar_contatos` e para a coleta antiga.
- `alvoDeBloqueio(a)`: `{ nome: a.nome, nomes: semRepetir([a.nome, ...a.caso.chaves, ...a.ocorrencias.map((o) => o.chave)]), grupos: [...a.decisao.grupos] }`.
- `marcaDaDecisao(a, d, grupo)` (substitui a de hoje; `b = a.bloqueios?.find((x) => mesmoGrupo(x.grupo, daLinha))`):
  - `mesma_pessoa`, linha ≠ convite: `b?.bloqueado && !b.grupoDoConvite` → etiqueta neutra, `fosca: true`, "Bloqueada no Posse em DD/MM · convite pelo grupo X (decisão do GT de DD/MM)" (DD/MM do bloqueio é `dataDaDecisao(b.data)`); senão etiqueta de atenção, `fosca: false`, "Bloquear no Posse neste grupo ao autorizar · convite pelo grupo X (decisão do GT de DD/MM)". Quando `!a.convidaPor`, acrescenta a segunda etiqueta de atenção "Grupo do convite X sem a pessoa no Contatos". `acao = { alvo, grupo: daLinha, bloqueado: Boolean(b?.bloqueado) }`.
  - `mesma_pessoa`, linha = convite: etiqueta neutra "Convidada por este grupo; também em … (decisão do GT de DD/MM)" como hoje; se `b?.grupoDoConvite`, acrescenta etiqueta de atenção "Bloqueada no Posse em DD/MM, mas é o grupo do convite: desbloquear" e `acao = { alvo, grupo: daLinha, bloqueado: true, grupoDoConvite: true }`. `fosca: false`.
  - `nao_recebe_convite`: `b?.bloqueado` → neutra fosca "Bloqueada no Posse em DD/MM · não recebe convite (decisão do GT de DD/MM)"; senão atenção não fosca "Bloquear no Posse neste grupo ao autorizar · não recebe convite (decisão do GT de DD/MM)". `acao` como em `mesma_pessoa`.
  - `ajustar_contatos` e `pessoas_diferentes`: como hoje (uma etiqueta ou `undefined`), sem `acao`.
  - `explicacao` de todas as etiquetas: `a.motivo`, como hoje.
- `etiquetaDeRepeticao`: mesma assinatura; no caminho da regra devolve `{ etiquetas: [etiqueta], fosca: false }`.
- `textoDoBloqueio(b)`: `!b.bloqueado` → `"${b.grupo}: a bloquear"`; bloqueado sem convite → `"${b.grupo}: bloqueada em DD/MM"`; `grupoDoConvite` → `"${b.grupo}: bloqueada em DD/MM, mas é o grupo do convite: desbloquear"`.
- `filtrarRepetidas(lista, busca, "a_bloquear")`: `a.situacao !== "conferir" && temGrupoABloquear(a)`.

- [ ] **Passo 1: testes que falham** em `tests/repetidos.test.ts`, dentro de `describe("decisões do GT nos repetidos …")` ou num `describe("bloqueio no Posse nas repetidas (spec 2026-11-04 §3.1.4)")` com as mesmas fixtures (`stj`, `tseM`, `CUEVA`, `decisaoCueva`, `manual`, `decidir`). Fixture: `const comBloqueio = (h: HistoricoDecisoes, grupo: string, data = "2026-11-05", tipo: "bloqueio" | "desbloqueio" = "bloqueio"): HistoricoDecisoes => ({ versao: 1, casos: h.casos.map((c) => ({ ...c, registros: [...c.registros, { tipo, grupo, data, quem: "Marina", observacao: "" }] })) })`.

```ts
test("Cueva nos dois grupos sem bloqueio: STJ pede o bloqueio em atenção, sem fosco, com a ação; situação pendente de bloqueio", () => {
  const repetidas = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, decisaoCueva);
  expect(repetidas[0].pendencias).toEqual(["bloqueio"]);
  expect(repetidas[0].bloqueios).toEqual([{ grupo: "Ministros do STJ", bloqueado: false }]);
  expect(textoDaSituacao(repetidas[0])).toBe("Pendente de bloqueio no Posse");
  const marca = etiquetaDeRepeticao(repetidas, linha(CUEVA, "Ministro"), "Ministros do STJ");
  expect(marca?.fosca).toBe(false);
  expect(marca?.etiquetas.map((e) => [e.tom, e.texto])).toEqual([
    ["atencao", "Bloquear no Posse neste grupo ao autorizar · convite pelo grupo Ministros do TSE (decisão do GT de 26/10)"],
  ]);
  // `nomes` sem repetição por `normalizarTexto`: a chave do caso e a forma do Contatos são o mesmo nome.
  expect(marca?.acao).toEqual({ alvo: { nome: CUEVA, nomes: [CUEVA], grupos: ["Ministros do STJ", "Ministros do TSE"] }, grupo: "Ministros do STJ", bloqueado: false });
  const noTse = etiquetaDeRepeticao(repetidas, linha(CUEVA, "Ministro"), "Ministros do TSE");
  expect(noTse?.etiquetas.map((e) => e.texto)).toEqual(["Convidada por este grupo; também em Ministros do STJ (decisão do GT de 26/10)"]);
  expect(noTse?.acao).toBeUndefined();
});
test("Cueva bloqueado no STJ: linha fosca e neutra com a data; situação Tratado; ação de desfazer", () => {
  const h = comBloqueio(decisaoCueva, "Ministros do STJ");
  const repetidas = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, h);
  expect(repetidas[0].situacao).toBe("tratado");
  expect(textoDaSituacao(repetidas[0])).toBe("Tratado");
  const marca = etiquetaDeRepeticao(repetidas, linha(CUEVA, "Ministro"), "Ministros do STJ");
  expect(marca).toMatchObject({ fosca: true, acao: { grupo: "Ministros do STJ", bloqueado: true } });
  expect(marca?.etiquetas.map((e) => [e.tom, e.texto])).toEqual([["neutro", "Bloqueada no Posse em 05/11 · convite pelo grupo Ministros do TSE (decisão do GT de 26/10)"]]);
});
test("bloqueio marcado por engano no grupo do convite: etiqueta de atenção no TSE e situação pede desbloqueio", () => {
  const h = comBloqueio(comBloqueio(decisaoCueva, "Ministros do STJ"), "Ministros do TSE");
  const repetidas = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, h);
  expect(textoDaSituacao(repetidas[0])).toBe("Pendente: bloqueio no grupo do convite, desbloquear");
  const noTse = etiquetaDeRepeticao(repetidas, linha(CUEVA, "Ministro"), "Ministros do TSE");
  expect(noTse?.etiquetas.map((e) => [e.tom, e.texto])).toEqual([
    ["neutro", "Convidada por este grupo; também em Ministros do STJ (decisão do GT de 26/10)"],
    ["atencao", "Bloqueada no Posse em 05/11, mas é o grupo do convite: desbloquear"],
  ]);
  expect(noTse?.acao).toMatchObject({ grupo: "Ministros do TSE", bloqueado: true, grupoDoConvite: true });
  expect(noTse?.fosca).toBe(false);
});
test("pessoa só no grupo que não convida: pede o bloqueio e avisa que falta no grupo do convite; duas pendências", () => {
  const repetidas = autoridadesRepetidas([stj(CUEVA)], undefined, decisaoCueva);
  expect(textoDaSituacao(repetidas[0])).toBe("Pendente de bloqueio no Posse · Pendente: a cadastrar no grupo do convite");
  const marca = etiquetaDeRepeticao(repetidas, linha(CUEVA, "Ministro"), "Ministros do STJ");
  expect(marca?.etiquetas.map((e) => e.texto)).toEqual([
    "Bloquear no Posse neste grupo ao autorizar · convite pelo grupo Ministros do TSE (decisão do GT de 26/10)",
    "Grupo do convite Ministros do TSE sem a pessoa no Contatos",
  ]);
  expect(marca?.etiquetas.every((e) => e.tom === "atencao")).toBe(true);
});
test("nao_recebe_convite: a bloquear em cada grupo; bloqueada fica fosca", () => {
  const h = decidir(HISTORICO_VAZIO, "Rui Fictício", manual({ tipo: "nao_recebe_convite", grupos: ["Senadores", "Ex-Presidentes do Senado"] }));
  const grupos = [grupo("Senadores", [linha("Rui Fictício", "Senador")]), grupo("Ex-Presidentes do Senado", [linha("Rui Fictício", "Presidente do Senado Federal de 2019 a 2021")])];
  const antes = etiquetaDeRepeticao(autoridadesRepetidas(grupos, undefined, h), linha("Rui Fictício", "Senador"), "Senadores");
  expect(antes?.etiquetas.map((e) => [e.tom, e.texto])).toEqual([["atencao", "Bloquear no Posse neste grupo ao autorizar · não recebe convite (decisão do GT de 26/10)"]]);
  expect(antes?.fosca).toBe(false);
  const depois = etiquetaDeRepeticao(autoridadesRepetidas(grupos, undefined, comBloqueio(h, "Senadores")), linha("Rui Fictício", "Senador"), "Senadores");
  expect(depois?.etiquetas.map((e) => [e.tom, e.texto])).toEqual([["neutro", "Bloqueada no Posse em 05/11 · não recebe convite (decisão do GT de 26/10)"]]);
  expect(depois?.fosca).toBe(true);
});
test("rótulo da linha com espaço e caixa diferentes casa o bloqueio registrado", () => {
  const h = comBloqueio(decisaoCueva, "ministros do stj ");
  const repetidas = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, h);
  expect(etiquetaDeRepeticao(repetidas, linha(CUEVA, "Ministro"), "Ministros do STJ")?.fosca).toBe(true);
});
test("ajustar_contatos e caso a conferir não ganham ação de bloqueio", () => {
  const h = decidir(HISTORICO_VAZIO, CUEVA, manual({ tipo: "ajustar_contatos", convidaPor: "Ministros do TSE", grupos: ["Ministros do STJ", "Ministros do TSE"] }));
  const repetidas = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, h);
  expect(repetidas[0].bloqueios).toBeUndefined();
  expect(textoDaSituacao(repetidas[0])).toBe("Pendente no Contatos");
  expect(etiquetaDeRepeticao(repetidas, linha(CUEVA, "Ministro"), "Ministros do STJ")?.acao).toBeUndefined();
});
test("textoDoBloqueio e filtro a_bloquear", () => {
  expect(textoDoBloqueio({ grupo: "Ministros do STJ", bloqueado: false })).toBe("Ministros do STJ: a bloquear");
  expect(textoDoBloqueio({ grupo: "Ministros do STJ", bloqueado: true, data: "2026-11-05" })).toBe("Ministros do STJ: bloqueada em 05/11");
  expect(textoDoBloqueio({ grupo: "Ministros do TSE", bloqueado: true, data: "2026-11-05", grupoDoConvite: true })).toBe("Ministros do TSE: bloqueada em 05/11, mas é o grupo do convite: desbloquear");
  const lista = autoridadesRepetidas([stj(CUEVA), tseM(CUEVA), stf(), tse()], undefined, decisaoCueva);
  expect(filtrarRepetidas(lista, "", "a_bloquear").map((a) => a.nome)).toEqual([CUEVA]);
  expect(filtrarRepetidas(autoridadesRepetidas([stj(CUEVA), tseM(CUEVA)], undefined, comBloqueio(decisaoCueva, "Ministros do STJ")), "", "a_bloquear")).toEqual([]);
});
```
Atualizar os testes existentes que esperam a forma antiga: `etiquetaDeRepeticao(...)?.etiqueta` → `?.etiquetas[0]`; o texto "Será convidada pelo grupo Ministros do TSE (decisão do GT de 26/10)" passa a "Bloquear no Posse neste grupo ao autorizar · convite pelo grupo Ministros do TSE (decisão do GT de 26/10)" com `fosca: false` e `tom: "atencao"` (inclusive o caso Deputados Federais da linha ~899); `TEXTO_SITUACAO_REPETIDA.tratado` passa a "Tratado" onde testado.

- [ ] **Passo 2:** `npx vitest run tests/repetidos.test.ts` → FAIL.
- [ ] **Passo 3:** implementar. `components/painel.tsx` e `components/tela-repetidos.tsx` quebram no typecheck (`marca?.etiqueta`): ajustar `painel.tsx` ao mínimo (`repeticoes={marca?.etiquetas}`) e `linha-contato.tsx` (`repeticao?: Etiqueta` → `repeticoes?: readonly Etiqueta[]`, espalhados na lista de etiquetas); o resto da tela é a Tarefa 6.
- [ ] **Passo 4:** `npx vitest run tests/repetidos.test.ts tests/export-repetidos.test.ts tests/painel.test.ts` → PASS (o export ainda usa `textoNoContatos`; quebra só na Tarefa 4); `npm run typecheck` limpo.
- [ ] **Passo 5:** commit `feat: marcas de bloqueio no Posse nas autoridades em mais de um grupo`.

### Tarefa 4: Planilha de `/repetidos` (`lib/export-repetidos.ts`)

**Arquivos:**
- Modificar `lib/export-repetidos.ts`.
- Testes: `tests/export-repetidos.test.ts`.

**Interfaces:** consome `textoDaSituacao`, `BloqueioDoGrupo`, `dataDaDecisao` (Tarefa 3). `CABECALHO_REPETIDAS` ganha, no fim, "Grupos a bloquear no Posse" e "Bloqueios registrados". "Situação no Contatos" passa a `textoDaSituacao(a)`.

Regras: "Grupos a bloquear no Posse" = `(a.bloqueios ?? []).filter((b) => !b.grupoDoConvite).map((b) => b.grupo).join("; ")`; "Bloqueios registrados" = `(a.bloqueios ?? []).filter((b) => b.bloqueado && b.data).map((b) => \`${b.grupo} (${dataDaDecisao(b.data, true)})\`).join("; ")` (sem `!`: o filtro já garante `data`; usar um type guard ou narrowing).

- [ ] **Passo 1: testes que falham** em `tests/export-repetidos.test.ts` (`describe("com as decisões do GT")`):
```ts
test("colunas do bloqueio: grupos a bloquear e bloqueios registrados; situação com o texto da pendência", () => {
  const [pendente] = linhasRepetidas(autoridadesRepetidas(cueva, undefined, decisaoCueva));
  expect(pendente["Situação no Contatos"]).toBe("Pendente de bloqueio no Posse");
  expect(pendente["Grupos a bloquear no Posse"]).toBe("Ministros do STJ");
  expect(pendente["Bloqueios registrados"]).toBe("");
  const bloqueado: HistoricoDecisoes = { versao: 1, casos: decisaoCueva.casos.map((c) => ({ ...c, registros: [...c.registros, { tipo: "bloqueio", grupo: "Ministros do STJ", data: "2026-11-05", quem: "Marina", observacao: "" }] })) };
  const [tratado] = linhasRepetidas(autoridadesRepetidas(cueva, undefined, bloqueado));
  expect(tratado["Situação"]).toBe("Tratado");
  expect(tratado["Situação no Contatos"]).toBe("Tratado");
  expect(tratado["Bloqueios registrados"]).toBe("Ministros do STJ (05/11/2026)");
  expect(CABECALHO_REPETIDAS.slice(-2)).toEqual(["Grupos a bloquear no Posse", "Bloqueios registrados"]);
});
```
Ajustar o teste da linha 116 (`slice(-5)`) para `slice(-7)` com as duas colunas novas, e "Tratado no Contatos" → "Tratado" onde aparecer.
- [ ] **Passo 2:** `npx vitest run tests/export-repetidos.test.ts` → FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npx vitest run tests/export-repetidos.test.ts` → PASS; `npm run typecheck`.
- [ ] **Passo 5:** commit `feat: planilha de repetidos com os grupos a bloquear e os bloqueios registrados`.

### Tarefa 5: Formulário de bloqueio e tela `/repetidos`

**Arquivos:**
- Modificar `lib/registro-decisao.ts` (`FormularioBloqueio`, `FORMULARIO_BLOQUEIO_VAZIO`, `errosDoFormularioBloqueio`, `corpoDoBloqueio`).
- Criar `components/marcar-bloqueio.tsx` (cliente).
- Modificar `components/tela-repetidos.tsx` (filtros, bloqueios por grupo, botão, situação).
- Testes: `tests/registro-decisao.test.ts`.

**Interfaces:**
```ts
// lib/registro-decisao.ts
export interface FormularioBloqueio { data: string; quem: string; observacao: string }           // data AAAA-MM-DD
export function formularioBloqueioVazio(hoje: string): FormularioBloqueio;                      // { data: hoje, quem: "", observacao: "" }
export function errosDoFormularioBloqueio(f: FormularioBloqueio): string[];                      // "Informe a data (AAAA-MM-DD)." / "Informe quem marcou."
export function corpoDoBloqueio(alvo: AlvoDeBloqueio, grupo: string, tipo: "bloqueio" | "desbloqueio", f: FormularioBloqueio): PedidoDeBloqueio;
// components/marcar-bloqueio.tsx
export function MarcarBloqueio({ acao, modo }: { acao: AcaoBloqueio; modo: "local" | "web" }): JSX.Element | null;
```

Regras: `MarcarBloqueio` em modo web devolve `null`. Em modo local mostra o botão "Marcar bloqueio no Posse" (`acao.bloqueado === false`) ou "Desfazer bloqueio" (`true`); o clique abre um formulário pequeno (data `type="date"` com `formularioBloqueioVazio(hojeEmBrasilia())`, "Quem marcou", "Observação", botões "Gravar" e "Cancelar"), envia `POST /api/decisoes` com `corpoDoBloqueio(acao.alvo, acao.grupo, acao.bloqueado ? "desbloqueio" : "bloqueio", f)`, mostra `message` do erro como `registro-decisao.tsx` faz e chama `router.refresh()` no sucesso. Todo clique dentro do componente faz `e.stopPropagation()` (a linha do painel abre o detalhe ao clicar). Estilo igual ao de `registro-decisao.tsx` (`CAMPO`, `text-acao underline`).

Tela `/repetidos`: `FILTROS` com `{ id: "tratado", rotulo: "Tratadas" }` e `{ id: "a_bloquear", rotulo: "A bloquear no Posse" }` depois de "Decididas pelo GT"; na célula "Decisão do GT", `textoDaSituacao(a)` no lugar de `textoNoContatos(a.noContatos)` e, abaixo, uma lista `<ul>` com `textoDoBloqueio(b)` por item de `a.bloqueios`, cada item seguido de `<MarcarBloqueio acao={{ alvo, grupo: b.grupo, bloqueado: b.bloqueado, ...(b.grupoDoConvite ? { grupoDoConvite: true } : {}) }} modo={modo} />` (com `alvo = alvoDeBloqueio(a)`, só quando definido).

- [ ] **Passo 1: testes que falham** em `tests/registro-decisao.test.ts`:
```ts
describe("formulário de bloqueio (spec 2026-11-04 §3.1.4)", () => {
  const alvo = { nome: "Ana Fictícia", nomes: ["Ana Fictícia", "ana ficticia"], grupos: ["A", "B"] };
  it("começa com a data de hoje e exige data e quem", () => {
    expect(formularioBloqueioVazio("2026-11-05")).toEqual({ data: "2026-11-05", quem: "", observacao: "" });
    expect(errosDoFormularioBloqueio({ data: "", quem: " ", observacao: "" })).toEqual(["Informe a data (AAAA-MM-DD).", "Informe quem marcou."]);
    expect(errosDoFormularioBloqueio({ data: "2026-11-05", quem: "Marina", observacao: "" })).toEqual([]);
  });
  it("monta o corpo do bloqueio e do desbloqueio com os campos aparados", () => {
    expect(corpoDoBloqueio(alvo, "A", "bloqueio", { data: "2026-11-05", quem: " Marina ", observacao: " na autorização " })).toEqual({
      nome: "Ana Fictícia", nomes: ["Ana Fictícia", "ana ficticia"], grupos: ["A", "B"],
      bloqueio: { tipo: "bloqueio", grupo: "A", data: "2026-11-05", quem: "Marina", observacao: "na autorização" },
    });
    expect(corpoDoBloqueio(alvo, "A", "desbloqueio", { data: "2026-11-06", quem: "Marina", observacao: "" }).bloqueio.tipo).toBe("desbloqueio");
  });
  it("formulário com erro lança", () => {
    expect(() => corpoDoBloqueio(alvo, "A", "bloqueio", { data: "", quem: "", observacao: "" })).toThrow();
  });
});
```
- [ ] **Passo 2:** `npx vitest run tests/registro-decisao.test.ts` → FAIL.
- [ ] **Passo 3:** implementar `lib/registro-decisao.ts`, o componente e a tela.
- [ ] **Passo 4:** `npx vitest run tests/registro-decisao.test.ts` → PASS; `npm run typecheck`; `npm run build` (o componente novo é cliente).
- [ ] **Passo 5:** commit `feat: marcar e desfazer bloqueio no Posse em /repetidos`.

### Tarefa 6: Painel — linha, cabeçalho do grupo, cartão e filtro

**Arquivos:**
- Criar `lib/painel-bloqueio.ts`.
- Modificar `lib/painel.ts` (`Filtro`, `FILTROS`, `passaFiltro`, `filtrarGrupos`).
- Modificar `components/linha-contato.tsx` (props `repeticoes`, `bloqueio`, `modo`), `components/painel.tsx` (cabeçalho, cartão, filtro, props).
- Testes: `tests/painel-bloqueio.test.ts` (novo), `tests/painel.test.ts`.

**Interfaces:**
```ts
// lib/painel.ts
export type Filtro = "tudo" | "ressalva" | "endereco" | "numero" | "saida" | "inclusao" | "a_bloquear" | FiltroEleicao;
export const FILTROS; // + { id: "a_bloquear", rotulo: "A bloquear no Posse" } depois de "Propostas de inclusão"
export type PredicadoDeLinha = (c: ResultadoContato, g: ResultadoGrupo) => boolean;
export function filtrarGrupos(grupos, filtro, busca, grupo?, aBloquear?: PredicadoDeLinha): ResultadoGrupo[]; // "a_bloquear" usa o predicado; sem ele, ninguém passa
// lib/painel-bloqueio.ts
export interface ContagemDeBloqueio { aBloquear: number; bloqueadas: number }
export function contarBloqueiosDoGrupo(repetidas: readonly AutoridadeRepetida[], g: ResultadoGrupo): ContagemDeBloqueio;
export function textosDeBloqueioDoGrupo(n: ContagemDeBloqueio): { texto: string; tom: Tom }[];
export function totalABloquear(repetidas: readonly AutoridadeRepetida[], grupos: readonly ResultadoGrupo[]): number;
export function ehLinhaABloquear(repetidas: readonly AutoridadeRepetida[]): PredicadoDeLinha;
export const ROTULO_CARTAO_BLOQUEIO = "A bloquear no Posse";
```

Regras: tudo a partir de `etiquetaDeRepeticao(repetidas, c, g.grupo)?.acao`: conta "a bloquear" quando `acao && !acao.bloqueado`; "bloqueadas" quando `acao?.bloqueado && !acao.grupoDoConvite`. `textosDeBloqueioDoGrupo`: `[{ texto: "N a bloquear no Posse ao autorizar este grupo", tom: "atencao" }]` quando N > 0 e `[{ texto: M === 1 ? "1 bloqueada no Posse" : "M bloqueadas no Posse", tom: "neutro" }]` quando M > 0. `FILTROS_COM_NOVOS` não inclui `a_bloquear`. O grupo virtual Deputados Federais (`lib/painel-deputados.ts`) usa uma tabela por nome de filtro e não lista ninguém num filtro desconhecido: com `a_bloquear` ele some, como deve (lista de fora não tem bloqueio).

Componentes: `LinhaContato` recebe `repeticoes?: readonly Etiqueta[]`, `fosca?: boolean`, `bloqueio?: AcaoBloqueio`, `modo?: "local" | "web"`; renderiza `<MarcarBloqueio acao={bloqueio} modo={modo} />` na coluna das etiquetas, depois delas, quando `bloqueio` existe. `Painel`: no cabeçalho de cada grupo, depois de `resumoDoGrupo(g)`, os textos de `textosDeBloqueioDoGrupo(contarBloqueiosDoGrupo(repetidas, g))` com `text-atencao`/`text-cinza`; cartões = `[...cartoesDoResumo(retrato.resumo), { rotulo: ROTULO_CARTAO_BLOQUEIO, valor: totalABloquear(repetidas, retrato.grupos) }]` e a grade passa a `xl:grid-cols-7`; `filtrarGrupos(retrato.grupos, filtro, busca, grupo, ehLinhaABloquear(repetidas))` (atenção ao `useMemo`: inclui `repetidas` nas dependências); `LinhaContato` recebe `repeticoes`, `fosca`, `bloqueio={marca?.acao}` e `modo`.

- [ ] **Passo 1: testes que falham.** `tests/painel-bloqueio.test.ts` (fixtures como em `tests/repetidos.test.ts`: `linha`, `grupo`, `stj`, `tseM`, `CUEVA`, `decisaoCueva`, `comBloqueio`):
```ts
describe("bloqueio no Posse no painel (spec 2026-11-04 §3.1.4)", () => {
  test("conta a bloquear e bloqueadas por grupo e o total do cartão", () => {
    const grupos = [stj(CUEVA), tseM(CUEVA)];
    const antes = autoridadesRepetidas(grupos, undefined, decisaoCueva);
    expect(contarBloqueiosDoGrupo(antes, grupos[0])).toEqual({ aBloquear: 1, bloqueadas: 0 });
    expect(contarBloqueiosDoGrupo(antes, grupos[1])).toEqual({ aBloquear: 0, bloqueadas: 0 });
    expect(totalABloquear(antes, grupos)).toBe(1);
    const depois = autoridadesRepetidas(grupos, undefined, comBloqueio(decisaoCueva, "Ministros do STJ"));
    expect(contarBloqueiosDoGrupo(depois, grupos[0])).toEqual({ aBloquear: 0, bloqueadas: 1 });
    expect(totalABloquear(depois, grupos)).toBe(0);
  });
  test("bloqueio no grupo do convite não conta como bloqueada", () => {
    const grupos = [stj(CUEVA), tseM(CUEVA)];
    const lista = autoridadesRepetidas(grupos, undefined, comBloqueio(comBloqueio(decisaoCueva, "Ministros do STJ"), "Ministros do TSE"));
    expect(contarBloqueiosDoGrupo(lista, grupos[1])).toEqual({ aBloquear: 0, bloqueadas: 0 });
  });
  test("textos do cabeçalho", () => {
    expect(textosDeBloqueioDoGrupo({ aBloquear: 2, bloqueadas: 1 })).toEqual([
      { texto: "2 a bloquear no Posse ao autorizar este grupo", tom: "atencao" },
      { texto: "1 bloqueada no Posse", tom: "neutro" },
    ]);
    expect(textosDeBloqueioDoGrupo({ aBloquear: 0, bloqueadas: 3 })).toEqual([{ texto: "3 bloqueadas no Posse", tom: "neutro" }]);
    expect(textosDeBloqueioDoGrupo({ aBloquear: 0, bloqueadas: 0 })).toEqual([]);
  });
  test("filtro A bloquear no Posse deixa só os grupos e as linhas a bloquear", () => {
    const grupos = [stj(CUEVA), tseM(CUEVA), grupo("Senadores", [linha("Rui Fictício", "Senador")])];
    const lista = autoridadesRepetidas(grupos, undefined, decisaoCueva);
    const filtrados = filtrarGrupos(grupos, "a_bloquear", "", undefined, ehLinhaABloquear(lista));
    expect(filtrados.map((g) => [g.grupo, g.contatos.length])).toEqual([["Ministros do STJ", 1]]);
    expect(filtrarGrupos(grupos, "a_bloquear", "")).toEqual([]);
  });
});
```
Em `tests/painel.test.ts`, `describe("filtrarGrupos")`: um teste de que `FILTROS` contém `{ id: "a_bloquear", rotulo: "A bloquear no Posse" }` e que `filtrarGrupos(grupos, "a_bloquear", "")` não traz `novos`.
- [ ] **Passo 2:** `npx vitest run tests/painel-bloqueio.test.ts tests/painel.test.ts` → FAIL.
- [ ] **Passo 3:** implementar `lib/painel.ts`, `lib/painel-bloqueio.ts`, os componentes.
- [ ] **Passo 4:** `npx vitest run tests/painel-bloqueio.test.ts tests/painel.test.ts tests/repetidos.test.ts` → PASS; `npm run typecheck`; `npm run build`.
- [ ] **Passo 5:** commit `feat: painel mostra o que bloquear no Posse por grupo, com cartão e filtro`.

### Tarefa 7: Quadro "Regras do GT em vigor"

**Arquivos:**
- Criar `data/regras-gt.ts`, `lib/regras-gt.ts`, `components/regras-gt.tsx`.
- Modificar `components/painel.tsx` (quadro abaixo do cabeçalho, antes dos cartões; linha curta no cabeçalho do grupo).
- Testes: `tests/regras-gt.test.ts` (novo).

**Interfaces:**
```ts
// data/regras-gt.ts
export interface RegraGt { data: string; titulo: string; texto: string; grupos?: readonly string[] }
export const REGRAS_GT: readonly RegraGt[]; // as 5 entradas da spec §3.2, textos exatos, grupos canônicos "Ministros do STM" e "Governadores"
// lib/regras-gt.ts
export const TITULO_REGRAS_GT = "Regras do GT em vigor";
export function regrasDoGrupo(rotuloDoContatos: string, regras: readonly RegraGt[] = REGRAS_GT): RegraGt[]; // grupo canônico por resolverGrupoEFonte(rotulo).grupoCanonico
export function textoCurto(r: RegraGt): string;  // "Regra do GT de DD/MM: título"
export function textoLongo(r: RegraGt): string;  // "DD/MM/AAAA · título — texto"  (usa dataDaDecisao(r.data, true))
// components/regras-gt.tsx
export function RegrasGt({ regras }: { regras: readonly RegraGt[] }): JSX.Element; // aberto por padrão, botão recolhe (useState)
```

Regras: `regrasDoGrupo` devolve `[]` quando o rótulo não resolve grupo canônico ou nenhuma regra o lista. Componente: `<section>` igual ao do `Agrupador` (mesmas classes), `aberto` inicial `true`, título `TITULO_REGRAS_GT`, um `<li>` por regra com `textoLongo`. No cabeçalho do grupo, depois dos contadores de bloqueio, uma `<Etiqueta tom="neutro" texto={textoCurto(r)} explicacao={r.texto} />` por regra de `regrasDoGrupo(g.grupo)`. O construtor não acrescenta regras além das 5.

- [ ] **Passo 1: testes que falham** em `tests/regras-gt.test.ts`:
```ts
describe("regras do GT em vigor (spec 2026-11-04 §3.2)", () => {
  test("as cinco regras de 04/11 com os títulos da spec", () => {
    expect(REGRAS_GT.map((r) => [r.data, r.titulo])).toEqual([
      ["2026-11-04", "Nome"], ["2026-11-04", "Pessoa em mais de um grupo"], ["2026-11-04", "STM: patentes"], ["2026-11-04", "STM: abreviação"], ["2026-11-04", "Tratamento"],
    ]);
    expect(REGRAS_GT.every((r) => r.texto.length > 20)).toBe(true);
  });
  test("regras por grupo: STM tem duas, Governadores uma, Senadores nenhuma; rótulo com variação casa pelo catálogo", () => {
    expect(regrasDoGrupo("Ministros do STM").map((r) => r.titulo)).toEqual(["STM: patentes", "STM: abreviação"]);
    expect(regrasDoGrupo("Governadores").map((r) => r.titulo)).toEqual(["Tratamento"]);
    expect(regrasDoGrupo("Senadores")).toEqual([]);
    expect(regrasDoGrupo("rótulo desconhecido")).toEqual([]);
  });
  test("textos curto e longo", () => {
    const r = { data: "2026-11-04", titulo: "Nome", texto: "O nome é como no site." };
    expect(textoCurto(r)).toBe("Regra do GT de 04/11: Nome");
    expect(textoLongo(r)).toBe("04/11/2026 · Nome — O nome é como no site.");
  });
});
```
- [ ] **Passo 2:** `npx vitest run tests/regras-gt.test.ts` → FAIL.
- [ ] **Passo 3:** implementar. Os cinco textos são copiados da tabela do §3.2 da spec, caractere por caractere.
- [ ] **Passo 4:** `npx vitest run tests/regras-gt.test.ts` → PASS; `npm run typecheck`; `npm run build`.
- [ ] **Passo 5:** commit `feat: quadro Regras do GT em vigor no painel e nos cabeçalhos dos grupos`.

### Tarefa 8: Nome como no site — fim de `nomesDoContatos`

**Arquivos:**
- Modificar `lib/types.ts:386` (remover o campo), `data/catalogo.ts:172` (fonte da Nova República só com `url` e `ativo`), `lib/analise.ts:479-483` (chamar `compararGrupo` direto), `lib/match.ts:525-545` (remover `aplicarNomesDoContatos` e `nomeDoContatosConfere`).
- Testes: `tests/analise.test.ts:1149`, `tests/match.test.ts:607-625`, `tests/catalogo-dados.test.ts:52,59`.
- Docs: `CLAUDE.md` (linha da leitura resiliente que cita `nomesDoContatos`; item **Nome** das regras de negócio), adendo na spec `2026-10-23` (§4.2 revogado em 04/11 pela spec 2026-11-04).

- [ ] **Passo 1: testes.** Em `tests/analise.test.ts`, substituir o teste da linha 1149 por:
```ts
test("nome diferente na página sai divergente com o nome da página, sem exceção por fonte (spec 2026-11-04 §3.3)", async () => {
  const r = await analisar("c.xlsx", [{ nome: "Garibaldi Alves Filho", grupo: "ORG", ...CADASTRO_OK }], {
    ...deps,
    resolverFonte: () => ({ grupoCanonico: "ORG", fontes: [{ url: "https://orgao.gov.br", ativo: true }], fontesIndividuais: [], sugestoes: [] }),
    raspar: async () => ({ ...fonte, pessoas: [{ nome: "Garibaldi Alves" }] }),
  });
  const c = r.grupos[0].contatos[0];
  expect(c.semaforo).toBe("amarelo");
  expect(c.comparacoes.find((x) => x.campo === "nome")).toMatchObject({ situacao: "divergente", valorEsperado: "Garibaldi Alves" });
});
```
Em `tests/match.test.ts`, apagar o `describe("aplicarNomesDoContatos …")` inteiro. Em `tests/catalogo-dados.test.ts`: linha 52 `toEqual([{ url: "https://www25.senado.leg.br/web/senadores/nova-republica", ativo: true }])`; linha 55-59: tirar `nomesDoContatos` do título e a linha `expect(fontes.filter((f) => f.nomesDoContatos)).toHaveLength(1);`, acrescentando `expect(fontes.some((f) => "nomesDoContatos" in f)).toBe(false);`.
- [ ] **Passo 2:** `npx vitest run tests/analise.test.ts tests/match.test.ts tests/catalogo-dados.test.ts` → FAIL (teste novo falha; o typecheck acusa `nomesDoContatos` no catálogo depois da remoção do tipo).
- [ ] **Passo 3:** remover o campo, a fonte, a função e a chamada. `grep -rn nomesDoContatos lib data app components tests` tem de voltar vazio.
- [ ] **Passo 4:** `npx vitest run tests/analise.test.ts tests/match.test.ts tests/catalogo-dados.test.ts` → PASS; `npm run typecheck`.
- [ ] **Passo 5:** docs: no `CLAUDE.md`, a frase "`nomesDoContatos` na fonte lista os nomes em que o Contatos prevalece sobre a página (Garibaldi)." vira "Não há exceção de nome por fonte: desde 04/11 o nome é sempre o do site (spec 2026-11-04 §3.3)."; o item **Nome** das regras de negócio ganha "Regra do GT de 04/11: o nome é exatamente o do site oficial, mesmo quando o GT conhece o nome político." Na spec `2026-10-23-…design.md`, logo abaixo do título do §4.2, uma linha: "**Adendo de 2026-11-04:** este item foi revogado pela spec `2026-11-04-bloqueio-no-posse-e-regras-do-gt-design.md` §3.3; `nomesDoContatos` não existe mais."
- [ ] **Passo 6:** commit `feat: nome sempre como no site oficial; sai a exceção por fonte (nomesDoContatos)`.

### Tarefa 9: Tabela de tratamentos v02

**Arquivos:**
- Fora do git: `Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx` (copiar de `../GT Posse/PP27_TabelaTratamentos_v02 - REGRA GERAL.xlsx`), a antiga renomeada `Regras de Atualizacao/Posse2027_TabelaTratamentos_v01-2026-09-15.xlsx`.
- Regerar `data/tratamentos.ts` com `node scripts/gerar-tratamentos.mjs`.
- Testes: os que quebrarem (esperados: `tests/export.test.ts:220-234`, `tests/tratamento-comparacao.test.ts:22-24`; conferir `tests/match-protocolo.test.ts`, `tests/tratamento-coerencia.test.ts`, `tests/tratamento-expansao.test.ts`, `tests/tratamento-pares.test.ts`, `tests/tratamentos-dados.test.ts`).
- Docs: adendo na spec `2026-08-13-auditoria-tratamento-enderecamento.md` (seção "Fonte da regra"); `CLAUDE.md` item **Tratamento e Endereçamento** das regras de negócio.

- [ ] **Passo 1:** copiar e renomear os arquivos (PowerShell: `Copy-Item`/`Rename-Item`; conferir com `Get-ChildItem "Regras de Atualizacao"`). Nada disso entra no git (`.gitignore` já cobre `*.xlsx`).
- [ ] **Passo 2:** `node scripts/gerar-tratamentos.mjs` → "data/tratamentos.ts gerado: 38 regras". `git diff --stat data/tratamentos.ts` e `git diff data/tratamentos.ts`: só as entradas "Governador", "Prefeito", "Presidente da Assembleia Legislativa / Câmara Legislativa" e "Presidente de Câmara Municipal" mudam, e só em `nominata` e `vocativo` ("Excelentíssimo Senhor(a) …" → "Senhor(a) …"); `enderecamento` igual. Qualquer outra diferença: parar e relatar (a planilha v02 não é a esperada).
- [ ] **Passo 3:** `npm test`. Corrigir cada asserção que esperava "Excelentíssimo" para esses quatro cargos: em `tests/export.test.ts` o fixture passa a `valorPlanilha: "Excelentíssimo Senhor Governador"`, `valorEsperado: "Senhor Governador"` (e as asserções acompanham); em `tests/tratamento-comparacao.test.ts:22-24` a regra local "Governador" passa a `"Senhor(a) Governador(a)"`. Testes de gramática (`tratamento-expansao`, "tolera a inconsistência da fonte") e de Camada A (`tratamento-coerencia`) não dependem da tabela e ficam como estão. Acrescentar em `tests/tratamentos-dados.test.ts`:
```ts
test("tabela v02 (04/11): Governador, Prefeito e presidentes de casa legislativa sem Excelentíssimo; endereçamento mantido", () => {
  const por = (cargo: string) => REGRAS_TRATAMENTO.find((r) => r.cargoDestinatario === cargo)!;
  for (const cargo of ["Governador", "Prefeito", "Presidente da Assembleia Legislativa / Câmara Legislativa", "Presidente de Câmara Municipal"]) {
    expect(por(cargo).nominata.startsWith("Senhor(a)")).toBe(true);
    expect(por(cargo).vocativo.startsWith("Senhor(a)")).toBe(true);
    expect(por(cargo).enderecamento.startsWith("A Sua Excelência o(a) Senhor(a)")).toBe(true);
  }
});
```
e em `tests/tratamento-comparacao.test.ts` um teste com a tabela real (`REGRAS_TRATAMENTO`): `comparacoesProtocolo(contato({ cargo: "Governador do Estado do Acre", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" }), REGRAS_TRATAMENTO)` → tratamento e endereçamento `confere`; com `tratamento: "Excelentíssimo Senhor"` → tratamento `divergente` com `valorEsperado: "Senhor(a)"`.
- [ ] **Passo 4:** `npm test` e `npm run typecheck` verdes.
- [ ] **Passo 5:** docs: na spec 2026-08-13, ao fim da seção "Fonte da regra": "**Adendo de 2026-11-04:** a fonte passa a ser a tabela v02 (`PP27_TabelaTratamentos_v02 - REGRA GERAL.xlsx`, copiada para o caminho fixo do gerador). Mudança: Governador, Prefeito, Presidente de Assembleia Legislativa / Câmara Legislativa e Presidente de Câmara Municipal passam a 'Senhor(a)' na nominata e no vocativo; o endereçamento não muda. Versão anterior guardada como `Posse2027_TabelaTratamentos_v01-2026-09-15.xlsx`." No `CLAUDE.md`, item **Tratamento e Endereçamento**: acrescentar "Tabela v02 desde 04/11 (governadores com 'Senhor(a)')."
- [ ] **Passo 6:** commit `feat: tabela de tratamentos v02 (REGRA GERAL): governadores e prefeitos com Senhor(a)` (inclui `data/tratamentos.ts`, testes e docs; nunca a planilha).

### Tarefa 10: STM — nome acima de 50 caracteres (Camada C)

**Arquivos:**
- Modificar `data/regras-nome.ts` (`RegraNome.limiteCaracteres?: number`; `"Ministros do STM"` ganha `limiteCaracteres: 50`).
- Criar `lib/limite-nome.ts`.
- Modificar `lib/types.ts:44-51` (`AchadoCoerencia` + `"nome_acima_do_limite"`), `lib/tratamento.ts` (`comparacoesTratamento` chama `comparacaoLimiteNome`; `rotuloAchado` e `textoCoerencia` ganham o caso), `lib/painel.ts` (`etiquetaDoCampo` ignora esse achado ao decidir "diverge"; `etiquetasDoContato` acrescenta a etiqueta do limite).
- Testes: `tests/regras-nome.test.ts`, `tests/match-regras-nome.test.ts`, `tests/painel.test.ts`.

**Interfaces:**
```ts
// lib/limite-nome.ts
export function tamanhoDoNome(nome: string): number; // Array.from(nome.trim()).length
export function textoLimiteNome(n: number, limite: number): string; // "Nome com N caracteres, acima do limite de L do Posse: abreviar o sobrenome, nunca a patente (regra do GT de 04/11)"
export function textoCurtoLimiteNome(n: number, limite: number): string; // "Nome com N caracteres, acima do limite de L do Posse"
export function comparacaoLimiteNome(contato: ContatoPlanilha, grupoCanonico: string | undefined, regras: Readonly<Record<string, RegraNome>> = REGRAS_NOME): ComparacaoCampo[];
// lib/painel.ts
export function etiquetaDoLimiteDoNome(c: ResultadoContato): Etiqueta | undefined; // { campo: "nome", tom: "atencao", texto: textoCurto, explicacao: texto completo }
```

Regras: `comparacaoLimiteNome` devolve `[]` sem regra ou com `tamanhoDoNome <= limite`; senão uma comparação `{ campo: "nome", valorPlanilha: contato.nome, situacao: "divergente", origemValor: "coerencia", achado: "nome_acima_do_limite", observacao: textoLimiteNome(n, limite) }` (sem `valorEsperado`: o app não propõe a abreviação). `rotuloAchado("nome_acima_do_limite") = "Nome acima do limite do Posse"`; `textoCoerencia` para esse achado devolve `c.observacao ?? rotulo`. No painel, `etiquetaDoCampo(c, "nome")` calcula "diverge" sem contar esse achado (filtrar `coerenciasDo` por `achado !== "nome_acima_do_limite"`), e `etiquetasDoContato` acrescenta `etiquetaDoLimiteDoNome(c)` logo depois da etiqueta de nome (também no ramo `possivelSaida`). Escolha do construtor registrada: o texto da etiqueta é a forma curta e o texto completo da spec vai na explicação (cursor) e no detalhe/export (coluna Coerência), porque a frase inteira não cabe numa etiqueta de uma linha. **Checar `wc -l lib/tratamento.ts` ≤ 800 ao fim**; se passar, mover `rotuloAchado` e `textoCoerencia` para `lib/achados.ts` (reexportados por `lib/tratamento.ts`) em vez de cortar a regra.

- [ ] **Passo 1: testes que falham.** `tests/regras-nome.test.ts`:
```ts
describe("comparacaoLimiteNome — STM, nome acima de 50 caracteres (spec 2026-11-04 §3.5)", () => {
  const stm = (nome: string): ContatoPlanilha => ({ nome, grupo: "Ministros do STM", cargo: "Ministro do Superior Tribunal Militar", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });
  const de = (n: number) => "A".repeat(n);
  test("51 caracteres acusa com o texto da regra; 50 não; espaços nas pontas não contam", () => {
    const [c] = comparacaoLimiteNome(stm(de(51)), "Ministros do STM");
    expect(c).toEqual({ campo: "nome", valorPlanilha: de(51), situacao: "divergente", origemValor: "coerencia", achado: "nome_acima_do_limite",
      observacao: "Nome com 51 caracteres, acima do limite de 50 do Posse: abreviar o sobrenome, nunca a patente (regra do GT de 04/11)" });
    expect(c.valorEsperado).toBeUndefined();
    expect(comparacaoLimiteNome(stm(de(50)), "Ministros do STM")).toEqual([]);
    expect(comparacaoLimiteNome(stm(`  ${de(50)}  `), "Ministros do STM")).toEqual([]);
  });
  test("acento conta um caractere; só o STM tem a regra", () => {
    expect(tamanhoDoNome("Á".repeat(51))).toBe(51);
    expect(comparacaoLimiteNome(stm(de(60)), "Ministros do STF")).toEqual([]);
    expect(comparacaoLimiteNome(stm(de(60)), undefined)).toEqual([]);
  });
  test("rotuloAchado e textoCoerencia", () => {
    expect(rotuloAchado("nome_acima_do_limite")).toBe("Nome acima do limite do Posse");
    const [c] = comparacaoLimiteNome(stm(de(51)), "Ministros do STM");
    expect(textoCoerencia(c)).toBe(c.observacao);
  });
});
```
`tests/match-regras-nome.test.ts`: contato do STM com 51 caracteres passando por `compararGrupo` com página que confirma o nome → `semaforo: "amarelo"`, `camposDivergentes` com `campo: "nome"`, e a comparação de valor do nome (`origemValor` ≠ `"coerencia"`) continua `confere`; o mesmo contato com 50 → `verde`. `tests/painel.test.ts`: `etiquetasDoContato` desse contato traz `{ campo: "nome", texto: "Nome confere", tom: "ok" }` **e** `{ campo: "nome", texto: "Nome com 51 caracteres, acima do limite de 50 do Posse", tom: "atencao", explicacao: <texto completo> }`; `situacaoDoContato` fica em atenção; `detalhesDoContato` do nome traz o texto completo em `coerencias`.
- [ ] **Passo 2:** `npx vitest run tests/regras-nome.test.ts tests/match-regras-nome.test.ts tests/painel.test.ts` → FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** os três arquivos de teste → PASS; `npm test`; `npm run typecheck`; `wc -l lib/tratamento.ts` ≤ 800; `npm run build`.
- [ ] **Passo 5:** commit `feat: STM avisa nome acima de 50 caracteres, abreviar o sobrenome e nunca a patente`.

### Tarefa 11: Documentação, carga do Eunício e fecho

**Arquivos:**
- Modificar `CLAUDE.md`: linha nova na tabela de specs; "Estado do projeto" (branch `feat/bloqueio-posse-e-regras-gt`: bloqueio no Posse, regras do GT, tabela v02, nome como no site, limite do STM); parágrafo **Decisões do GT** ganha o bloqueio (tipo de registro, `quadroDeBloqueio`, situação com pendências, botão só local, publicado no Blob junto); `Layout do código` (`lib/painel-bloqueio.ts`, `lib/limite-nome.ts`, `lib/regras-gt.ts`, `data/regras-gt.ts`); contagem da suíte.
- Fora do git: `.fiscal/decisoes.json` (carga do Eunício), com cópia prévia em `.fiscal/decisoes-anterior-2026-11-04.json`.

- [ ] **Passo 1:** `CLAUDE.md` com a linha da tabela: `| 2026-11-04 | \`2026-11-04-bloqueio-no-posse-e-regras-do-gt-design.md\` | **Bloqueio no Posse por grupo, regras do GT em vigor, tabela v02 e nome como no site**: registro \`bloqueio\`/\`desbloqueio\` por grupo no histórico de decisões, situação com pendências ("Pendente de bloqueio no Posse", "a cadastrar no grupo do convite", "bloqueio no grupo do convite, desbloquear"), etiqueta de atenção "Bloquear no Posse neste grupo ao autorizar", contador no cabeçalho, cartão e filtro; quadro "Regras do GT em vigor" (\`data/regras-gt.ts\`); tabela de tratamentos v02 (governadores com "Senhor(a)"); fim de \`nomesDoContatos\`; STM com limite de 50 caracteres no nome | Vigente; implementado |`.
- [ ] **Passo 2:** carga do Eunício (spec §3.1.1), com um script Node de uso único no scratchpad da sessão (não entra no repo), rodado da raiz do projeto: lê `.fiscal/decisoes.json`, grava a cópia `.fiscal/decisoes-anterior-2026-11-04.json`, acha o caso de `id === "eunicio oliveira#deputados federais|ex-presidentes do senado"`, acrescenta ao fim de `registros` exatamente `{ "tipo": "mesma_pessoa", "data": "2026-11-04", "quem": "Clovis (04/11)", "observacao": "Regra de 04/11: fica em Ex-Presidentes do Senado e é bloqueado no Posse nesse grupo; convite por Deputados Federais quando o grupo existir no Contatos", "validacao": "validado", "convidaPor": "Deputados Federais", "grupos": ["Ex-Presidentes do Senado", "Deputados Federais"] }` e regrava com `JSON.stringify(h, null, 2)`. Conferir depois, com `node -e` e `JSON.parse`, que o arquivo abre, que o caso tem 3 registros e que o último é o de 04/11; abrir o painel local (`npm run dev`) e ver que o Eunício aparece em Ex-Presidentes do Senado com "Bloquear no Posse neste grupo ao autorizar · convite pelo grupo Deputados Federais (decisão do GT de 04/11)" e "Grupo do convite Deputados Federais sem a pessoa no Contatos". Se o id não for encontrado, parar e relatar.
- [ ] **Passo 3:** `npm test`, `npm run typecheck`, `npm run build` verdes; atualizar a contagem da suíte no `CLAUDE.md` com os números reais.
- [ ] **Passo 4:** commit `docs: CLAUDE.md com o bloqueio no Posse, regras do GT, tabela v02 e nome como no site`.

---

## Depois do plano (fora das tarefas; rotina do CLAUDE.md)

Push da branch, PR para `main` (o Clovis abre e mescla), deploy automático conferido, coleta nova (com a base exportada depois do retorno dos 12, se já houver), conferência dos critérios de aceite da spec §6 no retrato real (contadores STJ 2, Senadores titulares fora de exercício 1, Ex-Presidentes do Senado 1; os 11 "Tratado"; Eunício com as duas pendências; governadores com tratamento conferindo; ministro do STM com 51 caracteres acusado), publicação, PRODASEN, relatório com "a bloquear no Posse" por grupo.
