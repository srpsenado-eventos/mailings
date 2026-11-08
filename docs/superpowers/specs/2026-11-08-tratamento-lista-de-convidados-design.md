# Tratamento da lista de convidados: da planilha Padrão ao modelo de importação do PRODASEN

Data: 2026-11-08. Brainstorming com o Clovis em 07 e 08/11; revisão do construtor em 08/11 (§10.9 e §10.10). Feature nova, **fora da fiscalização**: não muda varredura, retrato, vereditos, semáforo nem decisões do GT. Reaproveita regras e dados do Fiscal só para leitura.

## 1. Problema e intenção

Para a Posse Presidencial 2027, os gabinetes e pontos focais vão devolver listas de convidados na planilha `Lista de Convidados _Posse Presidencial 2027 (Padrão).xlsx`, enviada pela Direção. Cada lista precisa virar um arquivo no `Modelo_Importacao_Contatos_PRODASEN.xlsx`, que é o que o Sistema Contatos grava em lote (o grupo é escolhido na hora de subir, dentro do Contatos). Entre uma planilha e outra entra a curadoria: os limites dos Correios (a etiqueta sai do Contatos), o protocolo (tratamento e endereçamento) e a duplicidade com quem já está cadastrado.

Em 31/10 isso foi feito uma vez, por script Python (`GT Posse/Contatos/_script/tratamento_lista_convidados.py`), para Deputados Federais e eleitos. Em 06/10 e 13/10 os endereços da base inteira passaram pela adequação aos Correios, com a planilha "Comparação antes e depois" que o Clovis e a Marina revisaram. Esta spec junta os dois precedentes numa ferramenta repetível: **uma lista entra, dois arquivos saem**, no mesmo formato de conferência que o GT já conhece.

O que não pode acontecer: subir ao Contatos um campo que a etiqueta dos Correios rejeita, cadastrar de novo quem já existe, ou perder informação da lista sem que isso apareça no relatório.

## 2. Decisões do Clovis (07 e 08/11)

1. **Grupo escolhido uma vez, para a lista inteira**, na hora de rodar. Não há sugestão de grupo por contato nem leitura de cargo para isso. O grupo **não vai no arquivo** (o modelo do PRODASEN não tem a coluna; ele é escolhido no Contatos ao subir o lote); na ferramenta serve só como "esperado" da duplicidade.
2. **Duplicidade contra a base do Contatos.** Nome já cadastrado no grupo escolhido: aviso verde, "já era o esperado". Em outro grupo: atenção, "Já cadastrado em Y", com todos os grupos. Quem já está no Contatos **fica fora do arquivo de importação** e vai ao relatório com o Id, para ser incluído no grupo dentro do Contatos (regra de 31/10, confirmada em 08/11).
3. **Câmara e TSE são referência, não Contatos.** As planilhas da Câmara (`deputado.xls`) e dos eleitos do TSE entram como segunda referência, só informativa ("consta na lista da Câmara", "eleito em 2026"); quem só está nelas continua novo e entra no arquivo. Os deputados federais em exercício não estão no Contatos; os eleitos estão (falta endereço).
4. **Tratamento e Endereçamento chegam preenchidos.** O GT preenche os dois antes de rodar. A ferramenta **confere** pela tabela de tratamentos (inclusive o gênero) e **só aponta a divergência**, sem mudar o valor.
5. **Linha que quebra regra dura** (CEP inválido, nome acima de 50, UF inexistente): retorno no formato da adequação dos endereços, com sugestão de adequação. Uma aba de simulação (antes e depois), uma aba já no modelo do PRODASEN depois dos ajustes, uma aba de revisões.
6. **Órgão fica fora.** Não existe no modelo do PRODASEN nem no Contatos. Não confundir órgão com grupo.
7. **Módulo isolado no repositório do Fiscal** ("Resolve. Eu só não queria, nem mesmo em teste, provocar algo em produção com o que está atualmente no fiscal."). Duas portas: comando na pasta e tela só local.
8. **Endereço de quem já está no Contatos** é comparado com o recebido. Contato sem endereço no Contatos que chega com endereço na lista **não é divergência**: é endereço novo a aproveitar (caso dos eleitos). Endereço diferente do cadastrado é revisão.
9. **Formato de saída aprovado em 08/11** sobre o exemplo com dados fictícios em `GT Posse/Contatos/Tratamento - Lista de Convidados/_exemplo/` (dois arquivos: conferência com cinco abas e importação no modelo). O exemplo é a referência visual desta spec.
10. Ordem das portas: "o que achar mais seguro de fazer com qualidade" → decisão minha em §8.3: comando primeiro, tela depois.
11. **Universo da duplicidade é a `BASE GRUPOS POSSE`** (08/11): "O correto não é usar a base inteira. A base inteira é só para ter referência do endereço, pois é o relatório que temos. O correto, para duplicidade, é considerar a base do GRUPOS POSSE, que são os grupos que, de fato, serão convidados." A `BASE ENDERECO` entra só em §6.2.

