# Fiscal de Mailings — Design (MVP)

**Status:** Aprovado para implementação
**Data:** 2026-06-04
**Autor:** Clovis Sabino (Senado Federal)
**Origem:** sessão `superpowers:brainstorming` em 2026-06-04, ratificada em 2026-06-04 com duas decisões finais (sem histórico no banco; fontes cadastradas manualmente).

---

## 1. Contexto e problema

O Senado Federal mantém o **Sistema Contatos**, base interna com dados cadastrais de **autoridades** (informações públicas: nome, tratamento, cargo, órgão, endereço, telefone, e-mail, rede social, etc.). Esses dados envelhecem rapidamente — autoridades mudam de cargo, trocam de endereço, novos nomes entram e antigos saem.

Hoje não existe um controle preventivo que confronte essa base com a realidade publicada nos sites oficiais dos órgãos. A consequência é o envio de mailings, ofícios e convites para destinatários desatualizados.

## 2. Objetivo do MVP

Web app onde o usuário **sobe uma planilha XLSX** exportada do Sistema Contatos, e o sistema:

1. Agrupa os registros por **órgão** (coluna `Grupo` da planilha = instituição). No upload, o app já exibe a **URL oficial primária** mapeada para cada grupo (vinda do cadastro), antes de rodar.
2. Para cada órgão, **busca a URL oficial cadastrada** (lista de autoridades / dirigentes) e a usa como **fonte primária (1ª etapa, sempre)**.
3. **Raspa** a página oficial e extrai a lista atual de pessoas. Quando a página oficial não resolve um caso (pessoa ausente, dado faltante, ambiguidade), aciona uma **pesquisa ampla complementar (2ª etapa, opcional)** para enriquecer — ver §7.3. Essa etapa **nunca cadastra URLs novas**; é leitura complementar.
4. **Compara** cada registro da planilha com a lista oficial e aponta:
   - **Divergências de campo** (nome político vs. nome completo, cargo, endereço, contato).
   - **Possíveis saídas** (pessoa na planilha que não aparece no site).
   - **Possíveis entradas** (pessoa no site que não aparece na planilha).
5. Apresenta um **relatório tabular com semáforo** (verde = ok, amarelo = revisar, vermelho = divergência forte) e permite **exportar XLSX/CSV**.

## 3. Não-objetivos (out of scope do MVP)

- **Histórico de análises** — cada upload é stateless. Banco guarda apenas catálogo de órgãos/fontes.
- **Edição em massa** ou correção automática do Sistema Contatos. O app **reporta**; correção é manual no sistema de origem.
- **Cadastro automático de fontes.** Nenhuma URL é persistida pela máquina — Clovis cadastra cada URL oficial manualmente. (A *pesquisa ampla complementar* da 2ª etapa é leitura efêmera e **não** persiste URLs; ver §7.3.)
- **Câmara dos Deputados** está fora do escopo inicial.
- **Multi-tenant / múltiplos usuários com permissões.** MVP é single-user.
- **Autenticação complexa.** Acesso restrito por nível de Vercel/Supabase no MVP.

## 4. Fluxo do usuário

```
[1] Tela inicial → botão "Carregar planilha (.xlsx)"
       ↓
[2] App lê a planilha (SheetJS), valida colunas obrigatórias,
    agrupa por coluna "Grupo" (= órgão / instituição)
       ↓
[3] Para cada grupo, consulta tabela `fontes` no Supabase e EXIBE a URL
    oficial primária que será usada (confirmação visual antes de rodar)
    - Se houver URL cadastrada → entra na fila de scraping (fonte primária)
    - Se NÃO houver → marca o grupo como "sem fonte cadastrada"
       ↓
[4] Pipeline server-side (Route Handler / Server Action):
    - 1ª etapa (sempre): fetch + cheerio + readability na URL oficial
      → extrai texto/HTML estruturado
      Heurística: <strong>/<b> para nome político, <p>/<li> para detalhes
    - 2ª etapa (opcional, só p/ casos não resolvidos e só com GEMINI_API_KEY):
      pesquisa ampla via grounding Google Search do Gemini (plano grátis)
      → enriquece casos ambíguos; degrada silenciosamente se ausente/falhar
       ↓
[5] Motor de comparação:
    A) Camada determinística (SEMPRE roda)
       - fuse.js / string-similarity sobre nome, cargo, endereço
       - Normalização (acentos, caixa, sufixos "Dr./Sr./Exmo.")
    B) Camada Gemini Flash (SÓ se GEMINI_API_KEY estiver definida)
       - Resolve casos ambíguos da camada A
       - Usa @google/genai com prompt curto, sem dados pessoais sensíveis no log
       ↓
[6] Renderiza tabela com semáforo + botão "Exportar XLSX/CSV"
```

