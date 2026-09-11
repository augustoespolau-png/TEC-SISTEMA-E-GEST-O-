-- ============================================================
-- Tecverde · Registro de Erros — 001: schema
-- Rodar no Supabase: SQL Editor → New query → colar → Run
-- ============================================================

-- Enums
create type user_role as enum ('operador', 'consultor', 'gestao');
create type criticidade_t as enum ('CRITICO', 'MEDIO', 'BAIXO');
create type status_t as enum ('AGUARDANDO', 'RETRABALHO', 'BLOQUEADA', 'OK');

-- ------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  role user_role not null default 'consultor',
  created_at timestamptz not null default now()
);

-- Cria o profile automaticamente quando um usuário é criado no Auth
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Tabelas de configuração (listas do formulário)
-- "Remover" = ativo -> false (soft delete): histórico nunca se perde
-- ------------------------------------------------------------
create table public.projetos (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0
);

create table public.paredes (
  id bigint generated always as identity primary key,
  projeto_id bigint not null references public.projetos(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  ordem int not null default 0,
  unique (projeto_id, nome)
);

create table public.setores (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0
);

create table public.tipos_erro (
  id bigint generated always as identity primary key,
  nome text not null unique,
  ativo boolean not null default true,
  ordem int not null default 0
);

-- ------------------------------------------------------------
-- Ocorrências (registros de erro)
-- Dimensões gravadas como TEXTO (snapshot no momento do registro):
-- preserva o histórico quando listas mudam e aceita "OUTRO" livre.
-- ------------------------------------------------------------
create table public.ocorrencias (
  id bigint generated always as identity primary key,
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  projeto text not null,
  parede text not null,
  casa text not null,
  setor text not null,
  tipo_erro text not null,
  ocorrencia text not null,
  criticidade criticidade_t not null,
  status status_t not null default 'AGUARDANDO',
  observacao text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz
);

create index idx_oco_status on public.ocorrencias (status);
create index idx_oco_casa on public.ocorrencias (casa);
create index idx_oco_data on public.ocorrencias (data desc);
create index idx_oco_created_at on public.ocorrencias (created_at desc);
create index idx_paredes_projeto on public.paredes (projeto_id);

-- ------------------------------------------------------------
-- Papel do usuário logado (security definer evita recursão de RLS)
-- ------------------------------------------------------------
create function public.get_my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ------------------------------------------------------------
-- Guarda de ocorrências:
--  - preenche auditoria no servidor (cliente não controla)
--  - em UPDATE de quem não é gestão, só status e observacao mudam
-- ------------------------------------------------------------
create function public.ocorrencias_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := null;
    new.updated_at := null;
  else
    if public.get_my_role() is distinct from 'gestao' then
      new.data := old.data;
      new.projeto := old.projeto;
      new.parede := old.parede;
      new.casa := old.casa;
      new.setor := old.setor;
      new.tipo_erro := old.tipo_erro;
      new.ocorrencia := old.ocorrencia;
      new.criticidade := old.criticidade;
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger trg_ocorrencias_guard
  before insert or update on public.ocorrencias
  for each row execute function public.ocorrencias_guard();
