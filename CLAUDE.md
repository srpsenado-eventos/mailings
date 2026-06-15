# CLAUDE.md — Fiscal de Mailings

Instruções específicas deste projeto para o Claude Code. Convenções globais do usuário (testing, coding-style, security, agents) já vêm de `~/.claude/rules/ecc/common/` e **não** são repetidas aqui.

## Contexto rápido

Web app interno do Senado Federal que confronta o **Sistema Contatos** (planilha XLSX de autoridades) com as **listas oficiais publicadas nos sites dos órgãos**, apontando divergências. Single-user, MVP stateless (sem histórico no banco).

Especificação aprovada: [docs/superpowers/specs/2026-06-04-fiscal-de-mailings-design.md](docs/superpowers/specs/2026-06-04-fiscal-de-mailings-design.md). **Toda decisão arquitetural deve ser conferida nesse documento antes de ser alterada.**

## Stack (fixa)

Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui · Supabase (Postgres) · SheetJS · cheerio + readability + jsdom · fuse.js + string-similarity · Anthropic Claude Haiku (Camada B opcional, via `fetch` na Messages API) · Vitest · Vercel.

Não trocar dependências sem registrar a decisão num novo doc em `docs/superpowers/specs/`.

## Princípios de implementação

- **`lib/*.ts` são funções puras.** Sem JSX, sem chamadas a hooks, sem acesso direto a `window`. Recebem dados, devolvem dados.
- **UI sem lógica de negócio.** Componentes em `components/` só renderizam e disparam Server Actions.
- **Server Components por padrão.** Marcar `"use client"` só quando exigir estado/efeito real.
- **Sem PII no log.** Nomes, telefones, e-mails das autoridades nunca aparecem em `console.log`, Sentry, ou prompt do Gemini sem necessidade — quando aparecem, é mínimo e justificado.
- **Camada A antes da B.** O determinístico roda sempre. A IA (Claude Haiku) é opcional: `extrairComposicao(grupoCanonico, textoLimpo)` faz UMA chamada que devolve a composição com `origem` por registro ("pagina" vs "conhecimento"). Sem `ANTHROPIC_API_KEY`/erro → cai no determinístico. Ver `docs/superpowers/specs/2026-06-14-ia-first-composicao-proveniencia.md`.
- **Fonte primária antes da ampla.** 1ª etapa = URL oficial raspada → a IA extrai dela; quando a página não entrega (JS, ex.: TCU) ou está bloqueada, a IA completa pelo conhecimento, e cada dado vem rotulado com a origem ("✓ oficial" vs "≈ via IA — confira"). Nome auditado contra o site (parâmetro); quem não consta vira "possível saída" (≠ "fonte não informa").
- **Sem histórico no banco.** Não criar tabelas tipo `analises`, `uploads`, `runs`. Resultado da análise vive em memória durante a request e é devolvido ao cliente.
- **Fontes cadastradas manualmente** em `data/seed-orgaos.sql` e em novas migrations. Não implementar **cadastro/descoberta automática de URLs** — a pesquisa ampla da 2ª etapa é leitura efêmera e nunca persiste URLs.

## Layout do código

```
app/         ← rotas Next.js (Server Components por padrão)
components/  ← UI (shadcn/ui + composições)
lib/         ← lógica pura: planilha, supabase, scrape, match, gemini, normalize
supabase/migrations/  ← schema versionado
data/        ← seeds SQL (fontes cadastradas pelo Clovis)
tests/       ← Vitest, espelha lib/ e components/
docs/superpowers/specs/  ← decisões arquiteturais datadas
```

## Convenções de código

- **Imutabilidade:** funções de `lib/` nunca mutam input. Retornar novo objeto/array. (já é regra global, reforçada aqui pelo perfil de matching/normalização.)
- **Normalização centralizada** em `lib/normalize.ts`. Não reimplementar `lowercase + sem acento + sem tratamento` em outros arquivos.
- **Erros explícitos.** Funções de `lib/` lançam erro tipado quando dado de entrada é inválido. Server Actions capturam e devolvem `{ ok: false, message }` para o cliente.
- **Sem `any`.** Use `unknown` + narrowing, ou defina o tipo.
- **Schema do XLSX** validado na entrada de `lib/planilha.ts`. Colunas esperadas (case-insensitive, com normalização): `Foto`, `Tratamento`, `Endereçamento`, `Nome`, `Telefone`, `E-mail`, `Rede Social`, `Endereço`, `Órgão`, `Cargo`, `Departamento`, `Grupo`. Coluna ausente = erro claro pro usuário, não fallback silencioso.
- **Upload com parse no cliente.** A planilha é lida **no navegador** (`lerPlanilha` é pura/isomórfica) e só o texto (`ContatoPlanilha[]`) viaja. O app aceita **`.xlsx` e `.csv`**; o `/api/analise` recebe **JSON** `{ arquivoNome, contatos }`, não mais arquivo. Isso evita o limite de ~4,5 MB de corpo da plataforma (fotos embutidas não trafegam). Ver `docs/superpowers/specs/2026-06-06-upload-no-cliente-e-resiliencia.md`.
- **Raspagem estruturada + auditoria por campo.** `extrairConteudo` produz `ConteudoFonte.pessoas: PessoaSite[]` (não um blob): insere separadores entre blocos e filtra rótulos. O matching casa contato↔pessoa por **tokens de nome** e compara campo a campo (`ComparacaoCampo`: `confere`/`divergente`/`fonte_nao_informa`), preenchendo o valor correto do site; pessoa casada sai do pool → "novos" limpos. Ver `docs/superpowers/specs/2026-06-06-extracao-estruturada-auditoria-por-campo-design.md`.

## Testes

- Cobertura mínima 80% (regra global). Foco prioritário em `lib/normalize.ts`, `lib/match.ts`, `lib/planilha.ts` — são o coração do produto.
- Padrão AAA. Nomes descritivos em português.
- Sem testes que dependem de internet real. `lib/scrape.ts` é testado com HTML fixture em `tests/fixtures/`.

## Workflow

1. Mudança arquitetural → atualizar/criar doc em `docs/superpowers/specs/` antes de codar.
2. Mudança de schema → nova migration em `supabase/migrations/` (nunca editar migration antiga aplicada).
3. Nova URL oficial cadastrada pelo Clovis → adicionar em `data/seed-orgaos.sql` (ou nova migration se já estiver em produção).
4. Antes de PR: rodar `pnpm test` + `pnpm typecheck` + `pnpm lint`.

## O que NÃO fazer

- Não adicionar autenticação complexa, multi-tenant, RLS — está fora do MVP.
- Não escrever em tabelas além das 3 do schema (`grupos`, `orgaos`, `fontes`).
- Não persistir resultados de análise.
- Não usar Firecrawl, Puppeteer, Playwright para scraping no MVP — só `fetch` + `cheerio` + `readability`.
- Não cadastrar URLs descobertas por busca/IA — Clovis fornece manualmente.
