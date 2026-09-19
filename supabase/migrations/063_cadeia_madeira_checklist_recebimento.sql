-- Tecverde · 063: restaura checklist da Auditoria de Recebimento
-- e migra somente o cadastro mestre de fornecedores do módulo legado.
--
-- Idempotente:
-- - não duplica fornecedores já existentes por razão social;
-- - não migra lotes, auditorias, ensaios, laudos ou anexos;
-- - preserva o checklist como JSONB para manter as dez verificações
--   históricas sem acoplar o resultado final aos checks.

begin;

alter table public.cadeia_madeira_lotes
  add column if not exists checklist jsonb not null default '{}'::jsonb;

comment on column public.cadeia_madeira_lotes.checklist is
  'Checklist da auditoria de recebimento restaurado do sistema legado Tecverde. Chaves permitidas: quantidade, dimensoes, lote, embalagem, mofo, empenamento, rachaduras, contaminacao, umidade, documentacao.';

do $constraints$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.cadeia_madeira_lotes'::regclass
       and conname = 'cadeia_madeira_lotes_checklist_obj_ck'
  ) then
    alter table public.cadeia_madeira_lotes
      add constraint cadeia_madeira_lotes_checklist_obj_ck
      check (jsonb_typeof(checklist) = 'object');
  end if;
end
$constraints$;

insert into public.cadeia_madeira_fornecedores (
  id,
  razao_social,
  cnpj,
  homologacao_ativa,
  certificacao_origem,
  contato_tecnico_nome,
  contato_tecnico_email,
  contato_tecnico_telefone,
  historico_avaliacao,
  ativo,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  trim(f.razao_social),
  case
    when regexp_replace(coalesce(f.cnpj, ''), '[^0-9]', '', 'g') ~ '^[0-9]{14}$'
      then regexp_replace(f.cnpj, '[^0-9]', '', 'g')
    else null
  end,
  upper(trim(coalesce(f.status_homologacao, ''))) = 'HOMOLOGADO',
  null,
  nullif(trim(f.contato), ''),
  nullif(lower(trim(f.email)), ''),
  nullif(trim(f.telefone), ''),
  null,
  lower(trim(coalesce(f.status, 'ativo'))) = 'ativo',
  null,
  null,
  coalesce(f.created_at, now()),
  coalesce(f.updated_at, f.created_at, now())
from public.fornecedores f
where nullif(trim(f.razao_social), '') is not null
  and not exists (
    select 1
      from public.cadeia_madeira_fornecedores n
     where lower(trim(n.razao_social)) = lower(trim(f.razao_social))
  )
on conflict do nothing;

notify pgrst, 'reload schema';

commit;
