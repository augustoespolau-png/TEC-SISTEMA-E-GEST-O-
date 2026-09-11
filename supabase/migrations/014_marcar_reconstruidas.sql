-- ============================================================
-- Tecverde · Registro de Erros — 014: separar o medido do reconstruído
--
-- O FPY do histórico foi deduzido ("se não tem erro apontado, não tem
-- erro"), enquanto o FPY das auditorias feitas no sistema é medido: o
-- auditor confirma parede por parede. Os dois não têm a mesma força,
-- então o painel precisa saber diferenciar.
--
-- Também corrige o projeto das casas "PT xx": elas são do BLOCO 1, não
-- do C4A. A parede continua desconhecida nesses registros, por isso
-- eles seguem sem auditoria — sem parede não há como dizer o que
-- passou de primeira.
-- ============================================================

alter table public.auditorias
  add column if not exists reconstruida boolean not null default false;

comment on column public.auditorias.reconstruida is
  'true = auditoria deduzida do histórico de erros (parede sem erro assumida como aprovada). false = auditoria feita no sistema, parede por parede.';

update public.auditorias
   set reconstruida = true
 where observacao like 'Auditoria reconstruída%';

-- ---------- projeto correto das casas PT ----------
alter table public.ocorrencias disable trigger trg_ocorrencias_guard;

update public.ocorrencias
   set projeto = 'BLOCO 1'
 where casa ~ '^PT'
   and projeto = 'C4A';

alter table public.ocorrencias enable trigger trg_ocorrencias_guard;

-- ---------- a view passa a expor a origem do dado ----------
-- recriada do zero: incluir uma coluna no meio muda a ordem, e o
-- Postgres não aceita isso num "create or replace"
drop view if exists public.fpy_paredes;

create view public.fpy_paredes as
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

grant select on public.fpy_paredes to authenticated;
