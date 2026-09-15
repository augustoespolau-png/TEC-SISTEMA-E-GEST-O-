-- Diagnóstico interno contínuo: integridade relacional, esqueleto, FPY e reparo allowlisted.
create table if not exists public.sistema_diagnostico_execucoes (
  id uuid primary key default gen_random_uuid(),
  executado_em timestamptz not null default now(),
  origem text not null default 'MANUAL',
  integridade numeric(5,2) not null,
  status text not null,
  criticos integer not null default 0,
  alertas integer not null default 0,
  resultado jsonb not null,
  executado_por uuid null
);

create index if not exists sistema_diagnostico_execucoes_executado_em_idx
  on public.sistema_diagnostico_execucoes (executado_em desc);

alter table public.sistema_diagnostico_execucoes enable row level security;
revoke all on table public.sistema_diagnostico_execucoes from anon, authenticated;

create or replace function private.diagnostico_sistema_coletar()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '12s'
as $function$
declare
  v_orfaos integer := 0;
  v_anexos_orfaos integer := 0;
  v_dup_rel integer := 0;
  v_dup_json integer := 0;
  v_dup_logs integer := 0;
  v_missing_houses integer := 0;
  v_missing_walls integer := 0;
  v_fpy integer := 0;
  v_temporal integer := 0;
  v_critical integer := 0;
  v_warning integer := 0;
  v_score numeric := 100;
  v_status text := 'SAUDAVEL';
  v_orfaos_ex jsonb := '[]'::jsonb;
  v_anexos_orfaos_ex jsonb := '[]'::jsonb;
  v_dup_ex jsonb := '[]'::jsonb;
  v_logs_ex jsonb := '[]'::jsonb;
  v_missing_ex jsonb := '[]'::jsonb;
  v_fpy_ex jsonb := '[]'::jsonb;
  v_temporal_ex jsonb := '[]'::jsonb;
  v_total_auditorias integer := 0;
  v_total_registros integer := 0;
  v_total_inspecionadas integer := 0;
  v_total_desvios integer := 0;
  v_total_fpy integer := 0;
  v_total_na integer := 0;
