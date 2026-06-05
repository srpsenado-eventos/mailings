# Fonte inacessível ≠ sem fonte + scrape resiliente

**Data:** 2026-06-05
**Status:** Aprovado (decisão do Clovis: "o mais recomendado")
**Contexto:** Produção mostrava "sem fonte cadastrada" + 🔴 Divergência para "Ministros do STF" e
"Ministros do STJ", mesmo com a URL oficial cadastrada e ativa no banco.

## Problema

O diagnóstico (`/api/diag`, temporário) provou que a resolução de fonte funciona em produção:
STF e STJ resolvem para suas URLs (`ativas: 1`). O bug **não era** banco nem `buscarFontePrimaria`.

A causa real está em `lib/analise.ts > analisarGrupo`: quando `raspar(url)` lança erro
(TLS, WAF, timeout, bloqueio de IP), o `catch` caía em
`compararGrupo(grupo, contatos, undefined)` — **exatamente o mesmo resultado de "sem fonte
cadastrada"**. As duas falhas eram indistinguíveis para o usuário, e o app marcava as autoridades
como 🔴 Divergência sem ter conseguido ler a fonte.

Defesas reais de cada site (caracterizadas em diagnóstico local + Vercel):

| Site | Falha | Causa |
|------|-------|-------|
| STF  | `UNABLE_TO_VERIFY_LEAF_SIGNATURE` e depois `HTTP 403` | Cadeia de certificado TLS incompleta **e** WAF bloqueando User-Agent de bot. Com TLS relaxado + headers de navegador → **HTTP 200**. |
| STJ  | OK local, falha no Vercel | Provável bloqueio de IP/WAF no datacenter do Vercel. Não some só com headers. |

## Decisão

### 1. Tornar a falha visível (correção de correção)

Distinguir **"fonte cadastrada mas inacessível"** de **"sem fonte cadastrada"**.

- `ResultadoGrupo` ganha `fonteInacessivel?: boolean` e `erroFonte?: string`.
  Quando a URL existe mas o scrape falha: `semFonte = false`, `fonteInacessivel = true`,
  `fonteUrl = <url>` (para o usuário abrir e conferir à mão) e `erroFonte = <motivo técnico>`.
- Novo valor de `Semaforo`: `"indeterminado"` (cinza, rótulo "Não verificado"). As autoridades de
  um grupo inacessível **não** são marcadas como 🔴 Divergência — não conseguimos verificar, então
  não fabricamos veredito.
- `ResumoAnalise` ganha `indeterminado: number` e `gruposFonteInacessivel: number`.

Sem PII: `erroFonte` é mensagem técnica sobre a URL (ex.: "HTTP 403"), nunca nome/telefone/e-mail.

### 2. Scrape resiliente (`lib/scrape.ts`)

- **Headers de navegador** sempre (User-Agent Chrome, `Accept`, `Accept-Language: pt-BR`).
  Custo de segurança: nenhum. Passa por WAFs que bloqueiam User-Agent de bot.
- **TLS estrito primeiro; relaxa só em erro de certificado.** Se o `fetch` falha com erro de
  cadeia/certificado (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_*`, `SELF_SIGNED*`), repete a
  requisição com um `undici.Agent({ connect: { rejectUnauthorized: false } })` **escopado só
  naquela requisição**. Sites com cadeia válida mantêm verificação completa.

  **Tradeoff aceito:** nas requisições de retry perdemos proteção contra MITM. Risco real:
  HTML forjado geraria divergência falsa numa leitura de página **pública** .gov.br — não há
  segredo trafegando (a chave service_role e a planilha PII nunca passam por aqui). Aceitável para
  ferramenta interna de auditoria. A relaxação é fallback, não default.

- **Não** usa Puppeteer/Playwright/Firecrawl (mantém restrição do MVP). Continua `fetch` + `cheerio`.

### 3. STJ / bloqueio de IP do Vercel

Aplica a mesma correção (headers + TLS fallback) e verifica no deploy. Se o WAF do STJ continuar
bloqueando o IP do Vercel, o STJ aparece honestamente como **"fonte inacessível"** (não como "sem
fonte"). Resolver o bloqueio de IP (proxy / região / IP fixo) fica como tarefa separada, fora do MVP.

### 4. Limpeza

Remover o endpoint temporário `/api/diag` e o script `scripts/diag-scrape.mjs` (eram só
instrumentação de diagnóstico).

## Fora de escopo

- Descoberta/cadastro automático de URLs (Clovis cadastra manualmente — inalterado).
- Persistência de histórico (inalterado).
- Proxy/IP fixo para contornar bloqueio de datacenter (tarefa futura, se o STJ exigir).
