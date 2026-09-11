-- ============================================================
-- Tecverde · Registro de Erros — 011: auditoria de casa
--
-- O auditor percorre a casa parede por parede e, em cada uma,
-- declara: "sem erros" ou registra os erros encontrados.
--
-- POR QUE ISSO IMPORTA: as paredes marcadas como inspecionadas são
-- o DENOMINADOR que faltava para o First Pass Yield. Antes o sistema
-- só enxergava painéis com problema; agora enxerga também os que
-- passaram de primeira.
--
--   FPY = paredes inspecionadas SEM nenhum erro ÷ paredes inspecionadas
--
-- A situação de cada parede (OK / com erros) NÃO é guardada: ela é
-- deduzida da existência de ocorrências ligadas àquela auditoria e
-- parede. Assim é impossível o rótulo divergir dos erros reais.
-- ============================================================

-- ---------- auditoria: uma por casa, editável ao longo do tempo ----------
create table public.auditorias (
  id bigint generated always as identity primary key,
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  projeto text not null,
  casa text not null,
  observacao text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz,
  unique (projeto, casa)
);

create index idx_auditorias_data on public.auditorias (data desc);

-- ---------- paredes inspecionadas ----------
create table public.auditoria_paredes (
  id bigint generated always as identity primary key,
  auditoria_id bigint not null references public.auditorias(id) on delete cascade,
  parede text not null,
  inspecionada_em timestamptz not null default now(),
  inspecionada_por uuid references public.profiles(id),
  unique (auditoria_id, parede)
);

create index idx_auditoria_paredes_auditoria
  on public.auditoria_paredes (auditoria_id);

comment on table public.auditoria_paredes is
  'Cada linha é uma parede que o auditor conferiu. Sem erros ligados = passou de primeira (conta no FPY).';

-- ---------- ligação com os erros já existentes ----------
-- Os erros da auditoria vão para a MESMA tabela de sempre, então
-- aparecem na tela Consultar e no painel sem nenhum tratamento especial.
alter table public.ocorrencias
  add column if not exists auditoria_id bigint
  references public.auditorias(id) on delete set null;

create index idx_oco_auditoria on public.ocorrencias (auditoria_id);

-- ---------- auditoria de quem criou/alterou ----------
create or replace function public.auditorias_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := null;
    new.updated_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger trg_auditorias_guard
  before insert or update on public.auditorias
  for each row execute function public.auditorias_guard();

create or replace function public.auditoria_paredes_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.inspecionada_por := auth.uid();
  new.inspecionada_em := now();
  return new;
end $$;

create trigger trg_auditoria_paredes_guard
  before insert on public.auditoria_paredes
  for each row execute function public.auditoria_paredes_guard();

-- ---------- segurança ----------
alter table public.auditorias enable row level security;
alter table public.auditoria_paredes enable row level security;

-- todo mundo logado enxerga; quem audita é operador e gestão
create policy auditorias_select on public.auditorias for select
  using (auth.uid() is not null);
create policy auditorias_insert on public.auditorias for insert
  with check (public.get_my_role() in ('operador', 'gestao'));
create policy auditorias_update on public.auditorias for update
  using (public.get_my_role() in ('operador', 'gestao'))
  with check (public.get_my_role() in ('operador', 'gestao'));
create policy auditorias_delete on public.auditorias for delete
  using (public.get_my_role() = 'gestao');

create policy auditoria_paredes_select on public.auditoria_paredes for select
  using (auth.uid() is not null);
create policy auditoria_paredes_insert on public.auditoria_paredes for insert
  with check (public.get_my_role() in ('operador', 'gestao'));
create policy auditoria_paredes_delete on public.auditoria_paredes for delete
  using (public.get_my_role() in ('operador', 'gestao'));

-- ---------- FPY pronto para consulta ----------
create or replace view public.fpy_paredes as
select
  a.id            as auditoria_id,
  a.data          as data,
  a.projeto       as projeto,
  a.casa          as casa,
  ap.parede       as parede,
  count(o.id)     as erros,
  count(o.id) = 0 as passou_de_primeira
from public.auditoria_paredes ap
join public.auditorias a on a.id = ap.auditoria_id
left join public.ocorrencias o
  on o.auditoria_id = a.id and o.parede = ap.parede
group by a.id, a.data, a.projeto, a.casa, ap.parede;

comment on view public.fpy_paredes is
  'Uma linha por parede inspecionada. passou_de_primeira = true alimenta o numerador do FPY; o total de linhas é o denominador.';

grant select on public.fpy_paredes to authenticated;
