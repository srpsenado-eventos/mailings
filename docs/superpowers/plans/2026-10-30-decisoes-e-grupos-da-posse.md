# Decisões do GT, eleitos por grupo e agrupador da Posse 2027 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** o GT registra no app as decisões sobre duplicidades e eleitos a conferir, com histórico. O painel separa os eleitos nos grupos do Contatos e mostra o agrupador da Posse 2027. Os deputados atuais vêm do `deputado.xls` da Câmara.

**Arquitetura:**
- **Lógica:** toda nova, em funções puras de `lib/`, testadas com Vitest.
- **Varredura:**
  - `analisar` desvia antes de qualquer fonte os grupos de modo `neutro` e `lista`.
  - Depois de `aplicarEleicao`, um novo passo, `aplicarListas`, compara os grupos `lista` com a classificação dos eleitos e com a lista da Câmara.
- **Decisões:**
  - Ficam em `.fiscal/decisoes.json`, num armazém próprio, com uma rota local de gravação.
  - Vão ao Blob junto com o retrato.
  - A cada varredura recebem uma entrada de coleta quando a situação muda.
  - Repetidos, eleitos e painel leem as decisões.

**Stack:** Next.js 15 (App Router), TypeScript, Tailwind, SheetJS (`xlsx`, que já lê `.xls`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-decisoes-de-duplicidade-e-grupos-da-posse-design.md`. Ler inteira antes da primeira tarefa. Quem a executa lê a spec e este plano.

## Restrições globais

- `lib/*.ts` são funções puras e nunca mutam a entrada. Sem `any`. Os nomes dos testes ficam em português, no padrão AAA.
- Normalização só por `lib/normalize.ts` (`normalizarNome`, `normalizarTexto`).
- Rótulos exatos do Contatos (spec §4.5):
  - "Senadores eleitos - Posse Presidencial 2027"
  - "Deputado Federal eleitos - Posse Presidencial 2027"
  - "Governadores eleitos - Posse Presidencial 2027"
  - "Deputados Federais" (constante `NOME_GRUPO_DEPUTADOS`)
- Regra de ouro: nenhum grupo de modo `lista` ou `neutro` gera `possivelSaida`, lê página ou chama a IA.
- Nada de PII nova na web:
  - o deputado do `.xls` segue a lista de permitidos de `lib/publicar.ts`, com e-mail, telefone, prédio e sala fora;
  - as decisões não guardam telefone, e-mail nem endereço.
- As rotas de gravação de decisões seguem o padrão de `app/api/publicar/route.ts`:
  - `origemPermitida`, que devolve 403;
  - `modoDoApp() === "web"`, que devolve 404.
- Textos de tela fixados pela spec:
  - "Será convidada pelo grupo X (decisão do GT de DD/MM)"
  - "Não recebe convite (decisão do GT de DD/MM)"
  - "Ajustar no Contatos (decisão de DD/MM)"
  - "grupo novo desde a decisão de DD/MM"
  - "Não está na lista de <grupo> (planilha do TSE de DD/MM)"
  - "Sem fonte oficial (grupo de convidados)"
  - "Não eleito em 2026"
  - "Tratado no Contatos"
  - "Pendente no Contatos"
- Gerenciador de pacotes: npm. Antes de cada commit rodar `npm test` e `npm run typecheck`. Nunca fazer commit de `pnpm-lock.yaml` nem de `pnpm-workspace.yaml`.
- Os commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Pontos de atenção da revisão

1. **Rótulo do Contatos com espaço no fim ou maiúsculas diferentes** ("Governadores ", "Senadores Eleitos - Posse Presidencial 2027"): tem de cair no mesmo modo e no mesmo grupo do agrupador. Teste na Tarefa 1.
2. **Varredura sem os arquivos da eleição:** os grupos `lista` não podem ficar vermelhos nem quebrar. Ficam indeterminados, com o motivo "Sem a lista nesta varredura". Teste na Tarefa 6.
3. **Decisão gravada com a forma de nome antiga:** por exemplo, "Ministro Kassio Nunes Marques" na decisão e "Nunes Marques" no Contatos. O caso tem de ser achado pelas duas chaves. Teste na Tarefa 8.
4. **`.fiscal/decisoes.json` ausente ou corrompido:** o painel e `/repetidos` abrem sem decisões. A gravação de arquivo corrompido devolve erro claro e não apaga o arquivo. Teste na Tarefa 9.
5. **Duas abas abertas registrando ao mesmo tempo:** a gravação relê o arquivo antes de acrescentar e nunca substitui o histórico pelo que o navegador tinha. Teste na Tarefa 9.

---

### Tarefa 1: Agrupador da Posse 2027 (dados e modo do grupo)

**Arquivos:**
- Criar `data/grupos-posse.ts` e `lib/agrupador.ts`.
- Teste: `tests/agrupador.test.ts`.

**Interfaces:**
- Produz:
  ```ts
  // data/grupos-posse.ts
  export type ModoFiscalizacao = "fonte" | "lista" | "neutro";
  export interface GrupoPosse { rotulo: string; fiscalizacao: ModoFiscalizacao }
  export const GRUPOS_POSSE: readonly GrupoPosse[]; // os 28 da spec §4.5, na ordem da tabela
  export const GRUPO_SENADORES_ELEITOS = "Senadores eleitos - Posse Presidencial 2027";
  export const GRUPO_DEPUTADOS_ELEITOS = "Deputado Federal eleitos - Posse Presidencial 2027";
  export const GRUPO_GOVERNADORES_ELEITOS = "Governadores eleitos - Posse Presidencial 2027";
  // lib/agrupador.ts
  export function grupoDoAgrupador(rotulo: string): GrupoPosse | undefined; // igualdade após normalizarTexto + trim
  export function modoDoGrupo(rotulo: string): ModoFiscalizacao;          // fora do agrupador → "fonte"
  export interface LinhaAgrupador { rotulo: string; fiscalizacao: ModoFiscalizacao; noContatos: number; esperado?: number; foraDoAgrupador?: true }
  export function linhasDoAgrupador(grupos: readonly { grupo: string; contatos: readonly unknown[] }[], esperados: Readonly<Record<string, number>>): LinhaAgrupador[];
  ```
- `linhasDoAgrupador`:
  - devolve os 28 na ordem de `GRUPOS_POSSE`, com `noContatos` 0 quando o grupo está vazio;
  - devolve depois os grupos do retrato que não casam, com `foraDoAgrupador: true`;
  - preenche `esperado` só para as chaves presentes em `esperados`.

- [ ] **Passo 1: testes que falham**
  - `GRUPOS_POSSE` tem 28 itens. São `neutro` os 7 rótulos da spec, de "Ministros de Estado Indicados - Posse 2027" a "Delegações estrangeiras e organismos intern - 2027". São `lista` os quatro da spec §4.6.
  - `modoDoGrupo` dá o mesmo modo para os dois rótulos de cada par:
    - `"Senadores Eleitos - Posse Presidencial 2027 "` e `GRUPO_SENADORES_ELEITOS`, ambos `"lista"`;
    - `"Governadores "` e `"Governadores"`, ambos `"fonte"`.
  - `modoDoGrupo("PILOTO")` dá `"fonte"`.
  - Com os grupos `[{grupo:"Governadores ",contatos:[1,2]},{grupo:"Defensor",contatos:[1]}]` e esperados `{[GRUPO_SENADORES_ELEITOS]: 22}`:
    - "Governadores" fica com `noContatos` 2;
    - "Senadores eleitos…" fica com `esperado` 22 e `noContatos` 0;
    - a última linha é `{rotulo:"Defensor", foraDoAgrupador:true, noContatos:1}`.
- [ ] **Passo 2:** `npx vitest run tests/agrupador.test.ts`. Esperado: FAIL, com o módulo inexistente.
- [ ] **Passo 3:** implementar os dois arquivos.
- [ ] **Passo 4:** rodar de novo. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: agrupador da Posse 2027 com o modo de fiscalização por grupo`.

### Tarefa 2: Análise desvia os grupos `neutro` e `lista`

**Arquivos:**
- Modificar:
  - `lib/types.ts`: `ResultadoGrupo` ganha `fiscalizacao?: "lista" | "neutro"`;
  - `lib/match.ts`: função nova;
  - `lib/analise.ts`: em `analisarGrupo`, antes de `deps.resolverFonte`, na l.362, e em `resumir`, na l.680.
- Testes: `tests/analise.test.ts`, `tests/match.test.ts`.

**Interfaces:**
- Consome `modoDoGrupo` (Tarefa 1).
- Produz:
  ```ts
  // lib/match.ts
  export const OBSERVACAO_SEM_FONTE_OFICIAL = "Sem fonte oficial (grupo de convidados)";
  export const MOTIVO_SEM_LISTA = "Sem a lista nesta varredura";
  export function compararContatoSemFonteOficial(contato: ContatoPlanilha, modo: "lista" | "neutro", grupoCanonico?: string): ResultadoContato;
  ```
- `compararContatoSemFonteOficial`:
  - **comparações:** nome e cargo com `situacao: "fonte_nao_informa"`, mais `comparacoesSemSite(contato)` e `comparacoesTratamento(contato, grupoCanonico)`;
  - **semáforo, modo `neutro`:** `"amarelo"` se o tratamento diverge, senão `"verde"`, com `observacao: OBSERVACAO_SEM_FONTE_OFICIAL`;
  - **semáforo, modo `lista`:** `"indeterminado"`, com `observacao: MOTIVO_SEM_LISTA`. A Tarefa 6 substitui esse resultado;
  - nunca põe `possivelSaida` nem o campo "fonte".
- Em `analisarGrupo`, com `modoDoGrupo(grupo) !== "fonte"`, devolve sem chamar `resolverFonte`, `raspar` nem `extrairComposicao`:
  - `{ grupo, semFonte: false, fiscalizacao: modo, contatos: contatos.map(...), novos: [] }`;
  - passa por `comResponsavel` como os demais grupos.
- `resumir` não conta esses grupos em `gruposSemFonte` nem em `contatosSemFonte`.

- [ ] **Passo 1: testes que falham.** Em `tests/analise.test.ts`, teste de regressão da spec §7.6:
  - Montar contatos em `GRUPO_SENADORES_ELEITOS` e em `GRUPO_GOVERNADORES_ELEITOS`, e um terceiro em "Convidados do presidente eleito - Posse 2027". Os `deps` são espiões que lançam erro se forem chamados.
  - Depois de `analisar`:
    - nenhum espião foi chamado;
    - nenhum contato tem `possivelSaida`;
    - os dois primeiros saem `indeterminado` com `observacao` igual a `MOTIVO_SEM_LISTA`;
    - o terceiro sai `verde`, com `fiscalizacao: "neutro"`;
    - `resumo.gruposSemFonte` é 0.
- [ ] **Passo 2:** `npx vitest run tests/analise.test.ts tests/match.test.ts`. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`. Esperado: PASS, sem regressão nos testes do catálogo.
- [ ] **Passo 5:** commit `feat: grupos neutros e de lista não leem página nem viram sem fonte`.

### Tarefa 3: Leitura do `deputado.xls` da Câmara

**Arquivos:**
- Modificar:
  - `lib/planilha-eleitos.ts`, em `lerPlanilhaEleicao`, na l.150;
  - `lib/arquivos-soltos.ts`: `EXTENSOES_PLANILHA` ganha `".xls"`;
  - `components/nova-varredura-form.tsx`: o `accept` ganha `.xls`.
- Testes: `tests/planilha-eleitos.test.ts`, `tests/arquivos-soltos.test.ts`.

**Interfaces:**
- Produz: `lerPlanilhaEleicao` devolve `{ tipo: "atuais", deputados }` também para a planilha da Câmara.
- O reconhecimento é pelas colunas "Nome Parlamentar", "Titular/Suplente/Efetivado" e "Nome Civil", em qualquer aba. Tem prioridade sobre a aba "Em exercício".
- Mapeamento para `DeputadoAtual`:

| Coluna da Câmara | Campo de `DeputadoAtual` |
|---|---|
| UF | `uf` |
| Nome Parlamentar | `nomeParlamentar` |
| Nome Civil | `nomeCivil` (como vem) |
| Partido | `partido` |
| Titular/Suplente/Efetivado (T, S, E) | `condicao`: `"Titular"`, `"Suplente"` ou `"Efetivado"` |
| Tratamento: "Exma. Senhora Deputada" | `sexo: "Feminino"` |
| Tratamento: "Exmo. Senhor Deputado" | `sexo: "Masculino"` |
| Correio Eletrônico | `email` |
| Telefone | `telefone` |
| Anexo | `predio` |
| Gabinete | `sala` (texto) |

- `eleicao2026` fica ausente. Fax e aniversário não são lidos.

- [ ] **Passo 1: testes que falham.**
  - Montar com `XLSX.utils.aoa_to_sheet` uma pasta de trabalho com a aba "Atualização - 29-10-2026 15-55", o cabeçalho real (as 17 colunas da Câmara, na ordem do anexo) e três linhas:
    - Leo Prates, BA, `T`, "Exmo. Senhor Deputado", nome civil "LEONARDO SILVA PRATES";
    - Professora Luciene Cavalcante, SP, `S`, "Exma. Senhora Deputada";
    - Zé Adriano, AC, `E`.
  - Gravar com `XLSX.write(wb, { bookType: "biff8", type: "array" })`.
  - Afirmar `tipo: "atuais"`, 3 deputados, `condicao` igual a `["Titular","Suplente","Efetivado"]`, `sexo` da Luciene `"Feminino"` e `eleicao2026` indefinido.
  - Em arquivos-soltos, `"deputado (3).xls"` é aceito.
- [ ] **Passo 2:** rodar os dois testes. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: Nova varredura aceita o deputado.xls do site da Câmara`.

### Tarefa 4: Regra de pessoa contra a lista da Câmara

**Arquivos:**
- Modificar: `lib/eleitos-casamento.ts`.
- Teste: `tests/eleitos-casamento.test.ts`, que é novo.

**Interfaces:**
- Produz:
  ```ts
  export function deputadosEmExercicio(e: { uf: string; nomeUrna: string; nomeCompleto: string }, atuais: readonly DeputadoAtual[]): DeputadoAtual[];
  export function nomesComAbreviacao(a: string, b: string): boolean;
  ```
- `deputadosEmExercicio` devolve os deputados distintos que satisfazem qualquer regra da spec §4.3.2. Zero é "fora da lista", um é "em exercício", mais de um é homônimo.
- `nomesComAbreviacao` compara as partes de `normalizarNome` na ordem. Uma parte de uma letra só (ex.: "A.") casa qualquer parte que comece com essa letra. O número de partes tem de ser igual.
- `constaEntreAtuais` passa a ser `deputadosEmExercicio(...).length === 1`.

- [ ] **Passo 1: testes que falham.**
  - Rosangela Moro: o eleito tem UF PR, nome completo "Rosangela Maria Wolff De Quadros Moro"; o deputado tem UF SP e nome civil "ROSANGELA MARIA WOLFF DE QUADROS MORO". Resultado: 1.
  - Guilherme Uchoa:
    - o eleito tem UF PE, nome de urna "Guilherme Uchoa Junior", nome completo "Guilherme Aristoteles Uchoa Cavalcanti Pessoa De Melo Junior";
    - o deputado tem nome parlamentar "Guilherme Uchoa" e nome civil "GUILHERME A. UCHOA CAVALCANTI PESSOA DE MELO JUNIOR";
    - resultado: 1.
  - O mesmo Guilherme com o deputado na UF RJ: 0, porque a abreviação exige a mesma UF.
  - Professora Luciene, suplente: 1.
  - Dois deputados com o mesmo nome parlamentar e a mesma UF: 2.
  - Duarte Junior (MG, nome completo distinto) contra "Duarte Jr." (MA, "HILDELIS SILVA DUARTE JUNIOR"): 0.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: regra de pessoa contra a lista de exercício da Câmara`.

### Tarefa 5: Classificação nova dos eleitos e o resumo do deputado

**Arquivos:**
- Modificar:
  - `lib/types.ts`: `EleitoClassificado` e `GovernadorClassificado` ganham `grupoDestino: string`;
  - `lib/eleitos.ts`: `regraDoStatus`, `classificarUm` e `aplicarEleicao`;
  - `lib/eleitos-governo.ts`: `grupoDestino` dos governadores;
  - `lib/painel-deputados.ts`: `etiquetasDoDeputado`.
- Testes: `tests/eleitos.test.ts`, `tests/eleitos-governo.test.ts`, `tests/painel-deputados.test.ts`.

**Interfaces:**
- Consome `deputadosEmExercicio` (Tarefa 4) e as constantes de grupo (Tarefa 1).
- Produz:
  ```ts
  export const RESUMO_NAO_ELEITO = "Não eleito em 2026";
  export function resumoEleicaoDoDeputado(d: DeputadoAtual, eleitos: readonly EleitoPlanilha[], governadores?: PlanilhaGovernadores): string;
  // "Reeleito deputado federal" | "Eleito senador" | "Eleito governador" | RESUMO_NAO_ELEITO
  ```
- `aplicarEleicao` preenche `eleicao2026` com essa função só quando o deputado veio sem ela, isto é, do `.xls`.

**Regras de `classificarUm`** (spec §4.3.1, nesta ordem):

| Eleito | Situação | Destino | `grupoDestino` |
|---|---|---|---|
| Câmara | status "Mandato novo (atual senador)" e casa contato de Senadores ou "Senadores titulares fora de exercício…" | `outra_casa` | "Senadores" |
| Câmara | casa contato de Senadores com outro status | `conferir` (homônimo; caso Jader Filho) | — |
| Câmara | `deputadosEmExercicio` = 1 | `reeleito` | `NOME_GRUPO_DEPUTADOS` |
| Câmara | `deputadosEmExercicio` = 0 | `novo` | `GRUPO_DEPUTADOS_ELEITOS` |
| Câmara | `deputadosEmExercicio` > 1 | `conferir` | — |
| Senado | `deputadosEmExercicio` = 1 | `outra_casa` | `NOME_GRUPO_DEPUTADOS` |
| Senado | "Reeleição" (ou "…em exercício como 1º suplente") presente nos grupos do Senado | `reeleito` | "Senadores" |
| Senado | "Reeleição" fora dos grupos do Senado | `conferir` | — |
| Senado | qualquer outro, inclusive "Mandato novo (verificar)" e Deltan | `novo` | `GRUPO_SENADORES_ELEITOS` |

- O status da planilha deixa de mandar para `conferir`, exceto nos casos da tabela.
- `jaCadastrado` passa a vir do grupo do Contatos cujo rótulo é igual a `grupoDestino` (`grupoDoAgrupador`).
- `etiquetasDoDeputado(RESUMO_NAO_ELEITO)` vira uma etiqueta neutra.

- [ ] **Passo 1: testes que falham** (spec §7.3, com eleitos e atuais mínimos):
  - Deltan (Senado, PR, "Mandato novo (atual deputado federal)", fora da lista): `novo`, `grupoDestino` igual a `GRUPO_SENADORES_ELEITOS`.
  - Zé Adriano ("Mandato novo", na lista como `E`): `reeleito` em "Deputados Federais".
  - Dr. Fábio Rueda ("Atual deputado (suplente em exercício)", fora da lista): `novo` em `GRUPO_DEPUTADOS_ELEITOS`.
  - Joana Darc ("Mandato novo (verificar)", fora da lista): `novo`.
  - Izalci Lucas (Câmara, "Mandato novo (atual senador)", contato em Senadores): `outra_casa` em "Senadores".
  - Jader Filho (Câmara, "Mandato novo", nome casa o senador Jader Barbalho): `conferir`.
  - Senador eleito que está na lista da Câmara: `outra_casa` em "Deputados Federais".
  - `resumoEleicaoDoDeputado` de um deputado sem eleito correspondente devolve `"Não eleito em 2026"`.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar. Ajustar os testes antigos que esperavam `conferir` pelo status para o comportamento da tabela.
- [ ] **Passo 4:** `npm test` e `npm run typecheck`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: eleitos classificados pela lista de exercício da Câmara, com grupo de destino`.

### Tarefa 6: Comparação dos grupos `lista`

**Arquivos:**
- Criar `lib/grupos-lista.ts`.
- Modificar `app/api/analise/route.ts`: chamar a função depois de `aplicarEleicao`, na l.81.
- Teste: `tests/grupos-lista.test.ts`.

**Interfaces:**
- Consome `grupoDestino` (Tarefa 5) e `compararContatoSemFonteOficial` e `MOTIVO_SEM_LISTA` (Tarefa 2).
- Produz:
  ```ts
  export interface PessoaDaLista { nome: string; nomeCompleto: string; uf: string; cargoEsperado: string }
  export function composicaoDaLista(grupo: string, eleicao: ResultadoEleicao): PessoaDaLista[] | undefined; // undefined = sem lista
  export function aplicarListas(resultado: ResultadoAnalise, dataDaLista: string): ResultadoAnalise;
  ```
- `composicaoDaLista`:
  - nos três grupos de eleitos, os classificados com esse `grupoDestino`;
  - em "Deputados Federais", `deputadosAtuais`;
  - o cargo esperado é "Senador", "Deputado Federal" ou "Governador do Estado de <UF por extenso>". Para o DF, "Governador do Distrito Federal".
- `aplicarListas` substitui cada contato dos grupos `fiscalizacao === "lista"`:
  - **casa uma pessoa** (`casaPessoa`): nome comparado pela igualdade de `normalizarNome` com o nome de urna, com a observação `OBSERVACAO_NOME_URNA` quando diverge, e cargo comparado pelo papel (`lib/cargos.ts`). Fica `verde` ou `amarelo`;
  - **não casa ninguém:** `indeterminado`, com a observação "Não está na lista de <grupo> (planilha do TSE de <dataDaLista>)";
  - **sem lista** (sem eleição no payload): o resultado da Tarefa 2 continua.
- Nunca põe `possivelSaida` nem `novos`.
- A rota passa `dataDaLista` igual a DD/MM da data da varredura.

- [ ] **Passo 1: testes que falham.**
  - Um contato "Deltan Dallagnol" em `GRUPO_SENADORES_ELEITOS`, com o eleito classificado lá, sai `verde`.
  - Um contato "Fulano de Tal" no mesmo grupo sai `indeterminado`, com a observação que contém "Não está na lista de Senadores eleitos - Posse Presidencial 2027", e sem `possivelSaida`.
  - Sem `eleicao`, o resultado não muda.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: grupos de eleitos e Deputados Federais comparados com as listas`.

### Tarefa 7: Painel com os eleitos por grupo e o agrupador

**Arquivos:**
- Modificar:
  - `lib/painel-eleicao.ts`, em `secoesDeEleicao` e `secoesDeGoverno`;
  - `lib/painel-deputados.ts`: tirar `aCadastrar` dos novos;
  - `components/secao-eleitos.tsx`, `components/secao-governo.tsx`, `components/grupo-deputados.tsx` e `components/painel.tsx`.
- Criar `components/agrupador.tsx`.
- Testes: `tests/painel-eleicao.test.ts`, `tests/painel-deputados.test.ts`.

**Interfaces:**
- Consome `grupoDestino` (Tarefa 5) e `linhasDoAgrupador` (Tarefa 1).
- Produz:
  ```ts
  export interface SecaoGrupoEleito { grupo: string; titulo: string; aCadastrar: EleitoClassificado[]; aConferir: EleitoClassificado[]; governo: { aCadastrar: GovernadorClassificado[]; aConferir: GovernadorClassificado[] }; pelaLista: number; noContatos: number }
  export function secoesDeEleicao(eleicao: ResultadoEleicao | undefined, grupos: readonly ResultadoGrupo[], filtro: string, busca: string): SecaoGrupoEleito[];
  export function esperadosDoAgrupador(eleicao: ResultadoEleicao | undefined): Record<string, number>;
  ```
- `secoesDeEleicao` monta uma seção por grupo de eleitos, na ordem Senadores, Deputado Federal, Governadores:
  - os `conferir` do Senado entram no grupo dos senadores eleitos e os da Câmara no dos deputados;
  - os governadores ficam no seu grupo, e a seção do 2º turno continua em `secoesDeGoverno`;
  - o título é "<rótulo> — <pelaLista> pela lista · <noContatos> no Contatos · <n> a cadastrar";
  - os filtros "a_cadastrar" e "a_conferir" mostram só a subseção correspondente.
- `grupoDeputados` deixa de devolver eleitos de primeiro mandato. Quando "Deputados Federais" já existe no Contatos (`camaraNoContatos`), uma seção "Deputados Federais — a cadastrar" lista os reeleitos (`grupoDestino` "Deputados Federais") com `jaCadastrado` falso. Os governadores que hoje estão no grupo "Governadores Eleitos" do catálogo, com as fontes de campanha de ES, RN e TO, deixam de ser lidos pela página, porque o modo `lista` vem antes: registrar no comentário da entrada do catálogo que ela não é mais alcançada pelo rótulo da Posse.
- O painel mostra o bloco "Grupos da Posse 2027 (28)", com o componente `Agrupador`, acima dos grupos. A seção "Eleitos — a conferir" deixa de existir.

- [ ] **Passo 1: testes que falham.**
  - Com Deltan (`novo`, senado) e um eleito da Câmara em `conferir`, as seções trazem Deltan em `aCadastrar` de `GRUPO_SENADORES_ELEITOS` e o da Câmara em `aConferir` de `GRUPO_DEPUTADOS_ELEITOS`.
  - Nenhum título contém "Eleitos — a conferir".
  - `grupoDeputados(...)` não tem mais `aCadastrar`.
  - `esperadosDoAgrupador` conta os classificados por `grupoDestino`, mais os 513 de "Deputados Federais".
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar a lógica e depois os componentes, que só renderizam.
- [ ] **Passo 4:** `npm test`, `npm run typecheck` e `npm run build`. Esperado: verdes.
- [ ] **Passo 5:** commit `feat: painel separa os eleitos por grupo do Contatos e mostra o agrupador`.

### Tarefa 8: Núcleo das decisões (puro)

**Arquivos:**
- Criar `lib/decisoes.ts`.
- Teste: `tests/decisoes.test.ts`.

**Interfaces:**
- Produz:
  ```ts
  export type TipoDecisao = "mesma_pessoa" | "pessoas_diferentes" | "nao_recebe_convite" | "ajustar_contatos";
  export type SituacaoNoContatos = "tratado" | "pendente" | "reaberto" | "sem_efeito";
  export interface RegistroManual { tipo: TipoDecisao; data: string /* AAAA-MM-DD */; quem: string; observacao: string; validacao: "validado" | "a_validar"; convidaPor?: string; outraPessoa?: string[]; grupos: string[] }
  export interface RegistroColeta { tipo: "coleta"; data: string; situacao: SituacaoNoContatos; grupos: string[] }
  export type Registro = RegistroManual | RegistroColeta;
  export interface CasoDecidido { id: string; nome: string; chaves: string[]; registros: Registro[] }
  export interface HistoricoDecisoes { versao: 1; casos: CasoDecidido[] }
  export const HISTORICO_VAZIO: HistoricoDecisoes;
  export function grupoEquivalente(grupo: string, origem: "contatos" | "camara" | "eleicao", grupoDestino?: string): string; // spec §4.1.1
  export function acharCaso(h: HistoricoDecisoes, nomes: readonly string[]): CasoDecidido | undefined; // por qualquer chave normalizarNome
  export function registrar(h: HistoricoDecisoes, nome: string, nomes: readonly string[], r: RegistroManual): HistoricoDecisoes; // cria ou acrescenta; une as chaves
  export function vigente(c: CasoDecidido): RegistroManual | undefined; // o manual mais recente pela data e, no empate, pela ordem
  export function situacaoDoCaso(c: CasoDecidido, gruposAtuais: readonly string[]): SituacaoNoContatos; // tabela da spec §4.1.4
  export function registrarColetas(h: HistoricoDecisoes, gruposPorCaso: (c: CasoDecidido) => string[], data: string): HistoricoDecisoes; // acrescenta coleta só quando a situação muda
  ```
- `gruposAtuais` já vem com `grupoEquivalente` aplicado: "Câmara" vira "Deputados Federais", e o eleito vira o seu `grupoDestino`.
- Para `ajustar_contatos`, "tratado" é `gruposAtuais` vazio ou só com `convidaPor`.

- [ ] **Passo 1: testes que falham.**
  - `registrar` duas vezes com "Ministro Kassio Nunes Marques" e depois "Nunes Marques" (mesmas chaves normalizadas, ou unidas pelo segundo registro) gera um caso com dois registros. `acharCaso` com `["Kassio Nunes Marques"]` acha esse caso.
  - **Nunes Marques**, decisão `mesma_pessoa` → "Ministros do TSE", grupos [STF, TSE]:
    - com `gruposAtuais` [TSE]: `tratado`;
    - com [STF, TSE]: `pendente`;
    - com [TSE, Ministros do STJ]: `reaberto`.
  - **Davi**, `nao_recebe_convite`: com `[]`, `tratado`; com ["Senadores"], `pendente`.
  - `pessoas_diferentes`: com os mesmos grupos, `sem_efeito`; com um grupo novo, `reaberto`.
  - `registrarColetas` aplicado duas vezes com a mesma situação acrescenta uma entrada só. Com a situação mudada, acrescenta outra.
  - Nenhuma função muta a entrada (testar com `Object.freeze` profundo).
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar. O `id` é o `normalizarNome` do primeiro nome.
- [ ] **Passo 4:** `npm test`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: núcleo do registro de decisões do GT`.

