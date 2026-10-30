# Decisões sobre duplicidades, eleitos por grupo e agrupador da Posse 2027

Data: 2026-10-30. Situação: desenho aprovado pelo Clovis em 30/10, depois da rodada de perguntas de 29 e 30/10. Complementa as specs de 2026-10-05 (eleitos), 2026-10-12 (grupo Deputados Federais), 2026-10-14 e 2026-10-27 (autoridades em mais de um grupo). Abre uma exceção à regra "o retrato é a única persistência" (§4.1.2).

## 1. Intenção

O GT (Clovis e Marina) já trata as duplicidades no Contatos e quer **ter a certeza de que analisou cada caso e fez o movimento certo**. Hoje a decisão vive só numa planilha solta ("Contatos Duplicados tratados", 29/10). O app recalcula os repetidos a cada coleta e não sabe o que já foi decidido.

O pedido tem três partes, mais uma troca de fonte:

1. **Registro de decisões no app**, com histórico, para as duplicidades e para os eleitos "a conferir". Ele precisa refletir no painel: no grupo que não convida, a linha fica fosca e diz por qual grupo a pessoa será convidada.
2. **Eleitos separados nos grupos do Contatos.** Exemplo: Deltan Dallagnol é senador eleito, mas no painel aparece só como "eleito", numa seção que mistura Senado, Câmara e governo. Os eleitos precisam cair no grupo certo e servir de base de comparação quando chegar a planilha da SGM.
3. **Agrupador da Posse 2027.** O painel passa a mostrar todos os grupos que vão existir no Contatos, inclusive os vazios, com a quantidade em cada um.
4. **Deputados atuais pela planilha do site da Câmara.** O `deputado.xls` baixado do site entra na Nova varredura no lugar da planilha gerada por script.

**Anti-objetivos:**
- O app nunca escreve no Contatos.
- O registro nunca decide sozinho uma duplicidade.
- Uma decisão antiga nunca esconde um grupo novo que apareceu depois dela.

## 2. O que já foi medido (29/10)

- **Câmara:** comparei o `deputado.xls` do site (29/10, 15h55, 513 linhas: 486 titulares, 19 efetivados e 8 suplentes) com a planilha gerada em 26/10. A única diferença: entrou **Leo Prates** (titular, BA), que voltou ao exercício, e saiu o suplente José Carlos Araujo. Por isso o Leo Prates ficou fora da última análise.
- **TSE:** baixei de novo a totalização (eleição 6259, 1º turno, e 6260, 2º turno). Os 54 senadores, os 513 deputados e os 27 governadores eleitos são os mesmos das planilhas de `GT Posse/Eleitos 2026`, e todos os votos estão válidos.
- **Deltan:** a planilha de senadores marca o status "Mandato novo (atual deputado federal)", porque ele foi eleito deputado em 2022. Ele não está em exercício na Câmara. `classificarUm` (`lib/eleitos.ts`) manda o caso para `conferir`, e o painel o mostra em "Eleitos — a conferir", uma seção única, sem a Casa no título (`lib/painel-eleicao.ts`). Hoje há 49 eleitos nessa seção (3 do Senado e 46 da Câmara).
- **Repetidos:** na base de 27/10 o app aponta 43 autoridades (13 a conferir e 30 decididas). Na planilha falta Hugo Motta (Presidente da Câmara × deputado atual). Cueva e Sebastião Reis Júnior estão como "retirado do STJ em 26/10", mas na base de 27/10 continuam no STJ e no TSE.
- **Contatos:** o Clovis informou quantidades mais novas que a base de 27/10: STJ 31, Ex-Presidentes do Senado 4, Senadores fora de exercício 2, Governadores eleitos 8. A coleta final precisa de uma base exportada depois de 29/10.

## 3. Decisões do Clovis (29 e 30/10)

1. **Onde se registra:** na tela do app, em modo local. A web mostra o histórico só para leitura. A planilha anexa entra uma vez, como histórico inicial, com as duas partes: as duplicidades e a AUDITORIA.
2. **Tipos de decisão:**
   - mesma pessoa, convidada pelo grupo X;
   - pessoas diferentes;
   - não recebe convite (a pessoa convida, como o Davi);
   - ajustar no Contatos.
