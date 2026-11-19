# Regras do GT de 13/11: TSE, Ministros de Estado, STM, Comandantes e Chefes de Estado

**Data:** 2026-11-13 · **Decisor:** Clovis (GT Gestão de Convidados) · **Situação:** regras aprovadas em conversa em 13/11; revisão do construtor feita; documento entregue ao Clovis para aprovação final

## 1. Intenção

Cinco mudanças pontuais de regra decididas pelo GT em 13/11 entram no Fiscal de Mailings, sem alterar nada do que já está em produção fora delas, e uma coleta nova é feita com a base do Contatos exportada depois de carregar o grupo novo dos Comandantes. O motivo é o de sempre: convite, cartão e cinta da Posse Presidencial 2027 saem do Contatos, e cada regra abaixo muda o que o GT considera certo em um grupo.

Palavras do Clovis: "são regras pontuais. Tudo aquilo que fizemos nessa versão, até aqui, permanece, exceto" os cinco pontos.

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos**

1. Autoridade que está no TSE e também no STF ou no STJ passa a ser convidada pelo tribunal de origem; o Presidente do TSE continua pelo TSE; os juristas do TSE ficam como estão.
2. A página do Planalto vira a única fonte dos Ministros de Estado, para nome e cargo.
3. O STM passa a ser lido pela página "Quem é Quem", com a patente como ela mostra (abreviada) e sem "Dr." e "Dra.".
4. O grupo "Comandantes das Forças Armadas e EMCFA" ganha as quatro páginas oficiais como fontes e entra no agrupador da Posse 2027; nome e cargo valem como vierem dessas páginas.
5. Chefes de Estado, chefes de governo e presidentes de parlamento levam "Excelentíssimo(a) Senhor(a)", registrado no quadro "Regras do GT em vigor" e aplicado ao grupo quando houver contatos.
6. Coleta nova com a base atual, publicação e relatório, pela rotina do CLAUDE.md.

**Não objetivos**

- Nenhuma outra regra de nome, cargo, protocolo, duplicidade ou leitura muda.
- A regra de ouro do "possível saída" não muda: página ilegível continua indeterminado.
- A lista de convidados (`lib/convidados/`) não muda.
- Não se recalcula nem se apaga decisão já registrada em `.fiscal/decisoes.json`.

**Anti-objetivos** (seria fracasso mesmo funcionando)

- Trocar a Nominata inteira para resolver o TSE e, com isso, mudar quem vence em outros pares de grupos.
- Deixar um ministro de Estado sair "possível saída" porque a página do Planalto não montou (CAPTCHA, 429): a guarda de leitura suspeita e a memória de leitura têm que continuar valendo.
- Propor inclusão de quem aparece na página de composição da Defesa e não é comandante.
- Acusar divergência de nome no STM por causa do "Dr." que a própria página traz.

## 3. Como está hoje e o que muda

### 3.1 TSE: convite pelo tribunal de origem

**Hoje.** `data/precedencia.ts` traz a Nominata do GT: Presidente do TSE 4.8, Ministros do STF 4.9, Ministros do TSE 5.9, Presidente do STJ 5.5.1, Ministros do STJ 6.1.1. `escolherGrupo` (`lib/repetidos-base.ts`) escolhe o nível mais alto. Resultado: ministro do STF no TSE já é convidado pelo STF; Presidente do TSE já é convidado pelo TSE; **ministro do STJ no TSE é convidado pelo TSE** (5.9 vence 6.1.1), e é esse o alerta que o GT quer trocar.

**Regra nova (GT, 13/11).** Membro do TSE que também está no grupo "Ministros do STF" ou "Ministros do STJ" é convidado pelo grupo de origem. Exceção: quando o cargo dele no TSE é a presidência ("Presidente…", nunca "Vice-Presidente"), continua convidado pelo TSE. Quem está só no TSE (juristas) não muda.

**Como implementar (escolha minha).** Regra explícita, aplicada em `escolherGrupo` antes da comparação de níveis: quando as ocorrências em disputa incluem "Ministros do TSE" e pelo menos um de "Ministros do STF" / "Ministros do STJ", e o cargo no TSE não é presidência, a ocorrência do TSE sai da disputa; o resto segue a regra de hoje (nível mais alto entre os que ficam). O motivo gravado diz "Membro do TSE convidado pelo tribunal de origem (regra do GT de 13/11)". Os níveis da Nominata não mudam, para não alterar outros empates (TSE × TST, TSE × TCU, etc.).