Regras herdadas que continuam valendo: sem PII em log, console ou IA; nada escrito no Contatos pelo app; regra de ouro do "possível saída" não é tocada (esta feature não produz veredito de fiscalização).

## 3. Fluxo

1. O gabinete devolve a lista no modelo Padrão. O GT acrescenta as colunas **TRATAMENTO** e **ENDERECAMENTO** e as preenche.
2. O GT roda a ferramenta indicando a lista e o grupo (um dos 28 de `data/grupos-posse.ts`, ou outro rótulo digitado).
3. A ferramenta lê a lista, a base do Contatos e as listas de referência, aplica a curadoria e grava dois arquivos na pasta da rodada.
4. O GT revisa a aba Revisoes, ajusta o que for o caso (na lista ou direto no Contatos) e sobe o arquivo de importação no Contatos escolhendo o grupo. Quem já estava cadastrado é incluído no grupo à mão.
5. Se a lista for corrigida, roda de novo; a saída anterior não é sobrescrita (a pasta leva a data e, havendo duas rodadas no dia, um sufixo `-2`, `-3`).

## 4. Entrada

### 4.1 A lista

Arquivo `.xlsx` no modelo Padrão: aba "Lista de Convidados", cabeçalho na linha 8, dados a partir da 9. Colunas reconhecidas **pelo nome normalizado** (`normalizarTexto`), não pela posição nem pela aba:

| Coluna da lista | Campo do modelo PRODASEN | Observação |
|---|---|---|
| NOME COMPLETO DO CONVIDADO/ NOME POLÍTICO | NOME | A lista não trava o tamanho; a ferramenta confere os 50 |
| ÓRGÃO | — | Lido e ignorado; não entra em nenhuma saída |
| CARGO DO CONVIDADO | CARGO | Pode vir vazio (convidado sem cargo) |
| CEP | CEP | 8 dígitos |
| LOGRADOURO | LOGRADOURO | 50 |
| NÚMERO | NUMERO | 6 |
| COMPLEMENTO | COMPLEMENTO | 30 |
| BAIRRO | BAIRRO | 30 |
| CIDADE | CIDADE | 30 |
| UF | UF | 2, da lista de 27 |
| TRATAMENTO (acrescentada pelo GT) | TRATAMENTO | Obrigatória em toda linha |
| ENDERECAMENTO (acrescentada pelo GT) | ENDERECAMENTO | Obrigatória em toda linha |

FOTO e SITE_OFICIAL saem em branco, como em 31/10.

Linha sem nome é ignorada (é o fim da lista ou a linha de exemplo apagada). Coluna obrigatória ausente no cabeçalho é erro claro (`ColunaFaltanteError`, nome da coluna na mensagem), sem tentar adivinhar. TRATAMENTO ou ENDERECAMENTO vazio numa linha é REVISAR (a linha fica fora do arquivo até ser preenchida, porque o modelo exige os dois).

### 4.2 A base do Contatos

Comando: a planilha `BASE GRUPOS POSSE - <data>.xlsx` mais recente pela data no nome, em `Bases de comparação -PLANILHAS CONTATOS/`, lida por `lerPlanilha` (`lib/planilha.ts`), e a `BASE ENDERECO - <data>.xlsx` mais recente, lida por `lib/planilha-enderecos.ts`, **só** para o endereço de quem já existe (§6.2), nunca para dizer quem existe (§6.1). Tela: a base do retrato (`retrato.grupos[].contatos[].contato` e `baseEnderecos`). Nos dois casos a base é só leitura.

