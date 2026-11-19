# Gabarito de conferência (19/11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Fiscal acusar e aceitar o que o gabarito de conferência das conferentes fixa: protocolo fixo dos eleitos e dos presidentes de tribunal, prefixo "Deputado Federal" no nome do Presidente da Câmara, regras dos ministros indicados, links de referência do STM e o quadro de regras do GT atualizado.

**Architecture:** Tudo vive nas camadas que já existem. O protocolo fixo (`lib/protocolo-fixo.ts`) ganha três famílias novas (eleitos, presidentes de tribunal, indicados) e passa a admitir endereçamento sem decisão. A Camada C ganha o prefixo de duas palavras (`lib/prefixo-nome.ts`, extraído de `lib/tratamento.ts`, que está a 4 linhas do limite de 800) e a regra de escrita do cargo dos indicados (`lib/regras-cargo.ts`). O catálogo ganha `linksInformativos`, mostrados pelo painel sem leitura. O quadro de regras do GT ganha quatro entradas de 19/11 e perde a de 05/11 dos presidentes.

**Tech Stack:** Next.js 15, TypeScript, Vitest, Tailwind. Sem dependência nova.

**Spec:** `docs/superpowers/specs/2026-11-19-gabarito-de-conferencia-eleitos-presidentes-indicados-design.md`

## Global Constraints

- Funções de `lib/` puras e imutáveis; sem `any`; sem PII em log, teste ou prompt (nomes fictícios nos testes).
- Texto de UI, mensagens e comentários em português do Brasil.
- Nenhuma mudança muda a regra de ouro do "possível saída" nem o semáforo fora dos campos tratamento, endereçamento, nome e cargo.
- `lib/protocolo-fixo.ts` não importa `lib/agrupador` nem `lib/catalogo` (ciclo com `lib/match`); importa constantes de `data/grupos-posse.ts` e `data/cargos-tribunal.ts`.
- Valores fixos, exatos: eleitos `"Senhor"`/`"Senhora"` e `"Ao Senhor"`/`"À Senhora"`; presidente do STF `"Excelentíssimo Senhor"`/`"Excelentíssima Senhora"`; presidentes dos outros cinco tribunais `"Senhor"`/`"Senhora"`; endereçamento dos seis `"A Sua Excelência o Senhor"`/`"A Sua Excelência a Senhora"`; indicados tratamento `"Senhor"`/`"Senhora"`, endereçamento `sem_regra` com observação `"Endereçamento dos ministros indicados: a definir pelo GT"`; prefixo da Câmara `"Deputado Federal"`/`"Deputada Federal"`; `origemValor: "regra_gt"` no protocolo fixo e `"coerencia"` na Camada C.
- Rótulos do agrupador vêm das constantes de `data/grupos-posse.ts`: `GRUPO_SENADORES_ELEITOS`, `GRUPO_DEPUTADOS_ELEITOS`, `GRUPO_GOVERNADORES_ELEITOS`; o dos indicados é `"Ministros de Estado Indicados - Posse 2027"` (constante nova `GRUPO_MINISTROS_INDICADOS` em `data/grupos-posse.ts`). Comparação por `normalizarTexto`, segmento a segmento do rótulo ("A; B"), como `nosChefesDeEstado`.
- Arquivos de até 800 linhas; `lib/match.ts` (1001) é dívida conhecida e só recebe edições pontuais.
- Commits em português, formato `<tipo>: <descrição>`, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Antes de cada commit: `npx vitest run <arquivos tocados>` verde; no fim do plano, `npm test`, `npm run typecheck` e `npm run build` verdes (build só com nenhum servidor dev nas portas 3000-3003).

## Review Focus

1. Vice-Presidente de tribunal (cargo "Vice-Presidente do …") nunca recebe o protocolo fixo do presidente: continua pela tabela ("Ministro de Tribunal Superior" por função) e pelos pares. Teste na Tarefa 1.
2. Contato de eleito cujo rótulo do Contatos tem dois segmentos ("Senadores; Senadores eleitos - Posse Presidencial 2027") recebe o fixo dos eleitos pelo segmento que casa. Teste na Tarefa 1.
3. Nome do Presidente da Câmara já com "Exmo. Deputado Federal Nome" não gera achado, e "Deputado Federal" sem núcleo (nome só com o prefixo) não gera achado nem esperado vazio. Teste na Tarefa 2.
4. "Ministra de Estado Indicada …" (indicado(a) depois de "de Estado") não casa as duas formas e diverge com o esperado montado da pasta. Teste na Tarefa 3.
5. Grupo sem `linksInformativos` não ganha a linha "Referências" nem quebra o cabeçalho; retrato publicado (web) continua funcionando sem campo novo. Teste na Tarefa 4.

