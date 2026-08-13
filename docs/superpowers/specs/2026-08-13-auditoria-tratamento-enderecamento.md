# Auditoria de Tratamento e Endereçamento contra a tabela de protocolo

**Data:** 2026-08-13
**Status:** Aprovado
**Complementa:** `2026-06-06-extracao-estruturada-auditoria-por-campo-design.md` (acrescenta uma terceira procedência de valor esperado)

## Problema

A planilha do Sistema Contatos tem as colunas `Tratamento` e `Endereçamento`. O app **as lê**
(`lib/planilha.ts:67-68`) e as carrega em `ContatoPlanilha` — mas **nunca as compara**. Não há
uma única referência a elas em `lib/match.ts`. Entram pela porta e saem pela janela.

Não é esquecimento: é uma limitação estrutural do motor atual. A auditoria de hoje é
**planilha × site oficial**, e esses dois campos **não existem em site nenhum**. Nenhuma
página do STF ou do CNJ publica o endereçamento protocolar de um ministro. Eles derivam do
**cargo**, por regra de cerimonial.

Ou seja: enquanto a única fonte de verdade for a página oficial, esses campos são
inauditáveis — e erram silenciosamente.

## Fonte da regra

`Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx`, fornecida pelo Clovis. Duas abas;
esta decisão usa **"Tratamentos Simplificado"**. Para cada `Cargo do destinatário`, a tabela dá
quatro saídas: Nominata, Vocativo epistolar, Pronome de tratamento e Endereçamento. Usa
`[Nome]` como marcador — **não contém PII**.

Contagem da aba, que o gerador precisa reproduzir exatamente:

```
47 linhas de dados
 −6 linhas de seção      (Nominata vazia: Corpo Diplomático, Poder Legislativo,
                          Poder Executivo, Poder Judiciário, Autoridades religiosas, Outros)
 −3 cabeçalhos repetidos ("Cargo do destinatário" | "Vocativo", no meio da aba)
 =38 entradas reais
```

## Decisões do usuário

| Questão | Decisão |
|---|---|
| A que corresponde a coluna `Tratamento` da planilha | **Vocativo epistolar** |
| Qual aba rege | **Tratamentos Simplificado** |
| Como casar `Cargo` livre com a categoria formal | **Automático + arquivo de exceções manuais** |
| Peso da divergência no semáforo | **Amarelo (revisar)**, não vermelho |

## Por que não comparar strings direto

A coluna Vocativo não contém valores literais; contém **padrões**. Levantamento sobre os dados
reais:

| Complicação | Exemplo na tabela |
|---|---|
| Marcador de gênero | `Excelentíssimo(a) Senhor(a) Presidente` |
| Placeholder de cargo/patente | `Senhor(a) [Cargo]`, `Senhor(a) [Patente]` |
| Alternativas com "ou" | `Eminentíssimo Senhor Cardeal` **ou** `Eminentíssimo e Reverendíssimo Senhor Cardeal` |
| Alternativas com barra | `Senhor(a) Ministro(a) / Conselheiro(a)` |
| Feminino por extenso entre parênteses | `Senhor(a) Cônsul (Consulesa)` |
| Inconsistência da própria fonte | `Excelentíssimo(a) Senhor(a)` vs `Excelentíssimo Senhor(a)` |
| Cabeçalhos repetidos no meio da aba | `Cargo do destinatário` \| `Vocativo`, 3 ocorrências |
| Espaço sobrando | `"Excelentíssimo(a) Senhor(a) Presidente "` |

