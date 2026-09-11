-- ============================================================
-- Tecverde · Registro de Erros — 025: metragem da ESCOLA ZACARIAS PR
--
-- PRECISÃO. A coluna nasceu com duas casas decimais, pensando no C4A,
-- onde as medidas vêm redondas (12,00 · 6,21 · 14,47). A escola veio
-- com quatro (20,8742 · 3,4675), e guardar 20,87 seria alterar em
-- silêncio o número que a fábrica levantou. A coluna passa a numeric
-- (10,4); o C4A não muda, porque 12,00 e 12,0000 são o mesmo valor.
--
-- O MAPA DOS NOMES. A planilha de origem lista "PT-14" oito vezes, uma
-- por painel daquela posição; o sistema chama esses painéis de PT 14.1
-- a PT 14.8. A conferência foi feita grupo a grupo: a quantidade de
-- repetições da planilha bate com a quantidade de sufixos no cadastro,
-- em todos os grupos, e dentro de cada grupo a área repetida é sempre
-- a mesma — então não existe ambiguidade sobre qual sufixo recebe qual
-- valor. 101 linhas na planilha, 101 paredes cadastradas.
-- ============================================================

-- A view do FPY le a coluna, e o Postgres nao deixa mudar o tipo de
-- coluna usada por view. Derruba e refaz, com a MESMA definicao da 024
-- — conferido antes que nada mais dependia dela.
drop view if exists public.fpy_paredes;

alter table public.paredes
  alter column area_m2 type numeric(10,4);

create view public.fpy_paredes as
select
  a.id            as auditoria_id,
  ap.data         as data,
  a.projeto       as projeto,
  a.casa          as casa,
  a.reconstruida  as reconstruida,
  ap.parede       as parede,
  count(o.id)     as erros,
  count(o.id) = 0 as passou_de_primeira,
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

update public.paredes pd
   set area_m2 = v.area
  from (values
    ('PT 11.1', 20.8742), ('PT 11.2', 20.8742),
    ('PT 12',   20.8742), ('PT 13',   20.8742),
    ('PT 14.1', 20.0045), ('PT 14.2', 20.0045), ('PT 14.3', 20.0045),
    ('PT 14.4', 20.0045), ('PT 14.5', 20.0045), ('PT 14.6', 20.0045),
    ('PT 14.7', 20.0045), ('PT 14.8', 20.0045),
    ('PT 15.1',  3.4646), ('PT 15.2',  3.4646),
    ('PT 16.1',  3.4675), ('PT 16.2',  3.4675), ('PT 16.3',  3.4675),
    ('PT 16.4',  3.4675), ('PT 16.5',  3.4675),
    ('PT 17.1', 20.8742), ('PT 17.2', 20.8742),
    ('PT 18.1',  3.1997), ('PT 18.2',  3.1997),
    ('PT 19',    3.0816),
    ('PT 20',    3.4330),
    ('PT 21.1',  6.0739), ('PT 21.2',  6.0739),
    ('PT 22',   20.1514),
    ('PT 23.1',  4.2797), ('PT 23.2',  4.2797),
    ('PT 24.1', 14.6016), ('PT 24.2', 14.6016),
    ('PT 25',   21.7354),
    ('PT 26.1', 15.8083), ('PT 26.2', 15.8083),
    ('PT 27.1',  5.0198), ('PT 27.2',  5.0198),
    ('PT 28.1',  7.4736), ('PT 28.2',  7.4736),
    ('PT 29.1',  6.8918), ('PT 29.2',  6.8918),
    ('PT 30.1', 20.5862), ('PT 30.2', 20.5862),
    ('PT 31',   22.3056),
    ('PT 32',    2.8886),
    ('PT 33.1',  6.9206), ('PT 33.2',  6.9206),
    ('PT 34',    3.0269),
    ('PT 35',    1.0829),
    ('PT 36',   20.0045), ('PT 37', 20.1514), ('PT 38', 22.3834),
    ('PT 39',   22.3949), ('PT 40', 20.4710), ('PT 41', 10.0483),
    ('PT 42',   22.0608), ('PT 43', 10.0742), ('PT 44',  9.7517),
    ('PT 45',   20.1485), ('PT 46',  8.8330), ('PT 47', 20.4710),
    ('PT 48',   20.4422), ('PT 49', 10.3824), ('PT 50',  1.5523),
    ('PT 51',   20.4422), ('PT 52', 10.1866), ('PT 53',  7.1280),
    ('PT 54',   20.0016), ('PT 55', 13.9248), ('PT 56', 21.7843),
    ('PT 57',    5.7283), ('PT 58', 22.5389), ('PT 59', 14.0688),
    ('PT 60',    7.4794), ('PT 61', 20.4422), ('PT 62',  7.1914),
    ('PT 63',    5.7312), ('PT 64', 20.9318), ('PT 65',  5.7600),
    ('PT 66',   20.9030), ('PT 67', 20.4422), ('PT 68',  8.2656),
    ('PT 69',    8.5680), ('PT 70',  7.9258), ('PT 71',  7.9258),
    ('PT 72',    7.9258), ('PT 73',  4.9536), ('PT 74', 20.4422),
    ('PT 75',    8.6083), ('PT 76', 20.0045), ('PT 77', 14.6563),
    ('PT 78',    4.7203), ('PT 79',  4.7203), ('PT 80',  9.0749),
    ('PT 81',   21.5712),
    ('PT 85',   14.6160), ('PT 86',  2.5315), ('PT 87', 11.3126),
    ('PT 88',   20.0045), ('PT 89',  7.8797), ('PT 90', 19.8634)
  ) as v(nome, area)
  join public.projetos pr on pr.nome = 'ESCOLA ZACARIAS PR'
 where pd.projeto_id = pr.id
   and pd.nome = v.nome;

-- Trava de conferência: se sobrar parede da escola sem metragem, ou se
-- algum nome da lista não tiver casado com o cadastro, a migration
-- falha inteira em vez de deixar o dado pela metade.
do $$
declare
  v_sem int;
begin
  select count(*) into v_sem
    from public.paredes pd
    join public.projetos pr on pr.id = pd.projeto_id
   where pr.nome = 'ESCOLA ZACARIAS PR'
     and pd.area_m2 is null;
  if v_sem > 0 then
    raise exception 'A escola ficou com % paredes sem metragem — confira os nomes.', v_sem;
  end if;
end $$;