## 5. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (cliente)                                           │
│  ─ upload de XLSX, render da tabela, export                  │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   │  upload via Server Action / Route Handler
                   ▼
┌──────────────────────────────────────────────────────────────┐
│  Next.js 15 server (Vercel)                                  │
│  ─ lib/planilha.ts   → parse + validação XLSX (SheetJS)      │
│  ─ lib/supabase.ts   → busca fontes por grupo                │
│  ─ lib/scrape.ts     → fetch + cheerio + readability         │
│  ─ lib/match.ts      → camada A (determinística)             │
│  ─ lib/gemini.ts     → camada B (opcional)                   │
└──────────────────┬───────────────────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────┐      ┌─────────────────────┐
│  Supabase    │      │  Sites oficiais     │
│  (postgres)  │      │  (HTML público)     │
│  catálogo de │      │                     │
│  fontes      │      │                     │
└──────────────┘      └─────────────────────┘
```

## 6. Schema Supabase

Três tabelas, todas em `public`. Sem RLS no MVP (single-user). Sem tabelas de histórico ou de uploads.

```sql
-- 6.1 Grupos = instituição de alto nível (Senado Federal, STF, TCU, etc.)
create table public.grupos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  descricao   text,
  created_at  timestamptz not null default now()
);

-- 6.2 Órgãos = sub-unidade dentro de um grupo (Mesa Diretora, CCJ, etc.)
--     Opcional no MVP — pode ficar vazio se o grupo não tiver sub-divisão útil
create table public.orgaos (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  nome        text not null,
  descricao   text,
  created_at  timestamptz not null default now(),
  unique (grupo_id, nome)
);

-- 6.3 Fontes = URLs oficiais para raspar (lista de autoridades/dirigentes)
--     Atreladas ao grupo. Um grupo pode ter mais de uma URL.
create table public.fontes (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  url         text not null,
  tipo        text not null default 'lista_autoridades',
  descricao   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (grupo_id, url)
);

