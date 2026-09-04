# Varredura contínua e Lista da Posse 2027 — Design

**Status:** Aprovado para plano de implementação
**Data:** 2026-09-04
**Autor:** Clovis Sabino (Senado Federal), com sessão `superpowers:brainstorming`
**Substitui parcialmente:** `2026-06-04-fiscal-de-mailings-design.md` (modelo de uso por upload a cada análise; ausência de persistência; ausência de senha)
**Complementa:** `2026-06-14-camada1-base-ia-refinamento.md` (regra de ouro do "possível saída" permanece), `2026-08-13-catalogo-em-arquivo-sem-banco.md` (catálogo continua em arquivo)
**Não altera:** `2026-08-13-auditoria-tratamento-enderecamento.md` (trabalho no worktree segue independente)

---

## 1. Problema

O app hoje exige que o usuário suba a planilha a cada consulta e devolve o resultado só para aquela sessão. Para a Posse Presidencial 2027 o GT precisa do contrário: abrir o app e já ver todas as autoridades da lista da Posse, com o link da página oficial de cada uma, se ela continua no cargo em que foi cadastrada e se há sinal de substituição.

Três limitações do motor atual impedem isso:

1. Páginas montadas por JavaScript (TCU) não são lidas; hoje caem em "indeterminado" ou dependem do conhecimento da IA.
2. Doze dos 33 grupos do catálogo não têm URL oficial, e o app não ajuda a encontrá-la.
3. Quando uma pessoa some da página oficial, o app diz "possível saída" e para. Não procura quem entrou no lugar nem evidência da saída.

## 2. Decisões do usuário (2026-09-04)

| Questão | Decisão |
|---|---|
| Capacidades novas | Ler páginas em JavaScript, propor URL oficial para grupos sem fonte, procurar evidência de substituição |
| Ao abrir o app | Mostrar o último retrato pronto, com data; varredura agendada e botão "Atualizar agora" |
| Acesso | Senha única compartilhada, em variável de ambiente |
| Ferramenta de investigação | Só o que já existe: API da Anthropic (busca na web com filtro de domínios) e Chromium headless dentro da função da Vercel. Sem Firecrawl, sem Apify, sem conta nova |
| Modelo da investigação | Claude Sonnet 5 (extração continua no Haiku 4.5) |
| Grupo "Grupo Eventos - PP 2027 - PILOTO" | Ignorado (resíduo de teste: 17 linhas, cargo vazio) |
| Responsáveis internos em `data/catalogo.ts` | Saem do repositório público; passam ao Blob privado |

O repositório `github.com/srpsenado-eventos/mailings` é público. Isso condiciona todo o desenho: nada que identifique uma pessoa além do que o site oficial já publica pode entrar no git.

## 3. Visão geral

```
[Planilha PP27] --upload (parse no navegador)--> lista.json  ─┐
[data/catalogo.ts] (grupos, apelidos, fontes) ────────────────┼─> Varredura ──> retrato.json
                                                              │      │           retrato-anterior.json
[cron 5h] / [botão Atualizar agora] ──────────────────────────┘      │
                                                                     v
                                          Painel (/) lê lista + retrato e renderiza
```

Duas entradas, um retrato, uma tela.

- **Lista da Posse.** O usuário envia `contatos-no-grupo.xlsx` pela tela protegida `/enviar-lista`. O parse continua no navegador (`lerPlanilha`); o servidor recebe `ContatoPlanilha[]` e grava `lista.json` no Blob privado, substituindo a anterior. A planilha da Posse tem quatro colunas além do esquema atual: `Tratamento Extenso`, `Grupos`, `Revisão`, `Data Alteração`. O leitor passa a aceitar colunas extras e guarda `Data Alteração` (serial do Excel convertido para ISO) para exibir "última alteração no Contatos".
- **Catálogo** segue em `data/catalogo.ts` como fonte de grupos e URLs. Ganha `apelidos`, `ignorar` e várias fontes ativas por grupo (§6).
- **Varredura.** Rota protegida percorre os grupos presentes na lista, lê as fontes, monta a composição, compara, investiga os sinalizados e grava o retrato com checkpoint por grupo (§7).
- **Painel** lê `lista.json` e `retrato.json` e renderiza em segundos. Sem retrato, mostra o passo a passo.

