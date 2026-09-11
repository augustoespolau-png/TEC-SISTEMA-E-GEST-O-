-- Tecverde · anexos somente no Supabase Storage
--
-- A Auditoria de Produto já usa o bucket privado `auditoria-arquivos` e a
-- tabela genérica `sistema_anexos`. Esta migração não cria outra tabela nem
-- outro bucket: remove o legado de dataUrl, torna o RPC Storage-only e faz a
-- projeção relacional carregar apenas metadados/caminho.

do $migration$
declare
  rpc_original text;
  rpc_corrigido text;
  sync_original text;
  sync_corrigido text;
  estado public.auditoria_produto_estado%rowtype;
  registro jsonb;
  item jsonb;
  novos_registros jsonb := '[]'::jsonb;
  novos_anexos jsonb;
begin
  select pg_get_functiondef(p.oid)
    into rpc_original
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'qualidade_compat_mutacao'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = 'p_operacao text, p_dados jsonb'
   limit 1;

  if rpc_original is null then
    raise exception 'Função public.qualidade_compat_mutacao não encontrada';
  end if;

  rpc_corrigido := replace(
    rpc_original,
    $old$    if nullif(tipo_na ->> 'path', '') is null
       and nullif(tipo_na ->> 'dataUrl', '') is null then
      raise exception 'O anexo não possui arquivo';
    end if;$old$,
    $new$    if nullif(tipo_na ->> 'path', '') is null then
      raise exception 'O anexo precisa estar no Supabase Storage';
    end if;
    if tipo_na ? 'dataUrl' then
      raise exception 'Base64 não é aceito para anexos';
    end if;$new$
  );

  -- O campo não deve sequer permanecer no JSON canônico. Isso impede que
  -- uma chamada futura volte a introduzir Base64, mesmo que vazio.
  rpc_corrigido := replace(
    rpc_corrigido,
    $old$'dataUrl', coalesce(tipo_na ->> 'dataUrl', ''),$old$,
    ''
  );

  if position($needle$if tipo_na ? 'dataUrl' then$needle$ in rpc_corrigido) = 0
     or position($needle$coalesce(tipo_na ->> 'dataUrl', '')$needle$ in rpc_corrigido) > 0 then
    raise exception 'Não foi possível tornar o RPC de anexos Storage-only';
  end if;

  execute rpc_corrigido;

  select pg_get_functiondef(p.oid)
    into sync_original
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'sync_produto_estado_relacional'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = ''
   limit 1;

  if sync_original is null then
    raise exception 'Função private.sync_produto_estado_relacional não encontrada';
  end if;

  sync_corrigido := replace(
    sync_original,
    $old$a->>'path',a,now());$old$,
    $new$a->>'path',a - 'dataUrl',now());$new$
  );

  -- Quando existir um desvio, o índice genérico aponta para o desvio, não
  -- apenas para a auditoria. Carga sem desvio continua vinculada à casa.
  sync_corrigido := replace(
    sync_corrigido,
    $old$'produto_auditorias',pa.auditoria_id$old$,
    $new$case when pa.desvio_id is not null then 'produto_desvios' else 'produto_auditorias' end,coalesce(pa.desvio_id,pa.auditoria_id)$new$
  );
  sync_corrigido := replace(
    sync_corrigido,
    $old$pa.raw,'produto_anexos'$old$,
    $new$pa.raw - 'dataUrl','produto_anexos'$new$
  );
  sync_corrigido := replace(
    sync_corrigido,
    $old$do update set registro_id=excluded.registro_id,tipo=excluded.tipo$old$,
    $new$do update set entidade=excluded.entidade,registro_id=excluded.registro_id,tipo=excluded.tipo$new$
  );

  if position($needle$a - 'dataUrl'$needle$ in sync_corrigido) = 0
     or position($needle$case when pa.desvio_id is not null$needle$ in sync_corrigido) = 0 then
    raise exception 'Não foi possível proteger a projeção relacional de anexos';
  end if;

  execute sync_corrigido;

  -- Limpa o legado no estado canônico. Anexos sem path são descartados:
  -- eram apenas referências sem objeto físico recuperável.
  select *
    into estado
    from public.auditoria_produto_estado
   where id = 'global'
   for update;

  if found and jsonb_typeof(estado.registros) = 'array' then
    for registro in
      select value
        from jsonb_array_elements(estado.registros)
    loop
      if jsonb_typeof(registro -> 'attachments') = 'array' then
        novos_anexos := '[]'::jsonb;
        for item in
          select value
            from jsonb_array_elements(registro -> 'attachments')
        loop
          if nullif(item ->> 'path', '') is not null then
            novos_anexos := novos_anexos || jsonb_build_array(item - 'dataUrl');
          end if;
        end loop;
        registro := jsonb_set(registro, '{attachments}', novos_anexos, true);
      end if;

      if jsonb_typeof(registro -> 'cargaAttachments') = 'array' then
        novos_anexos := '[]'::jsonb;
        for item in
          select value
            from jsonb_array_elements(registro -> 'cargaAttachments')
        loop
          if nullif(item ->> 'path', '') is not null then
            novos_anexos := novos_anexos || jsonb_build_array(item - 'dataUrl');
          end if;
        end loop;
        registro := jsonb_set(registro, '{cargaAttachments}', novos_anexos, true);
      end if;

      novos_registros := novos_registros || jsonb_build_array(registro);
    end loop;

    update public.auditoria_produto_estado
       set registros = novos_registros,
           updated_at = now()
     where id = 'global';
  end if;

  -- Protege também linhas legadas que não tenham passado pelo estado global.
  update public.produto_anexos
     set raw = coalesce(raw, '{}'::jsonb) - 'dataUrl'
   where coalesce(raw, '{}'::jsonb) ? 'dataUrl';

  update public.sistema_anexos
     set metadata = coalesce(metadata, '{}'::jsonb) - 'dataUrl',
         updated_at = now()
   where coalesce(metadata, '{}'::jsonb) ? 'dataUrl';
end;
$migration$;

create index if not exists produto_anexos_desvio_idx
  on public.produto_anexos (desvio_id)
  where desvio_id is not null;

do $constraint$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.produto_anexos'::regclass
       and conname = 'produto_anexos_raw_sem_data_url_ck'
  ) then
    alter table public.produto_anexos
      add constraint produto_anexos_raw_sem_data_url_ck
      check (not (coalesce(raw, '{}'::jsonb) ? 'dataUrl'));
  end if;
end;
$constraint$;