### Tarefa 9: Armazém, rota, coleta e publicação das decisões

**Arquivos:**
- Criar `lib/armazem-decisoes.ts` e `app/api/decisoes/route.ts`.
- Modificar:
  - `app/api/analise/route.ts`: depois de gravar o retrato;
  - `app/api/publicar/route.ts`;
  - `lib/armazem-blob.ts`;
  - `app/carregar-retrato.tsx`.
- Testes: `tests/armazem-decisoes.test.ts` e `tests/decisoes-rota.test.ts`, que testa a função de tratamento da requisição.

**Interfaces:**
- Consome a Tarefa 8.
- Produz:
  ```ts
  export interface ArmazemDecisoes { ler(): Promise<HistoricoDecisoes>; gravar(h: HistoricoDecisoes): Promise<void> }
  export const CAMINHO_DECISOES_PADRAO: string; // join(".fiscal", "decisoes.json")
  export const CAMINHO_DECISOES_BLOB = "retratos/decisoes.json";
  export class DecisoesIlegiveisError extends Error {}
  export function validarHistorico(valor: unknown): HistoricoDecisoes;
  export function armazemDecisoesEmArquivo(caminho?: string): ArmazemDecisoes; // ausente → HISTORICO_VAZIO; escrita atômica tmp→rename
  export function armazemDecisoesEmMemoria(inicial?: HistoricoDecisoes): ArmazemDecisoes;
  export function armazemDecisoesEmBlob(cliente: ClienteBlob): ArmazemDecisoes;
  export async function tratarRegistroDeDecisao(corpo: unknown, armazem: ArmazemDecisoes): Promise<{ status: number; corpo: { ok: boolean; message?: string; historico?: HistoricoDecisoes } }>;
  ```
