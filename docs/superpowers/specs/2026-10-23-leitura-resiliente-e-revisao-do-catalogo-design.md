# Leitura resiliente e revisão do catálogo

Data: 2026-10-23. Spec irmã da memória de leitura por página (`2026-10-20-memoria-de-leitura-por-pagina-design.md`): a memória cobre a página que caiu; esta spec faz a leitura falhar menos e atualiza o catálogo pela planilha `Referencia 2/Sites de referência - 23 out.xlsx` (83 linhas) e pelo áudio explicativo do mesmo dia, ambos do Clovis. Decisões dele em 23/10 no §2.

## 1. Problema

Medido de 16 a 20/10, cada causa de falha tem um remédio diferente, e a memória de leitura só cobre uma delas:

| Causa | Casos | Remédio |
|---|---|---|
| Bloqueio ao `fetch` (HTTP 403) | STF em 20/10 (respondeu 200 em 23/10: intermitente) | Ler pelo Chrome com janela, que já funciona para o gov.br |
| Limite de pedidos (HTTP 429, CAPTCHA) | gov.br, Embaixadores | Nova tentativa com espera, sem parar os outros grupos |
| URL que mudou (HTTP 404) | TST, de 16/10 a 20/10, sem ninguém notar | URL alternativa cadastrada e aviso de URL caída em coletas seguidas |
| Site fora do ar | 4 a 6 governadores por coleta | Memória de leitura (spec de 20/10) |
| Página respondeu com outro formato | TCU em junho | Comparar a composição de hoje com a guardada |

Além disso, a planilha de 23/10 traz fontes que o catálogo não tem (PGR, Ex-Presidentes do Senado, convocados do STJ e do TST, senadores fora de exercício como grupo, governadores de PE e DF), URLs alternativas para quatro ministérios e a Secom, e duas regras de nome que a coleta de 20/10 mostrou faltar: nome mais curto na página (dois ministros saíram como possível saída falsa) e nome em que o Contatos prevalece (Garibaldi Alves Filho).

## 2. Decisões

Respostas do Clovis em 23/10:

1. **Convocados do STJ e do TST** ficam no mesmo grupo dos ministros; já constam no Contatos com cargo próprio ("Desembargador convocado"). Convocado ausente do Contatos vira **proposta de inclusão**.
2. **Leitura de PDF** entra no app, com dependência nova registrada aqui.
3. **Senadores fora de exercício** vira **grupo novo** no Contatos e no Fiscal, com o rótulo exato `Senadores fora de exercício`. A página deixa de ser segunda fonte dos grupos de Senadores.
4. **Notícia como fonte provisória** para PE (TSE) e DF (CLDF), até a posse de 2027. MT, MG e SC ficam sem fonte individual, com conferência manual pelo Diário Oficial. No DF, só a notícia da CLDF; a agenda da vice-governadora fica fora (diria "vice-governadora" e geraria divergência falsa de cargo).
5. **Presidente da Câmara** mantém a Mesa Diretora; a página pessoal do deputado fica só como referência.
6. **Nome mais curto na página** reconhece a pessoa e sai "Nome diverge" com o nome da página (regra do GT: nome como está no site).
7. **Exceção por fonte** no catálogo para nomes em que o Contatos prevalece (hoje só Garibaldi Alves Filho).
8. **Mecanismos** que entram: 403 ao fetch → Chrome com janela; repetição com espera e fila; URL alternativa por fonte, **indicada na aplicação** quando usada; avisos de URL caída em duas coletas e de mudança de formato.

Regras herdadas que continuam valendo: regra de ouro do "possível saída"; Camada 1 antes da Camada 2; nenhuma URL entra por descoberta automática (todas as URLs daqui vieram da planilha do Clovis, conferidas com `fetch` em 23/10); só o último retrato é persistido; sem PII em log, prompt ou observação.

## 3. Leitura resiliente

### 3.1 HTTP 403 ao `fetch` → Chrome com janela