**Efeitos.** A etiqueta vermelha "Autoridade a ser convidada pelo grupo X" na linha do TSE passa a apontar o STJ; `/repetidos` mostra o STJ como grupo do convite; os grupos a bloquear no Posse mudam de acordo (`gruposDeBloqueio` já deriva do `convidaPor`). Decisão do GT já registrada para esses casos vale como está (`vigente(caso)` continua decidindo); a situação no Contatos se recalcula na coleta. Caso com decisão `mesma_pessoa` cujo `convidaPor` era o TSE **não** é reaberto automaticamente: o GT registra nova decisão se quiser; a spec só muda a regra automática ("Decididas pela regra").

Entrada nova em `data/regras-gt.ts` (13/11, grupos STF, STJ e TSE): "Membros do TSE que também são ministros do STF ou do STJ são convidados por esses tribunais; o Presidente do TSE é convidado pelo TSE; os juristas ficam no TSE."

### 3.2 Ministros de Estado: fonte única

**Hoje.** `data/catalogo.ts`, grupo "Ministros de Estado": a página `gov.br/planalto/pt-br/conheca-a-presidencia/ministros-e-ministras` é lista de denominações de cargo (`campos: ["cargo"]`, `casamento: "cargo"`, `navegador: "janela"`) e 38 `fontesIndividuais` (uma por ministério, chave pelo nome como está no Contatos, `campos: ["nome"]`, AGU e CGU com nome e cargo, cinco com `urlAlternativa`) conferem o nome. O grupo vai pelo caminho por contato (`analisarGrupoIndividual`).

**Regra nova.** A página do Planalto é a única fonte do grupo e confere **nome e cargo**.

**Como implementar.** A fonte do grupo passa a `{ url: <a mesma>, ativo: true, navegador: "janela" }`, sem `campos` e sem `casamento` (composição de pessoas, regra padrão). `fontesIndividuais` sai do grupo inteiro, com as alternativas (escolha minha: fonte única de fato; as páginas individuais ficam no histórico do git). O grupo volta ao caminho de grupo: composição da página, casamento por nome, cargo por papel (léxico de `lib/cargos.ts`), "Nome diverge" com o nome da página, possível saída só com composição real, guarda de leitura suspeita (composição que não casa ninguém em grupo de 2+), memória de leitura por URL (a chave da página não muda: a forma de extração continua a padrão) e protocolo pela regra "Ministro de Estado" de `REGRAS_POR_PREFIXO`. O layout da página (cargo numa linha, nome na seguinte) já está coberto por `tests/fixtures/ministros-estado.html`; a extração tem que produzir `PessoaSite` com nome **e** cargo a partir dele, e o teste passa a exigir isso.

**Cargo pela pasta, não só pelo papel.** O GT quer o cargo fiscalizado por esse link, e o caso que mais vai acontecer com o governo de 2027 é ministro que trocou de pasta. O caminho de grupo confere cargo por papel (`situacaoCampo`), e por ele "Ministro de Estado da Fazenda" × "Ministro de Estado da Agricultura" sairia "confere". Então, **só neste grupo**, o cargo é comparado pelas palavras que distinguem a pasta, a mesma régua que `compararCargoNaLista` (`lib/match.ts`) usa hoje para a lista de denominações: pasta diferente é divergente, com o cargo da página como esperado. Quando a linha da página é só o nome do órgão, sem a palavra "Ministro" (CGU: "Controladoria-Geral da União"; AGU), a régua compara as palavras da pasta e não exige o papel: "Ministro de Estado da Controladoria-Geral da União" e "Advogado-Geral da União" conferem com essas linhas. A régua vai para módulo próprio (`lib/cargo-pasta.ts`, por exemplo), não para dentro de `lib/match.ts`, que já passa do limite. (Escolha minha, pela intenção declarada do GT.)