---

### Task 1: Protocolo fixo dos eleitos e dos presidentes de tribunal

**Files:**
- Modify: `lib/protocolo-fixo.ts`
- Modify: `lib/cargo-tribunal.ts` (remover `tratamentoAceitoDoPresidente`)
- Modify: `lib/match.ts:288-304` (`comparacoesTratamento` sem `aceitaPresidente`)
- Test: `tests/protocolo-fixo.test.ts`, `tests/cargo-tribunal.test.ts`, `tests/match-protocolo.test.ts` (o que citar `tratamentoAceitoDoPresidente` ou "Excelentíssimo" aceito em presidente de tribunal)

**Interfaces:**
- Consumes: `GRUPOS_DE_TRIBUNAL` (`data/cargos-tribunal.ts`); `GRUPO_SENADORES_ELEITOS`, `GRUPO_DEPUTADOS_ELEITOS`, `GRUPO_GOVERNADORES_ELEITOS` (`data/grupos-posse.ts`); `contatoEhFeminino`, `normalizarTexto`, `neutralizarGenero`.
- Produces: `protocoloFixo(contato, grupoCanonico): ProtocoloFixo | undefined` passa a cobrir (a) rótulo de eleito em qualquer segmento de `contato.grupo`; (b) `grupoCanonico` em `GRUPOS_DE_TRIBUNAL` e cargo normalizado que começa com `"presidente"` (nunca `"vice"`). Constante exportada `GRUPOS_DE_ELEITOS: readonly string[]` com os três rótulos. `ProtocoloFixo` continua `{ tratamento: string; enderecamento: string }` nesta tarefa (a Tarefa 3 torna `enderecamento` opcional).

- [ ] **Step 1: Testes que falham** em `tests/protocolo-fixo.test.ts`, bloco `describe("protocolo fixo dos eleitos e dos presidentes de tribunal (spec 2026-11-19 §2.1 e §2.2)")`:

```ts
test.each([
  [GRUPO_SENADORES_ELEITOS, "Senador eleito"],
  [GRUPO_DEPUTADOS_ELEITOS, "Deputado Federal eleito"],
  [GRUPO_GOVERNADORES_ELEITOS, "Governador eleito do estado de Goiás"],
])("eleito no grupo %s leva Senhor e Ao Senhor", (grupo, cargo) => {
  expect(protocoloFixo(contato({ grupo, cargo }), undefined)).toEqual({ tratamento: "Senhor", enderecamento: "Ao Senhor" });
});
test("eleita (tratamento Senhora no cadastro) leva Senhora e À Senhora", () => {
  const c = contato({ grupo: GRUPO_SENADORES_ELEITOS, cargo: "Senadora eleita", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" });
  expect(comparacoesProtocoloFixo(c, undefined)).toEqual([
    { campo: "tratamento", valorPlanilha: "Senhora", valorEsperado: "Senhora", situacao: "confere", origemValor: "regra_gt" },
    { campo: "enderecamento", valorPlanilha: "A Sua Excelência a Senhora", valorEsperado: "À Senhora", situacao: "divergente", origemValor: "regra_gt" },
  ]);
});
test("rótulo com dois segmentos casa o eleito pelo segmento", () => {
  expect(protocoloFixo(contato({ grupo: `Senadores; ${GRUPO_SENADORES_ELEITOS}`, cargo: "Senador eleito" }), "Senadores")?.enderecamento).toBe("Ao Senhor");
});
test("presidente do STF leva Excelentíssimo Senhor; presidenta, Excelentíssima Senhora", () => {
  expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Presidente do Supremo Tribunal Federal" }), "Ministros do STF"))
    .toEqual({ tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
  expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Presidenta do Supremo Tribunal Federal", tratamento: "Senhora" }), "Ministros do STF"))
    .toEqual({ tratamento: "Excelentíssima Senhora", enderecamento: "A Sua Excelência a Senhora" });
});
test.each(["Ministros do STJ", "Ministros do STM", "Ministros do TCU", "Ministros do TSE", "Ministros do TST"])(
  "presidente em %s leva Senhor e A Sua Excelência o Senhor", (grupo) => {
    expect(protocoloFixo(contato({ grupo, cargo: "Presidente do Tribunal" }), grupo)).toEqual({ tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" });
  });
test("Excelentíssimo Senhor no presidente do STJ diverge, esperado Senhor", () => {
  const c = contato({ grupo: "Ministros do STJ", cargo: "Presidente do Superior Tribunal de Justiça", tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
  expect(comparacoesTratamento(c, "Ministros do STJ").filter((x) => x.campo === "tratamento")).toEqual([
    { campo: "tratamento", valorPlanilha: "Excelentíssimo Senhor", valorEsperado: "Senhor", situacao: "divergente", origemValor: "regra_gt" },
  ]);
});
test("Vice-Presidente de tribunal e ministro comum ficam fora do fixo", () => {
  expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Vice-Presidente do Supremo Tribunal Federal" }), "Ministros do STF")).toBeUndefined();
  expect(protocoloFixo(contato({ grupo: "Ministros do STF", cargo: "Ministro do Supremo Tribunal Federal" }), "Ministros do STF")).toBeUndefined();
});
test("Senador em exercício e governador atual não recebem o fixo dos eleitos", () => {
  expect(protocoloFixo(contato({ grupo: "Senadores", cargo: "Senador" }), "Senadores (Acre a Goiás)")).toBeUndefined();
  expect(protocoloFixo(contato({ grupo: "Governadores", cargo: "Governador do Estado de Goiás" }), "Governadores")).toBeUndefined();
});
```