Em `lib/raspagem.ts`, fonte sem `navegador` cujo `fetch` termina em `ScrapeError` com HTTP 403 (ou 401) é lida de novo, na mesma varredura, pela sessão do Chrome com janela (`porJanela`), quando a sessão existe. O HTML passa pelo mesmo `extrairConteudo`/`extrairTabela`. Se a janela também falhar, vale o erro do `fetch` ("HTTP 403"), e daí em diante a memória de leitura decide. Nada muda na tela: a página foi lida. Sem Chrome na máquina, o comportamento é o de hoje.

### 3.2 Repetição com espera e fila

Um envoltório `comRepeticao(raspar)` em `lib/raspagem.ts`, aplicado pela rota a `deps.raspar`:

- Repete só falhas transitórias: HTTP 429, HTTP 5xx, tempo esgotado, falha de rede/TLS. **Não** repete 403 (vai para a janela, §3.1), 404 e página sem conteúdo.
- Até **2** novas tentativas, com espera de **30 s** e depois **120 s** (`ESPERAS_REPETICAO_MS = [30_000, 120_000]`). A espera é da própria fonte: os outros grupos seguem em paralelo, então o teto de atraso da varredura é de uns 3 minutos.
- A fila do Chrome com janela já tem a sua repetição de 60 s para 429 (2026-10-16); ela continua, e o envoltório não repete por cima dela.
- O motivo final é o da última tentativa, com o sufixo " (3 tentativas)".

### 3.3 URL alternativa por fonte

`FonteCatalogo.urlAlternativa?: string` e `FonteIndividual.urlAlternativa?: string`. A principal é lida como hoje (com §3.1 e §3.2). Só quando ela **falha** (erro, ou sem ninguém/sem conteúdo) a alternativa é lida, com as mesmas regras. Quem casar é comparado contra o conteúdo da alternativa.

- `ConteudoFonte.url` e `ResultadoContato.fonteUrl` passam a ser a URL **lida de fato**. `ResultadoGrupo.fonteUrl` continua a principal (é a identidade do grupo e a chave da memória de leitura do grupo).
- `ResultadoGrupo.alternativa?: { url: string; motivoPrincipal: string }`: a primária do grupo foi lida pela alternativa. Nas individuais, `ResultadoContato.alternativa?: { url: string; motivoPrincipal: string }`.
- Memória de leitura: a leitura boa pela alternativa é guardada sob a URL **lida** (a alternativa). Na varredura seguinte, a busca da guardada tenta a principal e depois a alternativa.
- Tela: cabeçalho do grupo "Lida pela URL alternativa; a principal não respondeu (HTTP 404)"; procedência do contato aponta para a URL lida. Export: a mesma frase na coluna de ressalva.
- Cadastro: a alternativa obedece ao checklist do catálogo (domínio oficial, `fetch` simples entrega os nomes). Vem da coluna "Site adicional" da planilha ou das URLs divergentes dela (§5).

### 3.4 Avisos

**URL caída em coletas seguidas.** O retrato ganha `falhas?: Record<string, { desde: string; coletas: number; motivo: string }>` por URL do catálogo: a rota lê o retrato anterior, e `analisar` devolve o mapa novo (URL que falhou hoje: `coletas + 1`, `desde` mantido; URL lida hoje: sai do mapa). Com `coletas >= 2`, o cabeçalho do grupo (e a linha da individual, na procedência) diz "fonte caída há 2 coletas, desde 19/10: conferir se o endereço mudou". `ResumoAnalise.urlsCaidasRepetidas: number` vai ao relatório. Grupo reaproveitado pela memória também carrega o aviso: é o caso em que a memória esconderia a URL morta.

