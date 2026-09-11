-- ============================================================
-- Tecverde · Registro de Erros — 002: RLS (segurança por papel)
-- A UI apenas esconde; quem BLOQUEIA de verdade é o banco.
-- ============================================================

alter table public.profiles enable row level security;
alter table public.projetos enable row level security;
alter table public.paredes enable row level security;
alter table public.setores enable row level security;
alter table public.tipos_erro enable row level security;
alter table public.ocorrencias enable row level security;

-- ------------------------------------------------------------
-- profiles: cada um lê o próprio; gestão lê e edita todos
-- ------------------------------------------------------------
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.get_my_role() = 'gestao');

create policy profiles_update_gestao on public.profiles for update
  using (public.get_my_role() = 'gestao')
  with check (public.get_my_role() = 'gestao');

-- ------------------------------------------------------------
-- Config: leitura para logados; escrita só gestão
-- ------------------------------------------------------------
create policy projetos_select on public.projetos for select
  using (auth.uid() is not null);
create policy projetos_write on public.projetos for all
  using (public.get_my_role() = 'gestao')
  with check (public.get_my_role() = 'gestao');

create policy paredes_select on public.paredes for select
  using (auth.uid() is not null);
create policy paredes_write on public.paredes for all
  using (public.get_my_role() = 'gestao')
  with check (public.get_my_role() = 'gestao');

create policy setores_select on public.setores for select
  using (auth.uid() is not null);
create policy setores_write on public.setores for all
  using (public.get_my_role() = 'gestao')
  with check (public.get_my_role() = 'gestao');

create policy tipos_erro_select on public.tipos_erro for select
  using (auth.uid() is not null);
create policy tipos_erro_write on public.tipos_erro for all
  using (public.get_my_role() = 'gestao')
  with check (public.get_my_role() = 'gestao');

-- ------------------------------------------------------------
-- ocorrencias
--  - leitura: qualquer logado
--  - insert: operador e gestão (consultor NÃO registra)
--  - update: qualquer logado (colunas protegidas pelo trigger guard)
--  - delete: só gestão
-- ------------------------------------------------------------
create policy oco_select on public.ocorrencias for select
  using (auth.uid() is not null);

create policy oco_insert on public.ocorrencias for insert
  with check (public.get_my_role() in ('operador', 'gestao'));

create policy oco_update on public.ocorrencias for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy oco_delete on public.ocorrencias for delete
  using (public.get_my_role() = 'gestao');
