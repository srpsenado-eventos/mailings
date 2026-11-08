# Tratamento da lista de convidados, etapa 1 (módulo e comando) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma lista de convidados no modelo Padrão entra pelo comando `npm run convidados` e saem dois arquivos: a importação no modelo do PRODASEN e a conferência de cinco abas, com a curadoria dos Correios, a conferência do protocolo e a duplicidade contra a `BASE GRUPOS POSSE`.

**Architecture:** Módulo isolado `lib/convidados/` de funções puras (sem disco, sem JSX), uma por campo, orquestradas por `tratarLista`, que devolve uma `Rodada` com todas as linhas, situações, regras e achados; `saida.ts` transforma a `Rodada` nos dois arquivos com `exceljs`; o único ponto com disco é `scripts/convidados.ts`. Reaproveita só para leitura `lib/normalize.ts`, `lib/planilha.ts`, `lib/planilha-enderecos.ts`, `lib/planilha-eleitos.ts`, `lib/tratamento.ts`, `lib/endereco.ts`, `lib/decisoes.ts`, `data/grupos-posse.ts` e `data/tratamentos.ts`. Nenhum arquivo existente muda, com uma exceção: `alternativasDaLinha` de `lib/tratamento.ts` ganha `export` (corpo intacto).

**Tech Stack:** TypeScript estrito, Vitest, `xlsx` 0.18.5 (leitura), `exceljs` 4.4.0 (gravação com cores; dependência nova), `tsx` 4.x (executor do comando; devDependency nova), Node 22+.

**Spec:** `docs/superpowers/specs/2026-11-08-tratamento-lista-de-convidados-design.md` (ler inteira antes de cada tarefa; a tela `/convidados` é a etapa 2 e fica fora deste plano).

## Global Constraints

- Só português do Brasil em nomes de função, teste, mensagem e texto de planilha; nomes `camelCase`, sem `any`, imutabilidade (funções devolvem objetos novos).
- **Sem PII**: nenhum nome de convidado ou contato em `console.*`, no stdout do comando (só contagens, nomes de arquivo e caminhos) nem em teste ou fixture (só nomes fictícios, como os do exemplo aprovado: "Ana Beatriz Exemplo Souza", "Carlos Eduardo Fictício Ramos").
- Limites dos Correios: Nome 50, Logradouro 50, Número 6 (`LIMITE_NUMERO` de `lib/endereco.ts`), Complemento 30, Bairro 30, Cidade 30, UF 2, CEP 8.
- Três marcas de curadoria: `alterado` (amarelo `FFF2CC`), `validar` (azul `DDEBF7`), `revisar` (laranja `F8CBAD`); verde `E2EFDA` só em "Já no Contatos: no grupo escolhido"; cinza `E7E6E6` na linha inteira que não entra no arquivo; cabeçalho `1F4E78` com fonte branca; fonte Arial 10.
- A ferramenta **nunca** corta nome, **nunca** descarta trecho de endereço em silêncio, **nunca** decide identidade (nome parcial é "Conferir duplicidade", linha tratada como nova) e **nunca** muda Tratamento ou Endereçamento.
- Universo da duplicidade: só a `BASE GRUPOS POSSE`. A `BASE ENDERECO` serve só para o endereço de quem já existe (§6.2).
- Nenhum arquivo de `lib/`, `data/`, `app/`, `components/` fora de `lib/convidados/` é alterado, exceto a palavra `export` em `alternativasDaLinha` (`lib/tratamento.ts`). A suíte atual (72 arquivos, 1968 testes) continua passando sem nenhuma edição.
- Dependências novas só as duas registradas na spec: `exceljs` (dependencies) e `tsx` (devDependencies). `npm`, nunca `pnpm`.
- Commits pequenos, mensagem em português no formato `tipo: descrição`, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Arquivos `.xlsx` ficam fora do git (só `tests/fixtures/*.xlsx` seria permitido; este plano não cria nenhum: as fixtures são montadas em memória com `xlsx`).

## Review Focus

1. **CEP que a planilha guarda como número** ("1310100" lido como `1310100`, "70165900" como `70165900`): a leitura da lista tem que devolver texto, nunca `number`, senão o zero à esquerda some sem aviso. Teste na Tarefa 2.
2. **Linha só com o nome** (endereço inteiro vazio, caso de eleito sem gabinete): cada campo obrigatório vazio vira REVISAR, a linha continua "Novo" e nada quebra. Teste na Tarefa 9.
3. **Nome com acento na lista e sem acento na base** (ou vice-versa): a duplicidade casa pelo `normalizarNome`, então "José Exemplo" e "Jose Exemplo" são a mesma pessoa. Teste na Tarefa 8.
4. **Grupo escolhido digitado por apelido** ("Deputado Federal - Posse Presidencial 2027" quando a base diz "Deputados Federais"): "Já no Contatos: no grupo escolhido", pela forma equivalente do agrupador. Teste na Tarefa 8.
5. **Lista com o cabeçalho fora da linha 8 ou com a aba renomeada**: o leitor acha o cabeçalho pelo conteúdo, não pela posição. Teste na Tarefa 2.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/convidados/tipos.ts` | Tipos e constantes compartilhados: campos do modelo, `LinhaLista`, `Marca`, `Situacao`, `LinhaTratada`, `Rodada`, `Achado`, `MetaRodada`, textos de situação e de tipo de achado |
| `lib/convidados/limites.ts` | `LIMITES` por campo e `UFS` |
| `lib/convidados/rodada-nomes.ts` | Sufixo da data, nome dos arquivos, pasta da rodada, data no nome da base |
| `lib/convidados/lista.ts` | Leitura da lista Padrão (`ArrayBuffer` → `LinhaLista[]`) |
| `lib/convidados/abreviacoes.ts` | Tabelas portadas do script Python e o encaixe de Logradouro e Complemento |
| `lib/convidados/numero.ts` | Número vazio, S/N, regra A, lote no Logradouro |
| `lib/convidados/cep.ts` | Limpeza, 7 dígitos em SP, faixas por UF |
| `lib/convidados/bairro-cidade-uf.ts` | Bairro (de-para, canônico, limite), Cidade, UF |
| `lib/convidados/nome.ts` | Espaços, título, caixa alta, limite de 50 com sugestão |
| `lib/convidados/protocolo.ts` | Conferência de Tratamento e Endereçamento pela tabela, no gênero da pessoa |
| `lib/convidados/duplicidade.ts` | Índice da base, situação da pessoa, endereço de quem já existe, repetidas, referência Câmara/TSE |
| `lib/convidados/regras-texto.ts` | Lista `{ titulo, texto }` da aba Regras |
| `lib/convidados/tratar.ts` | Orquestração: `tratarLista` |
| `lib/convidados/saida.ts` | Os dois arquivos, com `exceljs` |
| `scripts/convidados.ts` | Comando: argumentos, disco, pasta da rodada, stdout |
| `tests/fixtures/convidados/montar.ts` | Montadores em memória: lista Padrão, base de grupos, base de endereços, modelo do PRODASEN |
| `tests/convidados-lista.test.ts`, `-campos`, `-duplicidade`, `-tratar`, `-saida` | Testes da spec §13 |

Caminho de cada campo na curadoria: `(valorRecebido, contexto) → ResultadoCampo`, onde `ResultadoCampo = { valor: string; regras: string[]; revisao?: Revisao }` e `Revisao = { marca: Marca; texto: string; sugestao?: string }`. Quem muda mais de um campo ao mesmo tempo (Número com Logradouro e Complemento; Logradouro com Complemento) devolve um objeto com os campos afetados e as mesmas `regras`/`revisao`.

---

### Task 1: Dependências, tipos, limites e nomes da rodada

**Files:**
- Modify: `package.json` (script `"convidados": "tsx scripts/convidados.ts"`, `exceljs` em dependencies, `tsx` em devDependencies)
- Create: `lib/convidados/tipos.ts`, `lib/convidados/limites.ts`, `lib/convidados/rodada-nomes.ts`
- Test: `tests/convidados-saida.test.ts` (só a parte de `rodada-nomes`; o resto vem na Tarefa 10)

**Interfaces:**
- Produces (`tipos.ts`):
  - `export const CAMPOS_MODELO = ["NOME","TRATAMENTO","ENDERECAMENTO","CARGO","CEP","LOGRADOURO","NUMERO","COMPLEMENTO","BAIRRO","CIDADE","UF"] as const; export type CampoModelo = (typeof CAMPOS_MODELO)[number];`
  - `export const CABECALHO_PRODASEN = [...CAMPOS_MODELO, "FOTO", "SITE_OFICIAL"] as const;` (13 colunas, nesta ordem exata)
  - `export type Valores = Record<CampoModelo, string>;`
  - `export interface LinhaLista { linha: number; valores: Valores; orgao: string }` (`linha` é a linha da planilha, 1-based; `orgao` lido e nunca usado nas saídas)
  - `export type Marca = "alterado" | "validar" | "revisar";`
  - `export interface Revisao { marca: Marca; texto: string; sugestao?: string }`
  - `export interface ResultadoCampo { valor: string; regras: string[]; revisao?: Revisao }`
  - `export type Situacao = "novo" | "ja_grupo_escolhido" | "ja_outro_grupo" | "repetida" | "sem_protocolo";`
  - `export const TEXTO_SITUACAO: Readonly<Record<Situacao, string>> = { novo: "Novo: importar", ja_grupo_escolhido: "Já no Contatos: no grupo escolhido", ja_outro_grupo: "Já no Contatos: incluir no grupo", repetida: "Repetida na própria lista", sem_protocolo: "Fora do arquivo: Tratamento ou Endereçamento vazio" };`
  - `export type TipoAchado = "validar" | "revisar" | "ja_outro_grupo" | "ja_grupo_escolhido" | "endereco_novo" | "endereco_diferente" | "repetida" | "conferir_duplicidade";`
  - `export const TEXTO_TIPO_ACHADO: Readonly<Record<TipoAchado, string>> = { validar: "Validar", revisar: "Revisar", ja_outro_grupo: "Já no Contatos: outro grupo", ja_grupo_escolhido: "Já no Contatos: grupo escolhido", endereco_novo: "Endereço novo para contato já cadastrado", endereco_diferente: "Endereço diferente do cadastrado", repetida: "Repetida na lista", conferir_duplicidade: "Conferir duplicidade" };`
  - `export interface Achado { linha: number; nome: string; tipo: TipoAchado; campo: CampoModelo | "—"; valorRecebido: string; sugestao: string; motivo: string }`
  - `export interface Ocorrencia { id: string; grupo: string }`
  - `export interface LinhaTratada { linha: number; situacao: Situacao; recebido: Valores; gravado: Valores; camposAlterados: CampoModelo[]; regras: string[]; marcas: Marca[]; achados: Achado[]; trechoQueNaoCoube: string; ocorrencias: Ocorrencia[]; conferirDuplicidade: Ocorrencia[]; referencia: string; repeteLinha?: number; entraNoArquivo: boolean }`
  - `export interface Rodada { grupo: string; linhas: LinhaTratada[]; contagens: { linhas: number; novos: number; novosAlterados: number; novosValidar: number; novosRevisar: number; jaGrupoEscolhido: number; jaOutroGrupo: number; repetidas: number; semProtocolo: number; enderecoNovo: number } }`
  - `export interface MetaRodada { listaNome: string; primeiraLinha: number; ultimaLinha: number; baseNome: string; enderecosNome: string; referencias: string[]; geradoEm: string; origem: string }` (`geradoEm` já formatado "DD/MM/AAAA HH:MM"; `origem` é o texto do comando ou "tela")
- Produces (`limites.ts`): `export const LIMITES: Readonly<Record<CampoModelo, number | undefined>>` com NOME 50, LOGRADOURO 50, NUMERO `LIMITE_NUMERO` (importado de `@/lib/endereco`), COMPLEMENTO 30, BAIRRO 30, CIDADE 30, UF 2, CEP 8, TRATAMENTO/ENDERECAMENTO/CARGO `undefined`; `export const UFS: ReadonlySet<string>` com as 27 siglas.
- Produces (`rodada-nomes.ts`):
  - `export function sufixoDaData(d: Date): string` → `"08NOV2026"` (meses JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ, dia com dois dígitos, data local)
  - `export function grupoNoNomeDeArquivo(grupo: string): string` → sem acento (NFD sem marcas), caracteres `\ / : * ? " < > |` viram espaço, espaços colapsados, cortado em 40 e aparado
  - `export function nomeImportacao(grupo: string, sufixo: string): string` → `` `Importacao PRODASEN - ${grupoNoNomeDeArquivo(grupo)} - ${sufixo}.xlsx` ``
  - `export function nomeConferencia(sufixo: string): string` → `` `Conferencia - Lista de Convidados - ${sufixo}.xlsx` ``
  - `export function nomeDaPastaDaRodada(sufixo: string, existentes: readonly string[]): string` → `sufixo` se não existe; senão `${sufixo}-2`, `-3`… o primeiro livre
  - `export function dataNoNomeDaBase(nomeArquivo: string): number | undefined` → timestamp de `"DD MMM AAAA"` com `" HHh"` opcional ("BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx" → 05/11/2026 15:00; sem hora, 00:00); `undefined` quando não casa
  - `export function maisRecente(nomes: readonly string[], prefixo: string): string | undefined` → entre os nomes que começam com `prefixo` (sem caixa) e têm data, o de maior `dataNoNomeDaBase`

- [ ] **Step 1: Instalar as dependências**

Run: `npm install exceljs@4.4.0 && npm install -D tsx@4`
Expected: `package.json` com `exceljs` em dependencies e `tsx` em devDependencies; `package-lock.json` atualizado; sem `pnpm-lock.yaml` novo.

