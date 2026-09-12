-- Tecverde · corrige a projeção de anexos legados para Storage-only
--
-- Algumas fotos antigas de retrabalho ainda possuem a chave dataUrl vazia no
-- estado compatível. A sincronização de retrabalho copiava esse JSON inteiro
-- para produto_anexos, enquanto a tabela já bloqueia Base64. Isso fazia até
-- operações sem relação com fotos (como adicionar um N/A) falharem.

do $migration$
declare
  sync_original text;
  sync_corrigido text;
  rework_original text;
  rework_corrigido text;
begin
  -- O sincronizador principal precisa remover a chave também de
  -- cargaAttachments. O array attachments já era tratado dessa forma.
  select pg_get_functiondef(p.oid)
    into sync_original
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'sync_produto_estado_relacional'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = ''
   limit 1;

  if sync_original is null then
    raise exception 'Função private.sync_produto_estado_relacional não encontrada';
  end if;

  sync_corrigido := replace(
    sync_original,
    $old$a->>'path',a,now())$old$,
    $new$a->>'path',a - 'dataUrl',now())$new$
  );
  sync_corrigido := replace(
    sync_corrigido,
    $old$a->>'path', a, now())$old$,
    $new$a->>'path', a - 'dataUrl', now())$new$
  );

  if position($needle$a - 'dataUrl'$needle$ in sync_corrigido) = 0
     or (
       position($needle$a->>'path',a,now()$needle$ in sync_original) > 0
       and position($needle$a->>'path',a,now()$needle$ in sync_corrigido) > 0
     )
     or (
       position($needle$a->>'path', a, now()$needle$ in sync_original) > 0
       and position($needle$a->>'path', a, now()$needle$ in sync_corrigido) > 0
     ) then
    raise exception 'Não foi possível proteger o sincronizador principal de anexos';
  end if;

  execute sync_corrigido;

  -- O sincronizador de retrabalho precisa aplicar a mesma regra tanto no raw
  -- de produto_anexos quanto nos metadados da tabela genérica.
  select pg_get_functiondef(p.oid)
    into rework_original
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'sync_produto_retrabalho_from_state'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = 'p_registros jsonb'
   limit 1;

  if rework_original is null then
    raise exception 'Função private.sync_produto_retrabalho_from_state não encontrada';
  end if;

  rework_corrigido := replace(
    rework_original,
    $old$a->>'path', a, now())$old$,
    $new$a->>'path', a - 'dataUrl', now())$new$
  );
  rework_corrigido := replace(
    rework_corrigido,
    $old$a->>'path', a,$old$,
    $new$a->>'path', a - 'dataUrl',$new$
  );
  rework_corrigido := replace(
    rework_corrigido,
    $old$a->>'path',a,now())$old$,
    $new$a->>'path',a - 'dataUrl',now())$new$
  );
  rework_corrigido := replace(
    rework_corrigido,
    $old$a->>'path',a,$old$,
    $new$a->>'path',a - 'dataUrl',$new$
  );

  if position($needle$a - 'dataUrl'$needle$ in rework_corrigido) = 0
     or position($needle$a->>'path', a,$needle$ in rework_corrigido) > 0
     or position($needle$a->>'path',a,$needle$ in rework_corrigido) > 0 then
    raise exception 'Não foi possível proteger o sincronizador de retrabalho de anexos';
  end if;

  execute rework_corrigido;

  -- Remove somente a chave legada do estado canônico. Os caminhos do Storage
  -- e todos os demais metadados das fotos são preservados.
  update public.auditoria_produto_estado e
     set registros = (
       select coalesce(
         jsonb_agg(
           case
             when jsonb_typeof(registro_item.registro -> 'reworkAttachments') = 'array' then
               jsonb_set(
                 registro_item.registro,
                 '{reworkAttachments}',
                 coalesce(
                   (
                     select jsonb_agg(anexo_item.anexo - 'dataUrl' order by anexo_item.ordem)
                       from jsonb_array_elements(
                         coalesce(registro_item.registro -> 'reworkAttachments', '[]'::jsonb)
                       ) with ordinality as anexo_item(anexo, ordem)
                   ),
                   '[]'::jsonb
                 ),
                 true
               )
             else registro_item.registro
           end
           order by registro_item.ordem
         ),
         '[]'::jsonb
       )
       from jsonb_array_elements(coalesce(e.registros, '[]'::jsonb))
         with ordinality as registro_item(registro, ordem)
     ),
         updated_at = now()
   where e.id = 'global'
     and exists (
       select 1
         from jsonb_array_elements(coalesce(e.registros, '[]'::jsonb)) registro_item(registro)
         cross join lateral jsonb_array_elements(
           case
             when jsonb_typeof(registro_item.registro -> 'reworkAttachments') = 'array'
               then registro_item.registro -> 'reworkAttachments'
             else '[]'::jsonb
           end
         ) anexo_item(anexo)
        where anexo_item.anexo ? 'dataUrl'
     );
end;
$migration$;
