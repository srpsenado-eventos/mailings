# CLAUDE.md — Fiscal de Mailings

Instruções específicas deste projeto para o Claude Code. Convenções globais do usuário (testing, coding-style, security, agents) já vêm de `~/.claude/rules/ecc/common/` e **não** são repetidas aqui. Última revisão: 2026-10-04.

## Contexto rápido

Web app interno do Senado Federal (Secretaria de Relações Públicas, GT Gestão de Convidados) que confronta o **Sistema Contatos** (planilha de autoridades) com as **listas oficiais publicadas nos sites dos órgãos** e aponta o que mudou. O motivo imediato é a **Posse Presidencial 2027**: convites, cartões e cintas saem desse cadastro, e um nome, cargo ou tratamento errado vira constrangimento institucional. Single-user, sem banco; persiste só o último retrato da varredura em arquivo local, e pode publicá-lo na web (Vercel, atrás de senha) só para leitura.

Repositório remoto: `github.com/srpsenado-eventos/mailings`, branch base `main`; o trabalho sai em branches `feat/*` mescladas por PR.

## Estado do projeto (2026-10-04)

- Suíte: 32 arquivos, 547 testes, verde (2026-10-04). `npm run typecheck` limpo.
- Catálogo: 33 grupos, 24 fontes, 21 grupos com fonte, **12 sem fonte** (todo contato deles sai vermelho, ver semântica abaixo).
- Auditoria de Tratamento e Endereçamento (spec de 2026-08-13) e Camada C (regras de nome, spec de 2026-09-18) estão em `main` desde setembro de 2026 (`lib/tratamento.ts`, `data/regras-nome.ts`).
- **Dívidas conhecidas** (não corrigir de passagem; abrir tarefa própria):
  - `lib/gemini.ts` e `GeminiCliente` são nomes históricos: o cliente é Anthropic Haiku desde 2026-06-14. Comentários em `lib/types.ts` ainda falam em "Gemini + Google Search".
  - `package.json` declara `@google/genai`, `fuse.js`, `@mozilla/readability`, `jsdom` e `pg` sem nenhum import em `lib/`, `app/` ou `components/`. `pg` só serve ao script legado `scripts/apply-migrations.mjs`.
  - `diagnosticarIa` e o parâmetro `?diag=1` em `/api/analise` são diagnóstico temporário; remover depois que a leitura do TCU pelo navegador for confirmada numa varredura real.
  - Há `package-lock.json` versionado e `pnpm-lock.yaml` + `pnpm-workspace.yaml` soltos na raiz. O projeto usa **npm**; não commitar os arquivos do pnpm.

## Stack (em uso)

Next.js 15 (App Router) + TypeScript + Tailwind · SheetJS (`xlsx`) · `fetch` (undici) + cheerio · puppeteer-core (só fontes do catálogo com `navegador: true`, caso TCU; abre o Chrome local, nunca na Vercel; exige Node 22.12 ou superior; a máquina tem Node 24) · string-similarity · Anthropic Claude Haiku via `fetch` na Messages API (Camada 2, opcional) · Vitest · roda local com `npm run dev`; a Vercel exibe o retrato publicado em modo `web` (`FISCAL_MODO=web`, `@vercel/blob`), nunca varre. **Sem banco de dados.** shadcn/ui está previsto no spec, mas não há `components/ui/`; os componentes são Tailwind puro.

Não trocar dependências sem registrar a decisão num novo doc em `docs/superpowers/specs/`.

## Documentos de decisão (ordem de leitura)

Os specs se sobrepõem no tempo. Quando dois discordam, **o mais recente vence**. Antes de mudar arquitetura, conferir:

| Data | Spec | O que decide | Situação |
|---|---|---|---|
| 2026-06-04 | `fiscal-de-mailings-design.md` | MVP, escopo, semáforo, fontes manuais | Base |
| 2026-06-05 | `fonte-inacessivel-e-scrape-resiliente.md` | `fonteInacessivel` ≠ `semFonte`; headers de navegador; retry TLS relaxado | Vigente |
| 2026-06-05 | `responsaveis-por-grupo.md` | Responsáveis e backup por grupo; tela `/grupos` | Vigente |
| 2026-06-06 | `extracao-estruturada-auditoria-por-campo-design.md` | `PessoaSite[]`, matching por token, `ComparacaoCampo` | Vigente |
| 2026-06-06 | `upload-no-cliente-e-resiliencia.md` | Parse no navegador; `/api/analise` recebe JSON | Vigente |
| 2026-06-06 | `camada-b-fallback-pesquisa-ampla.md` | Gemini + Google Search | **Substituído** por 2026-06-14 (Haiku) |
| 2026-06-14 | `camada-b-anthropic-haiku.md` | Troca Gemini por Claude Haiku | Vigente |
| 2026-06-14 | `ia-first-composicao-proveniencia.md` | Proveniência (`origem` por registro), "possível saída" | Parcialmente substituído pelo abaixo |
| 2026-06-14 | `camada1-base-ia-refinamento.md` | **Camada 1 determinística é a base; IA é refinamento. Regra de ouro do "possível saída"** | **Vigente, manda na ordem das camadas** |
| 2026-08-13 | `catalogo-em-arquivo-sem-banco.md` | Catálogo em `data/catalogo.ts`; Supabase sai | Vigente |
| 2026-08-13 | `auditoria-tratamento-enderecamento.md` | Tratamento/Endereçamento auditados contra a tabela de protocolo | Vigente (implementado em `main`) |
| 2026-09-04 | `varredura-continua-posse-2027-design.md` | Abrir o app e ver o último retrato, com data; investigação por busca | **Parcialmente substituído** por 2026-10-01 (painel local): fica o retrato; caem Blob, senha, cron e varredura na Vercel; Blob e senha voltam pelo 2026-10-02 (Plano C), sem cron |
| 2026-09-24 | `segunda-fonte-senadores-fora-de-exercicio.md` | Todas as fontes ativas do grupo compõem a composição; extração por tabela; inclusão filtrada por UF | Vigente |
| 2026-10-01 | `auditoria-de-endereco-camada-d.md` | **Camada D**: endereço estruturado da segunda planilha, junção por `Id`, prioritário, CEP classificado; não pinta o semáforo; conferência nos Correios é a Fase 2 | Vigente (Fase 1 implementada) |
| 2026-10-01 | `painel-local-retrato-em-arquivo.md` | **App só local.** Retrato em `.fiscal/retrato.json`; painel do mockup (etiquetas por campo, linha expansível, Copiar); tela Nova varredura | Parcialmente substituído por 2026-10-02 (Plano C): a publicação na web é só leitura |
| 2026-10-02 | `ajustes-do-painel-genero-tcu-publicacao.md` | Gênero não muda a regra de protocolo; "Nada a revisar"; "Cargo vazio"; filtro por grupo; explicações; TCU por navegador (Plano B); retrato publicado com senha (Plano C) | Vigente; Planos A, B e C implementados |

## Princípios de implementação

