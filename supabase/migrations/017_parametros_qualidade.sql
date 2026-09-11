-- ============================================================
-- Tecverde · Sistema de Gestão da Qualidade — 017
-- Parâmetros editáveis pela gestão
--
-- Primeira regra a morar aqui: casa que passou de N erros tem o FPY
-- zerado, independente de em quais paredes os erros caíram. É decisão
-- de negócio da empresa, não de engenharia — por isso vive no banco,
-- editável na tela de Configurações, e não escondida no código.
--
-- A tabela é genérica de propósito. Regra nova de qualidade entra como
-- linha, sem migration.
-- ============================================================

create table if not exists public.parametros (
  chave          text primary key,
  valor          numeric not null,
  ativo          boolean not null default true,
  rotulo         text not null,
  descricao      text not null,
  unidade        text,
  minimo         numeric,
  maximo         numeric,
  ordem          int not null default 0,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id)
);

comment on table public.parametros is
  'Regras de negócio que a gestão pode mudar sem alterar código. Lidas pelo painel a cada carga.';

insert into public.parametros
  (chave, valor, ativo, rotulo, descricao, unidade, minimo, maximo, ordem)
values
  ('fpy_max_erros_casa', 5, true,
   'Casa com mais de N erros tem FPY zerado',
   'Se a casa acumular mais erros que este limite, ela conta como se nenhuma parede tivesse passado de primeira — mesmo as paredes sem erro. Vale só para o FPY; a execução da casa continua contando o que já foi resolvido.',
   'erros', 0, 999, 1)
on conflict (chave) do nothing;

-- ---------- quem pode ler e quem pode mudar ----------
alter table public.parametros enable row level security;

drop policy if exists parametros_select on public.parametros;
create policy parametros_select on public.parametros
  for select to authenticated
  using (auth.uid() is not null);

drop policy if exists parametros_update on public.parametros;
create policy parametros_update on public.parametros
  for update to authenticated
  using (public.get_my_role() = 'gestao')
  with check (public.get_my_role() = 'gestao');

-- ninguém cria nem apaga parâmetro pela aplicação: a lista é do sistema
revoke all on public.parametros from anon, authenticated;
grant select, update on public.parametros to authenticated;

-- ---------- carimbo de autoria ----------
create or replace function public.parametros_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.chave      := old.chave;      -- a chave é do sistema
  new.rotulo     := old.rotulo;
  new.descricao  := old.descricao;
  new.minimo     := old.minimo;
  new.maximo     := old.maximo;
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.minimo is not null and new.valor < new.minimo then
    raise exception 'Valor abaixo do mínimo permitido (%).', new.minimo;
  end if;
  if new.maximo is not null and new.valor > new.maximo then
    raise exception 'Valor acima do máximo permitido (%).', new.maximo;
  end if;
  return new;
end $$;

drop trigger if exists trg_parametros_guard on public.parametros;
create trigger trg_parametros_guard
  before update on public.parametros
  for each row execute function public.parametros_guard();

-- ---------- entra na trilha de auditoria ----------
-- a tabela não tem coluna "nome" nem "id": sem este caso o histórico
-- mostraria a mudança da regra como "#?"
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
    when 'parametros' then
      'Regra: ' || coalesce(r->>'rotulo', r->>'chave', '?')
    else coalesce(r->>'nome', '#' || coalesce(r->>'id', '?'))
  end
$$;

drop trigger if exists trg_log_parametros on public.parametros;
create trigger trg_log_parametros
  after insert or update or delete on public.parametros
  for each row execute function public.registrar_log();
