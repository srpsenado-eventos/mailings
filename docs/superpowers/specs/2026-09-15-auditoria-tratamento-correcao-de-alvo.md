# Auditoria de Tratamento e Endereçamento: correção do alvo da comparação

**Data:** 2026-09-15
**Status:** Aprovado pelo Clovis em 2026-09-15
**Corrige:** `2026-08-13-auditoria-tratamento-enderecamento.md`, que continua valendo em tudo o mais

## O que deu errado

O spec de 13/08 mandou comparar a coluna `Tratamento` da planilha contra o vocativo da tabela de
protocolo, e a coluna `Endereçamento` contra o endereçamento da tabela. As tarefas 1 a 4 foram
implementadas assim. Antes de ligar isso no veredito, que é a tarefa 5, a auditoria foi medida
contra os 329 contatos reais de `Regras de Atualizacao/Contatos Grupos/contatos-no-grupo.xlsx`:

```
226 contatos divergentes · 103 sem regra · ZERO conferindo
```

Nenhum contato confere. Num cadastro que está majoritariamente certo, isso não é achado: é a
comparação apontada para o alvo errado. Ligá-la pintaria 69% da planilha de amarelo e repetiria o
episódio do TCU de junho, que foi o que derrubou a confiança no Fiscal.

São três causas independentes.

### Causa 1: `Tratamento` e `vocativo` são conceitos diferentes

A tabela de protocolo tem três colunas para três coisas distintas:

| Coluna da tabela | Exemplo |
|---|---|
| Vocativo epistolar | `Excelentíssimo(a) Senhor(a) Presidente` |
| Pronome de tratamento | `Vossa Excelência` |
| Endereçamento | `A Sua Excelência o(a) Senhor(a)` + nome + cargo + órgão |

A coluna `Tratamento` do Sistema Contatos não é nenhuma das três. Ela guarda a forma nominal, e a
planilha mostra isso: 239 `Senhor`, 62 `Senhora`, 16 `Senhor(a)`, 6 `Excelentíssimo Senhor`,
3 `Excelentíssima Senhora`, 1 `Vossa Excelência`, 1 vazia.

Comparar a forma nominal contra o vocativo epistolar reprova as 329 linhas por construção.

### Causa 2: `Endereçamento` da planilha é só a primeira linha do bloco

O Contatos guarda uma linha: `A Sua Excelência o Senhor`. A tabela guarda quatro:

```
A Sua Excelência o(a) Senhor(a)
[Nome]
Presidente
Supremo Tribunal Federal
```

Comparados por igualdade depois de `expandirFormas`, nunca batem, nem com o cadastro perfeito.

### Causa 3: a resolução de cargo acerta com confiança na regra errada

A similaridade de Dice favorece o candidato curto. Medido contra os cargos reais da planilha:

| Cargo na planilha | Regra resolvida | Certo? |
|---|---|---|
| Ministro do Supremo Tribunal Federal (7×) | Presidente do Supremo Tribunal Federal | não |
| Ministra do Supremo Tribunal Federal | Presidente do Supremo Tribunal Federal | não |
| Vice-Presidente do Supremo Tribunal Federal | Presidente do Supremo Tribunal Federal | não |
| Vice-Presidente do Superior Tribunal Militar | Presidente de Tribunal Superior | não |
| Ex-Presidente do Senado Federal (9×) | Presidente do Congresso Nacional / Senado Federal | não |

Em todos, o vice e o ex herdam o protocolo do titular. Errado com confiança é pior que
`sem_regra`, porque não aparece na lista do que falta mapear.

## A correção

### Decisão 1: o endereçamento é comparado contra a primeira linha

O valor esperado passa a ser `regra.enderecamento.split("\n")[0]`, expandido por `expandirFormas`
como já é hoje. As linhas 2 a 4 do bloco, com nome, cargo e órgão, não entram na comparação:
descrevem como montar a etiqueta, não o conteúdo da célula do cadastro.

Isso torna a auditoria robusta contra a causa 3. As 38 regras da tabela colapsam em apenas oito
primeiras linhas distintas, e 23 delas compartilham `A Sua Excelência o(a) Senhor(a)`:

