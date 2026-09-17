-- ============================================================
-- Tecverde · 050 · Cadastros e Governança de Acessos
-- Fine-grained RBAC compatível com tecverde_can() + trilha de auditoria.
-- ============================================================

alter table public.perfis_acesso
  add column if not exists access_mode text not null default 'PERSONALIZADO',
  add column if not exists app_role text,
  add column if not exists suspended_until timestamptz,
  add column if not exists updated_by uuid;

update public.perfis_acesso
   set access_mode = case
     when upper(coalesce(role, '')) = 'ADMINISTRADOR' then 'GESTAO'
     else 'PERSONALIZADO'
   end
 where access_mode is null or access_mode not in ('GESTAO','LEITURA_GLOBAL','PERSONALIZADO');

update public.perfis_acesso p
   set app_role = coalesce(
     (select pr.role from public.profiles pr where pr.id = p.user_id limit 1),
     case upper(coalesce(p.role,''))
       when 'ADMINISTRADOR' then 'gestao'
       when 'SUPERVISOR' then 'consultor'
       else 'operador'
     end
   )
 where app_role is null;

alter table public.perfis_acesso
  drop constraint if exists perfis_acesso_access_mode_check;
alter table public.perfis_acesso
  add constraint perfis_acesso_access_mode_check
  check (access_mode in ('GESTAO','LEITURA_GLOBAL','PERSONALIZADO'));

alter table public.perfis_acesso
  drop constraint if exists perfis_acesso_app_role_check;
alter table public.perfis_acesso
  add constraint perfis_acesso_app_role_check
  check (app_role is null or app_role in ('operador','consultor','gestao'));

create unique index if not exists perfis_acesso_email_lower_uq
  on public.perfis_acesso (lower(email));
create index if not exists perfis_acesso_governanca_idx
  on public.perfis_acesso (status, access_mode, updated_at desc);

create table if not exists public.governanca_equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists governanca_equipes_nome_uq
  on public.governanca_equipes (lower(nome));

create table if not exists public.governanca_equipe_membros (
  equipe_id uuid not null references public.governanca_equipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (equipe_id, user_id)
);
create index if not exists governanca_equipe_membros_user_idx
  on public.governanca_equipe_membros(user_id, equipe_id);

create table if not exists public.governanca_eventos (
  id bigint generated always as identity primary key,
  actor_id uuid,
  entidade text not null,
  entidade_id text,
  acao text not null,
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now()
);
create index if not exists governanca_eventos_created_idx
  on public.governanca_eventos(created_at desc);
create index if not exists governanca_eventos_entidade_idx
  on public.governanca_eventos(entidade, entidade_id, created_at desc);

create or replace function public.tecverde_is_gestao()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.tecverde_is_principal()
    or exists (
      select 1
        from public.perfis_acesso p
       where (p.user_id = auth.uid() or lower(p.email) = public.tecverde_email_atual())
         and upper(coalesce(p.status,'')) = 'APROVADO'
         and coalesce(p.app_role,
              case upper(coalesce(p.role,'')) when 'ADMINISTRADOR' then 'gestao' else null end
             ) = 'gestao'
         and p.access_mode = 'GESTAO'
         and (p.suspended_until is null or p.suspended_until <= now())
    )
    or exists (
      select 1 from public.profiles pr
       where pr.id = auth.uid() and pr.role = 'gestao'
    );
$$;

create or replace function public.tecverde_can(p_modulo text, p_acao text default 'ver')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.tecverde_is_principal()
  or exists (
    select 1
      from public.perfis_acesso p
     where (p.user_id = auth.uid() or lower(p.email) = public.tecverde_email_atual())
       and upper(coalesce(p.status,'')) = 'APROVADO'
       and (p.suspended_until is null or p.suspended_until <= now())
       and (
         p.access_mode = 'GESTAO'
         or (p.access_mode = 'LEITURA_GLOBAL' and lower(p_acao) = 'ver')
         or (
           p.access_mode = 'PERSONALIZADO'
           and coalesce((p.permissions -> upper(p_modulo) ->> lower(p_acao))::boolean, false)
         )
       )
  );
$$;

grant execute on function public.tecverde_is_gestao() to authenticated;
grant execute on function public.tecverde_can(text,text) to authenticated;

-- A própria linha pode ser lida pelo usuário; alterações são exclusivas da Gestão.
drop policy if exists "TECVERDE_perfis_insert_admin" on public.perfis_acesso;
drop policy if exists "TECVERDE_perfis_update_admin" on public.perfis_acesso;
drop policy if exists "TECVERDE_perfis_delete_admin" on public.perfis_acesso;
create policy "TECVERDE_perfis_insert_gestao" on public.perfis_acesso
  for insert to authenticated with check (public.tecverde_is_gestao());
create policy "TECVERDE_perfis_update_gestao" on public.perfis_acesso
  for update to authenticated using (public.tecverde_is_gestao())
  with check (public.tecverde_is_gestao());
