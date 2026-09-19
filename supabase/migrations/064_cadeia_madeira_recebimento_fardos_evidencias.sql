-- Tecverde · 064: recupera do recebimento legado a estrutura de material/fardos.
-- Mantém a arquitetura atual da Cadeia da Madeira e não migra auditorias antigas.

begin;

alter table public.cadeia_madeira_lotes
  add column if not exists responsavel_recebimento text,
  add column if not exists transportadora text,
  add column if not exists tipo_madeira text,
  add column if not exists especie text,
  add column if not exists origem text,
  add column if not exists quantidade_pecas integer not null default 0,
  add column if not exists apresentacao_material text not null default 'AVULSA',
  add column if not exists total_fardos integer not null default 0,
  add column if not exists distribuicao_fardos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.cadeia_madeira_lotes'::regclass
      and conname='cadeia_madeira_lotes_quantidade_pecas_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_quantidade_pecas_ck
      check (quantidade_pecas >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.cadeia_madeira_lotes'::regclass
      and conname='cadeia_madeira_lotes_apresentacao_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_apresentacao_ck
      check (apresentacao_material in ('AVULSA','FARDOS'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.cadeia_madeira_lotes'::regclass
      and conname='cadeia_madeira_lotes_total_fardos_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_total_fardos_ck
      check (total_fardos >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.cadeia_madeira_lotes'::regclass
      and conname='cadeia_madeira_lotes_distribuicao_fardos_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_distribuicao_fardos_ck
      check (jsonb_typeof(distribuicao_fardos) = 'array');
  end if;
end
$$;

notify pgrst, 'reload schema';

commit;
