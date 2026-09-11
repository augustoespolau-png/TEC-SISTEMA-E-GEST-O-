-- ============================================================
-- Tecverde · Registro de Erros — 016: fechar a view do FPY
--
-- FALHA ENCONTRADA
--   A view public.fpy_paredes foi criada (migration 011) sem a opção
--   security_invoker. Sem ela, a view executa com os direitos do DONO
--   (postgres) e passa por cima da RLS das tabelas que ela lê. Resultado
--   medido: o papel `anon` — o da chave publicável, que está no
--   JavaScript do site e portanto é pública — devolvia as 577 linhas da
--   view, enquanto ocorrencias, auditorias e o log devolviam 0.
--
--   Exposto: projeto, casa, posição de parede, data da auditoria e
--   quantos erros cada parede teve. Sem descrição de erro, sem nome de
--   pessoa, sem senha — mas é o dado de produção da empresa, e não
--   deveria estar aberto.
--
-- CORREÇÃO
--   1. Recriar a view com security_invoker = true: ela passa a obedecer
--      a RLS de quem consulta, igual à log_legivel.
--   2. Tirar da anon e da authenticated os privilégios de escrita que o
--      Supabase concede por padrão em objeto novo do schema public.
--      A RLS já barrava (sem policy de INSERT ninguém insere), mas
--      privilégio que não é usado não deve estar concedido.
-- ============================================================

drop view if exists public.fpy_paredes;

create view public.fpy_paredes
with (security_invoker = true) as
select
  a.id            as auditoria_id,
  a.data          as data,
  a.projeto       as projeto,
  a.casa          as casa,
  a.reconstruida  as reconstruida,
  ap.parede       as parede,
  count(o.id)     as erros,
  count(o.id) = 0 as passou_de_primeira
from public.auditoria_paredes ap
join public.auditorias a on a.id = ap.auditoria_id
left join public.ocorrencias o
  on o.auditoria_id = a.id and o.parede = ap.parede
group by a.id, a.data, a.projeto, a.casa, a.reconstruida, ap.parede;

comment on view public.fpy_paredes is
  'Uma linha por parede inspecionada. passou_de_primeira = true alimenta o numerador do FPY; o total de linhas é o denominador. security_invoker: obedece a RLS de quem consulta.';

-- ---------- privilégios: leitura para logado, escrita para ninguém ----------
revoke all on public.fpy_paredes from anon, authenticated;
grant select on public.fpy_paredes to authenticated;

revoke all on public.log_legivel from anon, authenticated;
grant select on public.log_legivel to authenticated;

revoke all on public.log_atividade from anon, authenticated;
grant select on public.log_atividade to authenticated;
