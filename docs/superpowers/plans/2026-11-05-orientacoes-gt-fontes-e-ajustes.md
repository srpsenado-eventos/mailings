# Orientações do GT de 05/11: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar do painel os falsos alarmes apontados pelo GT em 05/11: fontes de 6 governadores, cargo de Sergipe, tratamento dos presidentes, inclusões de Embaixadores, rótulos do STJ, protocolo dos convocados e a proposta do Diego Tavares.

**Architecture:** Mudanças pequenas e independentes sobre o que já existe: catálogo (`data/catalogo.ts`), extração (`lib/scrape.ts`), sessão do Chrome (`lib/navegador.ts`), protocolo (`lib/tratamento.ts`, `lib/tratamento-pares.ts`, `lib/match.ts`) e um módulo novo puro para decisões sobre propostas, aplicado na tela. Nenhuma muda a regra de ouro do "possível saída".

**Tech Stack:** Next.js 15, TypeScript, Vitest, cheerio, puppeteer-core.

**Spec:** `docs/superpowers/specs/2026-11-05-orientacoes-do-gt-fontes-e-ajustes-design.md`

## Global Constraints

- Comunicação e nomes de teste em português do Brasil; padrão AAA; sem `any`; funções de `lib/` puras e imutáveis.
- Sem PII em log, console ou prompt. Sem internet real nos testes: fixtures e lançador injetado. Nenhum teste abre navegador.
- Sem dependência nova. Gerenciador é npm. Não adicionar ao git: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.claude/`, `.vercel/`, `.fiscal/`, `SENHA-PAINEL.txt`.
- `lib/tratamento.ts` está a poucas linhas de 800, e `lib/match.ts` e `lib/scrape.ts` já passam: código novo vai em módulo próprio ou no mínimo de linhas nesses arquivos.
- Cada commit termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Fazer `git add` só dos arquivos da tarefa.
- Comando geral: `npx vitest run` e `npm run typecheck`, verdes ao fim de cada tarefa.

## Review Focus

1. Clique de Roraima que falha (título sumiu, nada novo depois do clique): governador "indeterminado", nunca "possível saída", e a leitura não entra na memória como boa. Testado na Tarefa 2.
2. Nome real de pessoa com palavra institucional ("Ana Câmara", "Maria Turma Silva"): continua proposto. Testado na Tarefa 7.
3. Grupo de Embaixadores reaproveitado pela memória ou composto pela IA: continua sem `novos`. Testado na Tarefa 6.
4. Presidente mulher com tratamento masculino, ou vice-presidente com "Excelentíssimo Senhor": continua divergindo. Testado na Tarefa 4.
5. Decisão do Diego com o nome em outra grafia ou em outro grupo: a proposta só sai no grupo do caso e pelo nome normalizado. Testado na Tarefa 8.

---

### Task 1: Fontes de AC, MT, MG, RS e SC no catálogo

**Files:**
- Modify: `data/catalogo.ts` (entradas de `fontesIndividuais` de Governadores e comentário das linhas 195-210)
- Create: `tests/fixtures/governador-sc-maiusculas.html`, `tests/fixtures/governador-mt.html`
- Test: `tests/catalogo-dados.test.ts`, `tests/analise.test.ts` ou o teste de `compararContatoIndividual` já existente

**Interfaces:** Produces: nada novo; só dados.

- [ ] **Step 1: Escrever os testes que falham.** Em `tests/catalogo-dados.test.ts`, `"Governadores têm fonte individual em AC, MT, MG, RS e SC com a URL do GT de 05/11"`, conferindo por UF:
  - AC `url` = `https://estado.ac.gov.br/orgao-entidades/governadoria/`, `urlAlternativa` = `https://agencia.ac.gov.br/governadora/`
  - MT `url` = `https://portal.mt.gov.br/conheca-mato-grosso/governo`, `navegador: true`
  - MG `url` = `https://www.mg.gov.br/governador/mateus-simoes-de-almeida`
  - RS `url` = `https://www.estado.rs.gov.br/governador`
  - SC `url` = `https://agenda.scc.sc.gov.br/site/colegiado-de-governo`
  - todas com `campos: ["nome", "cargo"]`

  Fixtures mínimas, sem telefone nem e-mail: SC com as linhas "JORGINHO MELLO" e "Governador(a) do Estado de Santa Catarina"; MT com "Otaviano Pivetta" e "Governador do Estado de Mato Grosso". Teste `"nome em maiúsculas na página individual confirma o governador e o cargo de SC confere"` e o equivalente de MT, com `compararContatoIndividual`: nome `confere`, cargo `confere`, sem `possivelSaida`.