- **`lib/*.ts` são funções puras.** Sem JSX, sem hooks, sem `window`. Recebem dados, devolvem dados. O orquestrador `lib/analise.ts` recebe `Dependencias` injetadas (resolver fonte, raspar, extrair composição) para continuar testável.
- **UI sem lógica de negócio.** Componentes em `components/` só renderizam e chamam `/api/analise`, `/api/publicar` e `/api/entrar`.
- **Server Components por padrão.** `"use client"` só com estado ou efeito real.
- **Sem PII no log nem no prompt.** Nomes, telefones e e-mails das autoridades nunca vão para `console.*` nem para a IA. O prompt da Camada 2 recebe **só o nome do grupo e o texto público da página**, nunca os contatos da planilha. Os únicos logs do servidor são motivos técnicos de erro em `/api/analise`, `/api/publicar` e na página em modo web.
- **Camada 1 antes da Camada 2.** A comparação determinística planilha × nomes realmente presentes na página oficial é sempre a base. A IA (Haiku) é opcional e roda **uma chamada por grupo**: `extrairComposicao(grupoCanonico, textoLimpo)` devolve pessoas com `origem: "pagina" | "conhecimento"`. `mesclarComposicao` usa a página como verdade e só **resgata** da IA quem casa um contato da planilha e não estava na página. Sem `ANTHROPIC_API_KEY` ou com erro, a IA devolve `[]` e nada muda.
- **Todas as fontes ativas do grupo compõem a composição**, na ordem do catálogo; a primeira é a primária (vai em `fonteUrl` e alimenta a Camada 2). Só as fontes do grupo dono da primária entram — um rótulo da planilha que case dois grupos não mistura as páginas dos dois. Toda fonte que respondeu continua compondo, mesmo se outra caiu; mas na **leitura parcial** — uma fonte compôs o grupo e outra **falhou** (lançou erro, ou é a primária e voltou sem ninguém) — **ninguém do grupo vira possível saída**: falta um pedaço da composição oficial, quem não casa fica indeterminado, e `erroFonte` diz qual fonte falhou, na tela e no export. Fonte secundária que responde e não tem ninguém a listar (nenhum senador afastado) **não é falha**: vira só ressalva em `erroFonte` e a detecção de saída continua de pé. Se **nenhuma** fonte respondeu e a IA compôs o grupo, a composição é real e a ausência ainda aponta saída, marcada `viaPesquisaAmpla` (caso de uma fonte em JavaScript sem Chrome disponível, como o TCU sem Chrome; com Chrome o TCU é lido pelo navegador); sem fonte e sem IA, o grupo inteiro é indeterminado.
- **Fonte em JavaScript é lida pelo Chrome local.** `FonteCatalogo.navegador: true` manda `rasparFonte` (`lib/raspagem.ts`) usar `rasparComNavegador` (`lib/navegador.ts`, `puppeteer-core`) em vez do `fetch`; o HTML montado passa pelo mesmo `extrairConteudo`. Chrome ausente ou página que passa de 30 s viram `ScrapeError` ("navegador não encontrado", "navegador: tempo esgotado") e o grupo cai em fonte inacessível, como qualquer outra falha. Nenhum teste abre navegador: o lançador é injetado.
- **Regra de ouro do "possível saída":** só existe quando há **composição real** (página ou IA) que não contém a pessoa. Página ilegível (uma fonte em JavaScript sem Chrome disponível, como o TCU sem Chrome) e IA vazia geram **"indeterminado / não verificado"**, nunca "saída". Composição que não casa **nenhum** contato de um grupo com 2 ou mais contatos é **leitura suspeita** (página que não montou, layout que mudou, página errada): o grupo fica indeterminado com o motivo `MOTIVO_LEITURA_SUSPEITA`, nunca saída; grupo de um contato só fica fora dessa regra. Foi o defeito que derrubou a confiança no TCU em junho; não reintroduzir.
- **Não há mais "pesquisa ampla" com busca na web.** O sentinela `URL_PESQUISA_AMPLA` e a flag `viaPesquisaAmpla` significam hoje: "a composição dependeu do conhecimento da IA". O rótulo na UI é "≈ via IA — confira".
- **Sem banco de dados.** Catálogo em `data/catalogo.ts`, versionado. Resultado da análise vive em memória durante a request e o último retrato é gravado em `.fiscal/retrato.json` (ver o princípio do retrato). Não reintroduzir Postgres/Supabase sem novo spec.
- **Fontes cadastradas à mão.** Nenhuma URL entra no catálogo por descoberta automática, busca ou IA. O Clovis fornece e confere cada uma.
- **Camada D (endereço) é um eixo independente e não pinta o semáforo.** A planilha de endereços é opcional, lida no navegador (`lib/planilha-enderecos.ts`) e viaja no mesmo JSON (`enderecos`, `arquivoEnderecosNome`). A junção com o contato é pelo `Id` (nome só como fallback, e nome ambíguo não recebe endereço); entre várias linhas vale a marcada `Prioritário`, e várias prioritárias ou nenhuma é achado sem endereço. O orquestrador anexa `ResultadoContato.endereco` numa passada posterior, nos três caminhos (com fonte, sem fonte, fonte inacessível); ela não entra em `comparacoes` nem em `camposDivergentes` e nunca cria `possivelSaida`. `AuditoriaEndereco.formatado` **só existe quando `situacao === "completo"`**; tela e export não devem montar endereço "pronto para copiar" fora disso. CEP de 7 dígitos vira proposta de zero à esquerda **só em SP**, e continua proposta até os Correios confirmarem (Fase 2, bloqueada na chave). O contador próprio é `resumo.enderecosAConfirmar` (só `pendente`).
- **O retrato é a única persistência.** `lib/armazem.ts` grava o último `Retrato` em `.fiscal/retrato.json`, fora do git, com escrita atômica; um só, sem histórico. A cópia publicada no Blob (modo web) é um espelho enxuto dele, nunca outra fonte. O painel (`/`) lê o retrato; sem retrato, manda para `/nova-varredura`. A lógica de apresentação (etiquetas, situação, filtros, cartões, detalhe) é função pura em `lib/painel.ts`, testada; componentes só renderizam.
- **Dois modos, um ponto de decisão.** `modoDoApp()` (`lib/modo.ts`, `FISCAL_MODO`) escolhe o armazém e a tela. Na Vercel o modo é sempre `web` (variável `VERCEL`), mesmo sem `FISCAL_MODO`. Local (padrão): `.fiscal/`, Nova varredura, botão "Publicar na web" quando há `BLOB_READ_WRITE_TOKEN`. Web (Vercel): lê o Blob privado (`lib/armazem-blob.ts`), tudo atrás da senha única (`middleware.ts`, `/entrar`, cookie HMAC de `lib/sessao.ts`), sem `/nova-varredura` e com `/api/analise` em 404. `POST /api/publicar` (só local) manda o retrato **sem telefone, e-mail e rede social** (`lib/publicar.ts`), com `publicadoEm`.

