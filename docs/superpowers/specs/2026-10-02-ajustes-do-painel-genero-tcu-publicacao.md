# Ajustes do painel, gênero no protocolo, TCU por navegador e publicação do retrato — Design

**Status:** Aprovado para plano de implementação
**Data:** 2026-10-02
**Autor:** Clovis Sabino (Senado Federal), com sessão `superpowers:brainstorming`
**Complementa:** `2026-10-01-painel-local-retrato-em-arquivo.md` (o painel e o `Armazem` que este spec estende), `2026-08-13-auditoria-tratamento-enderecamento.md` e `2026-09-15-auditoria-tratamento-correcao-de-alvo.md` (a Camada B que ganha gênero), `2026-09-04-varredura-continua-posse-2027-design.md` (reaproveita a senha única e o Chromium como segundo degrau, agora rodando local)
**Base de código:** branch `feat/painel-local` (HEAD `0c8c6d7`), ou `main` depois do merge do PR correspondente

---

## 1. Problema

A primeira varredura real com o painel local (2026-10-01, 418 contatos) mostrou nove coisas, todas apontadas pelo Clovis em 2026-10-02:

1. **"Tudo confere" ao lado de "Tratamento sem regra" e "Endereço a completar".** A regra está coerente (etiqueta neutra não conta), mas o rótulo afirma mais do que foi conferido.
2. **"Sem regra" para as 15 senadoras.** A tabela de protocolo tem a regra "Senador / Deputado Federal"; o casamento por texto não leva "Senadora" até ela. O mesmo vale para "Governadora", "Encarregada de Negócios" e qualquer feminino cujo masculino está na tabela. É defeito da Camada B anterior ao painel, que só ficou visível porque o painel mostra o estado campo a campo.
3. **Cargo vazio sai como "sem regra"**, quando o problema é o cadastro.
4. **Não há como ir a um grupo** numa página com 18 grupos e 418 linhas.
5. **As etiquetas não se explicam.** "Endereço a completar" não diz que falta o bairro; "Endereço a confirmar" não diz qual dos seis motivos.
6. **Governadores e outros grupos sem fonte** só têm composição por IA. O Sistema Contatos exporta um arquivo com as fontes cadastradas lá, que pode virar fonte do app.
7. **TCU** continua inacessível mesmo local: a página é montada por JavaScript. Rodar daqui resolveu o bloqueio por IP (STM, STJ, TST, TSE, Ministros de Estado foram lidos), não resolve página sem HTML.
8. **Embaixadores** é lido, mas o extrator genérico produz 773 "novos" falsos.
9. **Outros usuários do GT precisam ver o resultado**, e a varredura só pode sair desta máquina.

## 2. Decisões do usuário (2026-10-02)

| Questão | Decisão |
|---|---|
| Rótulo da situação | "Tudo confere" só quando todas as etiquetas são verdes; com etiqueta neutra e nada a revisar, "Nada a revisar" |
| Gênero no casamento de cargo | Indiferente ao gênero, para qualquer um dos dois |
| Cargo vazio | Dizer "cargo vazio", não "sem regra" |
| Navegação por grupo | Filtrar o grupo ao longo da página |
| Explicação das etiquetas | Subtítulo ao passar o cursor, com o motivo real |
| Terceira fonte | O arquivo de fontes do Sistema Contatos entra como fonte; formato a confirmar com o arquivo |
| Publicação | O painel na web **reflete** o que foi varrido aqui; ninguém varre pela web |

## 3. Visão geral

Três frentes, três planos, nesta ordem:

| Plano | Entrega | Depende de |
|---|---|---|
| **A. Painel e Camada B** | itens 1 a 5 do §1 | nada |
| **B. TCU por navegador** | item 7 | Chrome instalado nesta máquina |
| **C. Publicação do retrato** | item 9 | Vercel Blob provisionado e senha definida |

Ficam **fora deste spec**, com motivo: a terceira fonte do Sistema Contatos (item 6) espera o arquivo para ser desenhada e vira adendo a este spec quando ele chegar; o extrator de Embaixadores (item 8) é spec próprio, porque é parsing de uma página específica.

Nada aqui muda os vereditos da Camada 1 (site), a regra de ouro do "possível saída" nem a auditoria de endereço. O que muda na Camada B é só **como o cargo da planilha encontra a regra**; a comparação em si continua a mesma.

## 4. Plano A: painel e Camada B

### 4.1 Situação da linha

`situacaoDoContato` em `lib/painel.ts` passa a devolver, nesta ordem: "Possível saída"; "Sem fonte"; "Não verificado"; **"N a revisar"** se houver etiqueta de atenção ou ruim; **"Tudo confere"** se todas as etiquetas forem verdes; **"Nada a revisar"** (tom neutro) se não houver nada a revisar mas alguma etiqueta for neutra. O cartão "Conferem" do resumo continua sendo o verde do semáforo.

