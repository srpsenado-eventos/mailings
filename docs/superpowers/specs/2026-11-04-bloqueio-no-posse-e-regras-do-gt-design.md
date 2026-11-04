# Bloqueio no Posse por grupo, regras do GT em vigor, tabela de tratamentos v02 e nome como no site

Data: 2026-11-04. Situação: desenho conversado com o Clovis em 04/11, a aprovar sobre este documento. Complementa a spec de 2026-10-30 (decisões de duplicidade), a de 2026-08-13 (tratamento e endereçamento), a de 2026-09-18 (regras de escrita do nome, Camada C) e revoga o §4.2 da de 2026-10-23 (exceção por fonte em que o Contatos prevalece).

## 1. Intenção

O GT mudou a forma de tratar a pessoa que está em mais de um grupo. Até 29/10 a pessoa era **retirada** do grupo que não convida no Sistema Contatos. Em 04/11 o Clovis decidiu que ela **volta aos grupos de origem** e, em vez de retirada, é **bloqueada no Sistema Posse**, por pessoa em cada grupo, no momento em que o grupo for autorizado. O Fiscal precisa dizer, na hora da autorização, em qual grupo bloquear, e registrar que o bloqueio foi feito.

Na mesma conversa vieram três regras novas do GT que a fiscalização precisa absorver ou mostrar:

1. **Tabela de tratamentos v02** ("REGRA GERAL"): Governador, Prefeito, Presidente de Assembleia Legislativa / Câmara Legislativa e Presidente de Câmara Municipal perdem o "Excelentíssimo" na nominata e no vocativo. Dos grupos auditados, só Governadores muda.
2. **Nome exatamente como no site oficial**, inclusive quando o GT conhece o nome político (exemplo do Clovis: Rodrigo Pacheco). Motivo: "a equipe não tem condições de saber essa análise para 100% das pessoas".
3. **STM**: as patentes serão pesquisadas pelo Daniel no site do STM; sem resposta, o GT consulta a ASPAR do Exército. Quando for preciso abreviar o nome, abrevia-se o sobrenome, nunca a patente.

**Anti-objetivos:**
- O app nunca escreve no Contatos nem no Posse. O bloqueio é feito por pessoas; o app só registra que foi feito.
- Nenhuma regra nova é generalizada além do que o Clovis disse: a regra de abreviação é só do STM; a lista de patentes só vira auditoria quando chegar, em pedido próprio.
- Uma decisão de duplicidade antiga não é alterada pela mudança de método: o grupo do convite continua o mesmo.

## 2. Decisões do Clovis (04/11)

1. O bloqueio no Posse é **por pessoa em cada grupo**. "No momento em que formos autorizar o grupo, bloquearemos no grupo incorreto." O Fiscal deve deixar isso destacado.
2. O bloqueio feito **é marcado no Fiscal** ("quero marcar no fiscal"), e o aviso passa a dizer que a pessoa está bloqueada.
3. As 12 autoridades retiradas entre 26 e 29/10 (planilha `GT Posse/Contatos/POSSE 2027 - Retornar aos grupos de origem - 04NOV2026.xlsx`) voltam aos grupos de origem no Contatos. O app não faz nada com isso além de refletir a próxima base.
4. A tabela de protocolo passa a ser `GT Posse/PP27_TabelaTratamentos_v02 - REGRA GERAL.xlsx`.
5. Nome como no site oficial, sem exceção por conhecimento do nome político.
6. STM: patentes pendentes (Daniel; ASPAR do Exército se não achar) e abreviar o sobrenome em vez da patente.

## 3. Desenho

### 3.1 Bloqueio no Posse por pessoa e grupo

#### 3.1.1 O que é "grupo a bloquear"

Para um caso com decisão manual vigente (spec 2026-10-30 §4.1.1), os **grupos a bloquear** são:

