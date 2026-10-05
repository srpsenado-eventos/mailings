# Eleitos 2026 e Ajustes cadastrais ao PRODASEN

Data: 2026-10-05. Decidido com o Clovis na sessão de 05/10, um dia depois da eleição de 04/10/2026 (1º turno).
Base: branch `feat/ficha-e-numero-do-endereco` (grupos recolhíveis, ficha do contato, regra do número até 6 caracteres).

## 1. Objetivo

Separar, para fins de cadastro no Sistema Contatos, **quem fica no grupo atual** (reeleitos) e **quem entra nos grupos novos** "Senadores Eleitos" e "Deputados Federais Eleitos" (mandato novo), marcar isso no painel e gerar os arquivos que vão ao PRODASEN: o **cadastro em lote** dos novos convidados e o **ajuste cadastral** de endereço dos já cadastrados.

O app continua sendo fiscal: ele classifica, aponta e monta os arquivos; quem cadastra é a equipe de Eventos pelo PRODASEN, e quem decide o caso duvidoso é o GT.

## 2. Insumos

Três planilhas geradas em 05/10 na pasta `GT Posse/Eleitos 2026` (scripts em `_script/`), todas opcionais na varredura:

| Arquivo | Aba lida | Linhas | Reconhecida por |
|---|---|---:|---|
| `Senadores Eleitos 2026.xlsx` | `Eleitos` | 54 | aba `Eleitos` com a coluna `1º suplente` |
| `Deputados Federais Eleitos 2026.xlsx` | `Eleitos` | 513 | aba `Eleitos` sem a coluna `1º suplente` |
| `Deputados Federais Atuais (57a legislatura).xlsx` | `Em exercício` | 513 | aba `Em exercício` |

Colunas usadas dos eleitos: `UF`, `Nome de urna`, `Nome completo`, `Partido`, `Situação (TSE)`, `Status do mandato`, `Base do status`, `Gênero (TSE)`, `Nascimento`.
Colunas usadas dos deputados atuais: `UF`, `Nome parlamentar`, `Nome civil`, `Partido`, `Sexo`, `Condição eleitoral`, `Eleição 2026 (resumo)`, `E-mail`, `Prédio`, `Sala`, `Telefone`, `ID Câmara`.

Coluna ausente é erro claro, como na planilha de contatos (`ColunaFaltanteError`). As planilhas são lidas no navegador e só os campos acima viajam no JSON da varredura; `Foto (URL)`, `Nascimento` dos atuais e o resto ficam no arquivo.

## 3. Regras do GT que valem aqui

- **Reeleito fica no grupo atual.** Relatório da Posse 2023: a lista de deputados federais eleitos foi feita "desconsiderados os reeleitos"; a de governadores eleitos "não poderia ter os reeleitos".
- **Quem já tem cargo e foi eleito para outro é convidado pelo cargo que já possui.** Ata 14, GT Cerimonial, 09/06/2026. Confirmado pelo Clovis em 05/10 para os parlamentares que trocam de Casa: o deputado federal em exercício eleito senador **fica no grupo de deputados** e não entra em "Senadores Eleitos"; o senador eleito deputado fica em Senadores. A posse presidencial é em 1º de janeiro, antes do novo mandato. Em 2023, o deputado em exercício eleito senador foi registrado como inconsistência por duplicidade.
- **Suplente que já exerce o mandato vale como quem já tem mandato** (aba leia-me das planilhas). Fica no grupo atual.
- **Nome dos eleitos de mandato novo:** nome de urna, para senadores e deputados (decisão do Clovis, 05/10). O nome de urna não é o nome parlamentar oficial, definido só na diplomação: a linha leva a observação de aprovação pendente (§7.2).
- **Deputados federais:** só os em exercício, com o nome parlamentar da Câmara (gabarito de conferência de 25/09).

## 4. Classificação

Cada eleito cai em exatamente um destino. A classificação vem da coluna `Status do mandato` (TSE cruzado por CPF na geração da planilha), que é mais confiável que nome. O Contatos serve para achar a linha da pessoa e para pegar contradições.