### 4.2 Gênero no casamento de cargo (Camada B)

`resolverRegra` em `lib/tratamento.ts` passa a casar o cargo da planilha **com o gênero neutralizado**, antes do casamento exato, das exceções e da similaridade. A neutralização é um léxico em `lib/cargos.ts` (que já é o léxico de papéis), uma função pura `neutralizarGenero(cargo): string` que troca, palavra a palavra, formas femininas conhecidas pelo masculino que a tabela usa: senadora→senador, deputada→deputado, governadora→governador, vice-governadora→vice-governador, ministra→ministro, presidenta→presidente, embaixadora→embaixador, encarregada→encarregado, procuradora→procurador, defensora→defensor, conselheira→conselheiro, desembargadora→desembargador, secretária→secretário, diretora→diretor, chefe fica. Só palavras da lista mudam; nada de regra de sufixo, para "mesa" não virar "meso".

O que **não** muda: a Camada A continua exigindo que o gênero do tratamento bata com o do cargo ("Senhora" com "Senadora"); a Camada 1 continua não deixando "Ministra" confirmar "Ministro" contra o site; a expansão `o(a)`/`Senhor(a)` da regra continua produzindo as formas dos dois gêneros. A neutralização serve só para **encontrar** a regra.

Teste de regressão com a tabela real: "Senadora" resolve para a mesma regra que "Senador"; "Governadora do Estado do Acre" resolve para o mesmo que "Governador do Estado do Acre" (hoje nenhum dos dois resolve, por causa do estado anexado; esse caso continua `sem_regra` até o spec de casamento por núcleo do papel, e o teste pina a igualdade entre os gêneros, não o acerto); "Encarregada de Negócios" resolve para o mesmo que "Encarregado de Negócios". Medida esperada na planilha real: os 15 "Senadora" saem de `sem_regra`.

### 4.3 Cargo vazio

Quando `contato.cargo` está vazio ou só espaço, a Camada B continua devolvendo `sem_regra` (não há tipo novo), e o painel apresenta: etiqueta **"Cargo vazio"** no campo cargo, tom **atenção** (é dado que a Posse precisa e falta no cadastro), contando em "N a revisar"; e as etiquetas neutras de tratamento e endereçamento ("sem regra") somem, porque sem cargo não existe regra a procurar; as de atenção (Camada A: tratamento vazio, forma genérica, gênero entre campos) continuam, porque não dependem do cargo. No detalhe, o cartão de cargo diz "No cadastro: (vazio)" e "Site do órgão diz" como hoje. Medida esperada: 17 contatos, todos do grupo PILOTO.

### 4.4 Navegação por grupo

Na barra de filtros, um `<select>` "Grupo" com "Todos os grupos" e os grupos do retrato, na ordem da página. Escolher um grupo mostra só ele; os outros filtros e a busca continuam valendo dentro dele. `filtrarGrupos` ganha o quarto parâmetro `grupo?: string`. O cabeçalho de cada grupo fica **fixo no topo** enquanto o grupo rola (`position: sticky`), para o leitor saber onde está. Os seis cartões do resumo continuam sendo do retrato inteiro, não do filtro; o contador "N contatos de M" já diz o que o filtro deixou.

### 4.5 Explicação das etiquetas

`Etiqueta` ganha `explicacao: string`, montada em `lib/painel.ts` e mostrada no `title` (cursor) e em `aria-label`. Uma por etiqueta:

| Etiqueta | Explicação |
|---|---|
| Nome confere / Cargo confere | "Igual ao que o site do órgão publica" |
| Nome diverge / Cargo diverge | "O site do órgão publica outro valor; veja no detalhe" |
| Nome não verificado / Cargo não verificado | "A fonte oficial não pôde ser lida nesta varredura" |
| Tratamento confere / Endereçamento confere | "Igual ao que a tabela de protocolo manda para este cargo" |
| Tratamento diverge / Endereçamento diverge | "Diferente do que a tabela de protocolo manda, ou incoerente com o cargo; veja no detalhe" |
| Tratamento sem regra / Endereçamento sem regra | "O cargo \"X\" não foi encontrado na tabela de protocolo; nada foi conferido" |
| Cargo vazio | "O cadastro não informa o cargo; sem ele não há regra de protocolo" |
| Endereço completo | "Logradouro, número, bairro, CEP, cidade e UF presentes no relatório de endereços" |
| Endereço a completar | "Pode ser completado na conferência dos Correios (Fase 2): " + os achados da linha com `rotuloAchadoEndereco`, separados por "; " (ex.: "sem bairro (sai do CEP); CEP com dígito faltando (zero à esquerda; confirmar nos Correios)") |
| Endereço a confirmar | "Precisa de confirmação por telefone: " + os achados da linha, com `rotuloAchadoEndereco`, separados por "; " (ex.: "sem número; sem CEP") |
| Endereço não verificado | "Nome ambíguo no relatório: mais de um contato com este nome; endereço não atribuído" |
| Sem par na fonte | "Ninguém com este nome na composição oficial; confirmar se saiu" |
| Site: cargo | "Pessoa publicada pela fonte, sem par na planilha" |