3. **Campos de cada registro:** data, observação livre, quem decidiu (texto digitado; não há login individual) e status de validação ("Validado" ou "A validar").
4. **Caso que muda depois da decisão:** se a pessoa aparecer num grupo que não estava no caso decidido, o caso volta para "Conferir", com o aviso "grupo novo desde a decisão de DD/MM". A decisão antiga fica no histórico.
5. **Eleitos a conferir:** usam o mesmo registro das duplicidades.
6. **Grupos dos eleitos (Ata 14):**

| Quem | Grupo no Contatos |
|---|---|
| Senador reeleito | Senadores |
| Senador de mandato novo, com o Deltan | Senadores eleitos - Posse Presidencial 2027 |
| Deputado reeleito, ou em exercício e eleito | Deputados Federais (atuais), com "a cadastrar" enquanto não estiver no Contatos |
| Deputado de primeiro mandato | Deputado Federal eleitos - Posse Presidencial 2027, com "a cadastrar" enquanto não estiver no Contatos |
| Deputado eleito senador | Fica em Deputados Federais |
| Senador eleito deputado ou governador | Fica em Senadores |
| Governador reeleito | Governadores |
| Governador de mandato novo | Governadores eleitos - Posse Presidencial 2027 |

7. **Quem decide reeleito ou primeiro mandato:** a lista de exercício da Câmara, e não o status da planilha do TSE. Quem está na lista é deputado atual e quem não está é primeiro mandato. É a regra que o GT aplicou na parte AUDITORIA da planilha.
8. **Agrupador:** todos os grupos da Posse 2027, inclusive os vazios. Os grupos sem site oficial por natureza (convidados, familiares, delegações) ficam **neutros**: não aparecem vermelhos por falta de fonte; tratamento, endereço e duplicidade continuam sendo conferidos.
9. **Fonte dos deputados atuais:** o `deputado.xls` do site da Câmara, solto na Nova varredura.
10. **Com o que se comparam os grupos de eleitos e Deputados Federais** (resposta de 30/10 à revisão): "num primeiro momento, com as listas que temos", ou seja, as planilhas do TSE e o `deputado.xls` da Câmara, como já foi feito com os duplicados. Cada pessoa vai para o grupo correspondente conforme as definições acima. Nenhum desses grupos é lido por página de site (§4.6).

## 4. Desenho

### 4.1 Registro de decisões

#### 4.1.1 O caso e a decisão

**Caso** é uma pessoa que o app aponta para conferir: uma autoridade em mais de um grupo (`autoridadesRepetidas`) ou um eleito com destino `conferir`. O caso é identificado pelos nomes normalizados da pessoa (`normalizarNome`; um caso pode ter mais de uma forma, como "Ministro Kassio Nunes Marques" e "Nunes Marques") e pelos grupos (ou listas de fora) em que ela estava quando a decisão foi tomada.

**Registro** é uma entrada no histórico do caso:
- `tipo`: `mesma_pessoa`, `pessoas_diferentes`, `nao_recebe_convite`, `ajustar_contatos` ou `coleta`. O tipo `coleta` é a entrada automática do §4.1.4.
- `convidaPor`: o grupo do convite. Obrigatório em `mesma_pessoa`; opcional em `ajustar_contatos`, quando já se sabe o grupo.
- `outraPessoa`: as ocorrências do caso que são outra pessoa. Exemplo: Lucas Ribeiro é a mesma pessoa em Governadores e em Governadores Eleitos, mas o deputado que casou pelo nome (Pedro Lucas Fernandes Ribeiro) é outro.
- `grupos`: os grupos do caso no momento do registro.
- `data`, `observacao`, `quem` e `validacao` (`validado` ou `a_validar`).

Um caso pode ter vários registros. **O registro manual mais recente vale**; as entradas de coleta só contam a história.