## Semântica dos vereditos

É o coração da fiscalização e o ponto onde mais se erra. Vale para código, testes e texto de UI.

| Veredito | Quando | O que o usuário deve fazer |
|---|---|---|
| **verde** | Contato casou com pessoa da composição e nenhum campo diverge | Nada |
| **amarelo** | Casou, mas nome, cargo ou endereço diverge do site | Revisar; o valor do site vem em `valorEsperado` |
| **vermelho + `possivelSaida`** | Há composição real e o contato não está nela | Confirmar se a autoridade saiu |
| **vermelho + campo `fonte`** | Grupo **sem URL cadastrada** | Cadastrar fonte (não é problema do contato) |
| **indeterminado** | URL existe, mas a página não pôde ser lida (403, TLS, timeout, JS) e a IA não cobriu | Conferir à mão; `erroFonte` diz o motivo |
| **novo** | Pessoa da composição **com cargo** e sem par na planilha | Avaliar inclusão |

Por campo (`ComparacaoCampo.situacao`): `confere`, `divergente`, `fonte_nao_informa`. Telefone e e-mail são sempre `fonte_nao_informa` (site não publica). `fonte_nao_informa` **não é** divergência e não pinta amarelo. O spec de tratamento acrescenta `sem_regra` (cargo não mapeado na tabela de protocolo), que também **não** é divergência.

Cargo compara por **papel** (léxico em `lib/cargos.ts`): "Ministro (Decano)" confirma "Ministro do STF"; "Vice-Presidente" não confirma "Presidente"; "Ministra" não confirma "Ministro". A Camada B (tabela de protocolo) neutraliza o gênero do cargo só para ENCONTRAR a regra ("Senadora" acha a regra de "Senador"); a Camada 1 (site) e a Camada A (gênero entre tratamento, endereçamento e cargo) não mudam. Nome compara igualdade após `normalizarNome`.

No painel, a situação da linha é "Tudo confere" só com todas as etiquetas verdes; com etiqueta neutra (sem regra, a completar, não verificado) e nada a revisar, "Nada a revisar". Cargo vazio é atenção, e as etiquetas de tratamento e endereçamento em atenção (achados da Camada A, que não dependem do cargo) continuam aparecendo; só as neutras ("sem regra") somem.

## Regras de negócio da fiscalização (orientação do GT, e-mail de 2026-07-20)

O e-mail do GT Gestão de Convidados fixa como o Contatos deve ser atualizado para a Posse 2027. Hoje o app audita **nome, cargo e endereço**; as demais regras servem de referência para decidir o que implementar a seguir e para não contrariá-las no que já existe.

- **Nome:** usar o **nome político/parlamentar** como está no site oficial de cada órgão. STM: retirar "Dr." e "Dra." de todos. STJ: usar as partes do nome em negrito. Senadores: nome parlamentar do portal; suplentes não são convidados.
- **Cargo:** conforme o site. Presidentes de tribunal levam "Ministro/Ministra" antes do nome e a presidência indicada no cargo.
- **Endereço:** confirmado **por telefone**, o mais completo possível (gera etiqueta de correio). O site raramente informa; `fonte_nao_informa` é o resultado normal, não erro.
- **Tratamento e Endereçamento:** seguem a tabela `Regras de Atualizacao/Posse2027_TabelaTratamentos.xlsx` (aba "Tratamentos Simplificado"). Gênero tem que bater com a pessoa. É o objeto do spec de 2026-08-13.
- **Pessoa em mais de um órgão:** atualizada em **todos** os grupos em que está; quem decide o convite único é o GT.
- **Foto:** atual e de frente (usada no reconhecimento no dia). Fora do escopo do app.
- **Grupo no Contatos:** marcado "Posse Presidencial: SIM". Fora do escopo do app.
- **Grupos prioritários** do e-mail: Presidentes do Congresso, Senadores, Deputados Federais, Ministros do STF, TSE, STJ, TST, STM e TCU, PGR, DPGF, Presidentes da República, Ministros de Estado, Governadores, membros do CNJ e CNMP, Embaixadores.