### 4.3 Listas de referência

Comando: `GT Posse/Eleitos 2026/` (as planilhas de eleitos e a dos deputados em exercício, gerada ou `deputado.xls`, pelo leitor `lerPlanilhaEleicao` de `lib/planilha-eleitos.ts`, que reconhece pelas colunas). Tela: `retrato.eleicao`. Ausência das listas não impede a rodada: a coluna "Referência" sai vazia e o Resumo avisa.

## 5. Curadoria dos campos

Toda alteração feita pela ferramenta fica registrada na coluna "Regras aplicadas" da Simulacao, e o valor recebido nunca se perde (coluna RECEBIDO). Três marcas, herdadas da adequação de 06/10: **alterado** (a ferramenta mudou com segurança, amarelo), **VALIDAR** (mudou por inferência, azul), **REVISAR** (não resolveu sozinha, laranja).

### 5.1 Limites dos Correios (leiaute PPN)

Nome 50, Logradouro 50, Número 6, Complemento 30, Bairro 30, Cidade 30, UF 2, CEP 8. Constantes num só lugar (`lib/convidados/limites.ts`), com `LIMITE_NUMERO` importado de `lib/endereco.ts` para não divergir do Fiscal.

### 5.2 Logradouro e Complemento acima do limite

Porte das regras de `_script/correios_regras.py` e `rodada2_posse.py`, na ordem e só até caber:

- Expressões compostas do DF primeiro (Setor de Administração Federal Sul = SAFS, Setor de Autarquias Sul = SAS, Setor de Embaixadas Sul = SES, Setor Hoteleiro Sul = SHS, Setor Comercial Norte/Sul = SCN/SCS, Setor Bancário Norte/Sul = SBN/SBS).
- Palavras: Quadra = Qd, Bloco = Bl, Conjunto = Cj, Lote = Lt, Edifício = Ed, Avenida = Av, Alameda = Al, Rodovia = Rod, Travessa = Tv, Estrada = Estr, Condomínio = Cond, Residencial = Res, Gabinete = Gab, Pavimento = Pav, Parque = Pq; Senado Federal = Senado; por último Praça = Pç. Sem ponto (padrão da rodada 2).
- Nível 2, só quando o nível 1 não basta para o Complemento: Sala = Sl, andar = And, Pavimento = Pav, Térreo = Ter, sem "de/do/da".
- Pedaço de andar (1º Pav, 6º andar) só fica no Complemento, nunca no Logradouro.
- O que ainda não couber depois de tudo vai para a coluna "Trecho que não coube" e a linha é REVISAR. A ferramenta nunca descarta trecho em silêncio.

### 5.3 Número

- Endereço "do DF" para estas regras: UF = DF, ou UF vazia com Cidade = Brasília/BSB (a UF vazia continua REVISAR).
- Vazio em endereço do DF: `S/N`. Se o Logradouro traz Lote, Casa ou Chácara ("Quadra 5 Conjunto B Lote 12"), o trecho sai do Logradouro e vai ao Complemento abreviado (`Lt 12`), pela mesma regra A abaixo; o Logradouro fica com o resto. Vazio fora do DF: `S/N` só quando o logradouro já traz "S/N" ou "sem número"; senão REVISAR ("número não informado").
- Acima de 6 com Lote, Casa, Chácara ou Bloco (**regra A dos Correios**, orientação do GT): Número vira `S/N` e o trecho vai ao Complemento abreviado (Lt, Cs, Ch, Bl), respeitando o limite de 30 (senão, REVISAR). Esta regra é a da memória do projeto e **difere** do que `lib/ajuste-numero.ts` faz hoje em `/prodasen` (abrevia dentro do Número); `/prodasen` não é alterado por esta spec.
- Acima de 6 sem marca conhecida: REVISAR.

### 5.4 CEP