- `POST /api/decisoes` recebe `{ nome, nomes, registro: RegistroManual }`.
  - Valida o corpo. Inválido devolve 400 com mensagem clara.
  - **Relê o arquivo** e chama `registrar`.
  - Grava e devolve o histórico.
  - Origem e modo seguem as restrições globais.
- `carregarRetrato` passa a devolver também `decisoes: HistoricoDecisoes`:
  - modo local: arquivo ilegível vira `HISTORICO_VAZIO`, com um aviso na página;
  - modo web: lido do Blob, e a ausência vira vazio.
- `POST /api/publicar` grava também `CAMINHO_DECISOES_BLOB`.
- `/api/analise`, depois de gravar o retrato, chama `registrarColetas` com os grupos atuais de cada caso.
  - Os grupos atuais são os contatos do retrato e as listas de fora, cujo nome normalizado é uma chave do caso, com `grupoEquivalente` aplicado.
  - Uma falha ali vira aviso e não derruba a varredura.

- [ ] **Passo 1: testes que falham.**
  - Arquivo ausente: `ler` devolve `HISTORICO_VAZIO`.
  - JSON quebrado: `ler` lança `DecisoesIlegiveisError`, e `tratarRegistroDeDecisao` responde 500 sem sobrescrever o arquivo (Ponto de atenção 4).
  - Duas chamadas de `tratarRegistroDeDecisao` em sequência, cada uma com um caso, deixam os dois casos no arquivo (Ponto de atenção 5).
  - Corpo sem `registro.tipo`: 400.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test` e `npm run typecheck`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: decisões em arquivo próprio, gravadas pela tela e publicadas com o retrato`.

