-- ============================================================
-- Tecverde · Registro de Erros — 006: remove o status OK
--
-- A empresa decidiu não usar mais a tratativa "OK". Os status
-- passam a ser apenas: AGUARDANDO, RETRABALHO e BLOQUEADA.
--
-- Postgres não permite apagar um valor de enum, então o tipo é
-- recriado sem o OK. Registros que porventura estejam como OK
-- são convertidos para RETRABALHO antes da troca.
-- ============================================================

update public.ocorrencias set status = 'RETRABALHO' where status = 'OK';

alter table public.ocorrencias alter column status drop default;

alter type status_t rename to status_t_antigo;

create type status_t as enum ('AGUARDANDO', 'RETRABALHO', 'BLOQUEADA');

alter table public.ocorrencias
  alter column status type status_t using status::text::status_t;

alter table public.ocorrencias
  alter column status set default 'AGUARDANDO';

drop type status_t_antigo;