- [ ] **Step 2: Rodar** `npx vitest run tests/protocolo-fixo.test.ts` e ver falhar (eleitos e presidentes de tribunal devolvem `undefined`).

- [ ] **Step 3: Implementar** em `lib/protocolo-fixo.ts`: `GRUPOS_DE_ELEITOS`, `ROTULOS_DE_ELEITOS` (normalizados, como `ROTULOS_CHEFES_DE_ESTADO`), `nosEleitos(grupo)`, `presidenteDeTribunal(cargo, grupoCanonico)` (`GRUPOS_DE_TRIBUNAL.includes(grupoCanonico)` e `/^presidente\b/` no cargo neutralizado), e `protocoloFixo` devolvendo, na ordem: ex-presidentes do Congresso, cargo ativo do Congresso/Câmara, chefes de Estado, eleitos, presidente de tribunal (STF `"Excelentíssimo(a) Senhor(a)"`, demais `"Senhor(a)"`). Atualizar o comentário de cabeçalho com a spec 2026-11-19 §2.1 e §2.2.

- [ ] **Step 4: Remover** `tratamentoAceitoDoPresidente` de `lib/cargo-tribunal.ts` (e o import de `contatoEhFeminino` se ficar sem uso) e de `lib/match.ts` (`comparacoesTratamento` passa a ser `comparacoesProtocoloFixo(...) ?? comparacoesProtocolo(contato)`, sem o `map`). Apagar ou ajustar os testes que exigiam "Excelentíssimo" aceito em presidente de tribunal pela regra de 05/11; o teste do presidente do STJ acima é a regra nova.

- [ ] **Step 5: Rodar** `npx vitest run tests/protocolo-fixo.test.ts tests/cargo-tribunal.test.ts tests/match-protocolo.test.ts tests/match.test.ts tests/tratamento-comparacao.test.ts` e ver tudo verde; `npm run typecheck` limpo.

- [ ] **Step 6: Commit** `feat(protocolo): eleitos com Ao Senhor e Excelentíssimo só no presidente do STF (spec 2026-11-19)`.

---

### Task 2: Prefixo "Deputado Federal" no nome do Presidente da Câmara

