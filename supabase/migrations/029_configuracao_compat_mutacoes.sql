-- Tecverde · Compatibilidade das listas de configuração
--
-- public.projetos, public.paredes, public.setores e public.tipos_erro são
-- views de leitura. A configuração continua tendo uma única fonte de
-- verdade: public.auditoria_produto_estado.configuracao. Este RPC concentra
-- as escritas da tela Configuração nesse estado, sem tocar diretamente nas
-- views e sem alterar registros históricos.

create or replace function public.qualidade_compat_configuracao(
  p_operacao text,
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
  historico_atual jsonb;
  regras jsonb;
  afetadas jsonb;
  ids_projetos jsonb;
  itens jsonb;
  itens_atualizados jsonb;
  projetos jsonb;
  projetos_atualizados jsonb;
  paredes jsonb;
  paredes_atualizadas jsonb;
  item jsonb;
  item_original jsonb;
  projeto jsonb;
  parede jsonb;
  nova_parede jsonb;
  entrada jsonb;
  historico_item jsonb;
  resultado jsonb;
  nomes jsonb;
  operacao text := upper(trim(coalesce(p_operacao, '')));
  tabela text;
  chave_array text;
  nome text;
  nome_atual text;
  nome_novo text;
  projeto_nome text;
  projeto_id text;
  actor text;
  momento text;
  parede_ordem integer;
  area numeric;
  indice integer;
  adicionadas integer := 0;
  encontrado boolean;
  parede_encontrada boolean;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if auth.uid() is null
     or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar a configuração'
      using errcode = '42501';
  end if;

  actor := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);
  momento := to_char(
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

  cfg := coalesce(estado.configuracao, '{}'::jsonb);
  historico_atual := case
    when jsonb_typeof(estado.historico) = 'array' then estado.historico
    else '[]'::jsonb
  end;

  if operacao in (
    'CONFIG_ADICIONAR_ITEM',
    'CONFIG_RENOMEAR_ITEM',
    'CONFIG_EXCLUIR_ITEM',
    'CONFIG_REATIVAR_ITEM'
  ) then
    tabela := lower(trim(coalesce(p_dados ->> 'tabela', '')));

    if tabela not in ('projetos', 'setores', 'tipos_erro') then
      raise exception 'Lista de configuração inválida: %', coalesce(tabela, '(vazia)');
    end if;

    chave_array := case tabela
      when 'projetos' then 'projects'
      when 'setores' then 'sectors'
      else 'errorTypes'
    end;

    itens := case
      when jsonb_typeof(cfg -> chave_array) = 'array' then cfg -> chave_array
      else '[]'::jsonb
    end;

    if operacao = 'CONFIG_ADICIONAR_ITEM' then
      nome := upper(trim(coalesce(p_dados ->> 'nome', '')));
      if nome = '' then
        raise exception 'Nome é obrigatório';
      end if;

      if exists (
        select 1
          from jsonb_array_elements(itens) existente
         where lower(trim(coalesce(existente ->> 'name', ''))) = lower(nome)
      ) then
        raise exception 'Esse item já existe';
      end if;

      item := case tabela
        when 'projetos' then jsonb_build_object(
          'id', 'project_compat_' || substr(md5(tabela || '|' || nome || '|' || clock_timestamp()::text || random()::text), 1, 20),
          'name', nome,
          'walls', '[]'::jsonb,
          'fpyView', 'wall'
        )
        when 'setores' then jsonb_build_object(
          'id', 'sector_compat_' || substr(md5(tabela || '|' || nome || '|' || clock_timestamp()::text || random()::text), 1, 20),
          'name', nome
        )
        else jsonb_build_object(
          'id', 'error_compat_' || substr(md5(tabela || '|' || nome || '|' || clock_timestamp()::text || random()::text), 1, 20),
          'name', nome
        )
      end;

      itens_atualizados := itens || jsonb_build_array(item);
      cfg := jsonb_set(cfg, ARRAY[chave_array], itens_atualizados, true);
      historico_item := jsonb_build_object(
        'id', 'history_compat_' || substr(md5(operacao || '|' || tabela || '|' || nome || '|' || momento || random()::text), 1, 20),
        'to', nome,
        'from', null,
        'actor', actor,
        'field', tabela,
        'where', 'CONFIGURAÇÃO',
        'action', 'ADICIONOU',
        'record', nome,
        'timestamp', momento
      );
      resultado := jsonb_build_object('ok', true, 'tabela', tabela, 'nome', nome);

    elsif operacao = 'CONFIG_RENOMEAR_ITEM' then
      nome_atual := upper(trim(coalesce(p_dados ->> 'nome_atual', '')));
      nome_novo := upper(trim(coalesce(p_dados ->> 'nome_novo', '')));
      if nome_atual = '' or nome_novo = '' then
        raise exception 'Nome atual e novo nome são obrigatórios';
      end if;

      if lower(nome_atual) <> lower(nome_novo) and exists (
        select 1
          from jsonb_array_elements(itens) existente
         where lower(trim(coalesce(existente ->> 'name', ''))) = lower(nome_novo)
      ) then
        raise exception 'Já existe um item chamado %', nome_novo;
      end if;

      itens_atualizados := '[]'::jsonb;
      encontrado := false;
      for item in select value from jsonb_array_elements(itens) loop
        if not encontrado
           and lower(trim(coalesce(item ->> 'name', ''))) = lower(nome_atual) then
          encontrado := true;
          item_original := item;
          item := jsonb_set(item, '{name}', to_jsonb(nome_novo), true);
        end if;
        itens_atualizados := itens_atualizados || jsonb_build_array(item);
      end loop;

      if not encontrado then
        raise exception 'Item não encontrado: %', nome_atual;
      end if;

      cfg := jsonb_set(cfg, ARRAY[chave_array], itens_atualizados, true);
      historico_item := jsonb_build_object(
        'id', 'history_compat_' || substr(md5(operacao || '|' || tabela || '|' || nome_atual || '|' || momento || random()::text), 1, 20),
        'to', nome_novo,
        'from', nome_atual,
        'actor', actor,
        'field', tabela,
        'where', 'CONFIGURAÇÃO',
        'action', 'ALTEROU',
        'record', nome_novo,
        'timestamp', momento
      );
      resultado := jsonb_build_object('ok', true, 'tabela', tabela, 'nome', nome_novo);

    elsif operacao = 'CONFIG_EXCLUIR_ITEM' then
      nome_atual := upper(trim(coalesce(p_dados ->> 'nome_atual', '')));
      if nome_atual = '' then
        raise exception 'Nome atual é obrigatório';
      end if;

      itens_atualizados := '[]'::jsonb;
      encontrado := false;
      for item in select value from jsonb_array_elements(itens) loop
        if not encontrado
           and lower(trim(coalesce(item ->> 'name', ''))) = lower(nome_atual) then
          encontrado := true;
          item_original := item;
        else
          itens_atualizados := itens_atualizados || jsonb_build_array(item);
        end if;
      end loop;

      if not encontrado then
        raise exception 'Item não encontrado: %', nome_atual;
      end if;

      -- Projetos com auditorias não podem desaparecer da fonte de
      -- configuração: os registros antigos ainda apontam para o id do
      -- projeto e precisam continuar consultáveis. Renomear continua
      -- permitido; excluir só é permitido quando não há histórico.
      if tabela = 'projetos'
         and exists (
           select 1
             from jsonb_array_elements(
               case
                 when jsonb_typeof(estado.registros) = 'array' then estado.registros
                 else '[]'::jsonb
               end
             ) registro
            where registro ->> 'projectId' = item_original ->> 'id'
         ) then
        raise exception 'Este projeto possui histórico e não pode ser excluído. Renomeie-o para manter os vínculos.';
      end if;

      cfg := jsonb_set(cfg, ARRAY[chave_array], itens_atualizados, true);

      -- A regra acompanha o projeto, mas os registros/auditorias antigas
      -- permanecem intactos no estado histórico.
      if tabela = 'projetos' then
        regras := coalesce(cfg -> 'rules', '{}'::jsonb);
        afetadas := coalesce(regras -> 'affectedWalls', '{}'::jsonb);
        ids_projetos := case
          when jsonb_typeof(afetadas -> 'projectIds') = 'array' then afetadas -> 'projectIds'
          else '[]'::jsonb
        end;

        select coalesce(jsonb_agg(x.value order by x.ordinality), '[]'::jsonb)
          into ids_projetos
          from jsonb_array_elements(ids_projetos) with ordinality as x(value, ordinality)
         where x.value <> to_jsonb(item_original ->> 'id');

        afetadas := jsonb_set(afetadas, '{projectIds}', ids_projetos, true);
        regras := jsonb_set(regras, '{affectedWalls}', afetadas, true);
        cfg := jsonb_set(cfg, '{rules}', regras, true);
      end if;

      historico_item := jsonb_build_object(
        'id', 'history_compat_' || substr(md5(operacao || '|' || tabela || '|' || nome_atual || '|' || momento || random()::text), 1, 20),
        'to', null,
        'from', nome_atual,
        'actor', actor,
        'field', tabela,
        'where', 'CONFIGURAÇÃO',
        'action', 'EXCLUIU',
        'record', nome_atual,
        'timestamp', momento
      );
      resultado := jsonb_build_object('ok', true, 'tabela', tabela, 'nome', nome_atual);

    else
      -- As views atuais expõem todos os itens como ativos. Este caminho
      -- mantém a operação segura caso uma configuração antiga carregue um
      -- item com marcador de inatividade.
      nome_atual := upper(trim(coalesce(p_dados ->> 'nome_atual', '')));
      if nome_atual = '' then
        raise exception 'Nome atual é obrigatório';
      end if;

      itens_atualizados := '[]'::jsonb;
      encontrado := false;
      for item in select value from jsonb_array_elements(itens) loop
        if not encontrado
           and lower(trim(coalesce(item ->> 'name', ''))) = lower(nome_atual) then
          encontrado := true;
          item := jsonb_set(item, '{active}', 'true'::jsonb, true);
        end if;
        itens_atualizados := itens_atualizados || jsonb_build_array(item);
      end loop;

      if not encontrado then
        raise exception 'Item não encontrado: %', nome_atual;
      end if;

      cfg := jsonb_set(cfg, ARRAY[chave_array], itens_atualizados, true);
      historico_item := jsonb_build_object(
        'id', 'history_compat_' || substr(md5(operacao || '|' || tabela || '|' || nome_atual || '|' || momento || random()::text), 1, 20),
        'to', true,
        'from', false,
        'actor', actor,
        'field', tabela,
        'where', 'CONFIGURAÇÃO',
        'action', 'REATIVOU',
        'record', nome_atual,
        'timestamp', momento
      );
      resultado := jsonb_build_object('ok', true, 'tabela', tabela, 'nome', nome_atual);
    end if;

  elsif operacao in (
    'CONFIG_ADICIONAR_PAREDE',
    'CONFIG_ADICIONAR_PAREDES',
    'CONFIG_RENOMEAR_PAREDE',
    'CONFIG_ALTERAR_AREA_PAREDE',
    'CONFIG_EXCLUIR_PAREDE',
    'CONFIG_REATIVAR_PAREDE'
  ) then
    projeto_nome := upper(trim(coalesce(p_dados ->> 'projeto', '')));
    if projeto_nome = '' then
      raise exception 'Projeto é obrigatório';
    end if;

    projetos := case
      when jsonb_typeof(cfg -> 'projects') = 'array' then cfg -> 'projects'
      else '[]'::jsonb
    end;
    projetos_atualizados := '[]'::jsonb;
    encontrado := false;

    for projeto in select value from jsonb_array_elements(projetos) loop
      if not encontrado
         and lower(trim(coalesce(projeto ->> 'name', ''))) = lower(projeto_nome) then
        encontrado := true;
        projeto_id := projeto ->> 'id';
        paredes := case
          when jsonb_typeof(projeto -> 'walls') = 'array' then projeto -> 'walls'
          else '[]'::jsonb
        end;
        paredes_atualizadas := paredes;

        if operacao = 'CONFIG_ADICIONAR_PAREDE' then
          nome := upper(trim(coalesce(p_dados ->> 'nome', '')));
          if nome = '' then
            raise exception 'Nome da parede é obrigatório';
          end if;
          if exists (
            select 1
              from jsonb_array_elements(paredes_atualizadas) existente
             where lower(trim(coalesce(nullif(existente ->> 'name', ''), nullif(existente ->> 'legacyName', ''), 'Parede'))) = lower(nome)
          ) then
            raise exception 'Essa parede já existe nesse projeto';
          end if;

          nova_parede := jsonb_build_object(
            'id', 'wall_compat_' || substr(md5(projeto_id || '|' || nome || '|' || clock_timestamp()::text || random()::text), 1, 20),
            'area', null,
            'name', nome
          );
          paredes_atualizadas := paredes_atualizadas || jsonb_build_array(nova_parede);
          adicionadas := 1;
          historico_item := jsonb_build_object(
            'id', 'history_compat_' || substr(md5(operacao || '|' || projeto_nome || '|' || nome || '|' || momento || random()::text), 1, 20),
            'to', nome,
            'from', null,
            'actor', actor,
            'field', 'paredes',
            'where', 'CONFIGURAÇÃO',
            'action', 'ADICIONOU',
            'record', projeto_nome || ' • ' || nome,
            'timestamp', momento
          );

        elsif operacao = 'CONFIG_ADICIONAR_PAREDES' then
          nomes := case
            when jsonb_typeof(p_dados -> 'nomes') = 'array' then p_dados -> 'nomes'
            else '[]'::jsonb
          end;
          if jsonb_array_length(nomes) = 0 then
            raise exception 'Informe ao menos uma parede';
          end if;

          for entrada in select value from jsonb_array_elements(nomes) loop
            nome := upper(trim(coalesce(entrada #>> '{}', '')));
            if nome <> '' and not exists (
              select 1
                from jsonb_array_elements(paredes_atualizadas) existente
               where lower(trim(coalesce(nullif(existente ->> 'name', ''), nullif(existente ->> 'legacyName', ''), 'Parede'))) = lower(nome)
            ) then
              nova_parede := jsonb_build_object(
                'id', 'wall_compat_' || substr(md5(projeto_id || '|' || nome || '|' || clock_timestamp()::text || random()::text), 1, 20),
                'area', null,
                'name', nome
              );
              paredes_atualizadas := paredes_atualizadas || jsonb_build_array(nova_parede);
              adicionadas := adicionadas + 1;
            end if;
          end loop;

          if adicionadas = 0 then
            raise exception 'Todas essas paredes já existem nesse projeto';
          end if;
          historico_item := jsonb_build_object(
            'id', 'history_compat_' || substr(md5(operacao || '|' || projeto_nome || '|' || momento || random()::text), 1, 20),
            'to', nomes,
            'from', null,
            'actor', actor,
            'field', 'paredes',
            'where', 'CONFIGURAÇÃO',
            'action', 'ADICIONOU',
            'record', projeto_nome,
            'timestamp', momento
          );

        else
          nome_atual := upper(trim(coalesce(p_dados ->> 'nome_atual', '')));
          nome_novo := upper(trim(coalesce(p_dados ->> 'nome_novo', '')));

          if operacao = 'CONFIG_ALTERAR_AREA_PAREDE' then
            if nullif(trim(p_dados ->> 'area_m2'), '') is null then
              area := null;
            else
              begin
                area := replace(p_dados ->> 'area_m2', ',', '.')::numeric;
              exception
                when invalid_text_representation or numeric_value_out_of_range then
                  raise exception 'Metragem inválida';
              end;
              if area is null or area <= 0 then
                raise exception 'A metragem deve ser maior que zero';
              end if;
            end if;
          elsif operacao = 'CONFIG_RENOMEAR_PAREDE' and nome_novo = '' then
            raise exception 'Novo nome da parede é obrigatório';
          elsif operacao <> 'CONFIG_REATIVAR_PAREDE' and nome_atual = '' then
            raise exception 'Nome atual da parede é obrigatório';
          end if;

          parede_ordem := null;
          if nullif(trim(p_dados ->> 'parede_ordem'), '') is not null then
            begin
              parede_ordem := (p_dados ->> 'parede_ordem')::integer;
            exception
              when invalid_text_representation or numeric_value_out_of_range then
                raise exception 'Ordem da parede inválida';
            end;
          end if;

          paredes_atualizadas := '[]'::jsonb;
          parede_encontrada := false;
          indice := 0;
          for parede in select value from jsonb_array_elements(paredes) loop
            indice := indice + 1;
            if not parede_encontrada
               and (
                 (parede_ordem is not null and indice = parede_ordem)
                 or (parede_ordem is null and lower(trim(coalesce(nullif(parede ->> 'name', ''), nullif(parede ->> 'legacyName', ''), 'Parede'))) = lower(nome_atual))
               ) then
              parede_encontrada := true;
              item_original := parede;

              if operacao = 'CONFIG_RENOMEAR_PAREDE' then
                if exists (
                  select 1
                    from jsonb_array_elements(paredes) existente
                   where lower(trim(coalesce(nullif(existente ->> 'name', ''), nullif(existente ->> 'legacyName', ''), 'Parede'))) = lower(nome_novo)
                     and existente ->> 'id' <> parede ->> 'id'
                ) then
                  raise exception 'Já existe uma parede % nesse projeto', nome_novo;
                end if;
                parede := jsonb_set(parede, '{name}', to_jsonb(nome_novo), true);
              elsif operacao = 'CONFIG_ALTERAR_AREA_PAREDE' then
                parede := jsonb_set(
                  parede,
                  '{area}',
                  coalesce(to_jsonb(area), 'null'::jsonb),
                  true
                );
              elsif operacao = 'CONFIG_REATIVAR_PAREDE' then
                parede := jsonb_set(parede, '{active}', 'true'::jsonb, true);
              end if;
            end if;

            if operacao <> 'CONFIG_EXCLUIR_PAREDE' or not parede_encontrada or indice <> parede_ordem then
              paredes_atualizadas := paredes_atualizadas || jsonb_build_array(parede);
            end if;
          end loop;

          if not parede_encontrada then
            raise exception 'Parede não encontrada nesse projeto';
          end if;

          if operacao = 'CONFIG_EXCLUIR_PAREDE' then
            if exists (
              select 1
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(estado.registros) = 'array' then estado.registros
                    else '[]'::jsonb
                  end
                ) registro
               where registro ->> 'wallId' = item_original ->> 'id'
                  or (
                    registro ->> 'projectId' = projeto_id
                    and lower(trim(registro ->> 'wallName')) = lower(trim(coalesce(nullif(item_original ->> 'name', ''), nullif(item_original ->> 'legacyName', ''), 'Parede')))
                  )
            ) then
              raise exception 'Esta parede possui histórico e não pode ser excluída. Renomeie-a para manter os vínculos.';
            end if;

            historico_item := jsonb_build_object(
              'id', 'history_compat_' || substr(md5(operacao || '|' || projeto_nome || '|' || coalesce(nome_atual, '') || '|' || momento || random()::text), 1, 20),
              'to', null,
              'from', coalesce(nullif(item_original ->> 'name', ''), nullif(item_original ->> 'legacyName', ''), 'Parede'),
              'actor', actor,
              'field', 'paredes',
              'where', 'CONFIGURAÇÃO',
              'action', 'EXCLUIU',
              'record', projeto_nome || ' • ' || coalesce(nullif(item_original ->> 'name', ''), nullif(item_original ->> 'legacyName', ''), 'Parede'),
              'timestamp', momento
            );
          elsif operacao = 'CONFIG_RENOMEAR_PAREDE' then
            historico_item := jsonb_build_object(
              'id', 'history_compat_' || substr(md5(operacao || '|' || projeto_nome || '|' || nome_novo || '|' || momento || random()::text), 1, 20),
              'to', nome_novo,
              'from', coalesce(nullif(item_original ->> 'name', ''), nullif(item_original ->> 'legacyName', ''), 'Parede'),
              'actor', actor,
              'field', 'paredes',
              'where', 'CONFIGURAÇÃO',
              'action', 'ALTEROU',
              'record', projeto_nome || ' • ' || nome_novo,
              'timestamp', momento
            );
          elsif operacao = 'CONFIG_ALTERAR_AREA_PAREDE' then
            historico_item := jsonb_build_object(
              'id', 'history_compat_' || substr(md5(operacao || '|' || projeto_nome || '|' || momento || random()::text), 1, 20),
              'to', coalesce(to_jsonb(area), 'null'::jsonb),
              'from', item_original -> 'area',
              'actor', actor,
              'field', 'area',
              'where', 'CONFIGURAÇÃO',
              'action', 'ALTEROU',
              'record', projeto_nome || ' • ' || coalesce(nullif(item_original ->> 'name', ''), nullif(item_original ->> 'legacyName', ''), 'Parede'),
              'timestamp', momento
            );
          else
            historico_item := jsonb_build_object(
              'id', 'history_compat_' || substr(md5(operacao || '|' || projeto_nome || '|' || momento || random()::text), 1, 20),
              'to', true,
              'from', false,
              'actor', actor,
              'field', 'paredes',
              'where', 'CONFIGURAÇÃO',
              'action', 'REATIVOU',
              'record', projeto_nome || ' • ' || coalesce(nullif(item_original ->> 'name', ''), nullif(item_original ->> 'legacyName', ''), 'Parede'),
              'timestamp', momento
            );
          end if;
        end if;

        projeto := jsonb_set(projeto, '{walls}', paredes_atualizadas, true);
      end if;
      projetos_atualizados := projetos_atualizados || jsonb_build_array(projeto);
    end loop;

    if not encontrado then
      raise exception 'Projeto não encontrado: %', projeto_nome;
    end if;

    cfg := jsonb_set(cfg, '{projects}', projetos_atualizados, true);
    resultado := coalesce(
      resultado,
      jsonb_build_object('ok', true, 'projeto', projeto_nome)
    );

  else
    raise exception 'Operação de configuração desconhecida: %', operacao;
  end if;

  historico_atual := historico_atual || jsonb_build_array(historico_item);

  update public.auditoria_produto_estado
     set configuracao = cfg,
         historico = historico_atual,
         updated_by = actor
   where id = 'global';

  return resultado;
end;
$function$;

comment on function public.qualidade_compat_configuracao(text, jsonb) is
  'Atualiza listas e paredes da configuração através do estado legado; usado pela tela Configuração.';

revoke all on function public.qualidade_compat_configuracao(text, jsonb) from public;
revoke all on function public.qualidade_compat_configuracao(text, jsonb) from anon, authenticated;
grant execute on function public.qualidade_compat_configuracao(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
