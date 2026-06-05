# Responsáveis por grupo — decisão de schema (2026-06-05)

## Contexto

A planilha interna `Organização Contatos - 2026.xlsx` (aba *Sistema contatos -
Controle*) define, por grupo, a equipe do Cerimonial responsável por manter a
lista: **Responsável 1**, **Responsável 2** e **Backup de ausências**, cada um
com e-mail institucional `@senado.leg.br`. O Clovis pediu explicitamente o
"cadastro dos grupos com os seus devidos responsáveis".

## Decisão

Armazenar os responsáveis como **colunas na tabela `grupos`**, não em uma tabela
nova:

```
responsavel_1, responsavel_2, backup,
email_resp_1, email_resp_2, email_backup   (todas text, nullable)
```

Migration: `supabase/migrations/0002_grupos_responsaveis.sql`.

## Justificativa

- **Preserva a regra das 3 tabelas** (`grupos`, `orgaos`, `fontes`) fixada no
  CLAUDE.md e em `project_decisoes_arquiteturais`. Adicionar colunas não cria
  tabela nova.
- **Cardinalidade baixa e estável**: são sempre 3 papéis por grupo (titular,
  suplente, backup). Não há necessidade de relação N:N nem de histórico.
- **Leitura simples**: a tela de visualização lê o grupo e já tem o responsável,
  sem join.
- A normalização (tabela `responsaveis` + junção) seria over-engineering para o
  MVP single-user (YAGNI). Pode ser revisitada se surgir necessidade de gerir
  pessoas como entidade própria.

## Escopo de PII

Os responsáveis são **servidores internos do Senado** (a própria equipe), não as
autoridades-alvo do mailing. A regra de PII do projeto protege os dados das
**autoridades** (nomes/telefones/e-mails que vêm do Sistema Contatos e nunca vão
a log/Gemini). Nome e e-mail institucional da equipe interna são metadados
operacionais de propriedade do grupo e podem ser persistidos.

## Origem das fontes (URLs oficiais)

A mesma aba traz a coluna **Link Site**. Onde há URL `http(s)` válida, ela é
semeada em `fontes` (URL oficial primária da 1ª etapa). Valores que são texto
livre ("Atual - ...", "Biografia ... — Planalto"), "-" ou vazios **não** geram
fonte — o grupo fica legitimamente "sem fonte" até o Clovis cadastrar a URL.
Isso mantém a regra de **cadastro manual de URLs** (nenhuma URL é descoberta
automaticamente).
