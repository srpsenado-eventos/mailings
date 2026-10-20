# Memória de leitura por página

Data: 2026-10-20. Decisões do Clovis na conversa de 20/10 (perguntas e respostas registradas no §2).

## 1. Problema

A fiscalização depende de páginas oficiais que caem de forma intermitente ou mudam de endereço. Quando a página de um grupo falha, o app de hoje deixa a IA compor o grupo sozinha, de memória, e o resultado é um lote de saídas falsas; quando a página responde pela metade, a IA "resgata" quem faltou e o grupo sai "via IA". Medido nas coletas de 19 e 20 de outubro:

| Grupo | 16/10 | 19/10 (2 coletas) | 20/10 | Causa |
|---|---|---|---|---|
| Ministros do TST | lido, 25 verdes | via IA, 26 saídas falsas | via IA, 24 saídas falsas | URL do catálogo passou a responder HTTP 404 |
| Ministros do STF | lido, 8 verdes | lido | via IA, 2 de 10 na página, 8 resgatados pela IA | portal do STF devolveu HTTP 403 |
| Embaixadores | inacessível (HTTP 429) | inacessível | lido | bloqueio intermitente do gov.br |
| Governadores (individuais) | 17 lidas, 5 caídas | 18 lidas, 4 caídas | 16 lidas, 6 caídas | sites estaduais fora do ar, CAPTCHA |
| Ministros de Estado (individuais) | 35 lidas, 3 caídas | 36 lidas, 2 caídas | 38 lidas | HTTP 429 do gov.br |

A regra da rotina (CLAUDE.md, trava de qualidade) segura a publicação quando um grupo lido antes vem inacessível ou via IA. O efeito prático: a web ficou na coleta de 12/10 por oito dias, e cada coleta nova precisa de sorte com três ou quatro sites ao mesmo tempo.

O pedido do Clovis (20/10): "subir exatamente com as fontes que já estavam" e ter "uma forma de contornar isso de forma perene".

## 2. Decisões

Respostas do Clovis em 20/10, nesta ordem:

1. **Publicação de agora:** publicar reaproveitando a leitura de 16/10 para os grupos que falharam hoje. Exige o mecanismo deste spec antes de publicar.
2. **Gatilho:** reaproveitar a última leitura boa tanto na falha total (erro HTTP, tempo esgotado, página sem ninguém) quanto na leitura parcial (página respondeu, mas casou poucos contatos e a IA teve que resgatar o resto).
3. **Papel da IA:** manter a IA compondo sozinha apenas quando não há registro de leitura anterior. "Sempre tentar, todavia, uma nova leitura, pois pode haver mudanças nas páginas."
4. **Validade:** uma leitura reaproveitada vale **até 7 dias**.
5. **URL do TST:** trocar no catálogo para `https://www.tst.jus.br/ministros` (título "Ministros - TST", responde 200; a anterior, `/en/ministros`, responde 404).
6. **Páginas individuais** (governadores e ministros de Estado): reaproveitam a última leitura boa, por página, com os mesmos 7 dias, nesta mesma spec.
7. **Leitura parcial** de fonte de grupo: a página oficial casou **menos da metade** dos contatos do grupo, em grupo com 2 ou mais contatos. Página que casou 9 de 10 e a IA resgatou 1 continua valendo como leitura de hoje.
8. **Retrato antigo:** a composição de um grupo lido em retrato anterior ao mecanismo é **reconstruída** dos valores da página que o retrato já traz (nome e cargo nas comparações, mais os "novos"). Vale para o STF hoje e para qualquer grupo nessa situação.
9. **Exibição:** cabeçalho do grupo com a data e o motivo ("Composição lida em 16/10; hoje a página não respondeu (HTTP 403)"); contatos com os vereditos normais, sem etiqueta extra; contador "grupos com leitura reaproveitada" no resumo; a trava de qualidade não segura a publicação por grupo reaproveitado.

Regras herdadas que continuam valendo: a regra de ouro do "possível saída" (só com composição real); Camada 1 antes da Camada 2; fontes cadastradas à mão; só o último retrato é persistido; o retrato publicado é espelho enxuto do local.

## 3. A ideia

Cada página oficial lida com sucesso fica guardada no retrato, por URL, com a data da leitura e o conteúdo extraído (`ConteudoFonte`: pessoas, texto limpo, destaques). Na varredura seguinte o app lê a página de novo, sempre. Só quando a leitura de hoje falha, ou é parcial, ele usa a guardada, se tiver até 7 dias. A leitura reaproveitada mantém a data original; uma leitura boa de hoje substitui a guardada. Passados 7 dias sem leitura boa, a memória daquela página é descartada e o grupo volta ao comportamento atual (fonte inacessível, ou IA sozinha).

A memória é **por URL**, não por grupo: serve igual à fonte de um grupo, a uma página individual de contato e à lista geral de cargos do Planalto.

