-- Tecverde · sincronização relacional compatível com safeupdate
--
-- O gatilho que materializa auditoria_produto_estado limpa as tabelas
-- relacionais antes de reconstruí-las. O Postgres aceita DELETE sem filtro,
-- mas a sessão usada pelo Data API do Supabase habilita safeupdate e recusa
-- exatamente esse comando. Cada limpeza continua sendo intencionalmente de
-- tabela inteira, agora expressa com uma condição explícita.

do $migration$
declare
  definicao text;
  corrigida text;
begin
  select pg_get_functiondef(p.oid)
    into definicao
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'sync_produto_estado_relacional'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = ''
   limit 1;

  if definicao is null then
    raise exception 'Função private.sync_produto_estado_relacional não encontrada';
  end if;

  corrigida := definicao;
  corrigida := replace(
    corrigida,
    'delete from public.produto_historico;',
    'delete from public.produto_historico where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_na_itens;',
    'delete from public.produto_na_itens where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_anexos;',
    'delete from public.produto_anexos where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_desvios;',
    'delete from public.produto_desvios where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_auditorias;',
    'delete from public.produto_auditorias where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_paredes;',
    'delete from public.produto_paredes where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_projetos;',
    'delete from public.produto_projetos where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_setores;',
    'delete from public.produto_setores where true;'
  );
  corrigida := replace(
    corrigida,
    'delete from public.produto_tipos_desvio;',
    'delete from public.produto_tipos_desvio where true;'
  );

  if corrigida = definicao
     and definicao not like '%delete from public.produto_historico where true;%' then
    raise exception 'Não foi possível corrigir os DELETEs do sincronizador';
  end if;

  execute corrigida;
end;
$migration$;
