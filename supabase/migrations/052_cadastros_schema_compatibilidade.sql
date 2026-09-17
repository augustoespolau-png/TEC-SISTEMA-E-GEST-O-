-- Tecverde · 052: compatibilidade da governança com o schema já existente
--
-- O projeto Supabase em produção já possui a governança criada por uma
-- versão anterior da aplicação (`equipes`, `equipe_membros` e
-- `perfis_acesso`). Esta migration acrescenta somente a superfície que a
-- aplicação atual usa, preserva os dados existentes e mantém RLS.

begin;

create schema if not exists private;

create or replace function private.governanca_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$function$;

-- Normaliza a função de autorização entre as duas gerações de governança.
create or replace function public.cadastros_is_gestao()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $function$
declare
  resultado boolean := false;
begin
  if to_regprocedure('public.tecverde_is_gestao()') is not null then
    execute 'select public.tecverde_is_gestao()' into resultado;
    return coalesce(resultado, false);
  end if;

  if to_regprocedure('public.governanca_is_gestao()') is not null then
    execute 'select public.governanca_is_gestao()' into resultado;
    return coalesce(resultado, false);
  end if;

  return false;
end
$function$;

revoke all on function public.cadastros_is_gestao() from public, anon;
grant execute on function public.cadastros_is_gestao() to authenticated, service_role;

-- Complementa a tabela de equipes existente com os campos da interface atual.
alter table if exists public.equipes
  add column if not exists descricao text;
alter table if exists public.equipes
  add column if not exists projeto_id text;
alter table if exists public.equipes
  add column if not exists codigo text;

update public.equipes
   set descricao = ''
 where descricao is null;

alter table if exists public.equipes
  alter column descricao set default '';

create index if not exists equipes_projeto_id_idx
  on public.equipes (projeto_id);

create unique index if not exists equipes_nome_trim_uk
  on public.equipes (lower(trim(nome)));

-- A tabela pedida pelo módulo atual. Ela referencia Auth diretamente porque
-- `profiles` pode ser uma view de compatibilidade no projeto em produção.
create table if not exists public.usuario_equipes (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (equipe_id, usuario_id)
);

create index if not exists usuario_equipes_usuario_id_idx
  on public.usuario_equipes (usuario_id);
create index if not exists usuario_equipes_equipe_id_idx
  on public.usuario_equipes (equipe_id);

-- Migra vínculos já existentes sem duplicar nada.
do $migration$
begin
  if to_regclass('public.equipe_membros') is not null then
    insert into public.usuario_equipes (equipe_id, usuario_id, created_at)
    select em.equipe_id, em.user_id, em.created_at
      from public.equipe_membros em
     where em.equipe_id is not null
       and em.user_id is not null
    on conflict (equipe_id, usuario_id) do nothing;
  end if;
end
$migration$;

alter table public.equipes enable row level security;
alter table public.usuario_equipes enable row level security;

-- Leitura autenticada; toda mutação continua exclusiva da Gestão.
drop policy if exists equipes_gestao_all on public.equipes;
drop policy if exists equipes_select_authenticated on public.equipes;
drop policy if exists equipes_insert_gestao on public.equipes;
drop policy if exists equipes_update_gestao on public.equipes;
drop policy if exists equipes_delete_gestao on public.equipes;

create policy equipes_select_authenticated
  on public.equipes for select to authenticated
  using ((select auth.uid()) is not null);
create policy equipes_insert_gestao
  on public.equipes for insert to authenticated
  with check ((select public.cadastros_is_gestao()));
create policy equipes_update_gestao
  on public.equipes for update to authenticated
  using ((select public.cadastros_is_gestao()))
  with check ((select public.cadastros_is_gestao()));
create policy equipes_delete_gestao
  on public.equipes for delete to authenticated
  using ((select public.cadastros_is_gestao()));

drop policy if exists usuario_equipes_select_authenticated on public.usuario_equipes;
drop policy if exists usuario_equipes_insert_gestao on public.usuario_equipes;
drop policy if exists usuario_equipes_update_gestao on public.usuario_equipes;
drop policy if exists usuario_equipes_delete_gestao on public.usuario_equipes;

create policy usuario_equipes_select_authenticated
  on public.usuario_equipes for select to authenticated
  using ((select auth.uid()) is not null);
create policy usuario_equipes_insert_gestao
  on public.usuario_equipes for insert to authenticated
  with check ((select public.cadastros_is_gestao()));
create policy usuario_equipes_update_gestao
  on public.usuario_equipes for update to authenticated
  using ((select public.cadastros_is_gestao()))
  with check ((select public.cadastros_is_gestao()));
create policy usuario_equipes_delete_gestao
  on public.usuario_equipes for delete to authenticated
  using ((select public.cadastros_is_gestao()));

grant select, insert, update, delete on public.equipes to authenticated;
grant select, insert, update, delete on public.usuario_equipes to authenticated;

-- Campos auxiliares da governança de contas, quando o projeto usa
-- `perfis_acesso` como tabela canônica.
alter table if exists public.perfis_acesso
  add column if not exists escopo_projetos text not null default 'all';

do $migration$
begin
  if to_regclass('public.perfis_acesso') is not null
     and not exists (
       select 1 from pg_constraint
        where conrelid = 'public.perfis_acesso'::regclass
          and conname = 'perfis_acesso_escopo_projetos_ck'
     ) then
    alter table public.perfis_acesso
      add constraint perfis_acesso_escopo_projetos_ck
      check (escopo_projetos in ('all', 'selected'));
  end if;