**Lista de fora e grupo são a mesma coisa.** Para identificar o caso e para a regra de reabertura, a lista de fora vale como o grupo que ela representa:
- a planilha da Câmara (origem `camara`) vale como o grupo "Deputados Federais";
- um eleito ligado (origem `eleicao`) vale como o grupo de destino dele no §3.6.

Quando o grupo Deputados Federais subir ao Contatos, os casos decididos com a ocorrência "Câmara" **não** reabrem, e o do Eunício passa a ser conferido contra o grupo real.

Nas decisões dos eleitos, `convidaPor` é o grupo de destino da tabela do §3.6 ("Deputados Federais", "Deputado Federal eleitos - Posse Presidencial 2027" etc.). `pessoas_diferentes` em um eleito quer dizer que a pessoa do Contatos (ou da Câmara) com quem ele casou pelo nome é outra pessoa. O eleito então segue a regra do §4.3 sem essa ligação.

#### 4.1.2 Onde fica

- Arquivo próprio, `.fiscal/decisoes.json`, fora do git, com escrita atômica, como o retrato. Ele **não** é substituído a cada coleta.
- É a exceção aberta por esta spec à regra "o retrato é a única persistência".
- Não guarda contato (telefone, e-mail, endereço), só nomes de autoridades, grupos e o texto do GT.
- Gravação por uma rota nova, só em modo local (404 em modo web, como `/api/analise`), com a mesma proteção de origem de `/api/publicar`.
- "Publicar na web" leva as decisões junto com o retrato. A web só lê.

#### 4.1.3 O que a tela mostra

**Em `/repetidos`:**
- Cada caso tem o botão **Registrar decisão** (só em modo local) e o histórico, que pode ser aberto e fechado, do mais recente para o mais antigo.
- Filtros: "A conferir", "Decididas pela regra", "Decididas pelo GT" e "Tratadas no Contatos".
- O caso decidido cujo Contatos já reflete a decisão aparece em **"Tratadas no Contatos"**, mesmo que a pessoa não esteja mais repetida. Exemplo: Nunes Marques, que saiu do STF. Para isso a página lê também as decisões cujos casos já não aparecem no cálculo, e procura a pessoa nos grupos do retrato.
- A planilha baixada pela página ganha as colunas da decisão vigente e da situação no Contatos.

**No painel**, na linha do contato:
- **`mesma_pessoa`**, no grupo que não convida, se o Contatos ainda tem a pessoa ali: a linha fica fosca (visualmente atenuada, com o texto legível) e mostra "Será convidada pelo grupo X (decisão do GT de DD/MM)". Ela substitui a etiqueta vermelha atual "Autoridade a ser convidada pelo grupo X".
- **`mesma_pessoa`**, no grupo que convida: a etiqueta neutra de hoje, com a menção à decisão.
- **`nao_recebe_convite`**: todas as linhas da pessoa ficam foscas, com "Não recebe convite (decisão do GT de DD/MM)".
- **`pessoas_diferentes`**: a etiqueta "Em mais de um grupo: conferir" some.
- **`ajustar_contatos`**: etiqueta de atenção "Ajustar no Contatos (decisão de DD/MM)" até o caso fechar (§4.1.4).

**Nas seções de eleitos a conferir:** o mesmo botão e o mesmo histórico. A decisão leva o eleito para o grupo decidido.

A linha fosca não conta como pendência nas contagens do painel. Ela continua visível e continua sendo auditada (nome, cargo, tratamento e endereço).

#### 4.1.4 Depois de cada coleta

A varredura calcula a **situação no Contatos** de cada caso decidido e grava uma entrada `coleta` no histórico **só quando a situação muda** em relação à última entrada de coleta, com a data da varredura:

