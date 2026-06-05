-- Responsáveis internos por grupo (equipe do Cerimonial que mantém cada lista).
-- Decisão: colunas em `grupos`, não tabela nova — preserva a regra das 3 tabelas
-- (grupos, orgaos, fontes). Ver docs/superpowers/specs/2026-06-05-responsaveis-por-grupo.md
alter table public.grupos add column if not exists responsavel_1  text;
alter table public.grupos add column if not exists responsavel_2  text;
alter table public.grupos add column if not exists backup         text;
alter table public.grupos add column if not exists email_resp_1   text;
alter table public.grupos add column if not exists email_resp_2   text;
alter table public.grupos add column if not exists email_backup   text;
