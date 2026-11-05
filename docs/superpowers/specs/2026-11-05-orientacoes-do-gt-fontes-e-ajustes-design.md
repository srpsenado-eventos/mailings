# Orientações do GT de 05/11: fontes de governadores, Embaixadores, convocados e presidentes

Data: 2026-11-05. Origem: orientações do Clovis de 05/11, com as dúvidas tiradas na mesma conversa.
Base: `main` em `0afe36b` (PR #29). Branch: `feat/orientacoes-gt-05-11`.

## 1. Por que

A leitura do painel pelo GT apontou falso alarme e ruído que atrapalham a conferência: 723 propostas de inclusão em Embaixadores que não são caso de inclusão, rótulos de página sugeridos como pessoas no STJ, um governador apontado por "cargo divergente" porque o app leu o secretário ao lado, e seis governadores em vermelho por falta de fonte ou por fonte que não traz o nome. O objetivo é que o que aparece em vermelho ou amarelo volte a ser coisa a conferir de verdade.

## 2. O que muda

### 2.1 Fontes dos governadores (catálogo)

| UF | Contato | Hoje | Passa a ser |
|---|---|---|---|
| AC | Mailza Assis Cameli | `agencia.ac.gov.br/governadora/`, saída falsa | `https://estado.ac.gov.br/orgao-entidades/governadoria/` como principal; `agencia.ac.gov.br/governadora/` vira `urlAlternativa` |
| MT | Otaviano Pivetta | sem fonte | `https://portal.mt.gov.br/conheca-mato-grosso/governo`, lida pelo Chrome |
| MG | Mateus Simões de Almeida | sem fonte | `https://www.mg.gov.br/governador/mateus-simoes-de-almeida` |
| RS | Eduardo Leite | `/governadoria`, saída falsa | `https://www.estado.rs.gov.br/governador` |
| SC | Jorginho Mello | sem fonte | `https://agenda.scc.sc.gov.br/site/colegiado-de-governo` |
| RR | Francisco dos Santos Sampaio | mesma URL, saída falsa | mesma URL, com o clique da §2.2 |

Todas com `campos: ["nome", "cargo"]` e chave por UF. Medido em 05/11:

- AC, MG e RS: `fetch` 200, com nome e a palavra "governador(a)" no texto.
- SC: `fetch` 200; o nome vem em maiúsculas ("JORGINHO MELLO"), seguido de "Governador(a) do Estado de Santa Catarina". O casamento precisa funcionar com essa caixa.
- MT: o `fetch` só traz a casca (70 caracteres de texto). No navegador a página monta "Otaviano Pivetta / Governador do Estado de Mato Grosso". Usar `navegador: true` e, se o Chrome sem janela não montar, `navegador: "janela"`.

O comentário do catálogo que diz que MT, MG e SC ficam sem individual sai.

### 2.2 Roraima: ler o nome atrás do clique

Em `transparencia.rr.gov.br/principaiscargos` o nome não está no HTML ao carregar. Só depois de clicar no título "Governador do Estado de Roraima" a página mostra "Ocupado por: FRANCISCO DOS SANTOS SAMPAIO". Por isso o app, que lê a página ao carregar, dá "não consta" (a decisão anterior de deixar RR como estava, spec 2026-10-30, fica superada).

A fonte individual ganha um campo opcional que diz em que texto clicar antes de ler (`clicarAntes: { texto: "Governador do Estado de Roraima", prova: "Ocupado por" }`): `texto` é o do título a clicar, comparado sem diferenciar caixa e com espaços colapsados; `prova` é o trecho que precisa aparecer no corpo da página depois do clique (espera de até 5 s). Só vale para fonte lida pelo Chrome. Se o elemento não existir, ou a prova não aparecer (texto que só cresceu, como "Carregando...", não basta), o app sabe que não leu o trecho onde o nome está: pela regra de ouro, isso é fonte inacessível ("indeterminado", com o motivo), nunca "possível saída". Essa leitura não entra na memória e pode usar a leitura guardada de até 7 dias, como qualquer falha. O cargo de RR fica "fonte não informa": o par título + "Ocupado por:" não é extraído como pessoa, então só o nome é conferido pelo texto da página. A memória de leitura guarda essa leitura com uma chave própria, para não ser trocada pela leitura sem clique. Nenhum teste abre navegador: o lançador continua injetado.

### 2.3 Sergipe: cargo que vem antes do nome

Em `se.gov.br/agencia/governo` a página traz "Governador / Fábio Mitidieri / Secretário Especial de Gabinete: Tiago Andrade Araújo". O app pega a linha de depois como cargo do governador e sai "cargo diverge". Regra geral: na página individual, quando a linha logo **antes** do nome é um cargo reconhecido, ela vale, e a linha seguinte só vale se a anterior não for cargo. Uma linha seguinte que traz outro nome depois de dois-pontos ("Rótulo: Pessoa") nunca é cargo do contato; só vale como rotulada quando o resto é mesmo um nome, e "Cargo: Ministro do Tribunal" segue sendo cargo. Linha de chamada de link (começa com Ver, Veja, Acesse, Saiba, Conheça ou Clique, como "Ver Galeria de Governadores" na página real de Minas) nunca é cargo.

Resultado esperado: SE sai com cargo conferindo. Se a estrutura real da página não permitir a regra geral sem efeito colateral em outras UFs, o caminho alternativo é a fonte de SE ficar com `campos: ["nome"]`: o cargo vira "fonte não informa", sem divergência. Vale o que passar nos testes de todas as UFs; o que for usado fica dito no relatório.

### 2.4 Presidentes de tribunal: tratamento

Decisão do Clovis: nos grupos de tribunal, para o cargo de Presidente, `Excelentíssimo(a) Senhor(a)` e `Senhor(a)` conferem os dois. Fachin hoje sai amarelo só por isso: Contatos "Excelentíssimo Senhor", app "Senhor(a)".

Na prática a regra alcança os presidentes cujo cargo tem regra na tabela: STF, STM e TCU, inclusive onde o vocativo da tabela diz só "Senhor(a) Presidente". Os presidentes de STJ, TSE e TST continuam "sem regra" em tratamento e endereçamento, como hoje: o pedido é não gerar divergência, então esta spec não abre auditoria nova para eles. Valor fora das duas formas continua divergindo nos três com regra.

Decisão do Clovis: a regra do prefixo fica como está. Presidente de tribunal leva "Ministro(a)" no nome, quem tem confere, e a presidente do STM continua apontada até o Contatos ajustar.

### 2.5 Embaixadores: a análise parte do Contatos

**Regra do GT.** O grupo de Embaixadores não recebe proposta de inclusão: as 723 somem, inclusive "Embaixador a ser designado.". A página continua conferindo quem está cadastrado (nome, cargo e possível saída, hoje 31). O grupo ganha uma marca no catálogo (`semInclusao: true`) que zera `novos` em todos os caminhos: leitura direta, leitura reaproveitada e Camada 2. A marca vale para os três nomes canônicos do catálogo ("Embaixadores ( África do Sul até EUA)", "Embaixadores (Filipinas até Noruega)" e "Embaixadores (Nova Zelândia até Zimbábue)"). A marca é do grupo, não da fonte. Os outros grupos não mudam.

### 2.6 STJ: itens que não são pessoas

"Incidentes de Assunção de Competência" e "Câmara de Direito Público" deixam de ser propostos. Regra geral, não lista de dois nomes: proposta de inclusão cujo "nome" é de unidade, órgão ou rótulo de página não entra (Câmara, Turma, Seção, Secretaria, Incidentes, Competência, Composição, Corte, Plenário, Conselho, Tribunal, Direito, Órgão), depois de um ordinal inicial se houver ("Primeira Turma", "1ª Seção", "Segunda Seção de Direito Privado"). Vale para qualquer grupo, então "Composição da Corte" (TSE) sai junto. O filtro só atinge `novos`: nunca altera o casamento de contatos nem a composição usada para apontar saída, e nome de pessoa real, como "Ana Câmara", não pode cair. O ponto a testar é esse: a palavra só exclui quando não há forma de nome de pessoa, com fixtures dos dois casos.

### 2.7 Desembargadores convocados: tratamento e endereçamento

Nos grupos Ministros do STJ e Ministros do TST, o convocado segue o critério dos ministros do grupo, em tratamento e endereçamento: mesma regra, seja a tabela, seja a maioria dos pares. O convocado passa a contar como par dos ministros (`nucleoDoCargo`). Hoje os 4 saem "sem regra"; como têm os mesmos valores dos ministros, devem sair conferindo. O gênero segue a pessoa. Nome e cargo dos convocados não mudam: o cargo continua "Desembargador(a) convocado(a)". Os convocados do TST propostos para inclusão continuam propostos.

### 2.8 Diego Tavares: não será convidado

Ele não está no Contatos. Aparece só como proposta de inclusão em "Senadores titulares fora de exercício - Posse 2027". Decisão do Clovis: a proposta sai e fica o registro.

- `nao_recebe_convite` passa a valer também para **proposta de inclusão**: quando existe decisão vigente para o nome no grupo, a proposta sai da lista de inclusões e do contador "Propostas de inclusão", na tela e no export.
- No lugar, o grupo mostra uma linha informativa, fosca: "Diego Tavares: não será convidado (decisão do GT de DD/MM). <observação>".
- O registro entra uma vez em `.fiscal/decisoes.json` (como foi feito com o Eunício): `nao_recebe_convite`, grupo acima, observação "Eleito Deputado Estadual. Será convocada a suplente.", data 05/11, `validado`.
- Sem ocorrência no Contatos o caso não pede bloqueio no Posse nem tem pendência, e fica "tratado". Se a pessoa aparecer no Contatos depois, vale a regra de reabertura que já existe.
- Nunca cria `possivelSaida` nem pinta o semáforo. A linha vai para a web, porque as decisões já são publicadas. Grava só nome, grupo e o texto do GT, sem contato.

### 2.9 Quadro "Regras do GT em vigor"

Entram em `data/regras-gt.ts`, com data de 05/11: Embaixadores (§2.5), presidentes de tribunal (§2.4), convocados (§2.7).

## 3. O que não muda

- **Item 1 (lista de grupos):** o filtro "Grupo" foi testado nas 22 opções do painel local e todas funcionam. O Clovis atribui a falha ao navegador dele. Sem mudança.
- **Item 7 (Ex-Presidentes do Congresso):** a fonte `nova-republica` já está no catálogo desde o PR #29. Entra em vigor na próxima coleta.
- A regra de ouro do "possível saída", as Camadas 1 e 2 e o bloqueio no Posse.
- O app continua sem escrever no Contatos.

## 4. Critérios de aceite

Conferidos na coleta nova, com a base de 04 NOV, comparando com o retrato de 04/11:

1. Governadores: AC, MT, MG, RS, SC e RR sem vermelho de fonte ou de saída; SE sem "cargo diverge".
2. Fachin sem divergência; presidente do STM continua apontada pelo nome.
3. Embaixadores com 0 propostas de inclusão e as possíveis saídas mantidas.
4. Nenhum rótulo proposto no STJ e no TSE. Total de propostas cai de 731 para 4: as 2 do TST e as 2 que vêm da IA (Ex-Presidentes da República e Presidente da República, fora desta spec).
5. Os 4 convocados conferem em tratamento e endereçamento.
6. Diego Tavares fora das inclusões, com a linha informativa no grupo.
7. "Ex-Presidentes do Congresso" lido, e os 7 casos reabertos pelo rótulo voltam ao estado anterior; o caso do rótulo combinado do Davi continua reaberto, fora desta spec.
8. `npm test`, `npm run typecheck` e `npm run build` verdes, com testes novos para cada item e regressão para o falso "cargo diverge" de SE.

## 5. Escolhas feitas na redação, para o Clovis conferir

- `agencia.ac.gov.br` fica como alternativa do AC, e não é apagada.
- Presidentes de STJ, TSE e TST seguem sem regra de tratamento: nenhuma auditoria nova (§2.4).
- Em Roraima, clique que falha é "indeterminado", não "possível saída" (§2.2), pela regra de ouro.
- "Composição da Corte" (TSE) sai junto com os dois do STJ, por ser o mesmo tipo de item.
- `Regras do GT em vigor` ganha três linhas, porque ele disse "isso é regra" em Embaixadores.
- Sem botão novo para registrar decisão em proposta de inclusão: o caso do Diego entra por carga, e só haverá botão se surgirem outros.
- Os 2 contatos de Embaixadores com cargo vazio continuam como estão, apontados como "cargo vazio": a análise parte da lista cadastrada.

## 6. Fora desta spec

- Rótulo combinado do Davi ("Presidente do Senado Federal; Senadores").
- Endereçamento dos governadores: o Contatos traz "Ao Senhor" (ou "À Senhora") e a tabela "A Sua Excelência o(a) Senhor(a)" em 26 dos 27. Foi visto no levantamento e não fez parte das orientações.
- Formato do cargo de quem teve mais de um mandato nos Ex-Presidentes.
- Propostas de inclusão vindas só do conhecimento da IA.

## 7. Adendo de 05/11, tarde: respostas do Clovis depois da coleta das 15h47

Base: `main` em `0a3505b` (PR #30). Branch: `fix/adendo-gt-05-11`.

### 7.1 Embaixadores: "SE Sr." não é nome

A página de Embaixadores escreve "SE Sr. Noguchi Yasushi" e "SE Sra. Tonika Maria Sealy Thompson", e o app trata o prefixo como parte do nome: 91 dos 93 amarelos do grupo acusam "nome diverge", pelo menos 76 só por isso. `SE Sr.` e `SE Sra.` passam a ser prefixo de tratamento removível, em qualquer caixa, com ou sem ponto ("S.E. Sr." também). `SE` sozinho não é prefixo. O valor esperado mostrado e copiado não leva o prefixo. Vale também para a leitura guardada de Embaixadores, sem nova leitura da página. Diferença real de nome (hífen, nome a mais) continua divergindo: o nome é o do site.

### 7.2 Ex-Presidentes do Congresso: o cargo é o do Contatos

Decisão do Clovis, que substitui o formato de 30/10 só neste grupo: o cargo certo é "Presidente do Congresso Nacional no período de AAAA a AAAA", com um ou mais períodos, ou "Presidente do Congresso Nacional em AAAA" para um único ano. Fora disso continua acusado (ex.: "no período de 1991- 1993"), com "Presidente do Congresso Nacional no período de AAAA a AAAA" como esperado. "Ex-Presidentes da República" não muda.

### 7.3 Protocolo fixo dos presidentes do Congresso e da Câmara

Decisão do Clovis, por cima da tabela nesses cargos:

| Quem | Tratamento | Endereçamento |
|---|---|---|
| Presidente do Congresso e Presidente da Câmara, ativos | Excelentíssimo Senhor | A Sua Excelência o Senhor |
| Ex-Presidentes do Congresso | Senhor | A Sua Excelência o Senhor |

No feminino: "Excelentíssima Senhora", "Senhora", "A Sua Excelência a Senhora". Ativo é reconhecido pelo cargo do Contatos ("Presidente do Congresso Nacional", "Presidente do Senado Federal", "Presidente da Câmara dos Deputados"), em qualquer grupo, inclusive em Senadores. Quem está no grupo "Ex-Presidentes do Congresso" é sempre inativo, seja qual for o cargo escrito. Vale nos dois campos e substitui tabela e pares nesses contatos. O que não bate diverge, com o valor acima como esperado.

### 7.4 Presidente da República: grupo vazio com o motivo

O contato saiu da base por decisão do GT. O grupo fica vazio, e a linha dele no bloco "Grupos da Posse 2027" mostra o motivo, vindo de uma decisão `nao_recebe_convite`: "Luís Inácio Lula da Silva: não será convidado (decisão do GT de 05/11)". O caso entra uma vez por `POST /api/decisoes`, depois do deploy, sem observação obrigatória. Vale para qualquer grupo do agrupador com 0 contatos e decisão vigente desse tipo. Texto aparece nos dois modos, sem botão, e nada muda no semáforo.

### 7.5 IA não propõe inclusão

Pessoa que vem só do conhecimento da IA (`origem: "conhecimento"`) nunca vira proposta de inclusão, em nenhum grupo. Saíram Lula e Itamar Franco, e a regra evita que nomes novos apareçam a cada coleta. A composição via IA continua conferindo quem está cadastrado.

### 7.6 Quadro do GT

Entram em `data/regras-gt.ts`, com data de 05/11: "Presidentes do Congresso e da Câmara" (§7.3), grupo do Presidente da Câmara e Senadores; e "Ex-Presidentes do Congresso" (§7.2 e §7.3).

### 7.7 Critérios de aceite, na coleta nova

1. Embaixadores sem "nome diverge" por prefixo; o relatório diz quantos restam e por quê.
2. Os 8 cargos de Ex-Presidentes do Congresso no formato conferem; "1991- 1993" continua apontado.
3. Davi e o Presidente da Câmara sem divergência de tratamento; os ex-presidentes seguem a tabela acima.
4. Linha do Presidente da República com o motivo; propostas de inclusão só as 2 do TST.