## 4. Dados

### 4.1 Tipos novos e campos novos (`lib/types.ts`)

```ts
/** Uma página oficial lida com sucesso, guardada para reaproveitamento (spec 2026-10-20). */
export interface LeituraGuardada {
  url: string;
  /** Hora da leitura que produziu o conteúdo, ISO 8601. Reaproveitar não muda a data. */
  lidaEm: string;
  conteudo: ConteudoFonte;
}

/** Chave: a URL da página. */
export type LeiturasGuardadas = Record<string, LeituraGuardada>;
```

- `ResultadoAnalise.leituras?: LeiturasGuardadas`: a memória que sai desta varredura (ver §6). O `Retrato` herda o campo. Ausente em retrato gravado antes do mecanismo.
- `ResultadoGrupo.reaproveitada?: { url: string; lidaEm: string; motivo: string }`: a **fonte primária** do grupo foi substituída pela leitura guardada. `motivo` é o motivo técnico de hoje ("HTTP 403", "não trouxe ninguém", "página casou 2 de 10 contatos"). Nunca junto com `fonteInacessivel` nem com `viaPesquisaAmpla`.
- `ResultadoGrupo.individuais?: { lidas: number; caidas: number; reaproveitadas: number }`: `reaproveitadas` conta as páginas individuais (e a geral, quando reaproveitada) que entraram pela memória. `lidas` continua contando as páginas com conteúdo hoje; uma página reaproveitada não é lida nem caída.
- `ResultadoContato.leituraDe?: string`: ISO 8601 da leitura reaproveitada da página individual do contato. Ausente quando a página foi lida hoje.
- `ResumoAnalise.gruposReaproveitados: number`: grupos com `reaproveitada` ou com `individuais.reaproveitadas > 0`.
- `Dependencias.leituraAnterior?: (url: string) => LeituraGuardada | undefined` e `Dependencias.agora?: () => Date` (`lib/analise.ts`). Sem `leituraAnterior`, nada é reaproveitado e o comportamento é o de hoje; sem `agora`, `new Date()`.

### 4.2 Constantes (`lib/memoria-leitura.ts`)

- `VALIDADE_LEITURA_DIAS = 7`. Uma leitura é válida quando `agora - lidaEm <= 7 dias` (inclusive).
- `FRACAO_MINIMA_CASADA = 0.5`: leitura parcial é `casados / contatos < 0.5`.
- `MIN_CONTATOS_LEITURA_PARCIAL = 2`: grupo de um contato não tem leitura parcial (uma pessoa pode mesmo ter saído).

### 4.3 O que é guardado

Entram na memória de hoje só leituras **boas**:

- fonte de grupo: página lida com pelo menos uma pessoa e, se primária, não parcial (§5.1);
- página individual: página lida com conteúdo legível (`paginaComConteudo`), com `MIN_TEXTO_PAGINA_INDIVIDUAL` como hoje;
- lista geral de cargos: página lida com pelo menos uma denominação.

Leituras reaproveitadas voltam para a memória com a data original. Leituras guardadas de URLs que esta varredura não visitou (grupo ausente da planilha, fonte desativada) são mantidas enquanto válidas. Tudo que passar de 7 dias é podado na gravação. Leitura parcial de hoje **não** é guardada: a memória guarda só o que serviria de base de comparação.

A memória tem só dados públicos das páginas (nomes e cargos publicados, texto da página). Nada do Contatos entra nela.

### 4.4 Tamanho

Estimativa com o catálogo de 20/10: 14 páginas de grupo (a dos Embaixadores com uns 720 nomes), 60 páginas individuais e a lista do Planalto. Menos de 1 MB a mais no `.fiscal/retrato.json` (hoje 1,7 MB). A rota `/api/analise` continua devolvendo o retrato ao navegador sem `baseEnderecos`; passa a devolver também sem `leituras`, que só interessam à máquina.

## 5. Regras

### 5.1 Fonte de grupo (`analisarGrupo`, `lib/analise.ts`)

Passos, na ordem:

1. Ler todas as fontes ativas, como hoje.
2. Para cada fonte que **falhou** (`falhou`: erro em qualquer posição, ou primária que voltou sem ninguém): se há leitura guardada válida para a URL, a leitura de hoje é substituída pela guardada, e o motivo de hoje fica anotado. A fonte passa a contar como "contribuiu" e deixa de contar como "falhou".
3. Compor com as páginas (`unirFontes`), como hoje.
4. **Leitura parcial** da primária: contar quantos contatos do grupo casam alguém da composição da página (`pontuarPessoa >= LIMIAR_PESSOA`, o mesmo critério de `mesclarComposicao`). Se o grupo tem 2 ou mais contatos e casou menos da metade, e há leitura guardada válida da primária cuja composição casa **mais** contatos que a de hoje, a guardada substitui a de hoje (motivo: "página casou X de N contatos"). Se não há guardada, ou ela não casa melhor, fica a leitura de hoje e o fluxo segue como hoje (inclusive a regra de leitura suspeita, quando ninguém casou).
5. IA (Camada 2): roda como hoje **só quando a primária foi lida hoje**. Com primária reaproveitada a IA não roda: a composição guardada é a de um dia bom e não precisa de resgate. Com primária que falhou e **sem** leitura guardada válida, a IA compõe sozinha, como hoje (decisão 3).
6. Comparar e montar o resultado, como hoje. O grupo com primária reaproveitada sai **lido** (nem `fonteInacessivel` nem `viaPesquisaAmpla`), com `reaproveitada: { url, lidaEm, motivo }`. Uma fonte secundária reaproveitada é anotada em `erroFonte` como "<fonte>: leitura de <DD/MM> reaproveitada (<motivo>)", sem mudar o veredito.
7. Guardar as leituras boas de hoje (§4.3).

A leitura parcial substitui a regra de leitura suspeita só quando existe leitura guardada melhor. Sem ela, nada muda em relação a hoje.

### 5.2 Página individual e lista geral (`analisarGrupoIndividual`)

`lerFonte` ganha a memória: página com erro ou sem conteúdo legível, com leitura guardada válida, é substituída pela guardada. O contato é comparado como se a página tivesse sido lida hoje (`compararContatoIndividual` não muda) e recebe `leituraDe` com a data da guardada. A lista geral de cargos segue a mesma regra. `individuais.reaproveitadas` conta as páginas que entraram pela memória; a guarda de grupo ("duas ou mais individuais lidas e nenhuma confirmando o nome") continua contando só as lidas hoje.

### 5.3 Validade

`leituraValida(leitura, agora)` é a única função que decide; vale para grupo, individual e geral. Leitura de 16/10 vale até 23/10, inclusive.

### 5.4 Retrato antigo, sem memória (`reconstruirLeituras`)

Para um retrato gravado antes do mecanismo (`leituras` ausente), `reconstruirLeituras(retrato)` monta a memória só das **fontes de grupo lidas da página**: grupo sem `semFonte`, sem `fonteInacessivel`, sem `viaPesquisaAmpla`, sem `individuais`, com `fonteUrl` http. A composição reconstruída:

- uma pessoa por contato cuja comparação de `nome` tem `valorEsperado` com `origemValor: "pagina"`: `nome` é esse valor, `cargo` é o `valorEsperado` da comparação de `cargo` quando `origemValor: "pagina"`;
- mais cada registro de `novos` que não veio da IA (`origem !== "conhecimento"`).

`conteudo` fica `{ url: fonteUrl, textoLimpo: nomes separados por linha, destaques: [], pessoas }`; `lidaEm` é o `geradoEm` do retrato. Grupo com mais de uma fonte entra pela primária (`fonteUrl`), que é a única que o retrato identifica. Páginas individuais não são reconstruídas: começam a ser guardadas na primeira leitura boa com o código novo.

A reconstrução é feita pela rota, uma vez, quando o retrato anterior não tem `leituras`. Depois da primeira varredura com o código novo o retrato já carrega a memória.

### 5.5 Carga inicial para a publicação de 20/10

O retrato local no momento do merge tem o STF via IA (20/10) e o TST via IA; só o de 16/10 tem o STF lido. Antes da primeira coleta com o código novo, um script de uso único (fora do git, na pasta de rascunho da sessão) chama `reconstruirLeituras` sobre a cópia de 16/10 e sobre o retrato de 20/10, mescla as duas memórias (a de 20/10 vence onde as duas têm a URL) e grava o resultado no campo `leituras` do `.fiscal/retrato.json`. Daí em diante vale o fluxo normal.

## 6. Fluxo da rota (`app/api/analise/route.ts`)

1. Antes de `analisar`, ler o retrato anterior pelo armazém. Memória anterior = `retrato.leituras`, ou `reconstruirLeituras(retrato)` quando ausente, ou vazia sem retrato.
2. Injetar `leituraAnterior: (url) => memoria[url]` e `agora`.
3. `analisar` devolve `leituras` = memória anterior sobreposta pelas leituras boas de hoje e pelas reaproveitadas (com a data original), podada em 7 dias.
4. `montarRetrato` passa `leituras` adiante; o armazém grava. A resposta ao navegador vai sem `leituras` e sem `baseEnderecos`.
5. `publicarRetrato` (`lib/publicar.ts`) retira `leituras`: a web não precisa da memória.

`validarRetrato` não exige o campo: retrato antigo continua legível.

## 7. Exibição

