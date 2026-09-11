-- ============================================================
-- Tecverde · Registro de Erros — 003: dados iniciais
-- ("OUTRO"/"OUTROS" é opção da tela, não linha do banco)
-- ============================================================

insert into public.projetos (nome, ordem) values ('C4A', 1);

insert into public.paredes (projeto_id, nome, ordem)
  select p.id, 'P' || n, n
  from public.projetos p, generate_series(1, 12) n
  where p.nome = 'C4A';

insert into public.setores (nome, ordem) values
  ('CLASSIFICAÇÃO', 1),
  ('FRAME', 2),
  ('L', 3),
  ('R1', 4),
  ('R2', 5),
  ('R3', 6),
  ('VERTICAL', 7),
  ('PRÉ EXPEDIÇÃO', 8);

insert into public.tipos_erro (nome, ordem) values
  ('SOLEIRA', 1),
  ('OSB', 2),
  ('PLACA CIMENTÍCIA', 3),
  ('PREGOS', 4),
  ('ENTALHES', 5),
  ('ANTENAS', 6);

-- ============================================================
-- USUÁRIOS — rodar SOMENTE DEPOIS de criar as 3 contas em
-- Authentication → Users → Add user (com "Auto Confirm" ligado):
--   operador@SEUDOMINIO.com.br  /  consultor@...  /  gestao@...
-- O trigger cria o profile de cada um com papel 'consultor';
-- os comandos abaixo promovem operador e gestão.
-- TROQUE os e-mails pelos que você criou:
-- ============================================================

-- update public.profiles set role = 'operador', nome = 'Operador'
--   where id = (select id from auth.users where email = 'operador@tecverde.com.br');

-- update public.profiles set role = 'gestao', nome = 'Gestão'
--   where id = (select id from auth.users where email = 'gestao@tecverde.com.br');

-- update public.profiles set nome = 'Consultor'
--   where id = (select id from auth.users where email = 'consultor@tecverde.com.br');
