-- Tecverde · 060: endurece índices, RLS por operação e aprovação de laudos.
-- A migration 059 já criou a estrutura; esta versão também é segura para
-- instalações que tenham aplicado a 059 antes desta revisão.

begin;

create index if not exists cadeia_madeira_fornecedores_created_by_idx
  on public.cadeia_madeira_fornecedores (created_by);
create index if not exists cadeia_madeira_fornecedores_updated_by_idx
  on public.cadeia_madeira_fornecedores (updated_by);
create index if not exists cadeia_madeira_lotes_created_by_idx
  on public.cadeia_madeira_lotes (created_by);
create index if not exists cadeia_madeira_lotes_updated_by_idx
  on public.cadeia_madeira_lotes (updated_by);
create index if not exists cadeia_madeira_inspecoes_inspetor_id_idx
  on public.cadeia_madeira_inspecoes (inspetor_id);
create index if not exists cadeia_madeira_inspecoes_created_by_idx
  on public.cadeia_madeira_inspecoes (created_by);
create index if not exists cadeia_madeira_inspecoes_updated_by_idx
  on public.cadeia_madeira_inspecoes (updated_by);
create index if not exists cadeia_madeira_laudos_aprovado_por_idx
  on public.cadeia_madeira_laudos (aprovado_por);
create index if not exists cadeia_madeira_laudos_created_by_idx
  on public.cadeia_madeira_laudos (created_by);

do $policies$
declare
  tabela text;
begin
  foreach tabela in array array[
    'cadeia_madeira_fornecedores',
    'cadeia_madeira_lotes',
    'cadeia_madeira_inspecoes',
    'cadeia_madeira_laudos'
  ] loop
    execute format('drop policy if exists cadeia_madeira_%s_write on public.%I', tabela, tabela);
    execute format('drop policy if exists cadeia_madeira_%s_insert on public.%I', tabela, tabela);
    execute format('drop policy if exists cadeia_madeira_%s_update on public.%I', tabela, tabela);
    execute format('drop policy if exists cadeia_madeira_%s_delete on public.%I', tabela, tabela);

    if tabela = 'cadeia_madeira_laudos' then
      execute format(
        'create policy cadeia_madeira_%s_insert on public.%I for insert to authenticated with check (public.cadeia_madeira_pode(''editar'') and (not aprovado or public.cadeia_madeira_pode(''gerenciar'')))',
        tabela, tabela
      );
      execute format(
        'create policy cadeia_madeira_%s_update on public.%I for update to authenticated using (public.cadeia_madeira_pode(''editar'') and (not aprovado or public.cadeia_madeira_pode(''gerenciar''))) with check (public.cadeia_madeira_pode(''editar'') and (not aprovado or public.cadeia_madeira_pode(''gerenciar'')))',
        tabela, tabela
      );
      execute format(
        'create policy cadeia_madeira_%s_delete on public.%I for delete to authenticated using (public.cadeia_madeira_pode(''editar'') and (not aprovado or public.cadeia_madeira_pode(''gerenciar'')))',
        tabela, tabela
      );
    else
      execute format(
        'create policy cadeia_madeira_%s_insert on public.%I for insert to authenticated with check (public.cadeia_madeira_pode(''editar''))',
        tabela, tabela
      );
      execute format(
        'create policy cadeia_madeira_%s_update on public.%I for update to authenticated using (public.cadeia_madeira_pode(''editar'')) with check (public.cadeia_madeira_pode(''editar''))',
        tabela, tabela
      );
      execute format(
        'create policy cadeia_madeira_%s_delete on public.%I for delete to authenticated using (public.cadeia_madeira_pode(''editar''))',
        tabela, tabela
      );
    end if;
  end loop;
end
$policies$;

notify pgrst, 'reload schema';
commit;