| Tipo da decisão | Grupos a bloquear |
|---|---|
| `mesma_pessoa` | todo grupo do Contatos em que a pessoa está hoje e que não é o grupo do convite (`convidaPor`) |
| `nao_recebe_convite` | todo grupo do Contatos em que a pessoa está hoje |
| `pessoas_diferentes` | nenhum |
| `ajustar_contatos` | nenhum (segue como na spec de 30/10) |

"Está hoje" é calculado ao vivo com os grupos do retrato, como já se faz em `gruposAtuaisDoCaso` (`lib/decisoes-coleta.ts`). Lista de fora (planilha da Câmara, eleitos do TSE) **não** é grupo a bloquear: o bloqueio só existe em grupo do Contatos. Eleitos decididos pela AUDITORIA (destino "Deputado Federal eleitos …" etc.) não geram grupo a bloquear enquanto a pessoa não estiver em um grupo do Contatos que não convida.

**Eunício Oliveira.** O caso dele está registrado como `ajustar_contatos` (convite por Deputados Federais; a planilha de 29/10 mandava retirá-lo de Ex-Presidentes do Senado quando a Câmara subisse). Pela regra de 04/11 ele volta a Ex-Presidentes do Senado e é bloqueado ali. A carga desta spec acrescenta ao caso dele um registro manual `mesma_pessoa`, `convidaPor: "Deputados Federais"`, data 2026-11-04, quem "Clovis (04/11)", observação "Regra de 04/11: fica em Ex-Presidentes do Senado e é bloqueado no Posse nesse grupo; convite por Deputados Federais quando o grupo existir no Contatos". O registro antigo fica no histórico. Nenhum outro caso `ajustar_contatos` muda (Celina Leão e Daniel Vilela são "convidar como governador atual", já tratados).

#### 3.1.2 O registro do bloqueio

Entra um tipo novo de registro no histórico do caso (`lib/decisoes.ts`):

```ts
export interface RegistroBloqueio {
  tipo: "bloqueio" | "desbloqueio";
  grupo: string;        // grupo do Contatos, nome canônico, como em `grupos` do registro manual
  data: string;         // AAAA-MM-DD, informada por quem marca (padrão: hoje)
  quem: string;         // texto digitado, como em RegistroManual.quem
  observacao: string;   // livre, pode ser vazia
}
export type Registro = RegistroManual | RegistroColeta | RegistroBloqueio;
```

- O bloqueio **não é decisão**: a regra "o registro manual mais recente vale" (spec 30/10 §4.1.1) continua olhando só `RegistroManual`. Um `bloqueio` nunca muda o grupo do convite. Atenção na construção: hoje o código reconhece decisão manual por `tipo !== "coleta"`; com o tipo novo essa checagem passa a ser pelos quatro tipos de `TipoDecisao`.
- Por grupo, vale o registro de bloqueio/desbloqueio **mais recente**. Grupo com `bloqueio` vigente está **bloqueado**; com `desbloqueio` vigente ou sem registro está **a bloquear** (se for grupo a bloquear).
- `desbloqueio` existe para desfazer um erro de marcação. Não apaga o histórico.
- Quando a decisão manual muda (novo registro manual com outro `convidaPor`, ou outro tipo), os bloqueios registrados continuam no histórico, mas só contam para os grupos que a decisão nova considera a bloquear. Um grupo bloqueado que virou grupo do convite aparece com o aviso de atenção "Bloqueada no Posse em DD/MM, mas é o grupo do convite: desbloquear" (ver 3.1.4).
- O histórico mostra os registros de bloqueio na mesma lista dos outros, do mais recente para o mais antigo.

**Gravação:** pela rota existente `POST /api/decisoes` (só modo local, 404 em web, mesma proteção de origem), com um corpo próprio para bloqueio: `{ nome, nomes, bloqueio: { tipo, grupo, data, quem, observacao } }`. A rota procura o caso pelos nomes (como já faz para o registro manual) e acrescenta o registro; caso sem decisão manual vigente é recusado com 422 ("registre a decisão antes do bloqueio"). Escrita atômica em `.fiscal/decisoes.json`, como hoje. `versao` do arquivo continua 1: arquivo antigo sem registros de bloqueio é válido.

