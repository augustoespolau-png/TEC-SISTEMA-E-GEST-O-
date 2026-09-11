-- ============================================================
-- Tecverde · Registro de Erros — 013: auditorias reconstruídas
--
-- Reconstrói o caminho inverso: se o histórico registrou todos os
-- erros encontrados, então toda parede SEM erro registrado é uma
-- parede que passou de primeira. Com isso o FPY passa a existir
-- também para o período anterior ao sistema.
--
-- PREMISSA (definida pela empresa): a inspeção cobria a casa inteira,
-- as 12 paredes. Se na prática algum inspetor conferia só parte da
-- casa, o FPY reconstruído fica otimista — as paredes não conferidas
-- entram como aprovadas.
--
-- ESCOPO: só as 48 casas do C4A (numéricas), cujos erros estão em
-- P1..P12. As 12 casas "PT xx" ficam de fora: nelas o campo parede
-- guarda "BLOCO 1" (o nome do projeto), então não se sabe qual parede
-- teve o erro e não dá para reconstruir sem inventar.
-- ============================================================

-- Os gatilhos preenchem autoria com auth.uid(), que é nulo numa carga
-- administrativa. Desligados para gravar a autoria de forma explícita
-- e não carimbar "atualizado agora" em 254 registros históricos.
alter table public.auditorias disable trigger trg_auditorias_guard;
alter table public.ocorrencias disable trigger trg_ocorrencias_guard;

-- ---------- 1. uma auditoria por casa, na data do primeiro erro ----------
insert into public.auditorias (data, projeto, casa, observacao, created_by, created_at)
select
  min(o.data),
  'C4A',
  o.casa,
  'Auditoria reconstruída a partir do histórico de erros importado da planilha. As paredes sem erro registrado foram consideradas aprovadas de primeira.',
  (select id from public.profiles where role = 'gestao' order by created_at limit 1),
  now()
from public.ocorrencias o
where o.casa !~ '^PT'
group by o.casa
on conflict (projeto, casa) do nothing;

-- ---------- 2. ligar os erros existentes à auditoria da casa ----------
update public.ocorrencias o
   set auditoria_id = a.id
  from public.auditorias a
 where a.projeto = 'C4A'
   and a.casa = o.casa
   and o.casa !~ '^PT'
   and o.auditoria_id is null;

alter table public.auditorias enable trigger trg_auditorias_guard;
alter table public.ocorrencias enable trigger trg_ocorrencias_guard;

-- ---------- 3. marcar as 12 paredes como conferidas ----------
-- As que não tiverem erro ligado contam como aprovadas de primeira
-- (a view fpy_paredes deduz isso sozinha).
insert into public.auditoria_paredes (auditoria_id, parede)
select a.id, w.nome
  from public.auditorias a
  join public.projetos p on p.nome = a.projeto
  join public.paredes w on w.projeto_id = p.id and w.ativo
 where a.projeto = 'C4A'
on conflict (auditoria_id, parede) do nothing;