end
$migration$;

create table if not exists public.governanca_permissoes_modulo (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null,
  pode_visualizar boolean not null default false,
  pode_editar boolean not null default false,
  pode_gerenciar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (usuario_id, modulo),
  constraint governanca_permissoes_modulo_ck check (
    modulo in ('AUDITORIA', 'CONSULTA', 'INDICADORES', 'HISTORICO',
               'CONFIGURACOES', 'IA', 'CADASTROS')
  ),
  constraint governanca_permissoes_hierarquia_ck check (
    (not pode_editar or pode_visualizar)
    and (not pode_gerenciar or pode_editar)
  )
);

drop trigger if exists governanca_permissoes_updated_at
  on public.governanca_permissoes_modulo;
create trigger governanca_permissoes_updated_at
  before update on public.governanca_permissoes_modulo
  for each row execute function private.governanca_set_updated_at();

alter table public.governanca_permissoes_modulo enable row level security;
drop policy if exists governanca_permissoes_select on public.governanca_permissoes_modulo;
drop policy if exists governanca_permissoes_write on public.governanca_permissoes_modulo;
create policy governanca_permissoes_select
  on public.governanca_permissoes_modulo for select to authenticated
  using ((select auth.uid()) = usuario_id or (select public.cadastros_is_gestao()));
create policy governanca_permissoes_write
  on public.governanca_permissoes_modulo for all to authenticated
  using ((select public.cadastros_is_gestao()))
  with check ((select public.cadastros_is_gestao()));
grant select, insert, update, delete on public.governanca_permissoes_modulo to authenticated;

-- Copia as permissões JSON da geração anterior para a tabela granular usada
-- pela aplicação atual. O bloco é opcional para instalações sem perfis_acesso.
do $migration$
begin
  if to_regclass('public.perfis_acesso') is not null then
    insert into public.governanca_permissoes_modulo
      (usuario_id, modulo, pode_visualizar, pode_editar, pode_gerenciar)
    select p.user_id,
           m.modulo,
           coalesce((p.permissions -> m.chave ->> 'ver')::boolean, false),
           coalesce((p.permissions -> m.chave ->> 'editar')::boolean, false),
           coalesce((p.permissions -> m.chave ->> 'gerenciar')::boolean, false)
      from public.perfis_acesso p
      cross join (values
        ('AUDITORIA', 'AUDITORIA'),
        ('CONSULTA', 'CONSULTA'),
        ('INDICADORES', 'INDICADORES'),
        ('HISTORICO', 'HISTÓRICO'),
        ('CONFIGURACOES', 'CONFIGURAÇÃO'),
        ('IA', 'IA'),
        ('CADASTROS', 'CADASTROS')
      ) as m(modulo, chave)
     where p.user_id is not null
    on conflict (usuario_id, modulo) do update set
      pode_visualizar = excluded.pode_visualizar,
      pode_editar = excluded.pode_editar,
      pode_gerenciar = excluded.pode_gerenciar;
  end if;
end
$migration$;

create table if not exists public.governanca_projetos_usuarios (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  projeto_id text not null,
  created_at timestamptz not null default now(),
  primary key (usuario_id, projeto_id),
  constraint governanca_projetos_usuario_id_ck check (length(trim(projeto_id)) > 0)
);

create index if not exists governanca_projetos_usuarios_projeto_idx
  on public.governanca_projetos_usuarios (projeto_id);
alter table public.governanca_projetos_usuarios enable row level security;
drop policy if exists governanca_projetos_usuario_select on public.governanca_projetos_usuarios;
drop policy if exists governanca_projetos_usuario_write on public.governanca_projetos_usuarios;
create policy governanca_projetos_usuario_select
  on public.governanca_projetos_usuarios for select to authenticated
  using ((select auth.uid()) = usuario_id or (select public.cadastros_is_gestao()));
create policy governanca_projetos_usuario_write
  on public.governanca_projetos_usuarios for all to authenticated
  using ((select public.cadastros_is_gestao()))
  with check ((select public.cadastros_is_gestao()));
grant select, insert, update, delete on public.governanca_projetos_usuarios to authenticated;

create table if not exists public.governanca_auditoria (
  id bigint generated always as identity primary key,
  ator_id uuid references auth.users(id) on delete set null,
  alvo_id uuid references auth.users(id) on delete set null,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists governanca_auditoria_created_at_idx
  on public.governanca_auditoria (created_at desc);
alter table public.governanca_auditoria enable row level security;
drop policy if exists governanca_auditoria_select on public.governanca_auditoria;
drop policy if exists governanca_auditoria_insert on public.governanca_auditoria;
create policy governanca_auditoria_select
  on public.governanca_auditoria for select to authenticated
  using ((select public.cadastros_is_gestao()));
create policy governanca_auditoria_insert
  on public.governanca_auditoria for insert to authenticated
  with check ((select public.cadastros_is_gestao()));
grant select, insert on public.governanca_auditoria to authenticated;

comment on table public.usuario_equipes is
  'Vínculos de usuários às equipes do módulo Cadastros; alterações restritas à Gestão.';
comment on table public.governanca_permissoes_modulo is
  'Permissões granulares por usuário; ausência de override usa o perfil padrão.';

commit;
