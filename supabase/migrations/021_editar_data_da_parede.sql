-- ============================================================
-- Tecverde · Sistema de Gestão da Qualidade — 021
-- Permitir corrigir a data de uma parede já conferida
--
-- FALHA ENCONTRADA na verificação da 020: auditoria_paredes tinha
-- políticas de select, insert e delete, mas NENHUMA de update — porque
-- até agora não havia nada para editar numa parede conferida. Com a data
-- morando ali, "corrigir a data" virou operação real, e a RLS descartava
-- a alteração EM SILÊNCIO: nenhum erro, zero linhas afetadas. A tela
-- diria "data atualizada" e nada teria mudado.
--
-- Também: o gatilho de guarda era BEFORE INSERT apenas, então as
-- proteções escritas para o caminho de edição nunca rodavam.
-- ============================================================

-- ---------- quem corrige a data ----------
drop policy if exists auditoria_paredes_update on public.auditoria_paredes;
create policy auditoria_paredes_update on public.auditoria_paredes
  for update to authenticated
  using (public.get_my_role() = any (array['operador','gestao']::user_role[]))
  with check (public.get_my_role() = any (array['operador','gestao']::user_role[]));

-- ---------- o guard passa a valer também na edição ----------
/* Sem isto, o bloco de UPDATE da função (que impede trocar a parede, a
   auditoria e a autoria) era código morto. */
drop trigger if exists trg_auditoria_paredes_guard on public.auditoria_paredes;
create trigger trg_auditoria_paredes_guard
  before insert or update on public.auditoria_paredes
  for each row execute function public.auditoria_paredes_guard();