- [ ] **Step 2:** `npx vitest run tests/catalogo-dados.test.ts` — FAIL nas URLs.
- [ ] **Step 3: Atualizar `data/catalogo.ts`.** Trocar AC e RS, acrescentar MT, MG e SC. Reescrever o comentário: MT, MG e SC têm individual desde 05/11; AC volta à página `orgao-entidades/governadoria/`, e a da agência fica como alternativa; MT é JavaScript (`fetch` traz 70 caracteres). Remover do comentário a frase de conferência manual pelo Diário Oficial. Se o caso de SC falhar por `Governador(a)`, ajustar a comparação de cargo pelo gênero neutro de `lib/cargo-tribunal.ts` (`temGeneroNeutro`, `semGenero`) só no caminho individual.
- [ ] **Step 4:** `npx vitest run` — PASS. Testes antigos que dependiam de "MT, MG e SC sem individual" são atualizados para o novo catálogo, e cada um é citado no relatório da tarefa.
- [ ] **Step 5: Commit** `feat: fontes individuais de AC, MT, MG, RS e SC (orientação do GT de 05/11)`.

### Task 2: Roraima, clicar antes de ler

**Files:**
- Modify: `lib/types.ts` (`FonteIndividual`, `FonteLegivel`), `lib/raspagem.ts` (`montarOpcoes` e chamada `porJanela`), `lib/scrape.ts` (só se `OpcoesRaspagem` precisar do campo), `lib/navegador.ts`, `lib/memoria-leitura.ts`, `data/catalogo.ts`
- Create: `tests/fixtures/governador-rr-apos-clique.html`
- Test: `tests/navegador.test.ts`, `tests/raspagem.test.ts`, `tests/memoria-leitura.test.ts`, `tests/catalogo-dados.test.ts`

**Interfaces:**
- Produces: `FonteIndividual.clicarAntes?: string`; `OpcoesExtracaoNavegador` ganha `clicarAntes?: string`; `PaginaNavegador.conteudo(url: string, timeoutMs: number, clicarAntes?: string): Promise<string>`; `export const MOTIVO_CLIQUE_SEM_EFEITO = "navegador: clique não revelou conteúdo"` em `lib/navegador.ts`.

- [ ] **Step 1: Escrever os testes que falham** (`tests/navegador.test.ts`, com lançador injetado):
  - `"a sessão repassa clicarAntes ao lançador"`: `sessao.raspar(url, { clicarAntes: "Governador do Estado de Roraima" })` e o falso `conteudo` recebe o terceiro argumento.
  - `"clique sem efeito vira ScrapeError e não repete"`: o falso `conteudo` lança `new Error(MOTIVO_CLIQUE_SEM_EFEITO)`; `raspar` rejeita com `ScrapeError` de `motivo` igual a `MOTIVO_CLIQUE_SEM_EFEITO`.

  Em `tests/raspagem.test.ts`: `"fonte janela com clicarAntes passa o texto ao porJanela"`. Em `tests/memoria-leitura.test.ts`: `chaveDaLeitura(url, { clicarAntes: "X" })` termina em `#clique:"X"`, e a leitura sem clique tem outra chave. Em `tests/catalogo-dados.test.ts`: RR tem `clicarAntes: "Governador do Estado de Roraima"` e `navegador: "janela"`, e toda fonte com `clicarAntes` é `janela`. Com a fixture (linhas "Governador do Estado de Roraima", "Ocupado por: FRANCISCO DOS SANTOS SAMPAIO"), `compararContatoIndividual` com "Francisco dos Santos Sampaio": nome confere, sem `possivelSaida`. Com `lida.erro = MOTIVO_CLIQUE_SEM_EFEITO`: `semaforo: "indeterminado"`, sem `possivelSaida`.
