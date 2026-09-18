-- Tecverde · 059: Cadeia da Madeira
--
-- Cadastro técnico de fornecedores, recebimento de lotes, inspeções e
-- laudos/certificados para a cadeia de madeira estrutural.
--
-- O módulo não depende da estrutura antiga de perfis: a função de
-- autorização abaixo entende tanto perfis_acesso quanto profiles e respeita
-- permissões explícitas da governança quando existirem.

begin;

create table if not exists public.cadeia_madeira_fornecedores (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj text,
  homologacao_ativa boolean not null default false,
  certificacao_origem text,
  contato_tecnico_nome text,
  contato_tecnico_email text,
  contato_tecnico_telefone text,
  historico_avaliacao text,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cadeia_madeira_lotes (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.cadeia_madeira_fornecedores(id) on delete restrict,
  numero_nota_fiscal text not null,
  volume_m3 numeric(12,3) not null,
  data_recebimento date not null default current_date,
  placa_veiculo text,
  teor_umidade_medio numeric(5,2) not null,
  lote_autoclave text not null,
  status_liberacao text not null default 'QUARENTENA',
  observacoes text,
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cadeia_madeira_inspecoes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.cadeia_madeira_lotes(id) on delete cascade,
  data_inspecao date not null default current_date,
  inspetor_id uuid references auth.users(id) on delete set null,
  bitola_nominal text,
  dimensional_conforme boolean not null default false,
  empenamento boolean not null default false,
  fendas_profundas boolean not null default false,
  nos_soltos boolean not null default false,
  manchas_umidade_bolor boolean not null default false,
  resultado text not null default 'QUARENTENA',
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cadeia_madeira_laudos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.cadeia_madeira_lotes(id) on delete cascade,
  tipo text not null,
  nome_arquivo text not null,
  mime_type text not null,
  tamanho_bytes bigint not null,
  storage_bucket text not null default 'cadeia-madeira',
  storage_path text not null,
  validade_ate date,
  aprovado boolean not null default false,
  aprovado_por uuid references auth.users(id) on delete set null,
  aprovado_em timestamptz,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Compatibilidade para instalações que receberam somente parte da estrutura.
alter table public.cadeia_madeira_fornecedores
  add column if not exists cnpj text,
  add column if not exists homologacao_ativa boolean not null default false,
  add column if not exists certificacao_origem text,
  add column if not exists contato_tecnico_nome text,
  add column if not exists contato_tecnico_email text,
  add column if not exists contato_tecnico_telefone text,
  add column if not exists historico_avaliacao text,
  add column if not exists ativo boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.cadeia_madeira_lotes
  add column if not exists fornecedor_id uuid references public.cadeia_madeira_fornecedores(id) on delete restrict,
  add column if not exists numero_nota_fiscal text,
  add column if not exists volume_m3 numeric(12,3),
  add column if not exists data_recebimento date,
  add column if not exists placa_veiculo text,
  add column if not exists teor_umidade_medio numeric(5,2),
  add column if not exists lote_autoclave text,
  add column if not exists status_liberacao text not null default 'QUARENTENA',
  add column if not exists observacoes text,
  add column if not exists ativo boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.cadeia_madeira_inspecoes
  add column if not exists lote_id uuid references public.cadeia_madeira_lotes(id) on delete cascade,
  add column if not exists data_inspecao date not null default current_date,
  add column if not exists inspetor_id uuid references auth.users(id) on delete set null,
  add column if not exists bitola_nominal text,
  add column if not exists dimensional_conforme boolean not null default false,
  add column if not exists empenamento boolean not null default false,
  add column if not exists fendas_profundas boolean not null default false,
  add column if not exists nos_soltos boolean not null default false,
  add column if not exists manchas_umidade_bolor boolean not null default false,
  add column if not exists resultado text not null default 'QUARENTENA',
  add column if not exists observacoes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.cadeia_madeira_laudos
  add column if not exists lote_id uuid references public.cadeia_madeira_lotes(id) on delete cascade,
  add column if not exists tipo text,
  add column if not exists nome_arquivo text,
  add column if not exists mime_type text,
  add column if not exists tamanho_bytes bigint,
  add column if not exists storage_bucket text not null default 'cadeia-madeira',
  add column if not exists storage_path text,
  add column if not exists validade_ate date,
  add column if not exists aprovado boolean not null default false,
  add column if not exists aprovado_por uuid references auth.users(id) on delete set null,
  add column if not exists aprovado_em timestamptz,
  add column if not exists observacoes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists cadeia_madeira_fornecedor_razao_social_uk
  on public.cadeia_madeira_fornecedores (lower(razao_social));
create unique index if not exists cadeia_madeira_fornecedor_cnpj_uk
  on public.cadeia_madeira_fornecedores (cnpj)
  where cnpj is not null and cnpj <> '';
create index if not exists cadeia_madeira_lotes_fornecedor_idx
  on public.cadeia_madeira_lotes (fornecedor_id, data_recebimento desc);
create index if not exists cadeia_madeira_lotes_status_idx
  on public.cadeia_madeira_lotes (status_liberacao, data_recebimento desc);
create index if not exists cadeia_madeira_lotes_umidade_idx
  on public.cadeia_madeira_lotes (teor_umidade_medio)
  where teor_umidade_medio > 20;
create index if not exists cadeia_madeira_inspecoes_lote_idx
  on public.cadeia_madeira_inspecoes (lote_id, data_inspecao desc);
create index if not exists cadeia_madeira_fornecedores_created_by_idx
  on public.cadeia_madeira_fornecedores (created_by);
create index if not exists cadeia_madeira_fornecedores_updated_by_idx
  on public.cadeia_madeira_fornecedores (updated_by);
create index if not exists cadeia_madeira_lotes_created_by_idx
  on public.cadeia_madeira_lotes (created_by);
create index if not exists cadeia_madeira_lotes_updated_by_idx
  on public.cadeia_madeira_lotes (updated_by);
create index if not exists cadeia_madeira_inspecoes_inspetor_id_idx
  on public.cadeia_madeira_inspecoes (inspetor_id);
create index if not exists cadeia_madeira_inspecoes_created_by_idx
  on public.cadeia_madeira_inspecoes (created_by);
create index if not exists cadeia_madeira_inspecoes_updated_by_idx
  on public.cadeia_madeira_inspecoes (updated_by);
create index if not exists cadeia_madeira_laudos_aprovado_por_idx
  on public.cadeia_madeira_laudos (aprovado_por);
create index if not exists cadeia_madeira_laudos_created_by_idx
  on public.cadeia_madeira_laudos (created_by);
create index if not exists cadeia_madeira_laudos_lote_idx
  on public.cadeia_madeira_laudos (lote_id, validade_ate, created_at desc);

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cadeia_madeira_lotes'::regclass
       and conname = 'cadeia_madeira_lotes_volume_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_volume_ck check (volume_m3 > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cadeia_madeira_lotes'::regclass
       and conname = 'cadeia_madeira_lotes_umidade_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_umidade_ck check (teor_umidade_medio >= 0 and teor_umidade_medio <= 100);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cadeia_madeira_lotes'::regclass
       and conname = 'cadeia_madeira_lotes_status_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_status_ck check (status_liberacao in ('APROVADO', 'REPROVADO', 'QUARENTENA'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cadeia_madeira_inspecoes'::regclass
       and conname = 'cadeia_madeira_inspecoes_resultado_ck'
  ) then
    alter table public.cadeia_madeira_inspecoes
      add constraint cadeia_madeira_inspecoes_resultado_ck check (resultado in ('APROVADO', 'REPROVADO', 'QUARENTENA'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cadeia_madeira_laudos'::regclass
       and conname = 'cadeia_madeira_laudos_tipo_ck'
  ) then
    alter table public.cadeia_madeira_laudos
      add constraint cadeia_madeira_laudos_tipo_ck check (tipo in ('LAUDO_TECNICO', 'CERTIFICADO_CONFORMIDADE'));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cadeia_madeira_laudos'::regclass
       and conname = 'cadeia_madeira_laudos_tamanho_ck'
  ) then
    alter table public.cadeia_madeira_laudos
      add constraint cadeia_madeira_laudos_tamanho_ck check (tamanho_bytes > 0 and tamanho_bytes <= 20971520);
  end if;
end
$constraints$;

create or replace function public.cadeia_madeira_pode(p_acao text default 'ver')
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_usuario uuid := auth.uid();
  v_acao text := lower(trim(coalesce(p_acao, 'ver')));
  v_role text := '';
  v_status text := 'active';
  v_suspenso_ate timestamptz;
  v_regra jsonb;
  v_permissao boolean;
begin
  if v_usuario is null or v_acao not in ('ver', 'editar', 'gerenciar') then
    return false;
  end if;

  -- A tabela canônica existe nas instalações atuais, mas o fallback legado
  -- mantém a migration aplicável em projetos que ainda usam profiles.
  begin
    select lower(coalesce(p.role, '')),
           lower(coalesce(p.status, '')),
           p.suspended_until
      into v_role, v_status, v_suspenso_ate
      from public.perfis_acesso p
     where p.user_id = v_usuario;
  exception when undefined_table or undefined_column then
    null;
  end;

  if v_role = '' then
    begin
      select lower(coalesce(p.role, ''))
        into v_role
        from public.profiles p
       where p.id = v_usuario;
    exception when undefined_table or undefined_column then
      return false;
    end;
  end if;

  if v_status in ('blocked', 'bloqueado')
     or (v_status in ('suspended', 'suspenso')
         and (v_suspenso_ate is null or v_suspenso_ate > now())) then
    return false;
  end if;

  if v_role in ('gestao', 'gestor', 'admin', 'administrador') then
    return true;
  end if;

  -- Uma permissão explícita sempre vence o fallback por papel.
  select case v_acao
           when 'gerenciar' then pm.pode_gerenciar
           when 'editar' then pm.pode_editar
           else pm.pode_visualizar
         end
    into v_permissao
    from public.governanca_permissoes_modulo pm
   where pm.usuario_id = v_usuario
     and pm.modulo = 'CADEIA_MADEIRA';
  if found then
    return coalesce(v_permissao, false);
  end if;

  -- Instalações anteriores guardavam overrides no JSON de perfis_acesso.
  begin
    select p.permissions -> 'CADEIA_MADEIRA'
      into v_regra
      from public.perfis_acesso p
     where p.user_id = v_usuario;
    if v_regra is not null and v_regra ? v_acao then
      return lower(coalesce(v_regra ->> v_acao, 'false')) = 'true';
    end if;
  exception when undefined_table or undefined_column then
    null;
  end;

  -- Respeita funções de autorização já instaladas, quando existirem.
  if to_regprocedure('public.tecverde_can(text,text)') is not null then
    execute 'select public.tecverde_can($1, $2)'
      into v_permissao
      using 'CADEIA_MADEIRA', v_acao;
    if coalesce(v_permissao, false) then
      return true;
    end if;
  end if;

  -- A equipe técnica lê o módulo por padrão; gravação exige override.
  return v_acao = 'ver'
     and v_role in ('operador', 'consultor', 'inspetor', 'auditor', 'qualidade', 'supervisor');
end
$function$;

revoke all on function public.cadeia_madeira_pode(text) from public, anon;
grant execute on function public.cadeia_madeira_pode(text) to authenticated, service_role;

alter table public.cadeia_madeira_fornecedores enable row level security;
alter table public.cadeia_madeira_lotes enable row level security;
alter table public.cadeia_madeira_inspecoes enable row level security;
alter table public.cadeia_madeira_laudos enable row level security;

do $policies$
declare
  tabela text;
begin
  foreach tabela in array array[
    'cadeia_madeira_fornecedores',
    'cadeia_madeira_lotes',
    'cadeia_madeira_inspecoes',
    'cadeia_madeira_laudos'
  ] loop
    execute format('drop policy if exists cadeia_madeira_%s_select on public.%I', tabela, tabela);
    execute format(
      'create policy cadeia_madeira_%s_select on public.%I for select to authenticated using (public.cadeia_madeira_pode(''ver''))',
      tabela, tabela
    );
    execute format('drop policy if exists cadeia_madeira_%s_write on public.%I', tabela, tabela);
    execute format('drop policy if exists cadeia_madeira_%s_insert on public.%I', tabela, tabela);
    execute format('drop policy if exists cadeia_madeira_%s_update on public.%I', tabela, tabela);
    execute format('drop policy if exists cadeia_madeira_%s_delete on public.%I', tabela, tabela);
    execute format(
      'create policy cadeia_madeira_%s_insert on public.%I for insert to authenticated with check (public.cadeia_madeira_pode(''editar''))',
      tabela, tabela
    );
    execute format(
      'create policy cadeia_madeira_%s_update on public.%I for update to authenticated using (public.cadeia_madeira_pode(''editar'')) with check (public.cadeia_madeira_pode(''editar''))',
      tabela, tabela
    );
    execute format(
      'create policy cadeia_madeira_%s_delete on public.%I for delete to authenticated using (public.cadeia_madeira_pode(''editar''))',
      tabela, tabela
    );
  end loop;
end
$policies$;

grant select, insert, update, delete on public.cadeia_madeira_fornecedores to authenticated;
grant select, insert, update, delete on public.cadeia_madeira_lotes to authenticated;
grant select, insert, update, delete on public.cadeia_madeira_inspecoes to authenticated;
grant select, insert, update, delete on public.cadeia_madeira_laudos to authenticated;

-- Bucket privado, com tipos limitados a fotos e documentos técnicos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cadeia-madeira',
  'cadeia-madeira',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists cadeia_madeira_storage_select on storage.objects;
create policy cadeia_madeira_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'cadeia-madeira'
  and (storage.foldername(name))[1] = 'cadeia-madeira'
  and public.cadeia_madeira_pode('ver')
);

