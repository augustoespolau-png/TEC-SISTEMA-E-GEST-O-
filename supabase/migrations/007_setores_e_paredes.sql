-- ============================================================
-- Tecverde · Registro de Erros — 007: setores e paredes reais
--
-- Extraídos das 283 ocorrências da planilha ERROS.xlsx.
--
-- SETORES: a planilha tinha 14 valores, sendo quatro deles a
-- mesma coisa escrita de formas diferentes:
--   CORTE / SME, CORT/OSB, CORTE / CÍ, CORT/C  ->  CORTE  (25×)
-- Somados aos 8 já existentes, o sistema passa a ter 11.
--
-- PAREDES: além de P1..P12, a planilha usa "BLOCO 1" (32×).
-- ============================================================

insert into public.setores (nome, ordem) values
  ('CORTE', 9),
  ('MODULO', 10),
  ('SOLEIRA', 11)
on conflict (nome) do nothing;

insert into public.paredes (projeto_id, nome, ordem)
  select p.id, 'BLOCO 1', 13 from public.projetos p where p.nome = 'C4A'
on conflict (projeto_id, nome) do nothing;