A situação da linha ganha explicação do mesmo jeito ("Nada a revisar" → "Nenhum campo pede revisão; os campos neutros não puderam ser conferidos").

### 4.6 Testes do Plano A

- `tests/painel.test.ts`: "Nada a revisar" × "Tudo confere" × "N a revisar"; "Cargo vazio" com atenção e sem etiquetas de protocolo; filtro por grupo combinado com busca; cada explicação da tabela, em especial a de "Endereço a confirmar" com dois achados.
- `tests/cargos.test.ts` (ou o arquivo existente do léxico): `neutralizarGenero` para cada par da lista e para texto sem feminino (devolve igual).
- `tests/tratamento-comparacao.test.ts`: os três pares de gênero do §4.2 contra a tabela real; os dez casos já travados continuam iguais.

**Emenda de 2026-10-02 (revisão final do Plano A).**

- §4.3: com cargo vazio, só as etiquetas neutras de tratamento e endereçamento somem; as de atenção da Camada A continuam, e a linha com cargo vazio passa pelo filtro "Só o que tem ressalva".
- §4.5: a explicação de "Endereço a completar" sai dos achados reais da linha (`rotuloAchadoEndereco`), não mais de uma frase fixa sobre o bairro.

## 5. Plano B: TCU por navegador

`FonteCatalogo` ganha `navegador?: true`. Para uma fonte assim, o orquestrador, em vez de `raspar` por `fetch`, chama `rasparComNavegador(url)`: abre o Chrome instalado nesta máquina sem janela (`puppeteer-core`, dependência nova, registrada aqui), carrega a página, espera a rede sossegar, pega o HTML montado e passa pelo mesmo `extrairConteudo` de hoje. Só URL do catálogo; nunca URL vinda de busca, de IA ou de input.

- Caminho do Chrome: `FISCAL_CHROME` em `.env.local`; sem a variável, os caminhos padrão do Windows (`Program Files` e `Program Files (x86)`). Sem Chrome, `ScrapeError` com motivo "navegador não encontrado", e o grupo cai em fonte inacessível como hoje.
- Teto de 30 s por página; estouro vira `ScrapeError` com motivo "navegador: tempo esgotado".
- Entra por `Dependencias`: `rasparComNavegador` é injetado como `raspar`; teste nenhum abre navegador. A extração a partir do HTML já é testada com fixture; um recorte da página do TCU montada entra em `tests/fixtures/`.
- Catálogo: a entrada do TCU recebe `navegador: true` e o comentário muda de "depende da Camada 2" para "página em JavaScript; lida por navegador".
- Se o TCU ler, a IA deixa de ser a única composição dele e o grupo sai de `viaPesquisaAmpla`.

## 6. Plano C: publicação do retrato na web

A Vercel volta ao jogo **só para exibir**. O painel publicado é o mesmo componente, lendo um retrato que esta máquina enviou.

### 6.1 Armazém na nuvem

`armazemEmBlob(token)` em `lib/armazem-blob.ts`: segunda implementação de `Armazem`, com `@vercel/blob` (dependência nova, registrada aqui), objeto privado `retratos/retrato.json`. `lerRetrato` lê o objeto; ausente devolve `undefined`; ilegível lança `RetratoIlegivelError`, como a versão em arquivo.

### 6.2 Dois modos

`FISCAL_MODO` decide o armazém e a tela: **`local`** (padrão; sem a variável) lê e grava em `.fiscal/`, tem "Nova varredura" e, se `BLOB_READ_WRITE_TOKEN` estiver em `.env.local`, mostra o botão **"Publicar na web"** no cabeçalho do painel; **`web`** (na Vercel) lê do Blob, não tem "Nova varredura" nem "Publicar", e o cabeçalho diz "Varredura feita na máquina do GT em DD/MM, HHhMM. Publicada em DD/MM, HHhMM." Sem retrato publicado, a página diz "Nenhuma varredura publicada ainda".

### 6.3 Publicar