- [ ] **Step 2: Acrescentar o script `convidados` em `package.json`**

`"convidados": "tsx scripts/convidados.ts"` depois de `"typecheck"`.

- [ ] **Step 3: Escrever os testes de `rodada-nomes`**

```ts
// tests/convidados-saida.test.ts
import { describe, expect, test } from "vitest";
import { dataNoNomeDaBase, grupoNoNomeDeArquivo, maisRecente, nomeDaPastaDaRodada, nomeImportacao, sufixoDaData } from "@/lib/convidados/rodada-nomes";

describe("nomes da rodada", () => {
  test("sufixo da data no formato DDMMMAAAA", () => {
    expect(sufixoDaData(new Date(2026, 10, 8))).toBe("08NOV2026");
    expect(sufixoDaData(new Date(2027, 0, 5))).toBe("05JAN2027");
  });
  test("grupo no nome do arquivo sai sem acento, sem caracteres proibidos e com 40 caracteres", () => {
    expect(grupoNoNomeDeArquivo("Convidados da Presidência / Posse: 2027")).toBe("Convidados da Presidencia Posse 2027");
    expect(grupoNoNomeDeArquivo("Delegações estrangeiras e organismos intern - 2027")).toHaveLength(40);
    expect(nomeImportacao("Ministros do STF", "08NOV2026")).toBe("Importacao PRODASEN - Ministros do STF - 08NOV2026.xlsx");
  });
  test("segunda rodada no dia ganha sufixo -2 e nunca sobrescreve", () => {
    expect(nomeDaPastaDaRodada("08NOV2026", [])).toBe("08NOV2026");
    expect(nomeDaPastaDaRodada("08NOV2026", ["08NOV2026"])).toBe("08NOV2026-2");
    expect(nomeDaPastaDaRodada("08NOV2026", ["08NOV2026", "08NOV2026-2"])).toBe("08NOV2026-3");
  });
  test("base mais recente pela data do nome, com hora opcional", () => {
    const nomes = ["BASE GRUPOS POSSE - 27 OUT 2026.xlsx", "BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx", "BASE GRUPOS POSSE - 04 NOV 2026.xlsx", "BASE ENDERECO - 05 NOV 2026 15h.xlsx", "lixo.xlsx"];
    expect(maisRecente(nomes, "BASE GRUPOS POSSE")).toBe("BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx");
    expect(maisRecente(nomes, "BASE ENDERECO")).toBe("BASE ENDERECO - 05 NOV 2026 15h.xlsx");
    expect(dataNoNomeDaBase("lixo.xlsx")).toBeUndefined();
    expect(maisRecente(["lixo.xlsx"], "BASE GRUPOS POSSE")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npx vitest run tests/convidados-saida.test.ts`
Expected: FAIL, módulo `@/lib/convidados/rodada-nomes` não encontrado.

- [ ] **Step 5: Criar `tipos.ts`, `limites.ts` e `rodada-nomes.ts`** com as assinaturas do bloco Interfaces.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/convidados-saida.test.ts && npm run typecheck`
Expected: PASS; typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/convidados/tipos.ts lib/convidados/limites.ts lib/convidados/rodada-nomes.ts tests/convidados-saida.test.ts
git commit -m "feat(convidados): tipos, limites e nomes da rodada; exceljs e tsx"
```

---

### Task 2: Leitura da lista Padrão

**Files:**
- Create: `lib/convidados/lista.ts`, `tests/fixtures/convidados/montar.ts`
- Test: `tests/convidados-lista.test.ts`

**Interfaces:**
- Consumes: `LinhaLista`, `Valores`, `CAMPOS_MODELO` (Tarefa 1); `ColunaFaltanteError` de `@/lib/planilha`; `normalizarTexto` de `@/lib/normalize`.
- Produces (`lista.ts`): `export function lerListaPadrao(buffer: ArrayBuffer): LinhaLista[]`.
  - Colunas reconhecidas pelo cabeçalho normalizado (`normalizarTexto`): `nome completo do convidado/ nome politico` casa por **prefixo** `"nome completo"`; as demais por igualdade: `orgao`, `cargo do convidado`, `cep`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `tratamento`, `enderecamento`.
  - Cabeçalho achado pelo conteúdo: percorre as abas na ordem e, em cada uma, as 30 primeiras linhas (`sheet_to_json` com `header: 1`, `defval: ""`, `raw: false`), até achar a linha que contém uma célula começando por `"nome completo"` e outra igual a `"cep"`. Nenhuma aba casa: `ColunaFaltanteError(["NOME COMPLETO DO CONVIDADO/ NOME POLÍTICO", "CEP"])`.
  - Obrigatórias no cabeçalho: nome, cargo, cep, logradouro, numero, complemento, bairro, cidade, uf, tratamento, enderecamento (`ColunaFaltanteError` com os rótulos em caixa alta como na lista: `"ENDERECAMENTO"`). `ÓRGÃO` ausente não é erro (`orgao` fica `""`).
  - Valores sempre `string` aparada (`raw: false` já entrega o texto exibido; `String(v).trim()` por garantia). Linha com nome vazio é pulada. `linha` = índice da linha na planilha, 1-based (cabeçalho na 8 → primeira linha de dados é 9).
- Produces (`tests/fixtures/convidados/montar.ts`):
  - `export const CABECALHO_LISTA = ["", "NOME COMPLETO DO CONVIDADO/ NOME POLÍTICO", "ÓRGÃO", "CARGO DO CONVIDADO", "CEP", "LOGRADOURO", "NÚMERO", "COMPLEMENTO", "BAIRRO", "CIDADE", "UF", "TRATAMENTO", "ENDERECAMENTO"];`
  - `export function montarListaPadrao(linhas: Partial<Valores & { orgao: string }>[], opcoes?: { linhaCabecalho?: number; aba?: string; semColunas?: string[]; cepComoNumero?: boolean }): ArrayBuffer` → `aoa_to_sheet` com `linhaCabecalho - 1` linhas vazias antes (padrão 8), aba padrão `"Lista de Convidados"`, primeira coluna com a numeração 1, 2, 3…; `semColunas` tira os rótulos indicados do cabeçalho; `cepComoNumero` grava o CEP como `Number`.
  - `export function montarBaseGrupos(contatos: { id: string; nome: string; grupo: string; cargo?: string }[]): ArrayBuffer` → colunas `Id`, `Nome`, `Grupo`, `Cargo`, `Tratamento`, `Endereçamento` (o que `lerPlanilha` precisa).
  - `export function montarBaseEnderecos(linhas: { contatoId: string; nome?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; uf?: string; cep?: string; prioritario?: boolean }[]): ArrayBuffer` → colunas `&nbsp;`, `Contato Id`, `Endereço Id`, `Nome`, `Logradouro`, `Numero`, `Complemento`, `Bairro`, `Cidade`, `UF`, `País`, `CEP`, `Prioritário` ("Sim"/"Não").
  - `export async function montarModeloProdasen(): Promise<ArrayBuffer>` → workbook `exceljs` com a aba `"Contatos"` e o `CABECALHO_PRODASEN` na linha 1 (usado na Tarefa 10).

- [ ] **Step 1: Escrever os testes**

```ts
// tests/convidados-lista.test.ts
import { describe, expect, test } from "vitest";
import { lerListaPadrao } from "@/lib/convidados/lista";
import { ColunaFaltanteError } from "@/lib/planilha";
import { montarListaPadrao } from "./fixtures/convidados/montar";

const linha = { NOME: "Ana Beatriz Exemplo Souza", orgao: "Órgão Exemplo", CARGO: "Diretora", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora" };

describe("lerListaPadrao", () => {
  test("lê a lista com o cabeçalho na linha 8 e numera a partir da 9", () => {
    const linhas = lerListaPadrao(montarListaPadrao([linha, { ...linha, NOME: "Carlos Eduardo Fictício Ramos" }]));
    expect(linhas).toHaveLength(2);
    expect(linhas[0].linha).toBe(9);
    expect(linhas[1].linha).toBe(10);
    expect(linhas[0].valores).toEqual({ NOME: "Ana Beatriz Exemplo Souza", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Diretora", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" });
    expect(linhas[0].orgao).toBe("Órgão Exemplo");
  });
  test("pula linha sem nome e apara espaços", () => {
    const linhas = lerListaPadrao(montarListaPadrao([{ ...linha, NOME: "  Ana Beatriz Exemplo Souza " }, { NOME: "", CEP: "1" }]));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].valores.NOME).toBe("Ana Beatriz Exemplo Souza");
  });
  test("CEP gravado como número volta como texto, inclusive com 7 dígitos", () => {
    const linhas = lerListaPadrao(montarListaPadrao([{ ...linha, CEP: "1310100" }], { cepComoNumero: true }));
    expect(linhas[0].valores.CEP).toBe("1310100");
    expect(typeof linhas[0].valores.CEP).toBe("string");
  });
  test("acha o cabeçalho em outra linha e em aba com outro nome", () => {
    const linhas = lerListaPadrao(montarListaPadrao([linha], { linhaCabecalho: 3, aba: "Convidados Gabinete" }));
    expect(linhas[0].linha).toBe(4);
  });
  test("coluna ENDERECAMENTO ausente é ColunaFaltanteError com o nome da coluna", () => {
    const buf = montarListaPadrao([linha], { semColunas: ["ENDERECAMENTO"] });
    expect(() => lerListaPadrao(buf)).toThrow(ColunaFaltanteError);
    expect(() => lerListaPadrao(buf)).toThrow(/ENDERECAMENTO/);
  });
  test("ÓRGÃO ausente não é erro", () => {
    const linhas = lerListaPadrao(montarListaPadrao([linha], { semColunas: ["ÓRGÃO"] }));
    expect(linhas[0].orgao).toBe("");
  });
  test("planilha sem cabeçalho reconhecível é ColunaFaltanteError", () => {
    const buf = montarListaPadrao([], { semColunas: ["NOME COMPLETO DO CONVIDADO/ NOME POLÍTICO", "CEP"] });
    expect(() => lerListaPadrao(buf)).toThrow(ColunaFaltanteError);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/convidados-lista.test.ts`
Expected: FAIL, módulos não encontrados.

- [ ] **Step 3: Criar `tests/fixtures/convidados/montar.ts` e `lib/convidados/lista.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/convidados-lista.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/convidados/lista.ts tests/fixtures/convidados/montar.ts tests/convidados-lista.test.ts
git commit -m "feat(convidados): leitura da lista Padrão pelo conteúdo do cabeçalho"
```

---

### Task 3: Abreviações e encaixe de Logradouro e Complemento

**Files:**
- Create: `lib/convidados/abreviacoes.ts`
- Test: `tests/convidados-campos.test.ts` (bloco "logradouro e complemento")

**Interfaces:**
- Consumes: `LIMITES` (Tarefa 1), `ResultadoCampo`, `Revisao`.
- Produces:
  - `export const ABREV_EXPRESSOES: readonly (readonly [string, string])[]` — as 8 do script (`Setor de Administração Federal Sul`→`SAFS`, `Setor de Autarquias Sul`→`SAS`, `Setor de Embaixadas Sul`→`SES`, `Setor Hoteleiro Sul`→`SHS`, `Setor Comercial Norte`→`SCN`, `Setor Comercial Sul`→`SCS`, `Setor Bancário Norte`→`SBN`, `Setor Bancário Sul`→`SBS`), comparadas sem caixa e sem acento.
  - `export const PASSOS_LOGRADOURO: readonly (readonly (readonly [RegExp, string])[])[]` — na ordem da spec §5.2: (1) expressões; (2) `Quadra`→`Qd`, `Conjunto`→`Cj`, `Bloco`→`Bl`, `Lote`→`Lt`; (3) `Edifício`/`Edificio`→`Ed`, `Avenida`→`Av`, `Alameda`→`Al`, `Rodovia`→`Rod`, `Travessa`→`Tv`, `Estrada`→`Estr`, `Condomínio`→`Cond`, `Residencial`→`Res`, `Gabinete`→`Gab`, `Pavimento`→`Pav`, `Parque`→`Pq`; (4) `Senado Federal`→`Senado`; (5) `Praça`→`Pç`. Sem ponto. Regex com `\b`, flag `gi`; a sigla sai em caixa alta quando a palavra original começava em maiúscula e em minúscula quando não.
  - `export const NIVEL_2_COMPLEMENTO: readonly (readonly [RegExp, string])[]` — `Sala(s)`→`Sl`, `andar(es)`→`And`, `Pavimento`→`Pav`, `Térreo`→`Ter`, `Gabinete`→`Gab`, `Apartamento`→`Apto`; depois remove ` de `, ` do `, ` da `, ` dos `, ` das ` (espaço dos dois lados, substituído por um espaço).
  - `export function abreviarAteCaber(valor: string, limite: number, passos: readonly (readonly (readonly [RegExp, string])[])[]): { valor: string; passos: string[] }` — aplica um passo por vez, só enquanto `valor.length > limite`; `passos` devolve o rótulo de cada troca feita ("Setor de Autarquias Sul = SAS", "Quadra = Qd").
  - `export function encaixarLogradouroComplemento(logradouro: string, complemento: string): { logradouro: string; complemento: string; trechoQueNaoCoube: string; regras: string[]; revisao?: Revisao }`:
    1. Logradouro ≤ 50: fica. Senão `abreviarAteCaber(..., 50, PASSOS_LOGRADOURO)`, regra `"Logradouro acima de 50: abreviado (<trocas separadas por ", ">)"`.
    2. Se o Logradouro ainda passa de 50, o excedente **por segmentos** (separadores `,` ou ` - `) sai do fim do Logradouro para o início do Complemento, regra `"Logradouro: trecho movido para o Complemento"`; sem segmento que caiba, nada é cortado e a linha é REVISAR `"Logradouro acima de 50 mesmo abreviado"`.
    3. Complemento: pedaço de andar (`/\d+\s*[ºo°]?\s*(andar|pav(imento)?)|t[ée]rreo/i`) nunca vai ao Logradouro. Complemento ≤ 30: fica. Senão nível 1 (`PASSOS_LOGRADOURO`), regra `"Complemento abreviado (nível 1: …)"`; se ainda passa, `NIVEL_2_COMPLEMENTO`, regra `"Complemento abreviado (nível 2: …)"`.
    4. Ainda acima de 30: segmentos saem do Complemento para `trechoQueNaoCoube` (na ordem original, separados por `", "`) até caber, pela prioridade de descarte portada do script: (a) segmento sem dígito e sem palavra de entrega (`sala`, `sl`, `gab`, `gabinete`, `apto`, `apartamento`, `loja`, `casa`, `cs`, `lote`, `lt`, `bloco`, `bl`, `torre`, `ala`, `anexo`, `cobertura`, `conjunto`, `cj`); (b) segmento de andar (`andar`, `and`, `pav`, `pavimento`, `térreo`, `ter`, `subsolo`, `piso`); (c) segmento de prédio (`ed`, `edifício`, `cond`, `condomínio`, `res`, `residencial`, `palácio`, `parque`, `pq`, `centro`); (d) do início. `revisao = { marca: "revisar", texto: "Complemento acima de 30: trecho não coube" }`. O segmento vai ao trecho na forma em que estava ao ser removido (já abreviado). Nada é descartado sem aparecer nessa coluna.
    - `export function classeDoSegmento(segmento: string): 0 | 1 | 2 | 3` (0 = localiza a entrega ou tem dígito, 1 = andar, 2 = prédio, 3 = outros) é exportada para teste.
    - Espaços dobrados e vírgulas duplas colapsados no resultado.