## 4. Armazenamento e acesso

**Vercel Blob privado**, provisionado pelo Marketplace da Vercel (token injetado como variável de ambiente). Três objetos JSON:

| Objeto | Conteúdo | Quem escreve |
|---|---|---|
| `lista.json` | `{ arquivoNome, enviadoEm, contatos: ContatoPlanilha[], responsaveis: ResponsaveisGrupo[] }` | `/enviar-lista` |
| `retrato.json` | `Retrato` (§5) | varredura |
| `retrato-anterior.json` | cópia do `retrato.json` anterior, para o bloco "mudou desde a última varredura" | varredura, ao concluir |

Sem banco de dados, sem tabela, sem ORM. O princípio "sem banco" do spec de 2026-08-13 continua; o que cai é "não persistir resultados".

**Senha única.** `APP_SENHA` em variável de ambiente. Tela `/entrar` grava cookie assinado (HMAC com `APP_SEGREDO_COOKIE`), HttpOnly, SameSite=Lax, validade de 30 dias. `proxy.ts` bloqueia toda rota exceto `/entrar` e a rota do cron. Senha errada: resposta idêntica com atraso progressivo por IP (1 s, 2 s, 4 s, teto 30 s), sem detalhar o erro. O cron autentica pelo cabeçalho `Authorization: Bearer <CRON_SECRET>` que a Vercel envia.

**Git.** `Agrupador PP27/` entra no `.gitignore`. A lista e os responsáveis nunca tocam o repositório nem o log. Os responsáveis que hoje estão em `data/catalogo.ts` são removidos do arquivo e passam a viver em `lista.json`, enviados pela mesma tela (segunda aba da planilha ou CSV à parte). O histórico do git continua com os dados antigos até uma limpeza, decisão fora deste spec.

## 5. Modelo de dados do retrato

Tipos novos em `lib/types.ts`, ao lado dos existentes. `ResultadoContato` e `ComparacaoCampo` não mudam; o retrato os envolve.

```ts
export type SituacaoInvestigacao =
  | "confirmado_no_cargo" | "saiu" | "substituido" | "inconclusivo" | "nao_investigado";

export interface Evidencia {
  url: string;
  trecho: string;          // até 300 caracteres
  oficial: boolean;        // domínio na lista de domínios oficiais
  data?: string;           // ISO, quando a página informa
}

export interface Investigacao {
  situacao: SituacaoInvestigacao;
  sucessor?: string;       // nome, quando a evidência aponta
  sucessorNaComposicao?: string; // nome de um "novo" do grupo com o mesmo papel
  evidencias: Evidencia[];
  modelo: string;          // ex.: "claude-sonnet-5"
  tokens: { entrada: number; saida: number; buscas: number };
}

export interface FonteProposta {
  url: string;
  trecho: string;
  encontradaEm: string;    // ISO
}

export interface ContatoRetrato extends ResultadoContato {
  investigacao?: Investigacao;
  linkOficial?: string;    // URL da fonte que confirmou, com âncora quando houver
  alteradoNoContatosEm?: string;
}

export interface GrupoRetrato extends Omit<ResultadoGrupo, "contatos"> {
  contatos: ContatoRetrato[];
  fontesLidas: { url: string; meio: "fetch" | "chromium"; pessoas: number; erro?: string }[];
  falhasConsecutivas: number; // varreduras seguidas em que nenhuma fonte rendeu pessoas; herdado do retrato anterior
  fontesPropostas?: FonteProposta[];
  concluidoEm?: string;    // checkpoint
}

export interface Retrato {
  versao: 1;
  iniciadoEm: string;
  concluidoEm?: string;    // ausente enquanto a varredura corre ou foi interrompida
  emAndamentoAte?: string; // trava de concorrência (agora + 15 min)
  gruposIgnorados: { nome: string; contatos: number }[];
  grupos: GrupoRetrato[];
  resumo: ResumoAnalise & {
    substituicaoProvavel: number;
    indicioSubstituicao: number;
    naoInvestigado: number;
    custo: { tokensEntrada: number; tokensSaida: number; buscas: number };
  };
}
```