**Mudança de formato.** Quando a página de hoje foi lida com pessoas e há leitura guardada válida (spec de 20/10) para a mesma URL, `fracaoTrocada = 1 - (nomes de hoje que também estão na guardada) / (nomes guardados)` (igualdade após `normalizarNome`). Em grupo com `MIN_CONTATOS_LEITURA_PARCIAL` ou mais contatos e `fracaoTrocada > 0.5`, o grupo sai lido com `mudouFormato: { lidaEm, trocados, total }` e cabeçalho "Composição mudou: 7 de 10 nomes trocaram desde 16/10; confira". A leitura de hoje **não** entra na memória nesse caso. `ResumoAnalise.gruposComMudanca: number`. **Segura a publicação** (§7). Não se aplica a páginas individuais nem à lista de cargos.

## 4. Regras de nome

### 4.1 Nome mais curto na página individual (`nomeNaPagina`, `lib/match.ts`)

Hoje a página reconhece o contato quando traz o nome igual ou mais longo (nomes do meio a mais, na ordem). Passa a reconhecer também o nome **mais curto**: um nome em destaque na página (título, `h1`/`h2`, `strong`) cujas partes significativas (sem conectores "de", "da", "do", "dos", "das", "e") sejam **2 ou mais**, **todas** presentes no nome do Contatos e **na mesma ordem**. Exemplos reais de 20/10: página "Waldez Góes" para "Antônio Waldez Góes da Silva"; página "Vladimir Lima" para "Antonio Vladimir Moura Lima". Veredito: casa, nome `divergente` com `valorEsperado` = nome da página, amarelo, nunca saída. Página sem destaque que satisfaça a regra continua como hoje (não consta → possível saída). Nome de uma parte só nunca reconhece.

### 4.2 Nome em que o Contatos prevalece (exceção por fonte)

`FonteCatalogo.nomesDoContatos?: readonly string[]`: nomes **como estão no Contatos**. Contato cujo nome normalizado está na lista e que casou alguém da composição dessa fonte sai com nome `confere` e `valorEsperado` = nome do Contatos, qualquer que seja a grafia da página. Hoje só `["Garibaldi Alves Filho"]` na fonte da Nova República (a página traz "Garibaldi Alves"). Cada exceção é fornecida pelo Clovis.

## 5. Catálogo

Conferido com `fetch` simples e com o extrator do app em 23/10.

