-- Tecverde · corrige o contrato do caminho da foto do desvio.
--
-- Os catálogos legados usam IDs numéricos, enquanto produto_auditorias e
-- produto_paredes usam os IDs estáveis de origem. O frontend grava o caminho
-- com os IDs estáveis; a versão anterior comparava o quinto segmento com o
-- nome da parede e rejeitava a foto com "Caminho de anexo inválido".
--
-- A política de UPDATE permite que o upload use upsert=true. Isso torna um
-- retry idempotente quando o celular perde a resposta depois de o objeto já
-- ter chegado ao Storage.

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
  projeto_id text;
  casa text;
  ator text;
  anexo_id text;
  storage_path text;
  nome_arquivo text;
  mime_type text;
  tamanho_bytes bigint;
  auditoria_rel_id text;
  parede_id text;
begin
  if auth.uid() is null or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar a auditoria'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_auditoria_id, '')), '') is null
     or nullif(trim(coalesce(p_parede, '')), '') is null
     or nullif(trim(coalesce(p_desvio_id, '')), '') is null
     or coalesce(jsonb_typeof(p_anexo), '') <> 'object' then
    raise exception 'Auditoria, parede, desvio e anexo são obrigatórios';
  end if;

  anexo_id := nullif(trim(p_anexo ->> 'id'), '');
  storage_path := nullif(trim(p_anexo ->> 'path'), '');
  nome_arquivo := coalesce(nullif(trim(p_anexo ->> 'name'), ''), 'foto-desvio');
  mime_type := lower(coalesce(nullif(trim(p_anexo ->> 'type'), ''), 'image/jpeg'));

  begin
    tamanho_bytes := nullif(trim(p_anexo ->> 'size'), '')::bigint;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Tamanho do anexo inválido';
  end;

  if anexo_id is null or storage_path is null or tamanho_bytes is null then
    raise exception 'O anexo precisa ter id, tamanho e path do Supabase Storage';
  end if;

  if p_anexo ? 'dataUrl' then
    raise exception 'Base64 não é aceito para anexos';
  end if;

  if mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'A foto precisa estar em JPEG, PNG ou WebP';
  end if;

  if tamanho_bytes <= 0 or tamanho_bytes > 20971520 then
    raise exception 'A foto precisa ter entre 1 byte e 20 MB';
  end if;

  projeto_id := nullif(trim(split_part(p_auditoria_id, '|', 1)), '');
  casa := nullif(trim(split_part(p_auditoria_id, '|', 2)), '');
  if projeto_id is null or casa is null then
    raise exception 'Auditoria inválida';
  end if;

  /* Resolve primeiro a linha canônica. O quinto segmento do path é o
     parede_id estável; p_parede pode ser o nome exibido (por exemplo PT 11).
     A versão anterior comparava esse segmento com p_parede. */
  select d.auditoria_id, a.parede_id
    into auditoria_rel_id, parede_id
    from public.produto_desvios d
    join public.produto_auditorias a on a.id = d.auditoria_id
   where d.id = p_desvio_id
     and (
       coalesce(a.projeto_id, 'legacy:' || coalesce(a.projeto_nome, ''))
       || '|' || coalesce(a.casa, '')
     ) = p_auditoria_id
     and (a.parede_nome = p_parede or a.parede_id = p_parede)
   limit 1;

  if auditoria_rel_id is null or parede_id is null then
    raise exception 'Desvio não encontrado nessa parede';
  end if;

  if array_length(string_to_array(storage_path, '/'), 1) <> 6
     or split_part(storage_path, '/', 1) <> 'produto'
     or split_part(storage_path, '/', 2) <> private.qualidade_segmento_storage(auth.uid()::text)
     or split_part(storage_path, '/', 3) <> private.qualidade_segmento_storage(projeto_id)
     or split_part(storage_path, '/', 4) <> private.qualidade_segmento_storage(casa)
     or split_part(storage_path, '/', 5) <> private.qualidade_segmento_storage(parede_id)
     or storage_path like '%..%' then
    raise exception 'Caminho de anexo inválido'
      using errcode = '22023',
            detail = 'O caminho precisa usar os IDs canônicos do projeto, casa e parede.',
            hint = 'Use o bucket auditoria-arquivos e o prefixo produto/<usuário>/<projeto>/<casa>/<parede>.';
  end if;

  ator := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);

  insert into public.produto_anexos(
    id, auditoria_id, desvio_id, parede_id, tipo, nome_arquivo, mime_type,
    tamanho_bytes, storage_bucket, storage_path, raw, synced_at
  ) values (
    anexo_id, auditoria_rel_id, p_desvio_id, parede_id, 'desvio',
    nome_arquivo, mime_type, tamanho_bytes, 'auditoria-arquivos', storage_path,
    jsonb_build_object(
      'id', anexo_id,
      'name', nome_arquivo,
      'type', mime_type,
      'size', tamanho_bytes,
      'path', storage_path,
      'deviationId', p_desvio_id,
      'wallId', parede_id,
      'uploadedBy', ator
    ),
    now()
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
    tamanho_bytes, storage_bucket, storage_path, metadata, origem_tabela,
    origem_id, created_by, created_at, updated_at, deleted_at
  ) values (
    'AUDITORIA DE PRODUTO', 'produto_desvios', p_desvio_id, 'desvio',
    nome_arquivo, mime_type, tamanho_bytes, 'auditoria-arquivos', storage_path,
    jsonb_build_object(
      'id', anexo_id,
      'name', nome_arquivo,
      'type', mime_type,
      'size', tamanho_bytes,
      'path', storage_path,
      'deviationId', p_desvio_id,
      'wallId', parede_id,
      'uploadedBy', ator
    ),
    'produto_anexos', anexo_id, auth.uid(), now(), now(), null
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

  return jsonb_build_object(
    'ok', true,
    'id', anexo_id,
    'desvio_id', p_desvio_id,
    'auditoria_id', auditoria_rel_id,
    'parede_id', parede_id
  );
end;
$function$;

revoke all on function public.qualidade_adicionar_anexo_fast(text, text, text, jsonb)
  from public, anon;
grant execute on function public.qualidade_adicionar_anexo_fast(text, text, text, jsonb)
  to authenticated, service_role;

drop policy if exists tecverde_storage_update_produto on storage.objects;
create policy tecverde_storage_update_produto
on storage.objects
for update
to authenticated
using (
  bucket_id = 'auditoria-arquivos'
  and (storage.foldername(name))[1] = 'produto'
  and (
    (storage.foldername(name))[2] = (auth.uid())::text
    or tecverde_is_principal()
    or tecverde_can('AUDITORIA', 'editar')
  )
)
with check (
  bucket_id = 'auditoria-arquivos'
  and (storage.foldername(name))[1] = 'produto'
  and (
    (storage.foldername(name))[2] = (auth.uid())::text
    or tecverde_is_principal()
    or tecverde_can('AUDITORIA', 'editar')
  )
);

comment on function public.qualidade_adicionar_anexo_fast(text, text, text, jsonb) is
  'Vincula anexo binário ao desvio usando IDs canônicos e validação relacional da parede.';
