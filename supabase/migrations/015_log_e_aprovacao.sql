-- ============================================================
-- Tecverde · Registro de Erros — 015: rastreabilidade e aprovação
--
-- Três regras novas de negócio, todas cravadas no BANCO (a tela só
-- ajuda; quem obriga é aqui):
--
--   1. OBSERVAÇÃO OBRIGATÓRIA — nenhuma pessoa muda o status de um
--      erro sem escrever o que foi feito. Sem texto, a alteração é
--      recusada. A rotina automática de não conformidade continua
--      podendo agir sem observação (ela não é uma pessoa).
--
--   2. RETRABALHO PRECISA DE APROVAÇÃO — quem executa marca o
--      retrabalho e o registro fica em RETRABALHO_PENDENTE. Só a
--      gestão converte para RETRABALHO. Enquanto não aprovado, o
--      erro não conta como resolvido em nenhum indicador.
--
--   3. LOG DE TUDO — cada criação, alteração campo a campo e exclusão
--      fica gravada em log_atividade com autor, papel e horário.
--      É a trilha que responde "quem mudou esse status".
-- ============================================================

-- ------------------------------------------------------------
-- 1. Novo status: RETRABALHO_PENDENTE
-- ------------------------------------------------------------
alter table public.ocorrencias alter column status drop default;
alter type status_t rename to status_t_v3;

create type status_t as enum (
  'AGUARDANDO',
  'RETRABALHO_PENDENTE',
  'RETRABALHO',
  'NAO_CONFORMIDADE',
  'BLOQUEADA'
);

alter table public.ocorrencias
  alter column status type status_t using status::text::status_t;
alter table public.ocorrencias
  alter column status set default 'AGUARDANDO';

drop type status_t_v3;

create index if not exists idx_oco_status on public.ocorrencias (status);

-- quem aprovou o retrabalho, e quando
alter table public.ocorrencias
  add column if not exists aprovado_por uuid references public.profiles(id),
  add column if not exists aprovado_em timestamptz;

comment on column public.ocorrencias.aprovado_por is
  'Gestor que confirmou que o retrabalho foi realmente executado. Nulo enquanto o retrabalho está pendente de aprovação.';

-- ------------------------------------------------------------
-- 2. Guarda das ocorrências, agora com aprovação e observação
-- ------------------------------------------------------------
create or replace function public.ocorrencias_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_papel text := public.get_my_role();
  v_pessoa boolean := auth.uid() is not null;
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := null;
    new.updated_at := null;
    new.auto_nc := true;

    -- ninguém nasce retrabalhado sem passar pela gestão
    if new.status = 'RETRABALHO' and v_pessoa and v_papel is distinct from 'gestao' then
      new.status := 'RETRABALHO_PENDENTE';
    end if;

    if new.status in ('RETRABALHO', 'RETRABALHO_PENDENTE') then
      new.resolved_at := coalesce(new.resolved_at, now());
    else
      new.resolved_at := null;
    end if;

    if new.status = 'RETRABALHO' then
      new.aprovado_por := auth.uid();
      new.aprovado_em := now();
    else
      new.aprovado_por := null;
      new.aprovado_em := null;
    end if;
  else
    if v_papel is distinct from 'gestao' then
      new.data := old.data;
      new.projeto := old.projeto;
      new.parede := old.parede;
      new.casa := old.casa;
      new.setor := old.setor;
      new.tipo_erro := old.tipo_erro;
      new.ocorrencia := old.ocorrencia;
      new.criticidade := old.criticidade;
    end if;

    -- ---- aprovação do retrabalho ----
    -- quem executa não homologa o próprio serviço
    if v_pessoa
       and new.status = 'RETRABALHO'
       and old.status is distinct from 'RETRABALHO'
       and v_papel is distinct from 'gestao' then
      if old.status = 'RETRABALHO_PENDENTE' then
        raise exception
          'Somente a gestão aprova o retrabalho. O registro segue pendente de aprovação.'
          using errcode = 'insufficient_privilege';
      end if;
      -- marcou como retrabalhado: entra na fila de aprovação
      new.status := 'RETRABALHO_PENDENTE';
    end if;

    -- ---- observação obrigatória em qualquer troca de status ----
    if v_pessoa
       and new.status is distinct from old.status
       and coalesce(btrim(new.observacao), '') = '' then
      raise exception
        'Escreva uma observação explicando a alteração de status antes de salvar.'
        using errcode = 'check_violation';
    end if;

    -- ---- data do retrabalho acompanha o status ----
    if new.status in ('RETRABALHO', 'RETRABALHO_PENDENTE') then
      if old.status not in ('RETRABALHO', 'RETRABALHO_PENDENTE')
         and new.resolved_at is null then
        new.resolved_at := now();
      end if;
      new.resolved_at := coalesce(new.resolved_at, old.resolved_at, now());
    else
      new.resolved_at := null;
    end if;

    -- ---- selo de aprovação ----
    if new.status = 'RETRABALHO' then
      if old.status is distinct from 'RETRABALHO' then
        new.aprovado_por := auth.uid();
        new.aprovado_em := now();
      else
        new.aprovado_por := old.aprovado_por;
        new.aprovado_em := old.aprovado_em;
      end if;
    else
      new.aprovado_por := null;
      new.aprovado_em := null;
    end if;

    -- uma PESSOA devolvendo para AGUARDANDO desliga a conversão automática
    if v_pessoa
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

