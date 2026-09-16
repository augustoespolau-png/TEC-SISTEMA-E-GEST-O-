-- 047 · Mantém helpers relacionais fora da Data API para usuários comuns.
-- O frontend chama somente qualidade_compat_mutacao_fast, que por sua vez
-- delega para helpers com validação explícita de permissão.

revoke all on function public.qualidade_mutacao_direta(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.qualidade_mutacao_direta(text,jsonb)
  to service_role;

revoke all on function public.qualidade_zerar_parede_direta(jsonb)
  from public, anon, authenticated;
grant execute on function public.qualidade_zerar_parede_direta(jsonb)
  to service_role;

revoke all on function public.qualidade_compat_mutacao_fast(text,jsonb)
  from public, anon;
grant execute on function public.qualidade_compat_mutacao_fast(text,jsonb)
  to authenticated, service_role;