O "mudou desde a última varredura" é calculado na leitura, comparando `retrato.json` com `retrato-anterior.json` por chave `grupo + nome normalizado`: contatos cujo semáforo ou situação de investigação mudou, novos que apareceram, novos que sumiram.

## 6. Mudanças no catálogo

`GrupoCatalogo` passa a:

```ts
export interface GrupoCatalogo {
  nome: string;
  apelidos?: string[];      // rótulos da planilha que casam este grupo, já normalizados na comparação
  faixaPais?: { de: string; ate: string }; // só embaixadores: divide um apelido comum pelo país da coluna Departamento
  ignorar?: boolean;        // grupo de teste; contatos ficam fora da varredura e são contados à parte
  fontes: FonteCatalogo[];  // TODAS as ativas são lidas e mescladas; a primeira ativa é a primária
}
```

Os campos `responsavel1`, `responsavel2`, `backup` e os e-mails saem do tipo e do arquivo (§4).

- **Apelidos** resolvem de forma determinística os rótulos da planilha da Posse: `CNJ` → "Conselho Nacional de Justiça (CNJ)", `Defensor` → "Defensor Público Geral da União", `Presidente do Senado Federal` → "Presidente do Senado". Apelido tem precedência sobre similaridade; `sugerirGrupos` continua como último recurso.
- **Embaixadores.** Os três grupos declaram o mesmo apelido `Embaixadores` e cada um a sua `faixaPais`. O contato cai no grupo cuja faixa contém o país da coluna `Departamento`, comparado com `normalizarTexto` e ordenação `pt-BR`. Sem país, ou país fora das três faixas, cai no primeiro grupo com observação "país não identificado". A coluna `Departamento` traz "Embaixada do Reino dos Países Baixos" num caso; o prefixo "Embaixada de/do/da" é removido antes da comparação.
- **Contador de falhas.** `falhasConsecutivas` do grupo é lido do retrato anterior, incrementado quando nenhuma fonte rende pessoas e zerado quando alguma rende. A busca de fonte proposta dispara quando o grupo não tem fonte ou quando o contador chega a 3.
- **Várias fontes por grupo.** `resolverGrupoEFonte` devolve `urls: string[]`; a varredura lê todas e mescla as composições (união por nome normalizado, página vence IA). Isso cobre Governadores (27 páginas estaduais) e Ministros de Estado (uma por ministério) sem grupo novo. O cadastro das URLs continua manual.
- **Ignorar.** "Grupo Eventos - PP 2027 - PILOTO" entra com `ignorar: true`.

## 7. Varredura

Rota `POST /api/varredura`, Node, `maxDuration = 300`. Aceita `Authorization: Bearer <CRON_SECRET>` (cron) ou o cookie de sessão (botão). Passos:

1. Lê `lista.json`. Sem lista → 409 com mensagem.
2. Lê `retrato.json`. Se `emAndamentoAte` está no futuro → 409 "varredura em andamento". Senão grava um retrato novo com `iniciadoEm` e `emAndamentoAte = agora + 15 min`; move o retrato concluído anterior para `retrato-anterior.json`.
3. Agrupa os contatos (`agruparPorGrupo`), separa os grupos ignorados.
4. Para cada grupo ainda sem `concluidoEm`, em sequência:
   a. Resolve grupo e fontes.
   b. Lê cada fonte pela cascata (§8a). Mescla composições.
   c. Camada 2 (IA, Haiku) como hoje: `extrairComposicao` + `mesclarComposicao`.
   d. `compararGrupo` (motor atual, intocado).
   e. Grupo sem fonte, ou com todas as fontes falhando pela terceira varredura consecutiva: busca de fonte proposta (§8b).
   f. Investigação de substituição para os sinalizados (§8c).
   g. Preenche `linkOficial` de cada contato casado com a URL da fonte que o confirmou.
   h. Grava o retrato com `concluidoEm` do grupo (checkpoint).
   i. Se restarem menos de 60 s de orçamento, grava e reinvoca a própria rota (`fetch` interno com o mesmo cabeçalho) e encerra. A próxima execução retoma do primeiro grupo sem `concluidoEm`.
5. Ao fechar o último grupo: calcula o resumo, grava `concluidoEm` no retrato, limpa `emAndamentoAte`.