**Files:**
- Create: `lib/prefixo-nome.ts` (bloco do prefixo extraído de `lib/tratamento.ts`: `TipoPrefixo`, `PREFIXOS_ACEITOS`, `TRATAMENTOS_ANTES_DO_PREFIXO`, `cargoDePresidente`, `prefixoDoContato`, `separarPrefixo`, `nomeEsperadoComPrefixo`, `comparacaoPrefixoNome`, `EXPLICACAO_PREFIXO_NOME`)
- Modify: `lib/tratamento.ts` (remove o bloco; re-exporta `nomeEsperadoComPrefixo`, `comparacaoPrefixoNome` e `EXPLICACAO_PREFIXO_NOME` de `lib/prefixo-nome.ts` para os imports atuais continuarem valendo; `textoCoerencia` segue usando `EXPLICACAO_PREFIXO_NOME`)
- Modify: `data/regras-nome.ts` (`prefixoDoPresidente?: "ministro" | "presidente" | "deputado_federal"`; entrada `"Presidente da Câmara dos Deputados": { prefixoDoPresidente: "deputado_federal" }`; comentário com a decisão de 19/11)
- Test: `tests/match-regras-nome.test.ts` (ou `tests/prefixo-nome.test.ts`, novo, se o existente passar de 400 linhas)

**Interfaces:**
- Consumes: `REGRAS_NOME`, `contatoEhFeminino`, `normalizarTexto`, `neutralizarGenero`, `chaveToken`, `semTratamentosProibidos` (se estiver em `lib/tratamento.ts`, importá-la de lá, sem ciclo: `lib/prefixo-nome.ts` só pode importar de `lib/tratamento.ts` se `lib/tratamento.ts` não importar de `lib/prefixo-nome.ts`; nesse caso `lib/tratamento.ts` **não** re-exporta e os chamadores, `lib/match.ts`, passam a importar de `lib/prefixo-nome.ts`. O implementador escolhe a direção que não fecha ciclo e registra no relatório).
- Produces: `PREFIXOS_ACEITOS.deputado_federal = ["deputado federal", "deputada federal"]`; `separarPrefixo(nome, aceitos)` aceita prefixo de 1 ou 2 tokens (compara a sequência normalizada dos próximos tokens com cada aceito); `prefixoDoContato` devolve `{ tipo: "deputado_federal", prefixo: "Deputado Federal" | "Deputada Federal" }` só para o cargo que começa com "Presidente"; `EXPLICACAO_PREFIXO_NOME` passa a `'O Presidente de tribunal leva "Ministro(a)" antes do nome; o Presidente da República leva "Presidente"; o Presidente da Câmara leva "Deputado(a) Federal" (regras do GT de 2026-10-30 e 2026-11-19)'`.

- [ ] **Step 1: Testes que falham**:

```ts
const grupo = "Presidente da Câmara dos Deputados";
const presidente = (p: Partial<ContatoPlanilha>) => ({ nome: "Deputado Federal Hugo Fictício", grupo, cargo: "Presidente da Câmara dos Deputados", tratamento: "Excelentíssimo Senhor", ...p });
test("nome com Deputado Federal e página só com o nome: nenhum achado e esperado com o prefixo", () => {
  expect(comparacaoPrefixoNome(presidente({}), grupo)).toEqual([]);
  expect(nomeEsperadoComPrefixo(presidente({}), grupo, "Hugo Fictício")).toBe("Deputado Federal Hugo Fictício");
});
test("nome sem o prefixo: achado nome_sem_prefixo com o esperado completo", () => {
  expect(comparacaoPrefixoNome(presidente({ nome: "Hugo Fictício" }), grupo)).toEqual([
    { campo: "nome", valorPlanilha: "Hugo Fictício", valorEsperado: "Deputado Federal Hugo Fictício", situacao: "divergente", origemValor: "coerencia", achado: "nome_sem_prefixo" },
  ]);
});
test("presidenta leva Deputada Federal", () => {
  expect(nomeEsperadoComPrefixo(presidente({ nome: "Ana Fictícia", tratamento: "Excelentíssima Senhora", cargo: "Presidenta da Câmara dos Deputados" }), grupo, "Ana Fictícia")).toBe("Deputada Federal Ana Fictícia");
});
test('"Exmo. Deputado Federal Hugo Fictício" já tem o prefixo; "Deputado" sozinho não basta', () => {
  expect(comparacaoPrefixoNome(presidente({ nome: "Exmo. Deputado Federal Hugo Fictício" }), grupo)).toEqual([]);
  expect(comparacaoPrefixoNome(presidente({ nome: "Deputado Hugo Fictício" }), grupo)[0]?.valorEsperado).toBe("Deputado Federal Hugo Fictício");
});
test("nome só com o prefixo não gera achado", () => {
  expect(comparacaoPrefixoNome(presidente({ nome: "Deputado Federal" }), grupo)).toEqual([]);
});
test("Presidente do Senado continua sem prefixo", () => {
  expect(comparacaoPrefixoNome({ nome: "Davi Fictício", grupo: "Presidente do Senado", cargo: "Presidente do Senado Federal" }, "Presidente do Senado")).toEqual([]);
});
test("os tribunais e a Presidência da República continuam como antes", () => {
  expect(nomeEsperadoComPrefixo({ nome: "x", grupo: "Ministros do STF", cargo: "Presidente do Supremo Tribunal Federal" }, "Ministros do STF", "Luís Fictício")).toBe("Ministro Luís Fictício");
});
```