| Destino | `Status do mandato` | Senadores (05/10) | Deputados (05/10) |
|---|---|---:|---:|
| `reeleito` (fica no grupo atual) | `Reeleição`; `Atual deputado (suplente em exercício)`; `Mandato novo (em exercício como 1º suplente)` | 13 + 1 | 296 + 11 |
| `outra_casa` (fica no grupo atual, atenção) | `Mandato novo (atual deputado federal)` no Senado; `Mandato novo (atual senador)` na Câmara | 19 | 1 |
| `novo` (entra no grupo novo) | `Mandato novo` | 19 | 172 |
| `conferir` (fora do lote até decisão) | `Mandato novo (verificar)`, qualquer valor não previsto, e as contradições abaixo | 2 | 33 |

Marca independente do destino: `projecao: true` quando `Situação (TSE)` começa com `PROJEÇÃO` (123 deputados de MG e SP em 05/10). A pessoa é classificada normalmente e a marca diz "projeção — aguarda TSE". Atualizar = rodar o script da pasta e fazer nova varredura.

### 4.1 Casamento com o Contatos

- Senadores eleitos contra os contatos dos grupos cujo nome contém "Senadores" (inclui "Senadores fora de exercício"); deputados eleitos contra o grupo "Deputados Federais" quando ele existir no Contatos; nos dois casos também contra o outro grupo, para o caso `outra_casa`.
- Casamento pelo matching por token que a Camada 1 já usa (`lib/match.ts`), testando `Nome de urna` e `Nome completo`. Medido em 05/10: 11 dos 13 senadores reeleitos casam por nome exato; os outros 2 têm grafia diferente, e o token resolve ou cai em `conferir`.
- Nome que casa mais de um contato não é atribuído (mesma regra do endereço): vai para `conferir`.

### 4.2 Contradições, que viram `conferir`

- Status `reeleito` ou `outra_casa`, mas a pessoa não está no grupo correspondente do Contatos.
- Status `novo`, mas a pessoa já está num grupo de parlamentar do Contatos.
- Status `outra_casa` na Câmara→Senado, mas a pessoa não consta da planilha de deputados atuais (quando enviada). Caso medido em 05/10: um eleito marcado "atual deputado federal" por ter sido eleito em 2022, sem estar na Câmara hoje.

Enquanto o grupo "Deputados Federais" não existir no Contatos, a checagem com o Contatos não se aplica aos deputados: vale a planilha, e a tela diz isso ("Deputados classificados pela planilha; o grupo ainda não está no Contatos").

### 4.3 Onde mora

`lib/eleitos.ts`, funções puras: `classificarEleito`, `classificarEleitos(eleitos, contatos, deputadosAtuais?)`. O orquestrador anexa o resultado numa passada posterior, como a Camada D. **A eleição não pinta o semáforo, não entra em `comparacoes` nem em `camposDivergentes` e nunca cria `possivelSaida`.**

Tipos novos em `lib/types.ts`: `EleitoPlanilha`, `DeputadoAtual`, `DestinoEleito = "reeleito" | "outra_casa" | "novo" | "conferir"`, `EleicaoContato` (anexada a `ResultadoContato.eleicao`) e `ResultadoEleicao` no retrato (`retrato.eleicao`: listas `novos`, `conferir`, contagens e nome dos arquivos).

## 5. Painel

**Chave "Eleição 2026"** na barra de filtros, visível só quando o retrato tem eleitos. Desligada, o painel fica como hoje. Ligada:

- Etiqueta **"Reeleito"** (tom ok) na linha de quem é `reeleito`.
- Etiqueta **"Eleito senador — atenção"** ou **"Eleito deputado — atenção"** (tom atenção) em `outra_casa`, e a linha ganha borda âmbar à esquerda.
- Etiqueta **"Projeção — aguarda TSE"** (neutra) quando `projecao`.
- No detalhe do contato, bloco **"Eleição 2026"**: cargo para o qual foi eleito, UF, partido, situação no TSE, `Base do status` como está na planilha e, em `outra_casa`, a orientação "Convidado pelo cargo atual (Ata 14 do GT Cerimonial, 09/06/2026)".
- Seções no fim do painel, recolhíveis: **"Senadores Eleitos — a cadastrar"**, **"Deputados Federais Eleitos — a cadastrar"** (nome de urna, nome completo, UF, partido, gênero) e **"Eleitos — a conferir"** (com o motivo).
- Filtros que só aparecem com a chave ligada: "Reeleitos", "Eleitos para a outra Casa", "A cadastrar", "A conferir".
- Botão **"Eleitos 2026 (.xlsx)"**: abas `Fica no grupo atual`, `Grupo novo`, `A conferir`, separadas por Casa.