### Tarefa 10: Repetidos e painel com as decisões (linha fosca)

**Arquivos:**
- Modificar:
  - `lib/repetidos.ts`, em `autoridadesRepetidas` e `etiquetaDeRepeticao`;
  - `lib/export-repetidos.ts`;
  - `components/linha-contato.tsx`, `components/painel.tsx` e `app/repetidos/page.tsx`.
- Testes: `tests/repetidos.test.ts`, `tests/export-repetidos.test.ts`.

**Interfaces:**
- Consome a Tarefa 8 e `decisoes` do carregador (Tarefa 9).
- Produz:
  ```ts
  export type SituacaoRepetida = "decidido" | "conferir" | "decidido_gt" | "tratado";
  // AutoridadeRepetida ganha: caso?: CasoDecidido; decisao?: RegistroManual; noContatos?: SituacaoNoContatos
  export function autoridadesRepetidas(grupos: readonly ResultadoGrupo[], eleicao?: ResultadoEleicao, decisoes?: HistoricoDecisoes): AutoridadeRepetida[];
  // inclui também os casos decididos cuja pessoa já não está repetida, com situacao "tratado"
  export interface MarcaDeRepeticao { etiqueta: Etiqueta; fosca: boolean }
  export function etiquetaDeRepeticao(repetidas: readonly AutoridadeRepetida[], c: ResultadoContato, grupo: string): MarcaDeRepeticao | undefined;
  export type FiltroRepetidas = "todas" | "conferir" | "decidido" | "decidido_gt" | "tratado";
  ```