- [ ] **Step 2: Rodar** o arquivo de teste e ver falhar (tipo `"deputado_federal"` não existe).
- [ ] **Step 3: Extrair** o bloco para `lib/prefixo-nome.ts` sem mudar comportamento; rodar `npx vitest run tests/match-regras-nome.test.ts tests/tratamento-coerencia.test.ts tests/match.test.ts` verde; `npm run typecheck`; conferir `wc -l lib/tratamento.ts` abaixo de 800 e `lib/prefixo-nome.ts` abaixo de 400.
- [ ] **Step 4: Implementar** o tipo novo, o prefixo de dois tokens em `separarPrefixo`, `"deputado"`/`"deputada"` e `"federal"` em `TRATAMENTOS_ANTES_DO_PREFIXO` (o laço anda token a token; "federal" só é consumido como parte do prefixo aceito, nunca sozinho: se "federal" aparecer sem "deputado(a)" antes, o laço para), a entrada em `data/regras-nome.ts` e o texto novo de `EXPLICACAO_PREFIXO_NOME`.
- [ ] **Step 5: Rodar** `npx vitest run tests/match-regras-nome.test.ts tests/tratamento-coerencia.test.ts tests/tratamento-comparacao.test.ts tests/match.test.ts tests/match-individual.test.ts tests/export*.test.ts` verde; `npm run typecheck` limpo.
- [ ] **Step 6: Commit** `feat(nome): Presidente da Câmara leva "Deputado Federal" antes do nome; prefixo extraído para lib/prefixo-nome.ts`.

---

### Task 3: Ministros de Estado indicados

**Files:**
- Modify: `data/grupos-posse.ts` (`export const GRUPO_MINISTROS_INDICADOS = "Ministros de Estado Indicados - Posse 2027"`, usado na linha `neutro(...)`)
- Modify: `lib/protocolo-fixo.ts` (`ProtocoloFixo.enderecamento?: string`; `observacaoEnderecamento?: string`; família dos indicados)
- Modify: `lib/regras-cargo.ts` (`comparacaoCargoIndicado`)
- Modify: `lib/types.ts` (`AchadoCoerencia` ganha `"cargo_indicado"`)
- Modify: `lib/tratamento.ts` (`rotuloAchado`: `case "cargo_indicado": return "Cargo de ministro indicado fora do formato do GT"`; `textoCoerencia` trata `cargo_indicado` como `cargo_ex_presidente`)
- Modify: `lib/match.ts:288-304` (`...comparacaoCargoIndicado(contato)`)
- Test: `tests/protocolo-fixo.test.ts`, `tests/regras-cargo.test.ts`, `tests/tratamento-comparacao.test.ts` (rótulo do achado)

**Interfaces:**
- Consumes: `GRUPO_MINISTROS_INDICADOS`; `comparar` de `lib/protocolo-fixo.ts`.
- Produces: `protocoloFixo` devolve `{ tratamento: "Senhor" | "Senhora", observacaoEnderecamento: "Endereçamento dos ministros indicados: a definir pelo GT" }` (sem `enderecamento`) para contato com o rótulo dos indicados em qualquer segmento; `comparacoesProtocoloFixo` devolve, nesse caso, `{ campo: "enderecamento", valorPlanilha, situacao: "sem_regra", origemValor: "regra_gt", observacao }` no lugar da comparação com valor. `comparacaoCargoIndicado(contato): ComparacaoCampo[]` exportada de `lib/regras-cargo.ts`: vazio fora do rótulo dos indicados ou com cargo vazio; vazio quando o cargo normalizado casa `/^ministr[oa] indicad[oa] (de estado )?d[aeo]s? .+$/`; senão `{ campo: "cargo", valorPlanilha, valorEsperado, situacao: "divergente", origemValor: "coerencia", achado: "cargo_indicado" }` com `valorEsperado` = `"Ministro indicado de Estado da <Pasta>"` (feminino `"Ministra indicada de Estado da <Pasta>"`), em que `<Pasta>` é o texto do cadastro depois de "de Estado d(a/o/e)" ou de "d(a/o/e)" quando o cargo começa com "Ministro(a)", mantendo o artigo do cadastro ("de Estado da Fazenda", "de Estado de Minas e Energia"); sem pasta reconhecível, `"Ministro(a) indicado(a) de Estado da [Pasta]"`.