- [ ] **Step 2:** `npx vitest run tests/navegador.test.ts tests/raspagem.test.ts tests/memoria-leitura.test.ts` — FAIL.
- [ ] **Step 3: Implementar.** Em `lancarChrome.conteudo`, depois da pausa, quando vier `clicarAntes`: medir `innerText.length` do `body`, achar por `page.evaluate` o primeiro elemento `h1..h6,button,a,summary` cujo texto aparado é igual a `clicarAntes`, clicar, e esperar até 5 s o texto do `body` crescer (`page.waitForFunction`). Elemento ausente ou texto que não cresceu: `throw new Error(MOTIVO_CLIQUE_SEM_EFEITO)`. O `catch` de `lerUma` já transforma em `ScrapeError` com a mensagem, e `lerComRitmo` não repete. `chaveDaLeitura` ganha o sufixo `#clique:${JSON.stringify(texto)}`, e `Pick` passa a incluir `clicarAntes`. A entrada de RR no catálogo ganha `clicarAntes`, com comentário: o nome só aparece depois do clique (medido em 05/11), superando a decisão de 30/10. Se o extrator não reconhecer o nome após "Ocupado por:", tratar o rótulo em `nomeNaPagina` ou no extrator, com a fixture.
- [ ] **Step 4:** `npx vitest run` e `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: fonte individual pode clicar antes de ler; Roraima mostra o governador`.

### Task 3: Sergipe, cargo antes do nome

**Files:**
- Modify: `lib/scrape.ts`
- Create: `tests/fixtures/governador-se.html`, com o recorte abaixo
- Test: `tests/scrape.test.ts`

Recorte, sem e-mail:

```html
<div class="col-md-8"><div style="font-size: 13px;"> Governador </div>
<div style="font-size: 20px;"> <b><i>Fábio Mitidieri</i></b> </div>
<div style="font-size: 13px;"> <b>Secretário Especial de Gabinete:</b> Tiago Andrade Araújo </div>
<div style="font-size: 13px;"> <b>Endereço: </b> Palácio Governador Augusto Franco, Av. Adélia Franco, 3305, Grageru </div></div>
```

- [ ] **Step 1: Escrever o teste que falha:** `"cargo em linha antes do nome vence a linha rotulada 'Cargo: Pessoa' de depois"`: `extrairConteudo(html, url)` traz a pessoa "Fábio Mitidieri" com `cargo` "Governador", e nenhuma pessoa tem cargo começando em "Secretário Especial de Gabinete: Tiago".
- [ ] **Step 2:** `npx vitest run tests/scrape.test.ts` — FAIL.
- [ ] **Step 3: Implementar.** Linha na forma `<rótulo>: <resto>`, com o resto não vazio, deixa de ser candidata a cargo do nome de cima (função `linhaRotuladaComOutraPessoa(linha: string): boolean`, usada onde o cargo seguinte é escolhido). Com isso o cargo cai na linha anterior, respeitando `LadoDoCargo`. Se a detecção de lado impedir, a linha anterior vale quando é cargo e a seguinte é rotulada. Toda a suíte de extração (STM, TST, TCU, CNJ e demais fixtures) precisa continuar igual.
- [ ] **Step 4:** `npx vitest run` — PASS. Se não houver regra geral sem quebrar fixture, aplicar o caminho alternativo da spec §2.3 (`campos: ["nome"]` em SE, com teste e comentário no catálogo) e dizer isso no relatório.
- [ ] **Step 5: Commit** `fix: cargo do governador de Sergipe não vem da linha rotulada do secretário`.

### Task 4: Presidente de tribunal aceita "Excelentíssimo(a) Senhor(a)"

**Files:**
- Modify: `lib/cargo-tribunal.ts`, `lib/match.ts:269` (`comparacoesTratamento`)
- Test: `tests/cargo-tribunal.test.ts` (criar se não existir) e `tests/tratamento-comparacao.test.ts`