Fontes oficiais citadas no e-mail que **ainda não estão no catálogo** (candidatas para o Clovis cadastrar): senadores fora de exercício (`www25.senado.leg.br/web/senadores/fora-de-exercicio`), Procurador-Geral da República (`mpf.mp.br/o-mpf/o-mpf/membros/procurador-geral-da-republica`), deputados em exercício (`camara.leg.br/deputados/quem-sao`), convocados do TST (`tst.jus.br/en/orgaos`). A fonte atual de "Presidente da OAB Nacional" é uma notícia do Conjur de 2009: substituir por página oficial da OAB.

Nota: o spec de 2026-08-13 registra que o Clovis considerou esse PDF "de outra finalidade" para a auditoria de tratamento. Ele continua sendo a referência do processo de atualização como um todo, e é por isso que está listado aqui.

## Layout do código

```
app/                 ← rotas Next.js; /api/analise (POST JSON), /nova-varredura, /grupos, /entrar, /api/publicar e /api/entrar; `/` lê o retrato
components/          ← UI (Tailwind puro): painel, linha-contato, etiqueta, nova-varredura-form, export-buttons
lib/                 ← lógica pura: planilha, catalogo, scrape, navegador, raspagem, match, analise, gemini (=Haiku), normalize, cargos, export, armazem, painel, modo, publicar, sessao, entrada, armazem-blob
middleware.ts        ← senha do modo web; em modo local deixa tudo passar
data/catalogo.ts     ← FONTE DA VERDADE de grupos, responsáveis e URLs oficiais
data/*.sql           ← histórico da fase Supabase; fora do caminho de execução
supabase/migrations/ ← idem, histórico
scripts/             ← geradores (gerar-catalogo.mjs, gerar-seed.mjs) e apply-migrations.mjs (legado)
tests/               ← Vitest; fixtures HTML em tests/fixtures/
docs/superpowers/specs/  ← decisões arquiteturais datadas (tabela acima)
docs/superpowers/plans/  ← planos de implementação correspondentes
Regras de Atualizacao/   ← material do GT, NÃO versionado (xlsx e pdf no .gitignore):
                            Posse2027_TabelaTratamentos.xlsx (tabela de protocolo, sem PII),
                            Regras do Kit.txt (convite, cartão, cinta; geração de material, fora do escopo),
                            e-mail orientacao.pdf (orientações do GT; contém e-mails de servidores)
.claude/worktrees/   ← worktrees do Claude Code; não versionar
.fiscal/            ← último retrato (PII); fora do git
```

## Convenções de código

- **Imutabilidade:** funções de `lib/` nunca mutam input; devolvem novo objeto/array.
- **Normalização centralizada** em `lib/normalize.ts` (`normalizarTexto`, `removerTratamentos`, `normalizarNome`). Não reimplementar "minúsculas + sem acento + sem tratamento" em outro lugar.
- **Erros explícitos.** `lib/` lança erro tipado (`ColunaFaltanteError`, `ScrapeError`, `PayloadInvalidoError`). A rota captura e devolve `{ ok: false, message }` com status 400/422/500.
- **Sem `any`.** `unknown` + narrowing, ou tipo definido.
- **Schema da planilha** validado em `lib/planilha.ts`. Colunas (case-insensitive, normalizadas): `Foto`, `Tratamento`, `Endereçamento`, `Nome`, `Telefone`, `E-mail`, `Rede Social`, `Endereço`, `Órgão`, `Cargo`, `Departamento`, `Grupo`. Coluna ausente = erro claro, não fallback.
- **Parse no cliente.** A planilha (`.xlsx` ou `.csv`) é lida no navegador; só `ContatoPlanilha[]` viaja como JSON `{ arquivoNome, contatos }`. Fotos embutidas nunca trafegam.
- **Raspagem estruturada.** `extrairConteudo(html, url)` remove nav/header/footer/aside, insere separadores entre blocos e produz `PessoaSite[]` filtrando rótulos. "Novos" só entram com cargo (corta itens de menu).
- **Grupo desconhecido** na planilha gera `sugestoesCadastro` por similaridade; não inventar mapeamento automático.

