-- 055 · Corrige a abertura de auditoria com projeto_id sem ambiguidade.
--
-- A função qualidade_mutacao_direta tinha variáveis com o mesmo nome das
-- colunas (a.projeto_id = projeto_id e a.casa = casa). No PostgreSQL isso
-- deixa a resolução do identificador ambígua e impede abrir uma casa nova.
-- A abertura é isolada nesta RPC, mantendo as demais mutações inalteradas.

create or replace function public.qualidade_abrir_auditoria_direta(
  p_operacao text,
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '8s'
as $function$
declare
  v_operacao text := upper(trim(coalesce(p_operacao, '')));
  v_projeto_nome text := nullif(trim(coalesce(p_dados ->> 'projeto', '')), '');
  v_casa text := nullif(trim(coalesce(p_dados ->> 'casa', '')), '');
  v_projeto_id text;
  v_actor text;
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
begin
  p_dados := coalesce(p_dados, '{}'::jsonb);

  if auth.uid() is null
     or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar a auditoria'
      using errcode = '42501';
  end if;

  if v_operacao <> 'ABRIR_AUDITORIA' then
    raise exception 'Operação inválida para abertura de auditoria: %', p_operacao;
  end if;

  if v_projeto_nome is null or v_casa is null then
    raise exception 'Projeto e casa são obrigatórios';
  end if;

  select pp.id, pp.nome
    into v_projeto_id, v_projeto_nome
    from public.produto_projetos pp
   where lower(pp.nome) = lower(v_projeto_nome)
   limit 1;

  if v_projeto_id is null then
    raise exception 'Projeto não encontrado';
  end if;

  if not exists (
    select 1
      from public.produto_auditorias pa
     where pa.projeto_id = v_projeto_id
       and pa.casa = v_casa
  ) then
    v_actor := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);

    insert into public.produto_auditorias (
      id, projeto_id, parede_id, casa, parede_nome, projeto_nome, status,
      resultado_primeira_passagem, data_registro, auditor, area,
      updated_at_source, raw, synced_at
    )
    select
      'audit_direct_' || substr(md5(v_projeto_id || '|' || v_casa || '|' || pw.id), 1, 24),
      v_projeto_id,
      pw.id,
      v_casa,
      pw.nome,
      v_projeto_nome,
      'PENDENTE',
      '',
      v_now,
      v_actor,
      pw.area,
      v_now,
      jsonb_build_object(
        'id', 'audit_direct_' || substr(md5(v_projeto_id || '|' || v_casa || '|' || pw.id), 1, 24),
        'projectId', v_projeto_id,
        'projectName', v_projeto_nome,
        'wallId', pw.id,
        'wallName', pw.nome,
        'house', v_casa,
        'status', 'PENDENTE',
        'firstPassResult', '',
        'createdAt', v_now,
        'updatedAt', v_now,
        'projectDocument', pw.project_document
      ),
      now()
      from public.produto_paredes pw
     where pw.projeto_id = v_projeto_id
    on conflict (id) do nothing;

    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'O projeto não possui paredes cadastradas';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_projeto_id || '|' || v_casa,
    'projeto', v_projeto_nome,
    'casa', v_casa,
    'created_at', v_now,
    'observacao', null
  );
end;
$function$;

-- Todas as aberturas do caminho rápido passam pela função corrigida. As
-- operações de zerar/remover continuam usando seus handlers especializados.
create or replace function public.qualidade_compat_mutacao_fast(
  p_operacao text,
  p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  v_operacao text := upper(trim(coalesce(p_operacao, '')));
begin
  if v_operacao = 'ABRIR_AUDITORIA' then
    return public.qualidade_abrir_auditoria_direta(
      v_operacao,
      coalesce(p_dados, '{}'::jsonb)
    );
  end if;

  if v_operacao = 'ZERAR_INSPECAO_PAREDE' then
    return public.qualidade_zerar_parede_direta(coalesce(p_dados, '{}'::jsonb));
  end if;

  if v_operacao = 'REMOVER_DESVIO' then
    return public.qualidade_remover_desvio_direto(coalesce(p_dados, '{}'::jsonb));
  end if;

  return public.qualidade_mutacao_direta(v_operacao, coalesce(p_dados, '{}'::jsonb));
end;
$function$;

revoke all on function public.qualidade_abrir_auditoria_direta(text, jsonb) from public, anon;
grant execute on function public.qualidade_abrir_auditoria_direta(text, jsonb) to authenticated, service_role;

comment on function public.qualidade_abrir_auditoria_direta(text, jsonb) is
  'Abre as linhas relacionais de uma casa sem colisão entre variáveis PL/pgSQL e projeto_id/casa.';