**Interfaces:**
- Produces: `export function tratamentoAceitoDoPresidente(contato: ContatoPlanilha, grupoCanonico: string | undefined): boolean` em `lib/cargo-tribunal.ts`.

- [ ] **Step 1: Escrever os testes que falham.** Via `comparacoesTratamento`, usando `contatoDe` local:
  - Presidente do STF, tratamento "Excelentíssimo Senhor", grupo "Ministros do STF": `tratamento.situacao === "confere"`.
  - Presidente do STM mulher, "Excelentíssima Senhora", grupo "Ministros do STM": `confere`.
  - Presidente do STM mulher, "Excelentíssimo Senhor": continua `divergente`.
  - "Vice-Presidente do Supremo Tribunal Federal", "Excelentíssimo Senhor": sem mudança (não vira `confere` por esta regra).
  - Presidente do STF, "Doutor": `divergente`.
  - Presidente do Superior Tribunal de Justiça, "Excelentíssimo Senhor": continua `sem_regra`.
- [ ] **Step 2:** `npx vitest run tests/tratamento-comparacao.test.ts` — FAIL.
- [ ] **Step 3: Implementar.** `tratamentoAceitoDoPresidente`: verdade quando `ehGrupoDeTribunal(grupoCanonico)`, o cargo normalizado começa com `presidente` (nunca `vice`) e o tratamento normalizado é `excelentissimo senhor` (masculino) ou `excelentissima senhora` (se `contatoEhFeminino`). Em `comparacoesTratamento`, comparação de `tratamento` com `situacao: "divergente"` e o predicado verdadeiro vira `confere`, mantendo os demais campos. `sem_regra` não é tocado. Atenção a import circular com `lib/tratamento.ts`.
- [ ] **Step 4:** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat: presidente de tribunal aceita "Excelentíssimo(a) Senhor(a)" no tratamento`.

### Task 5: Convocados seguem o critério dos ministros

**Files:**
- Modify: `lib/tratamento.ts` (`comparacoesProtocolo`, linha ~394), `lib/tratamento-pares.ts` (`nucleoDoCargo`)
- Test: `tests/tratamento-comparacao.test.ts`, `tests/tratamento-pares.test.ts`

**Interfaces:**
- Produces: `export function cargoDeMinistroDoConvocado(cargo: string): string | undefined` em `lib/tratamento-pares.ts` ("Desembargadora convocada do Superior Tribunal de Justiça" → "Ministro do Superior Tribunal de Justiça"; o que não é convocado → `undefined`).

- [ ] **Step 1: Escrever os testes que falham:**
  - `comparacoesProtocolo` com "Desembargador convocado do Superior Tribunal de Justiça", "Senhor", "A Sua Excelência o Senhor": os dois campos `confere`; idem "Desembargadora convocada do Tribunal Superior do Trabalho", "Senhora", "A Sua Excelência a Senhora".
  - Mesmo cargo, tratamento "Doutor": `divergente`.
  - `nucleoDoCargo("Desembargador convocado do Superior Tribunal de Justiça") === nucleoDoCargo("Ministra do Superior Tribunal de Justiça")`.
  - `nucleoDoCargo("Presidente do Superior Tribunal de Justiça")` continua diferente do de ministro.
- [ ] **Step 2:** `npx vitest run tests/tratamento-comparacao.test.ts tests/tratamento-pares.test.ts` — FAIL.
- [ ] **Step 3: Implementar.** `comparacoesProtocolo` resolve a regra com `cargoDeMinistroDoConvocado(contato.cargo) ?? contato.cargo`, sem mudar o `contato` usado para gênero e sem tocar em comparações de cargo e nome. `nucleoDoCargo` usa a mesma função antes de reduzir o texto. Evitar import circular (se preciso, a função fica em `lib/cargo-tribunal.ts`). Atualizar o comentário de `nucleoDoCargo`: convocados agora são pares.
- [ ] **Step 4:** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat: desembargador convocado segue o protocolo dos ministros do grupo`.

### Task 6: Embaixadores sem proposta de inclusão