**Publicação:** `decisoes.json` já vai ao Blob com o retrato; os bloqueios vão junto. A web só lê.

#### 3.1.3 Situação no Contatos (substitui a tabela do §4.1.4 da spec de 30/10 para `mesma_pessoa` e `nao_recebe_convite`)

Três condições entram no cálculo, todas ao vivo com os grupos do retrato:

- **a bloquear sem bloqueio**: há grupo a bloquear (§3.1.1) sem bloqueio vigente;
- **falta no grupo do convite**: `mesma_pessoa` cujo `convidaPor` é grupo do Contatos (não lista de fora) e a pessoa não está nele no retrato. É o caso dos eleitos da AUDITORIA enquanto não são cadastrados no grupo de destino (spec 30/10 §4.1.4, "A cadastrar") e do Eunício enquanto Deputados Federais não existe no Contatos;
- **bloqueio no grupo do convite**: há bloqueio vigente registrado no grupo do convite.

| Situação | Quando | Texto |
|---|---|---|
| Tratado | nenhuma das três condições | "Tratado" |
| Pendente | pelo menos uma das três | "Pendente de bloqueio no Posse" (a bloquear sem bloqueio); "Pendente: a cadastrar no grupo do convite" (falta no grupo do convite); "Pendente: bloqueio no grupo do convite, desbloquear" (bloqueio no grupo do convite). Com mais de uma condição, os textos vão juntos, separados por " · ", nessa ordem. |
| Reaberto | como hoje: a pessoa está num grupo que não constava em `grupos` do registro manual vigente. O caso volta para "A conferir". Grupos a bloquear só são calculados de novo depois de nova decisão. | "Reaberto" |

`nao_recebe_convite` usa só a primeira condição. `ajustar_contatos` mantém os textos e a regra de hoje (o ajuste ainda é feito no Contatos). A entrada automática `coleta` continua sendo gravada só quando a situação muda, com a data da varredura; a primeira varredura depois desta mudança grava uma entrada nova em todo caso cujo texto mudou (é esperado).

Efeito prático na primeira varredura: os 13 eleitos da AUDITORIA, que hoje estão "pendente" sem grupo no Contatos, continuam "Pendente: a cadastrar no grupo do convite" (mesmo significado de hoje, texto novo). Quem está só no grupo do convite (hoje 11 casos: os 8 retirados entre 26 e 29/10 já refletidos na base de 27/10, inclusive o Davi, e os 3 governadores reeleitos Lucas Ribeiro, Mailza Cameli e Otaviano Pivetta) fica "Tratado".

**Reaparecimento dos 12 retirados.** Quando a base nova trouxer as 12 autoridades de volta aos grupos de origem, nenhum caso reabre: os grupos em que elas reaparecem são os mesmos registrados na decisão. A situação passa de "Tratado" para "Pendente de bloqueio no Posse", que é o estado certo até o GT bloquear. O Davi Alcolumbre reaparece em Senadores e em Presidente do Senado Federal e tem os dois como grupos a bloquear.

#### 3.1.4 O que a tela mostra

**No painel, na linha do contato**, no lugar das marcas de hoje (`marcaDaDecisao`, `lib/repetidos-decisoes.ts`):

