# Catálogo de grupos/fontes em arquivo versionado — remoção do Supabase

**Data:** 2026-08-13
**Status:** Aprovado
**Substitui:** a decisão "Banco: Supabase (Postgres)" de `2026-06-04-fiscal-de-mailings-design.md` (§6 Schema, §Stack)

## Problema

A tela `/grupos` em produção (`https://mailings-theta.vercel.app/grupos`) exibe:

```
Não foi possível carregar os grupos: Erro ao listar grupos: TypeError: fetch failed
```

**Causa:** o plano free do Supabase permite **2 projetos ativos**. O Clovis já tem outros
dois, e o projeto do Fiscal de Mailings foi **pausado**. Toda leitura do catálogo falha na
conexão.

O impacto vai além da tela `/grupos`: `resolverGrupoEFonte` é a primeira dependência de
`analisar()`, então **nenhuma análise de planilha resolve fonte oficial** enquanto o banco
estiver pausado. A ferramenta está inutilizável.

## Diagnóstico: o banco nunca foi necessário

O levantamento do acoplamento revelou que o Postgres servia um catálogo minúsculo,
somente-leitura e **já versionado no próprio repositório**:

| Fato | Evidência |
|---|---|
| Superfície de código | Só `lib/supabase.ts` — **2 queries**, ambas `select` em `grupos` com embed `fontes` |
| Call sites | 2: `app/api/analise/route.ts:27`, `app/grupos/page.tsx:28` |
| Escritas em runtime | **Nenhuma** — sem `insert`/`update`/`delete`. O MVP é stateless por decisão de spec |
| Volume | **33 grupos + 21 fontes = 54 linhas** |
| Onde os dados moram | `data/apply-all.sql`, versionado em git |
| Tabela `orgaos` | Criada na migration 0001 e **nunca consultada** por nenhuma query |
| `data/seed-orgaos.sql` | **Vazio** — só comentários |

O último ponto é o mais revelador. O spec original elegeu `data/seed-orgaos.sql` como fonte
da verdade das URLs oficiais, mas na prática elas foram parar em `data/apply-all.sql` e daí
coladas à mão no SQL Editor do Supabase. **O repositório já era a fonte da verdade e o banco
já era uma cópia derivada** — que agora está indisponível.

## Decisão

Eliminar o banco de dados. O catálogo passa a ser um **arquivo TypeScript tipado e
versionado**, lido diretamente pelo código.

Alternativas descartadas, com o motivo:

| Alternativa | Por que não |
|---|---|
| **Postgres no VPS do Clovis** (pedido inicial) | Obriga a expor a porta do Postgres à internet: a Vercel usa IPs dinâmicos, então allowlist por IP não protege. Somam-se TLS, backup, hardening e monitoramento — tudo isso para servir 54 linhas somente-leitura que já estão no git |
| **Supabase self-hosted no VPS** | ~8 containers (Kong, GoTrue, PostgREST, Realtime, Storage, Studio…) pelo mesmo resultado |
| **Outro Postgres gerenciado (Neon)** | Resolveria com pouca operação, mas mantém uma dependência de rede externa e uma cópia derivada que pode divergir do repositório — exatamente o defeito que causou este incidente |

## Formato do catálogo — `data/catalogo.ts`

```ts
export interface FonteCatalogo {
  url: string;
  ativo: boolean;
}

export interface GrupoCatalogo {
  nome: string;
  responsavel1?: string;
  responsavel2?: string;
  backup?: string;
  emailResp1?: string;
  emailResp2?: string;
  emailBackup?: string;
  /** A primeira fonte ativa da lista é a primária. */
  fontes: FonteCatalogo[];
}

export const CATALOGO: readonly GrupoCatalogo[] = [ /* 33 grupos */ ];
```

**TypeScript, não JSON.** O arquivo entra no bundle, é validado pelo `tsc` durante o build e
dispensa leitura de arquivo em runtime (frágil no serverless da Vercel). Uma URL digitada
errada vira erro de build em vez de erro em produção.

Dois contratos mudam em relação ao schema Postgres:

1. **`created_at` deixa de existir.** No banco, a fonte primária era "a ativa mais antiga por
   `created_at`". No arquivo passa a ser **a primeira ativa na ordem do array** —
   determinística e visível a olho nu na revisão do diff.
2. **`snake_case` deixa de existir.** O arquivo nasce no formato de domínio (`responsavel1`),
   o que elimina a função de mapeamento `responsavel_1 → responsavel1`.

## Arquitetura: `lib/supabase.ts` → `lib/catalogo.ts`

Toda a lógica de casamento de grupo — duramente ajustada em produção — **permanece
literalmente igual**: `segmentarGrupo` (split por `;`), `casaSegmento` (contenção com guarda
de 3 caracteres), `gruposQueCasam` (exato tem precedência sobre contenção), `fontePrimariaDe`
e a integração com `sugerirGrupos`.

O que sai: o parâmetro `client`, o `async`, o tratamento de `error` do PostgREST e o comentário
sobre o embed `grupos→fontes` (que existia para contornar uma instabilidade do PostgREST).

```ts
export function resolverGrupoEFonte(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): FonteResolvida

export function listarGruposComFonte(
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): GrupoCadastro[]

export function buscarFontePrimaria(
  grupoNome: string,
  catalogo: readonly GrupoCatalogo[] = CATALOGO,
): string | undefined
```

