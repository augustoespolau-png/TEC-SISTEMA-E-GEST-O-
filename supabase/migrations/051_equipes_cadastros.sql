-- ============================================================
-- Tecverde · 051: equipes do cadastro e seus usuários
--
-- A migration 050 criou as tabelas internas de governança. Esta migration
-- expõe o cadastro de equipes com nomes de domínio mais simples e acrescenta
-- descrição e projeto opcional para a tela nativa de Cadastros.
--
-- projeto_id é texto de propósito: a aplicação aceita tanto o identificador
-- canônico do catálogo produto_* quanto o identificador legado exposto pela
-- view public.projetos.
-- ============================================================

create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null default '',
  projeto_id text,
  codigo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint equipes_nome_ck check (length(trim(nome)) > 0),
  constraint equipes_descricao_ck check (length(descricao) <= 5000),
  constraint equipes_projeto_id_ck check (projeto_id is null or length(trim(projeto_id)) > 0)
);

alter table public.equipes
  add column if not exists descricao text not null default '';
alter table public.equipes
  add column if not exists projeto_id text;
alter table public.equipes
  add column if not exists codigo text;
alter table public.equipes
  add column if not exists ativo boolean not null default true;
alter table public.equipes
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists equipes_nome_lower_uk
  on public.equipes (lower(trim(nome)));

create index if not exists equipes_projeto_id_idx
  on public.equipes (projeto_id)
  where projeto_id is not null;

create table if not exists public.usuario_equipes (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (equipe_id, usuario_id)
);

create index if not exists usuario_equipes_usuario_id_idx
  on public.usuario_equipes (usuario_id);

create index if not exists usuario_equipes_equipe_id_idx
  on public.usuario_equipes (equipe_id);

drop trigger if exists equipes_updated_at on public.equipes;
create trigger equipes_updated_at
  before update on public.equipes
  for each row execute function private.governanca_set_updated_at();

alter table public.equipes enable row level security;
alter table public.usuario_equipes enable row level security;

drop policy if exists equipes_select_authenticated on public.equipes;
create policy equipes_select_authenticated
  on public.equipes for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists equipes_insert_gestao on public.equipes;
create policy equipes_insert_gestao
  on public.equipes for insert
  to authenticated
  with check ((select public.governanca_is_gestao()));

drop policy if exists equipes_update_gestao on public.equipes;
create policy equipes_update_gestao
  on public.equipes for update
  to authenticated
  using ((select public.governanca_is_gestao()))
  with check ((select public.governanca_is_gestao()));

drop policy if exists equipes_delete_gestao on public.equipes;
create policy equipes_delete_gestao
  on public.equipes for delete
  to authenticated
  using ((select public.governanca_is_gestao()));

drop policy if exists usuario_equipes_select_authenticated on public.usuario_equipes;
create policy usuario_equipes_select_authenticated
  on public.usuario_equipes for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists usuario_equipes_insert_gestao on public.usuario_equipes;
create policy usuario_equipes_insert_gestao
  on public.usuario_equipes for insert
  to authenticated
  with check ((select public.governanca_is_gestao()));

drop policy if exists usuario_equipes_update_gestao on public.usuario_equipes;
create policy usuario_equipes_update_gestao
  on public.usuario_equipes for update
  to authenticated
  using ((select public.governanca_is_gestao()))
  with check ((select public.governanca_is_gestao()));

drop policy if exists usuario_equipes_delete_gestao on public.usuario_equipes;
create policy usuario_equipes_delete_gestao
  on public.usuario_equipes for delete
  to authenticated
  using ((select public.governanca_is_gestao()));

grant select, insert, update, delete on public.equipes to authenticated;
grant select, insert, update, delete on public.usuario_equipes to authenticated;

-- Migra equipes já cadastradas na primeira versão para não perder dados.
insert into public.equipes (
  id, nome, descricao, projeto_id, codigo, ativo, created_at
)
select
  ge.id,
  ge.nome,
  '',
  null,
  ge.codigo,
  ge.ativo,
  ge.created_at
from public.governanca_equipes ge
on conflict (id) do nothing;

insert into public.usuario_equipes (equipe_id, usuario_id, created_at)
select gem.equipe_id, gem.usuario_id, gem.created_at
from public.governanca_equipe_membros gem
on conflict (equipe_id, usuario_id) do nothing;

comment on table public.equipes is
  'Cadastro de equipes administrado pela Gestão dentro da aplicação.';
comment on table public.usuario_equipes is
  'Relacionamento muitos-para-muitos entre usuários e equipes.';
