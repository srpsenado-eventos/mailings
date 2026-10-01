# Auditoria de endereço (Camada D) e conferência de logradouro

Data: 2026-10-01
Situação: aprovado pelo Clovis em 2026-10-01

## O problema

O endereço é o campo que gera a etiqueta de correio, e é o único que o app **nunca** auditou. Site de tribunal não publica endereço, então a comparação com a fonte oficial devolve `fonte_nao_informa` em todos os contatos — resultado correto e inútil. A orientação do GT de 2026-07-20 manda confirmar endereço por telefone, "o mais completo possível", e o app não ajuda em nada nisso.

Chegaram duas exportações do Sistema Contatos que mudam o quadro:

- **`BASE GRUPOS POSSE`** — os 418 contatos do agrupador da Posse 2027, no mesmo esquema da planilha de contatos que o app já lê, agora com uma coluna `Id`. O endereço vem num texto só.
- **`BASE ENDERECO`** — 1.531 linhas com o endereço de todos os contatos do sistema, **já separado em campos** (`Logradouro`, `Numero`, `Complemento`, `Bairro`, `Cidade`, `UF`, `País`, `CEP`), com `Contato Id`, `Endereço Id` e uma marca `Prioritário` (Sim/Não).

## Medições de 2026-10-01

### As duas bases trazem o mesmo endereço

Montando o endereço a partir dos campos separados e comparando com o texto do cadastro, ignorando pontuação e acento:

| Resultado | Linhas |
|---|---|
| Idênticos | **396** |
| Diferentes | 16 |
| Sem texto no cadastro | 2 |

E os 16 "diferentes" **não eram divergência**: eram linhas cujo campo `CEP` tem número de dígitos errado, que o código de montagem não conseguiu formatar. Confrontar as duas bases, portanto, não produz achado nenhum — elas são a mesma informação em dois formatos. O valor da base de endereços está nos **campos separados** e no que eles revelam de defeito.

### A junção

| Chave | Casam | Ambíguos | Sem par |
|---|---|---|---|
| **`Id`** | **414 (99%)** | **0** | 4 |
| Nome normalizado | 388 (93%) | **26 (6%)** | 4 |

Os 26 ambíguos do casamento por nome são contatos cujo nome aparece em duas ou mais fichas do Contatos, com `Contato Id` diferentes. Pelo nome é impossível saber qual é qual, e atribuir o endereço de outra pessoa a uma autoridade é pior que não ter endereço: parece certo. O `Id` elimina isso.

Dos 37 contatos com mais de um endereço na base inteira, 7 estão no recorte da Posse, e **todos os 7 têm exatamente um endereço marcado `Prioritário = Sim`**.

### O campo CEP tem defeito sistemático

| Dígitos no CEP | Linhas | |
|---|---|---|
| 8 | 1.472 | correto |
| **7** | **31** | zero à esquerda perdido |
| 0 (vazio) | 22 | |
| 1, 5, 6, 9 | 6 | |

Os 31 de sete dígitos são todos de SP (`1049000`, `4531003`, `4606003` — isto é, `01049-000`, `04531-003`, `04606-003`): o campo foi exportado como número e o zero inicial caiu. É recuperável com segurança e verificável contra os Correios.

### Completude no recorte da Posse (418 contatos)

| Falta | Contatos | |
|---|---|---|
| Bairro | 123 (29%) | **sai do CEP** — o app completa |
| Complemento | 139 (33%) | não é defeito: muitos endereços não têm |
| CEP válido | 22 (5%) | 11 recuperáveis (sete dígitos) |
| Número | 15 (4%) | exige telefone |
| Linha de endereço | 4 (1%) | exige telefone |

Tirando o que é auto-completável e o complemento, a pendência real são **no máximo 30 contatos (7%)**: 15 sem número, 11 com CEP irrecuperável e 4 sem endereço, com alguma sobreposição entre eles.

### Volume de consulta

Uma varredura completa do agrupador precisa de **192 consultas de CEP distintas**, não 418 — CEP repete muito (Praça dos Três Poderes, Esplanada, anexos dos tribunais). Na base inteira são 449 CEPs distintos em 1.472 linhas válidas. É esse o número a informar a quem administra o contrato dos Correios.

## A decisão

### 1. Junção pelo `Id`, com recusa explícita no caso ambíguo

