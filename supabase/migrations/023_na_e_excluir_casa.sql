-- ============================================================
-- Tecverde · Registro de Erros — 023: NA e exclusão de casa
--
-- 1. NA — NÃO APLICÁVEL
--
-- Auditando a parede, nem todo item da lista faz sentido nela: uma
-- parede sem esquadria não tem como ser reprovada no item esquadria.
-- Hoje o auditor só tem duas saídas — declarar a parede sem erro ou
-- lançar um erro — e o "não se aplica" some.
--
-- O NA é registro paralelo, NUNCA um erro disfarçado:
--
--   * a parede com NA e sem erro CONTINUA passando de primeira;
--   * o FPY não muda em nada por causa de NA;
--   * ele fica em tabela própria, e não em ocorrencias, justamente
--     para que nenhum indicador antigo o confunda com defeito.
--
-- Uma parede pode ter vários NAs, cada um com seu tipo e sua
-- observação — igual ao erro.
--
-- 2. EXCLUIR CASA
--
-- Casa aberta com o nome errado precisa sumir inteira: auditoria,
-- paredes conferidas, NAs e os erros lançados nela. O vínculo do erro
-- com a auditoria é ON DELETE SET NULL, então apagar a auditoria pela
-- porta da frente deixaria os erros soltos na tela Consultar, sem casa
-- de origem. Por isso a exclusão passa por uma função que apaga os
-- erros primeiro, numa transação só.
--
-- Só a gestão exclui. Tudo o que for apagado fica na trilha do log,
-- linha por linha, porque os gatilhos de log continuam valendo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. NA por parede
-- ------------------------------------------------------------
create table if not exists public.auditoria_nas (
  id bigint generated always as identity primary key,
  auditoria_id bigint not null
    references public.auditorias(id) on delete cascade,
  parede text not null,
  -- mesma lista de tipos do erro, guardada por NOME como em ocorrencias:
  -- renomear um tipo na configuração não reescreve o histórico
  tipo_erro text not null,
  observacao text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now()
);

comment on table public.auditoria_nas is
  'Itens NÃO APLICÁVEIS a uma parede. Não são erros: não entram no FPY nem em nenhum indicador de defeito.';

create index if not exists idx_nas_auditoria
  on public.auditoria_nas (auditoria_id);
create index if not exists idx_nas_parede
  on public.auditoria_nas (auditoria_id, parede);

-- autor e horário são do servidor, não do cliente
create or replace function public.auditoria_nas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.criado_por := auth.uid();
  new.criado_em := now();
  return new;
end $$;

drop trigger if exists trg_auditoria_nas_guard on public.auditoria_nas;
create trigger trg_auditoria_nas_guard
  before insert on public.auditoria_nas
  for each row execute function public.auditoria_nas_guard();

alter table public.auditoria_nas enable row level security;

drop policy if exists auditoria_nas_select on public.auditoria_nas;
create policy auditoria_nas_select on public.auditoria_nas for select
  using (auth.uid() is not null);

drop policy if exists auditoria_nas_insert on public.auditoria_nas;
create policy auditoria_nas_insert on public.auditoria_nas for insert
  with check (public.get_my_role() in ('operador', 'gestao'));

drop policy if exists auditoria_nas_delete on public.auditoria_nas;
create policy auditoria_nas_delete on public.auditoria_nas for delete
  using (public.get_my_role() in ('operador', 'gestao'));

-- ------------------------------------------------------------
-- 2. O log entende a tabela nova
-- ------------------------------------------------------------
create or replace function public.rotulo_do_registro(p_tabela text, r jsonb)
returns text language sql immutable set search_path = public as $$
  select case p_tabela
    when 'ocorrencias' then
      'Casa ' || coalesce(r->>'casa', '?') ||
      ' · ' || coalesce(r->>'parede', '?') ||
      ' · ' || coalesce(r->>'tipo_erro', '')
    when 'auditorias' then
      'Auditoria ' || coalesce(r->>'projeto', '') ||
      ' · casa ' || coalesce(r->>'casa', '?')
    when 'auditoria_paredes' then
      'Parede ' || coalesce(r->>'parede', '?') ||
      ' (auditoria ' || coalesce(r->>'auditoria_id', '?') || ')'
    when 'auditoria_nas' then
      'NA · parede ' || coalesce(r->>'parede', '?') ||
      ' · ' || coalesce(r->>'tipo_erro', '') ||
      ' (auditoria ' || coalesce(r->>'auditoria_id', '?') || ')'
    else coalesce(r->>'nome', '#' || coalesce(r->>'id', '?'))
  end
$$;

drop trigger if exists trg_log_auditoria_nas on public.auditoria_nas;
create trigger trg_log_auditoria_nas
  after insert or update or delete on public.auditoria_nas
  for each row execute function public.registrar_log();

-- ------------------------------------------------------------
-- 3. Excluir a casa inteira
--
-- security definer para poder apagar as ocorrências junto: a RLS de
-- ocorrencias não dá delete a ninguém pela porta da frente. A checagem
-- de papel é feita aqui dentro, na primeira linha — sem ela, definer
-- viraria um buraco aberto para qualquer pessoa logada.
-- ------------------------------------------------------------
create or replace function public.excluir_auditoria(p_id bigint)
returns table (erros_apagados int, paredes_apagadas int, nas_apagados int)
language plpgsql security definer set search_path = public as $$
declare
  v_erros int;
  v_paredes int;
  v_nas int;
begin
  if public.get_my_role() is distinct from 'gestao' then
    raise exception 'Somente a gestão exclui uma casa auditada.'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.auditorias where id = p_id) then
    raise exception 'Auditoria % não existe.', p_id
      using errcode = 'no_data_found';
  end if;

  select count(*) into v_erros
    from public.ocorrencias where auditoria_id = p_id;
  select count(*) into v_paredes
    from public.auditoria_paredes where auditoria_id = p_id;
  select count(*) into v_nas
    from public.auditoria_nas where auditoria_id = p_id;

  -- os erros primeiro: o vínculo é SET NULL, entao apagar a auditoria
  -- antes os deixaria orfaos e invisiveis nesta contagem
  delete from public.ocorrencias where auditoria_id = p_id;
  -- paredes e NAs saem por cascade junto com a auditoria
  delete from public.auditorias where id = p_id;

  return query select v_erros, v_paredes, v_nas;
end $$;

revoke all on function public.excluir_auditoria(bigint) from public;
grant execute on function public.excluir_auditoria(bigint) to authenticated;

comment on function public.excluir_auditoria(bigint) is
  'Apaga a casa auditada inteira: erros, paredes conferidas, NAs e a auditoria. Só gestão. Cada linha apagada fica no log_atividade.';

-- ------------------------------------------------------------
-- 4. NAs prontos para consulta, com o nome do autor resolvido
-- ------------------------------------------------------------
drop view if exists public.nas_legiveis;
create view public.nas_legiveis
with (security_invoker = true) as
select
  n.id,
  n.auditoria_id,
  a.projeto,
  a.casa,
  n.parede,
  n.tipo_erro,
  n.observacao,
  n.criado_em,
  coalesce(nullif(btrim(p.nome), ''), 'Sistema') as autor_nome
from public.auditoria_nas n
join public.auditorias a on a.id = n.auditoria_id
left join public.profiles p on p.id = n.criado_por;

comment on view public.nas_legiveis is
  'NA com projeto, casa e autor já resolvidos. security_invoker: obedece a RLS de quem consulta.';

grant select on public.nas_legiveis to authenticated;
