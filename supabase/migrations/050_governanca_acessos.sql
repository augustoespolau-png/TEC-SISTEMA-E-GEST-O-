-- ============================================================
-- Tecverde · 050: cadastros e governança de acessos
--
-- Este migration mantém os papéis existentes e acrescenta:
--   · status de conta e suspensão com data final;
--   · permissões explícitas por módulo;
--   · escopo opcional por projeto;
--   · equipes e seus membros;
--   · trilha de auditoria administrativa.
--
-- A regra de acesso é avaliada no banco. A interface só reflete a mesma
-- decisão para não deixar botões inúteis visíveis. A API administrativa do
-- Auth é usada exclusivamente pelo servidor para convite, bloqueio e
-- exclusão de usuários.
-- ============================================================

-- ---------- perfil e status de conta ----------
alter table public.profiles
  add column if not exists status text not null default 'active';

alter table public.profiles
  add column if not exists suspenso_ate timestamptz;

alter table public.profiles
  add column if not exists escopo_projetos text not null default 'all';

do $migration$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_status_ck'
  ) then
    alter table public.profiles
      add constraint profiles_status_ck
      check (status in ('active', 'blocked', 'suspended'));
  end if;
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname = 'profiles_escopo_projetos_ck'
  ) then
    alter table public.profiles
      add constraint profiles_escopo_projetos_ck
      check (escopo_projetos in ('all', 'selected'));
  end if;
end
$migration$;

-- ---------- tabelas de governança ----------
create table if not exists public.governanca_equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text,
  ativo boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists governanca_equipes_nome_lower_uk
  on public.governanca_equipes (lower(nome));

