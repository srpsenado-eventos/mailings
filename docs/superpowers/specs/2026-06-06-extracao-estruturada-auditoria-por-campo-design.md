# Extração estruturada + auditoria por campo com "valor correto"

**Data:** 2026-06-06
**Status:** Aprovado (brainstorming com o Clovis)
**Relacionado:** [2026-06-04-fiscal-de-mailings-design.md](2026-06-04-fiscal-de-mailings-design.md) · [2026-06-06-camada-b-fallback-pesquisa-ampla.md](2026-06-06-camada-b-fallback-pesquisa-ampla.md)

## Problema

O export real do CNJ (`resultado.csv`) expôs dois problemas, com **uma causa comum**:

1. **"Novos" cheios de lixo:** rótulos ("Nascimento:", "CEP:", "Telefone:", "CNPJ:", "Vaga:"),
   cargos soltos ("Conselheiro") e nome colado a cargo/rótulo ("Jaceguara Dantas da SilvaConselheira",
   "Ministro Mauro Campbell MarquesCorregedor Nacional de JustiçaNascimento:").
2. **Divergências não-confiáveis:** pessoas reais marcadas 🔴 nome (ex.: planilha "Sívio Roberto
   Oliveira de Amorim Júnior" vs site "Silvio Amorim Junior", que ainda aparece em "novos");
   "Ulisses Rabaneda" casado **e** listado como novo (duplo-cont); "cargo divergente" falso (o cargo
   da planilha confere com o site, mas o trecho casado está corrompido).

**Causa-raiz (uma só):** `extrairConteudo` (`lib/scrape.ts`) trata a página como **blob**:
- `$("body").text()` concatena texto **sem separador** entre elementos → tudo grudado.
- `destaques` = todo `<strong>/<b>` cru → inclui rótulos e cargos.

Esse blob alimenta tanto o matching (campos conferidos no trecho errado) quanto os "novos"
(`detectarNovos` usa `destaques`). Consertar a extração resolve os dois.

## Decisões (brainstorming)

- **Campos auditados:** nome + cargo + os demais **quando a fonte tiver por pessoa**. Endereço/
  telefone/e-mail numa página de composição costumam ser institucionais (rodapé), então por padrão
  saem como **"fonte não informa"**, nunca como divergência falsa.
- **Saída:** formato **largo** — uma linha por contato, com pares de colunas `Campo (planilha)` |
  `Campo (site)` à direita. Site = valor correto ou "fonte não informa".
- **Motor de extração:** determinística limpa (Camada A, sempre roda) **+** Gemini estruturado
  (Camada B, qualidade quando há `GEMINI_API_KEY`). Respeita "Camada A sempre; B opcional, degrada".

## Arquitetura

### 1. Modelo (`lib/types.ts`)
- `PessoaSite` = registro central da fonte: `{ nome, cargo?, ...campos quando existirem, contexto }`.
- `ComparacaoCampo` = `{ campo, valorPlanilha, valorSite?, situacao: "confere" | "divergente" | "fonte_nao_informa" }`.
- `ResultadoContato.comparacoes: ComparacaoCampo[]` (as divergências são o subconjunto
  `situacao === "divergente"`; `camposDivergentes` pode ser derivado disso ou mantido para o badge).

### 2. Extração determinística (`lib/scrape.ts`) — Camada A
- **Separadores entre blocos** antes do `.text()` (`</p>`, `</li>`, `<br>`, `</tr>`, `</h1..6>`,
  `</div>` → quebra de linha), eliminando o "grudado".
- **Segmentação em `PessoaSite[]`:** linha que parece nome próprio (Title Case, ≥2 tokens, não termina
  em ":", não é cargo solto) + cargo adjacente por léxico (Conselheiro/a, Presidente, Vice-Presidente,
  Corregedor/a, Ministro/a, Secretário/a, Diretor/a, Procurador/a, Defensor/a, Governador/a…).
  **Filtra rótulos** (linhas terminando em ":", cargos soltos, fragmentos sem nome).
- `ConteudoFonte` passa a expor `pessoas: PessoaSite[]` além de `textoLimpo` (agora com espaços) e
  `destaques` (mantido como dica, filtrado).

### 3. Extração Gemini (`lib/gemini.ts`) — Camada B
- `extrairComposicaoGemini(textoLimpo)`: pede ao Gemini `[{nome, cargo}]` a partir do texto raspado —
  limpo e robusto em qualquer layout. Quando disponível, **enriquece/substitui** as `pessoas`
  determinísticas. Sem chave, mantém a Camada A. (A `pesquisarFonteAmpla` para fonte inacessível passa
  a devolver no mesmo formato `pessoas`.) **PII:** envia só o conteúdo público da página, nunca os
  contatos da planilha.

### 4. Matching por pessoa + comparação por campo (`lib/match.ts`)
- Casa cada contato à melhor `PessoaSite` por **sobreposição de tokens de nome** (com fuzzy por token),
  para conectar variações como "Sívio Roberto Oliveira de Amorim Júnior" ↔ "Silvio Amorim Junior".
  A pessoa casada **sai do pool** → fim do duplo-cont.
- Comparação por campo contra a pessoa casada: cargo planilha × `pessoa.cargo` → confere/divergente;
  demais campos → "fonte não informa" quando a pessoa não tem o dado.
- Vereditos: tudo confere → 🟢; alguma divergência → 🟡 (com `comparacoes` preenchidas, incluindo
  `valorSite`); sem pessoa casada → 🔴 (possível saída); pessoa não casada → ✨ novo (limpo).

### 5. Saída (`lib/export.ts` + `components/resultado-tabela.tsx`)
- CSV largo: `Grupo, Nome, Status, Origem, Fonte` + pares por campo auditado:
  `Cargo (planilha) | Cargo (site) | Endereço (planilha) | Endereço (site) | …`.
- "Novos" só com nomes reais (lixo filtrado).
- Tabela da UI mostra, nas divergências, o valor da planilha e o valor do site.

### 6. Degradação
- Sem `GEMINI_API_KEY`: determinística limpa (presença + cargo onde a segmentação tem confiança;
  "fonte não informa" no resto). Já muito melhor que hoje.
- Fonte 403/inacessível: `pesquisarFonteAmpla` (grounding) entrega as `pessoas`.

## Faseamento
- **Fase 1:** extração determinística estruturada (`pessoas`) + matching por token + comparação por
  campo + colunas valor-correto + "novos" limpos. Entrega já limpa, sem depender de chave.
- **Fase 2:** Gemini estruturado (`extrairComposicaoGemini`) para elevar a qualidade do "valor correto"
  e da composição em qualquer site.

## Testes
- `scrape`: fixtures de HTML "grudado" → asserta linhas separadas + `pessoas` filtradas (sem rótulos).
- `match`: variações de nome casam; comparação por campo preenche `valorSite`; "fonte não informa"
  quando a pessoa não tem o campo; pessoa casada não vira "novo".
- `export`: colunas largas planilha×site.
- `gemini`: parse de `extrairComposicaoGemini`.

## Fora de escopo
- Apelidos de grupo no banco (já registrado como follow-up em
  [2026-06-06-camada-b-fallback-pesquisa-ampla.md](2026-06-06-camada-b-fallback-pesquisa-ampla.md)).
- Bypass de WAF por Firecrawl/proxy (recusado no MVP).