- Com uma decisão vigente não reaberta, `situacao` deixa de ser `conferir`:
  - `mesma_pessoa` vira `decidido_gt` (ou `tratado`), e `convidaPor` passa a ser a ocorrência do grupo decidido;
  - `pessoas_diferentes` vira `decidido_gt`, sem etiqueta no painel;
  - caso reaberto volta para `conferir`, com o motivo "grupo novo desde a decisão de DD/MM".
- Rótulos dos filtros: "A conferir", "Decididas pela regra", "Decididas pelo GT" e "Tratadas no Contatos".
- Etiqueta e linha fosca (textos fixados pela spec):

| Decisão | Grupo da linha | Etiqueta e tom | Fosca |
|---|---|---|---|
| `mesma_pessoa` | grupo que não convida | "Será convidada pelo grupo X (decisão do GT de DD/MM)" | sim |
| `nao_recebe_convite` | qualquer | "Não recebe convite (decisão do GT de DD/MM)" | sim |
| `ajustar_contatos` | qualquer | "Ajustar no Contatos (decisão de DD/MM)", atenção | não |

- `LinhaContato` ganha a prop `fosca?: boolean`, que atenua a linha com `opacity-60` e deixa o texto legível.
- A linha fosca não entra nas contagens de pendência do grupo.
- O export ganha as colunas "Decisão do GT", "Data da decisão" e "Situação no Contatos".

