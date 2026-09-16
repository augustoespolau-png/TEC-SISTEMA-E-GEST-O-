-- ============================================================
-- 045 · AI Suite — analytics allowlisted, sem SQL gerado por modelo
-- A função é SECURITY INVOKER e reforça papel de Gestão no próprio banco.
-- ============================================================

create or replace function public.ai_suite_consulta(
  p_intent text,
  p_projeto text default null,
  p_dias integer default null,
  p_limite integer default 5
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_catalog', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  v_intent text := lower(trim(coalesce(p_intent, '')));
  v_projeto text := nullif(trim(coalesce(p_projeto, '')), '');
  v_dias integer := p_dias;
  v_limite integer := coalesce(p_limite, 5);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_inicio date;
  v_resultado jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'gestao'
  ) then
    raise exception 'Acesso restrito à Gestão.' using errcode = '42501';
  end if;

  if v_intent not in (
    'top_casas_desvios', 'fpy_consolidado', 'top_tipos_desvio',
    'tendencia_semanal', 'equipes_setores', 'resumo_periodo', 'resumo_semanal'
  ) then
    raise exception 'Intenção analítica não permitida.' using errcode = '22023';
  end if;
  if v_projeto is not null and length(v_projeto) > 120 then
    raise exception 'Projeto inválido.' using errcode = '22023';
  end if;
  if v_dias is not null and (v_dias < 1 or v_dias > 3660) then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;
  if v_limite < 1 or v_limite > 20 then
    raise exception 'Limite inválido.' using errcode = '22023';
  end if;

  v_inicio := case when v_dias is null then null else v_hoje - (v_dias - 1) end;

  if v_intent = 'top_casas_desvios' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.desvios desc, x.criticos desc, x.projeto, x.casa), '[]'::jsonb)
    into v_resultado
    from (
      select o.projeto, o.casa,
             count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(o.criticidade, '')) = 'CRITICO')::integer as criticos,
             count(distinct o.parede)::integer as paredes_afetadas
      from public.ocorrencias o
      where (v_projeto is null or lower(trim(o.projeto)) = lower(v_projeto))
        and (v_inicio is null or o.data >= v_inicio)
        and o.data <= v_hoje
      group by o.projeto, o.casa
      order by desvios desc, criticos desc, o.projeto, o.casa
      limit v_limite
    ) x;
    return jsonb_build_object('intent', v_intent, 'projeto', v_projeto, 'inicio', v_inicio, 'fim', v_hoje, 'rows', v_resultado);
  end if;

  if v_intent = 'fpy_consolidado' then
    select jsonb_build_object(
      'paredes', count(*)::integer,
      'primeira_passagem', count(*) filter (where f.passou_de_primeira is true)::integer,
      'fpy', case when count(*) = 0 then null else round((100.0 * count(*) filter (where f.passou_de_primeira is true) / count(*))::numeric, 2) end,
      'desvios', coalesce(sum(f.erros), 0)::integer,
      'nao_aplicaveis', coalesce(sum(f.nao_aplicaveis), 0)::integer
    ) into v_resultado
    from public.fpy_paredes f
    where (v_projeto is null or lower(trim(f.projeto)) = lower(v_projeto))
      and (v_inicio is null or f.data >= v_inicio)
      and f.data <= v_hoje;
    return jsonb_build_object('intent', v_intent, 'projeto', v_projeto, 'inicio', v_inicio, 'fim', v_hoje, 'metrics', v_resultado);
  end if;

  if v_intent = 'top_tipos_desvio' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.desvios desc, x.criticos desc, x.tipo), '[]'::jsonb)
    into v_resultado
    from (
      select coalesce(nullif(trim(o.tipo_erro), ''), 'Não informado') as tipo,
             count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(o.criticidade, '')) = 'CRITICO')::integer as criticos,
             count(distinct o.casa)::integer as casas_afetadas
      from public.ocorrencias o
      where (v_projeto is null or lower(trim(o.projeto)) = lower(v_projeto))
        and (v_inicio is null or o.data >= v_inicio)
        and o.data <= v_hoje
      group by coalesce(nullif(trim(o.tipo_erro), ''), 'Não informado')
      order by desvios desc, criticos desc, tipo
      limit v_limite
    ) x;
    return jsonb_build_object('intent', v_intent, 'projeto', v_projeto, 'inicio', v_inicio, 'fim', v_hoje, 'rows', v_resultado);
  end if;

  if v_intent = 'equipes_setores' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.desvios desc, x.criticos desc, x.equipe), '[]'::jsonb)
    into v_resultado
    from (
      select coalesce(nullif(trim(o.setor), ''), 'Não informado') as equipe,
             count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(o.criticidade, '')) = 'CRITICO')::integer as criticos,
             count(distinct o.casa)::integer as casas_afetadas
      from public.ocorrencias o
      where (v_projeto is null or lower(trim(o.projeto)) = lower(v_projeto))
        and (v_inicio is null or o.data >= v_inicio)
        and o.data <= v_hoje
      group by coalesce(nullif(trim(o.setor), ''), 'Não informado')
      order by desvios desc, criticos desc, equipe
      limit v_limite
    ) x;
    return jsonb_build_object('intent', v_intent, 'projeto', v_projeto, 'inicio', v_inicio, 'fim', v_hoje, 'rows', v_resultado);
  end if;

  if v_intent = 'tendencia_semanal' then
    if v_dias is null then v_dias := 56; v_inicio := v_hoje - 55; end if;
    with fw as (
      select date_trunc('week', f.data::timestamp)::date as semana,
             count(*)::integer as paredes,
             count(*) filter (where f.passou_de_primeira is true)::integer as primeira_passagem,
             case when count(*) = 0 then null else round((100.0 * count(*) filter (where f.passou_de_primeira is true) / count(*))::numeric, 2) end as fpy
      from public.fpy_paredes f
      where (v_projeto is null or lower(trim(f.projeto)) = lower(v_projeto))
        and f.data >= v_inicio and f.data <= v_hoje
      group by 1
    ), ow as (
      select date_trunc('week', o.data::timestamp)::date as semana,
             count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(o.criticidade, '')) = 'CRITICO')::integer as criticos
      from public.ocorrencias o
      where (v_projeto is null or lower(trim(o.projeto)) = lower(v_projeto))
        and o.data >= v_inicio and o.data <= v_hoje
      group by 1
    )
    select coalesce(jsonb_agg(to_jsonb(x) order by x.semana), '[]'::jsonb)
    into v_resultado
    from (
      select coalesce(fw.semana, ow.semana) as semana,
             coalesce(fw.paredes, 0)::integer as paredes,
             coalesce(fw.primeira_passagem, 0)::integer as primeira_passagem,
             fw.fpy,
             coalesce(ow.desvios, 0)::integer as desvios,
             coalesce(ow.criticos, 0)::integer as criticos
      from fw full join ow on ow.semana = fw.semana
      order by 1
    ) x;
    return jsonb_build_object('intent', v_intent, 'projeto', v_projeto, 'inicio', v_inicio, 'fim', v_hoje, 'rows', v_resultado);
  end if;

  if v_intent = 'resumo_periodo' then
    if v_dias is null then v_dias := 7; v_inicio := v_hoje - 6; end if;
    with f as (
      select count(*)::integer as paredes,
             count(*) filter (where passou_de_primeira is true)::integer as primeira_passagem,
             case when count(*) = 0 then null else round((100.0 * count(*) filter (where passou_de_primeira is true) / count(*))::numeric, 2) end as fpy
      from public.fpy_paredes
      where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between v_inicio and v_hoje
    ), o as (
      select count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(criticidade, '')) = 'CRITICO')::integer as criticos,
             count(distinct casa)::integer as casas_afetadas
      from public.ocorrencias
      where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between v_inicio and v_hoje
    )
    select jsonb_build_object('paredes', f.paredes, 'primeira_passagem', f.primeira_passagem, 'fpy', f.fpy,
                              'desvios', o.desvios, 'criticos', o.criticos, 'casas_afetadas', o.casas_afetadas)
    into v_resultado from f cross join o;
    return jsonb_build_object('intent', v_intent, 'projeto', v_projeto, 'inicio', v_inicio, 'fim', v_hoje, 'metrics', v_resultado);
  end if;

  with fa as (
    select count(*)::integer as paredes,
           count(*) filter (where passou_de_primeira is true)::integer as primeira_passagem,
           case when count(*) = 0 then null else round((100.0 * count(*) filter (where passou_de_primeira is true) / count(*))::numeric, 2) end as fpy
    from public.fpy_paredes
    where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between (v_hoje - 6) and v_hoje
  ), fp as (
    select count(*)::integer as paredes,
           count(*) filter (where passou_de_primeira is true)::integer as primeira_passagem,
           case when count(*) = 0 then null else round((100.0 * count(*) filter (where passou_de_primeira is true) / count(*))::numeric, 2) end as fpy
    from public.fpy_paredes
    where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between (v_hoje - 13) and (v_hoje - 7)
  ), oa as (
    select count(*)::integer as desvios,
           count(*) filter (where upper(coalesce(criticidade, '')) = 'CRITICO')::integer as criticos,
           count(distinct casa)::integer as casas_afetadas
    from public.ocorrencias
    where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between (v_hoje - 6) and v_hoje
  ), op as (
    select count(*)::integer as desvios,
           count(*) filter (where upper(coalesce(criticidade, '')) = 'CRITICO')::integer as criticos,
           count(distinct casa)::integer as casas_afetadas
    from public.ocorrencias
    where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between (v_hoje - 13) and (v_hoje - 7)
  ), top_casas as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.desvios desc, x.criticos desc), '[]'::jsonb) as rows
    from (
      select projeto, casa, count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(criticidade, '')) = 'CRITICO')::integer as criticos
      from public.ocorrencias
      where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between (v_hoje - 6) and v_hoje
      group by projeto, casa order by desvios desc, criticos desc limit 5
    ) x
  ), top_tipos as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.desvios desc, x.criticos desc), '[]'::jsonb) as rows
    from (
      select coalesce(nullif(trim(tipo_erro), ''), 'Não informado') as tipo,
             count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(criticidade, '')) = 'CRITICO')::integer as criticos
      from public.ocorrencias
      where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between (v_hoje - 6) and v_hoje
      group by 1 order by desvios desc, criticos desc limit 5
    ) x
  ), top_equipes as (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.desvios desc, x.criticos desc), '[]'::jsonb) as rows
    from (
      select coalesce(nullif(trim(setor), ''), 'Não informado') as equipe,
             count(*)::integer as desvios,
             count(*) filter (where upper(coalesce(criticidade, '')) = 'CRITICO')::integer as criticos
      from public.ocorrencias
      where (v_projeto is null or lower(trim(projeto)) = lower(v_projeto)) and data between (v_hoje - 6) and v_hoje
      group by 1 order by desvios desc, criticos desc limit 5
    ) x
  )
  select jsonb_build_object(
    'intent', v_intent, 'projeto', v_projeto, 'inicio', v_hoje - 6, 'fim', v_hoje,
    'anterior_inicio', v_hoje - 13, 'anterior_fim', v_hoje - 7,
    'atual', jsonb_build_object('paredes', fa.paredes, 'primeira_passagem', fa.primeira_passagem, 'fpy', fa.fpy,
                                'desvios', oa.desvios, 'criticos', oa.criticos, 'casas_afetadas', oa.casas_afetadas),
    'anterior', jsonb_build_object('paredes', fp.paredes, 'primeira_passagem', fp.primeira_passagem, 'fpy', fp.fpy,
                                   'desvios', op.desvios, 'criticos', op.criticos, 'casas_afetadas', op.casas_afetadas),
    'top_casas', top_casas.rows, 'top_tipos', top_tipos.rows, 'top_equipes', top_equipes.rows
  ) into v_resultado
  from fa cross join fp cross join oa cross join op cross join top_casas cross join top_tipos cross join top_equipes;

  return v_resultado;
end;
$function$;

revoke all on function public.ai_suite_consulta(text, text, integer, integer) from public;
revoke all on function public.ai_suite_consulta(text, text, integer, integer) from anon;
grant execute on function public.ai_suite_consulta(text, text, integer, integer) to authenticated;