A planilha de endereços é **opcional**. Sem ela, o endereço continua `fonte_nao_informa`, exatamente como hoje.

A junção é por `Id` × `Contato Id`. Quando a planilha de contatos não trouxer `Id`, cai para nome normalizado — e **nome que casa mais de um `Contato Id` não recebe endereço**: sai como não verificado, com o motivo. Nunca se escolhe um dos candidatos.

Endereço múltiplo resolve por `Prioritário = Sim`. Nenhum marcado, ou mais de um marcado: pendência explícita, nunca escolha automática.

### 2. Camada D: três naturezas, não uma lista de campos vazios

A Camada D entra ao lado das três existentes (A coerência, B protocolo, C regras de escrita) e, como elas, **não depende do site**. O que a distingue é separar o que hoje se confundiria num balde de "endereço incompleto":

| Natureza | Casos | O que o app faz |
|---|---|---|
| **Completável pelo app** | bairro ausente (sai do CEP); CEP de sete dígitos com UF que confirma o zero | Completa e **declara que completou**. Não é pendência de ninguém. |
| **Pendência humana** | sem número, sem logradouro, CEP inválido irrecuperável, sem linha de endereço | Entra no contador "endereços a confirmar" |
| **Normal** | complemento ausente | Não é achado |

O bairro só é completado **depois** de o CEP ser confirmado pelos Correios — sem a conferência, bairro ausente fica como "a completar", não como preenchido.

### 3. Endereço fica fora do semáforo

Contador próprio, "endereços a confirmar". Um contato pode estar verde em nome, cargo, tratamento e endereçamento e ainda aparecer lá.

Razão: o amarelo hoje significa "o site ou a tabela de protocolo discordam do cadastro". Endereço incompleto não é discordância com fonte nenhuma — é trabalho de telefone pendente, com ritmo próprio e responsável próprio. Misturar as duas naturezas na mesma cor tornaria o amarelo inútil justamente quando o volume crescer.

`fonte_nao_informa` e `sem_regra` continuam não pintando amarelo. A situação de endereço é um eixo novo, não um valor novo de `SituacaoCampo`.

### 4. A conferência nos Correios roda em segunda etapa

Rota própria, chamada **depois** que o resultado já está na tela. Motivos: `/api/analise` tem teto de 60 s e já carrega a raspagem de até 33 sites; somar 192 consultas ali arriscaria derrubar a varredura inteira, inclusive a parte que não tem nada a ver com endereço.

- Consulta **por CEP distinto**, nunca por contato: 192 em vez de 418.
- Cache por CEP **durante a rodada**. Cache entre rodadas exigiria persistência, hoje proibida por spec; se valer a pena, é decisão própria.
- Concorrência limitada, para nunca martelar o serviço nem a cota do contrato.
- **Provedor injetado**, como a IA: sem chave, a etapa não roda e a tela diz que não rodou; em teste, fixture, sem rede.
- **Falha nunca vira veredito.** Correios fora do ar, timeout ou cota estourada produzem "não verificado", jamais "endereço errado". Mesma regra de ouro que já custou caro duas vezes neste projeto.

A chave dos Correios é de contrato do Senado Federal e vive **só** em `.env.local` (ou nas variáveis de ambiente do host). Nunca em spec, plano, commit, PR, comentário ou comando permitido do Claude Code. A chamada sai **do servidor**: nenhuma variável com prefixo `NEXT_PUBLIC_`, que o Next.js embute no pacote do navegador.

### 5. O que a conferência pode concluir

Apenas: **o CEP existe e logradouro, bairro e cidade batem.** Número, bloco, sala e destinatário os Correios não confirmam, e é exatamente onde a etiqueta erra. Esses seguem por telefone, como o GT determina.

A tela e o export dizem isso com essas palavras. Em nenhum lugar o app escreve "endereço confirmado".

### 6. Tela e planilha

Conforme o mockup aprovado em 2026-09-30 (`https://claude.ai/artifact/6HjpnkA5eS2Wd2DTfqv3u3`):

