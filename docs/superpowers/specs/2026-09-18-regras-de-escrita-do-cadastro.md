# Regras de escrita do cadastro (Camada C)

Data: 2026-09-18
Situação: aprovado pelo Clovis em 2026-09-18, escopo inicial STM

## O problema

O STM publica os ministros com "Dr." e "Dra." antes do nome. O e-mail do GT Gestão de Convidados de 2026-07-20 manda **retirar** esses tratamentos de todos os contatos do STM: o convite, o cartão e a cinta saem do campo `Nome`, e nenhum deles leva tratamento acadêmico.

Hoje o app não acusa nada nesses casos. A comparação de nome passa por `normalizarNome`, que remove tratamento dos dois lados antes de comparar, então um ministro cadastrado com "Dr." (ou "Dra.") casa com o mesmo nome, também com "Dr.", publicado no site, e o veredito sai verde. Medido em 2026-09-17 contra a planilha real: dos 15 contatos do STM, **5 trazem "Dr." ou "Dra." no cadastro** e 14 estavam verdes. Nenhum outro grupo da base tem ocorrência.

Esse comportamento da comparação de nome está certo e não muda: se o cadastro for corrigido e o site continuar com "Dr.", os dois têm que continuar casando. O que falta é outra coisa.

## A decisão

Entra um terceiro eixo de auditoria, aqui chamado **Camada C: regras de escrita do cadastro**.

As duas camadas existentes confrontam o cadastro com uma referência externa: a Camada 1 com a lista publicada no site, a Camada B com a tabela de protocolo. A Camada C não tem referência externa. Ela verifica se o campo foi **escrito** como o GT determinou, e por isso pode contrariar o site de propósito. É o caso aqui: o site traz "Dr.", e o cadastro não pode trazer.

### Escopo inicial

Uma regra só, um grupo só:

| Grupo | Regra | Origem |
|---|---|---|
| Ministros do STM | O campo `Nome` não leva "Dr.", "Dra.", "Doutor" nem "Doutora" | E-mail do GT de 2026-07-20 |

**Só tratamento acadêmico, e só no STM.** O GT determinou isso para o STM e não se pronunciou sobre os demais grupos. Ampliar por conta própria arriscaria apagar patente que é parte do nome parlamentar, como "Coronel Tadeu Silva", armadilha já registrada no `CLAUDE.md`. Outras regras do mesmo e-mail (nome parlamentar dos senadores, partes em negrito do STJ) ficam de fora deste spec: dependem de casar com o site, não de reescrever o cadastro, e por isso são de outra natureza.

### Onde a regra mora

Em `data/regras-nome.ts`, no mesmo padrão de `data/cargos-tratamento.ts`: um mapa de grupo canônico para regras, versionado, comentado, e alterado só por decisão do Clovis. Não entra em `data/catalogo.ts` para não colidir com a reescrita daquele arquivo prevista na Task 2 do plano da varredura.

### Como aparece

- **Veredito:** amarelo. Há o que corrigir no cadastro, e não é caso de saída. Os 5 contatos do STM que hoje saem verdes passam a amarelo.
- **Comparação:** uma `ComparacaoCampo` no campo `nome`, `situacao: "divergente"`, `origemValor: "coerencia"`, com um `achado` novo. Reaproveita a maquinaria da Camada A, que já é o lugar dos achados sobre o próprio cadastro.
- **Export e tela:** coluna `Coerência`, junto dos demais achados, com o nome já corrigido entre parênteses para o usuário poder copiar.
- **O par `Nome (planilha)` × `Nome (site)` não muda.** Ele continua mostrando o que o cadastro e o site dizem, e continua casando. A correção pedida não é "o site diz outra coisa", é "o cadastro não pode dizer isso".

### O que não muda

- `normalizarNome` continua removendo tratamento antes de comparar. Sem isso, corrigir o cadastro criaria uma divergência falsa contra o site.
- Nenhum achado da Camada C vira "possível saída", em nenhum caminho.
- `sem_regra` e `fonte_nao_informa` seguem fora de `camposDivergentes`.

## Custo se estiver errado

Se o cerimonial decidir que o "Dr." deve ficar no cadastro do STM, são 5 contatos marcados em amarelo sem necessidade, e a correção é apagar uma linha de `data/regras-nome.ts`. Nenhum contato muda de status por outro motivo, e nenhuma comparação existente é afetada.