-- ------------------------------------------------------------
-- 3. Log de atividade
-- ------------------------------------------------------------
create table if not exists public.log_atividade (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id bigint,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  campo text,
  de text,
  para text,
  rotulo text,
  autor uuid references public.profiles(id),
  -- nome e papel são CÓPIAS do momento da ação: se alguém for
  -- renomeado ou trocar de papel, a trilha antiga continua verdadeira
  autor_nome text not null default 'Sistema',
  autor_papel text not null default 'automático',
  criado_em timestamptz not null default now()
);

comment on table public.log_atividade is
  'Trilha de auditoria: uma linha por campo alterado. Ninguém escreve aqui pela mão — só os gatilhos.';

create index if not exists idx_log_criado on public.log_atividade (criado_em desc);
create index if not exists idx_log_registro
  on public.log_atividade (tabela, registro_id);
create index if not exists idx_log_autor on public.log_atividade (autor);

-- identificação legível do registro, para o log não virar uma lista de ids
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
    else coalesce(r->>'nome', '#' || coalesce(r->>'id', '?'))
  end
$$;

create or replace function public.registrar_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_autor uuid := auth.uid();
  v_nome text;
  v_papel text;
  v_registro jsonb;
  v_old jsonb;
  v_new jsonb;
  v_id bigint;
  v_rotulo text;
  k text;
  -- ruído: carimbos que o próprio gatilho preenche em toda alteração
  ignorados text[] := array['id', 'created_at', 'created_by',
                            'updated_at', 'updated_by'];
begin
  if v_autor is not null then
    select p.nome, p.role::text into v_nome, v_papel
      from public.profiles p where p.id = v_autor;
  end if;
  v_nome := coalesce(nullif(btrim(v_nome), ''), 'Sistema');
  v_papel := coalesce(v_papel, 'automático');

  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  end if;

  v_registro := coalesce(v_new, v_old);
  v_id := nullif(v_registro->>'id', '')::bigint;
  v_rotulo := public.rotulo_do_registro(tg_table_name, v_registro);

  if tg_op in ('INSERT', 'DELETE') then
    insert into public.log_atividade
      (tabela, registro_id, acao, rotulo, autor, autor_nome, autor_papel)
    values
      (tg_table_name, v_id, tg_op, v_rotulo, v_autor, v_nome, v_papel);
  else
    for k in select key from jsonb_each_text(v_new) loop
      if k = any(ignorados) then continue; end if;
      if v_old->>k is distinct from v_new->>k then
        insert into public.log_atividade
          (tabela, registro_id, acao, campo, de, para, rotulo,
           autor, autor_nome, autor_papel)
        values
          (tg_table_name, v_id, 'UPDATE', k, v_old->>k, v_new->>k, v_rotulo,
           v_autor, v_nome, v_papel);
      end if;
    end loop;
  end if;

  return null; -- gatilho AFTER: o valor de retorno é ignorado
end $$;

-- ------------------------------------------------------------
-- 4. Ligar o log em tudo que registra decisão
-- ------------------------------------------------------------
drop trigger if exists trg_log_ocorrencias on public.ocorrencias;
create trigger trg_log_ocorrencias
  after insert or update or delete on public.ocorrencias
  for each row execute function public.registrar_log();

drop trigger if exists trg_log_auditorias on public.auditorias;
create trigger trg_log_auditorias
  after insert or update or delete on public.auditorias
  for each row execute function public.registrar_log();

drop trigger if exists trg_log_auditoria_paredes on public.auditoria_paredes;
create trigger trg_log_auditoria_paredes
  after insert or update or delete on public.auditoria_paredes
  for each row execute function public.registrar_log();

drop trigger if exists trg_log_projetos on public.projetos;
create trigger trg_log_projetos
  after insert or update or delete on public.projetos
  for each row execute function public.registrar_log();

drop trigger if exists trg_log_paredes on public.paredes;
create trigger trg_log_paredes
  after insert or update or delete on public.paredes
  for each row execute function public.registrar_log();

drop trigger if exists trg_log_setores on public.setores;
create trigger trg_log_setores
  after insert or update or delete on public.setores
  for each row execute function public.registrar_log();

drop trigger if exists trg_log_tipos_erro on public.tipos_erro;
create trigger trg_log_tipos_erro
  after insert or update or delete on public.tipos_erro
  for each row execute function public.registrar_log();

-- ------------------------------------------------------------
-- 5. Segurança do log
-- A trilha existe para apontar responsabilidade: ela é IMUTÁVEL.
-- Nenhum papel pode escrever, editar ou apagar linha do log — só os
-- gatilhos, que rodam como dono da tabela. Leitura é da gestão.
-- ------------------------------------------------------------
alter table public.log_atividade enable row level security;

drop policy if exists log_select_gestao on public.log_atividade;
create policy log_select_gestao on public.log_atividade for select
  using (public.get_my_role() = 'gestao');

grant select on public.log_atividade to authenticated;
revoke insert, update, delete on public.log_atividade from authenticated;

-- ------------------------------------------------------------
-- 6. Visão pronta do log com o autor já resolvido
-- ------------------------------------------------------------
drop view if exists public.log_legivel;
create view public.log_legivel
with (security_invoker = true) as
select
  l.id,
  l.criado_em,
  l.tabela,
  l.registro_id,
  l.acao,
  l.campo,
  l.de,
  l.para,
  l.rotulo,
  l.autor,
  l.autor_nome,
  l.autor_papel
from public.log_atividade l
order by l.criado_em desc, l.id desc;

comment on view public.log_legivel is
  'Log de atividade em ordem cronológica inversa. security_invoker: obedece a RLS de quem consulta (só gestão lê).';

grant select on public.log_legivel to authenticated;