- Só dígitos, 8. Pontos e traços são removidos (alterado).
- 7 dígitos com UF = SP: zero à esquerda, VALIDAR. Nas demais UFs: REVISAR.
- Letras, tamanho diferente de 8 depois da limpeza, ou faixa incompatível com a UF (tabela `FAIXAS_CEP` do script, portada): REVISAR, valor como veio. A faixa só gera aviso; a ferramenta não troca a UF nem o CEP.

### 5.5 Bairro, Cidade, UF

- Acima do limite: abreviações do script (`DE_PARA_BAIRRO`, "Setor de Adm. Federal Sul"); se não couber, REVISAR.
- Bairro do DF canônico ("Zona Cívico-Administrativa") como no script.
- UF fora das 27: REVISAR. Cidade vazia: REVISAR.

### 5.6 Nome

- Espaços dobrados e nas pontas são limpos (alterado). Caixa alta integral vira forma com iniciais maiúsculas e conectivos minúsculos (de, da, do, das, dos, e), marcado alterado; o GT confere.
- Título no início do nome é removido (alterado): só a lista própria de `lib/convidados/nome.ts` (Dr., Dra., Exmo., Exma., Sr., Sra., SE Sr., SE Sra., S.E.). **Não** se usa `removerTratamentos` de `lib/normalize.ts` aqui: ela tira também cargos e patentes ("Senador", "Ministro", "General de Exército"), e a patente e o prefixo "Ministro(a)"/"Presidente" fazem parte do nome pelas regras do GT (spec 2026-10-30). Patente fica no nome; se o nome passar de 50, `ABREV_PATENTES` do script entra na sugestão (último item desta seção).
- Acima de 50: **REVISAR, com sugestão** (primeiro a patente abreviada por `ABREV_PATENTES`, se houver; depois a forma sem os nomes do meio, mantendo o primeiro e os dois últimos; sempre com a contagem de caracteres). A ferramenta **nunca corta nome sozinha**; o valor gravado é o recebido.

### 5.7 Cargo

- Livre, como veio, só limpeza de espaços. Vazio é permitido (convidado sem cargo). Não há limite do Correios para o cargo; o Contatos aceita o texto.

### 5.8 Tratamento e Endereçamento

- Obrigatórios em toda linha (§4.1).
- Quando o cargo tem regra na tabela (`resolverRegra` de `lib/tratamento.ts`, com gênero por `contatoEhFeminino` a partir do tratamento, do endereçamento e do cargo recebidos), os dois valores são conferidos exatamente como o Fiscal faz (`comparacoesProtocolo`: tratamento pela `formaNominal` da primeira linha do endereçamento da tabela, endereçamento pela primeira linha). Divergência é REVISAR, com a forma da tabela **no gênero da pessoa** como sugestão (ex.: "Senhora" e "A Sua Excelência a Senhora"); o valor gravado é o recebido. A tabela v02 é a fonte da verdade: para Senador e Deputado Federal ela diz "Senhor(a)" e "A Sua Excelência o(a) Senhor(a)", então "Excelentíssimo Senhor" num parlamentar sai REVISAR, como já sai no painel do Fiscal. Cargo sem regra (`sem_regra`) ou vazio: nada a conferir, sem aviso.
- Exceção local, passada no parâmetro `excecoes` de `resolverRegra` sem tocar `data/cargos-tratamento.ts`: "Deputado Federal" e "Deputada Federal" casam "Senador / Deputado Federal (sem cargo)" (hoje empatam entre as duas variantes e caem em `sem_regra`; as duas têm as mesmas formas de tratamento e endereçamento, então a escolha é segura). Sem isso o cargo mais comum das listas não seria conferido.
- Incoerência de gênero entre os três campos (tratamento masculino com cargo feminino) é apontada mesmo sem regra na tabela, reaproveitando `comparacoesCoerencia`.

## 6. Duplicidade e referências

### 6.1 Contra a base do Contatos