A planilha do Sistema Contatos, por sua vez, traz a forma **resolvida** ("Excelentíssimo Senhor
Presidente"). Comparar literalmente marcaria praticamente tudo como divergente.

## Decisão: expansão determinística de formas aceitas

Um módulo puro recebe a entrada da tabela mais o contato e produz o **conjunto de vocativos
aceitáveis**. A planilha "confere" se casar com **qualquer** forma do conjunto.

Alternativas descartadas:

| Alternativa | Por que não |
|---|---|
| **Similaridade com limiar** (`string-similarity`) | "Senhor Presidente" e "Excelentíssimo Senhor Presidente" são textualmente próximos e protocolarmente diferentes. O limiar mascararia exatamente o erro que se quer pegar |
| **IA classifica/valida** | Contraria o princípio "Camada A antes da B", custa uma chamada por contato e não é reproduzível. Em protocolo institucional, não-determinismo é o defeito errado a aceitar |

### Gramática de expansão

Aplicada em ordem, sobre o texto do Vocativo:

1. **Alternativas por "ou":** separar em `\n ou \n` → N variantes independentes.
2. **Alternativas por barra:** separar cada variante em ` / ` → mais variantes.
3. **Gênero sufixado:** `palavra(a)` colado à palavra. Se a palavra termina em `o`, o `o` é
   substituído por `a`; caso contrário o `a` é acrescentado.
   `Senhor(a)` → {Senhor, Senhora} · `Ministro(a)` → {Ministro, Ministra} ·
   `Excelentíssimo(a)` → {Excelentíssimo, Excelentíssima}
4. **Feminino por extenso:** ` (Palavra)` precedido de espaço e diferente de `(a)` → palavra
   alternativa. `Cônsul (Consulesa)` → {Cônsul, Consulesa}
5. **Placeholders:** `[Cargo]` e `[Patente]` são substituídos pelo `cargo` do contato. Contato
   sem `cargo` → **não auditável** (ver `sem_regra`), nunca divergente.
6. **Normalização final:** `trim`, colapso de espaços e `normalizarTexto` de `lib/normalize.ts`
   (minúsculas, sem acento). A normalização também absorve irregularidades como
   `Juiz(a)` → "juiza" ≈ "juíza".

O produto cartesiano dos passos 3 e 4 é intencional: `Senhor(a) Cônsul (Consulesa)` aceita as
quatro combinações.

Endereçamento segue a mesma gramática, com duas diferenças: `[Nome]` é substituído pelo nome do
contato, e as quebras de linha são colapsadas em espaço antes da comparação.

## Casamento cargo → regra

`lib/tratamento.ts` resolve o `Cargo` livre da planilha para uma entrada da tabela:

1. Casamento exato sobre o texto normalizado.
2. Não havendo exato, similaridade — mesmo motor já usado para grupos em `lib/catalogo.ts`.
3. Exceções explícitas em `data/cargos-tratamento.ts`, um mapa `cargo da planilha → cargo do
   destinatário` que o Clovis ajusta. **A exceção tem precedência sobre 1 e 2.**

O mapa de exceções existe porque a taxonomia da tabela não é a do Sistema Contatos: "Ministro
do STF" na planilha precisa cair em "Ministro de Tribunal Superior", e nenhuma similaridade
textual garante isso de forma confiável.

Cargo que não resolve por nenhum dos três caminhos → `sem_regra`. **Nunca divergente:** não
saber a regra é diferente de saber que está errado — o mesmo princípio que a regra de ouro do
spec de 2026-06-14 aplica a "possível saída".

## Mudanças de contrato (`lib/types.ts`)

```ts
export type SituacaoCampo = "confere" | "divergente" | "fonte_nao_informa" | "sem_regra";
export type OrigemDado = "pagina" | "conhecimento" | "protocolo";
```

- **`sem_regra`** — cargo não mapeado, ou contato sem cargo. Distinto de `fonte_nao_informa`,
  que significa "o site não informa esse campo".
- **`protocolo`** — terceira procedência do valor esperado, ao lado de página e conhecimento
  da IA.
- **`valorSite` passa a `valorEsperado`** em `ComparacaoCampo`. São 21 ocorrências em 5
  arquivos (`lib/types.ts`, `lib/match.ts`, `lib/export.ts`, `components/resultado-tabela.tsx`,
  testes). É mecânico, e é necessário: manter um campo chamado `valorSite` carregando valor de
  tabela de protocolo é mentira no código, e a exportação hoje rotula a coluna como `"(site)"`,
  o que sairia errado na planilha entregue ao usuário. O rótulo da coluna exportada passa a
  derivar de `origemValor`.

Planilha com o campo **vazio** e regra existente é `divergente`, com `valorEsperado`
preenchido — o cadastro está incompleto, e isso é um achado, não uma ausência de informação.

## Semáforo

Divergência de tratamento ou endereçamento pesa **amarelo (revisar)**. Vermelho, hoje,
significa "a autoridade mudou"; forma de tratamento errada é falha de cadastro, não de
realidade. Misturar as duas coisas degradaria o sinal que já funciona.

## Arquivos

| Arquivo | Papel |
|---|---|
| `data/tratamentos.ts` | **Novo.** 38 entradas da aba Simplificado, tipadas e versionadas |
| `data/cargos-tratamento.ts` | **Novo.** Mapa de exceções cargo → categoria, editado à mão |
| `scripts/gerar-tratamentos.mjs` | **Novo.** XLSX → `data/tratamentos.ts`; filtra os 3 cabeçalhos repetidos |
| `lib/tratamento.ts` | **Novo.** Expansão das formas aceitas + resolução de cargo. Puro |
| `lib/types.ts` | `SituacaoCampo`, `OrigemDado`, `valorEsperado` |
| `lib/match.ts` | Acrescenta as comparações de protocolo a `comparacoes` |
| `lib/export.ts` | Rótulo da coluna derivado de `origemValor` |
| `components/resultado-tabela.tsx` | Exibe as novas situações |

O XLSX de origem ganha exceção no `.gitignore`: a regra `*.xlsx` existe porque planilhas do
Senado contêm PII, e **esta não contém** — só cargos e marcadores `[Nome]`. Versioná-la
preserva a proveniência do arquivo gerado, como `data/apply-all.sql` faz para o catálogo.

## O que este spec não altera

Raspagem, Camada IA, catálogo de grupos/fontes, upload no cliente e o motor de comparação
planilha × site permanecem intocados. A suíte atual continuar verde é o critério de que a
adição foi aditiva.

## Fora de escopo

- **Geração do Kit** (convite, cartão de acesso, cinta) a partir de `Regras do Kit.txt`. É
  geração de material, não auditoria — merece spec próprio.
- **Aba "Tratamentos Convites"** (15 entradas). Fica disponível no XLSX para uma iteração
  futura que precise distinguir mailing de convite.
- **`Regras de Atualizacao/e-mail orientacao.pdf`** — destina-se a outra finalidade, conforme
  confirmado pelo Clovis em 2026-08-13. Não rege esta auditoria e não foi incorporado. (Nota
  técnica, caso venha a ser necessário em outro contexto: é um PDF de imagem, e o ambiente só
  dispõe de `pdftotext`, sem `pdfimages`/`pdftoppm` para rasterizar as páginas — ler o
  conteúdo exigirá que o texto seja fornecido ou que as páginas venham como imagem.)

## Trade-offs aceitos

- **A gramática de expansão é heurística sobre uma fonte inconsistente.** A própria tabela
  alterna `Excelentíssimo(a)` e `Excelentíssimo`. Onde a fonte é ambígua, a expansão tende a
  ser permissiva — prefere-se deixar passar um caso duvidoso a acusar falso positivo, porque
  um "divergente" errado num campo de protocolo destrói a confiança na ferramenta mais rápido
  do que um "confere" leniente.
- **O mapa de exceções exige manutenção.** Cargo novo no Sistema Contatos que não case
  automaticamente aparece como `sem_regra` até ser mapeado. É visível e não silencioso, que é
  o comportamento desejado.
- **`[Patente]` depende do cargo do contato.** Para militares, se a patente não estiver no
  campo `cargo`, o resultado é `sem_regra`.
