# Upload no cliente e resiliência de planilhas pesadas

**Data:** 2026-06-06
**Status:** Aprovado (decisão do Clovis: "a extensão que for menos pesada e o aplicativo rodar bem; você pode definir e eu me ajusto ao uppar")
**Relacionado:** [2026-06-04-fiscal-de-mailings-design.md](2026-06-04-fiscal-de-mailings-design.md) · [2026-06-05-fonte-inacessivel-e-scrape-resiliente.md](2026-06-05-fonte-inacessivel-e-scrape-resiliente.md)

## Problema

No app em produção (`mailings-theta.vercel.app`), a planilha **CNJ Teste.xlsx** falhava no upload com
a mensagem genérica **"Falha ao enviar a planilha."**, enquanto STF.xlsx funcionava. A estrutura de
colunas é idêntica (ambas exportadas do Sistema Contatos).

### Causa-raiz (confirmada, não é problema de estrutura)

A mensagem genérica só aparecia no `catch` de `components/upload-zone.tsx`, que dispara **apenas
quando o servidor devolve algo que não é JSON** (ou a conexão cai). Todo erro do nosso código devolve
JSON com mensagem específica (coluna faltante → "Planilha inválida…", formato, tamanho). Como o Clovis
via a mensagem genérica, **a estrutura estava sendo aceita** — o problema era anterior à nossa lógica.

O arquivo CNJ tem **≈22 MB**, inflado por **fotos embutidas** na coluna Foto. A Vercel impõe um
**limite de ~4,5 MB no corpo da requisição** de funções serverless. Um upload de 22 MB é **recusado na
borda da plataforma, antes do handler rodar** → resposta HTML/erro (não JSON) → o cliente cai no texto
genérico. O check de 15 MB em `route.ts` nunca chegava a executar. As fotos, além disso, **não são
usadas** pela análise (o motor só compara texto).

## Decisão

**Mover o parsing da planilha para o navegador e enviar ao servidor apenas as linhas de texto
(`ContatoPlanilha[]`) em JSON.** O binário pesado (fotos, mídia) fica no cliente; o payload de rede
passa a ser alguns KB de texto, constante em relação ao tamanho do arquivo. Isso elimina de vez o
limite de corpo da plataforma como fonte de recusa.

- **Formatos aceitos:** `.xlsx` **e** `.csv`. Recomendado = subir o `.xlsx` direto do Sistema
  Contatos, **sem limpeza manual** (o navegador descarta tudo menos o texto). `.csv` (UTF‑8) é aceito
  como alternativa ainda mais leve em disco.
- **Contrato do `/api/analise`:** muda de `FormData(arquivo: File)` para
  `JSON({ arquivoNome, contatos })`. O orquestrador (`analisar`, scraping, Gemini) permanece no
  servidor, sem mudança de comportamento.
- **Erros legíveis:** o cliente distingue (a) erro de leitura/validação local (`ColunaFaltanteError`),
  (b) resposta `{ ok: false, message }` do servidor, e (c) resposta **não-JSON** da plataforma
  (mostra "HTTP N — resposta inesperada"). Acaba o `catch {}` cego. O servidor passa a logar
  `err.message` (sem PII) para diagnóstico.

### Por que parse no cliente (e não outro formato)

O peso não está na **extensão**, e sim em **onde o arquivo é processado**. Reaproveitamos
`lerPlanilha(buffer)` — já é função pura e isomórfica (`XLSX.read(buffer, { type: "array" })`, sem APIs
Node/`window`), então roda igual no browser. `XLSX.utils.sheet_to_json` ignora imagens embutidas
(ficam em `xl/media/` do zip). CSV puro também é lido pelo mesmo caminho.

## Tradeoffs

- **`xlsx` entra no bundle do cliente** (~algumas centenas de KB). Aceitável para ferramenta interna.
- **Parse de 22 MB usa memória transitória no navegador** (descompacta mídia que será descartada).
  Aceitável em desktop; arquivos absurdamente grandes podem exigir reexport sem imagens.
- **PII:** os contatos já trafegavam (dentro do `.xlsx`) e são necessários à análise; em JSON é a
  mesma exposição, porém mais enxuta (sem fotos). Nada de PII em log.

## Fora de escopo (risco latente conhecido)

- **Concorrência de muitos grupos:** `analisar` usa `Promise.all` sem limite (`lib/analise.ts`). Para
  planilhas com dezenas de grupos distintos, isso pode estourar memória/tempo na função serverless. A
  realidade do uso é ~1 grupo por upload (CNJ é um grupo), então **não** corrigimos agora (YAGNI).
  Hardening futuro: pool de concorrência + deadline parcial que devolve resultados incompletos
  marcando grupos não terminados como "indeterminado (tempo esgotado)".
