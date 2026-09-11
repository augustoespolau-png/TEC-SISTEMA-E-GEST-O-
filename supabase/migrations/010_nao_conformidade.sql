-- ============================================================
-- Tecverde · Registro de Erros — 010: não conformidade automática
--
-- REGRA DE NEGÓCIO
--   1. Todo erro nasce como AGUARDANDO (o formulário não pergunta).
--   2. A produção resolve e marca RETRABALHO (com a data do reparo).
--   3. Se passar 48 h do registro sem virar RETRABALHO, o sistema
--      converte sozinho para NAO_CONFORMIDADE, de hora em hora.
--   4. Correção manual: se alguém consertou e esqueceu de lançar,
--      basta trocar o status na tela Consultar. Se a correção for
--      devolver para AGUARDANDO, a conversão automática é desligada
--      naquele registro (auto_nc = false) para o sistema não desfazer
--      a decisão da pessoa.
--
-- O relógio conta a partir de created_at (quando o erro entrou no
-- sistema), então ninguém é penalizado por lançamento atrasado.
-- ============================================================

-- ---------- 1. novo status no enum ----------
update public.ocorrencias set status = 'AGUARDANDO' where status is null;

alter table public.ocorrencias alter column status drop default;
alter type status_t rename to status_t_v2;

create type status_t as enum (
  'AGUARDANDO',
  'RETRABALHO',
  'NAO_CONFORMIDADE',
  'BLOQUEADA'
);

alter table public.ocorrencias
  alter column status type status_t using status::text::status_t;
alter table public.ocorrencias
  alter column status set default 'AGUARDANDO';

drop type status_t_v2;

-- ---------- 2. trava de correção manual ----------
alter table public.ocorrencias
  add column if not exists auto_nc boolean not null default true;

comment on column public.ocorrencias.auto_nc is
  'Quando falso, o sistema não converte mais este registro em não conformidade automaticamente (alguém devolveu para AGUARDANDO de propósito).';

-- ---------- 3. guarda: auditoria, colunas protegidas e auto_nc ----------
create or replace function public.ocorrencias_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := null;
    new.updated_at := null;
    new.auto_nc := true;
    if new.status = 'RETRABALHO' then
      new.resolved_at := coalesce(new.resolved_at, now());
    else
      new.resolved_at := null;
    end if;
  else
    if public.get_my_role() is distinct from 'gestao' then
      new.data := old.data;
      new.projeto := old.projeto;
      new.parede := old.parede;
      new.casa := old.casa;
      new.setor := old.setor;
      new.tipo_erro := old.tipo_erro;
      new.ocorrencia := old.ocorrencia;
      new.criticidade := old.criticidade;
    end if;

    -- data do retrabalho acompanha o status
    if new.status = 'RETRABALHO' then
      if old.status is distinct from 'RETRABALHO' and new.resolved_at is null then
        new.resolved_at := now();
      end if;
      new.resolved_at := coalesce(new.resolved_at, old.resolved_at, now());
    else
      new.resolved_at := null;
    end if;

    -- uma PESSOA devolvendo para AGUARDANDO desliga a conversão automática
    -- (a rotina de hora em hora roda sem usuário, então não cai aqui)
    if auth.uid() is not null
       and new.status = 'AGUARDANDO'
       and old.status is distinct from 'AGUARDANDO' then
      new.auto_nc := false;
    end if;

    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

-- ---------- 4. rotina que aplica a regra ----------
create or replace function public.aplicar_nao_conformidades()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  afetadas integer;
begin
  update public.ocorrencias
     set status = 'NAO_CONFORMIDADE'
   where status = 'AGUARDANDO'
     and auto_nc
     and created_at + interval '48 hours' <= now();
  get diagnostics afetadas = row_count;
  return afetadas;
end $$;

grant execute on function public.aplicar_nao_conformidades() to authenticated;

-- ---------- 5. agenda de hora em hora ----------
select cron.unschedule('nao-conformidades')
  where exists (select 1 from cron.job where jobname = 'nao-conformidades');

select cron.schedule(
  'nao-conformidades',
  '7 * * * *',
  $$ select public.aplicar_nao_conformidades(); $$
);

-- ---------- 6. correção única do histórico ----------
-- Os registros importados da planilha antiga entraram todos de uma vez,
-- então o created_at deles não reflete a idade real. Estes já estão em
-- aberto há semanas: são não conformidades de fato.
update public.ocorrencias
   set status = 'NAO_CONFORMIDADE'
 where status = 'AGUARDANDO'
   and data < (now() at time zone 'America/Sao_Paulo')::date - 2;
