-- ============================================================
-- Tecverde · Sistema de Gestão da Qualidade — 020
-- A data passa a ser da PAREDE, não da casa
--
-- ANTES: uma data para a casa inteira (auditorias.data). Todas as
-- paredes e todos os erros daquela casa herdavam essa data, mesmo que a
-- inspeção tivesse acontecido em dias diferentes — e ela acontece, porque
-- uma casa leva dias para passar por todas as estações.
--
-- AGORA: cada parede tem a sua data. O erro encontrado nela nasce com a
-- data da parede, e a parede aprovada sem erro também.
--
-- Consequência boa: o eixo do tempo da qualidade passa a ser o dia em que
-- a parede foi realmente olhada. O FPY semanal deixa de empilhar numa
-- data só tudo que uma casa produziu ao longo de uma semana.
-- ============================================================

-- ---------- 1. a coluna nova ----------
alter table public.auditoria_paredes
  add column if not exists data date;

-- ---------- 2. herda a data da casa para o que já existe ----------
update public.auditoria_paredes ap
   set data = a.data
  from public.auditorias a
 where a.id = ap.auditoria_id
   and ap.data is null;

-- rede de segurança: parede órfã de auditoria fica com o dia do registro
update public.auditoria_paredes
   set data = (inspecionada_em at time zone 'America/Sao_Paulo')::date
 where data is null;

alter table public.auditoria_paredes
  alter column data set not null,
  alter column data set default (now() at time zone 'America/Sao_Paulo')::date;

comment on column public.auditoria_paredes.data is
  'Dia em que ESTA parede foi conferida. Substitui a data única da casa.';

-- ---------- 3. o guard não pode mais sobrescrever a data ----------
/* O gatilho antigo carimbava inspecionada_em = now() e nada mais. A data
   informada pelo auditor tem de ser preservada — inclusive retroativa,
   porque auditoria de casa antiga é lançada depois. O carimbo técnico
   (inspecionada_em) continua sendo do sistema. */
create or replace function public.auditoria_paredes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.inspecionada_por := auth.uid();
    new.inspecionada_em := now();
    new.data := coalesce(new.data, (now() at time zone 'America/Sao_Paulo')::date);
  else
    -- em edição, só a data pode mudar; autoria e carimbo ficam
    new.inspecionada_por := old.inspecionada_por;
    new.inspecionada_em := old.inspecionada_em;
    new.auditoria_id := old.auditoria_id;
    new.parede := old.parede;
  end if;
  return new;
end $$;

-- ---------- 4. a view do FPY passa a olhar a data da parede ----------
drop view if exists public.fpy_paredes;

create view public.fpy_paredes
with (security_invoker = true) as
select
  a.id            as auditoria_id,
  ap.data         as data,          -- <<< era a.data (a data da casa)
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
group by a.id, ap.data, a.projeto, a.casa, a.reconstruida, ap.parede;

comment on view public.fpy_paredes is
  'Uma linha por parede inspecionada, com a data DA PAREDE. passou_de_primeira = true alimenta o numerador do FPY; o total de linhas é o denominador. security_invoker: obedece a RLS de quem consulta.';

revoke all on public.fpy_paredes from anon, authenticated;
grant select on public.fpy_paredes to authenticated;

-- ---------- 5. a casa não tem mais data própria ----------
alter table public.auditorias drop column if exists data;

comment on table public.auditorias is
  'Uma auditoria por casa. A data vive em auditoria_paredes: cada parede é conferida no seu dia.';