| Situação | Quando |
|---|---|
| Tratado no Contatos | `mesma_pessoa`: a pessoa só está no grupo do convite (e em listas de fora, como Câmara e eleitos). `nao_recebe_convite`: a pessoa não está em grupo nenhum do Contatos. `ajustar_contatos`: o caso deixou de aparecer no cálculo. |
| Pendente no Contatos | A pessoa ainda está num grupo que não convida, ou o ajuste ainda não apareceu. |
| Reaberto | A pessoa está num grupo que não constava em `grupos` do registro vigente. O caso volta para "A conferir" com "grupo novo desde a decisão de DD/MM". |
| Sem efeito | `pessoas_diferentes`: o registro só silencia o caso. Não há entrada de coleta, a não ser a de reabertura. |

`ajustar_contatos` também pode ser fechado à mão por um registro novo.

**Eleito decidido (casos da AUDITORIA):**
- é "Tratado no Contatos" quando já está cadastrado no grupo de destino decidido e em nenhum grupo do Contatos que não convida;
- enquanto não está no grupo de destino, fica "Pendente no Contatos" e aparece em "A cadastrar" desse grupo (§4.4).

#### 4.1.5 Carga inicial (planilha de 29/10)

O histórico começa com as linhas da planilha, todas com validação "Validado", data igual à citada no texto (26/10, 28/10 ou 29/10; sem data no texto, 29/10), quem "Marina e Clóvis" quando o texto cita, e senão "GT (planilha de 29/10)". A observação é o texto da coluna "Situação". A carga pode ser feita uma vez pelo construtor, a partir desta tabela.

**Duplicidades:**

| Pessoa | Registro |
|---|---|
| André Mendonça | mesma pessoa → Ministros do STF |
| Carlos Brandão | pessoas diferentes |
| José Sarney | mesma pessoa → Ex-Presidentes da República |
| Nunes Marques | mesma pessoa → Ministros do TSE |
| Sebastião Reis Júnior | mesma pessoa → Ministros do TSE |
| Dias Toffoli | mesma pessoa → Ministros do STF |
| Jader Barbalho (Ex-Presidentes do Senado × Senadores) | mesma pessoa → Senadores |
| Renan Calheiros | mesma pessoa → Senadores |
| Ricardo Villas Bôas Cueva | mesma pessoa → Ministros do TSE |
| Rodrigo Pacheco | mesma pessoa → Ministros do TCU |
| Davi Alcolumbre | não recebe convite |
| Wellington Dias | mesma pessoa → Ministros de Estado |
| Eunício Oliveira | ajustar no Contatos, convidaPor Deputados Federais (sair de Ex-Presidentes do Senado quando o grupo de deputados subir) |
| Marcos José Rocha dos Santos | pessoas diferentes |
| Mauro Benevides | pessoas diferentes |
| Paulo Dantas | pessoas diferentes |
| Vinicius Marques de Carvalho | pessoas diferentes |
| Celina Leão | ajustar no Contatos, convidaPor Governadores |
| Daniel Elias Carvalho Vilela | ajustar no Contatos, convidaPor Governadores |
| Jader Barbalho (Senadores × Jader Filho, deputado eleito) | pessoas diferentes |
| Lucas Ribeiro | mesma pessoa → Governadores; ocorrência da Câmara é outra pessoa |
| Mailza Assis Cameli | mesma pessoa → Governadores |
| Otaviano Pivetta | mesma pessoa → Governadores |

**AUDITORIA (eleitos):**

| Pessoa | Registro |
|---|---|
| Deltan Dallagnol | mesma pessoa → Senadores eleitos - Posse Presidencial 2027 |
| Zé Adriano, Saulo Pedroso, Professora Luciene Cavalcante, Léo Prates, Guilherme Uchoa Junior, Rosangela Moro | mesma pessoa → Deputados Federais |
| Dr. Fábio Rueda, Mariana Carvalho, Newton Bonin, Luis Carlos Gomes, Capitão Samuel, Coronel Telhada | mesma pessoa → Deputado Federal eleitos - Posse Presidencial 2027 |
| Duarte Júnior | pessoas diferentes (Duarte Jr., deputado atual pelo MA, não é o Duarte Junior eleito por MG) |

Hugo Motta não está na planilha: continua "A conferir" até o GT decidir.

### 4.2 Deputados atuais pela planilha do site da Câmara

