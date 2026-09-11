-- Tecverde · lote de itens NA e anexos de desvios
--
-- A auditoria de produto mantém o estado canônico em
-- auditoria_produto_estado.registros. As tabelas relacionais são apenas a
-- projeção compatível desse estado, portanto as duas novas operações passam
-- pelo mesmo RPC já usado pela tela.

do $migration$
declare
  definicao text;
  corrigida text;
begin
  select pg_get_functiondef(p.oid)
    into definicao
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'qualidade_compat_mutacao'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = 'p_operacao text, p_dados jsonb'
   limit 1;

  if definicao is null then
    raise exception 'Função public.qualidade_compat_mutacao não encontrada';
  end if;

  corrigida := definicao;

  if position($marker$tipos_na jsonb$marker$ in corrigida) = 0 then
    corrigida := replace(
      corrigida,
      $anchor$  novos_anexos jsonb;
$anchor$,
      $replacement$  novos_anexos jsonb;
  tipos_na jsonb;
  tipo_na jsonb;
  anexo_id text;
$replacement$
    );
  end if;

  if position($marker$if operacao = 'ADICIONAR_NAS'$marker$ in corrigida) = 0 then
    corrigida := replace(
      corrigida,
      $anchor$  if operacao = 'ADICIONAR_NA' then$anchor$,
      $replacement$  if operacao = 'ADICIONAR_NAS' then
    if projeto_id is null or casa is null then
      raise exception 'Auditoria inválida';
    end if;

    parede_nome := nullif(p_dados ->> 'parede', '');
    tipos_na := case
      when jsonb_typeof(p_dados -> 'itens') = 'array' then p_dados -> 'itens'
      else '[]'::jsonb
    end;

    if parede_nome is null or jsonb_array_length(tipos_na) = 0 then
      raise exception 'Parede e itens NA são obrigatórios';
    end if;

    encontrado := false;
    novos_registros := '[]'::jsonb;
    cont_nas := 0;

    for rec in select value from jsonb_array_elements(registros)
    loop
      if not encontrado
         and rec ->> 'projectId' = projeto_id
         and rec ->> 'house' = casa
         and (
           rec ->> 'wallName' = parede_nome
           or rec ->> 'wallId' = parede_nome
         ) then
        encontrado := true;
        novos_nas := coalesce(rec -> 'naItems', '[]'::jsonb);

        for tipo_na in select value from jsonb_array_elements(tipos_na)
        loop
          tipo_nome := nullif(upper(trim(coalesce(
            tipo_na ->> 'tipo_erro',
            tipo_na ->> 'name',
            ''
          ))), '');
          if tipo_nome is null then
            continue;
          end if;

          select t ->> 'id'
            into tipo_id
            from jsonb_array_elements(coalesce(estado.configuracao -> 'errorTypes', '[]'::jsonb)) t
           where lower(coalesce(t ->> 'name', '')) = lower(tipo_nome)
           limit 1;

          if tipo_id is null then
            tipo_id := 'compat_na_' || substr(md5(tipo_nome), 1, 20);
          end if;

          if not exists (
            select 1
              from jsonb_array_elements(novos_nas) item_na
             where item_na ->> 'id' = tipo_id
                or lower(coalesce(item_na ->> 'name', '')) = lower(tipo_nome)
          ) then
            observacao := nullif(trim(coalesce(
              tipo_na ->> 'observacao',
              p_dados ->> 'observacao',
              ''
            )), '');
            novos_nas := novos_nas || jsonb_build_array(
              jsonb_build_object(
                'id', tipo_id,
                'name', tipo_nome,
                'observacao', observacao
              )
            );
            cont_nas := cont_nas + 1;
          end if;
        end loop;

        rec := jsonb_set(rec, '{naItems}', novos_nas, true);
        rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);
      end if;
      novos_registros := novos_registros || jsonb_build_array(rec);
    end loop;

    if not encontrado then
      raise exception 'Parede não encontrada nessa auditoria';
    end if;

    update public.auditoria_produto_estado
       set registros = novos_registros,
           updated_by = actor
     where id = 'global';

    return jsonb_build_object('ok', true, 'adicionados', cont_nas);
  end if;

  if operacao = 'ADICIONAR_NA' then$replacement$
    );
  end if;

  if position($marker$if operacao = 'ADICIONAR_ANEXO'$marker$ in corrigida) = 0 then
    corrigida := replace(
      corrigida,
      $anchor$  if operacao = 'EXCLUIR_AUDITORIA' then$anchor$,
      $replacement$  if operacao = 'ADICIONAR_ANEXO' then
    if projeto_id is null or casa is null then
      raise exception 'Auditoria inválida';
    end if;

    parede_nome := nullif(p_dados ->> 'parede', '');
    desvio_id := nullif(p_dados ->> 'deviation_id', '');
    tipo_na := p_dados -> 'anexo';
    anexo_id := nullif(tipo_na ->> 'id', '');

    if parede_nome is null
       or desvio_id is null
       or coalesce(jsonb_typeof(tipo_na), '') <> 'object'
       or anexo_id is null then
      raise exception 'Parede, desvio e anexo são obrigatórios';
    end if;

    if nullif(tipo_na ->> 'path', '') is null
       and nullif(tipo_na ->> 'dataUrl', '') is null then
      raise exception 'O anexo não possui arquivo';
    end if;

    encontrado := false;
    novos_registros := '[]'::jsonb;

    for rec in select value from jsonb_array_elements(registros)
    loop
      if not encontrado
         and rec ->> 'projectId' = projeto_id
         and rec ->> 'house' = casa
         and (
           rec ->> 'wallName' = parede_nome
           or rec ->> 'wallId' = parede_nome
         )
         and exists (
           select 1
             from jsonb_array_elements(coalesce(rec -> 'deviations', '[]'::jsonb)) desvio_item
            where desvio_item ->> 'id' = desvio_id
         ) then
        encontrado := true;
        novos_anexos := coalesce(rec -> 'attachments', '[]'::jsonb);

        if not exists (
          select 1
            from jsonb_array_elements(novos_anexos) anexo_item
           where anexo_item ->> 'id' = anexo_id
        ) then
          novos_anexos := novos_anexos || jsonb_build_array(
            jsonb_build_object(
              'id', anexo_id,
              'name', coalesce(nullif(tipo_na ->> 'name', ''), 'foto-desvio'),
              'type', coalesce(nullif(tipo_na ->> 'type', ''), 'image/jpeg'),
              'size', coalesce(tipo_na ->> 'size', '0'),
              'path', coalesce(tipo_na ->> 'path', ''),
              'dataUrl', coalesce(tipo_na ->> 'dataUrl', ''),
              'deviationId', coalesce(nullif(tipo_na ->> 'deviationId', ''), desvio_id),
              'wallId', rec ->> 'wallId'
            )
          );
        end if;

        rec := jsonb_set(rec, '{attachments}', novos_anexos, true);
        rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);
      end if;
      novos_registros := novos_registros || jsonb_build_array(rec);
    end loop;

    if not encontrado then
      raise exception 'Desvio não encontrado nessa parede';
    end if;

    update public.auditoria_produto_estado
       set registros = novos_registros,
           updated_by = actor
     where id = 'global';

    return jsonb_build_object('ok', true, 'id', anexo_id);
  end if;

  if operacao = 'EXCLUIR_AUDITORIA' then$replacement$
    );
  end if;

  -- Remover um desvio também remove seu vínculo no estado canônico. O
  -- arquivo físico continua sendo limpo pelo cliente quando possível.
  corrigida := replace(
    corrigida,
    $anchor$      if encontrado_item then
        rec := jsonb_set(rec, '{deviations}', novos_desvios, true);
        rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);
        if jsonb_array_length(novos_desvios) = 0 then$anchor$,
    $replacement$      if encontrado_item then
        rec := jsonb_set(rec, '{deviations}', novos_desvios, true);
        rec := jsonb_set(
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
        rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);
        if jsonb_array_length(novos_desvios) = 0 then$replacement$
  );

  if position($marker$if operacao = 'ADICIONAR_NAS'$marker$ in corrigida) = 0
     or position($marker$if operacao = 'ADICIONAR_ANEXO'$marker$ in corrigida) = 0 then
    raise exception 'Não foi possível estender o RPC da auditoria';
  end if;

  execute corrigida;
end;
$migration$;
