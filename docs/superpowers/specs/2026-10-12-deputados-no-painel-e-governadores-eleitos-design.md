# Deputados Federais no painel e Governadores eleitos 2026

Data: 2026-10-12. Adendo ao spec `2026-10-05-eleitos-2026-e-ajustes-prodasen-design.md`. Substitui o §8 dele no item "Governadores eleitos (a planilha da pasta não os traz)" e o §5 no que diz respeito a onde aparecem os deputados. O resto do spec de 05/10 continua valendo.

## 1. O que motivou

O Clovis abriu o painel e não achou os deputados. O retrato de 05/10 guarda os 513 deputados em exercício (`eleicao.deputadosAtuais`) e os 567 eleitos, mas o painel só lista grupos que vêm do Contatos, e o grupo "Deputados Federais" ainda não existe lá. Os 513 não aparecem em lugar nenhum; dos eleitos, só os de mandato novo, numa seção recolhida no fim e só com a chave "Eleição 2026" ligada. Na web nem isso: o retrato publicado vai sem `deputadosAtuais`.

Em 07/10 apareceu `GT Posse/Eleitos 2026/Governadores Eleitos 2026.xlsx` (script `_script/governadores.py`, dados do TSE): 20 eleitos no 1º turno e 7 UFs no 2º turno, em 25/10.

## 2. Decisões (Clovis, 2026-10-12)

1. **Deputados Federais viram um grupo no painel**, na lista e no filtro por grupo, como Senadores. Montado na tela a partir do retrato (`eleicao.deputadosAtuais` e `eleicao.eleitos`), sem mexer na varredura. Funciona com o retrato de 05/10.
2. **Governadores eleitos entram no eixo Eleição 2026**, cruzados com o grupo Governadores do Contatos. Precisa de varredura nova.
3. **2º turno: só a UF pendente.** Uma linha por UF, "aguarda 2º turno (25/10)", com os dois candidatos só de leitura. Ninguém entra na lista a cadastrar até o resultado. Atualizar = rodar o script da pasta para o 2º turno e varrer de novo.
4. Nada disso pinta o semáforo, entra em `comparacoes`, `camposDivergentes` ou no resumo, nem cria `possivelSaida`.

## 3. Grupo "Deputados Federais" (só apresentação)

Função pura em `lib/painel-deputados.ts`:

```ts
interface LinhaDeputado {
  nome: string;          // nome parlamentar
  nomeCivil: string;
  uf: string;
  partido?: string;
  condicao?: string;     // Titular, Efetivado, Suplente
  etiquetas: Etiqueta[]; // da eleição
}
interface GrupoDeputados {
  titulo: "Deputados Federais";
  aviso: string;         // "Planilha da Câmara: o grupo ainda não está no Contatos"
  atuais: LinhaDeputado[];
  aCadastrar: EleitoClassificado[]; // camara, destino novo, !jaCadastrado
}
function grupoDeputados(eleicao: ResultadoEleicao | undefined, busca: string): GrupoDeputados | undefined
```

- Devolve `undefined` sem `deputadosAtuais` ou quando `camaraNoContatos` é verdadeiro (aí vale o grupo real do Contatos, já cruzado pelo código de 05/10).
- Ordem: UF, depois nome, como `localeCompare("pt-BR")`.
- **Etiqueta da eleição**, pela coluna `Eleição 2026 (resumo)` da planilha da Câmara (valores medidos em 05/10):

| `Eleição 2026 (resumo)` | Etiqueta | Tom |
|---|---|---|
| `Reeleito deputado federal` | Reeleito | ok |
| `Reeleito deputado federal (projeção)` | Reeleito + "Projeção — aguarda TSE" | ok + neutro |
| `Eleito senador` | Eleito senador — atenção (explicação: `ORIENTACAO_OUTRA_CASA`) | atenção |
| `Concorreu e não se elegeu / aguarda definição` | Não reeleito / aguarda definição | neutro |
| `Não concorreu em 2026` | Não concorreu | neutro |
| outro valor não vazio | o próprio texto | neutro |
| vazio | nenhuma | |

  Normalização por `normalizarTexto`. "Eleito governador — atenção" entra quando a pessoa casa um governador eleito com status "atual deputado federal" (§4).
- **Busca** casa nome parlamentar, nome civil, UF e partido (`normalizarTexto`), igual à das seções de eleitos.
- **Filtros**: o grupo aparece com o filtro "Tudo" e com a opção "Deputados Federais" do seletor de grupo. Some nos filtros de situação (Conferem, Divergência, Possível saída etc.), porque não houve auditoria. Com a chave "Eleição 2026" ligada, "Reeleitos" e "Eleitos para a outra Casa" também mostram os deputados com essas etiquetas.
- **Subseção "Deputados Federais Eleitos — a cadastrar (N)"** dentro do grupo, recolhida, com nome de urna, nome completo, UF, partido e gênero. Fica visível com a chave desligada. Com a chave ligada, a seção do fim do painel deixa de repetir os deputados (fica só a de senadores e a de "a conferir").
- **Componente** `components/grupo-deputados.tsx`, no mesmo visual dos outros grupos (cabeçalho recolhível com contagem, linhas sem detalhe expansível). Sem telefone, e-mail, prédio e sala na tela.
- **Contagem**: o cabeçalho do painel continua com o total do Contatos; o grupo mostra "513 deputados em exercício · N eleitos a cadastrar" no próprio cabeçalho.