O parâmetro `catalogo` com valor padrão é o ponto de injeção dos testes — substitui o
`fakeClient` atual sem que nenhum caso de teste precise ser repensado.

`FonteResolvida` continua exportado da mesma camada (agora `lib/catalogo.ts`), mantendo o
import de `lib/analise.ts` com apenas troca de caminho.

## Mudanças por arquivo

| Arquivo | Mudança |
|---|---|
| `data/catalogo.ts` | **Novo.** 33 grupos com responsáveis e fontes |
| `lib/catalogo.ts` | **Novo.** Substitui `lib/supabase.ts`, que é removido |
| `scripts/gerar-catalogo.mjs` | **Novo.** Lê `data/apply-all.sql`, emite `data/catalogo.ts` |
| `lib/analise.ts:26` | `resolverFonte` passa de `=> Promise<FonteResolvida>` para `=> FonteResolvida`. O `await deps.resolverFonte(...)` existente segue válido — `await` sobre valor não-promise é legal |
| `app/api/analise/route.ts` | Remove `criarClienteServidor()`; `resolverFonte: resolverGrupoEFonte` |
| `app/grupos/page.tsx` | Remove `try/catch` e o banner de erro — não resta caminho de falha. É o que conserta a tela |
| `tests/catalogo.test.ts` | Renomeado de `tests/supabase.test.ts`; `fakeClient([...])` vira o array direto |
| `package.json` | Remove `@supabase/supabase-js` |
| `.env.example` | Remove `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `CLAUDE.md`, `README.md` | Stack, layout, princípios e setup |

## Geração e manutenção dos dados

`scripts/gerar-catalogo.mjs` converte `data/apply-all.sql` → `data/catalogo.ts`. É executável
e conferível **hoje**, sem depender de `Organização Contatos - 2026.xlsx`, que não está no
repositório.

A partir daí, **`data/catalogo.ts` é a fonte da verdade**, editada diretamente. Cadastrar uma
URL nova passa a ser: editar o array, commitar, deploy. Hoje já era editar arquivo e commitar
— com o passo manual extra de colar SQL no console do Supabase, que agora desaparece.

Se a planilha de organização mudar por inteiro, o caminho continua existindo em duas etapas:
`gerar-seed.mjs` (XLSX→SQL) e depois `gerar-catalogo.mjs` (SQL→TS).

## Testes

Os 20 casos de `tests/supabase.test.ts` migram na íntegra — eles exercitam a lógica de
casamento, que não muda. Só o *fixture* troca de forma: de `fakeClient([...])` para o array.

Acrescentam-se testes de integridade sobre o catálogo **real**, hoje inexistentes, como rede
de proteção contra uma regeneração defeituosa:

- o catálogo não está vazio e tem 33 grupos;
- todo grupo tem `nome` não-vazio;
- toda fonte tem URL começando em `http://` ou `https://`;
- nenhum nome de grupo se repete.

## Limpeza e histórico

**Removido:** `@supabase/supabase-js`, `lib/supabase.ts`, as 3 variáveis de ambiente Supabase.

**Consequência boa:** o app passa a rodar com **zero variáveis de ambiente obrigatórias** —
só a `ANTHROPIC_API_KEY`, que já era opcional.

**Mantido como histórico**, com nota explícita no README de que não fazem mais parte do
caminho de execução: `supabase/migrations/`, `data/*.sql`, `scripts/apply-migrations.mjs` e a
dependência de desenvolvimento `pg`. Custo zero em runtime; preserva a proveniência do schema
e deixa o caminho aberto caso um banco volte a ser necessário.

**Ações fora do código, do lado do Clovis:** apagar as 3 variáveis Supabase nas configurações
do projeto na Vercel e liberar o slot no Supabase.

## Efeito na visão local

Deixa de existir setup. `npm install && npm run dev` basta: sem Docker, sem Postgres, sem
`.env.local`. Os PostgreSQL 17 e 18 instalados na máquina do Clovis passam a ser irrelevantes
para este projeto.

## O que este spec não altera

Raspagem (`lib/scrape.ts`), matching (`lib/match.ts`), normalização (`lib/normalize.ts`),
parse de planilha (`lib/planilha.ts`), Camada IA (`lib/gemini.ts`), upload no cliente e
exportação permanecem intocados. A suíte de testes dessas áreas continuar verde é o critério
de que a troca foi cirúrgica.

Permanecem válidos: `2026-06-14-camada1-base-ia-refinamento.md`,
`2026-06-06-extracao-estruturada-auditoria-por-campo-design.md` e
`2026-06-06-upload-no-cliente-e-resiliencia.md`.

## Trade-offs aceitos

- **Editar o catálogo exige deploy.** Não há mais como corrigir uma URL por SQL sem publicar.
  Aceitável: o app é single-user, o deploy da Vercel leva ~1 minuto e a alteração passa a ficar
  registrada em git com autoria e data — o que o SQL Editor não dava.
- **Sem UI de administração.** Nunca houve; o cadastro sempre foi manual e assim continua.
- **O catálogo cresce dentro do bundle.** Irrelevante nesta ordem de grandeza: 54 linhas. Se um
  dia chegar a milhares de registros ou passar a exigir escrita, a decisão deve ser revista —
  e `lib/catalogo.ts` é a fronteira única onde essa troca aconteceria.
