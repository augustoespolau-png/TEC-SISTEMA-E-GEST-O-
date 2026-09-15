-- Corrige a remoção de desvios para usuários com permissão de edição e
-- adiciona o reset cirúrgico de uma única parede.
-- Nenhuma dessas operações reconstrói toda a base relacional.

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
  estado public.auditoria_produto_estado%rowtype;
  registros jsonb;
  novos_registros jsonb := '[]'::jsonb;
  rec jsonb;
  projeto_id text;
  casa text;
  actor text;
  agora text;
  encontrado boolean := false;
  cont_erros integer := 0;
  cont_nas integer := 0;
  arquivos_removidos jsonb := '[]'::jsonb;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if operacao not in (
    'MARCAR_PAREDE_OK',
    'ALTERAR_DATA_PAREDE',
    'REGISTRAR_DESVIO',
    'ADICIONAR_NAS',
    'ADICIONAR_ANEXO',
    'ATUALIZAR_DESVIO',
    'REMOVER_DESVIO',
    'ZERAR_INSPECAO_PAREDE'
  ) then
    return public.qualidade_compat_mutacao(operacao, p_dados);
  end if;

  -- Reset completo da parede: volta ao estado PENDENTE, preservando apenas
  -- a identidade/configuração da parede e o documento técnico do projeto.
  if operacao = 'ZERAR_INSPECAO_PAREDE' then
    if auth.uid() is null
       or not public.tecverde_can('AUDITORIA', 'editar') then
      raise exception 'Sem permissão para alterar a auditoria'
        using errcode = '42501';
    end if;

    auditoria_id := nullif(p_dados->>'auditoria_id','');
    parede := nullif(p_dados->>'parede','');
    if auditoria_id is null or parede is null then
      raise exception 'Auditoria e parede são obrigatórias';
    end if;

    projeto_id := split_part(auditoria_id, '|', 1);
    casa := nullif(split_part(auditoria_id, '|', 2), '');
    if projeto_id is null or casa is null then
      raise exception 'Auditoria inválida';
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
      if not encontrado
         and rec->>'projectId' = projeto_id
         and rec->>'house' = casa
         and (rec->>'wallName' = parede or rec->>'wallId' = parede) then
        encontrado := true;
        cont_erros := jsonb_array_length(coalesce(rec->'deviations','[]'::jsonb));
        cont_nas := jsonb_array_length(coalesce(rec->'naItems','[]'::jsonb));

        select coalesce(jsonb_agg(distinct caminho), '[]'::jsonb)
          into arquivos_removidos
          from (
            select nullif(a->>'path','') as caminho
              from jsonb_array_elements(coalesce(rec->'attachments','[]'::jsonb)) a
            union all
            select nullif(a->>'path','') as caminho
              from jsonb_array_elements(coalesce(rec->'reworkAttachments','[]'::jsonb)) a
          ) arquivos
         where caminho is not null;

        rec := jsonb_set(rec, '{status}', to_jsonb('PENDENTE'::text), true);
        rec := jsonb_set(rec, '{inspectionDate}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{firstPassResult}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{deviations}', '[]'::jsonb, true);
        rec := jsonb_set(rec, '{naItems}', '[]'::jsonb, true);
        rec := jsonb_set(rec, '{attachments}', '[]'::jsonb, true);
        rec := jsonb_set(rec, '{reworkAttachments}', '[]'::jsonb, true);
        rec := jsonb_set(rec, '{reworkDate}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{criticality}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{description}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{errorTypeId}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{errorTypeName}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{sectorId}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{sectorName}', to_jsonb(''::text), true);
        rec := jsonb_set(rec, '{updatedAt}', to_jsonb(agora), true);
      end if;
      novos_registros := novos_registros || jsonb_build_array(rec);
    end loop;

    if not encontrado then
      raise exception 'Parede não encontrada nessa auditoria';
    end if;

    perform set_config('tecverde.skip_produto_full_sync','on',true);
    update public.auditoria_produto_estado
       set registros = novos_registros,
           updated_by = actor
     where id = 'global';

    sincronizou := private.sync_produto_parede_incremental(auditoria_id, parede);
    if not sincronizou then
      perform set_config('tecverde.skip_produto_full_sync','off',true);
      update public.auditoria_produto_estado
         set updated_by = updated_by
       where id = 'global';
    end if;

    perform set_config('tecverde.skip_produto_full_sync','off',true);
    return jsonb_build_object(
      'ok', true,
      'erros_apagados', cont_erros,
      'nas_apagados', cont_nas,
      'arquivos_removidos', arquivos_removidos
    );
  end if;

  -- Alterar e remover desvio descobrem a parede a partir do próprio desvio.
  -- O cliente não precisa reenviar casa/parede e não cai no RPC legado.
  if operacao in ('ATUALIZAR_DESVIO', 'REMOVER_DESVIO') then
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
      -- Compatibilidade para registros antigos que ainda não foram projetados.
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

revoke all on function public.qualidade_compat_mutacao_fast(text,jsonb) from public, anon;
grant execute on function public.qualidade_compat_mutacao_fast(text,jsonb) to authenticated, service_role;
