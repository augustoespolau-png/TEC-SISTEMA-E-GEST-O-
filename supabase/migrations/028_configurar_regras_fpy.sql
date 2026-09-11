-- Tecverde · Compatibilidade com os dados legados: editar regras do FPY
--
-- As views public.parametros e public.projetos são deliberadamente somente
-- leitura. A tela de Configuração precisa gravar no estado legado que mantém
-- a compatibilidade com a aplicação original; fazer UPDATE direto na view
-- falha em produção e deixava os checkboxes aparentemente sem efeito.

create or replace function public.qualidade_compat_regra(
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
  rules jsonb;
  affected jsonb;
  project_ids jsonb;
  operacao text := upper(trim(coalesce(p_operacao, '')));
  chave text;
  projeto_nome text;
  projeto_id text;
  actor text;
  valor numeric;
  ativo boolean;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if auth.uid() is null
     or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar as regras da qualidade'
      using errcode = '42501';
  end if;

  actor := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);

  select *
    into estado
    from public.auditoria_produto_estado
   where id = 'global'
   for update;

  if not found then
    raise exception 'Estado legado da auditoria não encontrado';
  end if;

  if operacao = 'ALTERAR_REGRA_GLOBAL' then
    chave := nullif(trim(p_dados ->> 'chave'), '');

    if chave not in ('fpy_min_paredes_afetadas', 'fpy_meta') then
      raise exception 'Regra desconhecida: %', coalesce(chave, '(vazia)');
    end if;

    if not (p_dados ? 'valor' or p_dados ? 'ativo') then
      raise exception 'Informe o valor ou o estado da regra';
    end if;

    cfg := coalesce(estado.configuracao, '{}'::jsonb);
    rules := coalesce(cfg -> 'rules', '{}'::jsonb);

    if p_dados ? 'valor' then
      begin
        valor := nullif(trim(p_dados ->> 'valor'), '')::numeric;
      exception
        when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'Valor da regra inválido';
      end;

      if valor is null then
        raise exception 'Valor da regra é obrigatório';
      end if;

      if chave = 'fpy_min_paredes_afetadas'
         and (valor < 1 or valor > 1000) then
        raise exception 'O limite de paredes deve ficar entre 1 e 1000';
      end if;

      if chave = 'fpy_meta'
         and (valor < 0 or valor > 100) then
        raise exception 'A meta de FPY deve ficar entre 0 e 100';
      end if;

      if chave = 'fpy_min_paredes_afetadas' then
        rules := jsonb_set(
          rules,
          '{affectedWalls,value}',
          to_jsonb(valor),
          true
        );
      else
        rules := jsonb_set(
          rules,
          '{fpy,value}',
          to_jsonb(valor),
          true
        );
      end if;
    end if;

    if p_dados ? 'ativo' then
      begin
        ativo := (p_dados ->> 'ativo')::boolean;
      exception
        when invalid_text_representation then
          raise exception 'Estado da regra inválido';
      end;

      if ativo is null then
        raise exception 'Estado da regra é obrigatório';
      end if;

      if chave = 'fpy_min_paredes_afetadas' then
        rules := jsonb_set(
          rules,
          '{affectedWalls,enabled}',
          to_jsonb(ativo),
          true
        );
      else
        rules := jsonb_set(
          rules,
          '{fpy,enabled}',
          to_jsonb(ativo),
          true
        );
      end if;
    end if;

    cfg := jsonb_set(cfg, '{rules}', rules, true);

    update public.auditoria_produto_estado
       set configuracao = cfg,
           updated_by = actor
     where id = 'global';

    return jsonb_build_object('ok', true, 'chave', chave);
  end if;

  if operacao = 'ALTERAR_REGRA_PROJETO' then
    projeto_nome := nullif(trim(p_dados ->> 'projeto'), '');

    if projeto_nome is null then
      raise exception 'Projeto é obrigatório';
    end if;

    begin
      ativo := (p_dados ->> 'ativo')::boolean;
    exception
      when invalid_text_representation then
        raise exception 'Estado do projeto inválido';
    end;

    if ativo is null then
      raise exception 'Estado do projeto é obrigatório';
    end if;

    select pp.id
      into projeto_id
      from public.produto_projetos pp
     where lower(trim(pp.nome)) = lower(trim(projeto_nome))
     limit 1;

    if projeto_id is null then
      raise exception 'Projeto não encontrado: %', projeto_nome;
    end if;

    cfg := coalesce(estado.configuracao, '{}'::jsonb);
    rules := coalesce(cfg -> 'rules', '{}'::jsonb);
    affected := coalesce(rules -> 'affectedWalls', '{}'::jsonb);
    project_ids := case
      when jsonb_typeof(affected -> 'projectIds') = 'array'
        then affected -> 'projectIds'
      else '[]'::jsonb
    end;

    if ativo then
      if not (project_ids ? projeto_id) then
        project_ids := project_ids || jsonb_build_array(projeto_id);
      end if;
    else
      select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
        into project_ids
        from jsonb_array_elements(project_ids) with ordinality as item(value, ordinality)
       where item.value <> to_jsonb(projeto_id);
    end if;

    affected := jsonb_set(affected, '{projectIds}', project_ids, true);
    rules := jsonb_set(rules, '{affectedWalls}', affected, true);
    cfg := jsonb_set(cfg, '{rules}', rules, true);

    update public.auditoria_produto_estado
       set configuracao = cfg,
           updated_by = actor
     where id = 'global';

    return jsonb_build_object(
      'ok', true,
      'projeto', projeto_nome,
      'projeto_id', projeto_id,
      'ativo', ativo
    );
  end if;

  raise exception 'Operação de regra desconhecida: %', operacao;
end;
$function$;

comment on function public.qualidade_compat_regra(text, jsonb) is
  'Atualiza regras do FPY através do estado legado; usado pela tela Configuração.';

revoke all on function public.qualidade_compat_regra(text, jsonb) from public;
revoke all on function public.qualidade_compat_regra(text, jsonb) from anon, authenticated;
grant execute on function public.qualidade_compat_regra(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