- [ ] **Passo 1: testes que falham** (spec §7.1, com grupos mínimos e a decisão do §4.1.5):
  - **Cueva**, nos grupos STJ e TSE, com `mesma_pessoa` → TSE: `etiquetaDeRepeticao` na linha do STJ devolve `fosca: true` e o texto "Será convidada pelo grupo Ministros do TSE (decisão do GT de 26/10)". Na linha do TSE, `fosca: false`.
  - **Nunes Marques**, só em TSE, com `mesma_pessoa` → TSE: aparece com `situacao: "tratado"`.
  - **Hugo Motta**, sem decisão: continua `conferir`.
  - **Carlos Brandão**, com `pessoas_diferentes`: `decidido_gt`, e `etiquetaDeRepeticao` devolve `undefined`.
  - O export tem as três colunas novas.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`, `npm run typecheck` e `npm run build`. Esperado: verdes.
- [ ] **Passo 5:** commit `feat: decisões do GT nos repetidos e linha fosca no grupo que não convida`.

### Tarefa 11: Decisões dos eleitos a conferir

**Arquivos:**
- Modificar:
  - `lib/eleitos.ts`: `aplicarEleicao` e `classificarEleitos` ganham o parâmetro `decisoes?`;
  - `app/api/analise/route.ts`: ler as decisões e passá-las;
  - `lib/painel-eleicao.ts`.
- Teste: `tests/eleitos.test.ts`.

**Interfaces:**
- Consome a Tarefa 8.
- Assinaturas novas:
  ```ts
  classificarEleitos(eleitos, grupos, deputadosAtuais?, decisoes?: HistoricoDecisoes): EleitoClassificado[]
  aplicarEleicao(resultado, eleitos, arquivos, deputadosAtuais?, governadores?, decisoes?: HistoricoDecisoes): ResultadoAnalise
  ```
- A decisão vigente do caso (acharCaso pelos nomes de urna e completo) vence a regra:
  - **`mesma_pessoa` com `convidaPor` X:** o `grupoDestino` passa a ser X. O destino é `reeleito` quando X é "Deputados Federais" ou "Senadores", e `novo` quando X é um grupo de eleitos. Ganha `motivo` "Decisão do GT de DD/MM";
  - **`pessoas_diferentes`:** ignora a ligação por nome com o Contatos e reclassifica.
- `EleitoClassificado` ganha `decisao?: RegistroManual`, para a tela mostrar o histórico.

- [ ] **Passo 1: testes que falham.**
  - Jader Filho: sem decisão, `conferir`. Com `pessoas_diferentes`, `novo` em `GRUPO_DEPUTADOS_ELEITOS`.
  - Um eleito `conferir` por homônimo, com `mesma_pessoa` → "Deputados Federais": `reeleito`.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: decisão do GT vence a regra na classificação dos eleitos`.

