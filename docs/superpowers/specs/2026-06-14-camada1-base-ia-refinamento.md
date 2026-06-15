# Camada 1 (determinística) como base + Camada 2 (IA) como refinamento/cobertura

**Data:** 2026-06-14
**Status:** Aprovado
**Substitui parcialmente:** `2026-06-14-ia-first-composicao-proveniencia.md` (inverte a ordem das camadas)

## Problema

O TCU voltou **todos os ministros como "possível saída"** mesmo estando claramente na
página oficial. Diagnóstico em produção:

- **STF** (`portal.stf.jus.br`) entrega os nomes como **HTML** → o raspador lê → Camada 1
  determinística casa → verde. Correto.
- **TCU** (`portal.tcu.gov.br/autoridades`) responde HTTP 200, mas **monta a lista por
  JavaScript**. `fetch` + `cheerio` (o MVP proíbe Puppeteer/Playwright) recebe uma **casca
  vazia** → zero nomes. A IA (`extrairComposicao`) também voltou `[]` (prompt conservador
  demais: *"se não souber, devolva []"*). Com a composição vazia, cada contato foi comparado
  contra uma lista vazia e marcado **"possível saída"**.

Dois defeitos:
1. **Alarme falso:** declaramos "possível saída" quando, na verdade, **não conseguimos ler a
   página**. Isso destrói a confiança na ferramenta.
2. A IA, que deveria cobrir o buraco das páginas JS, não cobriu.

## Decisão do usuário

A IA deve ser **refinamento em segundo plano**, não a fonte primária. A **Camada 1
determinística** (planilha × nomes realmente presentes no site oficial) é sempre a base.
Para páginas ilegíveis: **híbrido** — a IA completa pelo conhecimento, **sempre rotulada**
("≈ via IA — confira"); se a IA não souber, fica **"não verificado — confira manualmente"**,
**nunca "saída"**.

## Regra de ouro

> **"possível saída" só existe quando há uma composição real (página OU IA) que não contém a
> pessoa.** Sem composição em mãos → **"não verificado"** (indeterminado).

## Arquitetura

A legibilidade da fonte decide o caminho. Em `lib/analise.ts::analisarGrupo`:

```
pessoasPagina = fonteRaspada?.pessoas ?? []     // determinístico, origem "pagina"
pessoasIA     = await deps.extrairComposicao(grupoCanonico, textoLimpo)   // [] sem chave
composicao    = mesclarComposicao(pessoasPagina, pessoasIA, contatos)

if composicao.length === 0:
    if resolvida.url: marcarFonteInacessivel(grupo, contatos, url, motivo)   // "não verificado"
    else:             compararGrupo(grupo, contatos, undefined)              // semFonte
else:
    compararGrupo(grupo, contatos, { url, textoLimpo, destaques: [], pessoas: composicao })
    → viaPesquisaAmpla = composicao.some(origem === "conhecimento") || !resolvida.url
```

`motivo` quando a página foi buscada mas veio vazia: *"página não retornou conteúdo legível
(provável JavaScript)"*; quando o `raspar` lançou erro: o motivo técnico (`ScrapeError`).

### `mesclarComposicao(pessoasPagina, pessoasIA, contatos)` — nova função pura em `lib/match.ts`

- **Página ilegível** (`pessoasPagina` vazio) → retorna `pessoasIA` (caso B, cobertura).
- **Página legível** → base oficial **+ resgates**: anexa apenas pessoas da IA que
  (a) **casam algum contato** da planilha (`pontuarPessoa ≥ LIMIAR_PESSOA`) **e**
  (b) **não casam ninguém** já presente na página.
  - Isso evita o falso "saída" quando a extração determinística escapa um nome, **sem** poluir
    "novos" com gente que a IA imaginou (na página legível, "novos" = só a página oficial).

### Por campo / proveniência (inalterado)

`compararGrupo`/`compararContato` já comparam por campo e carregam `origemValor` da `origem` da
pessoa. Pessoa com `origem: "conhecimento"` → veredito `pesquisa_ampla` e rótulo "≈ via IA —
confira" (export e tabela já implementados).

## Prompt da IA (reescrito em `lib/gemini.ts`)

Remover o *"se não souber, devolva []"* que travava o Haiku. Pedir explicitamente a composição
**atual** pelo conhecimento quando o texto vier vazio:

- Texto presente → extraia dele (`origem: "pagina"`).
- Texto vazio/insuficiente → **liste os membros atuais pelo seu conhecimento** (`origem:
  "conhecimento"`), priorizando precisão; só devolva `[]` se realmente não conhecer o órgão.

PII inalterada: envia só o texto público + nome do grupo, **nunca** os contatos.

## Diagnóstico temporário (não-PII)

Para confirmar em produção se a Camada B realmente dispara (o TCU voltou IA vazia — pode ser
conservadorismo do prompt **ou** falha de crédito/chave):

- `lib/gemini.ts`: `diagnosticarIa()` → `{ disponivel, ok, count, erro? }` (faz **uma** chamada
  de teste com grupo conhecido + texto vazio).
- `app/api/analise/route.ts`: quando `?diag=1`, anexa `diag` ao JSON de resposta. Sem o param,
  custo zero.
- **Remover** após confirmar.

## Casos de verificação

| Caso | Entrada | Esperado |
|------|---------|----------|
| Página legível, contato presente | pessoasPagina tem o contato | verde, oficial |
| Página legível, cargo diverge | página tem cargo diferente; IA "corrige" | **amarelo** (IA não mascara) |
| Página legível, contato sumiu de verdade | não está na página nem a IA o resgata | "possível saída" |
| Página legível, extração escapou o nome | IA confirma o contato | **resgatado** ("via IA"), não saída |
| Página ilegível (JS) + IA sabe | pessoasPagina vazio, IA retorna composição | casa, viaPesquisaAmpla, "via IA" |
| Página ilegível + IA vazia | tudo vazio, URL existe | **"não verificado"** (indeterminado), nunca saída |
| Sem URL + IA vazia | nada | semFonte |

## Fora de escopo

- Execução de JavaScript no scraping (Puppeteer/Playwright) — proibido no MVP.
- Enriquecimento campo-a-campo de endereço para pessoas da página legível (a `origem` é por
  pessoa, não por campo) — fica para depois se necessário.
