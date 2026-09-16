-- 049 · Mantém o helper dedicado de remoção fora da Data API comum.

revoke all on function public.qualidade_remover_desvio_direto(jsonb)
  from public, anon, authenticated;
grant execute on function public.qualidade_remover_desvio_direto(jsonb)
  to service_role;

revoke all on function public.qualidade_compat_mutacao_fast(text,jsonb)
  from public, anon;
grant execute on function public.qualidade_compat_mutacao_fast(text,jsonb)
  to authenticated, service_role;