- Chave: `normalizarNome` (sem acento, sem tratamento, minúsculas), a mesma do Fiscal.
- Universo: **só a `BASE GRUPOS POSSE`** (decisão do Clovis, 08/11): são os grupos que de fato serão convidados; quem está no Contatos só num grupo fora da Posse não conta como duplicidade e entra no arquivo normalmente. A `BASE ENDERECO` (base inteira) **não** entra na duplicidade: ela serve só como referência de endereço de quem já existe (§6.2), porque é o relatório de endereços de que o GT dispõe.
- Nome igual em um ou mais contatos da base: **"Já no Contatos"**, com os Ids e os grupos. Se um dos grupos é o escolhido: situação "Já no Contatos: no grupo escolhido" (verde, "era o esperado"). Senão: "Já no Contatos: incluir no grupo" (atenção). Nos dois casos a linha **não entra no arquivo de importação**.
- Nome parcial (todos os tokens de um lado contidos no outro, na ordem, com 2 ou mais tokens significativos de cada lado): **"Conferir duplicidade"**, com o candidato (Id e grupo). A linha **entra** no arquivo (é tratada como nova), porque a ferramenta não decide identidade; o aviso vai à Revisoes.
- Homônimos (dois contatos da base com o mesmo nome normalizado em grupos diferentes) saem todos na coluna, separados por " · ".
- Comparação de grupo por `grupoEquivalente` + `normalizarTexto` (`lib/decisoes.ts`), para "Deputado Federal - Posse Presidencial 2027" casar "Deputados Federais".

### 6.2 Endereço de quem já está no Contatos

Para cada "Já no Contatos", a ferramenta reúne **todos os endereços de todos os Ids** da pessoa na base de endereços (`lib/planilha-enderecos.ts`; a mesma pessoa tem um Id por grupo) e compara cada um, campo a campo, com o recebido depois da curadoria (comparação por `normalizarTexto`, CEP só dígitos):

- Nenhum endereço cadastrado em nenhum Id: **"Endereço novo para contato já cadastrado"**, tipo próprio na Revisoes, sem cor de alerta (é a aproveitar, não divergência).
- O recebido é igual a algum dos cadastrados: nada.
- Diferente de todos: **"Endereço diferente do cadastrado"**, REVISAR, **uma linha por pessoa** na Revisoes, com o recebido e os cadastrados (o prioritário primeiro, quando houver; os demais separados por " · ").

### 6.3 Repetida na própria lista

Mesmo `normalizarNome` duas vezes na lista: a primeira ocorrência segue o fluxo normal; as demais saem "Repetida na própria lista", fora do arquivo, apontando a linha da primeira. Se os endereços diferem, a Revisoes mostra os dois.

### 6.4 Referência Câmara e TSE

Só anotação na coluna "Referência (Câmara / TSE)": "Consta na lista da Câmara (deputado em exercício)", "Eleito(a) em 2026: <cargo> por <UF> (TSE)". Casamento por `normalizarNome` contra nome parlamentar, nome civil e nome de urna; nunca muda a situação da linha.

## 7. Saída

Pasta da rodada: `GT Posse/Contatos/Tratamento - Lista de Convidados/<DDMMMAAAA>/` (ex.: `08NOV2026`), criada se não existir; segunda rodada no mesmo dia usa `08NOV2026-2`. Nada é sobrescrito.

### 7.1 `Importacao PRODASEN - <grupo> - <DDMMMAAAA>.xlsx`

Cópia do `Modelo_Importacao_Contatos_PRODASEN.xlsx` (lido da pasta `Tratamento - Lista de Convidados/`), aba "Contatos", cabeçalho intacto, **sem coluna extra**, preenchida a partir da linha 2 com as linhas de situação "Novo: importar" (inclusive as REVISAR e VALIDAR, com o valor gravado), FOTO e SITE_OFICIAL vazios. O grupo entra só no nome do arquivo, cortado em 40 caracteres e sem acento.

### 7.2 `Conferencia - Lista de Convidados - <DDMMMAAAA>.xlsx`

Cinco abas, no formato do exemplo aprovado:

- **Resumo**: lista recebida (nome do arquivo e intervalo de linhas), grupo escolhido, base do Contatos e de endereços usadas (nome do arquivo), listas de referência encontradas, data e hora da rodada, comando ou tela; contagens: linhas na lista, "Novo: importar" (e dentre elas: com campo alterado, com VALIDAR, com REVISAR), "Já no Contatos" (no grupo escolhido / em outro grupo), "Repetida na própria lista", "Endereço novo para contato já cadastrado"; e o bloco "Como ler" com a legenda das cores.
- **Simulacao**: uma linha por linha da lista. Colunas: Linha na lista, Situação, e para cada um dos 11 campos do modelo duas colunas, `<CAMPO> RECEBIDO` e `<CAMPO> GRAVADO`; depois Campos alterados, Regras aplicadas, Revisão / validação, Trecho que não coube, Já no Contatos (Id · grupo), Referência (Câmara / TSE). Cores: amarelo no GRAVADO alterado; azul no VALIDAR; laranja na revisão REVISAR ou ATENÇÃO; verde no "no grupo escolhido"; linha inteira cinza quando não entra no arquivo. Painel congelado nas duas primeiras colunas, filtro automático.
- **Modelo PRODASEN**: as mesmas 13 colunas e as mesmas linhas do arquivo de importação, para conferir sem abrir o outro arquivo.
- **Revisoes**: só o que pede ação humana, **um achado por linha**: Linha na lista, Nome, Tipo (Validar; Revisar; Já no Contatos: outro grupo; Já no Contatos: grupo escolhido; Endereço novo para contato já cadastrado; Endereço diferente do cadastrado; Repetida na lista; Conferir duplicidade), Campo, Valor recebido, Sugestão da ferramenta, Motivo, Decisão (em branco, para o GT preencher). Cor por tipo como na Simulacao.
- **Regras**: as regras desta spec em linguagem do GT, na ordem em que são aplicadas, geradas do mesmo código que as aplica (uma lista de `{ titulo, texto }` exportada pelo módulo), para a aba nunca descrever regra que o código não tem.

Fonte Arial 10, cabeçalho azul escuro com texto branco, como nas planilhas de outubro. A `xlsx` 0.18.5 instalada **não grava** preenchimento nem fonte (medido em 08/11 pelo revisor), e as cores fazem parte do formato aprovado: a gravação dos dois arquivos usa **`exceljs`**, dependência nova registrada por esta spec, restrita a `lib/convidados/saida.ts`. O `exceljs` também preserva, ao copiar o modelo do PRODASEN, o cabeçalho, o formato de texto e a validação de dados da coluna UF, que a `xlsx` perde. A leitura das planilhas continua pela `xlsx`, como no resto do projeto.

## 8. Arquitetura

### 8.1 Módulo isolado

`lib/convidados/` no repositório do Fiscal, funções puras, sem JSX, sem `window`, sem acesso a disco (a leitura e a gravação ficam nas portas):

- `lista.ts`: lê a lista Padrão de um `ArrayBuffer` e devolve `LinhaLista[]` (ou lança `ColunaFaltanteError`).
- `limites.ts`, `abreviacoes.ts`, `cep.ts`, `numero.ts`, `nome.ts`: regras de curadoria por campo, cada uma `(valorRecebido, contexto) → { valor, regras[], revisao? }`.
- `protocolo.ts`: conferência de tratamento e endereçamento pela tabela (chama `lib/tratamento.ts`).
- `duplicidade.ts`: casamento contra a base do Contatos, endereço de quem já existe, repetidas, referência Câmara/TSE.
- `tratar.ts`: orquestra, `tratarLista({ linhas, grupo, base, enderecos, eleicao? }) → Rodada` (todas as linhas com situação, recebido, gravado, regras, revisões, duplicidade e referência).
- `saida.ts`: `gerarImportacao(rodada, modeloBuffer)` e `gerarConferencia(rodada, meta)`, devolvendo `ArrayBuffer`.
- `regras-texto.ts`: a lista `{ titulo, texto }` da aba Regras.

Reaproveita só para leitura: `lib/normalize.ts`, `lib/planilha.ts`, `lib/planilha-enderecos.ts`, `lib/planilha-eleitos.ts`, `lib/tratamento.ts` (`resolverRegra`, `expandirFormas`, `contatoEhFeminino`, `comparacoesCoerencia`), `LIMITE_NUMERO` de `lib/endereco.ts`, `grupoEquivalente` de `lib/decisoes.ts`, `data/grupos-posse.ts`, `data/tratamentos.ts`. **Nenhum arquivo existente de `lib/`, `data/`, `app/` ou `components/` é alterado**, com uma exceção permitida: exportar uma função que já existe e ainda não é exportada, sem mudar seu corpo.