Cron em `vercel.ts`: `{ path: "/api/varredura", schedule: "0 8 * * *" }` (8h UTC = 5h Brasília).

O botão "Atualizar agora" chama a rota e passa a exibir o progresso (`grupos concluídos / total`) lendo o retrato a cada 5 s.

## 8. Motor de investigação

### 8a. Leitura da página oficial (o que confirma)

Cascata em `lib/scrape.ts`:

1. `raspar(url)` como hoje: `fetch` com cabeçalhos de navegador, retry com TLS relaxado, cheerio, `extrairConteudo`.
2. Se `pessoas.length === 0` e o HTML tem sinais de aplicação JavaScript (corpo curto, `<div id="root">`/`app`, scripts de framework), aciona `rasparComNavegador(url)`: Chromium headless (`puppeteer-core` + `@sparticuz/chromium`) carrega a página, espera rede ociosa até 20 s, devolve o HTML renderizado, que passa pelo mesmo `extrairConteudo`.
3. Proveniência "página" nos dois casos. `fontesLidas[].meio` registra qual degrau funcionou.

Chromium é permitido **só** neste degrau. Não é usado para navegar, buscar, nem para páginas que o `fetch` já lê.

### 8b. Descoberta de fonte (propõe, não cadastra)

`lib/fonte-proposta.ts`. Uma chamada ao Sonnet 5 com a ferramenta `web_search` (variante com filtro de domínios) e `allowed_domains` = `gov.br`, `jus.br`, `leg.br`, `mp.br`, `def.br`, `mil.br`. O prompt pede a página que lista a composição atual do grupo. Saída estruturada: até 3 candidatas com URL e trecho. Vão para `GrupoRetrato.fontesPropostas`.

Entrar no catálogo continua sendo edição humana em `data/catalogo.ts`. A tela mostra a proposta com botão de copiar e o checklist de cadastro do CLAUDE.md.

### 8c. Investigação de substituição (só para sinalizados)

`lib/investigacao.ts`. Roda para: `possivelSaida`, cargo `divergente`, semáforo `indeterminado`, e cada `novo` com cargo. Uma chamada por pessoa ao Sonnet 5 com `web_search`, `max_uses: 4`. Primeira busca com `allowed_domains` oficiais; se a resposta for `inconclusivo`, segunda chamada sem filtro de domínio, cujas evidências vêm com `oficial: false`.

Entrada do prompt: nome, cargo e órgão da autoridade (dados públicos de agente público), o nome do grupo e, se houver, os nomes dos "novos" do grupo com o mesmo papel. **Nunca** telefone, e-mail, endereço, tratamento. Esta é a única exceção à regra "sem PII no prompt", e fica documentada no CLAUDE.md.

Saída estruturada (`output_config.format`): `situacao`, `sucessor`, `evidencias[]`. Sem evidência com URL, a situação é forçada para `inconclusivo` em código, independentemente do que o modelo disser.

Pareamento de sucessor: se `sucessor` casa (por `pontuarPessoa`) um "novo" do grupo, `sucessorNaComposicao` recebe esse nome.

### 8d. Vereditos

Os semáforos existentes não mudam de significado. A investigação acrescenta uma qualificação, exibida como rótulo próprio:

| Rótulo na tela | Condição | Efeito no semáforo |
|---|---|---|
| Substituição provável | `saiu` ou `substituido` com ao menos uma evidência `oficial: true` | Mantém vermelho; mostra sucessor |
| Indício de substituição, confira | `saiu` ou `substituido` só com evidência de imprensa | Mantém vermelho |
| Confirmado por investigação | Era possível saída ou indeterminado; investigação diz `confirmado_no_cargo` com evidência oficial | Passa a **amarelo** com observação "não consta na página oficial; confirmado por busca" |
| Não investigado | Busca indisponível, sem crédito, ou erro | Mantém o que era |
| Inconclusivo | Sem evidência suficiente | Mantém o que era |

Regras invariantes:
- A investigação nunca rebaixa um verde.
- "Indeterminado" só vira "saída" com evidência oficial de saída. Sem composição e sem evidência, continua "não verificado". A regra de ouro do spec de 2026-06-14 vale integralmente.
- "Novo" com investigação `confirmado_no_cargo` ganha o rótulo "entrada confirmada".