## 4. Governadores eleitos

### 4.1 Leitura (`lib/planilha-eleitos.ts`)

`ArquivoEleicao` ganha `{ tipo: "governo"; eleitos: GovernadorPlanilha[]; segundoTurno: GovernadorPlanilha[] }`, reconhecido pela aba `Eleitos 1º turno` (normalizada). A aba `2º turno` é opcional (vazia depois do 2º turno). Colunas usadas, mesmas regras de cabeçalho e de coluna faltante dos outros arquivos: `UF`, `Nome de urna`, `Nome completo`, `Partido`, `Situação (TSE)`, `Status do mandato`, `Base do status`, `Gênero (TSE)`, `Vice na chapa`. Obrigatórias: `UF`, `Nome de urna`, `Nome completo`, `Situação (TSE)`, `Status do mandato`.

```ts
interface GovernadorPlanilha {
  uf: string; nomeUrna: string; nomeCompleto: string; partido?: string;
  situacaoTse: string; statusMandato: string; baseStatus?: string; genero?: string; vice?: string;
}
```

A mensagem de `PlanilhaEleicaoDesconhecidaError` passa a citar também a aba "Eleitos 1º turno". O passo 3 da Nova varredura aceita as quatro planilhas de uma vez, como hoje aceita três.

> **Adendo de 2026-10-24 (layout novo do gerador).** Em 24/10 o `governadores.py` passou a gravar a aba **"Eleitos"** (com a coluna **"Turno"**: "1º turno" ou "2º turno") no lugar de "Eleitos 1º turno", e a aba **"2º turno"** com as colunas do 1º turno sufixadas ("Situação (TSE) (1º turno)") e as do 2º turno no fim ("Situação (TSE) 2º turno"), continuando a listar os dois candidatos de cada UF mesmo depois de o eleito entrar em "Eleitos". O leitor lê os dois layouts (decisão do Clovis): governadores são reconhecidos pela aba "Eleitos 1º turno" **ou** pela aba "Eleitos" cujo cabeçalho tem "Turno" (a aba "Eleitos" do Senado e da Câmara não tem essa coluna); na aba "2º turno" a situação vem da primeira coluna presente entre "Situação (TSE) 2º turno", "Situação (TSE) (1º turno)" e "Situação (TSE)"; e `segundoTurno` traz só as linhas de UF **sem eleito** na aba "Eleitos", de modo que, depois de 25/10, a UF decidida sai da lista de pendentes sem mudança no restante do app. Na mesma correção, dois arquivos reconhecidos como o mesmo tipo numa mesma seleção do passo 3 não entram (nenhum dos dois) e a tela diz quais foram e como foram lidos (`separarColisoesDeTipo`), em vez de um esconder o outro; e a área tracejada dos três passos aceita arrastar e soltar (`lib/arquivos-soltos.ts`).

### 4.2 Classificação (`lib/eleitos-governo.ts`, puro)

`classificarGovernadores(eleitos, grupos, deputadosAtuais?) → GovernadorClassificado[]`, com `destino: "reeleito" | "outro_cargo" | "novo" | "conferir"`, `motivo?`, `contatos: ContatoDoEleito[]` e `jaCadastrado?`.

Grupos candidatos: Governadores (nome do grupo normalizado começa com "governador", sem "eleit" e sem "ex-"), "Governadores Eleitos" (contém "governador" e "eleit"), e os de Senadores e Deputados Federais já reconhecidos por `casaDoGrupo`. Casamento por pessoa igual ao dos eleitos (`casaPessoa`: UF do `Departamento` como guarda, nome igual ou `pontuarPessoa >= 1`); várias pessoas casadas = `conferir` com `MOTIVO_AMBIGUO`.

| `Status do mandato` (normalizado) | Destino | Onde procura | Sem achar |
|---|---|---|---|
| `reeleicao` | reeleito | Governadores | conferir: "não está no grupo Governadores do Contatos" |
| `mandato novo` | novo; `jaCadastrado` se está em "Governadores Eleitos" | — | se está em Governadores: conferir (contradição) |
| `mandato novo (atual senador)` | outro_cargo | Senadores | conferir |
| `mandato novo (atual deputado federal)` | outro_cargo | Deputados Federais do Contatos; sem o grupo, a planilha de deputados atuais (nome civil ou parlamentar + UF) | conferir |
| `mandato novo (vice-governador atual)` | conferir, motivo = `Base do status` | Governadores (se achar, a linha leva a etiqueta) | conferir |
| `mandato novo (governador de outra uf)` e qualquer outro | conferir: "Status do mandato não previsto" | — | — |

