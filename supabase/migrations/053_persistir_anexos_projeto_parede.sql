-- Tecverde · persistência imediata do documento técnico da parede
--
-- A atualização do documento altera apenas `configuracao`. Como o gatilho
-- incremental dessa coluna não reconstrói `sistema_anexos`, o arquivo podia
-- chegar ao Storage e desaparecer da tela após uma nova leitura. A RPC passa
-- a materializar o metadado no mesmo commit, mantendo o Storage privado como
-- dono do binário e sem reintroduzir dataUrl/Base64 no Postgres.

create or replace function public.qualidade_salvar_projeto_parede_anexo(
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog, pg_temp
as $function$
declare
  estado public.auditoria_produto_estado%rowtype;
  cfg jsonb;
  projetos jsonb;
  projetos_atualizados jsonb := '[]'::jsonb;
  paredes jsonb;
  paredes_atualizadas jsonb;
  projeto_item jsonb;
  parede_item jsonb;
  anexo jsonb;
  documento jsonb;
  historico_atual jsonb;
  historico_item jsonb;
  projeto_id text;
  parede_id text;
  caminho text;
  caminho_antigo text;
  nome_arquivo text;
  mime_type text;
  tamanho_bytes bigint;
  anexo_id uuid;
  actor text;
  momento text;
  projeto_encontrado boolean := false;
  parede_encontrada boolean := false;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if auth.uid() is null
     or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar o projeto da parede'
      using errcode = '42501';
  end if;

  projeto_id := nullif(trim(p_dados ->> 'projeto_id'), '');
  parede_id := nullif(trim(p_dados ->> 'parede_id'), '');
  anexo := p_dados -> 'anexo';
  caminho := nullif(trim(anexo ->> 'path'), '');
  nome_arquivo := nullif(trim(anexo ->> 'name'), '');
  mime_type := lower(nullif(trim(anexo ->> 'type'), ''));

  begin
    anexo_id := nullif(trim(anexo ->> 'id'), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'ID do anexo inválido';
  end;

  begin
    tamanho_bytes := nullif(trim(anexo ->> 'size'), '')::bigint;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Tamanho do anexo inválido';
  end;

  if projeto_id is null
     or parede_id is null
     or coalesce(jsonb_typeof(anexo), '') <> 'object'
     or anexo_id is null
     or caminho is null
     or nome_arquivo is null
     or mime_type is null
     or tamanho_bytes is null then
    raise exception 'Projeto, parede e arquivo são obrigatórios';
  end if;

  if mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ) then
    raise exception 'O projeto precisa ser PDF ou imagem técnica';
  end if;

  if tamanho_bytes <= 0 or tamanho_bytes > 20971520 then
    raise exception 'O arquivo precisa ter entre 1 byte e 20 MB';
  end if;

  if anexo ? 'dataUrl' then
    raise exception 'Base64 não é aceito para anexos';
  end if;

  if array_length(string_to_array(caminho, '/'), 1) <> 6
     or split_part(caminho, '/', 1) <> 'produto'
     or split_part(caminho, '/', 2) <> auth.uid()::text
     or split_part(caminho, '/', 3) <> projeto_id
     or split_part(caminho, '/', 4) <> parede_id
     or split_part(caminho, '/', 5) <> 'projeto'
     or caminho like '%..%' then
    raise exception 'Caminho de anexo inválido';
  end if;

  if not exists (
    select 1
      from public.produto_paredes pp
      join public.produto_projetos ppj on ppj.id = pp.projeto_id
     where pp.id = parede_id
       and pp.projeto_id = projeto_id
  ) then
    raise exception 'A parede não pertence ao projeto informado';
  end if;

  actor := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);
  momento := to_char(
    clock_timestamp() at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  );

  select sa.storage_path
    into caminho_antigo
    from public.sistema_anexos sa
   where sa.modulo = 'AUDITORIA DE PRODUTO'
     and sa.entidade = 'produto_paredes'
     and sa.tipo = 'projeto'
     and sa.origem_tabela = 'produto_paredes_documento'
     and sa.origem_id = parede_id
     and sa.deleted_at is null
   order by sa.created_at desc
   limit 1;

  select *
    into estado
    from public.auditoria_produto_estado
   where id = 'global'
   for update;

  if not found then
    raise exception 'Estado legado da auditoria não encontrado';
  end if;

  cfg := coalesce(estado.configuracao, '{}'::jsonb);
  projetos := case
    when jsonb_typeof(cfg -> 'projects') = 'array' then cfg -> 'projects'
    else '[]'::jsonb
  end;

  documento := jsonb_build_object(
    'id', anexo_id::text,
    'name', nome_arquivo,
    'type', mime_type,
    'size', tamanho_bytes,
    'path', caminho,
    'uploadedAt', momento,
    'by', actor
  );

  for projeto_item in select value from jsonb_array_elements(projetos) loop
    if projeto_item ->> 'id' = projeto_id then
      projeto_encontrado := true;
      paredes := case
        when jsonb_typeof(projeto_item -> 'walls') = 'array'
          then projeto_item -> 'walls'
        else '[]'::jsonb
      end;
      paredes_atualizadas := '[]'::jsonb;
      parede_encontrada := false;

      for parede_item in select value from jsonb_array_elements(paredes) loop
        if parede_item ->> 'id' = parede_id then
          parede_encontrada := true;
          parede_item := jsonb_set(
            parede_item,
            '{projectDocument}',
            documento,
            true
          );
        end if;
        paredes_atualizadas := paredes_atualizadas || jsonb_build_array(parede_item);
      end loop;

      if not parede_encontrada then
        raise exception 'Parede não encontrada no estado da configuração';
      end if;

      projeto_item := jsonb_set(
        projeto_item,
        '{walls}',
        paredes_atualizadas,
        true
      );
    end if;
    projetos_atualizados := projetos_atualizados || jsonb_build_array(projeto_item);
  end loop;

  if not projeto_encontrado then
    raise exception 'Projeto não encontrado no estado da configuração';
  end if;

  cfg := jsonb_set(cfg, '{projects}', projetos_atualizados, true);
  historico_atual := case
    when jsonb_typeof(estado.historico) = 'array' then estado.historico
    else '[]'::jsonb
  end;
  historico_item := jsonb_build_object(
    'id', 'history_project_document_' || substr(md5(
      projeto_id || '|' || parede_id || '|' || momento || random()::text
    ), 1, 20),
    'to', caminho,
    'from', caminho_antigo,
    'actor', actor,
    'field', 'projectDocument',
    'where', 'CONFIGURAÇÃO',
    'action', 'ANEXOU_PROJETO_PAREDE',
    'record', projeto_id || ' • ' || parede_id,
    'timestamp', momento
  );
  historico_atual := historico_atual || jsonb_build_array(historico_item);

  update public.auditoria_produto_estado
     set configuracao = cfg,
         historico = historico_atual,
         updated_by = actor
   where id = 'global';

  -- O gatilho incremental atualiza produto_paredes, mas não escreve esta
  -- projeção de anexos. Fazemos o upsert aqui para a leitura da Configuração
  -- e da Auditoria enxergar o novo arquivo imediatamente após o commit.
  insert into public.sistema_anexos(
    modulo,
    entidade,
    registro_id,
    tipo,
    nome_arquivo,
    mime_type,
    tamanho_bytes,
    storage_bucket,
    storage_path,
    metadata,
    origem_tabela,
    origem_id,
    created_at,
    updated_at,
    deleted_at
  ) values (
    'AUDITORIA DE PRODUTO',
    'produto_paredes',
    parede_id,
    'projeto',
    nome_arquivo,
    mime_type,
    tamanho_bytes,
    'auditoria-arquivos',
    caminho,
    anexo - 'dataUrl',
    'produto_paredes_documento',
    parede_id,
    now(),
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
    created_at = excluded.created_at,
    updated_at = now(),
    deleted_at = null;

  return jsonb_build_object(
    'ok', true,
    'id', anexo_id::text,
    'old_path', caminho_antigo,
    'storage_bucket', 'auditoria-arquivos',
    'storage_path', caminho,
    'nome_arquivo', nome_arquivo,
    'mime_type', mime_type,
    'tamanho_bytes', tamanho_bytes
  );
end;
$function$;

comment on function public.qualidade_salvar_projeto_parede_anexo(jsonb) is
  'Atualiza e materializa o desenho técnico da parede; o binário fica no Storage privado e o metadado é gravado em sistema_anexos.';

revoke all on function public.qualidade_salvar_projeto_parede_anexo(jsonb) from public;
revoke all on function public.qualidade_salvar_projeto_parede_anexo(jsonb) from anon, authenticated;
grant execute on function public.qualidade_salvar_projeto_parede_anexo(jsonb) to authenticated;

notify pgrst, 'reload schema';