- [ ] **Step 1: Escrever os testes**

```ts
// tests/convidados-campos.test.ts (início do arquivo; os blocos seguintes vêm nas Tarefas 4 a 7)
import { describe, expect, test } from "vitest";
import { abreviarAteCaber, classeDoSegmento, encaixarLogradouroComplemento, PASSOS_LOGRADOURO } from "@/lib/convidados/abreviacoes";

describe("logradouro e complemento", () => {
  test("logradouro de 71 caracteres do DF cabe em 50 só com o primeiro passo que basta", () => {
    const r = encaixarLogradouroComplemento("Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação", "5º andar, Sala 512");
    expect(r.logradouro).toBe("SAS Quadra 3 Bloco C Edifício Sede da Associação");
    expect(r.logradouro.length).toBeLessThanOrEqual(50);
    expect(r.regras).toEqual(["Logradouro acima de 50: abreviado (Setor de Autarquias Sul = SAS)"]);
    expect(r.complemento).toBe("5º andar, Sala 512");
    expect(r.revisao).toBeUndefined();
  });
  test("quando o primeiro passo não basta, os seguintes entram na ordem", () => {
    const r = encaixarLogradouroComplemento("Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação Exemplo", "");
    expect(r.logradouro).toBe("SAS Qd 3 Bl C Edifício Sede da Associação Exemplo");
    expect(r.regras).toEqual(["Logradouro acima de 50: abreviado (Setor de Autarquias Sul = SAS, Quadra = Qd, Bloco = Bl)"]);
  });
  test("não abrevia o que já cabe", () => {
    const r = encaixarLogradouroComplemento("Avenida das Nações", "Sala 301");
    expect(r).toMatchObject({ logradouro: "Avenida das Nações", complemento: "Sala 301", trechoQueNaoCoube: "", regras: [] });
  });
  test("abreviarAteCaber para no passo em que coube e respeita a caixa", () => {
    expect(abreviarAteCaber("Quadra 5 Conjunto B", 10, PASSOS_LOGRADOURO)).toEqual({ valor: "Qd 5 Cj B", passos: ["Quadra = Qd", "Conjunto = Cj"] });
    expect(abreviarAteCaber("quadra 5", 4, PASSOS_LOGRADOURO).valor).toBe("qd 5");
  });
  test("complemento acima de 30 usa nível 1 e, se não bastar, nível 2 sem preposições", () => {
    const r = encaixarLogradouroComplemento("Esplanada dos Ministérios Bloco A", "Edifício Anexo, 5º andar, Sala 512 do Gabinete");
    expect(r.complemento.length).toBeLessThanOrEqual(30);
    expect(r.complemento).toBe("Ed Anexo, 5º And, Sl 512 Gab");
    expect(r.regras.some((x) => x.startsWith("Complemento abreviado (nível 2"))).toBe(true);
    expect(r.trechoQueNaoCoube).toBe("");
  });
  test("o que não cabe no Complemento vai para o trecho que não coube, o menos essencial primeiro, e é REVISAR", () => {
    const r = encaixarLogradouroComplemento("Rua Exemplo", "Condomínio Residencial das Palmeiras Imperiais, Torre Norte, Bloco B, Apartamento 1204");
    expect(r.complemento).toBe("Torre Norte, Bl B, Apto 1204");
    expect(r.trechoQueNaoCoube).toBe("Cond Res Palmeiras Imperiais");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Complemento acima de 30: trecho não coube" });
    expect(classeDoSegmento("Sala 512")).toBe(0);
    expect(classeDoSegmento("2º And")).toBe(1);
    expect(classeDoSegmento("Ed Sede")).toBe(2);
    expect(classeDoSegmento("Portaria Norte")).toBe(3);
  });
  test("excedente do logradouro vai ao início do Complemento e andar nunca sobe ao Logradouro", () => {
    const r = encaixarLogradouroComplemento("Rodovia Exemplo Longa Demais Para Caber Quilômetro 12, Galpão 7, Portaria Norte", "2º andar");
    expect(r.logradouro.length).toBeLessThanOrEqual(50);
    expect(r.complemento.startsWith("Galpão 7") || r.complemento.startsWith("Portaria Norte")).toBe(true);
    expect(r.logradouro).not.toMatch(/andar/i);
    expect(r.regras).toContain("Logradouro: trecho movido para o Complemento");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/convidados-campos.test.ts`
Expected: FAIL.

- [ ] **Step 3: Criar `lib/convidados/abreviacoes.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/convidados-campos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/convidados/abreviacoes.ts tests/convidados-campos.test.ts
git commit -m "feat(convidados): abreviações dos Correios e encaixe de Logradouro e Complemento"
```

---

### Task 4: Número

**Files:**
- Create: `lib/convidados/numero.ts`
- Test: `tests/convidados-campos.test.ts` (bloco "número")

**Interfaces:**
- Consumes: `LIMITES.NUMERO` (= `LIMITE_NUMERO`, 6), `Revisao`, `normalizarTexto`.
- Produces:
  - `export function ehEnderecoDoDf(uf: string, cidade: string): boolean` → `uf.trim().toUpperCase() === "DF"` ou (`uf` vazia e `normalizarTexto(cidade)` em `"brasilia"`, `"bsb"`).
  - `export const MARCAS_DE_LOTE: Readonly<Record<string, string>> = { lote: "Lt", lotes: "Lt", lt: "Lt", casa: "Cs", cs: "Cs", chacara: "Ch", ch: "Ch", bloco: "Bl", bl: "Bl" }` (chaves comparadas por `normalizarTexto` do token sem ponto).
  - `export function abreviarLote(trecho: string): string` → cada token que é chave de `MARCAS_DE_LOTE` vira a sigla; `"Lote 12 Casa 3"` → `"Lt 12 Cs 3"`; `"Lotes 1, 2"` → `"Lt 1, 2"`; espaços colapsados.
  - `export function tratarNumero(entrada: { numero: string; logradouro: string; complemento: string; uf: string; cidade: string }): { numero: string; logradouro: string; complemento: string; regras: string[]; revisao?: Revisao }`, nesta ordem:
    1. `numero` aparado, ≤ 6 e não vazio: fica, sem regra.
    2. `numero` > 6 **com** marca de lote (token inicial em `MARCAS_DE_LOTE`): `numero = "S/N"`, `complemento = abreviarLote(numero) + (complemento ? ", " + complemento : "")`, regra `"Número acima de 6 com lote/casa: Número = S/N e o trecho vai ao Complemento (regra A dos Correios)"`; se o Complemento resultante passa de 30, `revisao = { marca: "revisar", texto: "Complemento acima de 30 depois da regra A" }` (o valor fica assim mesmo; a Tarefa 3 não roda de novo).
    3. `numero` > 6 sem marca: fica como veio, `revisao = { marca: "revisar", texto: "Número acima de 6 caracteres sem lote/casa/bloco" }`.
    4. `numero` vazio e endereço do DF: `"S/N"`, regra `"Número vazio em endereço do DF = S/N"`. Se o Logradouro contém `/\b(lotes?|casa|ch[aá]cara)\s+[\w/.-]+/i`, o trecho casado sai do Logradouro (vírgulas e espaços sobrando colapsados) e vai ao Complemento abreviado, mesma montagem do item 2, regra `"Lote/Casa/Chácara do Logradouro levado ao Complemento (regra A dos Correios)"`.
    5. `numero` vazio fora do DF: se `normalizarTexto(logradouro)` contém `"s/n"` ou `"sem numero"`, `"S/N"`, regra `"Número vazio: logradouro indica S/N"`; senão fica vazio com `revisao = { marca: "revisar", texto: "Número não informado" }`.

- [ ] **Step 1: Escrever os testes**

```ts
import { abreviarLote, ehEnderecoDoDf, tratarNumero } from "@/lib/convidados/numero";

describe("número", () => {
  const base = { logradouro: "Rua Exemplo", complemento: "", uf: "DF", cidade: "Brasília" };
  test("número curto fica como veio", () => {
    expect(tratarNumero({ ...base, numero: "120" })).toMatchObject({ numero: "120", regras: [] });
  });
  test("Lote 12 Casa 3 no Número: S/N e Lt 12 Cs 3 no Complemento (regra A)", () => {
    const r = tratarNumero({ ...base, numero: "Lote 12 Casa 3" });
    expect(r.numero).toBe("S/N");
    expect(r.complemento).toBe("Lt 12 Cs 3");
    expect(r.regras[0]).toMatch(/regra A/);
    expect(r.revisao).toBeUndefined();
  });
  test("regra A preserva o Complemento que já existia", () => {
    expect(tratarNumero({ ...base, numero: "Bloco 4", complemento: "Sala 2" }).complemento).toBe("Bl 4, Sala 2");
  });
  test("acima de 6 sem marca conhecida é REVISAR, valor mantido", () => {
    const r = tratarNumero({ ...base, numero: "1234567" });
    expect(r.numero).toBe("1234567");
    expect(r.revisao?.marca).toBe("revisar");
  });
  test("vazio no DF vira S/N; vazio em Brasília sem UF também", () => {
    expect(tratarNumero({ ...base, numero: "" }).numero).toBe("S/N");
    expect(tratarNumero({ ...base, numero: "", uf: "" }).numero).toBe("S/N");
    expect(ehEnderecoDoDf("", "BSB")).toBe(true);
    expect(ehEnderecoDoDf("GO", "Brasília")).toBe(false);
  });
  test("vazio no DF com Lote 12 no Logradouro: lote vai ao Complemento e sai do Logradouro", () => {
    const r = tratarNumero({ ...base, numero: "", logradouro: "Quadra 5 Conjunto B Lote 12" });
    expect(r).toMatchObject({ numero: "S/N", logradouro: "Quadra 5 Conjunto B", complemento: "Lt 12" });
  });
  test("vazio fora do DF: S/N só com indicação no logradouro, senão REVISAR", () => {
    expect(tratarNumero({ ...base, numero: "", uf: "MG", cidade: "Belo Horizonte", logradouro: "Rua Exemplo, s/n" }).numero).toBe("S/N");
    const r = tratarNumero({ ...base, numero: "", uf: "MG", cidade: "Belo Horizonte" });
    expect(r.numero).toBe("");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "Número não informado" });
  });
  test("abreviarLote cobre lote, casa, chácara e bloco", () => {
    expect(abreviarLote("Chácara 7 Bloco B")).toBe("Ch 7 Bl B");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run tests/convidados-campos.test.ts` → FAIL.