**Consequências a saber.** (a) A página continua sendo lida pelo Chrome com janela, na sessão com ritmo; sem Chrome o grupo inteiro sai inacessível (antes, cada individual caía sozinha). (b) Ministro cujo nome no Contatos difere do da página sai "Nome diverge" (regra de 04/11: nome como no site), e o nome mais longo/curto segue as regras de reconhecimento de hoje. (c) A trava de qualidade da coleta vale: grupo lido antes que vier via IA ou inacessível segura a publicação.

### 3.3 STM: página "Quem é Quem" e patente como no site

**Hoje.** Fonte `stm.jus.br/.../composicao-da-corte?view=default`. `data/regras-nome.ts`, "Ministros do STM": `tratamentosProibidos` dr/dra/doutor/doutora, prefixo "Ministro(a)" do presidente, `limiteCaracteres: 50`. Quadro do GT: "STM: patentes" (o Daniel pesquisa; o Fiscal não audita patente) e "STM: abreviação" (abreviar o sobrenome, nunca a patente). `lib/normalize.ts` já remove patentes por extenso e abreviadas para **achar** a pessoa (`PATENTES`).

**Regra nova (GT, 13/11).** Fonte: `https://www.stm.jus.br/institucional/conheca-o-superior-tribunal-militar/quem-e-quem?view=default`. O nome esperado é o da página, com a patente como ela mostra (hoje abreviada: "Gen Ex", "Alte Esq", "Ten Brig Ar") e **sem "Dr." e "Dra."**, que a página põe nos civis. Contato com a patente por extenso sai "Nome diverge", com a forma da página como esperado. O limite de 50 caracteres continua.

**O que a página tem.** Responde 200 ao `fetch`. Cada ministro aparece como um `<p>` "patente + nome" (ou "Dr./Dra. + nome") seguido de um `<p>` com a função ("Ministra-Presidente", "Vice-Presidente", "Ministro-Corregedor", "Ouvidor", "Ministro(a)"), dentro de acordeões com a biografia. É o layout "nome numa linha, cargo na seguinte" que `extrairConteudo` já trata; o extrator tem que ignorar a biografia (anos, formação, carreira) e produzir uma pessoa por ministro, sem duplicar quem aparece mais de uma vez na página.

**Como implementar.** Trocar a URL no catálogo. Fixture nova `tests/fixtures/stm-quem-e-quem.html` (recorte anonimizável da página real) cobrindo: patente abreviada no nome, "Dr." e "Dra." removidos do esperado, função de tribunal confirmando "Ministro(a) do STM" (`lib/cargo-tribunal.ts`, já existe) e presidente com prefixo. O esperado do nome é o texto da página com `Dr.`/`Dra.` retirados e a patente mantida tal qual. **Achar** a pessoa continua por `normalizarNome`, que tira patente e tratamento. **Conferir** o nome precisa de uma régua a mais, porque `mesmaGrafiaDeNome` também ignora a patente e deixaria "General de Exército X" conferir com "Gen Ex X": a régua da patente compara o prefixo de patente do Contatos com o da página, token a token, sem caixa, sem acento e sem ponto ("Gen. Ex." confere com "Gen Ex"); patente diferente (por extenso × abreviada, ou patente faltando no Contatos quando a página traz uma) é "Nome diverge", com o nome da página (patente abreviada, sem Dr./Dra.) como esperado e no botão Copiar. A régua é por grupo (`data/regras-nome.ts`, campo novo, por exemplo `patenteComoNoSite: true`) e vale para "Ministros do STM" e para "Comandantes das Forças Armadas e EMCFA" (§3.4). Presidente militar do STM: o prefixo "Ministro(a)" vem antes da patente ("Ministro Alte Esq X"); hoje a presidência é civil, então é só o teste que cobre. (Escolhas minhas: a regra de 04/11 diz nome como no site, e o Clovis confirmou em 13/11 que "vai sair conforme consta nesta fonte".) Em `data/regras-gt.ts`, as duas entradas do STM de 04/11 são substituídas por uma de 13/11: "Patente como no site do STM (Quem é Quem), abreviada como lá; Dr. e Dra. não entram no nome; limite de 50 caracteres." O texto de `lib/limite-nome.ts` ("abreviar o sobrenome, nunca a patente") passa a "patente como no site do STM". A memória de leitura da URL antiga deixa de ser usada (chave por URL); a primeira coleta não tem reaproveitamento para o STM.