begin
  select count(*)::int into v_orfaos
    from public.produto_desvios d
    left join public.produto_auditorias a on a.id = d.auditoria_id
   where a.id is null;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_orfaos_ex
    from (
      select d.id, d.auditoria_id, d.tipo_desvio_nome, d.data_inspecao
        from public.produto_desvios d
        left join public.produto_auditorias a on a.id = d.auditoria_id
       where a.id is null
       order by d.data_inspecao desc nulls last, d.id
       limit 20
    ) x;

  select count(*)::int into v_anexos_orfaos
    from public.produto_anexos an
    left join public.produto_desvios d on d.id = an.desvio_id
   where an.desvio_id is not null and d.id is null;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_anexos_orfaos_ex
    from (
      select an.id, an.desvio_id, an.storage_path
        from public.produto_anexos an
        left join public.produto_desvios d on d.id = an.desvio_id
       where an.desvio_id is not null and d.id is null
       order by an.id
       limit 20
    ) x;

  with dups as (
    select projeto_id, casa, coalesce(nullif(parede_id,''), parede_nome) as parede,
           count(*)::int as qtd, array_agg(id order by id) as ids
      from public.produto_auditorias
     group by projeto_id, casa, coalesce(nullif(parede_id,''), parede_nome)
    having count(*) > 1
  )
  select coalesce(sum(qtd - 1),0)::int,
         coalesce(jsonb_agg(to_jsonb(d) order by d.projeto_id, d.casa, d.parede), '[]'::jsonb)
    into v_dup_rel, v_dup_ex
    from (select * from dups limit 20) d;

  with registros as (
    select r->>'projectId' as projeto_id,
           r->>'house' as casa,
           coalesce(nullif(r->>'wallId',''), r->>'wallName') as parede,
           r->>'wallName' as parede_nome
      from public.auditoria_produto_estado s
      cross join lateral jsonb_array_elements(coalesce(s.registros,'[]'::jsonb)) r
     where s.id='global'
  ), dups as (
    select projeto_id, casa, parede, max(parede_nome) as parede_nome, count(*)::int as qtd
      from registros
     group by projeto_id, casa, parede
    having count(*) > 1
  )
  select coalesce(sum(qtd - 1),0)::int into v_dup_json from dups;

  with dups as (
    select actor, action, field, record_label, location_label, occurred_at, count(*)::int as qtd
      from public.produto_historico
     group by actor, action, field, record_label, location_label, occurred_at, from_value, to_value
    having count(*) > 1
  )
  select coalesce(sum(qtd - 1),0)::int,
         coalesce(jsonb_agg(to_jsonb(d) order by d.occurred_at desc), '[]'::jsonb)
    into v_dup_logs, v_logs_ex
    from (select * from dups order by occurred_at desc limit 20) d;

  with cfg as (
    select p.id as projeto_id, p.nome as projeto_nome, w.id as parede_id, w.nome as parede_nome
      from public.produto_projetos p
      join public.produto_paredes w on w.projeto_id=p.id
  ), houses as (
    select distinct r->>'projectId' as projeto_id, r->>'house' as casa
      from public.auditoria_produto_estado s
      cross join lateral jsonb_array_elements(coalesce(s.registros,'[]'::jsonb)) r
     where s.id='global'
       and coalesce(r->>'projectId','')<>''
       and coalesce(r->>'house','')<>''
  ), actual as (
    select r->>'projectId' as projeto_id,
           r->>'house' as casa,
           coalesce(nullif(r->>'wallId',''),r->>'wallName') as parede_chave,
           r->>'wallName' as parede_nome
      from public.auditoria_produto_estado s
      cross join lateral jsonb_array_elements(coalesce(s.registros,'[]'::jsonb)) r
     where s.id='global'
  ), missing as (
    select c.projeto_nome,h.projeto_id,h.casa,c.parede_id,c.parede_nome
      from houses h
      join cfg c on c.projeto_id=h.projeto_id
      left join actual a
        on a.projeto_id=h.projeto_id
       and a.casa=h.casa
       and (a.parede_chave=c.parede_id or a.parede_nome=c.parede_nome)
     where a.projeto_id is null
  ), grouped as (
    select projeto_nome,projeto_id,casa,count(*)::int as faltantes,
           array_agg(parede_nome order by parede_nome) as paredes_faltantes
      from missing
     group by projeto_nome,projeto_id,casa
  )
  select coalesce((select count(*) from grouped),0)::int,
         coalesce((select sum(faltantes) from grouped),0)::int,
         coalesce((select jsonb_agg(to_jsonb(g) order by g.projeto_nome,g.casa)
                     from (select * from grouped order by projeto_nome,casa limit 30) g),'[]'::jsonb)
    into v_missing_houses,v_missing_walls,v_missing_ex;

  with occ as (
    select projeto,casa,parede,count(*)::int as erros
      from public.ocorrencias
     group by projeto,casa,parede
  ), problemas as (
    select 'FPY_SEM_PAREDE'::text as codigo,f.projeto,f.casa,f.parede,f.data,f.erros,null::int as esperado
      from public.fpy_paredes f
      left join public.qualidade_auditorias a on a.projeto=f.projeto and a.casa=f.casa
      left join public.qualidade_auditoria_paredes q on q.auditoria_id=a.id and q.parede=f.parede
     where q.id is null
    union all
    select 'PAREDE_SEM_FPY',a.projeto,a.casa,q.parede,q.data,null::int,null::int
      from public.qualidade_auditoria_paredes q
      join public.qualidade_auditorias a on a.id=q.auditoria_id
      left join public.fpy_paredes f on f.projeto=a.projeto and f.casa=a.casa and f.parede=q.parede
     where f.parede is null
    union all
    select 'DATA_DIVERGENTE',f.projeto,f.casa,f.parede,f.data,f.erros,null::int
      from public.fpy_paredes f
      join public.qualidade_auditorias a on a.projeto=f.projeto and a.casa=f.casa
      join public.qualidade_auditoria_paredes q on q.auditoria_id=a.id and q.parede=f.parede
     where q.data is distinct from f.data
    union all
    select 'ERROS_DIVERGENTES',f.projeto,f.casa,f.parede,f.data,f.erros,coalesce(o.erros,0)::int
      from public.fpy_paredes f
      left join occ o using(projeto,casa,parede)
     where f.erros<>coalesce(o.erros,0)
    union all
    select 'PRIMEIRA_PASSAGEM_DIVERGENTE',f.projeto,f.casa,f.parede,f.data,f.erros,
           case when f.erros=0 then 1 else 0 end::int
      from public.fpy_paredes f
     where f.passou_de_primeira is distinct from (f.erros=0)
  )
  select count(*)::int,
         coalesce(jsonb_agg(to_jsonb(p) order by p.projeto,p.casa,p.parede,p.codigo),'[]'::jsonb)
    into v_fpy,v_fpy_ex
    from (select * from problemas order by projeto,casa,parede,codigo limit 30) p;

  select count(*)::int into v_temporal
    from public.produto_auditorias
   where data_criacao_casa is not null
     and data_inspecao is not null
     and data_inspecao<data_criacao_casa;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_temporal_ex
    from (
      select id,projeto_nome,casa,parede_nome,data_criacao_casa,data_inspecao
        from public.produto_auditorias
       where data_criacao_casa is not null
         and data_inspecao is not null
         and data_inspecao<data_criacao_casa
       order by data_inspecao desc
       limit 20
    ) x;

  select count(*)::int into v_total_auditorias from public.qualidade_auditorias;
  select jsonb_array_length(coalesce(registros,'[]'::jsonb))::int into v_total_registros
    from public.auditoria_produto_estado where id='global';
  select count(*)::int into v_total_inspecionadas from public.qualidade_auditoria_paredes;
  select count(*)::int into v_total_desvios from public.produto_desvios;
  select count(*)::int into v_total_fpy from public.fpy_paredes;
  select count(*)::int into v_total_na from public.produto_na_itens;

  v_critical := v_orfaos + v_dup_rel + v_dup_json + v_fpy;
  v_warning := v_anexos_orfaos + v_dup_logs + v_missing_houses + v_temporal;
  v_score := greatest(0::numeric, 100::numeric
    - case when v_orfaos>0 then 20 else 0 end
    - case when (v_dup_rel+v_dup_json)>0 then 20 else 0 end
    - case when v_fpy>0 then 20 else 0 end
    - case when v_anexos_orfaos>0 then 4 else 0 end
    - case when v_dup_logs>0 then 4 else 0 end
    - case when v_missing_houses>0 then 4 else 0 end
    - case when v_temporal>0 then 4 else 0 end);
  v_status := case when v_critical>0 then 'CRITICO' when v_warning>0 then 'ATENCAO' else 'SAUDAVEL' end;

  return jsonb_build_object(
    'versao',2,
    'checked_at',now(),
    'status',v_status,
    'integrity_percent',v_score,
    'critical_count',v_critical,
    'warning_count',v_warning,
    'anomaly_count',v_critical+v_warning,
    'totals',jsonb_build_object(
      'auditorias',v_total_auditorias,
      'paredes_no_esqueleto',coalesce(v_total_registros,0),
      'paredes_inspecionadas',v_total_inspecionadas,
      'desvios',v_total_desvios,
      'fpy_rows',v_total_fpy,
      'na_itens',v_total_na
    ),
    'metrics',jsonb_build_object(
      'orphan_deviations',v_orfaos,
      'orphan_attachments',v_anexos_orfaos,
      'duplicate_relational_walls',v_dup_rel,
      'duplicate_canonical_walls',v_dup_json,
      'duplicate_quality_logs',v_dup_logs,
      'incomplete_houses',v_missing_houses,
      'missing_required_walls',v_missing_walls,
      'fpy_inconsistencies',v_fpy,
      'temporal_anomalies',v_temporal
    ),
    'issues',jsonb_build_array(
      jsonb_build_object('code','ORPHAN_DEVIATIONS','severity','CRITICA','count',v_orfaos,'auto_repair_safe',false,'message','Desvios sem auditoria/parede relacional correspondente.','examples',v_orfaos_ex),
      jsonb_build_object('code','ORPHAN_ATTACHMENTS','severity','MEDIA','count',v_anexos_orfaos,'auto_repair_safe',false,'message','Metadados de anexos sem desvio relacional correspondente; nenhuma exclusão de arquivo é automática.','examples',v_anexos_orfaos_ex),
      jsonb_build_object('code','DUPLICATE_WALLS','severity','ALTA','count',v_dup_rel+v_dup_json,'auto_repair_safe',false,'message','Duplicidades de parede no relacional ou no estado canônico.','examples',v_dup_ex),
      jsonb_build_object('code','DUPLICATE_QUALITY_LOGS','severity','MEDIA','count',v_dup_logs,'auto_repair_safe',false,'message','Logs de qualidade semanticamente duplicados.','examples',v_logs_ex),
      jsonb_build_object('code','SKELETON_MISSING_WALLS','severity','MEDIA','count',v_missing_houses,'missing_wall_count',v_missing_walls,'auto_repair_safe',true,'message','Casas cujo esqueleto canônico não contém todas as paredes cadastradas no projeto.','examples',v_missing_ex),
      jsonb_build_object('code','FPY_INCONSISTENCY','severity','CRITICA','count',v_fpy,'auto_repair_safe',false,'message','FPY divergente da parede inspecionada, da data ou da contagem de desvios.','examples',v_fpy_ex),
      jsonb_build_object('code','TEMPORAL_ANOMALY','severity','MEDIA','count',v_temporal,'auto_repair_safe',false,'message','Inspeções com data anterior à criação da casa.','examples',v_temporal_ex)
    )
  );