| Estado da linha | Etiqueta (campo `grupo`) | Tom | Fosca |
|---|---|---|---|
| grupo a bloquear, sem bloqueio | "Bloquear no Posse neste grupo ao autorizar · convite pelo grupo X (decisão do GT de DD/MM)" | atenção | não |
| grupo a bloquear, bloqueado | "Bloqueada no Posse em DD/MM · convite pelo grupo X (decisão do GT de DD/MM)" | neutro | sim |
| `nao_recebe_convite`, sem bloqueio | "Bloquear no Posse neste grupo ao autorizar · não recebe convite (decisão do GT de DD/MM)" | atenção | não |
| `nao_recebe_convite`, bloqueado | "Bloqueada no Posse em DD/MM · não recebe convite (decisão do GT de DD/MM)" | neutro | sim |
| grupo do convite | "Convidada por este grupo; também em …" como hoje; se houver bloqueio vigente **neste** grupo: "Bloqueada no Posse em DD/MM, mas é o grupo do convite: desbloquear" | neutro; atenção no segundo caso | não |

Quando a pessoa **não está no grupo do convite** no Contatos (condição "falta no grupo do convite" do §3.1.3), a linha do grupo que não convida mostra a etiqueta "a bloquear" acima **e mais** a de atenção de hoje, "Grupo do convite X sem a pessoa no Contatos". O bloqueio continua certo (ela não pode ser convidada por este grupo); o cadastro no grupo do convite é a outra pendência, e as duas aparecem.

A linha "a bloquear" **não é fosca** de propósito: o destaque é o pedido do Clovis. Ela continua fora das contagens do semáforo (Conferem, Com divergência etc.), como hoje: o eixo de duplicidade não pinta o semáforo. Entra numa contagem própria (abaixo).

Na linha, em modo local, um botão **"Marcar bloqueio no Posse"** (ou **"Desfazer bloqueio"** quando bloqueado) abre o mesmo tipo de formulário pequeno de `registro-decisao.tsx`: data (padrão hoje), quem, observação. Em modo web, só a etiqueta.

**No cabeçalho do grupo** (ao lado de `resumoDoGrupo`): "**N a bloquear no Posse ao autorizar este grupo**" em atenção quando N > 0, e "M bloqueadas no Posse" em neutro quando M > 0. É a informação que quem autoriza o grupo precisa ver antes de abrir as linhas.

**No resumo do painel**: um cartão "A bloquear no Posse" com o total de linhas a bloquear em todos os grupos, e um filtro "A bloquear no Posse" na lista de filtros (`Filtro` em `lib/painel.ts`), que mostra só os grupos com linha a bloquear e, dentro deles, só essas linhas.

**Em `/repetidos`**: o filtro "Tratadas no Contatos" passa a "Tratadas"; entra o filtro "A bloquear no Posse" (casos com grupo a bloquear sem bloqueio). Cada caso mostra, por grupo, "a bloquear" ou "bloqueada em DD/MM", com o botão de marcar/desfazer em modo local. A planilha baixada ganha duas colunas: "Grupos a bloquear no Posse" e "Bloqueios registrados" (grupo e data, separados por "; ").

### 3.2 Regras do GT em vigor

Um quadro **"Regras do GT em vigor"** no topo do painel, logo abaixo do cabeçalho, aberto por padrão na primeira visita e com botão para recolher (estado só do navegador, não persistido). Vai para a web igual. O conteúdo vem de um arquivo versionado `data/regras-gt.ts`:

```ts
export interface RegraGt {
  data: string;            // AAAA-MM-DD da decisão
  titulo: string;
  texto: string;
  grupos?: readonly string[]; // grupos canônicos em que a regra também aparece no cabeçalho
}
export const REGRAS_GT: readonly RegraGt[] = [ … ];
```

Entradas iniciais, com os textos exatos:

| data | titulo | texto | grupos |
|---|---|---|---|
| 2026-11-04 | Nome | "O nome é exatamente como está no site oficial do órgão, inclusive quando o GT conhece o nome político (ex.: Rodrigo Pacheco). A equipe não tem como fazer essa análise para 100% das pessoas." | — |
| 2026-11-04 | Pessoa em mais de um grupo | "A pessoa fica em todos os grupos no Contatos. No Sistema Posse ela é bloqueada, por pessoa em cada grupo, no grupo que não convida, no momento em que o grupo for autorizado. O Fiscal mostra em qual grupo bloquear e registra o bloqueio feito." | — |
| 2026-11-04 | STM: patentes | "As patentes serão pesquisadas pelo Daniel no site do STM. Se não encontrar, o GT consulta a ASPAR do Exército. Até lá, o Fiscal não audita patente." | Ministros do STM |
| 2026-11-04 | STM: abreviação | "Quando for preciso abreviar o nome, abreviar o sobrenome, nunca a patente." | Ministros do STM |
| 2026-11-04 | Tratamento | "Tabela de tratamentos v02 (REGRA GERAL): Governador, Prefeito, Presidente de Assembleia Legislativa / Câmara Legislativa e Presidente de Câmara Municipal passam a Senhor(a); o endereçamento não muda." | Governadores |

Regra com `grupos` aparece também, em uma linha curta ("Regra do GT de DD/MM: título"), no cabeçalho do grupo, com o texto completo ao passar o mouse ou expandir (`explicacao`, como as etiquetas). Cada entrada nova é decisão do Clovis, como no catálogo; o construtor não acrescenta regras.

### 3.3 Nome como no site oficial

- `FonteCatalogo.nomesDoContatos` (spec 2026-10-23 §4.2) **sai** do contrato, do catálogo (fonte da Nova República) e de `lib/analise.ts`. Garibaldi Alves Filho passa a sair "Nome diverge" com o nome que a página publica ("Garibaldi Alves"), como qualquer outro. Testes correspondentes em `tests/analise.test.ts`, `tests/match.test.ts` e `tests/catalogo-dados.test.ts` são trocados por um que garante que a exceção não existe mais (fonte com nome diferente do Contatos produz `divergente` com `valorEsperado` igual ao da página).
- O princípio fica registrado no `CLAUDE.md` (seção de regras de negócio, item Nome) e no quadro do §3.2.
- As regras de escrita da Camada C que não vêm do site continuam: sem "Dr./Dra." no STM; "Ministro(a)" antes do nome do presidente de tribunal e "Presidente" no Presidente da República (spec 2026-10-30 §3.3). Elas são decisões do GT sobre a escrita do cadastro e não contrariam a frase do Clovis.

### 3.4 Tabela de tratamentos v02

- O arquivo `GT Posse/PP27_TabelaTratamentos_v02 - REGRA GERAL.xlsx` é copiado para `Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx` (caminho fixo do gerador; a planilha não é versionada). A versão anterior fica ao lado como `Posse2027_TabelaTratamentos_v01-2026-09-15.xlsx`, fora do git.
- `scripts/gerar-tratamentos.mjs` roda de novo e regrava `data/tratamentos.ts`. A diferença esperada é exatamente a dos quatro cargos (nominata e vocativo), nada mais: o construtor confere o diff antes de commitar.
- Os testes que esperam "Excelentíssimo" para Governador, Prefeito ou presidentes de casa legislativa (`tests/export.test.ts`, `tests/match-protocolo.test.ts`, `tests/tratamento-coerencia.test.ts`, `tests/tratamento-comparacao.test.ts`, `tests/tratamento-expansao.test.ts`, `tests/tratamento-pares.test.ts`) passam a esperar "Senhor(a)". Os pares tratamento × endereçamento (spec 2026-10-30, regras de pares) são conferidos para Governador: endereçamento "A Sua Excelência o(a) Senhor(a)" continua, com tratamento "Senhor(a)".
- Adendo datado de 04/11 na spec de 2026-08-13 ("Fonte da regra": tabela v02) e linha nova na tabela de specs do `CLAUDE.md`.
- Efeito esperado na coleta: os 27 governadores deixam de sair "tratamento divergente" (o Contatos já traz "Senhor"). Governadores eleitos usam a mesma regra de Governador.

### 3.5 STM: nome acima do limite