`POST /api/publicar` (só em modo local): lê o retrato de `.fiscal/`, remove `telefone`, `email` e `redeSocial` de cada contato (o painel não os mostra; não precisam sair desta máquina), acrescenta `publicadoEm`, grava no Blob. Resposta `{ ok, publicadoEm }` ou `{ ok: false, message }`. O botão mostra "Publicado às HHhMM" ao terminar. O retrato local não muda.

### 6.4 Senha

Em modo web, tudo fica atrás de uma senha única: `APP_SENHA` e `APP_SEGREDO_COOKIE` nas variáveis da Vercel; tela `/entrar`; cookie assinado (HMAC), HttpOnly, SameSite=Lax, 30 dias; `middleware.ts` bloqueia toda rota exceto `/entrar` e `/api/entrar`; senha errada responde igual, com atraso progressivo por IP (1 s, 2 s, 4 s, teto 30 s). É o desenho do spec de 04/09 §4, sem o cron. Em modo local não há senha.

### 6.5 Segurança

- O token do Blob só existe em `.env.local` aqui e nas variáveis da Vercel; nunca em código, spec, plano, commit nem comando permitido.
- O retrato publicado não tem telefone, e-mail nem rede social. Nome, cargo, tratamento, endereçamento e endereço vão, porque são o objeto do painel, e ficam atrás da senha.
- Log do servidor continua sem PII: só motivo técnico.
- A Vercel não lê fonte nenhuma: `FISCAL_MODO=web` desliga `/api/analise` (responde 404).

### 6.6 Testes do Plano C

- `armazemEmBlob` com cliente injetado (sem rede): lê, grava, ausente, ilegível.
- `enxugarParaPublicar(retrato)`: remove os três campos e nada mais; `publicadoEm` presente.
- `lib/sessao.ts`: criar e validar token; token adulterado e expirado falham.
- Middleware e rota de entrada: sem teste automatizado (como as rotas de hoje); conferência manual no deploy.

## 7. Falhas

| Falha | Comportamento |
|---|---|
| Chrome ausente ou página passa de 30 s | Fonte inacessível com o motivo; regra de ouro vale |
| Blob fora do ar ao publicar | Botão mostra o erro; retrato local intacto |
| Blob fora do ar na Vercel | "Não foi possível ler a varredura publicada"; nada de cache |
| Retrato publicado por versão anterior do código | O validador do `Armazem` já rejeita o que o painel não sabe ler; a tela explicativa de hoje |
| Senha errada | Resposta genérica com atraso progressivo |
| `FISCAL_MODO=web` sem token do Blob | Página diz que o ambiente não está configurado; nada quebra |

## 8. Regras do projeto que este spec altera

| Regra atual (`CLAUDE.md`) | Nova regra |
|---|---|
| Não usar Puppeteer/Playwright dentro do app | `puppeteer-core` com o Chrome local, só para fonte do catálogo marcada `navegador: true`, só em modo local |
| A Vercel saiu da stack | Volta **só para exibir** o retrato publicado, atrás de senha, em modo `web`; nunca varre |
| Não adicionar autenticação | Senha única compartilhada em modo web, como o spec de 04/09 decidiu. Multiusuário continua fora |
| Sem PII fora desta máquina | O retrato publicado vai sem telefone, e-mail e rede social |
| Dependências sem registro | Entram `puppeteer-core` e `@vercel/blob`, registrados aqui |
| Composição real (página ou IA) que não contém a pessoa gera possível saída | Composição que não casa nenhum contato de um grupo com 2+ contatos é leitura suspeita: grupo indeterminado com motivo, nunca saída (adendo de 2026-10-03, revisão final do Plano B) |

O `CLAUDE.md` é atualizado na última tarefa de cada plano.

## 9. Fora de escopo

- Terceira fonte do Sistema Contatos (item 6 do §1): adendo a este spec quando o arquivo for entregue.
- Extrator de Embaixadores (item 8): spec próprio.
- Casamento de cargo pelo núcleo do papel (Governadores com estado anexado, Embaixadores com país): spec próprio, já previsto em 2026-09-18.
- "Mudou desde a última varredura"; Fase 2 do endereço (Correios); investigação por busca; cron.
- Login individual, perfis, auditoria de acesso.

## 10. Riscos e trade-offs aceitos

- **Chrome local é dependência do ambiente.** Sem ele o TCU volta a "inacessível", honestamente. Aceito.
- **Senha compartilhada.** Quem tem a senha vê tudo que foi publicado. Aceito pelo spec de 04/09; o retrato publicado já vai sem telefone e e-mail.
- **Dois modos no mesmo código.** `FISCAL_MODO` é um único ponto de decisão (armazém, rota, cabeçalho); o resto do painel é idêntico. Aceito.
- **Léxico de gênero é uma lista.** Um feminino fora da lista continua `sem_regra`; a medição da planilha real diz quais faltam, e a lista cresce por commit.