Lógica de apresentação em `lib/painel.ts` (funções puras, testadas). Os dados dos eleitos são públicos (TSE) e vão também no retrato publicado na web.

## 6. Tela "Ajustes cadastrais ao PRODASEN" (`/prodasen`)

Só no modo local (os arquivos levam e-mail e telefone de gabinete): em modo web, 404 como `/nova-varredura`. Link no cabeçalho do painel local. Lê o retrato. Dois blocos, um arquivo cada.

### 6.1 Cadastro em lote de novos convidados

Filtro por lista: **Senadores Eleitos** (destino `novo`), **Deputados Federais Eleitos** (destino `novo`) e **Deputados Federais** (todos os da planilha de deputados atuais, em exercício, enquanto o grupo não existir no Contatos; quando existir, só os que não casam com ele). `conferir` fica fora.

Arquivo `Cadastro em lote - <data>.xlsx`, mesmo par Carga/Conferência do trabalho de endereço de setembro:

**Aba `Carga`**: as 17 colunas da exportação do Contatos, na mesma ordem: `Id`, `Foto`, `Tratamento`, `Tratamento Extenso`, `Endereçamento`, `Nome`, `Telefone`, `E-mail`, `Rede Social`, `Endereço`, `Órgão`, `Cargo`, `Departamento`, `Grupo`, `Grupos`, `Revisão`, `Data Alteração`.

| Coluna | Eleitos (mandato novo) | Deputados atuais |
|---|---|---|
| `Id`, `Foto`, `Revisão`, `Data Alteração`, `Rede Social`, `Endereço` | vazios | vazios |
| `Nome` | `Nome de urna` | `Nome parlamentar` |
| `Tratamento` / `Tratamento Extenso` | Senhor / Senhora, pelo gênero | idem, pelo `Sexo` |
| `Endereçamento` | A Sua Excelência o Senhor / a Senhora | idem |
| `Cargo` | Senador eleito / Senadora eleita · Deputado Federal eleito / Deputada Federal eleita | Deputado Federal / Deputada Federal |
| `Órgão` | Senado Federal · Câmara dos Deputados | Câmara dos Deputados |
| `Departamento` | UF por extenso, em maiúsculas, como no grupo Senadores hoje | idem |
| `Telefone` / `E-mail` | vazios | do gabinete (`Telefone` com DDD 61, `E-mail`) |
| `Grupo` | Senadores Eleitos · Deputados Federais Eleitos | Deputados Federais |
| `Grupos` | 1 | 1 |

Tratamento e endereçamento seguem o padrão que o grupo Senadores tem hoje no Contatos e conferem com a regra "Senador / Deputado Federal (sem cargo)" da tabela de protocolo. Gênero ausente ou não reconhecido: `Senhor(a)` / `A Sua Excelência o(a) Senhor(a)` e a linha vai para a aba de conferência com alerta.

**Aba `Endereços`**: layout da `BASE ENDERECO` (`Contato Id`, `Endereço Id`, `Tratamento`, `Nome`, `Logradouro`, `Numero`, `Complemento`, `Bairro`, `Cidade`, `UF`, `País`, `CEP`, `Prioritário`), com `Contato Id` e `Endereço Id` vazios.
- Eleitos: só nome e tratamento; o resto vazio (confirmado por telefone depois, como o GT manda).
- Deputados atuais: endereço do gabinete: `Praça dos Três Poderes`, `S/N`, complemento `Anexo <Prédio em romano>, Gabinete <Sala>`, `Zona Cívico-Administrativa`, `Brasília`, `DF`, `Brasil`, `70160-900`, `Prioritário` Sim. Prédio não numérico ou vazio: complemento só com o gabinete e alerta.

**Aba `Conferência`**: uma linha por pessoa do lote, com nome de urna, nome completo, UF, partido, gênero, situação no TSE (oficial ou projeção), status do mandato, alertas e a **observação de aprovação** (§7.2). Na lista Deputados Federais, o deputado eleito senador leva o alerta "Eleito senador — fica neste grupo (Ata 14)" e o reeleito leva "Reeleito": é a marca do painel antes de o grupo existir no Contatos; depois da carga, a chave "Eleição 2026" passa a marcar a linha dele no painel.

### 6.2 Ajuste cadastral dos já cadastrados: só endereço