create index fontes_grupo_id_ativo_idx on public.fontes (grupo_id) where ativo;
```

**Chave de junção planilha ↔ fontes:** o campo `Grupo` da planilha bate com `grupos.nome`. A normalização (trim + lower + remoção de acentos) é responsabilidade da camada `lib/supabase.ts` na hora da consulta.

**Seed manual:** o arquivo `data/seed-orgaos.sql` carrega o catálogo inicial — Clovis indica cada URL oficial. Acréscimos posteriores via novas migrations em `supabase/migrations/`.

## 7. Motor de comparação

### Camada A — determinística (sempre)

Para cada par (registro da planilha × pessoa extraída do site):

1. **Normalização:** trim, lower, remoção de acentos, remoção de tratamentos (`Sr.`, `Sra.`, `Dr.`, `Exmo.`, `Senador`, `Deputado`, `Ministro`).
2. **Score por campo** usando `string-similarity` (Dice) e/ou `fuse.js` (fuzzy):
   - `nome` (peso alto)
   - `cargo` (peso médio)
   - `orgao` (peso médio)
3. **Match decision:**
   - Score combinado ≥ 0.85 → **MATCH**, comparar campos individualmente
   - 0.60 ≤ score < 0.85 → **AMBÍGUO**, joga pra Camada B se disponível, senão marca amarelo
   - Score < 0.60 → **SEM MATCH**

4. **Classificação final:**
   - 🟢 **Verde:** match forte, todos os campos batem.
   - 🟡 **Amarelo:** match com divergência leve (ex: cargo desatualizado, telefone diferente) ou ambíguo.
   - 🔴 **Vermelho:** divergência forte (ex: pessoa não está mais no site = possível saída).
   - ✨ **Novo:** pessoa no site sem correspondência na planilha.

### Camada B — Gemini Flash (opcional)

- Ativada **somente** se `GEMINI_API_KEY` estiver presente.
- Recebe um lote de casos ambíguos da camada A em prompt único.
- Prompt enxuto, sem PII sensível em log, sem retentativa silenciosa.
- Falha de API **não derruba** a análise — degradação silenciosa para o veredito da camada A.

### 7.3 Estratégia de fontes em duas etapas

A varredura de cada grupo segue uma **ordem fixa de fontes**:

1. **1ª etapa — fonte primária (sempre):** a URL oficial cadastrada (§6). É a única fonte usada quando não há `GEMINI_API_KEY`. Toda a Camada A roda sobre o conteúdo dela.
2. **2ª etapa — pesquisa ampla complementar (opcional):** acionada **apenas** para casos que a 1ª etapa deixou em aberto (pessoa não localizada na página oficial, dado faltante, ambiguidade da Camada A) **e somente** se `GEMINI_API_KEY` estiver presente. Usa **grounding com Google Search do Gemini** (incluído no plano gratuito) para buscar a informação atual em fontes públicas mais amplas.

Regras da 2ª etapa:
- **Custo zero:** roda dentro do plano gratuito do Gemini; sem chave, é simplesmente ignorada.
- **Não persiste URLs.** O resultado entra apenas no relatório da request atual; o cadastro de fontes continua manual.
- **Rastreabilidade:** quando um veredito vier da 2ª etapa, o relatório indica a origem (ex.: badge "pesquisa ampla" + link encontrado), distinta da fonte oficial.
- **Degradação graciosa:** indisponibilidade, limite de cota ou falha → o caso permanece com o veredito da 1ª etapa/Camada A.

## 8. UI

Telas (Next.js App Router):

- `/` — landing + botão de upload
- `/analise/[id]` (in-memory, não persistido) — tabela com colunas:
  | Grupo | Nome (planilha) | Nome (site) | Cargo (planilha) | Cargo (site) | Endereço (planilha) | Endereço (site) | Status |

  Cabeçalho da página: nome do arquivo, total de registros, contagem por semáforo, botão **Exportar XLSX/CSV**.

- Filtros: por grupo, por status (semáforo), por "só novos", por "só saídas".

Componentes via **shadcn/ui** (Table, Badge para semáforo, Button, Card, Select).

## 9. Estrutura de arquivos (planejada)

```
.
├── CLAUDE.md
├── README.md
├── .env.example
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-04-fiscal-de-mailings-design.md   ← este doc
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  ← upload
│   ├── analise/
│   │   └── [id]/page.tsx         ← tabela resultado
│   └── api/
│       └── analise/route.ts      ← POST: recebe XLSX, devolve JSON
├── components/
│   ├── upload-zone.tsx
│   ├── resultado-tabela.tsx
│   ├── semaforo-badge.tsx
│   └── export-buttons.tsx
├── lib/
│   ├── planilha.ts               ← parse XLSX + validação colunas
│   ├── supabase.ts               ← cliente + queries de fontes
│   ├── scrape.ts                 ← fetch + cheerio + readability
│   ├── match.ts                  ← camada A (determinística)
│   ├── gemini.ts                 ← camada B (opcional)
│   └── normalize.ts              ← util de normalização de texto
├── supabase/
│   └── migrations/
│       └── 0001_init.sql         ← schema da seção 6
├── data/
│   └── seed-orgaos.sql           ← URLs cadastradas pelo Clovis
└── tests/
    ├── planilha.test.ts
    ├── normalize.test.ts
    ├── match.test.ts
    └── scrape.test.ts
```

## 10. Stack

| Camada | Escolha |
|---|---|
| Runtime/framework | Next.js 15 (App Router) + TypeScript |
| Hospedagem | Vercel |
| Banco | Supabase (Postgres) |
| Estilo | Tailwind CSS + shadcn/ui |
| Planilha | SheetJS (`xlsx`) |
| Scraping | `node-fetch`/`fetch` nativo + `cheerio` + `@mozilla/readability` + `jsdom` |
| Matching determinístico | `fuse.js` + `string-similarity` |
| IA opcional | `@google/genai` (Gemini Flash) |
| Testes | Vitest |

## 11. Variáveis de ambiente

Ver `.env.example` na raiz. Resumo:

- **Obrigatórias:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Opcional:** `GEMINI_API_KEY` (ativa Camada B).

## 12. Considerações futuras (pós-MVP, NÃO implementar agora)

- Histórico de análises (cada upload vira um snapshot consultável).
- Descoberta semi-automática de novas URLs com tela de curadoria.
- Suporte à Câmara dos Deputados e legislativos estaduais/municipais.
- Auth + RLS multi-usuário.
- Alertas programados (cron que reroda análise da última planilha enviada).
- Diff visual lado-a-lado (HTML do site oficial vs. registro da planilha).