end;
$function$;

create or replace function private.diagnostico_sistema_salvar(p_origem text, p_usuario uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '15s'
as $function$
declare
  v_resultado jsonb;
begin
  v_resultado := private.diagnostico_sistema_coletar();
  insert into public.sistema_diagnostico_execucoes(
    origem, integridade, status, criticos, alertas, resultado, executado_por
  ) values (
    coalesce(nullif(p_origem,''),'MANUAL'),
    coalesce((v_resultado->>'integrity_percent')::numeric,0),
    coalesce(v_resultado->>'status','ATENCAO'),
    coalesce((v_resultado->>'critical_count')::int,0),
    coalesce((v_resultado->>'warning_count')::int,0),
    v_resultado,
    p_usuario
  );
  return v_resultado;
end;
$function$;

create or replace function public.diagnostico_sistema_health_check(p_persistir boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '15s'
as $function$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='gestao'
  ) then
    raise exception 'Sem permissão para executar diagnóstico do sistema' using errcode='42501';
  end if;
  if p_persistir then
    v_resultado := private.diagnostico_sistema_salvar('MANUAL',auth.uid());
  else
    v_resultado := private.diagnostico_sistema_coletar();
  end if;
  return v_resultado;
end;
$function$;

create or replace function public.diagnostico_sistema_ultimo()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  v_resultado jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='gestao'
  ) then
    raise exception 'Sem permissão para consultar diagnóstico do sistema' using errcode='42501';
  end if;
  select resultado into v_resultado
    from public.sistema_diagnostico_execucoes
   order by executado_em desc
   limit 1;
  if v_resultado is null then
    v_resultado := private.diagnostico_sistema_coletar();
  end if;
  return v_resultado;
