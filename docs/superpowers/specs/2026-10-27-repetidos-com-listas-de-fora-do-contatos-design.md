# Autoridades repetidas: incluir as listas de fora do Contatos

Data: 2026-10-27. Situação: aprovada pelo Clovis em 27/10, com as duas propostas do §7 (eleito só com cargo de "ex-" fica em "Conferir"; seção própria para os eleitos em `/repetidos`). Complementa a spec de 2026-10-14 (autoridades em mais de um grupo) e substitui o item 5 do §2 dela ("Fora: os reeleitos").

## 1. Problema

Eunício Oliveira está no Contatos só no grupo "Ex-Presidentes do Senado". Ele também é deputado federal em exercício (CE), mas a página `/repetidos` não o mostra, e o convite dele deveria sair pelo cargo atual.

**Causa (confirmada no código):**
- `autoridadesRepetidas` (`lib/repetidos.ts`) lê só `retrato.grupos`, ou seja, os grupos do Contatos.
- O grupo "Deputados Federais" do painel é virtual, montado na tela pela planilha da Câmara (`lib/painel-deputados.ts`, `retrato.eleicao.deputadosAtuais`). Por isso não entra no cálculo.
- As listas de eleitos de 2026 (`retrato.eleicao.eleitos` e `retrato.eleicao.governadores`) também ficam de fora.
- "Deputados Federais" nem tem regra em `data/precedencia.ts`.

## 2. Medição (retrato de 27/10, 397 contatos)

Hoje `/repetidos` mostra 4 autoridades.

**Deputados atuais (513, planilha da Câmara) × Contatos:**
- **Nome exato:** 1, Eunício Oliveira (Ex-Presidentes do Senado).
- **Nome parcial:** 6.
  - Hugo Motta é a mesma pessoa. No Contatos ele está como "Deputado Federal Hugo Motta", com o cargo dentro do nome, no grupo Presidente da Câmara.
  - Os outros 5 são pessoas diferentes, a descartar à mão:
    - Mauro Benevides Filho × Mauro Benevides (o pai);
    - José Rocha × Marcos José Rocha dos Santos;
    - Paulo Azi × Paulo Dantas;
    - Pedro Lucas Fernandes × Lucas Ribeiro;
    - Vinicius Carvalho × Vinicius Marques de Carvalho.

**Eleitos de 2026 × Contatos (nome exato):** 28, todos em grupo de cargo atual.
- 13 senadores reeleitos já estão em Senadores.
- 1 deputado eleito, Izalci Lucas, está em Senadores.
- 14 governadores eleitos: 11 em Governadores e 3 em Senadores.

## 3. Decisões do Clovis (2026-10-27)

1. **Nível do deputado federal:** vem da Nominata em `Orientações de montagem/Nominata 2027_Modelo após ajustes Daniel (1).xlsx`.
   - Deputados federais: 4.14.
   - Eleitos, para exibição: Governador do DF eleito 4.11.1, governadores eleitos 4.12.1, senadores eleitos 4.13.1 e deputados federais eleitos 4.14.1.
2. **Eleitos de 2026:** entram no cálculo e aparecem em `/repetidos`, com destaque próprio. A decisão é sempre convidar pelo **grupo atual**, conforme a Ata 14.
3. **Casamento de nome:**
   - Exato pelo nome parlamentar ou civil (no caso de eleitos, pelo nome de urna ou completo).
   - Parcial (um nome contido no outro, com 2 ou mais palavras) vai para "Conferir", como já acontece entre grupos do Contatos.
4. **Onde aparece:** na página `/repetidos` e na linha do Contatos. As listas de fora não ganham etiqueta nova.

## 4. Desenho

Continua um cálculo na tela, a partir do retrato, por função pura. Não muda a varredura e não grava campo novo. Funciona no retrato de 27/10 já publicado, local e na web, porque `eleicao.deputadosAtuais` e `eleicao.eleitos` já vão para a web (sem e-mail, telefone, prédio e sala).

### 4.1 Precedência (`data/precedencia.ts`)

Entra a regra `{ grupo: "Deputados Federais", ex: false, nivel: n("4.14", "Deputados federais") }`. Ela também vale para quando o grupo passar a existir no Contatos.

### 4.2 Ocorrências de fora do Contatos (`lib/repetidos.ts`)

`autoridadesRepetidas(grupos, eleicao?)` passa a receber `retrato.eleicao`. Cada pessoa das listas vira **uma** ocorrência com `origem`:

| Lista | Grupo da ocorrência | Nomes casados | Cargo | Quando entra |
|---|---|---|---|---|
| `deputadosAtuais` | Deputados Federais (4.14) | parlamentar e civil | Deputado Federal | só enquanto o grupo não existe no Contatos (`temGrupoDeputados`), para não contar a mesma pessoa duas vezes |
| `eleitos` (Senado) | Senadores Eleitos (4.13.1) | urna e completo | Senador eleito | sempre |
| `eleitos` (Câmara) | Deputados Federais Eleitos (4.14.1) | urna e completo | Deputado federal eleito | sempre |
| `governadores.eleitos` | Governadores Eleitos (4.12.1; 4.11.1 no DF) | urna e completo | Governador eleito | sempre |

`origem` vale `"contatos"`, `"camara"` ou `"eleicao"`.

**Os dois nomes são da mesma pessoa.** O casamento é exato quando o nome do Contatos é igual a qualquer um dos dois. É parcial só quando nenhum é igual e um nome contém o outro. Isso evita que Eunício, com nome parlamentar igual e nome civil mais longo, caia em "Conferir".

**Pessoa só de fora não é repetida.** Uma autoridade só entra na lista com pelo menos uma ocorrência do Contatos e pelo menos dois grupos distintos.

### 4.3 Escolha do grupo

**Sem eleito na disputa:** vale a regra de 14/10.
- Cargo atual vence "ex-".
- Entre cargos atuais, vence o nível mais alto.
- Nome parcial, empate, nenhum nível ou possível saída no vencedor vão para "Conferir".
- Eunício: Deputados Federais (atual, 4.14) vence Ex-Presidentes do Senado (ex-, 3.5). Fica "decidido", convidado pelo grupo Deputados Federais.

**Com ocorrência de eleito (`origem: "eleicao"`):**
- O eleito nunca é o grupo do convite.
- Vale a ocorrência de **cargo atual**, seja do Contatos ou a da Câmara. Havendo mais de uma, decide a regra acima.
- O motivo é "Eleição 2026: convidar pelo grupo atual (Ata 14)" e a autoridade leva a marca `eleicao: true`.
- Se a pessoa só tem cargo de "ex-" no Contatos, vai para "Conferir" com o motivo "Eleita em 2026 sem cargo atual no Contatos: conferir o grupo". Pela Ata 14, mandato novo vai para o grupo de eleitos (ver §7). Hoje não há nenhum caso assim.

### 4.4 Tela

**Página `/repetidos`:**
- As autoridades com `eleicao: true` saem numa seção própria, "Eleitos em 2026 já no Contatos — convidar pelo grupo atual", depois das demais.
- A linha da ocorrência de fora mostra a lista de origem: "Planilha da Câmara" ou "Eleição 2026".
- O export (`lib/export-repetidos.ts`) ganha a coluna "Origem".

**Linha do Contatos:** a etiqueta segue a regra de 14/10.
- Fica vermelha quando o convite é por outro grupo. Eunício, em Ex-Presidentes do Senado: "Autoridade a ser convidada pelo grupo Deputados Federais".
- Fica "conferir" no caso parcial.
- Nos casos de eleito, o grupo atual é sempre o que convida e a linha já tem a etiqueta da Eleição 2026. Por isso não ganha etiqueta nova.

**Contador do painel:** "N autoridades em mais de um grupo" não conta os casos de eleito; eles ganham um contador próprio: "· M eleitos já no Contatos".

**Fora da mudança:** o grupo virtual de deputados e a linha do eleito ficam como estão (decisão 4).

## 5. Testes

Em `tests/repetidos.test.ts`, um teste para cada caso:
- **Eunício:** deputado atual e Ex-Presidentes do Senado, decidido por Deputados Federais.
- **Parcial:** nome contido vai para "Conferir".
- **Um caso por pessoa:** nome parlamentar igual e civil mais longo dá um caso só, decidido.
- **Lista da Câmara ignorada** quando o grupo Deputados Federais existe no Contatos.
- **Reeleito:** Senadores e Senadores Eleitos, decidido por Senadores, com `eleicao: true`.
- **Senador eleito governador:** Senadores e Governadores Eleitos, decidido por Senadores.
- **Eleito só com cargo de "ex-"** vai para "Conferir".
- **Pessoa só em lista de fora** não entra.
- **Retrato sem `eleicao`:** o resultado é o de hoje.
- **Contador próprio** dos eleitos.

## 6. Achado de dado, fora do app

No Contatos, Hugo Motta está cadastrado como "Deputado Federal Hugo Motta", com o cargo no campo Nome. Vai para o GT corrigir no cadastro. O app não trata isso.

## 7. Pontos a confirmar na revisão

1. Eleito em 2026 que no Contatos só tem cargo de "ex-": fica "Conferir" (proposta), ou já sai decidido pelo grupo de eleitos?
2. Seção própria para os eleitos em `/repetidos` (proposta), ou misturados na lista com a marca "Eleição 2026"?
