-- Resíduos: registro de troca de caçamba e anexos de MTR/fotos.
begin;

create table if not exists public.residuos_trocas (
  id text primary key,
  categoria text not null,
  data_troca date not null,
  identificacao_cacamba text,
  transportadora_destino text,
  peso_kg numeric,
  mtr_numero text,
  observacao text,
  empresa_coletora text,
  placa_caminhao text,
  motorista text,
  horario_retirada time,
  custo numeric,
  destino_final text,
  status text not null default 'PENDENTE',
  usuario_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.residuos_anexos (
  id text primary key,
  troca_id text not null references public.residuos_trocas(id) on delete cascade,
  tipo text not null,
  nome_arquivo text not null,
  mime_type text,
  tamanho_bytes bigint,
  storage_path text,
  uploaded_at timestamptz not null default now(),
  created_by text,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.residuos_trocas
  add column if not exists identificacao_cacamba text,
  add column if not exists transportadora_destino text,
  add column if not exists peso_kg numeric,
  add column if not exists mtr_numero text,
  add column if not exists observacao text,
  add column if not exists empresa_coletora text,
  add column if not exists placa_caminhao text,
  add column if not exists motorista text,
  add column if not exists horario_retirada time,
  add column if not exists custo numeric,
  add column if not exists destino_final text,
  add column if not exists status text not null default 'PENDENTE',
  add column if not exists usuario_id uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text;

alter table public.residuos_anexos
  add column if not exists mime_type text,
  add column if not exists tamanho_bytes bigint,
  add column if not exists storage_path text,
  add column if not exists uploaded_at timestamptz not null default now(),
  add column if not exists created_by text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $constraints$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.residuos_trocas'::regclass and conname = 'residuos_trocas_categoria_ck') then
    alter table public.residuos_trocas add constraint residuos_trocas_categoria_ck check (categoria in ('madeira', 'obs', 'gesso'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.residuos_trocas'::regclass and conname = 'residuos_trocas_status_ck') then
    alter table public.residuos_trocas add constraint residuos_trocas_status_ck check (status in ('PENDENTE', 'CONCLUIDO', 'CANCELADO'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.residuos_trocas'::regclass and conname = 'residuos_trocas_peso_ck') then
    alter table public.residuos_trocas add constraint residuos_trocas_peso_ck check (peso_kg is null or peso_kg >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.residuos_trocas'::regclass and conname = 'residuos_trocas_custo_ck') then
    alter table public.residuos_trocas add constraint residuos_trocas_custo_ck check (custo is null or custo >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.residuos_anexos'::regclass and conname = 'residuos_anexos_tipo_ck') then
    alter table public.residuos_anexos add constraint residuos_anexos_tipo_ck check (tipo in ('foto', 'mtr'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.residuos_anexos'::regclass and conname = 'residuos_anexos_tamanho_ck') then
    alter table public.residuos_anexos add constraint residuos_anexos_tamanho_ck check (tamanho_bytes is null or tamanho_bytes >= 0);
  end if;
end
$constraints$;

create index if not exists residuos_trocas_data_idx on public.residuos_trocas (data_troca desc, created_at desc);
create index if not exists residuos_trocas_status_idx on public.residuos_trocas (status, data_troca desc);
create index if not exists residuos_trocas_categoria_data_idx on public.residuos_trocas (categoria, data_troca desc);
create index if not exists residuos_trocas_usuario_idx on public.residuos_trocas (usuario_id);
create index if not exists residuos_anexos_troca_idx on public.residuos_anexos (troca_id, uploaded_at desc);

alter table public.residuos_trocas enable row level security;
alter table public.residuos_anexos enable row level security;

drop policy if exists residuos_trocas_app_select on public.residuos_trocas;
create policy residuos_trocas_app_select on public.residuos_trocas
  for select to authenticated
  using (public.governanca_is_gestao() or public.governanca_pode('RESÍDUOS', 'ver'));

drop policy if exists residuos_trocas_app_write on public.residuos_trocas;
create policy residuos_trocas_app_write on public.residuos_trocas
  for all to authenticated
  using (public.governanca_is_gestao() or public.governanca_pode('RESÍDUOS', 'editar'))
  with check (public.governanca_is_gestao() or public.governanca_pode('RESÍDUOS', 'editar'));

drop policy if exists residuos_anexos_app_select on public.residuos_anexos;
create policy residuos_anexos_app_select on public.residuos_anexos
  for select to authenticated
  using (public.governanca_is_gestao() or public.governanca_pode('RESÍDUOS', 'ver'));

drop policy if exists residuos_anexos_app_write on public.residuos_anexos;
create policy residuos_anexos_app_write on public.residuos_anexos
  for all to authenticated
  using (public.governanca_is_gestao() or public.governanca_pode('RESÍDUOS', 'editar'))
  with check (public.governanca_is_gestao() or public.governanca_pode('RESÍDUOS', 'editar'));

grant select, insert, update, delete on public.residuos_trocas to authenticated;
grant select, insert, update, delete on public.residuos_anexos to authenticated;

do $permissions$
begin
  if to_regclass('public.governanca_permissoes_modulo') is not null then
    alter table public.governanca_permissoes_modulo drop constraint if exists governanca_permissoes_modulo_ck;
    alter table public.governanca_permissoes_modulo add constraint governanca_permissoes_modulo_ck
      check (modulo in ('AUDITORIA', 'CONSULTA', 'INDICADORES', 'HISTORICO', 'CONFIGURACOES', 'IA', 'CADASTROS', 'RESÍDUOS'));
  end if;
end
$permissions$;

commit;
notify pgrst, 'reload schema';
