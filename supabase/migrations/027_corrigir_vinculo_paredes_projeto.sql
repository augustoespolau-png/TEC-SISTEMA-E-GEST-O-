-- Tecverde · Compatibilidade com os dados legados: corrigir o projeto das paredes
--
-- A view anterior usava row_number() por parede para preencher projeto_id.
-- Assim, PT 1 virava projeto 1, PT 2 virava projeto 2 etc. O frontend então
-- encontrava somente a primeira parede do C4A. O projeto precisa receber o
-- mesmo identificador ordinal usado pela view public.projetos.

create or replace view public.paredes with (security_invoker = true) as
with projeto_ids as (
  select
    ppj.id as projeto_origem_id,
    row_number() over (order by ppj.nome, ppj.id)::integer as projeto_id
  from public.produto_projetos ppj
)
select
  row_number() over (order by ppj.nome, pp.ordem, pp.id)::integer as id,
  pi.projeto_id,
  pp.nome,
  true as ativo,
  pp.ordem,
  pp.area as area_m2
from public.produto_paredes pp
join public.produto_projetos ppj on ppj.id = pp.projeto_id
join projeto_ids pi on pi.projeto_origem_id = ppj.id;

grant select on public.paredes to authenticated;
