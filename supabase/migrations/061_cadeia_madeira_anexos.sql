-- Tecverde · 061: fotos de inspeção e documentos MTR da Cadeia da Madeira.

begin;

create table if not exists public.cadeia_madeira_anexos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.cadeia_madeira_lotes(id) on delete cascade,
  inspecao_id uuid references public.cadeia_madeira_inspecoes(id) on delete cascade,
  tipo text not null,
  nome_arquivo text not null,
  mime_type text not null,
  tamanho_bytes bigint not null,
  storage_bucket text not null default 'cadeia-madeira',
  storage_path text not null,
  observacoes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cadeia_madeira_anexos_lote_idx
  on public.cadeia_madeira_anexos (lote_id, created_at desc);
create index if not exists cadeia_madeira_anexos_inspecao_idx
  on public.cadeia_madeira_anexos (inspecao_id, created_at desc);
create index if not exists cadeia_madeira_anexos_created_by_idx
  on public.cadeia_madeira_anexos (created_by);

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cadeia_madeira_anexos'::regclass
      and conname = 'cadeia_madeira_anexos_tipo_ck'
  ) then
    alter table public.cadeia_madeira_anexos
      add constraint cadeia_madeira_anexos_tipo_ck
      check (tipo in ('FOTO_INSPECAO', 'MTR'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cadeia_madeira_anexos'::regclass
      and conname = 'cadeia_madeira_anexos_mime_ck'
  ) then
    alter table public.cadeia_madeira_anexos
      add constraint cadeia_madeira_anexos_mime_ck
      check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cadeia_madeira_anexos'::regclass
      and conname = 'cadeia_madeira_anexos_tamanho_ck'
  ) then
    alter table public.cadeia_madeira_anexos
      add constraint cadeia_madeira_anexos_tamanho_ck
      check (tamanho_bytes > 0 and tamanho_bytes <= 20971520);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cadeia_madeira_anexos'::regclass
      and conname = 'cadeia_madeira_anexos_path_ck'
  ) then
    alter table public.cadeia_madeira_anexos
      add constraint cadeia_madeira_anexos_path_ck
      check (storage_bucket = 'cadeia-madeira' and storage_path like 'cadeia-madeira/%');
  end if;
end
$constraints$;

alter table public.cadeia_madeira_anexos enable row level security;
drop policy if exists cadeia_madeira_anexos_select on public.cadeia_madeira_anexos;
create policy cadeia_madeira_anexos_select
on public.cadeia_madeira_anexos for select to authenticated
using (public.cadeia_madeira_pode('ver'));

drop policy if exists cadeia_madeira_anexos_insert on public.cadeia_madeira_anexos;
create policy cadeia_madeira_anexos_insert
on public.cadeia_madeira_anexos for insert to authenticated
with check (public.cadeia_madeira_pode('editar'));

drop policy if exists cadeia_madeira_anexos_update on public.cadeia_madeira_anexos;
create policy cadeia_madeira_anexos_update
on public.cadeia_madeira_anexos for update to authenticated
using (public.cadeia_madeira_pode('editar'))
with check (public.cadeia_madeira_pode('editar'));

drop policy if exists cadeia_madeira_anexos_delete on public.cadeia_madeira_anexos;
create policy cadeia_madeira_anexos_delete
on public.cadeia_madeira_anexos for delete to authenticated
using (public.cadeia_madeira_pode('editar'));

grant select, insert, update, delete on public.cadeia_madeira_anexos to authenticated;

notify pgrst, 'reload schema';
commit;
