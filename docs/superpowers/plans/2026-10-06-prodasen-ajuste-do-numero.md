# Plano: tela do PRODASEN, bloco do endereço (ajuste do Número acima de 6)

Spec: `docs/superpowers/specs/2026-10-06-prodasen-ajuste-do-numero.md`. Branch: `feat/prodasen-endereco` (de `origin/main`).

Regras de sempre: `lib/` puro e imutável, sem `any`, testes AAA com nomes em português e dados fictícios (nenhum nome real), sem `console.*` com dado pessoal. Cada tarefa termina com `npm test` e `npm run typecheck` verdes e um commit `feat:`/`test:` próprio.

## Tarefa 1: regra e arquivos (`lib/ajuste-numero.ts`)

Tipos em `lib/types.ts`:
```ts
export type CelulaBase = string | number | null;
export interface BaseEnderecos { cabecalho: string[]; linhas: CelulaBase[][] }
export interface NumeroNaBase { enderecos: number; acimaDoLimite: number; contatos: number; foraDaPosse: number; naoPrioritarios: number }
```

`lib/ajuste-numero.ts` (puro, importa `LIMITE_NUMERO` de `lib/endereco.ts`, `normalizarTexto` de `lib/normalize.ts`, `ColunaFaltanteError` de `lib/planilha.ts`, `xlsx`):
- `proporNumero(numero: string): string | undefined`: porte literal de `propor()` (spec §4). Regex equivalente a `(?i)(lotes?|casa|ch[aá]cara|bloco)\s*(.+)` com fullmatch sobre o valor aparado; resto aparado com `\s*[,/]\s*` → `/`; zeros à esquerda por parte (`"" → "0"`); depois sem espaço.
- `textoCelula(v: CelulaBase): string`: `""` para null, senão `String(v).trim()`.
- `colunasDaBase(cabecalho)`: localiza por `normalizarTexto` as colunas contato id, endereco id, tratamento, nome, logradouro, numero, complemento, bairro, cidade, uf, cep, prioritario; faltando contato id, endereco id ou numero → `ColunaFaltanteError`.
- `montarAjusteNumero(base, gruposPorContato: ReadonlyMap<string, string[]>)` → `{ casos: CasoAjuste[]; semProposta: CasoSemProposta[]; enderecos: number; contatos: number }`. Caso = linha com texto do Número > 6 e proposta; carrega os campos da aba Ajustes, `observacao` (Bloco, spec §4.5) e `grupos`. Ordem: `nome.toLowerCase()` por comparação simples de código (`<`), estável — como `sort` do Python. `contatos` = Contato Id distintos dos casos.
- `sufixoDaData(iso: string): string`: data em `America/Sao_Paulo`, `05OUT2026` (meses JAN FEV MAR ABR MAI JUN JUL AGO SET OUT NOV DEZ).
- `nomesArquivosProdasen(iso)` → `{ carga: "BASE DE ENDERECO - <s> - carga PRODASEN.xlsx", ajustes: "Numero mais de 6 caracteres - ajustes <s>.xlsx" }`.
- `gerarXlsxCarga(base, ajuste): ArrayBuffer`: aba `Folha1`, `aoa_to_sheet([cabecalho, ...linhas])` com Numero trocado por `Endereço Id` (comparar Ids como texto). Não mutar `base`.
- `gerarXlsxAjustes(ajuste, meta: { fonte: string; geradoEm: string }): ArrayBuffer`: abas `Resumo`, `Ajustes`, `De-Para`, `Sem proposta` conforme spec §5, valores (sem fórmula). Linhas do Resumo na ordem do script (spec §5).

Testes `tests/ajuste-numero.test.ts`: cada passo da regra (`Lote 05/06` → `LT 5/6`; `Lotes 1, 2` → `LT 1/2`; `Casa 02` → `CS 02`; `Chácara 10` e `Chacara 10` → `CH 10`; `Lote 09/10` → `LT9/10`; `Bloco A` → `BL A` com observação; `Quadra 5 Conj 3` → sem proposta; texto que já cabe não vira caso), coluna faltante, ordenação, grupos, sufixo da data (inclui virada de dia UTC→Brasília), cabeçalho exato de cada aba, carga com só o Número trocado e base intacta.