| Grupo | Mudança | Conferência de 23/10 |
|---|---|---|
| Ministros do TST | Primária `https://www.tst.jus.br/ministros` (spec de 20/10). **Segunda fonte** `https://www.tst.jus.br/orgaos`, `rotulo: "convocado"`, `propoeInclusao: true`, extração por marcador: só as pessoas cujo nome é seguido de "(convocado)" ou "(convocada)"; cargo = palavra que antecede o nome ("Desembargador"/"Desembargadora") + " convocado(a)" | 200, 303 KB, 31 pessoas; `/orgaos` 200, 145 pessoas, 6 marcas "(convocad…)" |
| Ministros do STJ | **Segunda fonte** `https://www.stj.jus.br/sites/portalp/SiteAssets/Paginas/Institucional/Composicao/Composicao-do-STJ.pdf`, `tipo: "pdf"`, `rotulo: "convocado"`, `propoeInclusao: true`: convocados são os nomes seguidos de `**` (nota "**Vaga do Min. …"); a data "Composição – DD/MM/AAAA" do PDF vai no `contexto` | 200, 316 KB, 1 página, 2 nomes com `**` |
| Senadores fora de exercício | **Grupo novo**, primária `https://www25.senado.leg.br/web/senadores/fora-de-exercicio/-/f/por-tipo`, tabela (Nome / Partido / UF / Motivo do afastamento → `colunas: { nome: 0, uf: 2, motivo: 3 }`). A página tem duas tabelas com o mesmo cabeçalho (40 e 13 linhas): a fixture decide qual é a dos titulares. Suplentes não entram | 200, 36 KB |
| Senadores (3 faixas) | A segunda fonte `fora-de-exercicio` **sai**. Afastado que continuar em "Senadores" vira possível saída até o GT movê-lo | — |
| Procurador-Geral da República | Primária `https://www.mpf.mp.br/o-mpf/o-mpf/membros/procurador-geral-da-republica`. O extrator tira 0 pessoas de 112 caracteres: a página (Plone, `#content-core > .mpf-tailwind`) traz o nome em `strong` e o cargo no parágrafo seguinte. Fixture + ajuste de `extrairConteudo` para esse formato | 200, 227 KB |
| Ex-Presidentes do Senado | Primária `https://www25.senado.leg.br/web/senadores/nova-republica` (lista, 26 `li`, sem cargo), `nomesDoContatos: ["Garibaldi Alves Filho"]` | 200, 42 KB, 21 pessoas |
| Ex-Presidentes da República | `https://biblioteca2.presidencia.gov.br/acervo/` **candidata**: respondeu vazio e a estrutura é desconhecida. Cadastrar só quando responder e a página for conferida | 200, 0 KB |
| Presidente da República | Continua sem fonte (a planilha não traz) | — |
| Governadores PE | Individual **provisória** `https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/raquel-lyra-psd-e-reeleita-governadora-de-pernambuco`, `campos: ["nome", "cargo"]`, `provisoria: true` | 200, 123 KB |
| Governadores DF | Individual **provisória** `https://www.cl.df.gov.br/-/celina-leao-toma-posse-como-governadora-do-distrito-federal`, `campos: ["nome", "cargo"]`, `provisoria: true` | 200, 210 KB |
| Governadores MT, MG, SC | Sem fonte individual. Conferência manual pelo Diário Oficial (IOMAT, Jornal Minas Gerais, DOE/SC), registrada aqui | — |
| Governadores RO, TO, ES | Mantêm a URL atual; rever após 25/10 | RO redireciona e responde; TO "Aviso de Suspensão"; ES 404 |
| Governadores MS | Mantém `/#/QuemEQuem` pelo navegador | — |
| Ministros de Estado | `urlAlternativa` em Casa Civil (`…/composicao/gabinete-do-ministro/quem-e-quem-1`), Cultura (`…/gabinete-da-ministra/margareth-menezes-1`), Defesa (`…/gabinete-do-ministro/jose-mucio-monteiro-filho`), Igualdade Racial (`…/gabinete-da-ministra/rachel-barros-de-oliveira`) e Secom (`…/composicao/ministro-e-assistencia-direta/sidonio-cardoso-palmeira`). As principais confirmaram o nome em 20/10. O PDF de currículo do MMA fica fora | as cinco: 200 |
| Presidente da Câmara | Mantém a Mesa Diretora | 200, 13 pessoas |

`FonteIndividual.provisoria?: true`: fonte que não é página institucional estável (notícia). Cabeçalho do grupo e procedência do contato dizem "fonte provisória: notícia". A regra 1 do checklist do catálogo ganha a exceção, registrada: notícia de órgão oficial (`.jus.br`, `.leg.br`) entra só como provisória, até a posse de 2027.

Tipos novos em `lib/types.ts`: `FonteCatalogo.urlAlternativa?`, `FonteCatalogo.nomesDoContatos?`, `FonteCatalogo.tipo?: "html" | "pdf"` (ausente = html), `FonteCatalogo.marcador?: { texto: string }` (extração por marcador do §5, TST), `FonteIndividual.urlAlternativa?`, `FonteIndividual.provisoria?`.

### 5.1 Leitura de PDF

`lib/scrape.ts` ganha `extrairConteudoPdf(bytes, url, fonte)` com a biblioteca `pdf-parse` (sondada em 23/10 na pasta de rascunho: extrai o texto do PDF do STJ, em uma página de colunas). O texto vem em linhas; a extração por marcador `**` acha os convocados. Decisão de dependência registrada aqui, como manda o CLAUDE.md. Fixture: um PDF anonimizável com o mesmo formato em `tests/fixtures/`.

### 5.2 Fontes com extração por marcador