### 3.4 Comandantes das Forças Armadas e EMCFA

**Hoje.** Grupo no catálogo com `fontes: []`, em `data/precedencia.ts` sem nível (perde para qualquer grupo da Nominata), fora dos 28 de `data/grupos-posse.ts`. O Contatos de 05 NOV não tem o grupo (só o contato de teste "EMCFA indicados - Posse Presidencial 2027" num rótulo combinado).

**Regra nova (GT, 13/11).** O grupo passa a existir no Contatos com os comandantes das três Forças e o chefe do EMCFA, já cadastrados pelas regras. Fontes, passadas pelo Clovis:

| Órgão | URL | Ao `fetch` em 13/11 | Cadastro |
|---|---|---|---|
| Marinha | `https://www.marinha.mil.br/comandantedamarinha` | 403 | `navegador: "janela"` |
| Defesa (composição, inclui o chefe do EMCFA) | `https://www.gov.br/defesa/pt-br/composicao` | 200 com texto vazio (JavaScript) | `navegador: "janela"` (gov.br) |
| Exército | `https://www.eb.mil.br/web/comandante-do-exercito` | 200, "Gen Ex" + nome em caixa alta | `fetch` |
| Aeronáutica | `https://www.fab.mil.br/a-forca-aerea/comandante/` | 403 | `navegador: "janela"` |

**Como implementar (escolha minha).** As quatro entram como **fontes do grupo** (não individuais), na ordem da tabela, todas `ativo: true`; a primeira é a primária. O app já junta todas as fontes ativas na composição e procura cada contato nela, e assim o cadastro não depende de saber como os nomes estão no Contatos. O grupo leva `semInclusao: true` (como os Embaixadores): a composição da Defesa lista o ministro, secretários e outros que não são convidados por esse grupo, e ninguém vira "Avaliar inclusão". Nome e cargo valem como vierem das páginas (regra de 04/11), inclusive a patente: a régua da patente do §3.3 vale neste grupo, e a página do Exército, que traz "Gen Ex" com o nome em caixa alta, confere com o Contatos em caixa normal (caixa nunca diverge). `.mil.br` é domínio oficial: `tests/catalogo-dados.test.ts` passa a aceitá-lo. Fixtures: um recorte de cada página (Exército já lido; Marinha, FAB e Defesa pelo Chrome com janela na primeira coleta, ou recorte salvo da janela), cobrindo nome em caixa alta e cargo "Comandante da/do …" e "Chefe do Estado-Maior Conjunto das Forças Armadas".

**Agrupador.** Entrada `fonte("Comandantes das Forças Armadas e EMCFA")` em `data/grupos-posse.ts`, na posição que o Clovis indicar (escolha minha enquanto ele não indica: depois de "Ministros de Estado"). Se o rótulo do Contatos vier diferente, ele entra como rótulo e o nome do catálogo vira apelido. Os "28 grupos" passam a 29 no bloco do painel e nos testes que contam. Precedência: continua sem nível (fora da Nominata), como hoje.

**Leitura parcial.** Com quatro fontes, se uma cair a leitura é parcial e ninguém do grupo vira possível saída (regra vigente); `erroFonte` diz qual caiu. O Clovis foi avisado.

### 3.5 Chefes de Estado, chefes de governo e presidentes de parlamento

**Hoje.** Rótulo "Chefes de Estado, Gov, Presidentes Parlam - 2027" é grupo `neutro` do agrupador (sem página; tratamento, endereçamento, endereço e duplicidade seguem). Sem contatos na base. A tabela de protocolo v02 não tem regra para eles; sairiam "sem regra".

**Regra nova (GT, 13/11).** Para manter o paralelismo com as autoridades nacionais do mesmo nível: tratamento "Excelentíssimo(a) Senhor(a)" e endereçamento "A Sua Excelência o(a) Senhor(a)", **para todos os contatos do grupo, monarcas incluídos** (Clovis, 13/11: "Sim, para todos"). Não há exceção por cargo.