- A Nova varredura, no passo 3, reconhece o `deputado.xls` da Câmara **pelas colunas**: "Nome Parlamentar", "Titular/Suplente/Efetivado" e "Nome Civil". A aba muda de nome a cada download ("Atualização - DD-MM-AAAA HH-MM") e não serve para reconhecer.
- É o mesmo tipo de arquivo da planilha "Deputados Federais Atuais (57a legislatura)": os dois juntos numa seleção são colisão de tipo, como já acontece hoje. A planilha antiga continua aceita.
- **Campos aproveitados:** UF, nome parlamentar, nome civil, partido, condição (T = Titular, S = Suplente, E = Efetivado) e sexo. O sexo sai da coluna "Tratamento": "Exma. Senhora Deputada" é feminino, "Exmo. Senhor Deputado" é masculino.
- E-mail, telefone, anexo (prédio) e gabinete (sala) podem ser lidos para a tela local, mas seguem a regra atual: não vão para a web. Fax e aniversário não são lidos.
- **Eleição 2026 de cada deputado:** o `.xls` não traz essa informação. O app cruza o deputado com as planilhas de eleitos (deputados, senadores e governadores) pela regra de pessoa do §4.3.2 e dá ao deputado um resumo: "Reeleito", "Eleito senador", "Eleito governador" ou "Não eleito em 2026".
  - As planilhas de eleitos só trazem quem se elegeu. Sem o arquivo de candidaturas não dá para separar "não reeleito" de "não concorreu", e por isso as duas etiquetas antigas viram uma só (minha escolha).
  - Com a planilha gerada antiga, que tem a coluna "Eleição 2026 (resumo)", continua valendo o texto dela.

### 4.3 Classificação dos eleitos

#### 4.3.1 Regras

**Deputado federal eleito:**
- É senador em exercício → fica em **Senadores** (Ata 14). Isso vale quando a pessoa está, no Contatos, em Senadores ou em "Senadores titulares fora de exercício - Posse 2027", ou quando o status é "Mandato novo (atual senador)". Exemplo: Izalci Lucas. A verificação vem antes da regra seguinte.
- Está na lista de exercício da Câmara → deputado atual (reeleito) → grupo **Deputados Federais**.
- Não está → primeiro mandato → **Deputado Federal eleitos - Posse Presidencial 2027**.
- Nos dois casos, o status da planilha do TSE é só referência. "Mandato novo (verificar)" (provável deputado estadual), "Atual deputado (suplente em exercício)" fora da lista e "Mandato novo" dentro da lista seguem a regra acima.

**Senador eleito:**
- Está na lista de exercício da Câmara → fica em **Deputados Federais** (Ata 14).
- Status "Reeleição" e presente em Senadores (ou em "Senadores titulares fora de exercício - Posse 2027") no Contatos → **Senadores**, como hoje. "Reeleição" fora de Senadores continua `conferir`, como hoje.
- Qualquer outro, inclusive "Mandato novo (atual deputado federal)" fora da lista da Câmara (Deltan) e "Mandato novo (verificar)" → **Senadores eleitos - Posse Presidencial 2027**.

**Governadores:** sem mudança de regra (`lib/eleitos-governo.ts`). Só o grupo de destino passa a aparecer com o nome do Contatos.

**Continua `conferir`:**
- o homônimo: a regra de pessoa acha mais de uma pessoa (dois deputados em exercício, ou a ligação com um contato de outro grupo, como Jader Filho × senador Jader Barbalho);
- o caso que a regra de pessoa não consegue decidir.

A decisão do GT (§4.1) vence a regra.

#### 4.3.2 Regra de pessoa contra a lista da Câmara

"Estar na lista" vale quando:
- o nome civil normalizado é igual, **em qualquer UF** (caso Rosangela Moro: SP na Câmara, eleita pelo PR); ou
- o nome parlamentar é igual ao nome de urna, na mesma UF; ou
- na mesma UF, o nome civil da Câmara e o nome completo do TSE coincidem considerando abreviações (caso Guilherme Uchoa: a Câmara grava "GUILHERME A. UCHOA CAVALCANTI PESSOA DE MELO JUNIOR", e o TSE, "Guilherme Aristoteles Uchoa Cavalcanti Pessoa De Melo Junior").

