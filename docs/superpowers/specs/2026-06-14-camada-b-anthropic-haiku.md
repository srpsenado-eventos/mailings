# Camada B via Anthropic (Claude Haiku) no lugar do Gemini

**Data:** 2026-06-14
**Status:** Aprovado (decisão do Clovis — billing do Gemini travou no cartão/Google; Haiku escolhido)
**Relacionado:** [2026-06-06-camada-b-fallback-pesquisa-ampla.md](2026-06-06-camada-b-fallback-pesquisa-ampla.md) · [2026-06-06-extracao-estruturada-auditoria-por-campo-design.md](2026-06-06-extracao-estruturada-auditoria-por-campo-design.md)

## Problema

A Camada B (extração estruturada + busca ampla) foi construída sobre o `@google/genai`. Em produção,
a conta Google travou no **pré-pagamento/verificação de cartão** (`OR_MIVEM_04`, `free tier limit: 0`),
então o Gemini nunca chegou a rodar. A extração estruturada — que conserta cargos errados (ex.:
Cármen/Gilmar) e mantém "novos" limpos — depende de uma IA que **a gente consiga pagar/usar de fato**.

## Decisão

Trocar o provedor da Camada B de **Gemini** para **Anthropic Claude Haiku** (`claude-haiku-4-5`).
Motivos: melhor qualidade em PT-BR e em saída estruturada para esta tarefa; processador de pagamento
diferente (Stripe), sem o bloqueio do Google; e o projeto já é construído no ecossistema Claude.

- **Modelo:** `claude-haiku-4-5` (Messages API da Anthropic).
- **Variável:** `ANTHROPIC_API_KEY` (server-side na Vercel; nunca `NEXT_PUBLIC_`, nunca commitada).
- **Sem nova dependência:** chamamos a Messages API via `fetch` (mantém o bundle leve), reaproveitando
  a abstração `GeminiCliente.gerarJson` e o parse tolerante `extrairJson` já existentes.
- **Degrada como antes:** sem `ANTHROPIC_API_KEY` ou em qualquer falha, a Camada B retorna vazio e o
  veredito determinístico (Camada A) prevalece. Princípio "Camada A sempre; B opcional" intacto.

### Escopo desta troca
- **`extrairComposicaoGemini(textoLimpo)`** (extração a partir do texto já raspado) → passa a chamar o
  Haiku. É o caminho que entrega o ganho principal (Cármen/Gilmar corretos, novos limpos). **Não precisa
  de busca web.**
- **`pesquisarFonteAmpla(grupoCanonico)`** (2ª etapa para fontes que bloqueiam o IP, ex.: STJ 403):
  o Haiku não tem grounding ao vivo como o `googleSearch`. Mantida **funcional pelo conhecimento do
  modelo** (Haiku lista a composição que conhece), com o prompt instruído a devolver lista vazia se
  não souber com confiança. O resultado é **rotulado como "pesquisa ampla" / não oficial**
  (`viaPesquisaAmpla`), então o usuário confere. Grounding ao vivo (web search tool) fica como
  follow-up.

## Implementação

- `lib/gemini.ts` (mantém o nome do arquivo por enquanto, para minimizar churn):
  - `geminiDisponivel()` → renomear para `iaDisponivel()` e checar `ANTHROPIC_API_KEY` (uso é interno).
  - `criarCliente(comBusca)` → implementação Anthropic via `fetch` na Messages API
    (`https://api.anthropic.com/v1/messages`, headers `x-api-key` + `anthropic-version`), modelo
    `claude-haiku-4-5`. `gerarJson` devolve `extrairJson(texto)`. (Parâmetro `comBusca` sem efeito por
    enquanto — sem grounding.)
  - `pesquisarFonteAmpla` → continua chamando a IA (Haiku, conhecimento do modelo), resultado rotulado
    como pesquisa ampla; degrada para `undefined` em falha/sem chave.
- Sem mudança em `lib/analise.ts`, `lib/match.ts`, `app/api/analise/route.ts` (a abstração já isola).
- Testes (`tests/gemini.test.ts`): os testes que injetam `cliente` fake continuam válidos (independem
  do provedor). Ajustar nomes (`geminiDisponivel` → `iaDisponivel`) e o teste de `pesquisarFonteAmpla`
  sem grounding.

## PII
Igual ao desenho anterior: a extração envia o **texto público já raspado**; nunca os contatos da
planilha. Nada de PII em log.

## Follow-up (não nesta entrega)
- Reativar a 2ª etapa (fontes bloqueadas por IP, ex.: STJ) usando o **web search tool da Anthropic**.
- Renomear `lib/gemini.ts` → `lib/ia.ts` e funções, quando o provedor estabilizar.
