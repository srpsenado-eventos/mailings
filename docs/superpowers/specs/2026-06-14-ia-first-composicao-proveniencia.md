# IA-first: composição com proveniência + auditoria por campo

**Data:** 2026-06-14
**Status:** Aprovado (brainstorming com o Clovis)
**Relacionado:** [2026-06-14-camada-b-anthropic-haiku.md](2026-06-14-camada-b-anthropic-haiku.md) · [2026-06-06-extracao-estruturada-auditoria-por-campo-design.md](2026-06-06-extracao-estruturada-auditoria-por-campo-design.md)

## Problema

Com a Camada B (Claude Haiku) em produção, o caso do **TCU** expôs limites:
`https://portal.tcu.gov.br/autoridades` é **renderizado por JavaScript** — `fetch` + cheerio baixa só o
esqueleto, sem nomes. Como o Haiku extrai do **texto raspado**, ele volta vazio → `pessoas: []` → todos
os ministros do TCU viram 🔴 "nome → fonte não informa". Além disso, 4 pedidos do Clovis:

1. A IA deve devolver o **nome oficial** (como aparece no site) e tentar buscar o **endereço**, com isso destacado.
2. **Frear a raspagem determinística** que lê todos os nomes da página e os trata como "novos" — concentrar só nas autoridades.
3. Melhorar a **semântica das divergências**: hoje só "fonte não informa". Distinguir (a) pessoa que saiu, (b) nome divergente, (c) campo ausente.
4. A IA pode fazer uma **2ª busca** (pelos nomes/composição) quando a página não entrega.

## Decisões (brainstorming)

- **Campos:** nome oficial + cargo sempre; **endereço** a IA tenta buscar (melhor-esforço) e informa com origem; telefone/e-mail só quando a fonte tiver.
- **Fonte sem dados (JS/bloqueio):** a IA **completa pelo conhecimento**, com a **origem de cada dado rotulada**: `pagina` (verificado) vs `conhecimento` (confira). Resolve o TCU e elimina o ruído de "novos".
- **Nome:** o **site oficial é o parâmetro** — nome da planilha que diferir do oficial vira divergência (valor correto = nome do site).
- **Economia:** **uma chamada Haiku por grupo** (não por pessoa); só com `ANTHROPIC_API_KEY`; sem chave → determinístico.

## Arquitetura

### 1. Modelo (`lib/types.ts`)
- `type OrigemDado = "pagina" | "conhecimento";`
- `PessoaSite`: `{ nome, cargo?, endereco?, origem: OrigemDado, contexto? }`.
- `ComparacaoCampo`: acrescenta `origemValor?: OrigemDado` (UI mostra "✓ oficial" vs "≈ via IA — confira").
- `ResultadoContato`: acrescenta `possivelSaida?: boolean` (não consta na fonte — separa de "campo ausente").

### 2. Chamada única do Haiku (`lib/gemini.ts`)
Substitui `extrairComposicaoGemini(textoLimpo)` por `extrairComposicao(grupoCanonico, textoLimpo)` que
faz **uma** chamada e devolve `PessoaSite[]`:
- Prompt: dado o nome do grupo + o texto raspado (pode estar vazio/parcial), liste a composição ATUAL
  só de **pessoas reais** (ignore menu/seções). Para cada uma: `nome` (como no site), `cargo`,
  `endereco` (se souber), e `origem` = `pagina` quando o dado veio do texto, `conhecimento` quando veio
  do conhecimento do modelo. Endereço institucional pode ser único para o órgão.
- Responde JSON `[{nome, cargo, endereco, origem}]`; parse tolerante (`extrairJson`); narrow seguro.
- Sem chave / falha / lista vazia → `[]` (degrada para o determinístico).
- A `pesquisarFonteAmpla` (2ª etapa para scrape que falhou) é absorvida por esta função (passa o texto
  que houver; vazio → conhecimento). `URL_PESQUISA_AMPLA` segue como sentinela de origem não-oficial.

### 3. Orquestrador (`lib/analise.ts`)
- `enriquecerPessoas(fonte)` chama `extrairComposicao(grupoCanonico, fonte.textoLimpo)`. Precisa do
  `grupoCanonico` → estender a dep para receber a fonte **e** o nome canônico do grupo.
- **Gatilho do fallback:** hoje a 2ª etapa só dispara em erro de scrape. Passa a disparar também quando
  a extração rende **0 pessoas** (caso TCU: HTTP 200 mas página vazia) → chama `extrairComposicao` que
  completa pelo conhecimento.
- Sem chave → mantém o determinístico (`compararGrupo` sobre as `pessoas` do scrape).

### 4. Matching + auditoria por campo (`lib/match.ts`)
- Casa contato↔pessoa por tokens de nome (inalterado).
- **Casado:** monta `comparacoes` para `nome` (planilha × `pessoa.nome`; site é parâmetro → confere só
  se igual normalizado, senão divergente), `cargo` (por papel, já calibrado), `endereco` (×
  `pessoa.endereco`, com `origemValor`), `telefone`/`email` (só se a pessoa tiver). Cada `ComparacaoCampo`
  herda `origemValor = pessoa.origem` (e endereço pode ter origem própria).
- **Não casado:** `possivelSaida: true`, semáforo 🔴, observação "Não consta na fonte (possível saída)"
  — **não** usa "fonte não informa".
- Pessoa da IA sem contato correspondente → `novos` (limpo).

### 5. Saída / UI (`lib/export.ts`, `components/resultado-tabela.tsx`)
- Colunas (export e tabela): `Nome (planilha)` | `Nome (site)` | `Cargo (planilha)` | `Cargo (site)` |
  `Endereço (planilha)` | `Endereço (site)`.
- Cada valor do site exibe a origem: "✓ oficial" (`pagina`) ou "≈ via IA — confira" (`conhecimento`).
- Status "possível saída" distinto da divergência de campo.

### 6. PII
A chamada envia o **texto público raspado** + nome do grupo; nunca os contatos da planilha. Sem PII em log.

## Testes
- `gemini`: `extrairComposicao` com cliente fake → `PessoaSite[]` com `origem` mista; sem chave → `[]`;
  parse tolerante.
- `analise`: extração 0 pessoas dispara o fallback por conhecimento; com chave troca as pessoas.
- `match`: nome auditado contra o site (parâmetro); endereço com `origemValor`; "possível saída" ≠
  "fonte não informa"; cargo por papel (mantém).
- `export`: colunas largas com Nome/Cargo/Endereço (planilha × site) + origem.

## Fora de escopo (follow-up)
- Busca web ao vivo (web search tool da Anthropic) para confirmar dados de `conhecimento`.
- Renomear `lib/gemini.ts` → `lib/ia.ts`; remover `@google/genai`.