| Primeira linha | Regras |
|---|---:|
| A Sua Excelência o(a) Senhor(a) | 23 |
| Ao Senhor (À Senhora) | 8 |
| A Sua Excelência Reverendíssima o Senhor | 2 |
| A Sua Santidade o Senhor · A Sua Eminência o Senhor · Ao Reverendíssimo Senhor · Ao Reverendo Senhor · Ao Magnífico Senhor (À Magnífica Senhora) | 1 cada |

Confundir duas regras dentro do mesmo grupo de 23 não muda o valor esperado. A resolução de cargo
continua importando para o rótulo que aparece na tela, não para o veredito.

### Decisão 2: o tratamento é comparado contra a forma nominal

O valor esperado é o núcleo nominal extraído da mesma primeira linha: o `Senhor(a)` de
`A Sua Excelência o(a) Senhor(a)`, o `Senhor (Senhora)` de `Ao Senhor (À Senhora)`. Expandido por
gênero, dá o conjunto aceito `{Senhor, Senhora}`.

O vocativo e o pronome da tabela não são auditados contra nenhuma coluna da planilha, porque a
planilha não tem coluna que os guarde. Ficam disponíveis para a geração de material do Kit, que é
outro escopo.

### Decisão 3: margem na resolução de cargo, com queda para `sem_regra`

`resolverRegra` passa a exigir margem sobre o segundo colocado. Sem margem suficiente, devolve
`undefined`, o que vira `sem_regra`. Não auditar é o resultado seguro; auditar contra a regra
errada não é.

O mapa `data/cargos-tratamento.ts` continua existindo e continua vazio. Popular correspondência de
cerimonial é conhecimento do Clovis, não da implementação.

### Decisão 4: duas camadas, e a primeira não depende da tabela

A medição mostrou que os achados reais da planilha estão quase todos fora do alcance da tabela:
103 dos 329 contatos não resolvem para regra nenhuma, e é aí que moram os erros de gênero. Os
Embaixadores, com 135 contatos e cargo escrito como "Embaixadora de Gana", caem todos em
`sem_regra`.

Por isso a auditoria passa a ter duas camadas independentes.

#### Camada A: coerência interna

Não consulta a tabela, não depende de resolver cargo, vale para os 329 contatos:

| Verificação | Achados na planilha de 14/09 |
|---|---:|
| `Tratamento` e `Endereçamento` discordam em gênero | 5 |
| `Cargo` traz gênero que discorda do `Tratamento` | 8 |
| Forma genérica `(a)` / `(o)` em qualquer dos dois campos | 22 |
| Campo vazio | 4 |

Convite, cartão e cinta não podem sair com "Senhor(a)", e gênero errado no nome de uma autoridade
é o constrangimento que o GT quer evitar. Esta camada é a que entrega isso.

#### Camada B: conformidade com a tabela

É a das decisões 1 a 3. Medida na simulação:

| | Endereçamento | Tratamento |
|---|---:|---:|
| confere | 217 | 214 |
| divergente | 7 | 6 |
| sem regra | 103 | 103 |
| genérico (vai para a Camada A) | 2 | 6 |

As divergências que sobram são reais: cinco Ex-Presidentes do Senado com `Ao Senhor` onde a regra
pede `A Sua Excelência o Senhor`, e Edson Fachin com `Vossa Excelência` na coluna `Tratamento`,
que é valor da coluna errada da tabela.

## Semântica dos vereditos

Inalterada em relação ao CLAUDE.md, e vale para as duas camadas:

- `sem_regra` **não é divergência** e **não pinta amarelo**. É limite do cadastro de regras.
- `fonte_nao_informa` **não é divergência**.
- Placeholder sem dado correspondente no contato torna o caso não auditável, ou seja, `sem_regra`.
- Forma genérica e discordância de gênero **são** divergência, e pintam amarelo.
- Na dúvida entre acusar e não acusar, não acuse.

## O que fica de fora

Não entra nesta correção, e cada um vale tarefa própria:

- A coluna `Tratamento Extenso` da planilha, que o app ignora hoje.
- Popular `data/cargos-tratamento.ts`.
- A geração de material do Kit a partir da nominata e do vocativo.

## Impacto no que já foi entregue

Tarefas 1 a 4 seguem válidas e commitadas; nada precisa ser desfeito. `expandirFormas`,
`REGRAS_TRATAMENTO`, `resolverRegra` e o contrato `sem_regra` / `protocolo` / `valorEsperado` são
todos reaproveitados. Muda o alvo de `comparacoesProtocolo` e entra a Camada A.
