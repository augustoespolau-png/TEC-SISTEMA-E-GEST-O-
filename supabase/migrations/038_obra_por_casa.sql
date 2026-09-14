-- Obra / Empreendimento por casa da Auditoria de Qualidade.
-- A casa no legado e derivada das paredes em produto_auditorias; por isso
-- este cadastro normaliza os atributos de nivel casa sem repetir a obra
-- em cada parede.

create table if not exists public.qualidade_casas (
  auditoria_id text primary key,
  projeto text not null,
  casa text not null,
  obra text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text null
);

create unique index if not exists qualidade_casas_projeto_casa_uidx
  on public.qualidade_casas (projeto, casa);

alter table public.qualidade_casas enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='qualidade_casas'
      and policyname='qualidade_casas_select'
  ) then
    create policy qualidade_casas_select
      on public.qualidade_casas for select to authenticated
      using (
        public.tecverde_is_principal()
        or public.tecverde_can('AUDITORIA', 'ver')
        or public.tecverde_can('AUDITORIA', 'editar')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='qualidade_casas'
      and policyname='qualidade_casas_insert'
  ) then
    create policy qualidade_casas_insert
      on public.qualidade_casas for insert to authenticated
      with check (
        public.tecverde_is_principal()
        or public.tecverde_can('AUDITORIA', 'editar')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='qualidade_casas'
      and policyname='qualidade_casas_update'
  ) then
    create policy qualidade_casas_update
      on public.qualidade_casas for update to authenticated
      using (
        public.tecverde_is_principal()
        or public.tecverde_can('AUDITORIA', 'editar')
      )
      with check (
        public.tecverde_is_principal()
        or public.tecverde_can('AUDITORIA', 'editar')
      );
  end if;
end $$;

grant select, insert, update on public.qualidade_casas to authenticated;

-- O catalogo obras_projetos ja existe no sistema e e compartilhado por
-- outros modulos. A origem separa as opcoes da Auditoria das obras/codigos
-- da classificacao de madeira.
insert into public.obras_projetos (codigo, nome, origem, status)
select v.codigo, v.nome, 'AUDITORIA_QUALIDADE', 'ativo'
from (values
  ('AUD_MORRO_VERDE', 'Morro Verde'),
  ('AUD_SAO_BERNARDO', 'São Bernardo'),
  ('AUD_ZACARIAS', 'Zacarias')
) as v(codigo, nome)
where not exists (
  select 1 from public.obras_projetos o
  where o.codigo = v.codigo
     or (
       o.origem = 'AUDITORIA_QUALIDADE'
       and lower(coalesce(o.nome, '')) = lower(v.nome)
     )
);

create or replace view public.qualidade_obras as
select id, codigo, nome
from public.obras_projetos
where origem = 'AUDITORIA_QUALIDADE'
  and status = 'ativo'
  and nullif(trim(coalesce(nome, '')), '') is not null;

grant select on public.qualidade_obras to authenticated;

create or replace function private.qualidade_obra_padrao(
  p_projeto text,
  p_casa text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when upper(trim(coalesce(p_projeto, ''))) = 'C4A'
         and nullif(substring(trim(coalesce(p_casa, '')) from '^([0-9]+)'), '')::integer <= 149
      then 'Morro Verde'
    when upper(trim(coalesce(p_projeto, ''))) = 'C4A'
      then null
    when upper(trim(coalesce(p_projeto, ''))) like 'SÃO BERN% DO CAMPO - SP / CASA%'
      or upper(trim(coalesce(p_projeto, ''))) like 'SÃO BERN% DO CAMPO - SP / SOBRADO%'
      then 'São Bernardo'
    when upper(trim(coalesce(p_projeto, ''))) = 'ESCOLA ZACARIAS PR'
      then 'Zacarias'
    else null
  end;
$$;

-- Primeiro preenche o cadastro usando a view existente. ON CONFLICT DO
-- NOTHING preserva qualquer obra que ja tenha sido editada manualmente.
insert into public.qualidade_casas (
  auditoria_id, projeto, casa, obra, updated_by
)
select
  q.id,
  q.projeto,
  q.casa,
  private.qualidade_obra_padrao(q.projeto, q.casa),
  'migration:038_obra_por_casa'
from public.qualidade_auditorias q
on conflict (auditoria_id) do nothing;

-- A view continua sendo a API de leitura das casas, agora incluindo obra.
create or replace view public.qualidade_auditorias as
with base as (
  select
    (coalesce(projeto_id, 'legacy:' || coalesce(projeto_nome, '')) || '|' || casa) as id,
    coalesce(nullif(projeto_nome, ''), projeto_id, 'Projeto não informado') as projeto,
    casa,
    min(coalesce(data_registro, data_inspecao::timestamptz, synced_at)) as created_at,
    null::text as observacao
  from public.produto_auditorias a
  where nullif(trim(casa), '') is not null
    and nullif(trim(coalesce(projeto_nome, projeto_id)), '') is not null
  group by
    (coalesce(projeto_id, 'legacy:' || coalesce(projeto_nome, '')) || '|' || casa),
    coalesce(nullif(projeto_nome, ''), projeto_id, 'Projeto não informado'),
    casa
)
select
  b.id,
  b.projeto,
  b.casa,
  b.created_at,
  b.observacao,
  case
    when qc.auditoria_id is not null then qc.obra
    else private.qualidade_obra_padrao(b.projeto, b.casa)
  end as obra
from base b
left join public.qualidade_casas qc on qc.auditoria_id = b.id;

grant select on public.qualidade_auditorias to authenticated;