end;
$function$;

create or replace function public.diagnostico_sistema_reparar(p_codigo text, p_alvo jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '20s'
as $function$
declare
  v_codigo text := upper(trim(coalesce(p_codigo,'')));
  v_projeto text;
  v_projeto_id text;
  v_casas text[];
  v_validas integer := 0;
  v_adicionadas integer := 0;
  v_backup_id bigint;
  v_resultado jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.role='gestao'
  ) then
    raise exception 'Sem permissão para reparar diagnóstico do sistema' using errcode='42501';
  end if;
  if v_codigo <> 'SKELETON_MISSING_WALLS' then
    raise exception 'Código de reparo não permitido: %',v_codigo using errcode='22023';
  end if;

  v_projeto := nullif(trim(p_alvo->>'projeto'),'');
  select array_agg(distinct c order by c) into v_casas
    from jsonb_array_elements_text(coalesce(p_alvo->'casas','[]'::jsonb)) t(c)
   where nullif(trim(c),'') is not null;
  if v_projeto is null or coalesce(cardinality(v_casas),0)=0 then
    raise exception 'Projeto e casas são obrigatórios para o reparo' using errcode='22023';
  end if;

  select id into v_projeto_id from public.produto_projetos
   where lower(nome)=lower(v_projeto) limit 1;
  if v_projeto_id is null then
    raise exception 'Projeto não encontrado: %',v_projeto using errcode='22023';
  end if;

  with cfg as (
    select w.id as parede_id,w.nome as parede_nome
      from public.produto_paredes w where w.projeto_id=v_projeto_id
  ), actual as (
    select r->>'house' as casa,
           coalesce(nullif(r->>'wallId',''),r->>'wallName') as parede_chave,
           r->>'wallName' as parede_nome
      from public.auditoria_produto_estado s
      cross join lateral jsonb_array_elements(coalesce(s.registros,'[]'::jsonb)) r
     where s.id='global' and r->>'projectId'=v_projeto_id
  ), incompletas as (
    select distinct h.casa
      from (select unnest(v_casas) as casa) h
      join cfg c on true
      left join actual a on a.casa=h.casa
       and (a.parede_chave=c.parede_id or a.parede_nome=c.parede_nome)
     where a.casa is null
  )
  select count(*)::int into v_validas from incompletas;

  if v_validas<>cardinality(v_casas) then
    raise exception 'O reparo foi cancelado: alguma casa não está mais incompleta ou não pertence ao alvo atual' using errcode='40001';
  end if;

  perform pg_advisory_xact_lock(hashtext('diagnostico_sistema_reparar'));
  select coalesce(max(backup_id),0)+1 into v_backup_id
    from public.auditoria_produto_estado_backups;

  insert into public.auditoria_produto_estado_backups(
    backup_id,snapshot_at,source,id,configuracao,registros,historico,updated_at,updated_by
  )
  select v_backup_id,now(),'diagnostico:auto_repair:skeleton',id,configuracao,registros,historico,updated_at,updated_by
    from public.auditoria_produto_estado where id='global';

  v_adicionadas := private.garantir_paredes_pendentes(v_projeto,v_casas);
  v_resultado := private.diagnostico_sistema_salvar('AUTO_REPAIR',auth.uid());

  return jsonb_build_object(
    'ok',true,
    'codigo',v_codigo,
    'projeto',v_projeto,
    'casas',to_jsonb(v_casas),
    'paredes_adicionadas',v_adicionadas,
    'backup_id',v_backup_id,
    'health_after',v_resultado
  );
