-- 046 · Zero-Latency real no caminho operacional
--
-- A regressão anterior ainda reescrevia auditoria_produto_estado.registros
-- (~1.078 paredes) antes de sincronizar uma única parede. Este hot-path não
-- toca no snapshot JSON global: opera diretamente nas tabelas relacionais.

create or replace function public.qualidade_zerar_parede_direta(
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  auditoria_chave text := nullif(p_dados->>'auditoria_id','');
  parede text := nullif(p_dados->>'parede','');
  linha_id text;
  ator text;
  agora timestamptz := clock_timestamp();
  erros_apagados integer := 0;
  nas_apagados integer := 0;
  arquivos_removidos jsonb := '[]'::jsonb;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if auth.uid() is null
     or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar a auditoria'
      using errcode = '42501';
  end if;

  if auditoria_chave is null or parede is null then
    raise exception 'Auditoria e parede são obrigatórias';
  end if;

  linha_id := private.qualidade_resolver_parede(auditoria_chave, parede);
  if linha_id is null then
    raise exception 'Parede não encontrada nessa auditoria';
  end if;

  ator := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);

  select count(*)::integer
    into erros_apagados
    from public.produto_desvios d
   where d.auditoria_id = linha_id;

  select count(*)::integer
    into nas_apagados
    from public.produto_na_itens n
   where n.auditoria_id = linha_id;

  select coalesce(jsonb_agg(distinct a.storage_path), '[]'::jsonb)
    into arquivos_removidos
    from public.produto_anexos a
   where a.auditoria_id = linha_id
     and nullif(a.storage_path, '') is not null;

  update public.sistema_anexos sa
     set deleted_at = now(),
         updated_at = now()
   where sa.origem_tabela = 'produto_anexos'
     and sa.origem_id in (
       select a.id
         from public.produto_anexos a
        where a.auditoria_id = linha_id
     );

  delete from public.produto_anexos
   where auditoria_id = linha_id;

  delete from public.produto_desvios
   where auditoria_id = linha_id;

  delete from public.produto_na_itens
   where auditoria_id = linha_id;

  update public.produto_auditorias a
     set status = 'PENDENTE',
         resultado_primeira_passagem = '',
         data_inspecao = null,
         setor_id = '',
         setor_nome = '',
         criticalidade = '',
         descricao = '',
         tipo_desvio_id = '',
         tipo_desvio_nome = '',
         updated_at_source = agora,
         raw = coalesce(a.raw, '{}'::jsonb) || jsonb_build_object(
           'status', 'PENDENTE',
           'inspectionDate', '',
           'firstPassResult', '',
           'deviations', '[]'::jsonb,
           'naItems', '[]'::jsonb,
           'attachments', '[]'::jsonb,
           'reworkAttachments', '[]'::jsonb,
           'reworkDate', '',
           'criticality', '',
           'description', '',
           'errorTypeId', '',
           'errorTypeName', '',
           'sectorId', '',
           'sectorName', '',
           'updatedAt', agora,
           'updatedBy', ator
         ),
         synced_at = now()
   where a.id = linha_id;

  return jsonb_build_object(
    'ok', true,
    'erros_apagados', erros_apagados,
    'nas_apagados', nas_apagados,
    'arquivos_removidos', arquivos_removidos
  );
end;
$function$;

revoke all on function public.qualidade_zerar_parede_direta(jsonb) from public, anon;
grant execute on function public.qualidade_zerar_parede_direta(jsonb) to authenticated, service_role;

create or replace function public.qualidade_compat_mutacao_fast(
  p_operacao text,
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  operacao text := upper(trim(coalesce(p_operacao, '')));
begin
  if operacao = 'ZERAR_INSPECAO_PAREDE' then
    return public.qualidade_zerar_parede_direta(coalesce(p_dados, '{}'::jsonb));
  end if;

  return public.qualidade_mutacao_direta(
    operacao,
    coalesce(p_dados, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.qualidade_compat_mutacao_fast(text,jsonb) from public, anon;
grant execute on function public.qualidade_compat_mutacao_fast(text,jsonb) to authenticated, service_role;

comment on function public.qualidade_compat_mutacao_fast(text,jsonb) is
'Zero-Latency: mutações quentes operam diretamente nas tabelas relacionais; não reescreve auditoria_produto_estado.registros. Reset de parede usa função direta dedicada.';