Suplente em exercício (S) e efetivado (E) contam como em exercício: Professora Luciene, suplente, é deputada; Zé Adriano e Saulo Pedroso, efetivados, também. Mais de um deputado da lista satisfazendo a regra é homônimo → `conferir`.

#### 4.3.3 Resultado esperado com os arquivos de 29/10

Os 12 eleitos da AUDITORIA caem no grupo que a planilha do GT indica, sem registro. O registro do §4.1.5 só confirma. Duarte Júnior é a exceção, porque precisa do registro.

### 4.4 Eleitos separados por grupo no painel

A seção única "Eleitos — a conferir" deixa de existir. Cada grupo de destino mostra os seus eleitos com duas subseções, **A cadastrar** e **A conferir**:

| Grupo no painel | A cadastrar | A conferir |
|---|---|---|
| Senadores eleitos - Posse Presidencial 2027 | eleitos de mandato novo que não estão nesse grupo do Contatos | senadores eleitos em `conferir` |
| Deputado Federal eleitos - Posse Presidencial 2027 | eleitos de primeiro mandato que não estão nesse grupo do Contatos | deputados eleitos em `conferir` |
| Governadores eleitos - Posse Presidencial 2027 | como a seção atual de governadores a cadastrar | governadores em `conferir` |
| Deputados Federais | enquanto o grupo não existe no Contatos, todos os deputados em exercício (o grupo virtual de hoje), com a etiqueta de Eleição 2026 de cada um; com o grupo no Contatos, os reeleitos que ainda não estão nele | — |

- O grupo virtual Deputados Federais **deixa de listar** os eleitos de primeiro mandato, que passam para o grupo dos eleitos.
- O cabeçalho de cada grupo mostra quantos eleitos o TSE indica para ele e quantos já estão no Contatos. Exemplo: "Senadores eleitos: 22 pelo TSE · 0 no Contatos · 22 a cadastrar".
- Os filtros atuais da chave Eleição 2026 ("Reeleitos", "Eleitos para outro cargo", "A cadastrar", "A conferir") continuam e passam a valer dentro desses grupos.

### 4.5 Agrupador da Posse 2027

Arquivo versionado em `data/` com os grupos da Posse 2027, na ordem do Clovis, cada um com o **rótulo exato do Contatos** e o modo de fiscalização: `fonte` (página oficial, como hoje), `lista` (comparado com as planilhas, §4.6) ou `neutro`:

| Grupo | Fiscalização |
|---|---|
| Defensor Público Geral | fonte |
| Ministros do STF | fonte |
| Ministros do TSE | fonte |
| Ministros do STJ | fonte |
| Ex-Presidentes do Senado | fonte |
| Governadores | fonte |
| Ministros do STM | fonte |
| Ministros do TST | fonte |
| Ministros do TCU | fonte |
| Presidente da República | fonte |
| Ministros de Estado | fonte |
| Embaixadores | fonte |
| Procurador-Geral da República | fonte |
| Presidente da Câmara dos Deputados | fonte |
| Senadores | fonte |
| Ex-Presidentes da República | fonte |
| Senadores titulares fora de exercício - Posse 2027 | fonte |
| Governadores eleitos - Posse Presidencial 2027 | lista (§4.6) |
| Senadores eleitos - Posse Presidencial 2027 | lista (§4.6) |
| Deputados Federais | lista (§4.6) |
| Deputado Federal eleitos - Posse Presidencial 2027 | lista (§4.6) |
| Ministros de Estado Indicados - Posse 2027 | neutro |
| Convidados do presidente eleito - Posse 2027 | neutro |
| Convidados do vice presidente eleito - Posse 2027 | neutro |
| Convidado do presidente do Congresso e Câmara 2027 | neutro |
| Familiares do presidente eleito e do vice - 2027 | neutro |
| Chefes de Estado, Gov, Presidentes Parlam - 2027 | neutro |
| Delegações estrangeiras e organismos intern - 2027 | neutro |