drop policy if exists cadeia_madeira_storage_insert on storage.objects;
create policy cadeia_madeira_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'cadeia-madeira'
  and (storage.foldername(name))[1] = 'cadeia-madeira'
  and (storage.foldername(name))[2] = (select auth.uid()::text)
  and public.cadeia_madeira_pode('editar')
);

drop policy if exists cadeia_madeira_storage_update on storage.objects;
create policy cadeia_madeira_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'cadeia-madeira'
  and (storage.foldername(name))[1] = 'cadeia-madeira'
  and (
    (storage.foldername(name))[2] = (select auth.uid()::text)
    or public.cadeia_madeira_pode('editar')
  )
)
with check (
  bucket_id = 'cadeia-madeira'
  and (storage.foldername(name))[1] = 'cadeia-madeira'
  and public.cadeia_madeira_pode('editar')
);

drop policy if exists cadeia_madeira_storage_delete on storage.objects;
create policy cadeia_madeira_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'cadeia-madeira'
  and (storage.foldername(name))[1] = 'cadeia-madeira'
  and (
    (storage.foldername(name))[2] = (select auth.uid()::text)
    or public.cadeia_madeira_pode('editar')
  )
);

do $permissions$
begin
  if to_regclass('public.governanca_permissoes_modulo') is not null then
    alter table public.governanca_permissoes_modulo
      drop constraint if exists governanca_permissoes_modulo_ck;
    alter table public.governanca_permissoes_modulo
      add constraint governanca_permissoes_modulo_ck
      check (modulo in (
        'AUDITORIA', 'CONSULTA', 'INDICADORES', 'HISTORICO',
        'CONFIGURACOES', 'IA', 'CADASTROS', 'RESÍDUOS', 'CADEIA_MADEIRA'
      ));
  end if;
end
$permissions$;

notify pgrst, 'reload schema';
commit;
