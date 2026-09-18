-- 063 · Fecha o último caminho legado que ainda podia resolver projeto_id
-- de forma ambígua ao abrir uma auditoria.
--
-- 055 criou a RPC dedicada para a abertura, mas a função monolítica antiga
-- continuava pública e podia ser chamada por clientes/instâncias antigas.
-- Ela declara uma variável chamada projeto_id e também compara colunas com
-- o mesmo identificador sem alias no lado direito. O wrapper abaixo mantém
-- a compatibilidade das outras operações e desvia ABRIR_AUDITORIA para a
-- rotina já corrigida, onde toda coluna relacional está qualificada.

do $migration$
begin
  if to_regprocedure('public.qualidade_mutacao_direta(text,jsonb)') is not null
     and to_regprocedure('public.qualidade_mutacao_direta_legacy(text,jsonb)') is null then
    alter function public.qualidade_mutacao_direta(text, jsonb)
      rename to qualidade_mutacao_direta_legacy;
  end if;
end;
$migration$;

create or replace function public.qualidade_mutacao_direta(
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
begin
  if v_operacao = 'ABRIR_AUDITORIA' then
    return public.qualidade_abrir_auditoria_direta(
      v_operacao,
      coalesce(p_dados, '{}'::jsonb)
    );
  end if;

  return public.qualidade_mutacao_direta_legacy(
    v_operacao,
    coalesce(p_dados, '{}'::jsonb)
  );
end;
$function$;

-- Recriar o dispatcher também é intencional: recompila a chamada pelo nome
-- novo e evita que o plano antigo continue apontando para o OID legado.
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

revoke all on function public.qualidade_mutacao_direta(text, jsonb) from public, anon;
grant execute on function public.qualidade_mutacao_direta(text, jsonb) to authenticated, service_role;
revoke all on function public.qualidade_mutacao_direta_legacy(text, jsonb) from public, anon, authenticated;
grant execute on function public.qualidade_compat_mutacao_fast(text, jsonb) to authenticated, service_role;

comment on function public.qualidade_mutacao_direta(text, jsonb) is
  'Dispatcher compatível: abertura de auditoria usa a RPC qualificada sem ambiguidade de projeto_id.';
