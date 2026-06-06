# Camada B (Gemini grounding) como fallback para fonte inacessível/sem-fonte

**Data:** 2026-06-06
**Status:** Aprovado (decisão do Clovis: "Camada B (Gemini) — recomendado")
**Relacionado:** §7.3 de [2026-06-04-fiscal-de-mailings-design.md](2026-06-04-fiscal-de-mailings-design.md) · [2026-06-05-fonte-inacessivel-e-scrape-resiliente.md](2026-06-05-fonte-inacessivel-e-scrape-resiliente.md)

## Problema

O grupo **CNJ** aparecia como "(sem fonte cadastrada)" mesmo com a fonte cadastrada. Duas camadas:

1. **Nome não bate.** A planilha manda a sigla `CNJ`; o banco cadastra `Conselho Nacional de Justiça
   (CNJ)`. O match exigia igualdade total do segmento com o nome completo → falso "sem fonte". (O STF
   só funcionava porque a planilha dele usa o rótulo idêntico `Ministros do STF`.)
2. **WAF/403.** Confirmado: `https://www.cnj.jus.br/composicao-atual/` responde **HTTP 403** a IP de
   datacenter — igual ao STJ. Mesmo corrigindo o nome, o `fetch` falha.

## Decisão

### Fase 1 — Resolução de fonte por nome flexível (`lib/supabase.ts`)
Match **exato-primeiro, contenção-como-fallback**: se algum grupo casa exatamente um segmento, só
esses contam (preserva STF); senão, casa por contenção (a sigla curta cabe no nome formal — `"cnj"` ⊂
`"conselho nacional de justica (cnj)"`), com guarda de tamanho mínimo (≥3) para evitar que pedaços de
1–2 letras casem grupos longos por engano. Novo `resolverGrupoEFonte` devolve `{ grupoCanonico, url? }`
(o nome canônico é necessário para a 2ª etapa).

### Fase 2 — Fallback Camada B (2ª etapa do §7.3)
Quando a fonte oficial está **inacessível** (scrape falhou) **ou ausente** (grupo casado sem URL), o
orquestrador chama `pesquisarFonteAmpla(grupoCanonico)` (`lib/gemini.ts`): o Gemini, com **Google
Search grounding**, devolve a composição ATUAL como `ConteudoFonte`, e o matcher determinístico compara
contra ela. O veredito é marcado **`origem: "pesquisa_ampla"`** e o grupo recebe
**`viaPesquisaAmpla: true`** — sinalizado na UI como verificação complementar (não oficial), preservando
a URL oficial para conferência manual.

Ordem (respeitando "fonte primária antes da ampla"): 1ª = URL oficial (sempre tentada); 2ª = pesquisa
ampla **só** quando a 1ª não resolve, e **só** com `GEMINI_API_KEY`. Sem chave, degrada para "fonte
inacessível" honesto — sem quebrar.

**PII:** a 2ª etapa envia ao Gemini **apenas o nome do grupo** (dado público) — nunca os contatos da
planilha. A composição vem do Gemini e a comparação é local.

**Caveat técnico corrigido:** `criarClientePadrao` usava `googleSearch` + `responseMimeType:
"application/json"` juntos — combinação que a API rejeita (provável causa de a Camada B degradar
silenciosamente mesmo com chave). Agora não se força `responseMimeType` com grounding; pede-se JSON no
prompt e faz-se parse tolerante (`extrairJson`, remove cercas ```` ```json ````). Vale para `refinarComGemini`
e `pesquisarFonteAmpla`.

## Config
`GEMINI_API_KEY` definida **server-side** na Vercel (nunca commitar; nunca em `NEXT_PUBLIC_`).

## Fora de escopo (decisão registrada)
- **Bypass direto do WAF (Firecrawl/Puppeteer/Playwright/proxy):** recusado — contraria a regra do MVP
  no CLAUDE.md. A 2ª etapa do Gemini é o caminho sancionado para fontes que bloqueiam o IP do servidor.
- **Concorrência de muitos grupos** (`Promise.all` sem limite): risco latente; uso real é ~1 grupo por
  upload.
