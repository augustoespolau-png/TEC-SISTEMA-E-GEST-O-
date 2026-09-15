-- Vincula a foto ao desvio sem reconstruir o array global inteiro.
-- 042 percorria todos os registros e concatenava JSONB N vezes; em produção
-- isso chegou a ~6,8 s por foto. Aqui localizamos a posição exata com
-- WITH ORDINALITY e fazemos um único jsonb_set no elemento da parede.
create or replace function public.qualidade_adicionar_anexo_fast(
  p_auditoria_id text,
  p_parede text,
  p_desvio_id text,
  p_anexo jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  v_registros jsonb;
  v_rec jsonb;
  v_anexos jsonb;
  v_idx bigint;
  projeto_id text;
  casa text;
  ator text;
  agora text;
  anexo_id text;
  storage_path text;
  auditoria_rel_id text;
  parede_id text;
begin
  if auth.uid() is null or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar a auditoria' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_auditoria_id,'')), '') is null
     or nullif(trim(coalesce(p_parede,'')), '') is null
     or nullif(trim(coalesce(p_desvio_id,'')), '') is null
     or coalesce(jsonb_typeof(p_anexo), '') <> 'object' then
    raise exception 'Auditoria, parede, desvio e anexo são obrigatórios';
  end if;

  anexo_id := nullif(p_anexo->>'id','');
  storage_path := nullif(p_anexo->>'path','');
  if anexo_id is null or storage_path is null then
    raise exception 'O anexo precisa ter id e path do Supabase Storage';
  end if;
  if p_anexo ? 'dataUrl' then
    raise exception 'Base64 não é aceito para anexos';
  end if;

  projeto_id := split_part(p_auditoria_id, '|', 1);
  casa := nullif(split_part(p_auditoria_id, '|', 2), '');
  if nullif(projeto_id,'') is null or casa is null then
    raise exception 'Auditoria inválida';
  end if;

  ator := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);
  agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  select registros
    into v_registros
    from public.auditoria_produto_estado
   where id = 'global'
   for update;
  if not found then
    raise exception 'Estado legado da auditoria não encontrado';
  end if;

  select e.ordinality, e.value
    into v_idx, v_rec
    from jsonb_array_elements(coalesce(v_registros, '[]'::jsonb)) with ordinality as e(value, ordinality)
   where e.value->>'projectId' = projeto_id
     and e.value->>'house' = casa
     and (e.value->>'wallName' = p_parede or e.value->>'wallId' = p_parede)
     and exists (
       select 1
         from jsonb_array_elements(coalesce(e.value->'deviations','[]'::jsonb)) d(value)
        where d.value->>'id' = p_desvio_id
     )
   limit 1;

  if v_idx is null then
    raise exception 'Desvio não encontrado nessa parede';
  end if;

  parede_id := coalesce(nullif(v_rec->>'wallId',''), p_parede);
  v_anexos := coalesce(v_rec->'attachments','[]'::jsonb);
  if not exists (
    select 1 from jsonb_array_elements(v_anexos) a(value)
     where a.value->>'id' = anexo_id
  ) then
    v_anexos := v_anexos || jsonb_build_array(
      jsonb_build_object(
        'id', anexo_id,
        'name', coalesce(nullif(p_anexo->>'name',''), 'foto-desvio'),
        'type', coalesce(nullif(p_anexo->>'type',''), 'image/jpeg'),
        'size', coalesce(p_anexo->>'size','0'),
        'path', storage_path,
        'deviationId', p_desvio_id,
        'wallId', parede_id
      )
    );
    v_rec := jsonb_set(v_rec, '{attachments}', v_anexos, true);
    v_rec := jsonb_set(v_rec, '{updatedAt}', to_jsonb(agora), true);
    v_registros := jsonb_set(v_registros, array[(v_idx - 1)::text], v_rec, false);
  end if;

  select pd.auditoria_id into auditoria_rel_id
    from public.produto_desvios pd
   where pd.id = p_desvio_id
   limit 1;
  if auditoria_rel_id is null then
    raise exception 'Desvio relacional não encontrado';
  end if;

  perform set_config('tecverde.skip_produto_full_sync','on',true);
  update public.auditoria_produto_estado
     set registros = v_registros, updated_by = ator
   where id = 'global';

  insert into public.produto_anexos(
    id,auditoria_id,desvio_id,parede_id,tipo,nome_arquivo,mime_type,
    tamanho_bytes,storage_bucket,storage_path,raw,synced_at
  ) values (
    anexo_id,auditoria_rel_id,p_desvio_id,parede_id,'desvio',
    coalesce(nullif(p_anexo->>'name',''),'foto-desvio'),
    coalesce(nullif(p_anexo->>'type',''),'image/jpeg'),
    case when coalesce(p_anexo->>'size','') ~ '^[0-9]+$' then (p_anexo->>'size')::bigint else 0 end,
    'auditoria-arquivos',storage_path,p_anexo - 'dataUrl',now()
  )
  on conflict(id) do update set
    auditoria_id=excluded.auditoria_id,
    desvio_id=excluded.desvio_id,
    parede_id=excluded.parede_id,
    tipo=excluded.tipo,
    nome_arquivo=excluded.nome_arquivo,
    mime_type=excluded.mime_type,
    tamanho_bytes=excluded.tamanho_bytes,
    storage_bucket=excluded.storage_bucket,
    storage_path=excluded.storage_path,
    raw=excluded.raw,
    synced_at=now();

  insert into public.sistema_anexos(
    modulo,entidade,registro_id,tipo,nome_arquivo,mime_type,tamanho_bytes,
    storage_bucket,storage_path,metadata,origem_tabela,origem_id,
    created_at,updated_at,deleted_at
  ) values (
    'AUDITORIA DE PRODUTO','produto_desvios',p_desvio_id,'desvio',
    coalesce(nullif(p_anexo->>'name',''),'foto-desvio'),
    coalesce(nullif(p_anexo->>'type',''),'image/jpeg'),
    case when coalesce(p_anexo->>'size','') ~ '^[0-9]+$' then (p_anexo->>'size')::bigint else 0 end,
    'auditoria-arquivos',storage_path,p_anexo - 'dataUrl','produto_anexos',anexo_id,
    now(),now(),null
  )
  on conflict (origem_tabela,origem_id)
    where origem_tabela is not null and origem_id is not null
  do update set
    entidade=excluded.entidade,
    registro_id=excluded.registro_id,
    tipo=excluded.tipo,
    nome_arquivo=excluded.nome_arquivo,
    mime_type=excluded.mime_type,
    tamanho_bytes=excluded.tamanho_bytes,
    storage_bucket=excluded.storage_bucket,
    storage_path=excluded.storage_path,
    metadata=excluded.metadata,
    updated_at=now(),
    deleted_at=null;

  perform set_config('tecverde.skip_produto_full_sync','off',true);
  return jsonb_build_object('ok',true,'id',anexo_id);
exception when others then
  perform set_config('tecverde.skip_produto_full_sync','off',true);
  raise;
end;
$function$;
