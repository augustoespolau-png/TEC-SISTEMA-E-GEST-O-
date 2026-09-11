-- ============================================================
-- Tecverde · Registro de Erros — 024: área da parede em m²
--
-- Cada posição de parede de um projeto tem uma metragem própria: no
-- C4A a PT 1 tem 12,00 m² e a PT 2 tem 6,21 m². Contar "paredes
-- auditadas" trata as duas como a mesma coisa; com a área, o painel
-- passa a poder dizer quanto de PAREDE, em metro quadrado, foi
-- inspecionado.
--
-- A área vive na CONFIGURAÇÃO da parede, e não na parede conferida:
-- ela é característica da posição no projeto, igual para todas as
-- casas. Se um dia mudar, muda para o projeto inteiro — que é o
-- comportamento certo, porque é o desenho que mudou.
--
-- Fica ANULÁVEL de propósito. Projeto sem metragem levantada continua
-- funcionando, e o painel avisa quantas paredes ainda estão sem área
-- em vez de somar zero e mentir um total menor.
-- ============================================================

alter table public.paredes
  add column if not exists area_m2 numeric(8,2)
  check (area_m2 is null or area_m2 > 0);

comment on column public.paredes.area_m2 is
  'Área da parede em m². Nula = ainda não levantada; o painel conta quantas estão assim em vez de somar zero.';

-- ------------------------------------------------------------
-- A view do FPY passa a carregar a área
--
-- Partindo da definição REAL de hoje, e não da que a migration 011
-- criou: de lá para cá a data saiu da casa e foi para a parede (020) e
-- entrou o campo reconstruida (014). Reescrever por cima da versão
-- antiga apagaria as duas coisas.
--
-- O vínculo da área é por NOME: a parede conferida guarda o texto
-- "PT 1" e o projeto "C4A", como todo o resto do sistema. Left join dos
-- dois lados — parede sem área cadastrada continua aparecendo, com área
-- nula, em vez de sumir da conta do FPY.
-- ------------------------------------------------------------
create or replace view public.fpy_paredes as
select
  a.id            as auditoria_id,
  ap.data         as data,
  a.projeto       as projeto,
  a.casa          as casa,
  a.reconstruida  as reconstruida,
  ap.parede       as parede,
  count(o.id)     as erros,
  count(o.id) = 0 as passou_de_primeira,
  /* no FIM da lista de propósito: create or replace view só aceita
     coluna nova no fim. Colocar a área no meio exigiria derrubar a view,
     e derrubar leva junto tudo o que depende dela. */
  pd.area_m2      as area_m2
from public.auditoria_paredes ap
join public.auditorias a on a.id = ap.auditoria_id
left join public.ocorrencias o
  on o.auditoria_id = a.id and o.parede = ap.parede
left join public.projetos pr on pr.nome = a.projeto
left join public.paredes pd
  on pd.projeto_id = pr.id and pd.nome = ap.parede
group by a.id, ap.data, a.projeto, a.casa, a.reconstruida, ap.parede, pd.area_m2;

comment on view public.fpy_paredes is
  'Uma linha por parede inspecionada, com a área da posição. passou_de_primeira = true alimenta o numerador do FPY; o total de linhas é o denominador.';

grant select on public.fpy_paredes to authenticated;

-- ------------------------------------------------------------
-- Metragem do C4A, levantada pela fábrica
--
-- As 12 posições somam 90,31 m² — o mesmo total da planilha de origem,
-- que é a conferência de que nada se perdeu na transcrição.
-- ------------------------------------------------------------
update public.paredes pd
   set area_m2 = v.area
  from (values
    ('PT 1',  12.00),
    ('PT 2',   6.21),
    ('PT 3',   6.21),
    ('PT 4',   6.21),
    ('PT 5',   6.21),
    ('PT 6',   6.21),
    ('PT 7',   6.21),
    ('PT 8',   6.21),
    ('PT 9',   6.21),
    ('PT 10',  7.95),
    ('PT 11',  6.21),
    ('PT 12', 14.47)
  ) as v(nome, area)
  join public.projetos pr on pr.nome = 'C4A'
 where pd.projeto_id = pr.id
   and pd.nome = v.nome;
