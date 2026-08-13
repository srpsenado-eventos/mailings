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
- **Catálogo:** `data/catalogo.ts` — arquivo TypeScript versionado com os grupos e as URLs oficiais. **Sem banco de dados**; sem histórico de análises
- **Planilha:** SheetJS
- **Scraping:** `fetch` + `cheerio` + `@mozilla/readability` + `jsdom`
- **Matching:** `fuse.js` + `string-similarity` (camada determinística) · Anthropic Claude Haiku (Camada B opcional: extração estruturada da composição)
- **Testes:** Vitest

## Setup local

> Pré-requisitos: Node 20+.

```bash
npm install
npm run dev
# abre em http://localhost:3000
```

Não há banco para configurar nem variável de ambiente obrigatória.

### Testes

```bash
npm test          # uma rodada
npm run test:watch # vitest em watch
npm run typecheck  # tsc --noEmit
```

## Variáveis de ambiente

Ver [.env.example](.env.example). Resumo:

| Variável | Obrigatória? | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | não | Ativa a Camada B (Claude Haiku): extração estruturada da composição. Sem ela, só a camada determinística roda. |

## Cadastro de URLs oficiais

O cadastro das URLs por órgão é **manual**: o arquivo [data/catalogo.ts](data/catalogo.ts) é a fonte da verdade. Para adicionar um órgão novo, acrescente uma entrada no array e commite — o `tsc` valida no build. A primeira fonte com `ativo: true` é a primária do grupo.

Por que manual? Cada URL oficial é checada antes de entrar — é o que garante que a comparação não vai trazer lixo de notícias, Wikipedia ou páginas antigas.

> **Histórico:** `supabase/migrations/`, `data/*.sql` e `scripts/apply-migrations.mjs` são resquícios da fase em que o catálogo vivia num Postgres no Supabase. Ficam no repositório como registro de proveniência e **não fazem parte do caminho de execução**. Ver [o spec da migração](docs/superpowers/specs/2026-08-13-catalogo-em-arquivo-sem-banco.md).

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