end;
$function$;

create or replace function private.diagnostico_sistema_cron()
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '20s'
as $function$
begin
  perform private.diagnostico_sistema_salvar('CRON',null);
  delete from public.sistema_diagnostico_execucoes
   where executado_em < now()-interval '30 days';
end;
$function$;

revoke execute on function private.diagnostico_sistema_coletar() from public, anon, authenticated;
revoke execute on function private.diagnostico_sistema_salvar(text,uuid) from public, anon, authenticated;
revoke execute on function private.diagnostico_sistema_cron() from public, anon, authenticated;
revoke execute on function public.diagnostico_sistema_health_check(boolean) from public, anon;
revoke execute on function public.diagnostico_sistema_ultimo() from public, anon;
revoke execute on function public.diagnostico_sistema_reparar(text,jsonb) from public, anon;
grant execute on function public.diagnostico_sistema_health_check(boolean) to authenticated;
grant execute on function public.diagnostico_sistema_ultimo() to authenticated;
grant execute on function public.diagnostico_sistema_reparar(text,jsonb) to authenticated;

do $cron$
begin
  if exists (select 1 from cron.job where jobname='diagnostico-sistema-15min') then
    perform cron.unschedule('diagnostico-sistema-15min');
  end if;
  perform cron.schedule(
    'diagnostico-sistema-15min',
    '*/15 * * * *',
    'select private.diagnostico_sistema_cron();'
  );
exception when undefined_table then
  null;
end;
$cron$;

select private.diagnostico_sistema_cron();
