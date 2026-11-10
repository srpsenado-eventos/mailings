# Regras fixas de nome, cargo e protocolo pelos pares — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** o app deixa de acusar o que o GT fixou como regra (negrito do STJ, funções de tribunal, prefixo do presidente, protocolo igual ao dos pares) e passa a acusar o que o GT quer corrigido ("Ex-Presidente", prefixo faltando); páginas individuais deixam de propor inclusão.

**Arquitetura:** cada regra é função pura em `lib/` com dados em `data/`, testada com fixtures; nada depende de decisão registrada nem de rede. As regras de cadastro (prefixo, "Ex-") entram na Camada C (`comparacoesTratamento`), que já roda nos caminhos com fonte, via IA, sem fonte e individual. A regra dos pares é uma passada posterior sobre o grupo em `analisar`, como `anexarEnderecos`.

**Stack:** Next.js 15, TypeScript, cheerio (`lib/scrape.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-regras-de-nome-cargo-e-pares-design.md`. Ler inteira antes da primeira tarefa.

## Restrições globais

- `lib/*.ts` puro e imutável; sem `any`; normalização só por `lib/normalize.ts`; testes em português, padrão AAA.
- Regra de ouro: nenhuma mudança cria `possivelSaida` nova; `novos` só de fonte de grupo.
- Semântica dos vereditos (CLAUDE.md): `fonte_nao_informa`, `nao_verificado` e `sem_regra` nunca pintam amarelo; `divergente` pinta.
- Textos fixados pela spec:
  - observação dos pares: "Pela maioria dos pares: N de M no grupo usam …"
  - observação do período: "Informar o período da presidência"
  - formato do cargo: "Presidente do Senado Federal de AAAA a AAAA" e "Presidente da República Federativa do Brasil de AAAA a AAAA"
- Grupos de tribunal (segmentos do catálogo): "Ministros do STF", "Ministros do STJ", "Ministros do TSE", "Ministros do TST", "Ministros do STM", "Ministros do TCU".
- npm; antes de cada commit `npm test` e `npm run typecheck`; commits terminam com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Pontos de atenção da revisão

1. **Página do STJ sem negrito em alguém** (ministro novo sem `<b>`): o nome esperado volta a ser o completo e o casamento não quebra. Teste na Tarefa 2.
2. **Cargo da página em caixa alta ou com dois-pontos** ("PRESIDENTE", "Presidente:"): a função de tribunal tem de ser reconhecida após `normalizarTexto`. Teste na Tarefa 3.
3. **Contato feminino com cargo masculino antigo** ("Ministra Cármen Lúcia" com cargo "Presidente do STF" e tratamento "Senhora"): o prefixo esperado é "Ministra". Teste na Tarefa 4.
4. **Grupo com um contato só ou com empate nos pares**: continua `sem_regra`, nunca amarelo. Teste na Tarefa 6.
5. **Período com mais de um mandato** ("de 1995 a 1997 e de 2009 a 2011"): aceito como formato válido; o app não escolhe. Teste na Tarefa 5.

---

### Tarefa 1: Página individual nunca propõe inclusão

**Arquivos:**
- Modificar `lib/match.ts:815` (`compararContatoIndividual`, ramo "não consta").
- Testes: `tests/match-individual.test.ts`, `tests/analise-individual.test.ts`.

**Interfaces:** `VereditoIndividual.novos` passa a ser sempre `[]` no ramo "não consta"; o tipo não muda.

- [ ] **Passo 1: testes que falham.** Contato que não consta na página individual com 3 pessoas com cargo → `novos` vazio; em `analisarGrupoIndividual`, o grupo sai com `novos: []` e o contato continua `possivelSaida` (spec §3.6).
- [ ] **Passo 2:** `npx vitest run tests/match-individual.test.ts tests/analise-individual.test.ts`. Esperado: FAIL.
- [ ] **Passo 3:** implementar; apagar o teste antigo que esperava `novos` da página individual, se houver, explicando no relatório.
- [ ] **Passo 4:** `npm test`. Esperado: PASS.
- [ ] **Passo 5:** commit `fix: página individual não propõe inclusão`.

### Tarefa 2: Nome em destaque no STJ

**Arquivos:**
- Modificar: `lib/types.ts` (`PessoaSite.nomeDestaque?: string`; `FonteCatalogo.nomeEmDestaque?: true`; `FonteLegivel` ganha `"nomeEmDestaque"` no Pick), `lib/scrape.ts` (`OpcoesExtracao.nomeEmDestaque?`, `OpcoesRaspagem.nomeEmDestaque?`, extração), `lib/raspagem.ts:35` (`montarOpcoes` copia a opção), `lib/memoria-leitura.ts:83` (`chaveDaLeitura` com sufixo `#destaque`), `lib/match.ts` (`situacaoNome`, `melhorPessoa`/`pontuarPessoa`, `montarResultado` l.293), `data/catalogo.ts:381` (fonte do STJ com `nomeEmDestaque: true`).
- Testes: `tests/scrape.test.ts` (bloco do STJ, fixture `tests/fixtures/stj-ministros.html`), `tests/match.test.ts`, `tests/memoria-leitura.test.ts`, `tests/catalogo-dados.test.ts`.

**Interfaces:**
- Produz: `PessoaSite.nomeDestaque?: string` (partes em `b`/`strong` do bloco da pessoa, na ordem, unidas por espaço; ausente quando o bloco não tem negrito ou a fonte não tem a marca).
- `extrairConteudo(html, url, { nomeEmDestaque: true })`: para cada pessoa, o destaque é colhido do mesmo elemento de onde saiu o nome (no STJ, `span.clsMinistrosNome`); o construtor escolhe como ligar linha → elemento (ex.: colher antes de `extrairLinhas`, por índice do bloco).
- `situacaoNome(nomePlanilha, pessoa)`: confere quando `normalizarNome` do contato é igual ao `nomeDestaque` **ou**, sem destaque, ao `nome`; com destaque, igual ao `nome` completo mas diferente do destaque → `divergente` com `valorEsperado = nomeDestaque`.
- `valorEsperado` do campo nome em `montarResultado` = `pessoa.nomeDestaque ?? pessoa.nome`.
- `pontuarPessoa`/`melhorPessoa` consideram `nome` e `nomeDestaque` (o maior dos dois escores).

- [ ] **Passo 1: testes que falham.**
  - scrape: com a fixture do STJ e `nomeEmDestaque: true`, a pessoa de Kukina tem `nomeDestaque: "Sérgio Kukina"`, a de Benjamin `"Herman Benjamin"`, a de Gurgel `"Gurgel de Faria"`, a de Gallotti `"Isabel Gallotti"`; sem a opção, `nomeDestaque` ausente; pessoa sem `<b>` fica sem destaque (Ponto 1).
  - match: contato "Sérgio Kukina" × pessoa `{nome:"Sérgio Luíz Kukina", nomeDestaque:"Sérgio Kukina"}` → nome `confere`; contato "Sérgio Luíz Kukina" → `divergente`, `valorEsperado: "Sérgio Kukina"`; pessoa sem destaque → como hoje.
  - memória: `chaveDaLeitura` com `nomeEmDestaque` termina em `#destaque`.
  - catálogo: a fonte do STJ tem `nomeEmDestaque: true`.
- [ ] **Passo 2:** rodar os quatro arquivos. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`, `npm run typecheck`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: nome em destaque do STJ é o nome esperado`.

### Tarefa 3: Cargo nos tribunais e gênero neutro da página

**Arquivos:**
- Criar `data/cargos-tribunal.ts`.
- Modificar `lib/match.ts` (`situacaoCampo` l.173-196; chamadores em `montarResultado` l.298-306, `compararContatoIndividual` l.826 e `compararCargoNaLista` l.656 passam o contexto do grupo), `lib/analise.ts` (passa `grupoCanonico` onde falta).
- Testes: `tests/match.test.ts`, `tests/cargos-genero.test.ts`, `tests/analise.test.ts`.

**Interfaces:**
- Produz:
  ```ts
  // data/cargos-tribunal.ts
  export const GRUPOS_DE_TRIBUNAL: readonly string[]; // os 6 segmentos
  export const FUNCOES_DE_TRIBUNAL: readonly string[]; // "ministro", "presidente", "vice-presidente", "corregedor-geral", "corregedor", "diretor-geral", "diretor", "decano", "ouvidor" (normalizados; o feminino sai por neutralizarGenero)
  export function ehGrupoDeTribunal(grupoCanonico: string | undefined): boolean;
  // lib/match.ts
  export function situacaoCampo(valorPlanilha: string, valorEsperado?: string, contexto?: { tribunal?: boolean }): SituacaoCampo;
  ```
- Regras de `situacaoCampo` com `contexto.tribunal`:
  - normalizar os dois lados com `normalizarTexto` + `neutralizarGenero`; "ministro(a)" → "ministro" (o "(a)" é descartado antes);
  - cargo do Contatos com papel "ministro": confere se a página traz qualquer função de `FUNCOES_DE_TRIBUNAL`;
  - cargo do Contatos com papel "presidente" (sem "vice"): confere se a página traz "presidente" (sem "vice") **ou** só "ministro"; "vice-presidente", "corregedor…" etc. → `divergente`;
  - cargo do Contatos "ministro" com página "presidente" (sem "vice") → `divergente` (o esperado é o da página, como hoje).
- Fora de tribunal: comportamento atual, mais a neutralização "(a)" (a página "Ministro(a)" confirma "Ministra").

- [ ] **Passo 1: testes que falham.** Nos tribunais: "Ministro do Superior Tribunal de Justiça" × "Vice-Presidente e Corregedor-Geral da Justiça Federal" → confere; × "Diretor-Geral da ENFAM" → confere; "Ministro do TSE" × "(Corregedor-Geral)" → confere; "Ministra do STM" × "Ministro(a)" → confere; "Presidente do Supremo Tribunal Federal" × "Ministro" → confere; × "Presidente" → confere; × "Vice-Presidente" → divergente; "Ministro do STF" × "Presidente" → divergente; "PRESIDENTE:" (Ponto 2) → confere. Fora de tribunal: "Governador do Estado de Sergipe" × "Secretário Especial…" continua divergente.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`, `npm run typecheck`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: funções de tribunal confirmam Ministro; gênero neutro da página`.

### Tarefa 4: Prefixo no nome do presidente (Camada C)

**Arquivos:**
- Modificar `data/regras-nome.ts` (`RegraNome.prefixoDoPresidente?`), `lib/tratamento.ts` (`comparacaoRegraNome` l.666 ou função irmã `comparacaoPrefixoNome`; `rotuloAchado` l.500; `textoCoerencia` l.534), `lib/types.ts` (`AchadoCoerencia` ganha `"nome_sem_prefixo"`), `lib/match.ts:216` (`comparacoesTratamento` chama a nova).
- Testes: `tests/match-regras-nome.test.ts` (já cobre "Camada C nos quatro caminhos"), `tests/regras-nome.test.ts`.

**Interfaces:**
- `RegraNome` ganha `prefixoDoPresidente?: "ministro" | "presidente"`: nos 6 grupos de tribunal, `"ministro"` (aplica quando o cargo do contato começa com "Presidente", sem "Vice"); em "Presidente da República", `"presidente"` (aplica a todo contato do grupo).
- `comparacaoPrefixoNome(contato, grupoCanonico, regras = REGRAS_NOME): ComparacaoCampo[]` devolve no máximo um item `{ campo: "nome", situacao: "divergente", valorEsperado: "<Prefixo> <nome sem prefixo>", origemValor: "coerencia", achado: "nome_sem_prefixo" }` quando o nome não começa com o prefixo (comparação após `normalizarTexto`). O prefixo "ministro" vira "Ministra" quando o contato é feminino: tratamento "Senhora"/"Excelentíssima Senhora", endereçamento "a Senhora", ou cargo feminino pela tabela de cargos. Nome que já começa com o prefixo: nenhum item.
- `rotuloAchado("nome_sem_prefixo")` = "Nome sem o prefixo do cargo"; `textoCoerencia` explica "O Presidente de tribunal leva \"Ministro(a)\" antes do nome; o Presidente da República leva \"Presidente\" (regra do GT, 2026-10-30)".
- Nunca propõe tirar o prefixo. Nos outros grupos, nenhum efeito.

- [ ] **Passo 1: testes que falham.** "Edson Fachin" com cargo "Presidente do Supremo Tribunal Federal" no grupo Ministros do STF → divergente com esperado "Ministro Edson Fachin"; "Ministro Edson Fachin" → nenhum item; "Cármen Lúcia", cargo "Presidente do STF", tratamento "Senhora" → esperado "Ministra Cármen Lúcia" (Ponto 3); "Luís Inácio Lula da Silva" no grupo Presidente da República → esperado "Presidente Luís Inácio Lula da Silva"; "Presidente Luís Inácio Lula da Silva" → nenhum item; "Senador Davi Alcolumbre" em Senadores → nenhum item; a regra roda também no caminho sem fonte (teste em analise com `compararGrupo(..., undefined, "Ministros do STF")`).
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`, `npm run typecheck`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: prefixo Ministro(a)/Presidente no nome do presidente`.

### Tarefa 5: Ex-Presidentes: cargo com período (Camada C)

**Arquivos:**
- Modificar `data/regras-nome.ts` (`RegraNome.cargoComPeriodo?: string`), `lib/tratamento.ts` (função `comparacaoCargoExPresidente`, `rotuloAchado`, `textoCoerencia`), `lib/types.ts` (`AchadoCoerencia` ganha `"cargo_ex_presidente"`), `lib/match.ts:216`, `lib/scrape.ts` (período opcional, ver abaixo).
- Testes: `tests/match-regras-nome.test.ts`, `tests/match.test.ts`, `tests/repetidos.test.ts`.

**Interfaces:**
- `RegraNome.cargoComPeriodo`: em "Ex-Presidentes do Senado", `"Presidente do Senado Federal"`; em "Ex-Presidentes da República", `"Presidente da República Federativa do Brasil"`.
- `comparacaoCargoExPresidente(contato, grupoCanonico, regras): ComparacaoCampo[]`: cargo que começa com "ex-"/"ex " (após `normalizarTexto`) → `{ campo: "cargo", situacao: "divergente", valorEsperado: "<cargoComPeriodo> de AAAA a AAAA", origemValor: "coerencia", achado: "cargo_ex_presidente", observacao: "Informar o período da presidência" }`. Cargo no formato aceito → nenhum item.
- Formato aceito (`PERIODO_PRESIDENCIA`, exportado): `<cargoComPeriodo> de AAAA a AAAA`, com um ou mais períodos separados por ", " ou " e " (Ponto 5); cada período com o segundo ano ≥ o primeiro.
- `situacaoCampo` (Tarefa 3) já dá `confere` para "Presidente do Senado Federal de 2019 a 2021" × "Presidente do Senado Federal" (mesmo papel, sem prefixo negante); acrescentar teste. "1º Vice-Presidente" continua divergente.
- Período da página do Senado: **opcional**; se o construtor conseguir ler "AAAA a AAAA" junto do nome em `nova-republica` sem fixture real, guarda em `PessoaSite.periodo?: string` e usa no esperado; senão deixa "AAAA" e registra no relatório.
- Precedência: teste em `tests/repetidos.test.ts` de que um contato de "Ex-Presidentes do Senado" com cargo "Presidente do Senado Federal de 2019 a 2021" continua `ex: true` (o grupo decide) e perde para o cargo atual.

- [ ] **Passo 1: testes que falham** (os do bloco acima).
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`, `npm run typecheck`. Esperado: PASS.
- [ ] **Passo 5:** commit `feat: cargo de ex-presidente com o período, sem "Ex-"`.

### Tarefa 6: Tratamento e endereçamento pelos pares; regra "Governador" da tabela

**Arquivos:**
- Criar `lib/tratamento-pares.ts`.
- Modificar `lib/analise.ts` (`analisar` l.~749: passada `aplicarPares` por grupo, depois de `anexarEnderecos`), `lib/tratamento.ts` (`resolverRegra` l.249: prefixo "Governador"/"Vice-Governador" como o de Ministro de Estado, para a regra "Governador" casar "Governador(a) do Estado de …" e "Governadora do Distrito Federal"), `lib/types.ts` (`OrigemDado` ganha `"pares"`).
- Testes: `tests/tratamento-pares.test.ts` (novo), `tests/tratamento-comparacao.test.ts`, `tests/analise.test.ts`, `tests/painel.test.ts` (etiqueta com origem "pares").

**Interfaces:**
- Produz:
  ```ts
  export function nucleoDoCargo(cargo: string): string; // normalizarTexto + neutralizarGenero + corta " do estado de …", " do distrito federal", " de <país>", " da/do/de … " depois do núcleo; ex.: "Governador do Estado de Sergipe" → "governador do estado"; "Embaixadora de Gana" → "embaixador"; "Encarregado de Negócios da Embaixada do Iraque" → "encarregado de negocios"; "Ministro do Supremo Tribunal Federal" → "ministro do supremo tribunal federal"
  export function maioriaDosPares(valores: readonly string[]): { valor: string; n: number; m: number } | undefined; // 2+ valores não vazios; mais da metade iguais após normalizarTexto + neutralizarGenero; empate → undefined
  export function aplicarPares(grupo: ResultadoGrupo): ResultadoGrupo; // substitui, em cada contato, as comparações tratamento/enderecamento com situacao "sem_regra" pela comparação com a maioria dos pares; recalcula camposDivergentes e semaforo (amarelo só se vira divergente; nunca muda verde→vermelho nem toca possivelSaida)
  ```
- Pares = outros contatos do grupo com o mesmo `nucleoDoCargo` do cargo do Contatos. O valor esperado sai no gênero do contato (regenerar "Senhor"→"Senhora" e "o Senhor"→"a Senhora" quando o contato é feminino, pelo mesmo critério da Tarefa 4).
- Observação: "Pela maioria dos pares: N de M no grupo usam <valor>". `origemValor: "pares"`.
- A regra da tabela vem antes: só `sem_regra` entra nos pares.

- [ ] **Passo 1: testes que falham.**
  - `resolverRegra("Governador do Estado de São Paulo")` → regra "Governador"; `resolverRegra("Governadora do Distrito Federal")` → "Governador"; `resolverRegra("Vice-Governador do Estado de Goiás")` → "Vice-Governador".
  - `maioriaDosPares(["Senhor","Senhor","Senhora","Excelentíssimo Senhor"])` → `{valor: "Senhor", n: 3, m: 4}` (Senhora conta como Senhor); `maioriaDosPares(["Senhor","Doutor"])` → undefined; `maioriaDosPares(["Senhor"])` → undefined (Ponto 4).
  - `aplicarPares` num grupo com 7 "Senhor" e 1 "Doutor" (todos `sem_regra`): os 7 viram `confere` com `origemValor: "pares"`, o "Doutor" vira `divergente`, `valorEsperado: "Senhor"`, semáforo amarelo; um contato feminino com "Senhor" → esperado "Senhora". Grupo com 1 contato → inalterado. Contato com regra da tabela → inalterado.
- [ ] **Passo 2:** rodar. Esperado: FAIL.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm test`, `npm run typecheck`, `npm run build`. Esperado: verdes.
- [ ] **Passo 5:** commit `feat: tratamento e endereçamento pela maioria dos pares; regra Governador da tabela`.

### Tarefa 7: Documentação

**Arquivos:** `CLAUDE.md` — linha nova na tabela de specs (2026-10-30, regras fixas; "Vigente; implementado"), parágrafo em "Princípios" (**Regras fixas de nome e cargo**: STJ negrito, funções de tribunal, prefixo, Ex-Presidentes com período, pares, página individual sem inclusão), "Semântica dos vereditos" (origem "pares"; `sem_regra` só quando nem a tabela nem os pares decidem), "Estado do projeto" (contagem da suíte).

- [ ] **Passo 1:** editar.
- [ ] **Passo 2:** commit `docs: CLAUDE.md com as regras fixas de nome, cargo e pares`.