- A linha do contato mostra **estados**, não valores: etiquetas curtas por campo (nome, tratamento, endereçamento, cargo, endereço). Dez colunas de valores seriam ilegíveis.
- A ficha do contato abre com o par cadastro × referência de cada campo, **cada um dizendo de onde veio** (site do órgão, tabela de protocolo, base de endereços, Correios) e com a hora da consulta.
- O endereço tem bloco próprio, porque é o único campo com duas procedências ao mesmo tempo.
- A planilha baixada ganha o endereço **em colunas separadas** (logradouro, número, complemento, bairro, CEP, cidade, UF), mais a situação e o que foi completado. Serve para trabalhar, não só para ler.

### 7. Duas fases, dois planos

O escopo acima não entra numa tacada, e não precisa: a conferência nos Correios está bloqueada na autorização da chave, e todo o resto funciona sem ela.

| Fase | Entrega | Depende de |
|---|---|---|
| **1** | Junção pelo `Id`, Camada D (completável / pendência / normal), contador próprio, endereço na tela e em colunas no export, tudo sem rede | Nada — as duas planilhas já estão aqui |
| **2** | A rota de conferência, deduplicação por CEP, cache de rodada, provedor injetado, bairro completado e CEP recuperado **verificados** | Autorização e chave dos Correios |

Cada fase tem plano próprio. A Fase 1 já entrega valor sozinha: aponta os 30 contatos com pendência real, os 22 CEPs quebrados e os 4 sem endereço, e põe o endereço completo na tela e na planilha ao lado dos outros quatro campos. A Fase 2 não reabre nada da Fase 1 — ela preenche o provedor que a Fase 1 deixa injetado e vazio.

## O que não muda

- As Camadas 1, A, B e C, e a semântica dos vereditos da tabela do `CLAUDE.md`.
- A regra de ouro do "possível saída", em todos os caminhos.
- Parse no cliente: as duas planilhas são lidas no navegador; só texto viaja. Fotos nunca trafegam.
- **Sem PII no log nem no prompt.** O endereço passa a viajar no mesmo payload que já leva nome, telefone e e-mail, e como eles **nunca** vai para `console.*` nem para a Camada 2.
- Sem banco, sem persistência de resultado.
- Nenhuma URL ou chave entra por descoberta automática.

## Testes

Fixtures com os defeitos **medidos**, não inventados:

1. CEP de sete dígitos com UF SP → completável; o app declara o que completou.
2. CEP vazio → pendência humana.
3. Contato com dois endereços, um `Prioritário = Sim` → usa o prioritário.
4. Contato com dois endereços e nenhum prioritário → pendência, nunca escolha.
5. Contato sem linha de endereço na base → pendência.
6. Nome ambíguo, sem `Id` → não verificado, sem endereço atribuído.
7. Bairro ausente com CEP válido → "a completar" antes da conferência; completado depois dela.
8. Correios fora do ar → "não verificado"; nenhum contato muda de veredito.
9. Sem planilha de endereços → resultado idêntico ao de hoje, endereço `fonte_nao_informa`.
10. Sem chave dos Correios → a etapa não roda e a tela declara isso.

## Riscos

- **A chave é institucional.** Consulta sai registrada como do Senado e contra o contrato. A deduplicação por CEP existe tanto por eficiência quanto para não consumir cota alheia. Uso autorizado pendente de resposta de quem administra o contrato (pedido feito em 2026-09-30).
- **O zero à esquerda recuperado é inferência.** Só se aplica quando a UF confirma a faixa e o resultado é verificado contra os Correios. Sem conferência, continua pendência.
- **`Prioritário` pode mudar de semântica** numa exportação futura. Zero ou mais de um "Sim" é tratado como pendência, então a mudança aparece como achado em vez de virar escolha errada.
- **A base de endereços envelhece.** Ela é uma exportação, não uma consulta ao vivo; a hora da exportação deve aparecer na tela ao lado do endereço.

## Fora do escopo

- Validar número, bloco, sala e destinatário — os Correios não confirmam e o GT já resolve por telefone.
- Escrever de volta no Sistema Contatos. O app aponta e entrega o valor pronto para copiar.
- Cache de CEP entre rodadas (exigiria persistência).
- **Detecção exata de pessoa em mais de um grupo.** O `Id` agora permite: a varredura por nome de 2026-09-21 achou 8 pessoas em dois grupos, 3 delas escapando por grafia diferente. Tarefa curta e própria.
- Geração de etiqueta, cinta e cartão (material do Kit).
