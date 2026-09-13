-- Tecverde · fotos pós-retrabalho e leitura de anexos na Consulta
--
-- A foto de correção vive no mesmo estado canônico da Auditoria de Produto.
-- O sincronizador materializa o arquivo físico em produto_anexos e os
-- metadados em sistema_anexos, sem gravar Base64 no Postgres.

create or replace function private.sync_produto_retrabalho_from_state(p_registros jsonb)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog, pg_temp
as $function$
declare
  r jsonb;
  a jsonb;
  rid text;
  aid text;
  desvio_id text;
begin
  for r in
    select value
    from jsonb_array_elements(coalesce(p_registros, '[]'::jsonb))
  loop
    rid := coalesce(nullif(r->>'id',''), 'audit_' || md5(r::text));

    if not exists (select 1 from public.produto_auditorias pa where pa.id = rid) then
      continue;
    end if;

    for a in
      select value
      from jsonb_array_elements(coalesce(r->'reworkAttachments', '[]'::jsonb))
    loop
      if nullif(a->>'path','') is null then
        continue;
      end if;

      aid := coalesce(nullif(a->>'id',''), 'rework_' || md5(a::text || rid));
      desvio_id := nullif(a->>'deviationId','');

      insert into public.produto_anexos(
        id, auditoria_id, desvio_id, parede_id, tipo, nome_arquivo,
        mime_type, tamanho_bytes, storage_bucket, storage_path, raw, synced_at
      ) values (
        aid, rid, desvio_id, nullif(r->>'wallId',''), 'retrabalho', a->>'name',
        a->>'type', private.safe_numeric(a->>'size')::bigint,
        'auditoria-arquivos', a->>'path', a - 'dataUrl', now()
      )
      on conflict (id) do update set
        auditoria_id = excluded.auditoria_id,
        desvio_id = excluded.desvio_id,
        parede_id = excluded.parede_id,
        tipo = excluded.tipo,
        nome_arquivo = excluded.nome_arquivo,
        mime_type = excluded.mime_type,
        tamanho_bytes = excluded.tamanho_bytes,
        storage_bucket = excluded.storage_bucket,
        storage_path = excluded.storage_path,
        raw = excluded.raw,
        synced_at = now();

      insert into public.sistema_anexos(
        modulo, entidade, registro_id, tipo, nome_arquivo, mime_type,
        tamanho_bytes, storage_bucket, storage_path, metadata,
        origem_tabela, origem_id, created_at, updated_at, deleted_at
      ) values (
        'AUDITORIA DE PRODUTO',
        case when desvio_id is not null then 'produto_desvios' else 'produto_auditorias' end,
        coalesce(desvio_id, rid),
        'retrabalho',
        a->>'name',
        a->>'type',
        private.safe_numeric(a->>'size')::bigint,
        'auditoria-arquivos',
        a->>'path',
        a - 'dataUrl',
        'produto_anexos',
        aid,
        coalesce(private.safe_timestamptz(a->>'uploadedAt'), now()),
        now(),
        null
      )
      on conflict (origem_tabela, origem_id)
        where origem_tabela is not null and origem_id is not null
      do update set
        entidade = excluded.entidade,
        registro_id = excluded.registro_id,
        tipo = excluded.tipo,
        nome_arquivo = excluded.nome_arquivo,
        mime_type = excluded.mime_type,
        tamanho_bytes = excluded.tamanho_bytes,
        storage_bucket = excluded.storage_bucket,
        storage_path = excluded.storage_path,
        metadata = excluded.metadata,
        updated_at = now(),
        deleted_at = null;
    end loop;
  end loop;
end;
$function$;

create or replace function public.qualidade_adicionar_anexo_retrabalho(
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog, pg_temp
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

  update public.auditoria_produto_estado
     set registros = novos_registros,
         updated_by = actor
   where id = 'global';

  return jsonb_build_object('ok', true, 'id', anexo_id);
end;
$function$;

revoke all on function public.qualidade_adicionar_anexo_retrabalho(jsonb)
  from public;
grant execute on function public.qualidade_adicionar_anexo_retrabalho(jsonb)
  to authenticated;

-- A exclusão de um desvio também remove o vínculo das fotos de correção que
-- apontam para ele. O objeto físico segue o mesmo fluxo de limpeza do cliente.
do $migration$
declare
  original text;
  corrigida text;
  bloco_antigo text := $old$        rec := jsonb_set(
          rec,
          '{attachments}',
          coalesce(
            (
              select jsonb_agg(anexo_item)
                from jsonb_array_elements(coalesce(rec -> 'attachments', '[]'::jsonb)) anexo_item
               where coalesce(anexo_item ->> 'deviationId', '') <> desvio_id
            ),
            '[]'::jsonb
          ),
          true
        );
        rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);$old$;
  bloco_novo text := $new$        rec := jsonb_set(
          rec,
          '{attachments}',
          coalesce(
            (
              select jsonb_agg(anexo_item)
                from jsonb_array_elements(coalesce(rec -> 'attachments', '[]'::jsonb)) anexo_item
               where coalesce(anexo_item ->> 'deviationId', '') <> desvio_id
            ),
            '[]'::jsonb
          ),
          true
        );
        rec := jsonb_set(
          rec,
          '{reworkAttachments}',
          coalesce(
            (
              select jsonb_agg(anexo_item)
                from jsonb_array_elements(coalesce(rec -> 'reworkAttachments', '[]'::jsonb)) anexo_item
               where coalesce(anexo_item ->> 'deviationId', '') <> desvio_id
            ),
            '[]'::jsonb
          ),
          true
        );
        rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);$new$;
begin
  select pg_get_functiondef(p.oid)
    into original
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'qualidade_compat_mutacao'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = 'p_operacao text, p_dados jsonb'
   limit 1;

  if original is null then
    raise exception 'Função public.qualidade_compat_mutacao não encontrada';
  end if;

  if position(bloco_antigo in original) = 0 then
    raise exception 'Bloco de exclusão de anexos não encontrado';
  end if;

  corrigida := replace(original, bloco_antigo, bloco_novo);
  if position(bloco_novo in corrigida) = 0 then
    raise exception 'Não foi possível proteger as fotos pós-retrabalho na exclusão';
  end if;

  execute corrigida;
end;
$migration$;