create table if not exists public.governanca_equipe_membros (
  equipe_id uuid not null references public.governanca_equipes(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  principal boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (equipe_id, usuario_id)
);

create index if not exists governanca_equipe_membros_usuario_idx
  on public.governanca_equipe_membros (usuario_id);

create table if not exists public.governanca_permissoes_modulo (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  modulo text not null,
  pode_visualizar boolean not null default false,
  pode_editar boolean not null default false,
  pode_gerenciar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (usuario_id, modulo),
  constraint governanca_permissoes_modulo_ck
    check (
      modulo in (
        'AUDITORIA', 'CONSULTA', 'INDICADORES', 'HISTORICO',
        'CONFIGURACOES', 'IA', 'CADASTROS'
      )
    ),
  constraint governanca_permissoes_hierarquia_ck
    check (
      (not pode_editar or pode_visualizar)
      and (not pode_gerenciar or pode_editar)
    )
);

create table if not exists public.governanca_projetos_usuarios (
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  projeto_id text not null,
  created_at timestamptz not null default now(),
  primary key (usuario_id, projeto_id),
  constraint governanca_projetos_usuario_id_ck
    check (length(trim(projeto_id)) > 0)
);

create index if not exists governanca_projetos_usuarios_projeto_idx
  on public.governanca_projetos_usuarios (projeto_id);

create table if not exists public.governanca_auditoria (
  id bigint generated always as identity primary key,
  ator_id uuid references public.profiles(id) on delete set null,
  alvo_id uuid references public.profiles(id) on delete set null,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists governanca_auditoria_created_at_idx
  on public.governanca_auditoria (created_at desc);

create index if not exists governanca_auditoria_alvo_idx
  on public.governanca_auditoria (alvo_id, created_at desc);

-- ---------- updated_at ----------
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

drop trigger if exists governanca_equipes_updated_at
  on public.governanca_equipes;
create trigger governanca_equipes_updated_at
  before update on public.governanca_equipes
  for each row execute function private.governanca_set_updated_at();

drop trigger if exists governanca_permissoes_updated_at
  on public.governanca_permissoes_modulo;
create trigger governanca_permissoes_updated_at
  before update on public.governanca_permissoes_modulo
  for each row execute function private.governanca_set_updated_at();

-- ---------- funções de autorização ----------
-- Todas recebem a identidade da sessão via auth.uid(), nunca via payload.
create or replace function public.governanca_is_gestao()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.role = 'gestao'
       and p.status = 'active'
  );
$function$;

create or replace function public.governanca_is_active(
  p_usuario_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  select exists (
    select 1
      from public.profiles p
     where p.id = coalesce(p_usuario_id, auth.uid())
       and p.status <> 'blocked'
       and (
         p.status = 'active'
         or (
           p.status = 'suspended'
           and p.suspenso_ate is not null
           and p.suspenso_ate <= now()
         )
       )
  );
$function$;

create or replace function public.governanca_pode(
  p_modulo text,
  p_acao text default 'ver'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_modulo text := upper(trim(coalesce(p_modulo, '')));
  v_acao text := lower(trim(coalesce(p_acao, 'ver')));
  v_role user_role;
  v_status text;
  v_suspenso_ate timestamptz;
  v_tem_override boolean;
  v_permite boolean;
begin
  select p.role, p.status, p.suspenso_ate
    into v_role, v_status, v_suspenso_ate
    from public.profiles p
   where p.id = auth.uid();

  if v_role is null
     or v_status = 'blocked'
     or (
       v_status = 'suspended'
       and (v_suspenso_ate is null or v_suspenso_ate > now())
     ) then
    return false;
  end if;

  -- Gestão é a autoridade máxima e não pode ser reduzida por um override.
  if v_role = 'gestao' then
    return true;
  end if;

  -- O próprio módulo de governança nunca pode ser delegado.
  if v_modulo = 'CADASTROS' then
    return false;
  end if;

  select exists (
    select 1
      from public.governanca_permissoes_modulo pm
     where pm.usuario_id = auth.uid()
       and pm.modulo = v_modulo
  ) into v_tem_override;

  if v_tem_override then
    select case v_acao
      when 'gerenciar' then pm.pode_gerenciar
      when 'editar' then pm.pode_editar
      else pm.pode_visualizar
    end
      into v_permite
      from public.governanca_permissoes_modulo pm
     where pm.usuario_id = auth.uid()
       and pm.modulo = v_modulo;
    return coalesce(v_permite, false);
  end if;

  -- Compatibilidade para perfis criados antes desta migration.
  if v_role in ('operador', 'consultor')
     and v_modulo in ('CONSULTA', 'INDICADORES') then
    return v_acao = 'ver';
  end if;

  if v_role = 'operador' and v_modulo = 'AUDITORIA' then
    return v_acao in ('ver', 'editar');
  end if;

  return false;
end
$function$;

create or replace function public.governanca_pode_projeto(
  p_projeto text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_projeto text := nullif(trim(coalesce(p_projeto, '')), '');
  v_escopo text;
begin
  if not public.governanca_is_active() then
    return false;
  end if;

  if public.governanca_is_gestao() then
    return true;
  end if;

  select p.escopo_projetos into v_escopo
    from public.profiles p
   where p.id = auth.uid();

  -- O valor all é explícito. Coalesce mantém acesso global para perfis
  -- criados antes desta coluna existir.
  if coalesce(v_escopo, 'all') = 'all' then
    return true;
  end if;
  if v_projeto is null then
    return false;
  end if;

  return exists (
    select 1
      from public.governanca_projetos_usuarios pu
     where pu.usuario_id = auth.uid()
       and (
         pu.projeto_id = v_projeto
         or exists (
           select 1
            from public.projetos p
           where lower(p.nome) = lower(v_projeto)
              and pu.projeto_id in (
                p.id::text,
                coalesce(to_jsonb(p) ->> 'origem_id', p.id::text)
              )
         )
       )
  );
end
$function$;

-- Impede que uma operação administrativa deixe o ambiente sem Gestão.
create or replace function public.governanca_proteger_ultimo_gestor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_gestores_ativos bigint;
begin
  if tg_op = 'DELETE' then
    if old.role = 'gestao' and old.status = 'active' then
      select count(*) into v_gestores_ativos
        from public.profiles
       where role = 'gestao' and status = 'active';
      if v_gestores_ativos <= 1 then
        raise exception 'A última conta ativa de Gestão não pode ser removida'
          using errcode = '42501';
      end if;
    end if;
    return old;
  end if;

  if old.role = 'gestao'
     and old.status = 'active'
     and not (new.role = 'gestao' and new.status = 'active') then
    select count(*) into v_gestores_ativos
      from public.profiles
     where role = 'gestao' and status = 'active';
    if v_gestores_ativos <= 1 then
      raise exception 'A última conta ativa de Gestão não pode ser removida'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists governanca_proteger_ultimo_gestor on public.profiles;
create trigger governanca_proteger_ultimo_gestor
  before update or delete on public.profiles
  for each row execute function public.governanca_proteger_ultimo_gestor();

-- ---------- RLS das tabelas de governança ----------
alter table public.governanca_equipes enable row level security;
alter table public.governanca_equipe_membros enable row level security;
alter table public.governanca_permissoes_modulo enable row level security;
alter table public.governanca_projetos_usuarios enable row level security;
alter table public.governanca_auditoria enable row level security;

create policy governanca_equipes_select
  on public.governanca_equipes for select to authenticated
  using (public.governanca_is_gestao());
create policy governanca_equipes_write
  on public.governanca_equipes for all to authenticated
  using (public.governanca_is_gestao())
  with check (public.governanca_is_gestao());

create policy governanca_membros_select
  on public.governanca_equipe_membros for select to authenticated
  using (public.governanca_is_gestao());
create policy governanca_membros_write
  on public.governanca_equipe_membros for all to authenticated
  using (public.governanca_is_gestao())
  with check (public.governanca_is_gestao());

create policy governanca_permissoes_select
  on public.governanca_permissoes_modulo for select to authenticated
  using (usuario_id = auth.uid() or public.governanca_is_gestao());
create policy governanca_permissoes_write
  on public.governanca_permissoes_modulo for all to authenticated
  using (public.governanca_is_gestao())
  with check (public.governanca_is_gestao());

create policy governanca_projetos_usuario_select
  on public.governanca_projetos_usuarios for select to authenticated
  using (usuario_id = auth.uid() or public.governanca_is_gestao());
create policy governanca_projetos_usuario_write
  on public.governanca_projetos_usuarios for all to authenticated
  using (public.governanca_is_gestao())
  with check (public.governanca_is_gestao());

create policy governanca_auditoria_select
  on public.governanca_auditoria for select to authenticated
  using (public.governanca_is_gestao());
create policy governanca_auditoria_insert
  on public.governanca_auditoria for insert to authenticated
  with check (ator_id = auth.uid() and public.governanca_is_gestao());

grant select, insert, update, delete on public.governanca_equipes to authenticated;
grant select, insert, update, delete on public.governanca_equipe_membros to authenticated;
grant select, insert, update, delete on public.governanca_permissoes_modulo to authenticated;
grant select, insert, update, delete on public.governanca_projetos_usuarios to authenticated;
grant select, insert on public.governanca_auditoria to authenticated;

revoke all on function public.governanca_is_gestao() from public, anon;
revoke all on function public.governanca_is_active(uuid) from public, anon;
revoke all on function public.governanca_pode(text, text) from public, anon;
revoke all on function public.governanca_pode_projeto(text) from public, anon;
grant execute on function public.governanca_is_gestao() to authenticated, service_role;
grant execute on function public.governanca_is_active(uuid) to authenticated, service_role;
grant execute on function public.governanca_pode(text, text) to authenticated, service_role;
grant execute on function public.governanca_pode_projeto(text) to authenticated, service_role;

-- ---------- RLS dos dados de qualidade ----------
-- As políticas antigas são permissivas por papel. Estas políticas
-- RESTRICTIVE funcionam como uma segunda trava: ambas precisam permitir a
-- operação, portanto um usuário sem o módulo não atravessa a API REST nem
-- uma chamada direta ao Supabase.
create policy governanca_ocorrencias_scope
  on public.ocorrencias as restrictive for all to authenticated
  using (
    public.governanca_is_active()
    and (
      public.governanca_pode('CONSULTA', 'ver')
      or public.governanca_pode('INDICADORES', 'ver')
      or public.governanca_pode('AUDITORIA', 'ver')
    )
    and public.governanca_pode_projeto(projeto)
  )
  with check (
    public.governanca_is_active()
    and (
      public.governanca_pode('CONSULTA', 'editar')
      or public.governanca_pode('AUDITORIA', 'editar')
    )
    and public.governanca_pode_projeto(projeto)
  );

-- Substitui as políticas históricas que conheciam apenas o enum de papel.
-- Assim um override explícito de edição também é respeitado no backend.
drop policy if exists oco_insert on public.ocorrencias;
create policy oco_insert on public.ocorrencias for insert
  with check (public.governanca_pode('AUDITORIA', 'editar'));

drop policy if exists oco_update on public.ocorrencias;
create policy oco_update on public.ocorrencias for update
  using (
    public.governanca_pode('CONSULTA', 'editar')
    or public.governanca_pode('AUDITORIA', 'editar')
  )
  with check (
    public.governanca_pode('CONSULTA', 'editar')
    or public.governanca_pode('AUDITORIA', 'editar')
  );

create policy governanca_auditorias_scope
  on public.auditorias as restrictive for all to authenticated
  using (
    public.governanca_is_active()
    and (
      public.governanca_pode('CONSULTA', 'ver')
      or public.governanca_pode('INDICADORES', 'ver')
      or public.governanca_pode('AUDITORIA', 'ver')
    )
    and public.governanca_pode_projeto(projeto)
  )
  with check (
    public.governanca_is_active()
    and public.governanca_pode('AUDITORIA', 'editar')
    and public.governanca_pode_projeto(projeto)
  );

drop policy if exists auditorias_insert on public.auditorias;
create policy auditorias_insert on public.auditorias for insert
  with check (public.governanca_pode('AUDITORIA', 'editar'));
drop policy if exists auditorias_update on public.auditorias;
create policy auditorias_update on public.auditorias for update
  using (public.governanca_pode('AUDITORIA', 'editar'))
  with check (public.governanca_pode('AUDITORIA', 'editar'));

create policy governanca_auditoria_paredes_scope
  on public.auditoria_paredes as restrictive for all to authenticated
  using (
    public.governanca_is_active()
    and (
      public.governanca_pode('CONSULTA', 'ver')
      or public.governanca_pode('INDICADORES', 'ver')
      or public.governanca_pode('AUDITORIA', 'ver')
    )
    and exists (
      select 1
        from public.auditorias a
       where a.id = auditoria_paredes.auditoria_id
         and public.governanca_pode_projeto(a.projeto)
    )
  )
  with check (
    public.governanca_is_active()
    and public.governanca_pode('AUDITORIA', 'editar')
  );

drop policy if exists auditoria_paredes_insert on public.auditoria_paredes;
create policy auditoria_paredes_insert on public.auditoria_paredes for insert
  with check (public.governanca_pode('AUDITORIA', 'editar'));
drop policy if exists auditoria_paredes_update on public.auditoria_paredes;
create policy auditoria_paredes_update on public.auditoria_paredes for update
  using (public.governanca_pode('AUDITORIA', 'editar'))
  with check (public.governanca_pode('AUDITORIA', 'editar'));
drop policy if exists auditoria_paredes_delete on public.auditoria_paredes;
create policy auditoria_paredes_delete on public.auditoria_paredes for delete
  using (public.governanca_pode('AUDITORIA', 'editar'));

comment on table public.governanca_permissoes_modulo is
  'Override explícito por usuário. Ausência de linha usa o baseline do papel; CADASTROS continua exclusivo de Gestão.';
comment on table public.governanca_projetos_usuarios is
  'Escopo explícito por projeto. Ausência de linhas significa acesso global; a primeira linha ativa o modo selecionado.';
comment on function public.governanca_pode(text, text) is
  'Autorização centralizada por módulo/ação, usada nas políticas RLS e nos fluxos administrativos.';