- [ ] **Step 3: Criar `lib/convidados/numero.ts`**
- [ ] **Step 4: Rodar e ver passar** — PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/convidados/numero.ts tests/convidados-campos.test.ts
git commit -m "feat(convidados): número com S/N e regra A dos Correios"
```

---

### Task 5: CEP, Bairro, Cidade e UF

**Files:**
- Create: `lib/convidados/cep.ts`, `lib/convidados/bairro-cidade-uf.ts`
- Test: `tests/convidados-campos.test.ts` (blocos "cep" e "bairro, cidade e uf")

**Interfaces:**
- Produces (`cep.ts`):
  - `export const FAIXAS_CEP: readonly (readonly [string, number, number])[]` — as 30 faixas do script (`["SP", 1000, 19999]`, …, `["RS", 90000, 99999]`), prefixo de 5 dígitos.
  - `export function ufDoCep(cep: string): string | undefined` — só para 8 dígitos.
  - `export function tratarCep(cep: string, uf: string): ResultadoCampo`:
    1. Remove `.`, `-` e espaços (se mudou e o resto é só dígito: regra `"CEP: pontuação removida"`, marca alterado).
    2. 8 dígitos: fica; se `ufDoCep` existe, `uf` tem 2 letras e são diferentes: `revisao = { marca: "revisar", texto: "CEP fora da faixa da UF <UF> (faixa do CEP: <UF do CEP>)" }`, valor mantido.
    3. 7 dígitos e `uf === "SP"`: zero à esquerda, regra `"CEP com 7 dígitos em SP: zero à esquerda (<novo>)"`, `revisao = { marca: "validar", texto: "CEP completado por inferência; confirmar nos Correios", sugestao: <novo> }`. 7 dígitos em outra UF: valor como veio, `revisao = { marca: "revisar", texto: "CEP com 7 dígitos fora de SP" }`.
    4. Vazio: `revisao = { marca: "revisar", texto: "CEP vazio" }`. Qualquer outra coisa (letras, tamanho errado): valor como veio, `revisao = { marca: "revisar", texto: "CEP inválido (<valor>)" }`.
- Produces (`bairro-cidade-uf.ts`):
  - `export const DE_PARA_BAIRRO: Readonly<Record<string, string>>` — as 6 entradas do script, chave comparada por `normalizarTexto`.
  - `export const BAIRROS_CANONICOS: Readonly<Record<string, string>>` — `"zona civico-administrativa"`, `"zona civico administrativa"`, `"zona civico administrativo"`, `"zona civico-administrativo"` → `"Zona Cívico-Administrativa"`; `"asa sul"`, `"asa norte"`, `"lago sul"`, `"lago norte"`, `"setor militar urbano"` → forma com iniciais maiúsculas.
  - `export function tratarBairro(bairro: string): ResultadoCampo` — ordem: de-para (regra `"Bairro abreviado (de-para dos Correios)"`), canônico se o texto difere (regra `"Bairro padronizado (<antes> → <depois>)"`), acima de 30 → `abreviarAteCaber(..., 30, PASSOS_LOGRADOURO)` (regra `"Bairro acima de 30: abreviado (…)"`) e, se ainda passa, `revisao` revisar `"Bairro acima de 30 caracteres"`; vazio → revisar `"Bairro vazio"`.
  - `export function tratarCidade(cidade: string): ResultadoCampo` — `normalizarTexto` em `"brasilia"`, `"brasila"`, `"bsb"` e texto ≠ `"Brasília"` → `"Brasília"`, regra `"Cidade padronizada (<antes> → Brasília)"`; vazio → revisar `"Cidade vazia"`; acima de 30 → revisar `"Cidade acima de 30 caracteres"`.
  - `export function tratarUf(uf: string): ResultadoCampo` — aparada e em caixa alta (regra `"UF em caixa alta"` se mudou a caixa); vazia → revisar `"UF vazia"`; fora de `UFS` → revisar `"UF inexistente (<valor>)"`, valor como veio.

- [ ] **Step 1: Escrever os testes**

```ts
import { tratarCep, ufDoCep } from "@/lib/convidados/cep";
import { tratarBairro, tratarCidade, tratarUf } from "@/lib/convidados/bairro-cidade-uf";

describe("cep", () => {
  test("7 dígitos em SP ganha zero à esquerda e VALIDAR; em RJ é REVISAR com o valor mantido", () => {
    expect(tratarCep("1310100", "SP")).toEqual({ valor: "01310100", regras: ["CEP com 7 dígitos em SP: zero à esquerda (01310100)"], revisao: { marca: "validar", texto: "CEP completado por inferência; confirmar nos Correios", sugestao: "01310100" } });
    const rj = tratarCep("1310100", "RJ");
    expect(rj.valor).toBe("1310100");
    expect(rj.revisao?.marca).toBe("revisar");
  });
  test("pontuação sai; letras e vazio são REVISAR", () => {
    expect(tratarCep("70.165-900", "DF")).toMatchObject({ valor: "70165900", regras: ["CEP: pontuação removida"] });
    expect(tratarCep("ABC12345", "DF")).toMatchObject({ valor: "ABC12345", revisao: { marca: "revisar", texto: "CEP inválido (ABC12345)" } });
    expect(tratarCep("", "DF").revisao?.texto).toBe("CEP vazio");
  });
  test("faixa incompatível com a UF só avisa", () => {
    expect(ufDoCep("70165900")).toBe("DF");
    const r = tratarCep("70165900", "SP");
    expect(r.valor).toBe("70165900");
    expect(r.revisao).toEqual({ marca: "revisar", texto: "CEP fora da faixa da UF SP (faixa do CEP: DF)" });
    expect(tratarCep("70165900", "DF").revisao).toBeUndefined();
  });
});