**Como implementar.** Protocolo fixo **por grupo** em `lib/protocolo-fixo.ts` (hoje por cargo dos presidentes do Congresso e da Câmara): todo contato do grupo "Chefes de Estado, Gov, Presidentes Parlam - 2027" (rótulo do agrupador, comparado por `normalizarTexto` com espaços aparados) leva os dois valores fixos, no gênero do cadastro (`contatoEhFeminino`), `origemValor: "regra_gt"`, por cima da tabela e dos pares. Vale também em grupo neutro, que já passa por `comparacoesTratamento`. Entrada em `data/regras-gt.ts` (13/11, grupo "Chefes de Estado, Gov, Presidentes Parlam - 2027"). Sem contatos hoje, o efeito só aparece quando o grupo for carregado; o teste cobre com contato fictício.

## 4. Restrições

- `lib/*.ts` continuam funções puras; nenhuma URL entra por descoberta; só as cinco páginas desta spec e a do Planalto (já no catálogo).
- Sem PII em log, teste ou prompt: fixtures com recorte anonimizável; nenhum nome real em `console.*`.
- Nada muda no retrato gravado antes do deploy; retrato antigo continua legível.
- Suíte, typecheck e build verdes; PR para `main`; deploy automático; coleta; publicação; relatório (rotina do CLAUDE.md). Carga de decisões: nenhuma.
- Tamanho dos arquivos: `lib/match.ts`, `lib/scrape.ts` e `lib/tratamento.ts` já estão no limite; o que for novo vai para módulo próprio (`lib/repetidos-origem.ts` para a regra do TSE, por exemplo), não para dentro deles.

## 5. Abordagens consideradas

| Ponto | Alternativas | Escolhida e por quê |
|---|---|---|
| TSE | (a) rebaixar o nível 5.9 dos ministros do TSE abaixo de 6.1.1; (b) regra explícita de origem para STF/STJ | (b): (a) muda quem vence em TSE × TST, TSE × TCU e outros pares que o GT não decidiu |
| Ministros de Estado | (a) manter as individuais como `urlAlternativa` da geral; (b) tirar tudo | (b): o Clovis pediu fonte única; alternativa por contato não existe no modelo de fonte de grupo, e manter 38 páginas "só por garantia" é o que ele quis encerrar |
| Comandantes | (a) 4 fontes individuais com chave por nome; (b) chave nova por cargo; (c) 4 fontes de grupo + `semInclusao` | (c): não depende dos nomes do Contatos, que ainda não existem na base, e não cria tipo de chave novo |
| Chefes de Estado | (a) linha nova na tabela v02 por cargo; (b) protocolo fixo por grupo | (b): os cargos variam (presidente, primeiro-ministro, rei, presidente de parlamento) e a decisão do GT é pelo grupo |

## 6. O que fica para o construtor

- Forma exata da extração da página do STM (acordeões, biografias) e das quatro páginas dos comandantes; fixtures a partir das páginas reais.
- Onde a regra do TSE entra em `escolherGrupo` sem quebrar `escolherComEleito` e os testes de `/repetidos`.
- Texto final das entradas de `data/regras-gt.ts` e do CLAUDE.md (estado do projeto, tabela de specs, contagem de grupos).
- A posição dos Comandantes no agrupador e o rótulo real do Contatos, a confirmar com a base nova; até lá, o nome do catálogo.

## 7. Critérios de aceite (na coleta real)

1. `/repetidos`: ministro do STJ que está no TSE sai "Decididas pela regra" com convite pelo STJ; ministro do STF no TSE pelo STF; Presidente do TSE pelo TSE; jurista só no TSE sem etiqueta.
2. Ministros de Estado: grupo lido pela página do Planalto, com nome e cargo conferidos; nenhuma página individual na tela nem no export; sem possível saída por página que não montou.
3. STM: 15 contatos conferidos pela página nova; os com patente por extenso saem "Nome diverge" com a forma abreviada como esperado; civis sem "Dr." conferem.
4. Comandantes: grupo nos grupos da Posse 2027 com os contatos da base nova, lido pelas quatro páginas, sem "Avaliar inclusão".
5. Quadro "Regras do GT em vigor" com as três entradas de 13/11.
6. Retrato publicado e relatório ao Clovis com antes × depois.
