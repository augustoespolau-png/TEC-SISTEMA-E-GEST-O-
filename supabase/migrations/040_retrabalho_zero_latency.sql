-- Zero-latency para alteração de status/retrabalho.
-- Mantém o estado canônico legado, mas reprojeta somente a parede afetada.

create or replace function public.qualidade_compat_mutacao_fast(
  p_operacao text,
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '12s'
as $function$
declare
  operacao text := upper(trim(coalesce(p_operacao, '')));
  resultado jsonb;
  auditoria_id text;
  parede text;
  desvio_id text;
  sincronizou boolean;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if operacao not in (
    'MARCAR_PAREDE_OK',
    'ALTERAR_DATA_PAREDE',
    'REGISTRAR_DESVIO',
    'ADICIONAR_NAS',
    'ADICIONAR_ANEXO',
    'ATUALIZAR_DESVIO'
  ) then
    return public.qualidade_compat_mutacao(operacao, p_dados);
  end if;

  if operacao = 'ATUALIZAR_DESVIO' then
    desvio_id := nullif(p_dados->>'id','');
    if desvio_id is null then
      raise exception 'Desvio obrigatório';
    end if;

    select pa.projeto_id || '|' || pa.casa,
           coalesce(nullif(pa.parede_nome,''), pa.parede_id)
      into auditoria_id, parede
      from public.produto_desvios pd
      join public.produto_auditorias pa on pa.id = pd.auditoria_id
     where pd.id = desvio_id
     limit 1;

    if auditoria_id is null or parede is null then
      return public.qualidade_compat_mutacao(operacao, p_dados);
    end if;
  else
    auditoria_id := nullif(p_dados->>'auditoria_id','');
    parede := nullif(p_dados->>'parede','');
    if auditoria_id is null or parede is null then
      raise exception 'Auditoria e parede são obrigatórias';
    end if;
  end if;

  perform set_config('tecverde.skip_produto_full_sync','on',true);
  resultado := public.qualidade_compat_mutacao(operacao,p_dados);
  sincronizou := private.sync_produto_parede_incremental(auditoria_id,parede);

  if not sincronizou then
    perform set_config('tecverde.skip_produto_full_sync','off',true);
    update public.auditoria_produto_estado
       set updated_by = updated_by
     where id = 'global';
  elsif operacao = 'ATUALIZAR_DESVIO' then
    select to_jsonb(o)
      into resultado
      from public.ocorrencias o
     where o.id = desvio_id;
  end if;

  perform set_config('tecverde.skip_produto_full_sync','off',true);
  return coalesce(resultado, jsonb_build_object('ok', true));
exception
  when others then
    perform set_config('tecverde.skip_produto_full_sync','off',true);
    raise;
end;
$function$;

create or replace function public.qualidade_adicionar_anexo_retrabalho(
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
as $function$
declare
  estado public.auditoria_produto_estado%rowtype;
  registros jsonb;
  novos_registros jsonb := '[]'::jsonb;
  rec jsonb;
  item jsonb;
  anexos jsonb;
  anexo jsonb;
  anexo_salvo jsonb;
  desvio_id text;
  anexo_id text;
  caminho text;
  actor text;
  agora text;
  encontrou boolean := false;
  encontrou_neste boolean;
  auditoria_alvo text;
  parede_alvo text;
  sincronizou boolean;
begin
  if auth.uid() is null
     or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar a auditoria'
      using errcode = '42501';
  end if;

  anexo := p_dados -> 'anexo';
  desvio_id := nullif(p_dados ->> 'deviation_id', '');
  anexo_id := nullif(anexo ->> 'id', '');
  caminho := nullif(anexo ->> 'path', '');

  if desvio_id is null
     or coalesce(jsonb_typeof(anexo), '') <> 'object'
     or anexo_id is null
     or caminho is null then
    raise exception 'Desvio e anexo são obrigatórios';
  end if;

  if anexo ? 'dataUrl' then
    raise exception 'Base64 não é aceito para anexos';
  end if;

  if split_part(caminho, '/', 1) <> 'produto'
     or split_part(caminho, '/', 2) <> auth.uid()::text
     or caminho like '%..%' then
    raise exception 'Caminho de anexo inválido';
  end if;

  actor := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);
  agora := to_char(
    clock_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  select *
    into estado
    from public.auditoria_produto_estado
   where id = 'global'
   for update;

  if not found then
    raise exception 'Estado legado da auditoria não encontrado';
  end if;

  registros := coalesce(estado.registros, '[]'::jsonb);

  for rec in select value from jsonb_array_elements(registros)
  loop
    encontrou_neste := false;
    for item in
      select value from jsonb_array_elements(coalesce(rec -> 'deviations', '[]'::jsonb))
    loop
      if item ->> 'id' = desvio_id then
        encontrou := true;
        encontrou_neste := true;
        auditoria_alvo := nullif(rec->>'projectId','') || '|' || nullif(rec->>'house','');
        parede_alvo := coalesce(nullif(rec->>'wallName',''), nullif(rec->>'wallId',''));
        exit;
      end if;
    end loop;

    if encontrou_neste and rec -> 'reworkAttachments' is null then
      anexos := '[]'::jsonb;
    elsif encontrou_neste then
      anexos := case
        when jsonb_typeof(rec -> 'reworkAttachments') = 'array'
          then rec -> 'reworkAttachments'
        else '[]'::jsonb
      end;
    end if;

    if encontrou_neste then
      if not exists (
        select 1
          from jsonb_array_elements(anexos) existente
         where existente ->> 'id' = anexo_id
      ) then
        anexo_salvo := jsonb_build_object(
          'id', anexo_id,
          'name', coalesce(nullif(anexo ->> 'name', ''), 'foto-pos-retrabalho.jpg'),
          'type', coalesce(nullif(anexo ->> 'type', ''), 'image/jpeg'),
          'size', coalesce(anexo -> 'size', '0'::jsonb),
          'path', caminho,
          'deviationId', desvio_id,
          'wallId', coalesce(nullif(anexo ->> 'wallId', ''), rec ->> 'wallId'),
          'wallName', coalesce(nullif(anexo ->> 'wallName', ''), rec ->> 'wallName'),
          'projectId', coalesce(nullif(anexo ->> 'projectId', ''), rec ->> 'projectId'),
          'uploadedAt', coalesce(nullif(anexo ->> 'uploadedAt', ''), agora),
          'by', actor
        );
        anexos := anexos || jsonb_build_array(anexo_salvo);
      end if;
      rec := jsonb_set(rec, '{reworkAttachments}', anexos, true);
      rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);
    end if;

    novos_registros := novos_registros || jsonb_build_array(rec);
  end loop;

  if not encontrou then
    raise exception 'Desvio não encontrado';
  end if;

  perform set_config('tecverde.skip_produto_full_sync','on',true);
  update public.auditoria_produto_estado
     set registros = novos_registros,
         updated_by = actor
   where id = 'global';

  sincronizou := private.sync_produto_parede_incremental(auditoria_alvo, parede_alvo);
  if not sincronizou then
    perform set_config('tecverde.skip_produto_full_sync','off',true);
    update public.auditoria_produto_estado
       set updated_by = updated_by
     where id = 'global';
  end if;
  perform set_config('tecverde.skip_produto_full_sync','off',true);

  return jsonb_build_object('ok', true, 'id', anexo_id);
exception
  when others then
    perform set_config('tecverde.skip_produto_full_sync','off',true);
    raise;
end;
$function$;