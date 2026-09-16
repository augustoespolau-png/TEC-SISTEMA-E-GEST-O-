-- 048 · Corrige a remoção de desvio no hot-path Zero-Latency.
-- O helper dedicado elimina a ambiguidade PL/pgSQL encontrada no smoke test
-- e mantém a superfície interna fora da Data API para usuários comuns.

create or replace function public.qualidade_remover_desvio_direto(
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
set statement_timeout to '5s'
as $function$
declare
  v_desvio_id text := nullif(coalesce(p_dados,'{}'::jsonb)->>'id','');
  v_auditoria_id text;
  v_erros_apagados integer := 0;
  v_agora timestamptz := clock_timestamp();
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if auth.uid() is null or not public.tecverde_can('AUDITORIA','editar') then
    raise exception 'Sem permissão para alterar a auditoria' using errcode='42501';
  end if;
  if v_desvio_id is null then
    raise exception 'Desvio obrigatório';
  end if;

  select d.auditoria_id
    into v_auditoria_id
    from public.produto_desvios d
   where d.id = v_desvio_id
   for update;
  if v_auditoria_id is null then
    raise exception 'Desvio não encontrado';
  end if;

  update public.sistema_anexos sa
     set deleted_at = now(), updated_at = now()
   where sa.origem_tabela = 'produto_anexos'
     and sa.origem_id in (
       select a.id
         from public.produto_anexos a
        where a.desvio_id = v_desvio_id
     );

  delete from public.produto_desvios d where d.id = v_desvio_id;
  get diagnostics v_erros_apagados = row_count;

  update public.produto_auditorias a
     set status = case
           when exists(select 1 from public.produto_desvios d where d.auditoria_id=a.id) then 'DESVIO'
           when a.data_inspecao is null then 'PENDENTE'
           else 'PAREDE_OK'
         end,
         resultado_primeira_passagem = case
           when exists(select 1 from public.produto_desvios d where d.auditoria_id=a.id) then 'ERRO'
           when a.data_inspecao is null then ''
           else 'OK'
         end,
         updated_at_source = v_agora,
         raw = jsonb_set(coalesce(a.raw,'{}'::jsonb), '{updatedAt}', to_jsonb(v_agora), true),
         synced_at = now()
   where a.id = v_auditoria_id;

  return jsonb_build_object(
    'ok', true,
    'erros_apagados', v_erros_apagados,
    'auditoria_linha_id', v_auditoria_id
  );
end;
$function$;

create or replace function public.qualidade_compat_mutacao_fast(
  p_operacao text,
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
set statement_timeout to '5s'
as $function$
declare
  operacao text := upper(trim(coalesce(p_operacao,'')));
begin
  if operacao = 'ZERAR_INSPECAO_PAREDE' then
    return public.qualidade_zerar_parede_direta(coalesce(p_dados,'{}'::jsonb));
  end if;
  if operacao = 'REMOVER_DESVIO' then
    return public.qualidade_remover_desvio_direto(coalesce(p_dados,'{}'::jsonb));
  end if;
  return public.qualidade_mutacao_direta(operacao,coalesce(p_dados,'{}'::jsonb));
end;
$function$;

revoke all on function public.qualidade_remover_desvio_direto(jsonb)
  from public, anon, authenticated;
grant execute on function public.qualidade_remover_desvio_direto(jsonb)
  to service_role;

revoke all on function public.qualidade_compat_mutacao_fast(text,jsonb)
  from public, anon;
grant execute on function public.qualidade_compat_mutacao_fast(text,jsonb)
  to authenticated, service_role;