**No painel:** um bloco "Grupos da Posse 2027 (28)" lista cada grupo com a quantidade de contatos no Contatos (0 quando vazio) e, nos grupos de eleitos e em Deputados Federais, a quantidade esperada pela eleição ou pela Câmara.
- Grupo do Contatos que não casa nenhum rótulo da lista aparece no fim, como "fora do agrupador". Hoje é o caso de "Defensor" na base de 27/10, se o Contatos não tiver trocado o rótulo.
- O casamento é por `normalizarTexto` com espaços aparados ("Governadores " casa "Governadores").

**Grupo `neutro`:**
- seus contatos não passam pela Camada 1 nem pela 2: nenhuma busca de fonte, nenhum "cadastrar fonte", nenhuma possível saída, nenhum "novo";
- tratamento, endereçamento, endereço (Camada D) e duplicidade continuam;
- o grupo não conta como "sem fonte" no resumo e não trava a publicação;
- a etiqueta do grupo diz "Sem fonte oficial (grupo de convidados)".

Grupo `fonte` sem URL no catálogo continua como hoje: vermelho "cadastrar fonte".

### 4.6 Comparação dos grupos de eleitos e de Deputados Federais com as listas

**O defeito que isto evita.** O casamento de rótulo por contenção (`casaSegmento`, `lib/catalogo.ts`) liga "Senadores eleitos - Posse Presidencial 2027" ao grupo Senadores, e "Governadores eleitos - Posse…" a Governadores. A varredura leria a página dos senadores ou dos governadores atuais, e todo eleito de mandato novo cadastrado sairia como possível saída. Isso fere a regra de ouro.

**O que muda:**
- Os quatro grupos de modo `lista` **nunca** usam fonte de página: nem de grupo, nem individual, nem a Camada 2.
- O rótulo do Contatos que casar um desses grupos do agrupador não pode cair em outro grupo do catálogo. Hoje o grupo "Governadores Eleitos" do catálogo tem fontes individuais provisórias (sites de campanha de ES, RN e TO, válidas até 5/1/2027): o construtor decide se elas continuam como conferência de nome desses três ou se saem, registrando a decisão. Em nenhum caso a página dos governadores atuais entra.
- A composição de cada grupo é a lista do §4.3:

| Grupo | Composição |
|---|---|
| Senadores eleitos - Posse Presidencial 2027 | senadores eleitos com destino nesse grupo |
| Deputado Federal eleitos - Posse Presidencial 2027 | deputados eleitos com destino nesse grupo |
| Governadores eleitos - Posse Presidencial 2027 | governadores com destino `novo` |
| Deputados Federais | os deputados em exercício do `deputado.xls` |

- **Contato do Contatos que casa uma pessoa da lista do seu grupo:** nome e cargo são comparados com a lista. O nome de urna (ou o nome parlamentar da Câmara) é o valor esperado do nome, com a observação de hoje, "Nome de urna (TSE): aguarda aprovação do nome político". O cargo esperado é o do grupo ("Senador", "Deputado Federal", "Governador do Estado de X"). O resultado é o semáforo de sempre: verde ou amarelo.
- **Contato que não casa ninguém da lista do seu grupo:** sai "a conferir", com o motivo "Não está na lista de <grupo> (planilha do TSE de DD/MM)". **Nunca** é possível saída: a lista é uma planilha de trabalho, não a composição oficial publicada.
- **Pessoa da lista sem contato no grupo:** é o "A cadastrar" do §4.4. Não é "novo" no sentido do resumo atual.
- Quando a planilha da SGM chegar, ela substitui a lista desses grupos. Isso fica para uma spec própria.

## 5. Fora do escopo