Funções de casamento (`casaPessoa`, `chavePessoa`, `referencia`, `constaEntreAtuais`) passam a ser exportadas de `lib/eleitos.ts` em vez de duplicadas.

### 4.3 No retrato e nas linhas

- `ResultadoEleicao` ganha `governadores?: { eleitos: GovernadorClassificado[]; segundoTurno: UfSegundoTurno[] }`, com `UfSegundoTurno = { uf: string; candidatos: { nomeUrna: string; partido?: string; statusMandato: string }[] }`, agrupado por UF na ordem alfabética.
- `ResultadoContato` ganha `eleicaoGoverno?: EleicaoGovernoContato` (`destino`, `uf`, `partido?`, `situacaoTse`, `statusMandato`, `baseStatus?`, `nomeUrna`, `motivo?`), anexado por `aplicarEleicao` às linhas casadas (Governadores, Senadores, Deputados Federais), na mesma passada posterior. Campo separado de `eleicao` para não alargar `CasaLegislativa`, que o cadastro em lote do PRODASEN (§6.1 de 05/10) vai usar.
- Deputado atual (grupo virtual, §3) casado com um governador `outro_cargo` leva "Eleito governador — atenção". A ligação é guardada em `GovernadorClassificado.deputadoAtual?: { uf: string; nomeParlamentar: string }`.
- `aplicarEleicao` passa a aceitar governadores sem senadores e deputados (e vice-versa): qualquer subconjunto das quatro planilhas forma a eleição.

### 4.4 Painel

- Etiquetas na linha (`lib/painel-eleicao.ts`): reeleito → "Reeleito governador" (ok); outro_cargo → "Eleito governador — atenção" (atenção, explicação `ORIENTACAO_OUTRA_CASA`, borda âmbar como `outra_casa`); conferir → "Governo: a conferir" (atenção, explicação = motivo). Bloco "Eleição 2026 — governo" no detalhe, como o de 05/10.
- Seções no fim, com a chave ligada: **"Governadores Eleitos — a cadastrar (N)"** (nome de urna, nome completo, UF, partido, gênero, vice), **"Governadores — aguarda 2º turno, 25/10 (N UFs)"** (UF e os dois candidatos com partido e status) e os governadores `conferir` dentro de **"Eleitos — a conferir"**, com o motivo.
- Filtros da chave: "Reeleitos" e "Eleitos para outro cargo" (renomeia "Eleitos para a outra Casa") incluem governadores; "A cadastrar" e "A conferir" incluem as seções de governadores.
- Export "Eleitos 2026 (.xlsx)": abas novas `Governadores` (todos os eleitos do 1º turno com destino e motivo) e `Governadores 2º turno`.

## 5. Web

- Os dados dos governadores são públicos (TSE) e vão no retrato publicado.
- `lib/publicar.ts` deixa de cortar `deputadosAtuais` inteiro: publica cada deputado **sem `email`, `telefone`, `predio` e `sala`**. Assim o grupo Deputados Federais aparece também na web. Teste em `tests/publicar.test.ts`.

## 6. Fora do escopo

- Cadastro em lote de deputados e governadores (D2 §6.1 continua pendente, agora incluindo "Governadores Eleitos").
- Resultado do 2º turno: entra rodando `governadores.py` com o código da eleição do 2º turno e varrendo de novo; o leitor já aceita a aba `2º turno` vazia.
- Auditoria de nome e cargo dos deputados contra o site da Câmara (a fonte `camara.leg.br/deputados/quem-sao` segue candidata ao catálogo).

## 7. Validação

- Testes com dados fictícios: cada linha das tabelas dos §3 e §4.2, planilha de governadores montada em memória (com e sem aba de 2º turno, coluna faltante), retrato sem eleição, retrato de 05/10 sem governadores, `camaraNoContatos` verdadeiro escondendo o grupo virtual, publicação sem e-mail e telefone dos deputados.
- Antes do PR, script local (fora do repositório) lê `Governadores Eleitos 2026.xlsx` pelo código do app e confere 20 eleitos e 7 UFs no 2º turno, e conta as etiquetas do grupo de deputados no retrato de 05/10 contra a coluna `Eleição 2026 (resumo)` (224 + 76 reeleitos, 18 eleitos senador, 182 não reeleitos, 13 não concorreram).
- Depois do deploy, varredura nova com as quatro planilhas, publicação e conferência na web: grupo Deputados Federais visível, seções dos governadores com a chave ligada, nenhum e-mail ou telefone no HTML.
