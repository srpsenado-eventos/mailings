# Segunda fonte por grupo: senadores fora de exercício

Data: 2026-09-24
Situação: aprovado pelo Clovis em 2026-09-24

## O problema

O grupo Senadores é fiscalizado contra uma página só, `www25.senado.leg.br/web/senadores/em-exercicio`, cadastrada nos três grupos de faixa de estado. Quem tem mandato mas está afastado não aparece nessa lista: o titular que virou ministro, o licenciado com convocação de suplente. Pela semântica vigente, cada um deles sai **vermelho, possível saída** — e não saiu nada. São senadores, precisam estar na lista de conferência, e o Senado publica quem são em `www25.senado.leg.br/web/senadores/fora-de-exercicio`.

O inverso também falta: hoje o app não avisa quando alguém que deveria estar no grupo não está no cadastro.

### Medições de 2026-09-24

Contra as duas páginas reais, com o scrape do projeto:

| Medição | Resultado |
|---|---|
| `fetch` simples nas duas páginas | HTTP 200, HTML puro, tabela estruturada — nenhuma depende da Camada 2 |
| Pessoas que o extrator atual traz da em-exercício | 77, sendo uma delas o rótulo "Correio Eletrônico" |
| Senadores em exercício na tabela da página | 81 |
| **Senadores perdidos pelo extrator atual** | **5: Weverton (MA), Cleitinho (MG), Romário (RJ), Giordano (SP), Irajá (TO)** |
| Pessoas que o extrator atual traz da fora-de-exercício | 43, misturando as quatro seções da página |
| Pessoas com cargo publicado, nas duas páginas | nenhuma (fora um falso positivo) |

Dois defeitos aparecem aí, além da ausência da segunda fonte:

1. **Nome de uma palavra some.** Os cinco perdidos são exatamente os senadores cujo nome parlamentar é uma palavra só. O extrator trabalha sobre o texto achatado da página e descarta linha curta sem sobrenome. Se esses cinco estão no Contatos, hoje saem como possível saída — falso, e da mesma família do defeito do TCU.
2. **O grupo nunca propõe inclusão.** "Novo" exige pessoa com cargo, e nenhuma das duas páginas publica cargo. Somar a segunda fonte sem mexer nisso não responderia "há senador fora de exercício que precise entrar no grupo?".

### O que a página de fora de exercício lista

Duas tabelas, quatro seções, gente de natureza bem diferente (contagem de 2026-09-24):

| Seção | Qtde | Quem são | Entra na composição? |
|---|---|---|---|
| Assunção de cargo conforme RISF Art. 39, II | 2 | Titulares que viraram ministro/secretário | **Sim** |
| Licença com convocação de suplente (superior a 120 dias) | 2 | Titulares licenciados | **Sim** |
| Suplentes que exerceram o cargo | 33 | Ex-suplentes, motivo "Retorno do titular" | Não |
| Falecimento, perda de mandato, renúncia (2ª tabela) | 8 | Não são mais senadores (inclui Flávio Dino, hoje no STF) | Não |

Cadastrar a URL como está hoje jogaria as 45 pessoas na composição do grupo, incluindo falecidos e renunciantes. Os suplentes ficam de fora por decisão do GT ("suplentes não são convidados", e-mail de 2026-07-20); os afastamentos definitivos, porque a pessoa deixou de ser senadora.

## A decisão

### 1. Fontes múltiplas viram recurso do catálogo

`fontes` deixa de ser "lista da qual se usa a primeira ativa" e passa a ser o que o nome diz: **todas as fontes ativas compõem o grupo**, na ordem do array. A primeira ativa continua sendo a primária — é a que vai em `ResultadoGrupo.fonteUrl` e a que alimenta o texto da Camada 2.

Nenhum dos 33 grupos de hoje tem mais de uma fonte (21 fontes no total, 3 delas nos grupos de Senadores), então a mudança não altera o veredito de nenhum outro grupo. O recurso já tem fila: convocados do TST e deputados em exercício, listados no `CLAUDE.md` como fontes a cadastrar.

`FonteCatalogo` ganha três campos opcionais:

```ts
export interface FonteCatalogo {
  url: string;
  ativo: boolean;
  /** Nota curta no veredito de quem casar por esta fonte ("fora de exercício"). */
  rotulo?: string;
  /** Extração estruturada: a página é uma tabela-lista. Ver seção 2. */
  tabela?: ExtracaoTabela;
  /** Pessoas não casadas desta fonte viram "novo". Padrão: false. */
  propoeInclusao?: boolean;
}
```

E `GrupoCatalogo` ganha a faixa de estados, que hoje só existe implícita no nome do grupo:

```ts
  /** UFs que pertencem ao grupo. Filtra apenas as propostas de inclusão. */
  ufs?: readonly string[];
```

| Grupo | `ufs` |
|---|---|
| Senadores (Acre a Goiás) | AC, AL, AP, AM, BA, CE, DF, ES, GO |
| Senadores (Maranhão ao Piauí) | MA, MT, MS, MG, PA, PB, PR, PE, PI |
| Senadores (Rio a Tocantins) | RJ, RN, RS, RO, RR, SC, SP, SE, TO |

São as 27 UFs em ordem alfabética **por nome do estado**, lidas dos rótulos dos grupos. Cadastro, não dedução em tempo de execução.

### 2. Extração estruturada de tabela

Quando a fonte declara `tabela`, `lib/scrape.ts` lê a página linha a linha em vez de achatar o texto:

```ts
export interface ExtracaoTabela {
  /** Índice da tabela na página (0-based). Padrão: 0. */
  indice?: number;
  /** Índice da coluna, 0-based. */
  colunas: { nome: number; uf?: number; motivo?: number };
  /** Só estas seções entram. Casamento normalizado, por prefixo. Vazio = todas. */
  secoes?: readonly string[];
}
```