## Tarefa 2: base inteira no retrato

- `lib/planilha-enderecos.ts`: `lerBaseEnderecos(buffer): BaseEnderecos` com `sheet_to_json(ws, { header: 1, raw: true, defval: null })`; cabeçalho em texto; descarta linhas sem valor da 2ª coluna em diante (vazio = null ou `""`); células não primitivas viram texto. Teste com planilha montada em memória.
- `components/nova-varredura-form.tsx`: ao ler o arquivo de endereços, guardar também a base bruta e enviá-la no POST como `baseEnderecos`.
- `lib/analise-payload.ts`: `baseEnderecos?` validado (cabeçalho array de string, linhas array de arrays de string|number|null, teto `MAX_CONTATOS` de linhas); inválido → `PayloadInvalidoError`. Testes em `tests/analise-payload.test.ts`.
- `lib/painel.ts` `montarRetrato`: recebe `baseEnderecos` opcional em `planilhas`; grava `baseEnderecos` e `numeroNaBase` (função pura exportada `contarNumeroNaBase(base, grupos)`: acima de 6 pela mesma medida de `textoCelula`; `foraDoPainel` = endereços acima cujo `Endereço Id` não é o `endereco.endereco.enderecoId` de nenhum contato do retrato; desses, `foraDaPosse` se o Contato Id não está entre os contatos do retrato, senão `naoPrioritarios`). `Retrato` ganha `baseEnderecos?` e `numeroNaBase?`.
- `app/api/analise/route.ts`: passa a base a `montarRetrato`; a resposta JSON vai sem `baseEnderecos`.
- `lib/publicar.ts`: remove `baseEnderecos`, mantém `numeroNaBase`. Teste em `tests/publicar.test.ts` no molde do caso dos deputados.

## Tarefa 3: tela `/prodasen` e painel

- `app/prodasen/page.tsx`: `dynamic = "force-dynamic"`, `notFound()` em modo web, lê o retrato. Sem retrato → link para `/nova-varredura`. Retrato sem `baseEnderecos` → aviso "Esta varredura é anterior à tela do PRODASEN: faça uma nova varredura com a planilha de endereços".
- `components/prodasen-endereco.tsx` (`"use client"`): resumo (endereços na base, acima de 6, contatos, sem proposta, fora do painel) e dois botões que chamam `gerarXlsxCarga`/`gerarXlsxAjustes` com os nomes de `nomesArquivosProdasen(geradoEm)`. Mapa de grupos por Contato Id montado do retrato. Mover `baixar` de `components/export-buttons.tsx` para um util compartilhado (`components/baixar.ts`) em vez de duplicar.
- `components/painel.tsx`: link "Ajustes PRODASEN" no cabeçalho, só se `modo !== "web"`. Ao lado dos filtros, quando houver `numeroNaBase`: "Número acima de 6 na base inteira: N endereços (X fora do painel: a fora da Posse, b não prioritários)". Texto montado por função pura em `lib/painel.ts` (`textoNumeroNaBase`) com teste.
- `CLAUDE.md`: linha do spec novo na tabela, `/prodasen` e `ajuste-numero` no layout, `baseEnderecos` no princípio do retrato publicado.

## Validação final (fora do repositório)

Script no rascunho da sessão que importa `lib/ajuste-numero.ts` (via `npx tsx`), lê `BASE ENDERECO - 05 OUT 2026.xlsx` com `lerBaseEnderecos`, gera os dois arquivos e compara com os do script em `GT Posse/Contatos`: 129 ajustes, 128 contatos, propostos iguais por Endereço Id, carga igual célula a célula. Depois `npm run build`.