### 8.2 Portas

- **Comando** (etapa 1): `npm run convidados -- "<caminho da lista>" --grupo "<rótulo do grupo>"`, script em `scripts/convidados.ts` rodado por `tsx` (dependência de desenvolvimento nova, registrada aqui) ou, se o construtor preferir não adicionar dependência, `scripts/convidados.mjs` compilado de `lib/` pelo `tsc` num passo do próprio script. Opções: `--base <xlsx>`, `--enderecos <xlsx>`, `--eleitos <pasta>`, `--saida <pasta>` para fugir dos padrões do §4. Sai com código 1 e a mensagem da coluna faltante quando a lista não é reconhecida. Imprime só contagens, nomes de arquivo e o caminho da saída; **nunca um nome de convidado**.
- **Tela** (etapa 2): `/convidados`, só local (`modoDoApp() === "web"` responde 404, como `/nova-varredura` e `/prodasen`). Passo 1: escolher a lista (arrastar e soltar, como a Nova varredura); passo 2: escolher o grupo (lista dos 28 de `data/grupos-posse.ts`, com `rotuloDaOpcaoDeGrupo`, mais "Outro" com texto livre); passo 3: botão "Tratar", que chama `POST /api/convidados` (só local, 404 em web, mesma proteção de origem de `/api/publicar`) com a lista já lida no navegador como JSON e devolve os dois arquivos para download, mais o Resumo na tela. A base e as referências vêm do retrato. Nada é gravado em `.fiscal/`.

### 8.3 Ordem (decisão minha)

Etapa 1 primeiro, inteira: módulo, testes, comando, e uma ou duas listas reais tratadas por ele. Etapa 2 só depois disso, em plano próprio, com as regras já assentadas. Motivo: as primeiras listas vão ajustar regras; ajustar função pura com teste é barato, ajustar tela sobre regra que muda é retrabalho, e a tela é o único ponto onde se mexe no Fiscal.

### 8.4 Teste de isolamento

Critério de aceite da arquitetura: apagar `lib/convidados/`, `scripts/convidados.*`, `app/convidados/`, `app/api/convidados/` e `tests/convidados-*.test.ts` deixa o Fiscal igual (build, typecheck e a suíte atual verdes, sem outro arquivo tocado). A suíte atual (72 arquivos, 1968 testes em 06/11) passa sem nenhuma alteração.

## 9. Metas, não-metas e anti-metas

**Metas:** nenhum campo acima do limite dos Correios no arquivo sem aviso; ninguém já cadastrado no arquivo; toda alteração visível com antes e depois e a regra; o GT consegue decidir pela aba Revisoes sem abrir a lista original.

**Não-metas (agora):** órgão; grupo dentro do arquivo; escrever no Contatos ou no Posse; conferência de CEP nos Correios (Fase 2 da Camada D, bloqueada); download de planilha por grupo no Fiscal (próxima conversa); lista fora do modelo Padrão; substituir `/prodasen`.

**Anti-metas:** a ferramenta decidir identidade de pessoa (nome parcial nunca vira "já cadastrado"); cortar nome; descartar trecho de endereço em silêncio; qualquer efeito na varredura, no retrato, no semáforo ou nas decisões do GT; nome de convidado em log, console ou IA.

## 10. Decisões minhas (o Clovis pode derrubar)

