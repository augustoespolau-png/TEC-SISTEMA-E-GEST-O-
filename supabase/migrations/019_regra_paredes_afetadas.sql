-- ============================================================
-- Tecverde · Sistema de Gestão da Qualidade — 019
-- A regra que zera o FPY da casa muda de unidade
--
-- ANTES  (017): casa com mais de 5 ERROS tem o FPY zerado.
-- AGORA:        casa com 6 ou mais PAREDES AFETADAS tem o FPY zerado.
--
-- Não é a mesma coisa. Uma casa com 8 erros concentrados em 2 paredes
-- era zerada pela regra antiga e não é pela nova; uma casa com 6 erros
-- espalhados em 6 paredes é zerada pelas duas. A leitura da empresa é
-- sobre ESPALHAMENTO: meia casa comprometida, não volume de erro.
--
-- Efeito medido na base de agosto/2026 (52 casas do C4A):
--   pela regra antiga  19 casas zeradas
--   pela regra nova     9 casas zeradas  (todas já estavam nas 19)
-- ============================================================

delete from public.parametros where chave = 'fpy_max_erros_casa';

insert into public.parametros
  (chave, valor, ativo, rotulo, descricao, unidade, minimo, maximo, ordem)
values
  ('fpy_min_paredes_afetadas', 6, true,
   'Casa com N ou mais paredes afetadas tem FPY zerado',
   'Conta quantas posições de parede da casa tiveram pelo menos um erro. Atingindo este número, a casa conta como se nenhuma parede tivesse passado de primeira — inclusive as paredes limpas. Vale só para o FPY: a execução da casa continua mostrando o que já foi resolvido.',
   'paredes', 1, 99, 1)
on conflict (chave) do update
  set valor = excluded.valor,
      rotulo = excluded.rotulo,
      descricao = excluded.descricao,
      unidade = excluded.unidade,
      minimo = excluded.minimo,
      maximo = excluded.maximo;