Uma linha com `colspan` e texto em `<strong>` é cabeçalho de seção e passa a valer para as linhas seguintes. Cada linha de dados vira uma pessoa com nome, UF e motivo — o motivo vai para `contexto` e aparece na nota do veredito.

Isso resolve os três problemas de extração de uma vez: as seções indesejadas nem chegam à composição, os nomes de uma palavra voltam (a célula é o nome, não há heurística de sobrenome), e o rótulo "Correio Eletrônico" some junto com o `<th>`.

A extração de texto de hoje continua o caminho padrão, intacta, para as outras 18 fontes.

**Cadastro resultante dos três grupos de Senadores** (o mesmo par de fontes nos três):

```ts
fontes: [
  { url: "https://www25.senado.leg.br/web/senadores/em-exercicio", ativo: true,
    tabela: { colunas: { nome: 0, uf: 2 } } },
  { url: "https://www25.senado.leg.br/web/senadores/fora-de-exercicio", ativo: true,
    rotulo: "fora de exercício", propoeInclusao: true,
    tabela: { colunas: { nome: 0, uf: 2, motivo: 3 },
              secoes: ["Assunção de cargo", "Licença com convocação de suplente"] } },
]
```

A em-exercício ganha `tabela` pela qualidade da composição (81 de 81), mas **não** ganha `propoeInclusao`: ela lista também os suplentes convocados, que o GT não convida. Se um dia o GT quiser propostas de inclusão pela lista principal, é uma linha no cadastro.

### 3. Composição, veredito e inclusão

`resolverGrupoEFonte` passa a devolver todas as fontes ativas do grupo (e a faixa de UF). `lib/analise.ts` raspa cada uma em paralelo, aplica a extração declarada e mescla numa composição só, cada pessoa carregando a fonte de onde veio (`PessoaSite` ganha `rotuloFonte?` e `fonteUrl?`). Daí:

- **Casou com pessoa de fonte com `rotulo`** → veredito normal, verde ou amarelo conforme os campos, com `observacao: "fora de exercício — <motivo>"` na tela e no export. Nunca possível saída: ele é senador, o cadastro está certo, a fiscalização só informa a situação.
- **Não casou com ninguém, em nenhuma fonte** → segue vermelho, possível saída.
- **Novos** = pessoas não casadas, **só das fontes com `propoeInclusao`**, e só as cuja UF está na faixa do grupo. Para essas fontes cai a exigência de cargo: numa tabela-lista toda linha é pessoa, e a exigência de cargo existia para cortar item de menu do texto achatado.
- **Filtro de UF vale só para inclusão.** Para casar contato existente, a composição inteira continua valendo. Um contato arquivado na faixa errada não pode virar "saída" por causa de convenção de arquivo.
- **Regra de ouro intacta.** Se nenhuma fonte for legível, o grupo é indeterminado, nunca saída. Se uma das duas cair, o grupo é comparado com a que sobrou e o motivo técnico da que falhou aparece em `erroFonte`. Ler uma das fontes conta como ter composição real.
- **Camada 2 não muda:** uma chamada por grupo, sobre o texto limpo da fonte primária, sem contato da planilha no prompt.

## O que não muda

- Semântica dos vereditos, tabela do `CLAUDE.md`, inclusive `fonte_nao_informa` para telefone e e-mail.
- Comparação de cargo por papel: as duas páginas não publicam cargo, então cargo de senador segue `fonte_nao_informa`.
- Camadas A, B e C (coerência, protocolo, regras de escrita) — não dependem do site e valem em todos os caminhos.
- Nenhuma URL entra por descoberta automática. As duas foram fornecidas pelo Clovis.
- Sem banco, sem persistência, scraping com `fetch` + cheerio.

## Testes

Fixtures anonimizáveis das duas páginas em `tests/fixtures/`, recortadas com as quatro seções representadas.

Regressão obrigatória:

1. Weverton (nome de uma palavra) casa e **não** é possível saída.
2. Titular afastado casa pela fonte secundária, sai verde e carrega a nota do motivo.
3. Falecido, renunciante e suplente com "Retorno do titular" **nunca** viram "novo" nem entram na composição.
4. Titular afastado ausente da planilha vira "novo" só no grupo da UF dele.
5. As duas fontes inacessíveis → todos os contatos indeterminados, nenhuma saída.
6. Uma fonte cai e a outra responde → compara com a que sobrou, `erroFonte` preenchido.
7. Grupo com uma fonte só (os 18 demais grupos com fonte) → resultado idêntico ao de hoje.

## Riscos

- **A página muda de estrutura.** O cadastro aponta índices de coluna e nomes de seção; se o Senado reorganizar a tabela, a extração devolve vazio e o grupo cai para indeterminado — nunca para saída falsa. O teste de fixture flagra na primeira rodada após a mudança.
- **Seção nova na página.** Uma seção que o Senado crie e não esteja em `secoes` fica de fora por padrão. É a escolha conservadora: não inventar senador.
- **Faixa de UF errada no cadastro.** Roteia proposta de inclusão para o grupo errado; não produz veredito falso para contato existente, porque o filtro não toca a composição.

## Fora do escopo

- Propostas de inclusão pela lista em exercício (exigiria distinguir titular de suplente convocado, que a página não informa).
- Nome parlamentar dos senadores e partes em negrito do STJ (e-mail do GT de 2026-07-20) — dependem de casar com o site e são de outra natureza.
- Os demais cadastros pendentes do `CLAUDE.md` (PGR, deputados, convocados do TST, OAB), que passam a poder usar este recurso.
