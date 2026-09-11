-- ============================================================
-- Tecverde · Registro de Erros — 009: função de "batimento"
--
-- O plano gratuito do Supabase pausa o projeto após 7 dias sem
-- atividade. Esta função existe só para ser chamada uma vez por dia
-- por uma tarefa agendada no Vercel: ela força uma consulta real ao
-- banco, o que conta como atividade e impede a pausa.
--
-- Não lê nem escreve nada — devolve apenas a hora do servidor.
-- ============================================================

create or replace function public.manter_ativo()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select now();
$$;

grant execute on function public.manter_ativo() to anon, authenticated;