## 9. Interface

Rotas, todas protegidas exceto `/entrar`:

| Rota | Papel |
|---|---|
| `/` | Painel: data do retrato, botão "Atualizar agora" com progresso, contadores (confere, revisar, substituição provável, não verificado, novos), bloco "mudou desde a última varredura", e as duas visões |
| `/grupos` | Como hoje, com responsáveis vindos do Blob e as fontes propostas dos grupos sem fonte |
| `/enviar-lista` | Upload da planilha da Posse e dos responsáveis |
| `/entrar` | Senha |

As duas visões do painel, alternáveis:

- **Lista da Posse.** Todas as pessoas (329 na planilha atual, descontado o grupo ignorado). Filtro por status e grupo, busca por nome, ordenação. Linha: nome, cargo, grupo, status com ícone e rótulo de investigação, link "ver no site oficial", origem do dado (oficial, ≈ via IA, imprensa), "última alteração no Contatos", botão "detalhes".
- **Por grupo.** Como hoje: grupo, fonte(s), responsáveis, contatos, novos.

"Detalhes" abre a comparação campo a campo (`comparacoes`) e as evidências da investigação com link e trecho.

Exportação XLSX/CSV mantida, com colunas novas: situação da investigação, sucessor, evidência principal (URL), link oficial, última alteração no Contatos.

## 10. Falhas

Sempre degradar para o veredito mais cauteloso, nunca fabricar certeza.

| Falha | Comportamento |
|---|---|
| Chromium não sobe ou estoura tempo | Fica o resultado do `fetch`; `fontesLidas[].erro` registra; contatos seguem a regra de ouro |
| API da Anthropic indisponível ou sem crédito | `extrairComposicao` devolve `[]` (como hoje); investigação marca `nao_investigado`; fonte proposta não roda |
| Blob indisponível na leitura | Painel mostra o último retrato guardado no navegador (IndexedDB) com aviso de idade; sem cache, mostra erro claro |
| Blob indisponível na escrita | Varredura aborta com erro logado (sem PII); retrato parcial já gravado permanece |
| Varredura interrompida | Retrato sem `concluidoEm` é exibido com "N de M grupos atualizados"; próxima execução retoma |
| Trava presa (função morreu) | `emAndamentoAte` expira em 15 min; a próxima chamada assume |
| Senha errada | Resposta genérica com atraso progressivo |
| Planilha sem colunas obrigatórias | `ColunaFaltanteError` como hoje; colunas extras são ignoradas |

## 11. Testes

`lib/` continua puro. Chromium, Blob, cron e a API entram por `Dependencias` injetadas, como hoje `raspar` e `extrairComposicao`. Nenhum teste toca a internet.

Cobertura obrigatória, com fixtures em `tests/fixtures/`:
- Apelidos e grupos ignorados no catálogo; embaixadores por faixa alfabética.
- Mesclagem de várias fontes por grupo (união, página vence IA, sem duplicar).
- Detecção de "cara de JavaScript" que aciona o segundo degrau.
- Classificação da investigação a partir de respostas gravadas da API (JSON em fixtures): cada situação, evidência oficial vs imprensa, forçar `inconclusivo` sem URL.
- Pareamento de sucessor com "novos".
- Tabela de rótulos (§8d), incluindo "nunca rebaixa verde".
- Cálculo do "mudou desde a última varredura".
- Checkpoint e retomada: varredura interrompida no grupo 3 retoma no 3, não repete 1 e 2.
- Trava de concorrência e expiração.
- Leitura da planilha da Posse com as colunas extras e conversão de `Data Alteração`.
- Cookie: assinatura válida, expirada, adulterada.

Cobertura mínima 80% (regra global) continua.

## 12. Custo

Estimativa por varredura completa, com a lista atual:

| Item | Quantidade | Custo |
|---|---|---|
| Leitura de páginas (fetch/Chromium) | ~20 a 50 | tempo de função, sem cobrança por chamada |
| Extração (Haiku 4.5) | 17 chamadas | centavos |
| Fonte proposta (Sonnet 5 + busca) | 5 a 12 | ~US$0,10 cada |
| Investigação (Sonnet 5 + até 4 buscas) | 50 a 100 | ~US$0,05 a US$0,10 cada |
| **Total** | | **US$3 a US$8** |