- **Cabeçalho do grupo** (`components/painel.tsx`, texto por função pura em `lib/painel.ts`): com `reaproveitada`, linha em cor de atenção "Leitura de 16/10 reaproveitada: hoje a página não respondeu (HTTP 403)" ou "…: hoje a página casou 2 de 10 contatos". A procedência "Nome e cargo" aponta para a URL, como hoje.
- **Individuais**: `textoIndividuais` passa a "38 páginas individuais lidas · 4 reaproveitadas · 2 inacessíveis" (omite as partes com zero).
- **Contato** com `leituraDe`: a linha de procedência do campo diz "leitura de 16/10" ao lado da URL. Sem etiqueta nova.
- **Resumo**: `gruposReaproveitados` no resumo do retrato; aparece na linha de situação dos grupos do painel local e da web, e no relatório da coleta. Não vira cartão.
- **Export** (`lib/export.ts`): a coluna que hoje leva `erroFonte` recebe também "Leitura de 16/10 reaproveitada (<motivo>)".

## 8. Rotina e trava de qualidade (CLAUDE.md)

- Grupo que vem **reaproveitado** não segura a publicação: a composição é oficial, de até 7 dias.
- Continua segurando: grupo lido antes que vem inacessível ou via IA **sem** leitura guardada válida (memória vencida, ou primeira coleta depois de 7 dias de falha).
- O relatório lista cada grupo e cada página individual reaproveitados, com a data da leitura e o motivo de hoje.
- O passo "Comparar com o retrato anterior" ganha a coluna "reaproveitados".

## 9. Catálogo

`Ministros do TST`: fonte `https://www.tst.jus.br/ministros` no lugar de `https://www.tst.jus.br/en/ministros`, com comentário da data e do motivo (404 medido em 19/10). Checklist do catálogo: conferir que `fetch` simples entrega os nomes (conferido em 19/10: 200, 310 KB, lista na página).

## 10. Erros

- Memória ilegível no retrato (campo com forma inesperada): tratada como ausente; nada é reaproveitado e a varredura segue. Sem log de conteúdo.
- Leitura guardada sem `conteudo.pessoas` ou com `lidaEm` inválida: inválida, descartada na poda.
- Reconstrução de grupo sem comparações aproveitáveis: grupo fica fora da memória.

## 11. Testes (`tests/`)

- `memoria-leitura.test.ts`: validade (6 dias válida, 7 dias válida, 8 dias vencida; `lidaEm` inválida vencida); poda; mescla (hoje vence, reaproveitada mantém a data, URL não visitada permanece); reconstrução (grupo lido vira composição com nome e cargo da página e novos da página; grupo via IA, inacessível, sem fonte e com individuais ficam fora; novo da IA fica fora).
- `analise.test.ts`: primária com erro e memória válida → grupo lido, `reaproveitada` com motivo, IA não chamada; primária com erro e memória vencida → comportamento de hoje (IA sozinha, via IA); primária sem ninguém e memória válida → reaproveitada; leitura parcial (2 de 10) com memória que casa 10 → reaproveitada com motivo "página casou 2 de 10 contatos"; leitura parcial sem memória → como hoje; 9 de 10 com memória → leitura de hoje vale; secundária com erro e memória → anotação em `erroFonte`, veredito de saída de pé; grupo de 1 contato nunca é parcial; `leituras` de saída traz a boa de hoje, não traz a parcial, mantém a reaproveitada com a data original; `gruposReaproveitados` no resumo.
- `analise.test.ts` (individuais): página individual com erro e memória válida → contato comparado, `leituraDe`, `individuais.reaproveitadas`; lista geral reaproveitada; guarda de grupo conta só lidas hoje.
- `painel.test.ts`: textos do cabeçalho e de `textoIndividuais`.
- `publicar.test.ts`: `leituras` não vai para a web.
- `catalogo-dados.test.ts`: passa com a URL nova do TST.
- `export.test.ts`: coluna com a anotação.

Nenhum teste lê disco nem internet: memória e relógio são injetados.

## 12. Fora do escopo

- Nova tentativa com espera dentro da mesma varredura para a mesma URL (além do ritmo já existente do Chrome com janela).
- Ler pelo Chrome com janela uma página que devolve 403 ao `fetch` (o STF hoje). Candidato a spec própria se o 403 do STF persistir.
- Cadastrar fonte para os quatro grupos sem URL (Ex-Presidentes do Senado, Ex-Presidentes da República, Presidente da República, Procurador-Geral da República): eles continuam via IA até o Clovis fornecer as páginas.
- Histórico de retratos: continua um só.

## 13. Entrega

1. Branch `feat/memoria-de-leitura` a partir de `main`; spec e plano; implementação por subagentes; `npm test`, `typecheck`, `build`.
2. PR, merge pelo Clovis, deploy automático.
3. Carga inicial (§5.5), coleta nova pela tela, comparação com o retrato anterior, trava (§8), publicação, PRODASEN, relatório.
