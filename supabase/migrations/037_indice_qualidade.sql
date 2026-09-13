-- Tecverde · Índice de Qualidade
--
-- A view continua sendo a projeção canônica usada pelos indicadores. A
-- coluna nova apenas expõe o total de itens NA já guardado em
-- produto_auditorias.raw; não cria tabela, cópia de auditoria ou binário.
-- O card combina esta coluna com a view ocorrencias e com tipos_erro.

create or replace view public.fpy_paredes
with (security_invoker = true)
as
select
  a.data_inspecao as data,
  coalesce(nullif(a.projeto_nome, ''), a.projeto_id, 'Projeto não informado') as projeto,
  coalesce(a.casa, 'Casa não informada') as casa,
  coalesce(a.parede_nome, 'Parede não informada') as parede,
  coalesce(d.qtd, 0) as erros,
  upper(coalesce(a.resultado_primeira_passagem, '')) = 'OK'
    or upper(coalesce(a.status, '')) = 'PAREDE_OK' as passou_de_primeira,
  a.id like 'legacy_%' as reconstruida,
  a.area as area_m2,
  case
    when jsonb_typeof(a.raw -> 'naItems') = 'array'
      then jsonb_array_length(a.raw -> 'naItems')
    else 0
  end::integer as nao_aplicaveis
from public.produto_auditorias a
left join (
  select pd.auditoria_id, count(*)::integer as qtd
    from public.produto_desvios pd
   group by pd.auditoria_id
) d on d.auditoria_id = a.id
where a.data_inspecao is not null
  and upper(coalesce(a.status, '')) <> 'PENDENTE'
  and nullif(trim(a.parede_nome), '') is not null;

comment on view public.fpy_paredes is
  'Uma linha por parede conferida. Inclui nao_aplicaveis para o Índice de Qualidade; security_invoker obedece à RLS de quem consulta.';

grant select on public.fpy_paredes to authenticated;