- [ ] **Step 1: Testes que falham** em `tests/regras-cargo.test.ts` (`describe("cargo dos ministros indicados (spec 2026-11-19 §2.4)")`):

```ts
const ind = (cargo: string, tratamento = "Senhor") => ({ nome: "Pessoa Fictícia", grupo: GRUPO_MINISTROS_INDICADOS, cargo, tratamento });
test.each(["Ministro indicado de Estado da Fazenda", "Ministra indicada da Saúde", "Ministro indicado de Minas e Energia", "ministro indicado de estado do Esporte"])("%s confere", (cargo) => {
  expect(comparacaoCargoIndicado(ind(cargo))).toEqual([]);
});
test("sem o indicado: diverge com a pasta copiada", () => {
  expect(comparacaoCargoIndicado(ind("Ministro de Estado da Fazenda"))).toEqual([
    { campo: "cargo", valorPlanilha: "Ministro de Estado da Fazenda", valorEsperado: "Ministro indicado de Estado da Fazenda", situacao: "divergente", origemValor: "coerencia", achado: "cargo_indicado" },
  ]);
  expect(comparacaoCargoIndicado(ind("Ministra de Estado da Saúde", "Senhora"))[0].valorEsperado).toBe("Ministra indicada de Estado da Saúde");
});
test("indicada depois de 'de Estado' não é a forma aceita", () => {
  expect(comparacaoCargoIndicado(ind("Ministra de Estado Indicada da Saúde", "Senhora"))[0].valorEsperado).toBe("Ministra indicada de Estado da Saúde");
});
test("cargo sem pasta reconhecível leva [Pasta]; cargo vazio e grupo de fora ficam de fora", () => {
  expect(comparacaoCargoIndicado(ind("Indicado"))[0].valorEsperado).toBe("Ministro indicado de Estado da [Pasta]");
  expect(comparacaoCargoIndicado(ind(""))).toEqual([]);
  expect(comparacaoCargoIndicado({ nome: "x", grupo: "Ministros de Estado", cargo: "Ministro de Estado da Fazenda" })).toEqual([]);
});
```

e em `tests/protocolo-fixo.test.ts`:

```ts
test("indicado: tratamento Senhor fixo e endereçamento sem regra com a observação", () => {
  const c = { nome: "Pessoa Fictícia", grupo: GRUPO_MINISTROS_INDICADOS, cargo: "Ministro indicado da Fazenda", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" };
  expect(comparacoesProtocoloFixo(c, undefined)).toEqual([
    { campo: "tratamento", valorPlanilha: "Senhor", valorEsperado: "Senhor", situacao: "confere", origemValor: "regra_gt" },
    { campo: "enderecamento", valorPlanilha: "A Sua Excelência o Senhor", situacao: "sem_regra", origemValor: "regra_gt", observacao: "Endereçamento dos ministros indicados: a definir pelo GT" },
  ]);
});
test("indicado com Excelentíssimo Senhor diverge, esperado Senhor; via comparacoesTratamento o cargo fora do formato também aparece", () => {
  const c = { nome: "Pessoa Fictícia", grupo: GRUPO_MINISTROS_INDICADOS, cargo: "Ministro de Estado da Fazenda", tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" };
  const cmp = comparacoesTratamento(c, undefined);
  expect(cmp.find((x) => x.campo === "tratamento")?.valorEsperado).toBe("Senhor");
  expect(cmp.find((x) => x.achado === "cargo_indicado")?.valorEsperado).toBe("Ministro indicado de Estado da Fazenda");
  expect(cmp.find((x) => x.campo === "enderecamento")?.situacao).toBe("sem_regra");
});
```

