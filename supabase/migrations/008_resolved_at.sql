-- ============================================================
-- Tecverde · Registro de Erros — 008: data do retrabalho
--
-- Nova coluna `resolved_at`: quando o erro foi de fato
-- retrabalhado. Preenchida automaticamente quando o status muda
-- para RETRABALHO (e limpa se voltar atrás), mas o usuário pode
-- informar/editar a data manualmente na tela Consultar.
--
-- Destrava: tempo de retrabalho (registro -> conclusão), fluxo
-- entradas × saídas por semana e "casa completa em N dias".
-- Registros antigos ficam com NULL (honestidade: não sabemos a
-- data real) — os indicadores valem dos registros novos em diante.
-- ============================================================

alter table public.ocorrencias add column resolved_at timestamptz;

create index idx_oco_resolved_at on public.ocorrencias (resolved_at);

create or replace function public.ocorrencias_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.updated_by := null;
    new.updated_at := null;
    -- registrado já como retrabalhado -> carimba agora (se não veio data)
    if new.status = 'RETRABALHO' then
      new.resolved_at := coalesce(new.resolved_at, now());
    else
      new.resolved_at := null;
    end if;
  else
    if public.get_my_role() is distinct from 'gestao' then
      -- não-gestão: só status, observação e data do retrabalho mudam
      new.data := old.data;
      new.projeto := old.projeto;
      new.parede := old.parede;
      new.casa := old.casa;
      new.setor := old.setor;
      new.tipo_erro := old.tipo_erro;
      new.ocorrencia := old.ocorrencia;
      new.criticidade := old.criticidade;
    end if;
    if new.status = 'RETRABALHO' then
      if old.status is distinct from 'RETRABALHO' and new.resolved_at is null then
        new.resolved_at := now();
      end if;
      new.resolved_at := coalesce(new.resolved_at, old.resolved_at, now());
    else
      -- deixou de ser retrabalhada -> a data não vale mais
      new.resolved_at := null;
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;
