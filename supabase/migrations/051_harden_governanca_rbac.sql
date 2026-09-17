-- Endurecimento dos helpers de governança criados na migration 050.
-- Mantém as funções determinísticas e os triggers explícitos para INSERT/UPDATE/DELETE.

begin;

create or replace function public.tecverde_permissions_for_role(p_role text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_role text := upper(coalesce(p_role, ''));
  v_permissions jsonb;
begin
  if v_role in ('ADMINISTRADOR', 'GESTAO') then
    v_role := 'GESTAO';
  elsif v_role in ('SUPERVISOR', 'CONSULTA', 'LEITURA_GERAL') then
    v_role := 'LEITURA_GERAL';
  elsif v_role in ('OPERADOR', 'INSPETOR', 'QUALIDADE') then
    v_role := 'INSPETOR';
  end if;

  v_permissions := case v_role
    when 'GESTAO' then jsonb_build_object(
      'AUDITORIA', jsonb_build_object('ver', true, 'editar', true),
      'INDICADORES', jsonb_build_object('ver', true, 'editar', true),
      'HISTÓRICO', jsonb_build_object('ver', true, 'editar', true),
      'FORNECEDORES', jsonb_build_object('ver', true, 'editar', true),
      'DOCUMENTOS', jsonb_build_object('ver', true, 'editar', true),
      'NÃO CONFORMIDADES', jsonb_build_object('ver', true, 'editar', true),
      'PLANOS DE AÇÃO', jsonb_build_object('ver', true, 'editar', true),
      'CONTROLE DE PRODUÇÃO', jsonb_build_object('ver', true, 'editar', true),
      'SUPORTE', jsonb_build_object('ver', true, 'editar', true),
      'CONFIGURAÇÃO', jsonb_build_object('ver', true, 'editar', true),
      'CADASTROS', jsonb_build_object('ver', true, 'editar', true)
    )
    when 'LEITURA_GERAL' then jsonb_build_object(
      'AUDITORIA', jsonb_build_object('ver', true, 'editar', false),
      'INDICADORES', jsonb_build_object('ver', true, 'editar', false),
      'HISTÓRICO', jsonb_build_object('ver', true, 'editar', false),
      'FORNECEDORES', jsonb_build_object('ver', true, 'editar', false),
      'DOCUMENTOS', jsonb_build_object('ver', true, 'editar', false),
      'NÃO CONFORMIDADES', jsonb_build_object('ver', true, 'editar', false),
      'PLANOS DE AÇÃO', jsonb_build_object('ver', true, 'editar', false),
      'CONTROLE DE PRODUÇÃO', jsonb_build_object('ver', true, 'editar', false),
      'SUPORTE', jsonb_build_object('ver', true, 'editar', false),
      'CONFIGURAÇÃO', jsonb_build_object('ver', false, 'editar', false),
      'CADASTROS', jsonb_build_object('ver', false, 'editar', false)
    )
    when 'INDICADORES' then jsonb_build_object(
      'AUDITORIA', jsonb_build_object('ver', false, 'editar', false),
      'INDICADORES', jsonb_build_object('ver', true, 'editar', false),
      'HISTÓRICO', jsonb_build_object('ver', false, 'editar', false),
      'FORNECEDORES', jsonb_build_object('ver', false, 'editar', false),
      'DOCUMENTOS', jsonb_build_object('ver', false, 'editar', false),
      'NÃO CONFORMIDADES', jsonb_build_object('ver', false, 'editar', false),
      'PLANOS DE AÇÃO', jsonb_build_object('ver', false, 'editar', false),
      'CONTROLE DE PRODUÇÃO', jsonb_build_object('ver', false, 'editar', false),
      'SUPORTE', jsonb_build_object('ver', false, 'editar', false),
      'CONFIGURAÇÃO', jsonb_build_object('ver', false, 'editar', false),
      'CADASTROS', jsonb_build_object('ver', false, 'editar', false)
    )
    when 'INSPETOR' then jsonb_build_object(
      'AUDITORIA', jsonb_build_object('ver', true, 'editar', true),
      'INDICADORES', jsonb_build_object('ver', true, 'editar', false),
      'HISTÓRICO', jsonb_build_object('ver', false, 'editar', false),
      'FORNECEDORES', jsonb_build_object('ver', true, 'editar', false),
      'DOCUMENTOS', jsonb_build_object('ver', true, 'editar', false),
      'NÃO CONFORMIDADES', jsonb_build_object('ver', true, 'editar', true),
      'PLANOS DE AÇÃO', jsonb_build_object('ver', true, 'editar', true),
      'CONTROLE DE PRODUÇÃO', jsonb_build_object('ver', true, 'editar', true),
      'SUPORTE', jsonb_build_object('ver', true, 'editar', false),
      'CONFIGURAÇÃO', jsonb_build_object('ver', false, 'editar', false),
      'CADASTROS', jsonb_build_object('ver', false, 'editar', false)
    )
    else '{}'::jsonb
  end;

  return v_permissions;
end;
$$;

revoke all on function public.tecverde_permissions_for_role(text) from public, anon;
grant execute on function public.tecverde_permissions_for_role(text) to authenticated;

create or replace function public.tecverde_governanca_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_id text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_table_name = 'equipe_membros' then
    v_id := coalesce(v_row ->> 'equipe_id', '') || ':' || coalesce(v_row ->> 'user_id', '');
  else
    v_id := v_row ->> 'id';
  end if;

  insert into public.governanca_audit_log (
    actor_id, acao, entidade, entidade_id, antes, depois
  ) values (
    auth.uid(),
    tg_op,
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return null;
end;
$$;

revoke all on function public.tecverde_governanca_audit_trigger() from public, anon;

revoke all on function public.tecverde_is_gestao() from public, anon;
grant execute on function public.tecverde_is_gestao() to authenticated;

revoke all on function public.tecverde_is_principal() from public, anon;
grant execute on function public.tecverde_is_principal() to authenticated;

revoke all on function public.tecverde_can(text, text) from public, anon;
grant execute on function public.tecverde_can(text, text) to authenticated;

revoke all on function public.governanca_registrar_evento(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.governanca_registrar_evento(text, text, text, jsonb, jsonb) to authenticated;

DROP POLICY IF EXISTS solicitacoes_select_self_or_gestao ON public.solicitacoes_acesso;
DROP POLICY IF EXISTS solicitacoes_insert_self_or_gestao ON public.solicitacoes_acesso;
DROP POLICY IF EXISTS solicitacoes_update_gestao ON public.solicitacoes_acesso;
DROP POLICY IF EXISTS solicitacoes_delete_gestao ON public.solicitacoes_acesso;

create policy solicitacoes_select_self_or_gestao
on public.solicitacoes_acesso
for select
to authenticated
using (
  public.tecverde_is_gestao()
  or user_id = (select auth.uid())
  or lower(email) = public.tecverde_email_atual()
);

create policy solicitacoes_insert_self_or_gestao
on public.solicitacoes_acesso
for insert
to authenticated
with check (
  public.tecverde_is_gestao()
  or (
    user_id = (select auth.uid())
    and lower(email) = public.tecverde_email_atual()
  )
);

create policy solicitacoes_update_gestao
on public.solicitacoes_acesso
for update
to authenticated
using (public.tecverde_is_gestao())
with check (public.tecverde_is_gestao());

create policy solicitacoes_delete_gestao
on public.solicitacoes_acesso
for delete
to authenticated
using (public.tecverde_is_gestao());

commit;