create policy "TECVERDE_perfis_delete_gestao" on public.perfis_acesso
  for delete to authenticated using (public.tecverde_is_gestao());

alter table public.governanca_equipes enable row level security;
alter table public.governanca_equipe_membros enable row level security;
alter table public.governanca_eventos enable row level security;

create policy governanca_equipes_gestao on public.governanca_equipes
  for all to authenticated using (public.tecverde_is_gestao())
  with check (public.tecverde_is_gestao());
create policy governanca_equipe_membros_gestao on public.governanca_equipe_membros
  for all to authenticated using (public.tecverde_is_gestao())
  with check (public.tecverde_is_gestao());
create policy governanca_eventos_select_gestao on public.governanca_eventos
  for select to authenticated using (public.tecverde_is_gestao());

-- Gestão precisa conseguir administrar o catálogo de projetos na mesma tela.
drop policy if exists obras_projetos_insert on public.obras_projetos;
drop policy if exists obras_projetos_update on public.obras_projetos;
drop policy if exists obras_projetos_delete on public.obras_projetos;
create policy obras_projetos_insert on public.obras_projetos
  for insert to authenticated
  with check (public.tecverde_is_gestao() or public.tecverde_can('CONFIGURAÇÃO','editar'));
create policy obras_projetos_update on public.obras_projetos
  for update to authenticated
  using (public.tecverde_is_gestao() or public.tecverde_can('CONFIGURAÇÃO','editar'))
  with check (public.tecverde_is_gestao() or public.tecverde_can('CONFIGURAÇÃO','editar'));
create policy obras_projetos_delete on public.obras_projetos
  for delete to authenticated
  using (public.tecverde_is_gestao() or public.tecverde_can('CONFIGURAÇÃO','editar'));

