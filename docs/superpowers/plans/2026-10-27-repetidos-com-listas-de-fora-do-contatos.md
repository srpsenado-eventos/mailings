# Plano: repetidos com as listas de fora do Contatos

Spec: `docs/superpowers/specs/2026-10-27-repetidos-com-listas-de-fora-do-contatos-design.md` (aprovada em 27/10 com as duas propostas do §7). Branch: `feat/repetidos-listas-externas`. Execução por subagentes, uma tarefa por vez, TDD.

## Tarefa 1 — cálculo (`data/precedencia.ts`, `lib/repetidos.ts`, `tests/repetidos.test.ts`)

1. `data/precedencia.ts`: nova regra `{ grupo: "Deputados Federais", ex: false, nivel: n("4.14", "Deputados federais") }`, depois de Senadores. Comentário do topo: a Nominata também está em `Orientações de montagem/`.
2. `lib/repetidos.ts`:
   - `OcorrenciaRepetida` ganha `origem: "contatos" | "camara" | "eleicao"`, preenchida como `"contatos"` nas ocorrências de hoje.
   - `AutoridadeRepetida` ganha `eleicao?: true`.
   - Nova função pura `ocorrenciasDeFora(eleicao: ResultadoEleicao | undefined)` devolve uma entrada por pessoa com `nomes: string[]` (2 nomes) e a ocorrência. A tabela das listas está no §4.2 da spec.
     - Deputados atuais só quando `temGrupoDeputados(eleicao)`, de `lib/painel-deputados.ts`.
     - Níveis dos eleitos (4.13.1, 4.14.1, 4.12.1; 4.11.1 com UF DF) ficam como constantes em `data/precedencia.ts`, `NIVEIS_ELEITOS`.
     - A chave da ocorrência é `normalizarNome` do primeiro nome.
   - `autoridadesRepetidas(grupos, eleicao?)`:
     - As entradas de fora entram no agrupamento.
     - Para cada pessoa de fora, se algum dos seus nomes normalizados é igual a uma chave do Contatos, ela casa com essa chave **exatamente**. Senão, casa parcialmente (contenção, `MIN_PALAVRAS_PARCIAL`) com chaves do Contatos, e isso marca `parcial`.
     - Os dois nomes da mesma pessoa nunca contam como parcial entre si.
     - Componente sem ocorrência `origem: "contatos"` não entra.
     - Continua exigindo 2 ou mais `grupoRegra` distintos.
   - Escolha com eleito (spec §4.3):
     - Se há ocorrência `eleicao`, ela sai da disputa e a autoridade leva `eleicao: true`.
     - Entre as demais, sem nenhuma atual (só ex-): `conferir`, com o motivo `MOTIVO_ELEITO_SEM_CARGO_ATUAL` = "Eleita em 2026 sem cargo atual no Contatos: conferir o grupo".
     - Com atual: aplica `escolherGrupo` às atuais. Se decidido, o motivo vira `"Eleição 2026: convidar pelo grupo atual (Ata 14)"`, mantendo o vencedor.
     - Parcial continua `conferir` (`MOTIVO_PARCIAL`).
   - `etiquetaDeRepeticao`:
     - Quando `eleicao` e decidido, devolve `undefined` (a linha já tem a etiqueta da Eleição 2026).
     - Quando `convidaPor.origem !== "contatos"`, o texto vermelho é o mesmo ("Autoridade a ser convidada pelo grupo Deputados Federais").
   - `textoRepetidas` passa a contar só as não-eleição. Nova `textoEleitosRepetidos(n)`: "1 eleito já no Contatos" ou "N eleitos já no Contatos".
3. Testes (AAA, nomes em português), os da spec §5:
   - Eunício: deputado atual + Ex-Presidentes do Senado → decidido, Deputados Federais.
   - Parcial → conferir.
   - Parlamentar igual + civil mais longo → um caso, decidido.
   - Lista da Câmara ignorada com `camaraNoContatos`.
   - Reeleito (Senadores + Senadores Eleitos) → decidido, Senadores, `eleicao`.
   - Senador eleito governador → decidido, Senadores.
   - Eleito só com ex- → conferir.
   - Pessoa só em lista de fora → não entra.
   - Retrato sem `eleicao` → igual ao de hoje.
   - Os contadores.
   - A etiqueta: vermelha para Eunício, `undefined` para reeleito.

## Tarefa 2 — tela e export

1. `app/repetidos/page.tsx` e `components/painel.tsx` passam `retrato.eleicao` a `autoridadesRepetidas`.
2. `components/painel.tsx`: o link "/repetidos" mostra `textoRepetidas` das não-eleição e, quando houver, " · " + `textoEleitosRepetidos`.
3. `components/tela-repetidos.tsx`:
   - Duas seções: as demais e "Eleitos em 2026 já no Contatos — convidar pelo grupo atual". A segunda aparece só se houver casos.
   - Busca e filtro valem nas duas.
   - A ocorrência de fora mostra a origem: "Planilha da Câmara" ou "Eleição 2026".
   - Seguir o estilo atual (Tailwind puro).
4. `lib/export-repetidos.ts`:
   - Nova coluna "Origem" no fim. É a origem do grupo do convite: "Contatos", "Planilha da Câmara" ou "Eleição 2026".
   - `descreverOcorrencia` acrescenta a origem quando não é do Contatos.
   - Nova coluna "Eleição 2026", com "Sim" para `eleicao`.
   - Atualizar `tests/export-repetidos.test.ts`, se existir, ou cobrir num teste novo.
5. CLAUDE.md:
   - A linha da spec passa a "Vigente; implementado".
   - O princípio "Autoridade em mais de um grupo" passa a citar as listas de fora.
   - Atualizar a contagem da suíte.

## Fechamento

- `npm test`, `npm run typecheck` e `npm run build` verdes.
- Revisão por subagente.
- Conferência no painel local: Eunício em `/repetidos`, decidido; etiqueta vermelha na linha de Ex-Presidentes do Senado; seção de eleitos.
- Push e PR. O Clovis abre e mescla.
- Conferir o deploy de produção. Não há coleta nova: o cálculo é na tela e o retrato publicado já traz `eleicao`.