Regra nova da Camada C (`data/regras-nome.ts`), **só para "Ministros do STM"**: `limiteCaracteres: 50`. Nome com mais de 50 caracteres (contando espaços e pontos, como o campo Nome do Posse conta) sai com etiqueta de atenção no campo nome: "Nome com N caracteres, acima do limite de 50 do Posse: abreviar o sobrenome, nunca a patente (regra do GT de 04/11)". Não propõe a abreviação: quem decide a forma é o GT. Hoje há 1 caso (51 caracteres).

Minha escolha, a confirmar pelo Clovis na leitura: o limite de 50 é o do campo Nome do Sistema Posse, já usado pelos scripts da pasta Contatos do GT ("Nome com 51 caracteres, acima do limite de 50"). A regra fica restrita ao STM porque a frase do Clovis é "exclusivamente para o grupo do STM"; estender a outros grupos é pedido novo.

### 3.6 O que não muda

- Grupo do convite de cada decisão. Regras de precedência (`data/precedencia.ts`). Reabertura por grupo novo.
- `ajustar_contatos` e `pessoas_diferentes`.
- Eixo da eleição, agrupador, Camada D.
- A memória de leitura, a leitura resiliente e o catálogo (fora a exceção do Garibaldi).

## 4. Fora do escopo

- Auditar patentes do STM (depende da lista do Daniel ou da ASPAR).
- Limite de 50 caracteres em outros grupos.
- Integração com o Sistema Posse (o bloqueio é feito lá por pessoas).
- Reescrever os 12 retornos no Contatos: é o GT quem faz, com a planilha de 04/11.

## 5. Escolhas do construtor

Ficam para o construtor, sem voltar ao Clovis: a forma do formulário de bloqueio (reaproveitar `registro-decisao.tsx` ou um componente irmão), o nome das funções puras novas, a posição exata do cartão e do filtro, e como o quadro de regras recolhe. Os textos das etiquetas, dos filtros e das regras são os desta spec, sem variação.

## 6. Critérios de aceite

1. Com a base atual (27/10) e `decisoes.json` de hoje mais o registro do Eunício (§3.1.1): nenhum caso reabre; os 11 casos em que a pessoa está só no grupo do convite ficam "Tratado"; Sebastião Reis Júnior, Cueva e Wellington Dias, que ainda estão nos dois grupos na base de 27/10, ficam "Pendente de bloqueio no Posse"; Eunício fica "Pendente de bloqueio no Posse · Pendente: a cadastrar no grupo do convite"; os 13 eleitos da AUDITORIA ficam "Pendente: a cadastrar no grupo do convite". Nas linhas dos grupos que não convidam aparece a etiqueta de atenção, e o contador no cabeçalho (STJ 2, Senadores titulares fora de exercício 1, Ex-Presidentes do Senado 1).
2. Marcar o bloqueio em um deles, em modo local, grava `bloqueio` no histórico, a linha vira fosca com "Bloqueada no Posse em DD/MM …", o contador do grupo cai, e a situação vira "Tratado" na próxima varredura (entrada `coleta`). Desfazer volta ao estado anterior.
3. Em modo web, as etiquetas e contadores aparecem iguais; nenhum botão.
4. Painel com o quadro "Regras do GT em vigor" (5 entradas) e as linhas curtas nos cabeçalhos de Ministros do STM e Governadores.
5. Governadores: tratamento confere na coleta nova; os seis arquivos de teste citados atualizados; `data/tratamentos.ts` regerado com diff restrito aos quatro cargos.
6. Garibaldi sai "Nome diverge" com o nome da página; `nomesDoContatos` não existe mais no código.
7. O ministro do STM com 51 caracteres sai com a etiqueta de atenção do §3.5; os outros 14, não.
8. `npm test`, `npm run typecheck` e `npm run build` verdes.

## 7. Depois do merge

Rotina do `CLAUDE.md`: deploy automático conferido, coleta nova (de preferência com a base exportada depois do retorno dos 12), publicação, PRODASEN, relatório com a contagem "a bloquear no Posse" por grupo.