### Tarefa 12: Formulário e histórico na tela

**Arquivos:**
- Criar `components/registro-decisao.tsx` (cliente) e `lib/registro-decisao.ts` (lógica pura do formulário).
- Modificar `components/tela-repetidos.tsx` e `components/secao-eleitos.tsx`.
- Teste: `tests/registro-decisao.test.ts`.

**Interfaces:**
- Consome a rota da Tarefa 9 e os tipos da Tarefa 8.
- Produz:
  ```ts
  export interface FormularioDecisao { tipo: TipoDecisao | ""; convidaPor: string; outraPessoa: string[]; observacao: string; quem: string; validacao: "validado" | "a_validar" }
  export function errosDoFormulario(f: FormularioDecisao): string[]; // tipo obrigatório; convidaPor obrigatório em mesma_pessoa; quem obrigatório
  export function paraRegistro(f: FormularioDecisao, grupos: readonly string[], hoje: string): RegistroManual;
  export function textoDoRegistro(r: Registro): string; // linha do histórico, ex.: "26/10 · Mesma pessoa: convidada pelo grupo Ministros do TSE · Marina e Clóvis · Validado"
  ```
- Em modo local, cada caso de `/repetidos` e cada eleito das subseções "A conferir" e "A cadastrar" (Tarefa 7) mostram:
  - o botão "Registrar decisão", que abre o formulário: o tipo, o grupo do convite (um select com os grupos do caso e, para eleitos, os quatro grupos de destino), "É outra pessoa" com marcação por ocorrência, observação, quem decidiu e validação;
  - "Histórico (n)", que abre a lista de `textoDoRegistro` do mais recente para o mais antigo.
