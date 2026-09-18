-- Tecverde · 062: Ensaios técnicos da Cadeia da Madeira
--
-- Expande as inspeções de recebimento para ensaios de protótipos,
-- placas cimentícias, painéis estruturais e ligações, preservando os
-- registros existentes por meio de valores padrão compatíveis.

begin;

alter table public.cadeia_madeira_inspecoes
  add column if not exists tipo_ensaio text not null default 'RECEBIMENTO_MADEIRA',
  add column if not exists componente_ensaiado text not null default 'MADEIRA_ESTRUTURAL',
  add column if not exists identificacao_prototipo text,
  add column if not exists norma_procedimento text,
  add column if not exists resultado_tecnico text;

do $constraints$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'cadeia_madeira_inspecoes_tipo_ensaio_ck'
       and conrelid = 'public.cadeia_madeira_inspecoes'::regclass
  ) then
    alter table public.cadeia_madeira_inspecoes
      add constraint cadeia_madeira_inspecoes_tipo_ensaio_ck
      check (tipo_ensaio in (
        'RECEBIMENTO_MADEIRA',
        'ESTRUTURAL_PROTOTIPO',
        'DESEMPENHO_PLACA_CIMENTICIA',
        'PAINEL_ESTRUTURAL',
        'MADEIRA_ESTRUTURAL',
        'OUTRO'
      ));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'cadeia_madeira_inspecoes_componente_ck'
       and conrelid = 'public.cadeia_madeira_inspecoes'::regclass
  ) then
    alter table public.cadeia_madeira_inspecoes
      add constraint cadeia_madeira_inspecoes_componente_ck
      check (componente_ensaiado in (
        'MADEIRA_ESTRUTURAL',
        'PLACA_CIMENTICIA',
        'PAINEL_ESTRUTURAL',
        'PROTOTIPO_COMPLETO',
        'LIGACAO_FIXACAO',
        'OUTRO'
      ));
  end if;
end
$constraints$;

create index if not exists cadeia_madeira_inspecoes_tipo_idx
  on public.cadeia_madeira_inspecoes (tipo_ensaio, componente_ensaiado, data_inspecao desc);

notify pgrst, 'reload schema';
commit;
