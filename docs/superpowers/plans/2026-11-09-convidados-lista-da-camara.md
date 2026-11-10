# Lista da Câmara, Dr. só no STM e aba certa do modelo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o adendo de 09/11 da spec da lista de convidados: "Dr."/"Dra." só saem do nome no grupo "Ministros do STM"; a planilha `deputado.xls` do site da Câmara vira entrada direta do comando para "Deputados Federais", montada no modelo do PRODASEN com a regra A; o leitor do modelo Padrão prefere a aba "Lista de Convidados".

**Architecture:** Tudo dentro de `lib/convidados/` (funções puras) e `scripts/convidados.ts`. Um leitor novo `lib/convidados/camara.ts` transforma a planilha da Câmara em `LinhaLista[]` já no vocabulário do modelo; `lib/convidados/lista.ts` ganha um despachante `lerLista` que reconhece a origem pelas colunas; `tratarNome` passa a receber o grupo; `MetaRodada` ganha a origem e a aba lida, para o Resumo.

**Tech Stack:** TypeScript, `xlsx` (leitura), `exceljs` (gravação, só em `saida.ts`), Vitest. Nada novo.

**Spec:** `docs/superpowers/specs/2026-11-08-tratamento-lista-de-convidados-design.md`, §15 (adendo de 09/11). Em caso de dúvida, a spec manda.

## Global Constraints

- Funções de `lib/` puras e imutáveis; sem `any`; erros tipados (`ColunaFaltanteError` de `lib/planilha.ts`).
- Nenhum nome real de pessoa em teste, fixture, log ou stdout. Fixtures fictícias em `tests/fixtures/convidados/`.
- Comunicação, nomes de regra e textos de UI em português do Brasil.
- Limites dos Correios (`LIMITES` em `lib/convidados/limites.ts`): NOME 50, CEP 8, LOGRADOURO 50, NUMERO 6, COMPLEMENTO 30, BAIRRO 30, CIDADE 30, UF 2.
- Não tocar em `lib/planilha-eleitos.ts` nem em nada fora de `lib/convidados/`, `scripts/convidados.ts`, `tests/convidados-*.ts`, `tests/fixtures/convidados/` e docs.
- Commits em português, formato `<tipo>(convidados): <descrição>`, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Não rodar `npm run build` com o servidor de desenvolvimento ligado.

## Review Focus

1. "Dr." no meio do nome ("João Dr. Silva") nunca é título: só o início conta, como já é hoje (`tamanhoDoTitulo` olha os primeiros tokens).
2. Planilha da Câmara com coluna "Tratamento" vazia ou com texto inesperado: gênero indefinido, TRATAMENTO/ENDERECAMENTO vazios, linha fora do arquivo com o achado de campo obrigatório; nunca "Senhor" por padrão.
3. Planilha da Câmara sem a coluna "Endereço (complemento)" ou sem "CEP" no texto: CEP vazio e a regra do CEP (REVISAR) cuida; nunca um CEP inventado.
4. Modelo Padrão com a aba "Lista de Convidados" vazia (só cabeçalho) e a aba de orientações com exemplos: a leitura devolve 0 linhas, nunca os exemplos.
5. Lista da Câmara com nome parlamentar repetido em duas linhas (dois deputados homônimos): a segunda sai "Repetida na própria lista", como qualquer lista; não há regra nova.

---

### Task 1: "Dr." e "Dra." só saem no grupo do STM

**Files:**
- Modify: `lib/convidados/nome.ts`
- Modify: `lib/convidados/tratar.ts` (`curarCampos` e `tratarUma` passam o grupo)
- Modify: `lib/convidados/regras-texto.ts` (regra "Título no nome")
- Test: `tests/convidados-campos.test.ts`

**Interfaces:**
- Produces: `export const GRUPO_STM = "Ministros do STM"` e `export function tratarNome(nome: string, grupo = ""): ResultadoCampo` em `lib/convidados/nome.ts`. `TITULOS` passa a ser `TITULOS_SEMPRE` (`["exmo", "exma", "sr", "sra", "se sr", "se sra"]`) e `TITULOS_STM` (`["dr", "dra"]`); `semTitulo(nome, grupo = "")` usa `TITULOS_SEMPRE` e, quando `mesmoGrupo(grupo, GRUPO_STM)` (import de `./duplicidade`), também `TITULOS_STM`.

- [ ] **Step 1: Escrever os testes que falham** em `tests/convidados-campos.test.ts`, no `describe` do nome:

```ts
test("Dr. fica no nome fora do STM", () => {
  const r = tratarNome("Dr. Fulano Exemplo", "Deputados Federais");
  expect(r.valor).toBe("Dr. Fulano Exemplo");
  expect(r.regras).toEqual([]);
});
test("Dr. sai do nome no grupo Ministros do STM, com a regra registrada", () => {
  const r = tratarNome("Dr. Fulano Exemplo", "Ministros do STM");
  expect(r.valor).toBe("Fulano Exemplo");
  expect(r.regras).toEqual(["Nome: título removido (Dr.)"]);
});
test("Dra. sai no STM também com o rótulo em outra caixa", () => {
  expect(tratarNome("Dra. Fulana Exemplo", "ministros do stm").valor).toBe("Fulana Exemplo");
});
test("Exma. Sra. sai em qualquer grupo", () => {
  expect(tratarNome("Exma. Sra. Maria Exemplo", "Deputados Federais").valor).toBe("Maria Exemplo");
  expect(tratarNome("Exma. Sra. Maria Exemplo").valor).toBe("Maria Exemplo");
});
test("Dr. no meio do nome nunca é título", () => {
  expect(tratarNome("João Dr. Exemplo", "Ministros do STM").valor).toBe("João Dr. Exemplo");
});
```

Ajustar os testes existentes que esperavam "Dr." removido sem grupo: eles passam a chamar com `"Ministros do STM"` ou a esperar o "Dr." mantido, conforme o caso (ler cada um; não apagar nenhum).

- [ ] **Step 2: Rodar e ver falhar**: `npx vitest run tests/convidados-campos.test.ts`.

- [ ] **Step 3: Implementar** em `nome.ts` (`GRUPO_STM`, `TITULOS_SEMPRE`, `TITULOS_STM`, `semTitulo(nome, grupo)`, `tratarNome(nome, grupo)`), em `tratar.ts` (`curarCampos(recebido, grupo)` chama `tratarNome(recebido.NOME, grupo)`; `tratarUma` passa `ctx.grupo`) e em `regras-texto.ts`: título "Título no nome", texto: `"Exmo., Exma., Sr., Sra. e SE Sr. no início do nome saem (alterado), também quando vêm seguidos (Exma. Sra.). Dr. e Dra. só saem no grupo Ministros do STM (regra do GT para o STM); nos demais grupos o nome vai como está. Patente e cargo (General, Senador, Ministro) ficam: fazem parte do nome pelas regras do GT."`.

- [ ] **Step 4: Rodar a suíte de convidados**: `npx vitest run tests/convidados-` e ver verde. Conferir `tests/convidados-tratar.test.ts` (o exemplo aprovado usa o grupo "Convidados do presidente eleito - Posse 2027": se algum caso dependia do "Dr." removido, o caso muda para o valor mantido e a mudança é registrada no relatório).

- [ ] **Step 5: Commit**: `git add lib/convidados/nome.ts lib/convidados/tratar.ts lib/convidados/regras-texto.ts tests/convidados-campos.test.ts tests/convidados-tratar.test.ts` e `git commit -m "feat(convidados): Dr. e Dra. só saem do nome no grupo Ministros do STM"`.

### Task 2: Leitor do modelo Padrão prefere a aba "Lista de Convidados"

**Files:**
- Modify: `lib/convidados/lista.ts`
- Modify: `tests/fixtures/convidados/montar.ts` (opção `abaDeOrientacoesAntes?: boolean` em `OpcoesLista`: acrescenta, antes da aba da lista, uma aba "Orientações de preenchimento" com 20 linhas vazias, o cabeçalho `CABECALHO_LISTA` sem as colunas TRATAMENTO e ENDERECAMENTO na linha 22 e duas linhas de exemplo fictícias)
- Test: `tests/convidados-lista.test.ts`

**Interfaces:**
- Produces: `export interface ListaLida { linhas: LinhaLista[]; aba: string }` e `export function lerListaPadraoComAba(buffer: ArrayBuffer): ListaLida` em `lista.ts`; `lerListaPadrao(buffer)` continua existindo e devolve só `linhas` (compatibilidade com os testes e a Task 4). Ordem de leitura das abas: primeiro a de nome normalizado `"lista de convidados"`, depois as demais na ordem do arquivo, nunca uma cujo nome normalizado começa com `"orientac"`.

- [ ] **Step 1: Testes que falham** em `tests/convidados-lista.test.ts`:

```ts
test("lê a aba Lista de Convidados mesmo com a aba de orientações antes, com exemplos e cabeçalho sem as colunas do GT", () => {
  const buf = montarListaPadrao([linha], { abaDeOrientacoesAntes: true });
  const lida = lerListaPadraoComAba(buf);
  expect(lida.aba).toBe("Lista de Convidados");
  expect(lida.linhas).toHaveLength(1);
  expect(lida.linhas[0].valores.NOME).toBe("Ana Beatriz Exemplo Souza");
});
test("sem a aba Lista de Convidados, lê a primeira aba com o cabeçalho que não seja de orientações", () => {
  const buf = montarListaPadrao([linha], { aba: "Convidados Gabinete", abaDeOrientacoesAntes: true });
  expect(lerListaPadraoComAba(buf).aba).toBe("Convidados Gabinete");
});
test("aba Lista de Convidados só com cabeçalho devolve 0 linhas, nunca os exemplos da aba de orientações", () => {
  expect(lerListaPadrao(montarListaPadrao([], { abaDeOrientacoesAntes: true }))).toEqual([]);
});
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `lerListaPadraoComAba` (reordenação das abas + filtro de orientações; o laço atual vira o corpo) e `lerListaPadrao` como atalho. Estender `montarListaPadrao` com a opção.
- [ ] **Step 4: Rodar `npx vitest run tests/convidados-lista.test.ts`** e ver verde.
- [ ] **Step 5: Commit**: `git commit -m "fix(convidados): leitor do modelo Padrão prefere a aba Lista de Convidados e ignora a de orientações"`.

### Task 3: Leitor da planilha da Câmara

**Files:**
- Create: `lib/convidados/camara.ts`
- Create: `tests/fixtures/convidados/montar-camara.ts`
- Test: `tests/convidados-camara.test.ts`

**Interfaces:**
- Produces, em `lib/convidados/camara.ts`:
  - `export const MARCAS_CAMARA = ["nome parlamentar", "titular/suplente/efetivado", "nome civil"] as const` (nomes normalizados por `normalizarTexto`).
  - `export const ENDERECO_CAMARA = { LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" } as const`.
  - `export function ehListaDaCamara(buffer: ArrayBuffer): boolean` — alguma aba tem as três marcas no cabeçalho (primeira linha não vazia entre as 30 primeiras).
  - `export function lerListaDaCamara(buffer: ArrayBuffer): LinhaLista[]` — lança `ColunaFaltanteError` com as marcas quando nenhuma aba as tem. Para cada linha com Nome Parlamentar: `valores` = `{ NOME: nomeParlamentar, TRATAMENTO, ENDERECAMENTO, CARGO, CEP, LOGRADOURO, NUMERO, COMPLEMENTO, BAIRRO, CIDADE, UF }` conforme a tabela do §15.2; `orgao: "Câmara dos Deputados"`; `linha` = linha da planilha (cabeçalho + 1 + índice).
  - `export function generoDoTratamentoDaCamara(tratamento: string): "f" | "m" | undefined` — `\bsenhora\b` → f, `\bsenhor\b` → m (após `normalizarTexto`), senão `undefined`.
  - `export function cepDoComplementoDaCamara(texto: string): string` — `/CEP\s*([\d.\-]+)/i`, só dígitos; sem casamento, `""`.
  - `export function complementoDaCamara(anexo: string, gabinete: string): string` — `"Anexo <anexo>, Gabinete <gabinete>"`, cada parte aparada; parte vazia omitida (`"Gabinete 414"` se o anexo vier vazio).
- Fixture `montarPlanilhaDaCamara(linhas: Partial<LinhaCamara>[], opcoes?: { aba?: string; semColunas?: string[] }): ArrayBuffer` com o cabeçalho real da Câmara: `["Nome Parlamentar","Partido","UF","Titular/Suplente/Efetivado","Endereço","Anexo","Endereço (continuação)","Gabinete","Endereço (complemento)","Telefone","Fax","Mês Aniversário","Dia Aniversário","Correio Eletrônico","Nome sem Acento","Tratamento","Nome Civil"]`; padrões: Endereço "Câmara dos Deputados, Edifício Anexo", "Endereço (continuação)" ", gabinete nº", "Endereço (complemento)" "Brasília - DF - CEP 70160-900", Tratamento "Exmo. Senhor Deputado".

- [ ] **Step 1: Testes que falham** em `tests/convidados-camara.test.ts` (nomes fictícios):

```ts
test("reconhece a planilha da Câmara pelas três colunas, em aba com qualquer nome", () => {
  expect(ehListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Dr. Carlos Exemplo" }], { aba: "Atualização - 09-11-2026 17-30" }))).toBe(true);
  expect(ehListaDaCamara(montarListaPadrao([]))).toBe(false);
});
test("monta a linha do homem no Anexo 4 no vocabulário do modelo, com a regra A", () => {
  const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Dr. Carlos Exemplo", anexo: "4", gabinete: "414", tratamento: "Exmo. Senhor Deputado" }]));
  expect(l.linha).toBe(2);
  expect(l.orgao).toBe("Câmara dos Deputados");
  expect(l.valores).toEqual({ NOME: "Dr. Carlos Exemplo", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal", CEP: "70160900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 4, Gabinete 414", BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" });
});
test("mulher no Anexo 3 sai no feminino", () => {
  const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Ana Exemplo", anexo: "3", gabinete: "531", tratamento: "Exma. Senhora Deputada" }]));
  expect(l.valores).toMatchObject({ TRATAMENTO: "Senhora", ENDERECAMENTO: "A Sua Excelência a Senhora", CARGO: "Deputada Federal", COMPLEMENTO: "Anexo 3, Gabinete 531" });
});
test("Anexo 0 segue a regra geral", () => {
  const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", anexo: "0", gabinete: "20" }]));
  expect(l.valores.COMPLEMENTO).toBe("Anexo 0, Gabinete 20");
});
test("tratamento que não decide o gênero deixa tratamento e endereçamento vazios e o cargo no masculino", () => {
  const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", tratamento: "" }]));
  expect(l.valores).toMatchObject({ TRATAMENTO: "", ENDERECAMENTO: "", CARGO: "Deputado Federal" });
});
test("sem CEP legível no complemento, CEP vazio", () => {
  const [l] = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", enderecoComplemento: "Brasília - DF" }]));
  expect(l.valores.CEP).toBe("");
});
test("gabinete gravado como número volta como texto; linha sem nome parlamentar é pulada", () => {
  const linhas = lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo", gabinete: "414" }, { nomeParlamentar: "" }]));
  expect(linhas).toHaveLength(1);
  expect(linhas[0].valores.COMPLEMENTO).toBe("Anexo 4, Gabinete 414");
});
test("planilha sem as três marcas é ColunaFaltanteError", () => {
  expect(() => lerListaDaCamara(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo" }], { semColunas: ["Nome Civil"] }))).toThrow(ColunaFaltanteError);
});
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `camara.ts` e a fixture. Leitura com `XLSX.read(buffer, { type: "array" })`, `sheet_to_json(..., { header: 1, defval: "", raw: false })` (o `raw: false` faz o gabinete numérico voltar como texto), cabeçalho normalizado por `normalizarTexto`, colunas achadas por nome normalizado ("anexo", "gabinete", "endereco (complemento)", "tratamento", "nome parlamentar").
- [ ] **Step 4: Rodar `npx vitest run tests/convidados-camara.test.ts`** e ver verde.
- [ ] **Step 5: Commit**: `git commit -m "feat(convidados): leitor da planilha do site da Câmara no vocabulário do modelo PRODASEN"`.

### Task 4: Despachante de origem, Resumo, regra na aba Regras e comando

**Files:**
- Modify: `lib/convidados/lista.ts` (despachante)
- Modify: `lib/convidados/tipos.ts` (`MetaRodada`)
- Modify: `lib/convidados/saida.ts` (linha "Lista recebida" do Resumo)
- Modify: `lib/convidados/regras-texto.ts` (regra nova, última da lista)
- Modify: `scripts/convidados.ts`
- Test: `tests/convidados-lista.test.ts`, `tests/convidados-saida.test.ts`, `tests/convidados-tratar.test.ts`

**Interfaces:**
- Consumes: `lerListaPadraoComAba` (Task 2), `ehListaDaCamara`/`lerListaDaCamara` (Task 3).
- Produces: em `lista.ts`, `export type OrigemLista = "padrao" | "camara"` e `export function lerLista(buffer: ArrayBuffer): { origem: OrigemLista; aba: string; linhas: LinhaLista[] }` (Câmara primeiro: se `ehListaDaCamara`, `origem: "camara"` e `aba` = nome da aba reconhecida; senão `lerListaPadraoComAba`). Em `tipos.ts`, `MetaRodada` ganha `origem: OrigemLista` (campo novo, obrigatório) e `aba: string`; o campo de texto do comando que hoje se chama `origem` passa a se chamar `comando` (renomear nos usos: `saida.ts`, `scripts/convidados.ts`, testes). Em `saida.ts`, a linha "Lista recebida" vira: `origem === "camara"` → `` `${listaNome} (planilha do site da Câmara, deputados em exercício, aba '${aba}', linhas ${primeiraLinha} a ${ultimaLinha})` ``; senão `` `${listaNome} (aba '${aba}', linhas ${primeiraLinha} a ${ultimaLinha})` ``. Em `regras-texto.ts`, regra `{ titulo: "Lista da Câmara (deputados em exercício)", texto: "Quando a lista é a planilha do site da Câmara (colunas Nome Parlamentar, Titular/Suplente/Efetivado e Nome Civil), a ferramenta monta cada linha no modelo: Nome = Nome Parlamentar como no site; Tratamento, Endereçamento e Cargo pelo gênero da coluna Tratamento da Câmara (Senhor / Senhora, A Sua Excelência o Senhor / a Senhora, Deputado / Deputada Federal); Logradouro 'Praça dos Três Poderes'; Número S/N e Complemento 'Anexo N, Gabinete NNN' (regra A dos Correios: 'Anexo 4' passa de 6 caracteres); CEP o da planilha da Câmara; Bairro 'Zona Cívico-Administrativa', Brasília, DF. Titulares, efetivados e suplentes em exercício entram todos. A referência 'Consta na lista da Câmara' não é calculada, porque a lista é a própria Câmara." }`.
- No comando: `const lida = lerOuFalhar(() => lerLista(lerBuffer(caminhoLista)), "Lista")`; quando `lida.origem === "camara"`, `referencias = { ...referencias, deputados: [] }` antes de `tratarLista`; `meta` leva `origem: lida.origem`, `aba: lida.aba`, `comando: ...`; o stdout ganha a linha `Origem: planilha do site da Câmara (deputados em exercício)` ou `Origem: modelo Padrão (aba '<aba>')` logo depois de "Lista:"; `USO` passa a dizer `"<lista.xlsx | deputado.xls da Câmara>"`.

- [ ] **Step 1: Testes que falham**:
  - `tests/convidados-lista.test.ts`: `lerLista(montarPlanilhaDaCamara([{ nomeParlamentar: "Pedro Exemplo" }]))` devolve `origem: "camara"` e 1 linha; `lerLista(montarListaPadrao([linha]))` devolve `origem: "padrao"`, `aba: "Lista de Convidados"`.
  - `tests/convidados-saida.test.ts`: Resumo de uma rodada com `meta.origem = "camara"` traz a célula "Lista recebida" contendo "planilha do site da Câmara"; com `"padrao"`, contendo "aba 'Lista de Convidados'"; a aba Regras traz a linha "Lista da Câmara (deputados em exercício)".
  - `tests/convidados-tratar.test.ts`: `tratarLista` sobre as 3 linhas da fixture da Câmara (Anexo 4 homem, Anexo 3 mulher, Anexo 0), grupo "Deputados Federais", base vazia, `referencias` com `deputados: []` e um eleito do TSE fictício que casa a primeira linha: as três `"Novo: importar"`, `camposAlterados` vazios, `achados` vazios, `referencia` da primeira linha começa com "Eleito em 2026" e nenhuma contém "Consta na lista da Câmara".
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** (lista.ts, tipos.ts, saida.ts, regras-texto.ts, scripts/convidados.ts).
- [ ] **Step 4: `npx vitest run tests/convidados-` verde; `npm run typecheck` limpo.**
- [ ] **Step 5: Commit**: `git commit -m "feat(convidados): planilha do site da Câmara como lista de entrada, origem no Resumo e regra na aba Regras"`.

### Task 5: Documentação

**Files:**
- Modify: `CLAUDE.md` (bloco "Tratamento da lista de convidados, etapa 1" no "Estado do projeto": uma frase sobre o adendo de 09/11: Dr./Dra. só no STM, `deputado.xls` como lista para "Deputados Federais" com a regra A, leitor prefere a aba "Lista de Convidados"; e a linha da tabela de specs de 2026-11-08 ganha ao fim "Adendo de 09/11 (§15): Dr./Dra. só no STM; planilha da Câmara como entrada direta; aba certa do modelo")

- [ ] **Step 1: Editar o CLAUDE.md** nos dois pontos, sem mexer no resto.
- [ ] **Step 2: Commit**: `git commit -m "docs: adendo de 09/11 da lista de convidados no CLAUDE.md"`.