**Files:**
- Modify: `lib/types.ts` (`GrupoCatalogo`), `lib/catalogo.ts` (`FonteResolvida`, linhas 63-124), `lib/analise.ts`, `data/catalogo.ts`
- Test: `tests/analise.test.ts`, `tests/catalogo-dados.test.ts`

**Interfaces:**
- Produces: `GrupoCatalogo.semInclusao?: true`; `FonteResolvida.semInclusao?: true`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/analise.test.ts`: grupo com `semInclusao: true` e página com pessoa a mais sai com `novos: []`; contato ausente da página continua `possivelSaida: true`; leitura reaproveitada pela memória e composição pela Camada 2 também saem com `novos: []`; `resumo.novo` não conta. Grupo sem a marca mantém `novos`. Em `tests/catalogo-dados.test.ts`: só "Embaixadores" tem `semInclusao`.
- [ ] **Step 2:** `npx vitest run tests/analise.test.ts tests/catalogo-dados.test.ts` — FAIL.
- [ ] **Step 3: Implementar.** Um ponto só, no fim da análise de cada grupo em `lib/analise.ts`, antes do cálculo do resumo (linha ~720): `const final = semInclusao ? { ...resultado, novos: [] } : resultado`. `resolverFonte` copia a marca do grupo dono.
- [ ] **Step 4:** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `feat: Embaixadores não recebem proposta de inclusão (regra do GT)`.

### Task 7: Item institucional não é proposta de inclusão

**Files:**
- Create: `lib/proposta-inclusao.ts`
- Modify: `lib/match.ts` (filtro de `novos` em torno da linha 518 e `novosForaDaPlanilha`, linha 940)
- Test: `tests/proposta-inclusao.test.ts`, `tests/match.test.ts`

**Interfaces:**
- Produces: `export function ehItemInstitucional(nome: string): boolean`.

- [ ] **Step 1: Escrever os testes que falham.** Verdadeiro para "Incidentes de Assunção de Competência", "Câmara de Direito Público", "Composição da Corte", "SECRETARIA DE GESTÃO", "Turma Recursal", "Plenário", "Conselho Nacional". Falso para "Ana Câmara", "Maria Turma Silva", "João Corte Real", "Corregedor Silva", "Luís Carlos Balbino Gambogi". Em `tests/match.test.ts`: página com "Câmara de Direito Público" não gera `novos`, e contato "Ana Câmara" continua casando normalmente.
- [ ] **Step 2:** `npx vitest run tests/proposta-inclusao.test.ts` — FAIL.
- [ ] **Step 3: Implementar.** Verdadeiro quando o primeiro token de `normalizarTexto(nome)` está em `camara, turma, secao, secretaria, incidentes, incidente, composicao, plenario, conselho, tribunal, corte, gabinete, presidencia, coordenadoria, diretoria`. Aplicar nos dois filtros de `novos`, sem tocar em casamento, `usados`, composição nem saída.
- [ ] **Step 4:** `npx vitest run` — PASS.
- [ ] **Step 5: Commit** `fix: rótulo institucional da página deixa de ser proposta de inclusão`.

### Task 8: Decisão do GT sobre proposta de inclusão

**Files:**
- Create: `lib/propostas-decisoes.ts`
- Modify: `lib/types.ts` (`ResultadoGrupo.dispensados?`), `lib/painel.ts` (`filtrarGrupos` preserva `dispensados`), `components/painel.tsx` (prop renomeada e linha informativa, perto da linha 222)
- Test: `tests/propostas-decisoes.test.ts`, `tests/painel.test.ts`

**Interfaces:**
- Consumes: `casosDaPessoa`, `vigente`, `dataDaDecisao`, `grupoEquivalente` de `lib/decisoes.ts`; `normalizarNome`, `normalizarTexto`.
- Produces:
  - `export interface PropostaDispensada { nome: string; texto: string }`
  - `ResultadoGrupo.dispensados?: PropostaDispensada[]`
  - `export function retratoComPropostasDecididas<T extends { grupos: ResultadoGrupo[]; resumo: { novo: number } }>(retrato: T, historico: HistoricoDecisoes | undefined): T`

- [ ] **Step 1: Escrever os testes que falham:**
  - Caso `nao_recebe_convite` para "Diego Tavares" no grupo "Senadores titulares fora de exercício - Posse 2027", observação "Eleito Deputado Estadual. Será convocada a suplente.", data `2026-11-05`: a proposta sai de `novos`, `resumo.novo` cai 1 e `dispensados` traz `{ nome: "Diego Tavares", texto: "não será convidado (decisão do GT de 05/11). Eleito Deputado Estadual. Será convocada a suplente." }`.
  - Mesmo nome em outro grupo, sem decisão: fica.
  - Decisão de outro tipo (`mesma_pessoa`): fica.
  - Grafia com caixa e acento diferentes: sai.
  - Sem histórico: devolve o retrato sem alteração (mesma referência).
  - A entrada não é mutada.
  - `situacaoDoCaso` do caso, com `gruposAtuais` vazio: `"tratado"`, e `quadroDeBloqueio` sem pendências.
  - `filtrarGrupos` mantém `dispensados` com filtro "tudo", e `resumoDoGrupo` não conta dispensado como "a incluir".
- [ ] **Step 2:** `npx vitest run tests/propostas-decisoes.test.ts` — FAIL.
- [ ] **Step 3: Implementar.** Função pura, por grupo e por proposta; acha casos com `casosDaPessoa` e usa o registro de `vigente`. Em `components/painel.tsx`, a prop vira `retrato: retratoBruto`, e `const retrato = useMemo(() => retratoComPropostasDecididas(retratoBruto, decisoes), [retratoBruto, decisoes])`, de modo que cartões, lista e `ExportButtons` já recebem o retrato filtrado. A linha informativa fica no fim do grupo, fosca, com o texto `{nome}: {texto}`, sem botão. Se `filtrarGrupos` descartar um grupo só com `dispensados`, isso é aceitável, porque o grupo tem contatos.
- [ ] **Step 4:** `npx vitest run` e `npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: decisão do GT dispensa proposta de inclusão e mostra o motivo no grupo`.

A carga do registro do Diego em `.fiscal/decisoes.json` não entra em commit: é feita depois do deploy, por quem conduz a coleta.

### Task 9: Regras do GT e documentação

**Files:**
- Modify: `data/regras-gt.ts`, `CLAUDE.md`
- Test: o teste de textos literais das regras do GT

- [ ] **Step 1:** Acrescentar ao teste as 3 regras novas e rodar — FAIL.
- [ ] **Step 2: Implementar em `data/regras-gt.ts`**, com `data: "2026-11-05"`:
  - `titulo: "Embaixadores"`, `texto: "A análise parte da lista cadastrada no Contatos: a página confere quem está cadastrado e não gera proposta de inclusão."`, `grupos: ["Embaixadores"]`
  - `titulo: "Presidentes de tribunal"`, `texto: "No tratamento, \"Excelentíssimo(a) Senhor(a)\" e \"Senhor(a)\" conferem. O nome leva \"Ministro(a)\" e o cargo traz a presidência."`, `grupos: ["Ministros do STF", "Ministros do STJ", "Ministros do TSE", "Ministros do TST", "Ministros do STM", "Ministros do TCU"]`
  - `titulo: "Desembargadores convocados"`, `texto: "Tratamento e endereçamento seguem o mesmo critério dos ministros do grupo."`, `grupos: ["Ministros do STJ", "Ministros do TST"]`
- [ ] **Step 3: Atualizar `CLAUDE.md`:** "Última revisão" e Estado (2026-11-05, contagem real da suíte); linha nova na tabela de specs; catálogo (MT, MG e SC com individual, 70 fontes individuais se a conta bater); princípios: `semInclusao`, `clicarAntes` com falha indeterminada, item institucional, convocados, presidente, decisão sobre proposta; correção da frase "Caso Roraima" e da de `nao_recebe_convite`; "Faltam a coleta..." do estado do PR #28 e #29 atualizado.
- [ ] **Step 4:** `npx vitest run`, `npm run typecheck` e `npm run build` — PASS.
- [ ] **Step 5: Commit** `docs: regras do GT de 05/11 e CLAUDE.md`.
