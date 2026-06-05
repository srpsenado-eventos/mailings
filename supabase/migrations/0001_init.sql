create table public.grupos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  descricao   text,
  created_at  timestamptz not null default now()
);

create table public.orgaos (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  nome        text not null,
  descricao   text,
  created_at  timestamptz not null default now(),
  unique (grupo_id, nome)
);

create table public.fontes (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  url         text not null,
  tipo        text not null default 'lista_autoridades',
  descricao   text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (grupo_id, url)
);

create index fontes_grupo_id_ativo_idx on public.fontes (grupo_id) where ativo;
