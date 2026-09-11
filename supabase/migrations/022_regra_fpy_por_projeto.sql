-- ============================================================
-- Tecverde · Sistema de Gestão da Qualidade — 022
-- A regra do FPY zerado passa a valer por projeto
--
-- POR QUE: a regra é "casa com N paredes afetadas tem o FPY zerado", com
-- N global (hoje 6). Isso pesa muito diferente conforme o projeto: no C4A
-- são 6 de 12 paredes — metade da casa comprometida, que é a leitura que
-- a regra quis capturar. Na ESCOLA ZACARIAS PR são 6 de 101 — 6% da obra
-- zerando o indicador inteiro. A escola ficou com FPY 0 tendo 3 paredes
-- limpas de 24 conferidas.
--
-- O FPY em si não muda, e continua sendo o mesmo de sempre:
--     paredes que passaram de primeira ÷ paredes processadas
-- O que passa a ser por projeto é apenas se o zeramento se aplica.
-- ============================================================

alter table public.projetos
  add column if not exists fpy_regra_ativa boolean not null default true;

comment on column public.projetos.fpy_regra_ativa is
  'Aplica a este projeto a regra de zerar o FPY da casa por paredes '
  'afetadas (parametros.fpy_min_paredes_afetadas). Desligado, o FPY do '
  'projeto é sempre passaram/processadas. Editável em Configurações.';

-- Decisão do usuário: a escola sai da regra; o C4A continua nela.
update public.projetos
   set fpy_regra_ativa = false
 where nome = 'ESCOLA ZACARIAS PR';