Repete o trabalho "Número até 6 caracteres" de 23/09/2026 (`GT Posse/Contatos/Numero ate 6 caracteres - ajustes 23SET2026.xlsx`) sobre **todas as linhas da planilha de endereços da varredura**, como naquele trabalho, porque a carga do PRODASEN é por `Endereço Id`. Linha cujo contato está na Posse leva o grupo numa coluna de apoio.

Para isso, a planilha de endereços passa a ser guardada inteira no retrato **local** (só os campos de endereço já lidos hoje). O retrato publicado continua sem ela (`lib/publicar.ts`).

Regra da proposta, a validada em 23/09 (o campo aceita letras e barra), em `lib/ajuste-numero.ts`:
1. `Lote` → `LT`, `Casa` → `CS`, `Chácara` → `CH`; "Lotes 1, 2" e "Lotes 1/2" viram `LT 1/2`.
2. Se ainda passar de 6: tira zeros à esquerda (`05/06` → `5/6`) e, por último, o espaço (`LT 9/10` → `LT9/10`).
3. Situação `AJUSTAR (passa de 6)` quando o atual passa de 6; `Padronização` quando já cabe (ex.: `Lote 1` → `LT 1`). Números só com dígitos, `S/N` e vazios ficam fora.

Antes de fechar o plano, a regra é validada contra a lista de 23/09: aplicada à base de 04/09, tem de reproduzir as 248 linhas daquele arquivo. Divergência é investigada, não ajustada no teste.

Arquivo `Ajuste de endereço - <data>.xlsx`, com as abas do trabalho de 23/09:
- **`Ajustes`**: `Contato Id`, `Endereço Id`, `Tratamento`, `Nome`, `Logradouro`, `Número ATUAL`, `Caracteres (atual)`, `Número PROPOSTO`, `Caracteres (proposto)`, `Situação`, `Complemento`, `Bairro`, `Cidade`, `UF`, `CEP`.
- **`De-Para`**: `Número ATUAL`, `Número PROPOSTO`, `Situação`, `Qtd de endereços`.
- **`Resumo`**: fonte, contagens por situação e a regra impressa.
- **`Pendências`**: o que a regra não resolve: proposto que ainda passa de 6, sem número, CEP ausente ou inválido, sem UF. `Contato Id`, `Endereço Id`, `Nome`, `O que precisa de decisão`.

## 7. Detalhes que valem para os dois arquivos

### 7.1 Nada sem conferência vira carga
`conferir` não entra no lote. Linha com alerta entra, mas o alerta aparece na aba `Conferência` (lote) ou `Pendências` (endereço).

### 7.2 Observação de aprovação do nome
Texto provisório, a ser trocado pela redação do Daniel quando o Clovis a trouxer: **"Nome de urna (TSE): aguarda aprovação do nome político"**. Fica numa constante em `lib/eleitos.ts`.

### 7.3 Dados pessoais
Os arquivos do PRODASEN só existem no modo local, gerados no navegador a partir do retrato, nunca enviados a serviço externo nem à IA. Nenhum nome vai para log.

## 8. Fora do escopo

- Governadores eleitos (a planilha da pasta não os traz).
- Ajuste cadastral de nome, cargo, tratamento e endereçamento dos já cadastrados (decisão de 05/10: só endereço por ora).
- Endereço dos eleitos de mandato novo (não há dado; telefone depois).
- 2º turno (não há para Senado e Câmara).
- Gravar no Contatos: o app gera arquivos, não fala com o PRODASEN.

## 9. Entrega

Dois planos, nesta ordem:
1. **Eleitos no painel**: leitura das três planilhas na Nova varredura, classificação (§4), marcas, seções, filtros e export dos eleitos (§5).
2. **Tela do PRODASEN**: rota `/prodasen`, cadastro em lote (§6.1) e ajuste de endereço (§6.2), com a validação contra 23/09.

## 10. Testes

- `lib/eleitos.ts`: um teste por linha da tabela de §4, mais cada contradição de §4.2, nome ambíguo, projeção e coluna faltante. Sem nomes reais: fixtures fictícias.
- `lib/ajuste-numero.ts`: casos de cada passo da regra e a validação contra 23/09 rodada à mão (a planilha de 23/09 tem dados pessoais e não entra no repositório).
- Lote e endereço: cabeçalho exato das abas comparado com a lista de §6, e montagem de tratamento, cargo e departamento por gênero e UF.
- Painel: etiquetas, filtros e seções em `tests/painel.test.ts`.
