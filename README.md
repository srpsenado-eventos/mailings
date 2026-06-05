# Fiscal de Mailings

Ferramenta interna do Senado Federal para auditar a base de autoridades do **Sistema Contatos** contra as listas oficiais publicadas nos sites dos próprios órgãos.

> Você sobe a planilha exportada do Sistema Contatos. O app cruza cada registro com a página oficial do órgão e aponta o que mudou: cargo desatualizado, endereço diferente, autoridade que saiu, nome novo que entrou.

## Como funciona

1. **Carregue** a planilha XLSX exportada do Sistema Contatos.
2. O app **agrupa** os registros por órgão (coluna `Grupo`) e busca a URL oficial cadastrada.
3. Para cada órgão, **raspa** a página oficial, extrai a lista atual e **compara** campo a campo com a planilha.
4. Você recebe uma **tabela com semáforo** (🟢 ok · 🟡 revisar · 🔴 divergência · ✨ novo) e pode **exportar em XLSX/CSV**.

## Stack

- **Frontend/runtime:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Hospedagem:** Vercel
- **Banco:** Supabase (Postgres) — apenas catálogo de órgãos e URLs oficiais; **sem histórico de análises**
- **Planilha:** SheetJS
- **Scraping:** `fetch` + `cheerio` + `@mozilla/readability` + `jsdom`
- **Matching:** `fuse.js` + `string-similarity` (camada determinística) · `@google/genai` Gemini Flash (camada opcional para casos ambíguos)
- **Testes:** Vitest

## Setup local

> Pré-requisitos: Node 20+, pnpm, conta Supabase, conta Vercel (para deploy).

```bash
pnpm install
cp .env.example .env.local
# preencher .env.local com as chaves do Supabase
```

### Banco

```bash
# aplicar migrations e seed inicial de órgãos/URLs
supabase db push
psql "$DATABASE_URL" -f data/seed-orgaos.sql
```

### Dev

```bash
pnpm dev
# abre em http://localhost:3000
```

### Testes

```bash
pnpm test         # vitest watch
pnpm test:ci      # uma rodada + cobertura
```

## Variáveis de ambiente

Ver [.env.example](.env.example). Resumo:

| Variável | Obrigatória? | Para que serve |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | sim | Chave pública do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | sim (server) | Chave de serviço para queries server-side |
| `GEMINI_API_KEY` | não | Ativa a camada B de matching (Gemini Flash). Sem ela, só a camada determinística roda. |

## Cadastro de URLs oficiais

O cadastro das URLs por órgão é **manual**: o arquivo [data/seed-orgaos.sql](data/seed-orgaos.sql) é a fonte da verdade. Para adicionar um órgão novo, edite o seed (ou crie uma nova migration em `supabase/migrations/`) e aplique no banco.

Por que manual? Cada URL oficial é checada antes de entrar — é o que garante que a comparação não vai trazer lixo de notícias, Wikipedia ou páginas antigas.

## Escopo do MVP

**Inclui**
- Upload de XLSX e análise stateless.
- Cruzamento por nome/cargo/endereço/contato.
- Detecção de "possível saída" e "possível novo".
- Exportação XLSX/CSV.

**Não inclui** (avaliado em iterações futuras)
- Histórico de análises.
- Edição em massa do Sistema Contatos.
- Descoberta automática de URLs.
- Câmara dos Deputados, legislativos estaduais/municipais.
- Auth multi-usuário, RLS, multi-tenant.

## Documentação

- **Spec do MVP:** [docs/superpowers/specs/2026-06-04-fiscal-de-mailings-design.md](docs/superpowers/specs/2026-06-04-fiscal-de-mailings-design.md)
- **Convenções para o Claude Code:** [CLAUDE.md](CLAUDE.md)