`extrairPorMarcador(texto, marcador)`: pessoas cujo nome é imediatamente seguido do marcador ("(convocado)", "(convocada)", `**`). Nome = sequência de palavras capitalizadas antes do marcador; cargo = palavra de cargo que antecede o nome, quando há. Vale para HTML (TST) e PDF (STJ).

## 6. Exibição

- Cabeçalho do grupo, em cor de atenção, quando houver: "Lida pela URL alternativa; a principal não respondeu (<motivo>)" · "Fonte caída há N coletas, desde DD/MM: conferir se o endereço mudou" · "Composição mudou: X de Y nomes trocaram desde DD/MM; confira" · "Fonte provisória: notícia".
- Procedência do contato: URL lida de fato; "pela URL alternativa" quando for o caso; "fonte provisória" nas individuais provisórias.
- Export: as frases acima na coluna de ressalva do grupo (a mesma de `erroFonte` e da leitura reaproveitada).
- Linha de situação dos grupos (spec de 20/10) ganha "N com mudança de composição" e "N URLs caídas há 2 coletas".

## 7. Rotina e trava de qualidade (CLAUDE.md)

- **Segura** a publicação: grupo com `mudouFormato`. Trata-se como inacessível: rodar de novo; se persistir, mostrar ao Clovis.
- **Não segura**, mas vai ao relatório: URL alternativa usada; fonte provisória; URL caída há 2 ou mais coletas (com pedido ao Clovis de conferir o endereço).
- O relatório ganha as colunas "alternativa", "caídas repetidas" e "mudança".
- Pré-requisito do grupo novo: a base de contatos passa a trazer o rótulo `Senadores fora de exercício`. Até isso, o grupo existe no catálogo e não aparece no retrato.

## 8. Testes

- `raspagem.test.ts`: 403 → janela (com sessão, sem sessão, janela também falha); repetição (429 repete 2 vezes e sucede; 404 não repete; motivo com "(3 tentativas)"); espera injetada, nenhum teste dorme.
- `analise.test.ts`: alternativa lida quando a principal falha (`alternativa` no grupo, `fonteUrl` do contato é a alternativa, `fonteUrl` do grupo é a principal); alternativa não lida quando a principal responde; `falhas` conta coletas seguidas e some quando a URL volta; `mudouFormato` com 7 de 10 trocados, não com 3 de 10, nunca em grupo de 1 contato; leitura com mudança não entra na memória.
- `match-individual.test.ts`: nome curto em destaque reconhece e sai divergente; uma parte só não reconhece; partes fora de ordem não reconhecem; `nomesDoContatos` faz o nome conferir.
- `scrape.test.ts` / `scrape-pdf.test.ts`: extração por marcador no HTML do TST (fixture) e no PDF do STJ (fixture); PGR com nome em `strong` e cargo no parágrafo seguinte (fixture); tabela `por-tipo` (fixture).
- `catalogo-dados.test.ts`: grupo novo, fontes novas, alternativas em domínio oficial, provisórias só em PE e DF, contagens atualizadas.
- `painel.test.ts`, `export.test.ts`: textos do §6.

Nenhum teste lê disco fora de `tests/fixtures/` nem acessa a rede.

## 9. Fora do escopo

- Descoberta de URL por busca ou IA.
- Leitura de Diário Oficial (MT, MG, SC).
- Ex-Presidentes da República até o site da biblioteca responder.
- Histórico de retratos.
- Mudanças de cadastro no Contatos citadas na planilha (mover Ana Paula Lobato e Leila Barros, suplentes): são do GT.

## 10. Entrega

1. Esta spec entra no PR da memória de leitura, só como documento, com a linha na tabela do CLAUDE.md. `Referencia 2/` entra no `.gitignore`.
2. Implementação depois do merge da memória, em `feat/leitura-resiliente`, com plano próprio, por subagentes; `npm test`, `typecheck`, `build`; PR; merge pelo Clovis; deploy automático; coleta nova; trava (§7); publicação; relatório.
3. Para o grupo novo aparecer, a próxima base de contatos precisa trazer o rótulo `Senadores fora de exercício`.