1. Linha REVISAR **entra** no arquivo com o valor como veio (nome acima de 50, CEP com letras, UF inválida); só TRATAMENTO/ENDERECAMENTO vazios e as repetidas/já cadastradas ficam fora. Alternativa: tirar toda REVISAR do arquivo.
2. Nome em caixa alta integral é convertido (§5.6). Alternativa: só avisar.
3. "Conferir duplicidade" por nome parcial trata a linha como nova e avisa.
4. Pasta por rodada com sufixo `-2` no mesmo dia; nada sobrescrito.
5. Grupo no nome do arquivo de importação, como em 31/10.
6. Faixa de CEP incompatível com a UF só avisa.
7. `exceljs` para gravar os dois arquivos, só em `saida.ts` (§7.2).
8. `tsx` como executor do comando (ou compilação pelo `tsc`), à escolha do construtor, sem adicionar nada ao bundle do Next.
9. ~~Pergunta aberta~~ **Respondida pelo Clovis em 08/11 (§6.1):** o universo de "Já no Contatos" é só a `BASE GRUPOS POSSE`; a `BASE ENDERECO` é só referência de endereço. Minha proposta de combinar as duas foi derrubada.
10. Título do nome por lista própria (§5.6), patente fica; Lote/Casa/Chácara do Logradouro vai ao Complemento quando o Número está vazio no DF (§5.3); endereço de quem já existe comparado com todos os Ids, uma linha por pessoa (§6.2); exceção local de "Deputado Federal" na tabela (§5.8).

## 11. O que fica para o construtor

- Nomes dos tipos e das funções internas; divisão exata dos arquivos dentro de `lib/convidados/`.
- Tabela de abreviações: portar as do script Python como estão, inclusive `DE_PARA_BAIRRO`; `ABREV_PATENTES` só entra na sugestão de nome acima de 50 (§5.6).
- Forma da sugestão de nome curto (§5.6), desde que nunca grave o nome cortado.
- Layout da tela (etapa 2) seguindo `/nova-varredura` e `/prodasen`.
- Fixtures: listas fictícias em `tests/fixtures/convidados/` (sem nome real), cobrindo os 11 casos do exemplo aprovado mais colunas faltantes e lista vazia.

## 12. Critérios de aceite

1. Rodar o comando sobre o exemplo `_exemplo` reconstruído como lista Padrão reproduz as situações, cores e contagens do exemplo aprovado em 08/11.
2. Lista sem a coluna ENDERECAMENTO: código 1 e mensagem com o nome da coluna; nenhum arquivo gravado.
3. Convidado já na base em outro grupo: fora do arquivo, "Já no Contatos: incluir no grupo", Id e grupo na Simulacao e na Revisoes.
4. Convidado já na base no grupo escolhido: fora do arquivo, verde, "era o esperado".
5. Eleito do TSE já na base sem endereço, com endereço na lista: "Endereço novo para contato já cadastrado", sem cor de alerta.
6. Logradouro de 71 caracteres do DF sai abreviado em até 50 pela ordem do §5.2, amarelo, com a regra escrita.
7. "Lote 12 Casa 3" no Número: Número `S/N`, Complemento `Lt 12 Cs 3`.
8. CEP `1310100` com UF SP: `01310100`, azul, VALIDAR. O mesmo CEP com UF RJ: REVISAR, valor mantido.
9. "Senadora" com "Excelentíssimo Senhor" e "A Sua Excelência o Senhor": REVISAR nas duas colunas, sugestões "Senhora" e "A Sua Excelência a Senhora" (tabela v02 no gênero da pessoa), valor mantido. "Deputado Federal" com "Senhor" e "A Sua Excelência o Senhor": nada a revisar.
10. Nome de 59 caracteres: REVISAR com sugestão e contagem; o arquivo leva os 59.
11. O arquivo de importação abre no Excel com o cabeçalho idêntico ao do modelo e nenhuma coluna a mais.
12. Nenhum nome de convidado em `console.*`, no stdout do comando além do caminho dos arquivos, nem em teste.
13. Suíte atual intacta; teste de isolamento do §8.4.

## 13. Testes

`tests/convidados-lista.test.ts` (leitura e colunas), `tests/convidados-campos.test.ts` (cada regra do §5, AAA, nomes em português), `tests/convidados-duplicidade.test.ts` (§6), `tests/convidados-saida.test.ts` (estrutura das abas e do arquivo de importação, lidos de volta pela `xlsx`), `tests/convidados-tratar.test.ts` (os 11 casos do exemplo de ponta a ponta). Sem internet, sem disco fora de fixtures, sem nome real. Cobertura mínima 80% no módulo.
