-- ============================================================
-- Tecverde · Registro de Erros — 012: BLOCO 1 é projeto, não parede
--
-- "BLOCO 1" tinha entrado como a 13ª parede do C4A. Na verdade é um
-- projeto, como o C4A. O C4A tem 12 paredes (P1 a P12).
--
-- Os 32 registros históricos que têm parede = 'BLOCO 1' NÃO são
-- alterados: as dimensões de uma ocorrência são um retrato do momento
-- do registro, e não sabemos qual parede era de fato. Reescrevê-los
-- seria inventar dado.
-- ============================================================

delete from public.paredes
 where nome = 'BLOCO 1'
   and projeto_id = (select id from public.projetos where nome = 'C4A');

insert into public.projetos (nome, ordem)
values ('BLOCO 1', 2)
on conflict (nome) do nothing;

-- mesma estrutura de 12 paredes do C4A; ajustável em Configurações
insert into public.paredes (projeto_id, nome, ordem)
  select p.id, 'P' || n, n
  from public.projetos p, generate_series(1, 12) n
  where p.nome = 'BLOCO 1'
on conflict (projeto_id, nome) do nothing;