describe("bairro, cidade e uf", () => {
  test("bairro: de-para, canônico, limite e vazio", () => {
    expect(tratarBairro("Setor de Administração Federal Sul").valor).toBe("Setor de Adm. Federal Sul");
    expect(tratarBairro("zona civico administrativa")).toMatchObject({ valor: "Zona Cívico-Administrativa", regras: ["Bairro padronizado (zona civico administrativa → Zona Cívico-Administrativa)"] });
    expect(tratarBairro("Asa Sul")).toEqual({ valor: "Asa Sul", regras: [] });
    expect(tratarBairro("").revisao?.texto).toBe("Bairro vazio");
    const longo = tratarBairro("Residencial Exemplo das Palmeiras Imperiais Norte");
    expect(longo.valor.length).toBeLessThanOrEqual(30);
  });
  test("cidade: Brasília padronizada, vazia é REVISAR", () => {
    expect(tratarCidade("brasilia").valor).toBe("Brasília");
    expect(tratarCidade("Brasília")).toEqual({ valor: "Brasília", regras: [] });
    expect(tratarCidade("").revisao?.texto).toBe("Cidade vazia");
  });
  test("uf: caixa alta, inexistente e vazia", () => {
    expect(tratarUf("df")).toMatchObject({ valor: "DF", regras: ["UF em caixa alta"] });
    expect(tratarUf("BR")).toMatchObject({ valor: "BR", revisao: { marca: "revisar", texto: "UF inexistente (BR)" } });
    expect(tratarUf("").revisao?.texto).toBe("UF vazia");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Criar `cep.ts` e `bairro-cidade-uf.ts`**
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/convidados/cep.ts lib/convidados/bairro-cidade-uf.ts tests/convidados-campos.test.ts
git commit -m "feat(convidados): CEP por faixa de UF; bairro, cidade e UF"
```

---

### Task 6: Nome

**Files:**
- Create: `lib/convidados/nome.ts`
- Test: `tests/convidados-campos.test.ts` (bloco "nome")

**Interfaces:**
- Consumes: `LIMITES.NOME` (50), `chaveToken` de `@/lib/normalize` (para comparar o título sem ponto e sem acento).
- Produces:
  - `export const TITULOS: readonly string[] = ["dr", "dra", "exmo", "exma", "sr", "sra", "se sr", "se sra"]` — comparados pelo `chaveToken` de cada token (então "S.E. Sra." casa `"se sra"`). **Não** usa `removerTratamentos`: patente e cargo ficam no nome.
  - `export const CONECTIVOS: ReadonlySet<string> = new Set(["de", "da", "do", "das", "dos", "e"])`.
  - `export const ABREV_PATENTES: readonly (readonly [string, string])[]` — as 11 do script (`General de Exército`→`Gen Ex` … `Coronel`→`Cel`), prefixo comparado por `normalizarTexto`.
  - `export function semTitulo(nome: string): { valor: string; removido?: string }` — remove só o primeiro título (uma ou duas palavras) do início.
  - `export function ehCaixaAlta(nome: string): boolean` — tem letra e `nome === nome.toLocaleUpperCase("pt-BR")`.
  - `export function comIniciaisMaiusculas(nome: string): string` — cada palavra: primeira letra maiúscula, resto minúsculo; conectivos em minúsculas exceto na primeira palavra; parte depois de hífen e apóstrofo também capitalizada ("D'ÁVILA" → "D'Ávila").
  - `export function sugestaoNomeCurto(nome: string): string` — primeiro: se começa com patente de `ABREV_PATENTES`, troca pela sigla; se ainda passa de 50, mantém o primeiro token e os dois últimos tokens não conectivos, mais o conectivo imediatamente anterior ao penúltimo quando houver ("Maria Auxiliadora da Conceição Exemplo de Almeida Prado" → "Maria de Almeida Prado"). Devolve `"<nome curto> (<n>)"` com a contagem.
  - `export function tratarNome(nome: string): ResultadoCampo` — ordem: espaços colapsados e aparados (regra `"Nome: espaços normalizados"`), `semTitulo` (regra `"Nome: título removido (<removido>)"`), `ehCaixaAlta` → `comIniciaisMaiusculas` (regra `"Nome em caixa alta convertido; conferir a grafia"`); acima de 50: valor **mantido**, `revisao = { marca: "revisar", texto: "Nome com <n> caracteres (limite 50). A ferramenta não corta nome sozinha.", sugestao: sugestaoNomeCurto(valor) }`.

- [ ] **Step 1: Escrever os testes**

```ts
import { comIniciaisMaiusculas, semTitulo, sugestaoNomeCurto, tratarNome } from "@/lib/convidados/nome";

describe("nome", () => {
  test("título sai, patente e cargo ficam", () => {
    expect(semTitulo("Dr. Carlos Eduardo Fictício Ramos")).toEqual({ valor: "Carlos Eduardo Fictício Ramos", removido: "Dr." });
    expect(semTitulo("S.E. Sra. Ana Beatriz Exemplo Souza").valor).toBe("Ana Beatriz Exemplo Souza");
    expect(semTitulo("General de Exército Roberto Hipotético Lima").valor).toBe("General de Exército Roberto Hipotético Lima");
    expect(semTitulo("Senador Paulo Amostra Teixeira").valor).toBe("Senador Paulo Amostra Teixeira");
  });
  test("caixa alta integral vira iniciais maiúsculas com conectivos minúsculos", () => {
    expect(comIniciaisMaiusculas("MARIA DA CONCEIÇÃO D'ÁVILA E SOUZA-LIMA")).toBe("Maria da Conceição D'Ávila e Souza-Lima");
    const r = tratarNome("ANA BEATRIZ EXEMPLO SOUZA");
    expect(r.valor).toBe("Ana Beatriz Exemplo Souza");
    expect(r.regras).toContain("Nome em caixa alta convertido; conferir a grafia");
    expect(tratarNome("Ana Beatriz Exemplo Souza")).toEqual({ valor: "Ana Beatriz Exemplo Souza", regras: [] });
  });
  test("nome de 59 caracteres é REVISAR com sugestão e contagem, valor mantido", () => {
    const nome = "Maria Auxiliadora da Conceição Exemplo de Almeida Prado";
    const r = tratarNome(nome);
    expect(r.valor).toBe(nome);
    expect(r.revisao?.marca).toBe("revisar");
    expect(r.revisao?.texto).toBe("Nome com 55 caracteres (limite 50). A ferramenta não corta nome sozinha.");
    expect(r.revisao?.sugestao).toBe("Maria de Almeida Prado (22)");
  });
  test("patente abreviada entra primeiro na sugestão", () => {
    expect(sugestaoNomeCurto("General de Exército Roberto Hipotético de Lima Exemplo Longo")).toBe("Gen Ex Roberto Hipotético de Lima Exemplo Longo (47)");
  });
});
```

(O nome do teste de 59 caracteres do exemplo aprovado tem, contados, 55; a asserção usa a contagem real.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Criar `lib/convidados/nome.ts`**
- [ ] **Step 4: Rodar e ver passar** → PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/convidados/nome.ts tests/convidados-campos.test.ts
git commit -m "feat(convidados): nome sem título, caixa alta convertida e sugestão acima de 50"
```

---

### Task 7: Protocolo (Tratamento e Endereçamento pela tabela)

**Files:**
- Modify: `lib/tratamento.ts` (só acrescentar `export` em `function alternativasDaLinha`, linha ~330; corpo intacto)
- Create: `lib/convidados/protocolo.ts`
- Test: `tests/convidados-campos.test.ts` (bloco "protocolo")

**Interfaces:**
- Consumes de `@/lib/tratamento`: `resolverRegra(cargo, regras, excecoes)`, `linhaDeEnderecamento`, `formaNominal`, `expandirFormas`, `alternativasDaLinha` (recém-exportada), `contatoEhFeminino`, `comparacoesCoerencia`, `rotuloAchado`; `REGRAS_TRATAMENTO` de `@/data/tratamentos`; `normalizarTexto`; `Achado` (Tarefa 1).
- Produces:
  - `export const EXCECOES_CONVIDADOS: Readonly<Record<string, string>> = { "deputado federal": "Senador / Deputado Federal (sem cargo)" }` (chave como `resolverRegra` produz: normalizada e no masculino, então "Deputada Federal" também cai aqui).
  - `export function formaNoGenero(padrao: string, feminino: boolean): string` — para exibir a sugestão: `"X (Y)"` no fim da linha escolhe Y se feminino, X se não; `o(a)` → `a`/`o`; `palavra(a)` → `palavraa` com a regra de `porGenero` (termina em "o" troca por "a"; senão acrescenta "a") se feminino, `palavra` se não; `" / "` fica a primeira alternativa. Exemplos: `("A Sua Excelência o(a) Senhor(a)", true)` → `"A Sua Excelência a Senhora"`; `("Senhor(a)", false)` → `"Senhor"`; `("Excelentíssimo(a) Senhor(a)", true)` → `"Excelentíssima Senhora"`; `("Ao Senhor (À Senhora)", true)` → `"À Senhora"`.
  - `export function conferirProtocolo(entrada: { linha: number; nome: string; cargo: string; tratamento: string; enderecamento: string }): Achado[]`:
    - Monta `contato: ContatoPlanilha = { nome, grupo: "", cargo: cargo || undefined, tratamento, enderecamento }`.
    - `regra = resolverRegra(cargo, REGRAS_TRATAMENTO, EXCECOES_CONVIDADOS)`; sem regra, ou `linhaDeEnderecamento(regra.enderecamento)` vazia: nenhum achado de tabela.
    - Tratamento: `padrao = formaNominal(linha)`; `aceitas = expandirFormas(padrao, contato)`; se `aceitas.length > 0` e não inclui `normalizarTexto(tratamento)`: achado `{ tipo: "revisar", campo: "TRATAMENTO", valorRecebido: tratamento, sugestao: formaNoGenero(padrao, contatoEhFeminino(contato)), motivo: "Tabela de tratamentos v02 para '<cargo>'. Valor recebido mantido no arquivo." }`.
    - Endereçamento: `padrao = alternativasDaLinha(linha).join("\nou\n")`, mesma comparação, `campo: "ENDERECAMENTO"`, sugestão `formaNoGenero(linha, feminino)`.
    - Coerência: cada `ComparacaoCampo` de `comparacoesCoerencia(contato)` com `achado` em `genero_tratamento_enderecamento`, `genero_cargo_tratamento` ou `forma_generica` vira achado `{ tipo: "revisar", campo: campo em caixa alta, valorRecebido, sugestao: "", motivo: rotuloAchado(achado) }`; `campo_vazio` não entra aqui (é a situação `sem_protocolo`, Tarefa 9). **No máximo um achado por campo**: se o campo já tem achado de tabela, ou já recebeu um de coerência, o seguinte do mesmo campo não entra.

- [ ] **Step 1: Escrever os testes**

```ts
import { conferirProtocolo, formaNoGenero } from "@/lib/convidados/protocolo";

describe("protocolo", () => {
  const base = { linha: 16, nome: "Luciana Protótipo Andrade" };
  test("senadora com tratamento masculino e excelentíssimo: REVISAR nos dois campos com a forma v02 no feminino", () => {
    const achados = conferirProtocolo({ ...base, cargo: "Senadora", tratamento: "Excelentíssimo Senhor", enderecamento: "A Sua Excelência o Senhor" });
    expect(achados.map((a) => [a.campo, a.sugestao])).toEqual([["TRATAMENTO", "Senhora"], ["ENDERECAMENTO", "A Sua Excelência a Senhora"]]);
    expect(achados[0]).toMatchObject({ linha: 16, tipo: "revisar", valorRecebido: "Excelentíssimo Senhor" });
    expect(achados[0].motivo).toMatch(/Tabela de tratamentos v02 para 'Senadora'/);
  });
  test("deputado federal com Senhor e A Sua Excelência o Senhor: nada a revisar (exceção local resolve o empate)", () => {
    expect(conferirProtocolo({ ...base, cargo: "Deputado Federal", tratamento: "Senhor", enderecamento: "A Sua Excelência o Senhor" })).toEqual([]);
    expect(conferirProtocolo({ ...base, cargo: "Deputada Federal", tratamento: "Senhora", enderecamento: "A Sua Excelência a Senhora" })).toEqual([]);
  });
  test("cargo sem regra ou vazio: nenhum achado de tabela", () => {
    expect(conferirProtocolo({ ...base, cargo: "Presidente da Associação Exemplo", tratamento: "Senhor", enderecamento: "Ao Senhor" })).toEqual([]);
    expect(conferirProtocolo({ ...base, cargo: "", tratamento: "Senhora", enderecamento: "À Senhora" })).toEqual([]);
  });
  test("incoerência de gênero sem regra na tabela é apontada", () => {
    const achados = conferirProtocolo({ ...base, cargo: "Diretora Exemplo", tratamento: "Senhor", enderecamento: "À Senhora" });
    expect(achados).toHaveLength(1);
    expect(achados[0]).toMatchObject({ campo: "TRATAMENTO", tipo: "revisar", sugestao: "" });
  });
  test("formaNoGenero resolve os marcadores da tabela", () => {
    expect(formaNoGenero("A Sua Excelência o(a) Senhor(a)", true)).toBe("A Sua Excelência a Senhora");
    expect(formaNoGenero("A Sua Excelência o(a) Senhor(a)", false)).toBe("A Sua Excelência o Senhor");
    expect(formaNoGenero("Excelentíssimo(a) Senhor(a)", true)).toBe("Excelentíssima Senhora");
    expect(formaNoGenero("Ao Senhor (À Senhora)", true)).toBe("À Senhora");
    expect(formaNoGenero("Ao Senhor (À Senhora)", false)).toBe("Ao Senhor");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Exportar `alternativasDaLinha` em `lib/tratamento.ts` e criar `lib/convidados/protocolo.ts`**
- [ ] **Step 4: Rodar e ver passar, inclusive a suíte antiga de tratamento**

Run: `npx vitest run tests/convidados-campos.test.ts tests/tratamento-comparacao.test.ts && npm run typecheck`
Expected: PASS nos dois arquivos.

- [ ] **Step 5: Commit**

```bash
git add lib/tratamento.ts lib/convidados/protocolo.ts tests/convidados-campos.test.ts
git commit -m "feat(convidados): conferência de tratamento e endereçamento pela tabela v02"
```

---

### Task 8: Duplicidade, endereço de quem já existe, repetidas e referência

**Files:**
- Create: `lib/convidados/duplicidade.ts`
- Test: `tests/convidados-duplicidade.test.ts`

**Interfaces:**
- Consumes: `ContatoPlanilha`, `EnderecoEstruturado`, `DeputadoAtual`, `EleitoPlanilha`, `GovernadorPlanilha` de `@/lib/types`; `normalizarNome`, `normalizarTexto`; `grupoEquivalente` de `@/lib/decisoes`; `CONECTIVOS` (Tarefa 6); `Ocorrencia`, `Valores`, `Achado`.
- Produces:
  - `export interface IndiceBase { porNome: ReadonlyMap<string, Ocorrencia[]> }`
  - `export function indexarBase(contatos: readonly ContatoPlanilha[]): IndiceBase` — chave `normalizarNome(c.nome)`; `grupo` separado por `;` quando houver (uma ocorrência por grupo), `id = c.id ?? ""`.
  - `export function mesmoGrupo(a: string, b: string): boolean` → `normalizarTexto(grupoEquivalente(a, "contatos")) === normalizarTexto(grupoEquivalente(b, "contatos"))`.
  - `export function situacaoNaBase(nome: string, grupoEscolhido: string, indice: IndiceBase): { situacao: "novo" | "ja_grupo_escolhido" | "ja_outro_grupo"; ocorrencias: Ocorrencia[]; conferir: Ocorrencia[] }` — igual: `ocorrencias` todas; `ja_grupo_escolhido` se alguma casa `mesmoGrupo`; senão `ja_outro_grupo`. Sem igual: parcial = chave da base e chave do nome com 2 ou mais tokens significativos cada (tokens não conectivos com 2 ou mais letras) e todos os tokens de um lado aparecem no outro, na ordem → `conferir` com essas ocorrências, `situacao: "novo"`.
  - `export function tokensSignificativos(nomeNormalizado: string): string[]`.
  - `export interface ReferenciasEleicao { deputados: readonly DeputadoAtual[]; eleitos: readonly EleitoPlanilha[]; governadores: readonly GovernadorPlanilha[] }`
  - `export function referenciaCamaraTse(nome: string, ref: ReferenciasEleicao): string` — por `normalizarNome` contra `nomeParlamentar`/`nomeCivil` (Câmara) e `nomeUrna`/`nomeCompleto` (TSE). Textos, juntados por `" · "`: `"Consta na lista da Câmara (deputado em exercício)"`; `"Eleito(a) em 2026: Senador(a) por <UF> (TSE)"` / `"… Deputado(a) Federal por <UF> (TSE)"` / `"… Governador(a) por <UF> (TSE)"`, com o gênero resolvido pelo campo `genero` (começa com "f" → feminino; vazio → forma com "(a)").
  - `export function enderecoDaLinha(v: Valores): Pick<EnderecoEstruturado, "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "cep">`.
  - `export function compararEnderecoCadastrado(linha: number, nome: string, gravado: Valores, ocorrencias: readonly Ocorrencia[], enderecos: readonly EnderecoEstruturado[]): Achado | undefined` — `cadastrados = enderecos` com `contatoId` em `ocorrencias.map(o => o.id)`, prioritário primeiro; sem nenhum com algum campo de endereço preenchido → `{ tipo: "endereco_novo", campo: "—", valorRecebido: <endereço recebido em uma linha>, sugestao: "Aproveitar o endereço recebido no cadastro existente (Id <ids>)", motivo: "Contato já cadastrado sem endereço no Contatos." }`; igual a algum (campo a campo por `normalizarTexto`, CEP só dígitos) → `undefined`; diferente de todos → `{ tipo: "endereco_diferente", campo: "—", valorRecebido: <recebido>, sugestao: <cadastrados separados por " · ">, motivo: "Endereço recebido difere do cadastrado no Contatos." }`. Endereço em uma linha: campos não vazios na ordem Logradouro, Número, Complemento, Bairro, Cidade, UF, CEP, separados por `", "`.
  - `export function repetidasNaLista(nomes: readonly string[]): (number | undefined)[]` — para cada posição, o índice da primeira ocorrência do mesmo `normalizarNome`, ou `undefined` na primeira.

- [ ] **Step 1: Escrever os testes**

```ts
// tests/convidados-duplicidade.test.ts
import { describe, expect, test } from "vitest";
import { compararEnderecoCadastrado, indexarBase, mesmoGrupo, referenciaCamaraTse, repetidasNaLista, situacaoNaBase } from "@/lib/convidados/duplicidade";
import type { EnderecoEstruturado } from "@/lib/types";

const base = indexarBase([
  { id: "12345", nome: "João Pedro Simulado Nogueira", grupo: "Ministros de Estado" },
  { id: "23456", nome: "Helena Modelo Barreto", grupo: "Convidados do presidente eleito - Posse 2027" },
  { id: "34567", nome: "Marcos Vieira", grupo: "Prefeitos" },
  { id: "45678", nome: "Jose Exemplo Silva", grupo: "Deputados Federais" },
  { id: "45679", nome: "José Exemplo Silva", grupo: "Senadores" },
]);
const GRUPO = "Convidados do presidente eleito - Posse 2027";
const valores = { NOME: "x", TRATAMENTO: "", ENDERECAMENTO: "", CARGO: "", CEP: "70165900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 2", BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" };

describe("situação na base", () => {
  test("mesmo nome no grupo escolhido era o esperado; em outro grupo é incluir no grupo", () => {
    expect(situacaoNaBase("Helena Modelo Barreto", GRUPO, base)).toEqual({ situacao: "ja_grupo_escolhido", ocorrencias: [{ id: "23456", grupo: GRUPO }], conferir: [] });
    expect(situacaoNaBase("João Pedro Simulado Nogueira", GRUPO, base).situacao).toBe("ja_outro_grupo");
  });
  test("acento não separa a pessoa e os homônimos saem todos", () => {
    const r = situacaoNaBase("José Exemplo Silva", "Prefeitos", base);
    expect(r.situacao).toBe("ja_outro_grupo");
    expect(r.ocorrencias.map((o) => o.id)).toEqual(["45678", "45679"]);
  });
  test("grupo escolhido por apelido casa o rótulo da base", () => {
    expect(mesmoGrupo("Deputado Federal - Posse Presidencial 2027", "Deputados Federais")).toBe(true);
    expect(situacaoNaBase("Jose Exemplo Silva", "Deputado Federal - Posse Presidencial 2027", base).situacao).toBe("ja_grupo_escolhido");
  });
  test("nome parcial é novo com conferir; um token só não conta", () => {
    const r = situacaoNaBase("Marcos Genérico Vieira", GRUPO, base);
    expect(r.situacao).toBe("novo");
    expect(r.conferir).toEqual([{ id: "34567", grupo: "Prefeitos" }]);
    expect(situacaoNaBase("Marcos", GRUPO, base)).toEqual({ situacao: "novo", ocorrencias: [], conferir: [] });
  });
  test("título no nome da lista não atrapalha", () => {
    expect(situacaoNaBase("Dra. Helena Modelo Barreto", GRUPO, base).situacao).toBe("ja_grupo_escolhido");
  });
});

describe("endereço de quem já existe", () => {
  const ocorrencias = [{ id: "23456", grupo: GRUPO }];
  const cadastrado: EnderecoEstruturado = { contatoId: "23456", logradouro: "Praça dos Três Poderes", numero: "S/N", complemento: "Anexo 2", bairro: "Zona Cívico-Administrativa", cidade: "Brasília", uf: "DF", cep: "70.165-900", prioritario: true };
  test("sem endereço cadastrado em nenhum Id: endereço novo a aproveitar", () => {
    const a = compararEnderecoCadastrado(15, "Helena Modelo Barreto", valores, ocorrencias, [{ contatoId: "23456", prioritario: false }]);
    expect(a?.tipo).toBe("endereco_novo");
    expect(a?.sugestao).toBe("Aproveitar o endereço recebido no cadastro existente (Id 23456)");
  });
  test("igual a algum cadastrado (sem caixa, sem acento, CEP só dígitos): nada", () => {
    expect(compararEnderecoCadastrado(15, "x", valores, ocorrencias, [cadastrado])).toBeUndefined();
    expect(compararEnderecoCadastrado(15, "x", valores, ocorrencias, [{ ...cadastrado, contatoId: "999" }, cadastrado])).toBeUndefined();
  });
  test("diferente de todos: uma linha com o recebido e os cadastrados, prioritário primeiro", () => {
    const outro = { ...cadastrado, prioritario: false, complemento: "Anexo 1" };
    const a = compararEnderecoCadastrado(15, "x", { ...valores, COMPLEMENTO: "Anexo 3" }, ocorrencias, [outro, cadastrado]);
    expect(a?.tipo).toBe("endereco_diferente");
    expect(a?.valorRecebido).toBe("Praça dos Três Poderes, S/N, Anexo 3, Zona Cívico-Administrativa, Brasília, DF, 70165900");
    expect(a?.sugestao.indexOf("Anexo 2")).toBeLessThan(a!.sugestao.indexOf("Anexo 1"));
  });
});

describe("repetidas e referência", () => {
  test("repetida aponta a primeira ocorrência", () => {
    expect(repetidasNaLista(["Ana Exemplo", "Carlos Exemplo", "ana exemplo"])).toEqual([undefined, undefined, 0]);
  });
  test("referência da Câmara e do TSE no gênero da pessoa", () => {
    const ref = { deputados: [{ uf: "DF", nomeParlamentar: "Paulo Amostra Teixeira", nomeCivil: "Paulo Amostra Teixeira" }], eleitos: [{ casa: "senado" as const, uf: "GO", nomeUrna: "Luciana Protótipo", nomeCompleto: "Luciana Protótipo Andrade", situacaoTse: "Eleito", statusMandato: "Novo", genero: "Feminino" }], governadores: [] };
    expect(referenciaCamaraTse("Paulo Amostra Teixeira", ref)).toBe("Consta na lista da Câmara (deputado em exercício)");
    expect(referenciaCamaraTse("Luciana Protótipo Andrade", ref)).toBe("Eleita em 2026: Senadora por GO (TSE)");
    expect(referenciaCamaraTse("Ninguém Exemplo", ref)).toBe("");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Criar `lib/convidados/duplicidade.ts`**
- [ ] **Step 4: Rodar e ver passar** → `npx vitest run tests/convidados-duplicidade.test.ts` PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/convidados/duplicidade.ts tests/convidados-duplicidade.test.ts
git commit -m "feat(convidados): duplicidade contra a base de grupos, endereço cadastrado e referência Câmara/TSE"
```

---

### Task 9: Regras em texto e orquestração `tratarLista`

**Files:**
- Create: `lib/convidados/regras-texto.ts`, `lib/convidados/tratar.ts`, `tests/fixtures/convidados/exemplo.ts` (os 11 casos, a base, os endereços e as referências do exemplo aprovado, mais `rodadaDoExemplo()`; é fixture, não teste, para as Tarefas 10 e 11 importarem sem registrar testes duas vezes)
- Test: `tests/convidados-tratar.test.ts`

**Interfaces:**
- Consumes: tudo das Tarefas 1 a 8; `lerPlanilha` e `lerPlanilhaEnderecos` só nos testes (para montar a entrada a partir das fixtures).
- Produces (`regras-texto.ts`): `export const REGRAS_TEXTO: readonly { titulo: string; texto: string }[]` — as 12 do exemplo aprovado (aba Regras), na ordem: Limites dos Correios; Logradouro acima de 50; Complemento acima de 30; Número vazio; Número acima de 6 (regra A); CEP com 7 dígitos; CEP com letras, UF inexistente, campo obrigatório vazio; Nome acima de 50; Tratamento e Endereçamento; Duplicidade (texto diz "só a BASE GRUPOS POSSE, os grupos que serão convidados"); Referência Câmara / TSE; Repetida na própria lista. Mais uma 13ª: "Título no nome" (Dr., Dra., Exmo., Sr., Sra., SE Sr. saem; patente e cargo ficam).
- Produces (`tratar.ts`):
  - `export interface EntradaTratamento { linhas: readonly LinhaLista[]; grupo: string; base: readonly ContatoPlanilha[]; enderecos: readonly EnderecoEstruturado[]; referencias?: ReferenciasEleicao }`
  - `export function tratarLista(entrada: EntradaTratamento): Rodada`, por linha, nesta ordem:
    1. Curadoria de campos: `tratarNome`, `tratarUf`, `tratarCidade`, `tratarCep(cep, ufGravada)`, `tratarBairro`, `tratarNumero` (com Logradouro e Complemento recebidos), depois `encaixarLogradouroComplemento` sobre o Logradouro e o Complemento que saíram do Número. CARGO só aparado. TRATAMENTO e ENDERECAMENTO só aparados, nunca alterados. `gravado` recebe os valores; `camposAlterados` = campos em que `gravado !== recebido` (comparação exata); `regras` = concatenação; `marcas` = das revisões de campo.
    2. Cada `revisao` de campo vira `Achado` (`tipo` `"validar"` ou `"revisar"` pela marca; `campo`; `valorRecebido` = recebido do campo; `sugestao` = `revisao.sugestao ?? ""`; `motivo` = `revisao.texto`).
    3. `conferirProtocolo` → achados (marca `revisar` na linha).
    4. Repetida (`repetidasNaLista` sobre os NOMEs recebidos): `situacao: "repetida"`, `repeteLinha` = linha da primeira, achado `{ tipo: "repetida", campo: "—", sugestao: "Só a linha <n> entra no arquivo", motivo: "Mesmo nome da linha <n>." + (endereço gravado diferente da primeira ? " Endereços diferem: <primeira> · <esta>" : " Mesmo endereço.") }`. Linha repetida não passa pelos itens 5 a 7.
    5. `situacaoNaBase(nomeGravado, grupo, indice)`: `ja_grupo_escolhido` → achado `{ tipo: "ja_grupo_escolhido", campo: "—", sugestao: "Nada a fazer", motivo: "Já cadastrado em '<grupo>' (Id <ids>). Era o esperado." }`; `ja_outro_grupo` → `{ tipo: "ja_outro_grupo", sugestao: "Incluir no grupo escolhido dentro do Contatos (Id <ids>)", motivo: "Cadastrado em '<grupos>'. Fora do arquivo de importação." }`; `conferir` não vazio → `{ tipo: "conferir_duplicidade", campo: "NOME", valorRecebido: nome, sugestao: "Comparar com '<nome não disponível aqui: usar Id e grupo>' → "Comparar com Id <id> (<grupo>)", motivo: "Nome parcial no Contatos; pode ser a mesma pessoa." }`.
    6. Para `ja_*`: `compararEnderecoCadastrado` → achado quando houver.
    7. `referencia = referenciaCamaraTse(nomeGravado, referencias ?? vazio)`.
    8. TRATAMENTO ou ENDERECAMENTO vazio em linha que seria `novo`: `situacao: "sem_protocolo"`, achado `{ tipo: "revisar", campo: <o vazio>, valorRecebido: "", sugestao: "", motivo: "Tratamento e Endereçamento são obrigatórios no modelo; linha fora do arquivo até ser preenchida." }`.
    9. `entraNoArquivo = situacao === "novo"`.
    - `contagens` conforme `Rodada`: `novosAlterados` = novos com `camposAlterados.length > 0`; `novosValidar` = novos com marca `validar`; `novosRevisar` = novos com marca `revisar`; `enderecoNovo` = achados `endereco_novo`.
  - `export function textoDaSituacao(l: LinhaTratada): string` — `TEXTO_SITUACAO[situacao]` e, em `novo`, sufixo `" (REVISAR)"` se tem marca revisar, senão `" (VALIDAR)"` se tem validar.

- [ ] **Step 1: Escrever a fixture do exemplo e os testes com os 11 casos**

```ts
// tests/fixtures/convidados/exemplo.ts
import { tratarLista } from "@/lib/convidados/tratar";
import { lerListaPadrao } from "@/lib/convidados/lista";
import { lerPlanilha } from "@/lib/planilha";
import { lerPlanilhaEnderecos } from "@/lib/planilha-enderecos";
import { montarBaseEnderecos, montarBaseGrupos, montarListaPadrao } from "./montar";

export const GRUPO = "Convidados do presidente eleito - Posse 2027";
const df = { BAIRRO: "Zona Cívico-Administrativa", CIDADE: "Brasília", UF: "DF" };
export const CASOS = [
  { NOME: "Ana Beatriz Exemplo Souza", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Diretora de Relações Institucionais", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Carlos Eduardo Fictício Ramos", TRATAMENTO: "Senhor", ENDERECAMENTO: "Ao Senhor", CARGO: "Presidente da Associação Exemplo", CEP: "70070600", LOGRADOURO: "Setor de Autarquias Sul Quadra 3 Bloco C Edifício Sede da Associação", NUMERO: "", COMPLEMENTO: "5º andar, Sala 512", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Fernanda Ilustrativa Castro", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Reitora da Universidade Exemplo", CEP: "1310100", LOGRADOURO: "Avenida Paulista", NUMERO: "1578", COMPLEMENTO: "", BAIRRO: "Bela Vista", CIDADE: "São Paulo", UF: "SP" },
  { NOME: "Roberto Hipotético Lima", TRATAMENTO: "Senhor", ENDERECAMENTO: "Ao Senhor", CARGO: "", CEP: "71680360", LOGRADOURO: "Condomínio Exemplo Quadra 5", NUMERO: "Lote 12 Casa 3", COMPLEMENTO: "", BAIRRO: "Jardim Botânico", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Maria Auxiliadora da Conceição Exemplo de Almeida Prado", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Secretária Executiva do Conselho Exemplo", CEP: "70040020", LOGRADOURO: "Esplanada dos Ministérios Bloco A", NUMERO: "", COMPLEMENTO: "Anexo, 2º andar", ...df },
  { NOME: "João Pedro Simulado Nogueira", TRATAMENTO: "Excelentíssimo Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Ministro de Estado da Pasta Exemplo", CEP: "70054900", LOGRADOURO: "Esplanada dos Ministérios Bloco E", NUMERO: "S/N", COMPLEMENTO: "Gabinete", ...df },
  { NOME: "Helena Modelo Barreto", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Assessora Especial", CEP: "70160900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 2, Ala A", ...df },
  { NOME: "Luciana Protótipo Andrade", TRATAMENTO: "Excelentíssimo Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Senadora", CEP: "70165900", LOGRADOURO: "Praça dos Três Poderes", NUMERO: "S/N", COMPLEMENTO: "Anexo 1, 9º andar", ...df },
  { NOME: "Paulo Amostra Teixeira", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor", CARGO: "Deputado Federal", CEP: "70160900", LOGRADOURO: "Câmara dos Deputados, Edifício Anexo 4", NUMERO: "S/N", COMPLEMENTO: "Gabinete nº 999", BAIRRO: "Praça dos Três Poderes", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Ana Beatriz Exemplo Souza", TRATAMENTO: "Senhora", ENDERECAMENTO: "À Senhora", CARGO: "Diretora de Relações Institucionais", CEP: "70165900", LOGRADOURO: "Avenida das Nações", NUMERO: "120", COMPLEMENTO: "Sala 301", BAIRRO: "Asa Sul", CIDADE: "Brasília", UF: "DF" },
  { NOME: "Marcos Genérico Vieira", TRATAMENTO: "Senhor", ENDERECAMENTO: "Ao Senhor", CARGO: "Prefeito do Município Exemplo", CEP: "ABC12345", LOGRADOURO: "Rua das Flores", NUMERO: "45", COMPLEMENTO: "", BAIRRO: "Centro", CIDADE: "Município Exemplo", UF: "BR" },
];
export const BASE = [
  { id: "12345", nome: "João Pedro Simulado Nogueira", grupo: "Ministros de Estado" },
  { id: "23456", nome: "Helena Modelo Barreto", grupo: GRUPO },
  { id: "34567", nome: "Marcos Vieira", grupo: "Prefeitos" },
];
export const ENDERECOS = [{ contatoId: "12345", logradouro: "Esplanada dos Ministérios Bloco E", numero: "S/N", complemento: "Gabinete", bairro: "Zona Cívico-Administrativa", cidade: "Brasília", uf: "DF", cep: "70054900", prioritario: true }, { contatoId: "23456" }];
export const REFERENCIAS = { deputados: [{ uf: "DF", nomeParlamentar: "Paulo Amostra Teixeira", nomeCivil: "Paulo Amostra Teixeira" }], eleitos: [], governadores: [] };

export function rodadaDoExemplo() {
  return tratarLista({ linhas: lerListaPadrao(montarListaPadrao(CASOS)), grupo: GRUPO, base: lerPlanilha(montarBaseGrupos(BASE)), enderecos: lerPlanilhaEnderecos(montarBaseEnderecos(ENDERECOS)), referencias: REFERENCIAS });
}
```

```ts
// tests/convidados-tratar.test.ts
import { describe, expect, test } from "vitest";
import { tratarLista, textoDaSituacao } from "@/lib/convidados/tratar";
import { REGRAS_TEXTO } from "@/lib/convidados/regras-texto";
import { lerListaPadrao } from "@/lib/convidados/lista";
import { montarListaPadrao } from "./fixtures/convidados/montar";
import { CASOS, GRUPO, rodadaDoExemplo } from "./fixtures/convidados/exemplo";

describe("tratarLista sobre os 11 casos do exemplo aprovado", () => {
  const r = rodadaDoExemplo();
  const l = (n: number) => r.linhas.find((x) => x.linha === n)!;
  test("situações e textos por linha", () => {
    expect(r.linhas.map((x) => [x.linha, textoDaSituacao(x)])).toEqual([
      [9, "Novo: importar"], [10, "Novo: importar"], [11, "Novo: importar (VALIDAR)"], [12, "Novo: importar"], [13, "Novo: importar (REVISAR)"],
      [14, "Já no Contatos: incluir no grupo"], [15, "Já no Contatos: no grupo escolhido"], [16, "Novo: importar (REVISAR)"], [17, "Novo: importar"],
      [18, "Repetida na própria lista"], [19, "Novo: importar (REVISAR)"],
    ]);
    expect(r.linhas.filter((x) => x.entraNoArquivo).map((x) => x.linha)).toEqual([9, 10, 11, 12, 13, 16, 17, 19]);
  });
  test("contagens do Resumo", () => {
    expect(r.contagens).toEqual({ linhas: 11, novos: 8, novosAlterados: 4, novosValidar: 1, novosRevisar: 3, jaGrupoEscolhido: 1, jaOutroGrupo: 1, repetidas: 1, semProtocolo: 0, enderecoNovo: 1 });
  });
  test("linha 10: logradouro abreviado só até caber, número S/N, complemento que já cabia fica", () => {
    expect(l(10).gravado).toMatchObject({ LOGRADOURO: "SAS Quadra 3 Bloco C Edifício Sede da Associação", NUMERO: "S/N", COMPLEMENTO: "5º andar, Sala 512" });
    expect(l(10).camposAlterados).toEqual(["LOGRADOURO", "NUMERO"]);
  });
  test("linha 11: CEP de SP completado, VALIDAR; linha 12: regra A", () => {
    expect(l(11).gravado.CEP).toBe("01310100");
    expect(l(11).achados.map((a) => a.tipo)).toEqual(["validar"]);
    expect(l(12).gravado).toMatchObject({ NUMERO: "S/N", COMPLEMENTO: "Lt 12 Cs 3" });
  });
  test("linha 13: nome longo mantido, com sugestão", () => {
    expect(l(13).gravado.NOME).toBe(CASOS[4].NOME);
    expect(l(13).achados.find((a) => a.campo === "NOME")?.sugestao).toMatch(/\(\d+\)$/);
  });
  test("linha 14 e 15: já no Contatos com Id e grupo; 15 sem endereço cadastrado é endereço novo", () => {
    expect(l(14).ocorrencias).toEqual([{ id: "12345", grupo: "Ministros de Estado" }]);
    expect(l(14).achados.map((a) => a.tipo)).toContain("ja_outro_grupo");
    expect(l(14).achados.map((a) => a.tipo)).not.toContain("endereco_diferente");
    expect(l(15).achados.map((a) => a.tipo)).toEqual(["ja_grupo_escolhido", "endereco_novo"]);
  });
  test("linha 16: tratamento e endereçamento da senadora REVISAR com a forma v02 feminina; linha 17: referência da Câmara e nada a revisar", () => {
    expect(l(16).achados.map((a) => [a.campo, a.sugestao])).toEqual([["TRATAMENTO", "Senhora"], ["ENDERECAMENTO", "A Sua Excelência a Senhora"]]);
    expect(l(16).gravado.TRATAMENTO).toBe("Excelentíssimo Senhor");
    expect(l(17).achados).toEqual([]);
    expect(l(17).referencia).toBe("Consta na lista da Câmara (deputado em exercício)");
  });
  test("linha 18 repete a 9; linha 19: CEP, UF e conferir duplicidade", () => {
    expect(l(18).repeteLinha).toBe(9);
    expect(l(18).achados[0].sugestao).toBe("Só a linha 9 entra no arquivo");
    expect(l(19).achados.map((a) => [a.tipo, a.campo])).toEqual(expect.arrayContaining([["revisar", "CEP"], ["revisar", "UF"], ["conferir_duplicidade", "NOME"]]));
    expect(l(19).conferirDuplicidade).toEqual([{ id: "34567", grupo: "Prefeitos" }]);
    expect(l(19).entraNoArquivo).toBe(true);
  });
});

describe("casos fora do exemplo", () => {
  test("linha só com nome: campos obrigatórios REVISAR, continua novo", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ NOME: "Eleito Exemplo Sem Gabinete", TRATAMENTO: "Senhor", ENDERECAMENTO: "A Sua Excelência o Senhor" }])), grupo: GRUPO, base: [], enderecos: [] });
    expect(r.linhas[0].situacao).toBe("novo");
    expect(r.linhas[0].achados.map((a) => a.campo).sort()).toEqual(["BAIRRO", "CEP", "CIDADE", "NUMERO", "UF"]);
    expect(r.linhas[0].entraNoArquivo).toBe(true);
  });
  test("tratamento vazio tira a linha do arquivo", () => {
    const r = tratarLista({ linhas: lerListaPadrao(montarListaPadrao([{ ...CASOS[0], TRATAMENTO: "" }])), grupo: GRUPO, base: [], enderecos: [] });
    expect(r.linhas[0].situacao).toBe("sem_protocolo");
    expect(r.linhas[0].entraNoArquivo).toBe(false);
    expect(r.contagens.semProtocolo).toBe(1);
  });
  test("a aba Regras tem uma regra para cada família de tratamento", () => {
    expect(REGRAS_TEXTO.map((r) => r.titulo)).toContain("Duplicidade");
    expect(REGRAS_TEXTO.find((r) => r.titulo === "Duplicidade")?.texto).toMatch(/BASE GRUPOS POSSE/);
    expect(REGRAS_TEXTO).toHaveLength(13);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Criar `regras-texto.ts` e `tratar.ts`**
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/convidados-tratar.test.ts` PASS. Se uma contagem do exemplo divergir por detalhe de regra (por exemplo `novosAlterados`), conferir a regra, não o teste: as situações por linha são o critério 1 da spec. Os cargos do exemplo são fictícios: se a tabela v02 tiver regra para algum deles (por exemplo "Diretora de Relações Institucionais" ou "Prefeito do Município Exemplo") e isso gerar um achado de protocolo que mude a situação de uma linha, troque o cargo da fixture por outro sem regra (ex.: "Coordenadora Exemplo") e registre a troca na mensagem do commit; nunca afrouxe a regra.
- [ ] **Step 5: Commit**

```bash
git add lib/convidados/regras-texto.ts lib/convidados/tratar.ts tests/fixtures/convidados/exemplo.ts tests/convidados-tratar.test.ts
git commit -m "feat(convidados): tratarLista orquestra a curadoria, o protocolo e a duplicidade"
```

---

### Task 10: Saída em `exceljs` (importação e conferência)

**Files:**
- Create: `lib/convidados/saida.ts`
- Test: `tests/convidados-saida.test.ts` (acrescentar ao arquivo da Tarefa 1)

**Interfaces:**
- Consumes: `Rodada`, `MetaRodada`, `LinhaTratada`, `CAMPOS_MODELO`, `CABECALHO_PRODASEN`, `TEXTO_TIPO_ACHADO`, `textoDaSituacao`, `REGRAS_TEXTO`, `nomeImportacao`; `exceljs` (`import ExcelJS from "exceljs"`).
- Produces:
  - `export const CORES = { amarelo: "FFFFF2CC", laranja: "FFF8CBAD", verde: "FFE2EFDA", cinza: "FFE7E6E6", azul: "FFDDEBF7", cabecalho: "FF1F4E78" } as const` (ARGB, como o `exceljs` pede).
  - `export async function gerarImportacao(rodada: Rodada, modelo: ArrayBuffer): Promise<ArrayBuffer>` — carrega o modelo, aba `"Contatos"`, confere que a linha 1 é exatamente `CABECALHO_PRODASEN` (senão lança `Error("Modelo do PRODASEN com cabeçalho diferente do esperado")`), escreve a partir da linha 2 as linhas com `entraNoArquivo`, na ordem da lista, `gravado[campo]` para os 11 campos e `""` em FOTO e SITE_OFICIAL, `numFmt "@"` em toda célula escrita; devolve `wb.xlsx.writeBuffer()` convertido em `ArrayBuffer`.
  - `export async function gerarConferencia(rodada: Rodada, meta: MetaRodada): Promise<ArrayBuffer>` — cinco abas, nesta ordem e com estes cabeçalhos:
    - **Resumo**: coluna A/B; linha 1 título `"Tratamento da lista de convidados"` (Arial 12 negrito); depois os pares `Lista recebida` (`"<listaNome> (aba 'Lista de Convidados', linhas <primeira> a <última>)"`), `Grupo escolhido ao rodar`, `Base do Contatos usada` (`baseNome`), `Base de endereços usada` (`enderecosNome`), `Listas de referência` (`referencias.join(", ")` ou `"nenhuma encontrada"`), `Gerado em` (`"<geradoEm> · <origem>"`); linha vazia; `Situação | Qtd` em negrito; `Linhas na lista`, `Novo: importar (entram no arquivo PRODASEN)`, `   com campo alterado pela ferramenta`, `   com VALIDAR (inferência a confirmar)`, `   com REVISAR (a ferramenta não resolveu sozinha)`, `Já no Contatos: no grupo escolhido (fora do arquivo; era o esperado)`, `Já no Contatos: em outro grupo (fora do arquivo; incluir no grupo lá dentro)`, `Repetida na própria lista (fora do arquivo)`, `Fora do arquivo: Tratamento ou Endereçamento vazio`, `Endereço novo para contato já cadastrado`; linha vazia; `Como ler` em negrito e as 6 frases do exemplo aprovado (legenda das cores, abas, Tratamento/Endereçamento conferidos, grupo fora do arquivo). Larguras 70 e 90, quebra de linha.
    - **Simulacao**: cabeçalho `Linha na lista`, `Situação`, para cada campo de `CAMPOS_MODELO` `"<CAMPO> RECEBIDO"` e `"<CAMPO> GRAVADO"`, depois `Campos alterados`, `Regras aplicadas`, `Revisão / validação`, `Trecho que não coube`, `Já no Contatos (Id · grupo)`, `Referência (Câmara / TSE)`. Uma linha por `LinhaTratada`: `Campos alterados` = `camposAlterados.join(", ")`; `Regras aplicadas` = `regras.join("; ")`; `Revisão / validação` = achados `validar`/`revisar`/`conferir_duplicidade`/`repetida`/`ja_*`/`endereco_*` como `"<MARCA>: <motivo>"` (`VALIDAR`, `REVISAR`, `ATENÇÃO` para ja_outro_grupo/repetida/endereco_diferente/conferir, `OK` para ja_grupo_escolhido, `INFO` para endereco_novo) separados por `" | "`; `Já no Contatos` = ocorrências `"Id <id> · <grupo>"` juntadas por `" · "`, e `conferirDuplicidade` como `"Conferir: Id <id> · <grupo> (nome parcial)"`. Cores: célula GRAVADO de campo alterado amarelo (azul quando a linha tem marca validar e o campo tem revisão validar); `Revisão / validação` laranja se contém `REVISAR` ou `ATENÇÃO`, azul se só `VALIDAR`; `Revisão / validação` e `Já no Contatos` verdes em `ja_grupo_escolhido`; linha inteira cinza (células ainda sem cor) quando `!entraNoArquivo`. Painel congelado em `C2`, filtro automático, Arial 10, cabeçalho azul com fonte branca.
    - **Modelo PRODASEN**: `CABECALHO_PRODASEN` e as mesmas linhas de `gerarImportacao`.
    - **Revisoes**: `Linha na lista`, `Nome`, `Tipo`, `Campo`, `Valor recebido`, `Sugestão da ferramenta`, `Motivo`, `Decisão (preencher)`; uma linha por `Achado` de todas as linhas, na ordem da lista; `Tipo` = `TEXTO_TIPO_ACHADO[tipo]`; cor da célula Tipo: azul `validar`, verde `ja_grupo_escolhido`, cinza claro (nenhuma) `endereco_novo`, laranja nos demais.
    - **Regras**: `Regra | Como é aplicada`, uma linha por item de `REGRAS_TEXTO`.
  - `function paraArrayBuffer(buffer: ExcelJS.Buffer): ArrayBuffer` interna.

- [ ] **Step 1: Escrever os testes**

```ts
// acrescentar a tests/convidados-saida.test.ts
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { CORES, gerarConferencia, gerarImportacao } from "@/lib/convidados/saida";
import { CABECALHO_PRODASEN } from "@/lib/convidados/tipos";
import { montarModeloProdasen } from "./fixtures/convidados/montar";
import { rodadaDoExemplo } from "./fixtures/convidados/exemplo";

const meta = { listaNome: "Lista Exemplo.xlsx", primeiraLinha: 9, ultimaLinha: 19, baseNome: "BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx", enderecosNome: "BASE ENDERECO - 05 NOV 2026 15h.xlsx", referencias: ["deputado.xls"], geradoEm: "08/11/2026 10:00", origem: "comando" };
const abas = (buf: ArrayBuffer) => XLSX.read(buf, { type: "array" });

describe("arquivo de importação", () => {
  test("cabeçalho idêntico ao modelo, só as linhas que entram, sem coluna extra", async () => {
    const wb = abas(await gerarImportacao(rodadaDoExemplo(), await montarModeloProdasen()));
    const m = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Contatos"], { header: 1, defval: "" });
    expect(m[0]).toEqual([...CABECALHO_PRODASEN]);
    expect(m.length - 1).toBe(8);
    expect(m[1][0]).toBe("Ana Beatriz Exemplo Souza");
    expect(m[3][4]).toBe("01310100");
    expect(m.every((l) => l.length <= 13)).toBe(true);
    expect(m.some((l) => l[0] === "Helena Modelo Barreto")).toBe(false);
  });
  test("modelo com cabeçalho diferente é erro claro", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Contatos").addRow(["NOME", "GRUPO"]);
    await expect(gerarImportacao(rodadaDoExemplo(), (await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(/cabeçalho/);
  });
});

describe("arquivo de conferência", () => {
  test("cinco abas na ordem e cabeçalhos da Simulacao e da Revisoes", async () => {
    const wb = abas(await gerarConferencia(rodadaDoExemplo(), meta));
    expect(wb.SheetNames).toEqual(["Resumo", "Simulacao", "Modelo PRODASEN", "Revisoes", "Regras"]);
    const sim = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Simulacao"], { header: 1, defval: "" });
    expect(sim[0].slice(0, 4)).toEqual(["Linha na lista", "Situação", "NOME RECEBIDO", "NOME GRAVADO"]);
    expect(sim[0].slice(-6)).toEqual(["Campos alterados", "Regras aplicadas", "Revisão / validação", "Trecho que não coube", "Já no Contatos (Id · grupo)", "Referência (Câmara / TSE)"]);
    expect(sim).toHaveLength(12);
    const rev = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Revisoes"], { header: 1, defval: "" });
    expect(rev[0]).toEqual(["Linha na lista", "Nome", "Tipo", "Campo", "Valor recebido", "Sugestão da ferramenta", "Motivo", "Decisão (preencher)"]);
    expect(rev.slice(1).map((l) => l[2])).toContain("Já no Contatos: grupo escolhido");
    const modelo = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Modelo PRODASEN"], { header: 1, defval: "" });
    expect(modelo[0]).toEqual([...CABECALHO_PRODASEN]);
    expect(modelo).toHaveLength(9);
    const regras = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Regras"], { header: 1, defval: "" });
    expect(regras[0]).toEqual(["Regra", "Como é aplicada"]);
  });
  test("cores: amarelo no gravado alterado, laranja na revisão, verde no grupo escolhido, cinza na linha fora do arquivo", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await gerarConferencia(rodadaDoExemplo(), meta)));
    const sim = wb.getWorksheet("Simulacao")!;
    const cor = (linha: number, coluna: number) => (sim.getCell(linha, coluna).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    expect(cor(3, 14)).toBe(CORES.amarelo); // linha 10 do exemplo (2ª linha de dados), LOGRADOURO GRAVADO
    expect(cor(4, 12)).toBe(CORES.azul); // linha 11, CEP GRAVADO
    expect(cor(6, 27)).toBe(CORES.laranja); // linha 13, Revisão / validação
    expect(cor(8, 27)).toBe(CORES.verde); // linha 15
    expect(cor(11, 1)).toBe(CORES.cinza); // linha 18, repetida
    expect(cor(2, 1)).toBeUndefined();
    expect(sim.getCell(1, 1).fill && (sim.getCell(1, 1).fill as ExcelJS.FillPattern).fgColor?.argb).toBe(CORES.cabecalho);
  });
  test("Resumo traz grupo, bases e contagens", async () => {
    const wb = abas(await gerarConferencia(rodadaDoExemplo(), meta));
    const resumo = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Resumo"], { header: 1, defval: "" });
    const plano = resumo.map((l) => l.join(" | ")).join("\n");
    expect(plano).toMatch(/Grupo escolhido ao rodar \| Convidados do presidente eleito - Posse 2027/);
    expect(plano).toMatch(/BASE GRUPOS POSSE - 05 NOV 2026 15h.xlsx/);
    expect(plano).toMatch(/Linhas na lista \| 11/);
    expect(plano).toMatch(/Novo: importar \(entram no arquivo PRODASEN\) \| 8/);
  });
});
```

(A coluna de `Revisão / validação` na Simulacao é a 27ª: 2 + 22 + 3. Se a contagem de colunas mudar na implementação, ajustar o índice no teste junto com o cabeçalho.)

- [ ] **Step 2: Rodar e ver falhar** → FAIL.
- [ ] **Step 3: Criar `lib/convidados/saida.ts`**
- [ ] **Step 4: Rodar e ver passar** — `npx vitest run tests/convidados-saida.test.ts && npm run typecheck` PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/convidados/saida.ts tests/convidados-saida.test.ts tests/fixtures/convidados/montar.ts
git commit -m "feat(convidados): arquivos de importação e de conferência com exceljs"
```

---

### Task 11: Comando `npm run convidados`

**Files:**
- Create: `scripts/convidados.ts`

**Interfaces:**
- Consumes: `lerListaPadrao`, `tratarLista`, `gerarImportacao`, `gerarConferencia`, `rodada-nomes`, `lerPlanilha`, `lerPlanilhaEnderecos`, `lerPlanilhaEleicao` e `PlanilhaEleicaoDesconhecidaError`, `ColunaFaltanteError`.
- Produces: comando `npm run convidados -- "<lista.xlsx>" --grupo "<rótulo>" [--base <xlsx>] [--enderecos <xlsx>] [--eleitos <pasta>] [--saida <pasta>] [--modelo <xlsx>]`.
  - Argumentos com `node:util` `parseArgs` (`allowPositionals: true`). Falta a lista ou `--grupo`: imprime o uso e sai com 2.
  - Raiz = `process.cwd()` (o `npm run` roda na raiz do repositório). Padrões: `--base` = `maisRecente` dos arquivos de `Bases de comparação -PLANILHAS CONTATOS/` com prefixo `BASE GRUPOS POSSE`; `--enderecos` idem com `BASE ENDERECO`; `--eleitos` = `../GT Posse/Eleitos 2026`; `--saida` = `../GT Posse/Contatos/Tratamento - Lista de Convidados`; `--modelo` = `<saida>/Modelo_Importacao_Contatos_PRODASEN.xlsx`. Base ou modelo ausentes: mensagem clara e saída 1.
  - Leitura de arquivo para `ArrayBuffer`: `const b = readFileSync(p); b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)`.
  - Referências: todo `.xlsx`/`.xls` da pasta `--eleitos` passa por `lerPlanilhaEleicao`; `PlanilhaEleicaoDesconhecidaError` e `ColunaFaltanteError` só pulam o arquivo; `atuais` → `deputados`, `senado`/`camara` → `eleitos`, `governo` → `governadores.eleitos`; pasta ausente → referências vazias e aviso no Resumo (`referencias: []`).
  - Pasta da rodada: `nomeDaPastaDaRodada(sufixoDaData(new Date()), readdirSync(saida))`, criada com `mkdirSync`.
  - `ColunaFaltanteError` na lista: imprime `Lista não reconhecida: <message>` em stderr, sai com 1, **sem gravar nada**.
  - Stdout, só isto: `Lista: <nome do arquivo> (<n> linhas)`, `Grupo: <grupo>`, `Base: <nome>`, `Endereços: <nome>`, `Referências: <nomes ou "nenhuma">`, linha vazia, as contagens da `Rodada` (uma por linha, rótulo e número), linha vazia, `Gravado em <caminho da pasta>:` e os dois nomes de arquivo. Nunca um nome de convidado.

- [ ] **Step 1: Criar `scripts/convidados.ts`** conforme acima.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: limpo (o `tsconfig` inclui `scripts/*.ts`).

- [ ] **Step 3: Gerar a lista do exemplo e as bases fictícias para rodar o comando de verdade**

Criar `.fiscal/convidados-tmp/` (pasta ignorada pelo git) e, com um script temporário `tsx`, gravar nela `lista-exemplo.xlsx`, `BASE GRUPOS POSSE - 01 JAN 2026.xlsx` e `BASE ENDERECO - 01 JAN 2026.xlsx` a partir de `CASOS`, `BASE` e `ENDERECOS` de `tests/fixtures/convidados/exemplo.ts` e dos montadores de `montar.ts`; copiar para lá o `Modelo_Importacao_Contatos_PRODASEN.xlsx` da pasta do GT. Apagar o script temporário depois.

- [ ] **Step 4: Rodar o comando (critério de aceite 1)**

Run: `npm run convidados -- ".fiscal/convidados-tmp/lista-exemplo.xlsx" --grupo "Convidados do presidente eleito - Posse 2027" --base ".fiscal/convidados-tmp/BASE GRUPOS POSSE - 01 JAN 2026.xlsx" --enderecos ".fiscal/convidados-tmp/BASE ENDERECO - 01 JAN 2026.xlsx" --eleitos ".fiscal/convidados-tmp/sem-eleitos" --saida ".fiscal/convidados-tmp" --modelo ".fiscal/convidados-tmp/Modelo_Importacao_Contatos_PRODASEN.xlsx"`
Expected: código 0; stdout com `11 linhas`, `Novo: importar: 8`, `Já no Contatos: no grupo escolhido: 1`, `Já no Contatos: em outro grupo: 1`, `Repetida na própria lista: 1`, `Referências: nenhuma`, e a pasta `.fiscal/convidados-tmp/<DDMMMAAAA>/` com `Importacao PRODASEN - Convidados do presidente eleito - Posse 2027 - <sufixo>.xlsx` e `Conferencia - Lista de Convidados - <sufixo>.xlsx`. Nenhum nome de pessoa no stdout.

- [ ] **Step 5: Rodar de novo e conferir o sufixo `-2`**

Run: o mesmo comando.
Expected: nova pasta `<DDMMMAAAA>-2`, a anterior intacta.

- [ ] **Step 6: Critério de aceite 2 (coluna faltante)**

Gerar `lista-sem-enderecamento.xlsx` na mesma pasta com `montarListaPadrao(CASOS, { semColunas: ["ENDERECAMENTO"] })` e rodar o comando sobre ela.
Expected: código 1, stderr `Lista não reconhecida: Colunas obrigatórias ausentes na planilha: ENDERECAMENTO`, nenhuma pasta nova criada.

- [ ] **Step 7: Abrir a conferência gerada e conferir as cores** (lendo com `exceljs` num script temporário, ou abrindo no Excel): Simulacao com amarelo no LOGRADOURO GRAVADO e no NUMERO GRAVADO da linha 10, azul no CEP da 11, laranja na revisão da 13, 16 e 19, verde na 15, cinza nas linhas 14, 15 e 18; Revisoes com os achados do exemplo (validar da 11; nome da 13; outro grupo da 14; grupo escolhido da 15; tratamento e endereçamento da 16; repetida da 18; CEP, UF e conferir duplicidade da 19) mais "Endereço novo para contato já cadastrado" na 15. Apagar `.fiscal/convidados-tmp/` ao terminar.

- [ ] **Step 8: Commit**

```bash
git add scripts/convidados.ts
git commit -m "feat(convidados): comando npm run convidados"
```

---

### Task 12: Verificação final, isolamento e documentação

**Files:**
- Modify: `CLAUDE.md` (estado do projeto e layout do código; a linha da tabela de specs já existe)

- [ ] **Step 1: Suíte inteira, typecheck e build**

Run: `npm test && npm run typecheck && npm run build`
Expected: os 72 arquivos antigos passam sem edição (1968 testes) mais os 5 novos; typecheck limpo; build verde. (`npm run build` com o servidor `dev` parado.)

- [ ] **Step 2: Teste de isolamento (§8.4 da spec)**

Run: `git diff --stat origin/main -- . ':(exclude)lib/convidados' ':(exclude)scripts/convidados.ts' ':(exclude)tests/convidados-*' ':(exclude)tests/fixtures/convidados' ':(exclude)docs' ':(exclude)CLAUDE.md' ':(exclude)package.json' ':(exclude)package-lock.json'`
Expected: só `lib/tratamento.ts` com 1 linha alterada (`export` em `alternativasDaLinha`). Nada mais.

- [ ] **Step 3: Conferir que nenhum teste ou fixture tem nome real e que não há `console.` no módulo**

Run: `grep -rn "console\." lib/convidados/ ; grep -rn "console\." scripts/convidados.ts`
Expected: nenhuma ocorrência em `lib/convidados/`; em `scripts/convidados.ts` só as linhas de stdout/stderr descritas na Tarefa 11.

- [ ] **Step 4: Atualizar `CLAUDE.md`**: no "Estado do projeto", uma linha dizendo que a etapa 1 do tratamento da lista de convidados (módulo `lib/convidados/` e `npm run convidados`) está implementada na branch `feat/tratamento-lista-de-convidados`, com a contagem nova da suíte; no "Layout do código", `lib/convidados/` e `scripts/convidados.ts`; na linha da spec na tabela, situação `Aprovada em 08/11; etapa 1 implementada (módulo e comando); etapa 2 (tela) a planejar`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md com a etapa 1 do tratamento da lista de convidados"
```

---

## Autoavaliação do plano

- **Cobertura da spec:** §4.1 (Tarefa 2), §4.2/§4.3 (Tarefa 11), §5.1 (Tarefa 1), §5.2 (3), §5.3 (4), §5.4/§5.5 (5), §5.6 (6), §5.7 (9), §5.8 (7), §6.1 a §6.4 (8 e 9), §7.1/§7.2 (10), §8.1/§8.2 comando (todas; tela fica para a etapa 2), §8.4 (12), §12 critérios 1 e 2 (11), 3 a 10 (9 e 7), 11 (10), 12 (11 e 12), 13 (12), §13 (os cinco arquivos de teste).
- **Tipos:** `ResultadoCampo`, `Revisao`, `Achado`, `Ocorrencia`, `LinhaTratada`, `Rodada`, `MetaRodada` definidos na Tarefa 1 e usados com os mesmos nomes nas demais; `ReferenciasEleicao` definida na 8 e consumida na 9 e 11; `textoDaSituacao` definida na 9 e usada na 10.
- **Review Focus:** cada um dos cinco itens tem teste na tarefa indicada (2, 9, 8, 8, 2).
- **Proporção:** o plano fixa assinaturas, valores e asserções; os corpos ficam com o implementador, exceto a ordem dos passos de `tratarLista` e as tabelas portadas, que são decisões da spec.