- [ ] **Step 2: Rodar** os dois arquivos e ver falhar.
- [ ] **Step 3: Implementar** conforme as Interfaces. `sem_regra` com `origemValor: "regra_gt"` não pinta amarelo (`divergenciasDe` só conta `divergente`): confirmar no teste de `comparacoesTratamento` acima que o semáforo de `compararContatoSemFonteOficial(c, "neutro")` fica amarelo só pelo tratamento e pelo cargo.
- [ ] **Step 4: Rodar** `npx vitest run tests/regras-cargo.test.ts tests/protocolo-fixo.test.ts tests/tratamento-comparacao.test.ts tests/match.test.ts tests/painel.test.ts tests/export*.test.ts` verde; `npm run typecheck` limpo.
- [ ] **Step 5: Commit** `feat(indicados): tratamento Senhor(a), cargo nas duas formas e endereçamento a definir (spec 2026-11-19 §2.4)`.

---

### Task 4: Links informativos do STM no cabeçalho do grupo

**Files:**
- Modify: `lib/types.ts` (`GrupoCatalogo.linksInformativos?: readonly LinkInformativo[]`; `export interface LinkInformativo { titulo: string; url: string }`)
- Modify: `data/catalogo.ts` (entrada "Ministros do STM": os dois links da spec §2.5, com comentário "gabarito das conferentes, 19/11: só referência, nunca leitura")
- Modify: `lib/painel.ts` (`linksInformativosDoGrupo(rotuloDoContatos: string): readonly LinkInformativo[]`, pelo grupo canônico de `resolverGrupoEFonte`, `[]` sem grupo ou sem links)
- Modify: `components/painel.tsx` (em `EstadoDaFonte`, depois de "abrir fonte": ` · Referências: ` + links `titulo` em nova aba, `className="underline"`, separados por " · "; só quando a lista não é vazia; nos três ramos do componente em que o grupo tem `fonteUrl`)
- Test: `tests/catalogo-dados.test.ts` (domínio oficial também em `linksInformativos`; o STM tem exatamente os dois), `tests/painel.test.ts` (`linksInformativosDoGrupo("Ministros do STM")` devolve os dois; `"Senadores"` devolve `[]`; rótulo desconhecido devolve `[]`)

**Interfaces:**
- Consumes: `resolverGrupoEFonte` (`lib/catalogo.ts`), `CATALOGO`.
- Produces: `linksInformativosDoGrupo` em `lib/painel.ts`; o componente só renderiza.

