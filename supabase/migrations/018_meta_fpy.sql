-- ============================================================
-- Tecverde · Sistema de Gestão da Qualidade — 018
-- A meta de FPY também é decisão da empresa
--
-- O painel tinha DUAS metas contraditórias no código: 95% no cartão do
-- FPY e 70% na linha tracejada do gráfico de evolução. A referência da
-- diretoria usa 70%. Passa a existir uma só, e no banco — pelo mesmo
-- motivo da regra da casa: é número de negócio, não de engenharia.
-- ============================================================

insert into public.parametros
  (chave, valor, ativo, rotulo, descricao, unidade, minimo, maximo, ordem)
values
  ('fpy_meta', 70, true,
   'Meta de FPY',
   'O alvo de paredes que passam de primeira. Aparece como referência no cartão do FPY e como linha tracejada no gráfico de evolução, e define a partir de quanto o número aparece em verde.',
   '%', 1, 100, 0)
on conflict (chave) do nothing;