## Catálogo: como cadastrar ou trocar uma URL

1. Confirmar que a URL é do **domínio oficial** do órgão (`.gov.br`, `.jus.br`, `.leg.br`, `.mp.br`, `.def.br`). Notícia, Wikipedia e portais de terceiros não entram.
2. Testar com `fetch` simples se a página entrega os nomes em HTML. Se a lista vem por JavaScript (caso TCU), cadastrar com `navegador: true` e registrar no comentário da entrada que a página é montada por JavaScript e lida pelo navegador.
3. Acrescentar em `data/catalogo.ts`. A **primeira** fonte com `ativo: true` é a primária; a ordem do array importa.
4. Se a página tem estrutura peculiar (nomes grudados, tabela sem separador), salvar um recorte anonimizável em `tests/fixtures/` e cobrir em `tests/scrape.test.ts`.
5. Rodar `npm test` (inclui `tests/catalogo-dados.test.ts`) e `npm run typecheck`.

## Testes

- Cobertura mínima 80% (regra global). Prioridade: `lib/normalize.ts`, `lib/match.ts`, `lib/planilha.ts`, `lib/analise.ts`.
- Padrão AAA, nomes em português descrevendo o comportamento.
- Sem internet real. Scrape testado com fixtures; IA testada com `GeminiCliente` injetado.
- Toda correção de veredito falso (como o TCU) ganha teste de regressão em `tests/analise.test.ts` reproduzindo o cenário.

## Workflow

1. Mudança arquitetural → spec datado em `docs/superpowers/specs/` antes de codar, e linha nova na tabela deste arquivo.
2. Nova URL oficial → checklist do catálogo acima.
3. Antes de PR: `npm test`, `npm run typecheck`, `npm run build`.
4. Gerenciador de pacotes é **npm**. Não versionar `pnpm-lock.yaml` nem `pnpm-workspace.yaml`.

## Segurança e dados

- `.claude/settings.local.json` **não é versionado** (adicionado ao `.gitignore` em 2026-09-03). Até essa data ele estava no repositório remoto com a string de conexão do Postgres do Supabase antigo, senha incluída; a senha precisa ser considerada exposta e o histórico, limpo ou o projeto Supabase encerrado.
- Nunca colocar segredo em comando permitido do Claude Code, em spec ou em plano. Só `.env.local`.
- Planilhas do Senado (`*.xlsx`) e o PDF do GT ficam fora do git. Só fixtures de teste em `tests/fixtures/`.
- As variáveis de ambiente são `ANTHROPIC_API_KEY`, `FISCAL_CHROME` e `BLOB_READ_WRITE_TOKEN` (opcionais, modo local) e, só na Vercel, `FISCAL_MODO=web`, `APP_SENHA` e `APP_SEGREDO_COOKIE`.
- O retrato publicado vai sem telefone, e-mail e rede social; o resto fica atrás da senha. O token do Blob, a senha e o segredo do cookie nunca entram em código, spec, plano, commit ou comando permitido.

## O que NÃO fazer

- Não adicionar login individual, multi-tenant, RLS. A única autenticação é a senha compartilhada do modo web (spec 2026-10-02 §6.4).
- Não reintroduzir banco de dados (Supabase, Postgres, ORM) sem novo spec.
- Não persistir nada além do último retrato (`.fiscal/` e sua cópia enxuta no Blob privado, spec 2026-10-02 §6); sem histórico nem banco sem novo spec.
- Não voltar a depender da Vercel para ler fontes: ela é bloqueada por IP (medido em 2026-09-17). Em modo web ela só exibe.
- Não usar Firecrawl, Puppeteer ou Playwright dentro do app **fora de `lib/navegador.ts`**: só fonte do catálogo marcada `navegador: true`, só em modo local, com `puppeteer-core` e o Chrome desta máquina (spec 2026-10-02 §8). Scraping padrão continua `fetch` + cheerio. (Usar Firecrawl ou o navegador como ferramenta de desenvolvimento, para inspecionar uma página candidata antes de cadastrar, é permitido.)
- Não cadastrar URLs descobertas por busca ou IA. O Clovis fornece.
- Não transformar "não conseguimos ler a página" em "possível saída". Ver regra de ouro.
- Não enviar contatos da planilha para a IA.