- [ ] **Step 1: Testes que falham** (os três acima; no de domínio, estender o laço que percorre `fontes` para percorrer também `linksInformativos ?? []`).
- [ ] **Step 2: Rodar** `npx vitest run tests/catalogo-dados.test.ts tests/painel.test.ts` e ver falhar.
- [ ] **Step 3: Implementar** tipo, catálogo, função pura e a linha no componente. Nada em `lib/raspagem.ts`, `lib/analise.ts`, memória ou `falhas` lê esses links.
- [ ] **Step 4: Rodar** os dois arquivos e `tests/catalogo.test.ts` verde; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(catalogo): links de referência do STM no cabeçalho do grupo, sem leitura (spec 2026-11-19 §2.5)`.

---

### Task 5: Quadro "Regras do GT em vigor"

**Files:**
- Modify: `data/regras-gt.ts`
- Modify: `lib/regras-gt.ts` (`regrasDoGrupo` casa também o rótulo do agrupador: além do canônico, compara cada segmento de `rotuloDoContatos` normalizado com `r.grupos` normalizados, para os grupos `lista`/`neutro` sem grupo canônico)
- Test: `tests/regras-gt.test.ts`

**Interfaces:**
- Produces: quatro entradas `data: "2026-11-19"`, nesta ordem e com estes textos literais:
  1. `titulo: "Eleitos"`, `texto: "Senadores, deputados federais e governadores eleitos: tratamento Senhor(a) e endereçamento Ao Senhor / À Senhora; o cargo fica como no Contatos (Senador(a) eleito(a), Deputado(a) Federal eleito(a), Governador(a) eleito(a) do estado de X)."`, `grupos: [GRUPO_SENADORES_ELEITOS, GRUPO_DEPUTADOS_ELEITOS, GRUPO_GOVERNADORES_ELEITOS]`.
  2. `titulo: "Presidentes de tribunal"`, `texto: "Tratamento Excelentíssimo(a) Senhor(a) só no Presidente do STF; nos presidentes do STJ, STM, TCU, TSE e TST, Senhor(a). Endereçamento A Sua Excelência o(a) Senhor(a) nos seis. O nome leva \"Ministro(a)\" e o cargo traz a presidência."`, `grupos: ["Ministros do STF", "Ministros do STJ", "Ministros do TSE", "Ministros do TST", "Ministros do STM", "Ministros do TCU"]`.
  3. `titulo: "Presidente da Câmara: nome"`, `texto: "O nome leva \"Deputado(a) Federal\" antes, como no Contatos; o cargo é Presidente da Câmara dos Deputados."`, `grupos: ["Presidente da Câmara dos Deputados"]`.
  4. `titulo: "Ministros de Estado indicados"`, `texto: "Tratamento Senhor(a); cargo \"Ministro(a) indicado(a) de Estado da <Pasta>\" ou \"Ministro(a) indicado(a) da <Pasta>\", como nos ministros atuais; endereçamento ainda a definir pelo GT."`, `grupos: [GRUPO_MINISTROS_INDICADOS]`.
  A entrada de 05/11 "Presidentes de tribunal" sai. `data/regras-gt.ts` importa as constantes de `data/grupos-posse.ts`.

- [ ] **Step 1: Testes que falham**: ajustar o teste das regras de 05/11 (`slice(0, 3)` passa a esperar "Embaixadores", "Desembargadores convocados", "Presidentes do Congresso e da Câmara" na ordem em que ficarem; `REGRAS_GT.filter(r => r.data === "2026-11-05").some(r => r.titulo === "Presidentes de tribunal")` é `false`); teste novo das quatro de 19/11 com `[titulo, texto, grupos]` literais; `regrasDoGrupo(GRUPO_SENADORES_ELEITOS)` contém "Eleitos"; `regrasDoGrupo("Senadores; " + GRUPO_SENADORES_ELEITOS)` contém "Eleitos"; `regrasDoGrupo("Ministros do STJ")` contém "Presidentes de tribunal" uma vez só.
- [ ] **Step 2: Rodar** `npx vitest run tests/regras-gt.test.ts` e ver falhar.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npx vitest run tests/regras-gt.test.ts tests/painel.test.ts` verde; `npm run typecheck`.
- [ ] **Step 5: Commit** `feat(regras-gt): quatro regras de 19/11 e saída da regra de 05/11 dos presidentes`.

---

### Task 6: Documentação, docs de 13/11 e verificação final

**Files:**
- Modify: `CLAUDE.md` (linha nova na tabela de specs para 2026-11-19; parágrafo "Regras do GT de 19/11" nos princípios, com os módulos tocados; o "Estado do projeto" passa a dizer que PR #40 e #41 estão em produção e que a coleta com a base nova está pendente; data da última revisão 2026-11-19; `lib/prefixo-nome.ts` no layout; a dívida de `lib/tratamento.ts` atualizada com a contagem nova)
- Add ao git: `docs/superpowers/specs/2026-11-13-regras-gt-13-11-tse-ministros-stm-comandantes-design.md`, `docs/superpowers/plans/2026-11-13-regras-gt-13-11.md`, `docs/superpowers/specs/2026-11-19-gabarito-de-conferencia-eleitos-presidentes-indicados-design.md`, `docs/superpowers/plans/2026-11-19-gabarito-de-conferencia.md`

- [ ] **Step 1:** Editar o `CLAUDE.md` conforme acima (sem repetir regras globais; parágrafo curto, no estilo dos de 13/11).
- [ ] **Step 2:** Conferir que nenhum servidor dev escuta nas portas 3000-3003 (`Get-NetTCPConnection -LocalPort 3000,3001,3002,3003 -ErrorAction SilentlyContinue` no PowerShell, ou `netstat -ano | findstr :300`), depois `npm test`, `npm run typecheck`, `npm run build`: tudo verde. Registrar as contagens (arquivos e testes) no relatório.
- [ ] **Step 3: Commit** `docs: spec e plano de 19/11 (gabarito de conferência), docs de 13/11 e estado no CLAUDE.md`.