Uma vez por dia: US$90 a US$240 por mês, caindo conforme os grupos ganham fonte e os sinalizados diminuem. O painel mostra tokens e buscas da última rodada (`resumo.custo`). Se o custo preocupar, a primeira alavanca é reduzir a frequência do cron; a segunda, investigar só possível saída e novos, deixando cargo divergente para o clique.

## 13. Segurança e PII

- Lista, responsáveis e retrato só no Blob privado, atrás da senha.
- Log do servidor: nome do grupo, URL, contagens, motivo técnico de erro. Nunca nome de pessoa.
- Prompt da investigação: nome, cargo, órgão e nomes dos "novos" do grupo. Nunca contato, endereço ou tratamento. Exceção única, justificada por serem dados que o próprio site oficial publica.
- Chromium: só URLs vindas do catálogo. Nunca navega para URL vinda de busca ou de input do usuário.
- `web_search` com `allowed_domains` na primeira passada; a segunda passada, sem filtro, marca tudo como imprensa.

## 14. Regras do projeto que este spec altera

| Regra atual (CLAUDE.md) | Nova regra |
|---|---|
| Não persistir resultados de análise | Lista e retrato persistem no Blob privado. "Sem banco de dados" continua |
| Não usar Puppeteer/Playwright no app | Chromium headless permitido só como segundo degrau de leitura de fonte oficial do catálogo |
| Não cadastrar URLs descobertas por busca/IA | A busca **propõe**; só o Clovis cadastra, editando `data/catalogo.ts` |
| Não adicionar autenticação | Senha única compartilhada. Multiusuário, login institucional e RLS seguem fora |
| Sem PII no prompt | Exceção única: nome, cargo e órgão na investigação de substituição |
| Upload a cada análise | Upload da lista da Posse uma vez; varredura agendada |

O CLAUDE.md é atualizado na primeira tarefa do plano, junto com a linha desta decisão na tabela de specs.

## 15. Fora de escopo

- Editar o Sistema Contatos a partir do app.
- Geração do Kit (convite, cartão, cinta).
- Auditoria de tratamento e endereçamento (spec de 2026-08-13, em andamento no worktree; o retrato acomoda as `comparacoes` que ele produzir sem mudança de contrato).
- Histórico de retratos além do anterior.
- Notificação por e-mail quando algo muda.
- Limpeza do histórico do git (dados de responsáveis e a senha do Supabase antigo). Pendência registrada no CLAUDE.md.

## 16. Riscos e trade-offs aceitos

- **Chromium na Vercel é a única peça sem precedente no projeto.** A primeira tarefa do plano é uma prova de uma hora: uma rota descartável que lê o TCU pela função na Vercel. Se falhar, o degrau 2 da cascata sai do escopo e páginas em JS continuam cobertas pela IA, rotuladas; a decisão vai para um adendo neste spec.
- **Investigação por busca é probabilística.** Por isso ela só qualifica vereditos, nunca cria "saída" sem evidência oficial, e toda evidência leva URL e trecho para conferência humana.
- **Custo cresce com a quantidade de sinalizados.** Aceito; o painel expõe o custo e o cron é a alavanca.
- **Senha única é fraca contra vazamento entre colegas.** Aceito para uso interno de um GT pequeno; trocar a senha é trocar uma variável de ambiente.
- **Repositório público com histórico contaminado.** Este spec não resolve; registra.

## 17. Ordem de implementação sugerida

1. Prova do Chromium na Vercel (descartável).
2. CLAUDE.md, `.gitignore`, tipos novos, catálogo (`apelidos`, `ignorar`, fontes múltiplas, responsáveis fora).
3. Blob, senha, `proxy.ts`, `/entrar`, `/enviar-lista`.
4. Varredura com checkpoint, retomada, trava e cron. Sem investigação ainda.
5. Cascata de leitura com Chromium.
6. Fonte proposta.
7. Investigação de substituição e rótulos.
8. Painel com as duas visões, "mudou desde", exportação.
9. Verificação de ponta a ponta na Vercel com a lista real.