- Em modo web, só o histórico. Depois de gravar, a tela chama `router.refresh()`.

- [ ] **Passo 1: testes que falham.**
  - `errosDoFormulario` de `{tipo:"mesma_pessoa", convidaPor:"", quem:""}` tem 2 erros.
  - `paraRegistro` gera a data `hoje`.
  - `textoDoRegistro` de uma entrada de coleta "tratado" de 30/10 é "30/10 · Coleta: Tratado no Contatos".
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar a lógica e depois os componentes.
- [ ] **Passo 4:** `npm test`, `npm run typecheck` e `npm run build`. Esperado: verdes.
- [ ] **Passo 5:** conferir no navegador (`preview_start` com o dev server):
  - registrar uma decisão de teste num caso;
  - ver o histórico;
  - apagar a decisão de teste à mão em `.fiscal/decisoes.json`.
- [ ] **Passo 6:** commit `feat: registrar decisão e ver o histórico em /repetidos e nos eleitos`.

### Tarefa 13: Documentação

**Arquivos:**
- Modificar `CLAUDE.md`:
  - "Estado do projeto";
  - o princípio do retrato (a exceção de `decisoes.json`);
  - a Rotina, passo 3 (`deputado.xls`) e passo 9 (o relatório traz as decisões tratadas, pendentes e reabertas);
  - o layout de `lib/`;
  - a linha da spec, de "a implementar" para "implementada".

- [ ] **Passo 1:** editar.
- [ ] **Passo 2:** commit `docs: CLAUDE.md com as decisões do GT, o agrupador e o deputado.xls`.