create or replace function public.governanca_listar_usuarios(
  p_busca text default '', p_offset integer default 0, p_limit integer default 25
)
returns table (
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  legacy_role text,
  status text,
  access_mode text,
  app_role text,
  permissions jsonb,
  suspended_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tecverde_is_gestao() then
    raise exception 'Acesso restrito à Gestão' using errcode = '42501';
  end if;

  return query
  select p.id, p.user_id, p.email, p.full_name, p.role, p.status,
         p.access_mode, p.app_role, p.permissions, p.suspended_until,
         p.created_at, p.updated_at, count(*) over()
    from public.perfis_acesso p
   where trim(coalesce(p_busca,'')) = ''
      or p.email ilike '%' || trim(p_busca) || '%'
      or coalesce(p.full_name,'') ilike '%' || trim(p_busca) || '%'
   order by p.updated_at desc, p.created_at desc
   offset greatest(p_offset,0)
   limit least(greatest(p_limit,1),100);
end;
$$;

create or replace function public.governanca_salvar_usuario(
  p_id uuid,
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_app_role text,
  p_access_mode text,
  p_permissions jsonb,
  p_status text default 'APROVADO',
  p_suspended_until timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_antes jsonb;
  v_depois jsonb;
  v_legacy_role text;
begin
  if not public.tecverde_is_gestao() then
    raise exception 'Acesso restrito à Gestão' using errcode = '42501';
  end if;
  if lower(trim(coalesce(p_email,''))) !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' then
    raise exception 'E-mail inválido';
  end if;
  if p_app_role not in ('operador','consultor','gestao') then
    raise exception 'Papel inválido';
  end if;
  if p_access_mode not in ('GESTAO','LEITURA_GLOBAL','PERSONALIZADO') then
    raise exception 'Modo de acesso inválido';
  end if;
  if upper(coalesce(p_status,'')) not in ('APROVADO','PENDENTE','BLOQUEADO') then
    raise exception 'Status inválido';
  end if;
  if p_user_id = auth.uid()
     and (p_app_role <> 'gestao' or p_access_mode <> 'GESTAO' or upper(p_status) <> 'APROVADO'
          or (p_suspended_until is not null and p_suspended_until > now())) then
    raise exception 'Não é permitido remover ou suspender o próprio acesso de Gestão';
  end if;

  v_legacy_role := case p_app_role
    when 'gestao' then 'ADMINISTRADOR'
    when 'consultor' then 'SUPERVISOR'
    else 'INSPETOR'
  end;

  if p_id is not null then
    select to_jsonb(p) into v_antes from public.perfis_acesso p where p.id = p_id;
    update public.perfis_acesso
       set user_id = coalesce(p_user_id, user_id),
           email = lower(trim(p_email)),
           full_name = nullif(trim(coalesce(p_full_name,'')),''),
           role = v_legacy_role,
           status = upper(p_status),
           access_mode = p_access_mode,
           app_role = p_app_role,
           permissions = coalesce(p_permissions,'{}'::jsonb),
           suspended_until = p_suspended_until,
           approved_by = public.tecverde_email_atual(),
           approved_at = case when upper(p_status)='APROVADO' then now() else approved_at end,
           updated_by = auth.uid(),
           updated_at = now()
     where id = p_id
     returning id into v_id;
  else
    select p.id, to_jsonb(p) into v_id, v_antes
      from public.perfis_acesso p
     where lower(p.email) = lower(trim(p_email))
     limit 1;

    if v_id is null then
      insert into public.perfis_acesso(
        user_id,email,full_name,role,status,permissions,access_mode,app_role,
        suspended_until,approved_by,approved_at,updated_by
      ) values (
        p_user_id,lower(trim(p_email)),nullif(trim(coalesce(p_full_name,'')),''),
        v_legacy_role,upper(p_status),coalesce(p_permissions,'{}'::jsonb),
        p_access_mode,p_app_role,p_suspended_until,public.tecverde_email_atual(),
        case when upper(p_status)='APROVADO' then now() else null end,auth.uid()
      ) returning id into v_id;
    else
      update public.perfis_acesso
         set user_id = coalesce(p_user_id,user_id), full_name = nullif(trim(coalesce(p_full_name,'')),''),
             role = v_legacy_role, status = upper(p_status), permissions = coalesce(p_permissions,'{}'::jsonb),
             access_mode = p_access_mode, app_role = p_app_role, suspended_until = p_suspended_until,
             approved_by = public.tecverde_email_atual(),
             approved_at = case when upper(p_status)='APROVADO' then now() else approved_at end,
             updated_by = auth.uid(), updated_at = now()
       where id = v_id;
    end if;
  end if;

  if p_user_id is not null then
    update public.profiles set nome = nullif(trim(coalesce(p_full_name,'')),''), role = p_app_role where id = p_user_id;
    if not found then
      insert into public.profiles(id,nome,role) values (p_user_id,nullif(trim(coalesce(p_full_name,'')),''),p_app_role);
    end if;
  end if;

  select to_jsonb(p) into v_depois from public.perfis_acesso p where p.id = v_id;
  insert into public.governanca_eventos(actor_id,entidade,entidade_id,acao,antes,depois)
  values (auth.uid(),'USUARIO',v_id::text,case when v_antes is null then 'CRIAR' else 'ATUALIZAR' end,v_antes,v_depois);

  return v_id;
end;
$$;

create or replace function public.governanca_desativar_usuario(p_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v_user_id uuid;
begin
  if not public.tecverde_is_gestao() then raise exception 'Acesso restrito à Gestão' using errcode='42501'; end if;
  select user_id,to_jsonb(p) into v_user_id,v_antes from public.perfis_acesso p where id=p_id;
  if v_user_id = auth.uid() and not p_ativo then raise exception 'Não é permitido desativar o próprio acesso de Gestão'; end if;
  update public.perfis_acesso
     set status = case when p_ativo then 'APROVADO' else 'BLOQUEADO' end,
         suspended_until = case when p_ativo then null else suspended_until end,
         updated_by = auth.uid(), updated_at = now()
   where id=p_id;
  select to_jsonb(p) into v_depois from public.perfis_acesso p where id=p_id;
  insert into public.governanca_eventos(actor_id,entidade,entidade_id,acao,antes,depois)
  values(auth.uid(),'USUARIO',p_id::text,case when p_ativo then 'REATIVAR' else 'DESATIVAR' end,v_antes,v_depois);
end;
$$;

create or replace function public.governanca_excluir_acesso(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes jsonb;
  v_user_id uuid;
begin
  if not public.tecverde_is_gestao() then raise exception 'Acesso restrito à Gestão' using errcode='42501'; end if;
  select user_id,to_jsonb(p) into v_user_id,v_antes from public.perfis_acesso p where id=p_id;
  if v_user_id = auth.uid() then raise exception 'Não é permitido excluir o próprio acesso de Gestão'; end if;
  delete from public.perfis_acesso where id=p_id;
  if v_user_id is not null then update public.profiles set role='consultor' where id=v_user_id; end if;
  insert into public.governanca_eventos(actor_id,entidade,entidade_id,acao,antes,depois)
  values(auth.uid(),'USUARIO',p_id::text,'EXCLUIR_ACESSO',v_antes,null);
end;
$$;

grant execute on function public.governanca_listar_usuarios(text,integer,integer) to authenticated;
grant execute on function public.governanca_salvar_usuario(uuid,uuid,text,text,text,text,jsonb,text,timestamptz) to authenticated;
grant execute on function public.governanca_desativar_usuario(uuid,boolean) to authenticated;
grant execute on function public.governanca_excluir_acesso(uuid) to authenticated;

grant select,insert,update,delete on public.governanca_equipes to authenticated;
grant select,insert,update,delete on public.governanca_equipe_membros to authenticated;
grant select on public.governanca_eventos to authenticated;
grant usage,select on sequence public.governanca_eventos_id_seq to authenticated;

comment on table public.governanca_equipes is 'Equipes administráveis nativamente pelo módulo de Cadastros.';
comment on table public.governanca_eventos is 'Trilha imutável de alterações de governança e permissões.';
comment on column public.perfis_acesso.access_mode is 'GESTAO, LEITURA_GLOBAL ou PERSONALIZADO; interpretado por tecverde_can().';