- Escrever no Contatos ou gerar planilha de carga para ele a partir das decisões.
- Login individual. O "quem decidiu" é texto livre.
- Fonte oficial para Ministros de Estado Indicados (entram como neutros até haver fonte).
- Comparação com a planilha da SGM. Esta spec prepara a base, e a comparação vem quando a planilha chegar.
- A Fase 2 dos Correios e qualquer mudança na Camada D.

## 6. Escolhas do construtor e as que eu fiz

Minhas escolhas, que o Clovis pode rever:
- arquivo `.fiscal/decisoes.json` separado do retrato;
- publicação das decisões junto com o retrato;
- entrada automática de coleta só quando a situação muda;
- "Tratado no Contatos" de `ajustar_contatos` quando o caso some do cálculo;
- lista do agrupador em `data/`;
- os rótulos "fora do agrupador" e "Sem fonte oficial (grupo de convidados)";
- filtros de `/repetidos` com quatro situações;
- carga inicial feita uma vez a partir da tabela do §4.1.5;
- lista de fora equivalente ao grupo que representa (§4.1.1);
- "Tratado no Contatos" do eleito = cadastrado no grupo de destino (§4.1.4);
- etiqueta única "Não eleito em 2026" (§4.2);
- "Senadores titulares fora de exercício" contando como Senado (§4.3.1);
- contato fora da lista nos grupos de modo `lista` como "a conferir" (§4.6).

Ficam com o construtor:
- o formato exato do JSON e o nome da rota;
- o visual da linha fosca, desde que o texto continue legível e a etiqueta seja explícita;
- o algoritmo de abreviação do §4.3.2, desde que passe nos três casos citados;
- a forma do formulário de decisão;
- como a página `/repetidos` acha as pessoas de casos já tratados.

## 7. Critérios de aceite

1. Com o retrato de 27/10 e a carga inicial:
   - Cueva e Sebastião aparecem foscos em Ministros do STJ, com "Será convidada pelo grupo Ministros do TSE".
   - Nunes Marques e os demais retirados em 26/10 aparecem em "Tratadas no Contatos".
   - Hugo Motta continua "A conferir".
2. Uma decisão `mesma_pessoa` seguida de uma coleta em que a pessoa aparece num grupo novo reabre o caso, e o histórico mostra as duas coisas.
3. Com os arquivos de 29/10:
   - Deltan está em "Senadores eleitos - Posse Presidencial 2027 › A cadastrar".
   - Leo Prates, Guilherme Uchoa Junior, Rosangela Moro, Professora Luciene, Zé Adriano e Saulo Pedroso estão em Deputados Federais.
   - Rueda, Mariana Carvalho, Newton Bonin, Luis Carlos Gomes, Capitão Samuel e Coronel Telhada estão em "Deputado Federal eleitos - Posse Presidencial 2027 › A cadastrar".
   - Duarte Júnior e Jader Filho ficam "A conferir" até o registro.
4. O `deputado.xls` da Câmara é aceito no passo 3. Com ele o grupo Deputados Federais tem 513 linhas, inclui Leo Prates e não inclui José Carlos Araujo.
5. O agrupador mostra os 28 grupos, com 0 nos vazios. Um contato num grupo neutro nunca é vermelho nem possível saída.
6. Teste de regressão: um contato do Contatos em "Senadores eleitos - Posse Presidencial 2027" e outro em "Governadores eleitos - Posse Presidencial 2027" não disparam a leitura de nenhuma página. Quem não está na lista sai "a conferir", nunca possível saída.
7. O retrato publicado traz as decisões, e a web mostra o histórico sem botão de registro. Nenhum e-mail ou telefone de deputado vai para a web.
8. `npm test`, `npm run typecheck` e `npm run build` verdes, com testes novos para cada regra do §4.

## 8. Depois do merge

A rotina de sempre (CLAUDE.md, "Rotina: do código e da coleta até a web"), com duas diferenças:
- a coleta usa uma base do Contatos exportada depois de 29/10;
- no passo 3 entra o `deputado.xls` da Câmara mais recente, no lugar da planilha gerada.

A carga inicial do §4.1.5 é feita antes da coleta, para que a primeira entrada de coleta já registre a situação de cada caso.
