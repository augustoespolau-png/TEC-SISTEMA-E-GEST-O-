-- Tecverde · elimina a chave legada dataUrl dos documentos da auditoria
--
-- Os PDFs já estão no Storage e possuem path válido. O estado compatível
-- ainda carregava dataUrl vazio no metadado do documento, e o sincronizador
-- o republicava em sistema_anexos a cada atualização.

do $migration$
declare
  original text;
  corrigida text;
begin
  select pg_get_functiondef(p.oid)
    into original
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private'
     and p.proname = 'sync_produto_estado_relacional'
     and p.prokind = 'f'
     and pg_get_function_identity_arguments(p.oid) = ''
   limit 1;

  if original is null then
    raise exception 'Função private.sync_produto_estado_relacional não encontrada';
  end if;

  corrigida := replace(
    original,
    $old$pp.project_document,$old$,
    $new$pp.project_document - 'dataUrl',$new$
  );

  if position($needle$pp.project_document,$needle$ in original) > 0
     and position($needle$pp.project_document,$needle$ in corrigida) > 0 then
    raise exception 'Não foi possível remover dataUrl dos metadados de documentos';
  end if;

  execute corrigida;

  -- Limpa a projeção já materializada sem alterar os arquivos físicos.
  update public.sistema_anexos
     set metadata = coalesce(metadata, '{}'::jsonb) - 'dataUrl',
         updated_at = now()
   where origem_tabela = 'produto_paredes_documento'
     and coalesce(metadata, '{}'::jsonb) ? 'dataUrl';

  update public.produto_paredes
     set project_document = coalesce(project_document, '{}'::jsonb) - 'dataUrl',
         raw = case
           when jsonb_typeof(raw -> 'projectDocument') = 'object'
             then jsonb_set(raw, '{projectDocument}', (raw -> 'projectDocument') - 'dataUrl', true)
           else raw
         end
   where coalesce(project_document, '{}'::jsonb) ? 'dataUrl'
      or jsonb_typeof(raw -> 'projectDocument') = 'object'
         and (raw -> 'projectDocument') ? 'dataUrl';

  -- Limpa o estado canônico para que a próxima sincronização não reintroduza
  -- a chave no raw relacional.
  update public.auditoria_produto_estado e
     set configuracao = jsonb_set(
       coalesce(e.configuracao, '{}'::jsonb),
       '{projects}',
       (
         select coalesce(
           jsonb_agg(
             case
               when jsonb_typeof(projeto_item.projeto -> 'walls') = 'array' then
                 jsonb_set(
                   projeto_item.projeto,
                   '{walls}',
                   coalesce(
                     (
                       select jsonb_agg(
                         case
                           when jsonb_typeof(parede_item.parede -> 'projectDocument') = 'object' then
                             jsonb_set(
                               parede_item.parede,
                               '{projectDocument}',
                               (parede_item.parede -> 'projectDocument') - 'dataUrl',
                               true
                             )
                           else parede_item.parede
                         end
                         order by parede_item.ordem
                       )
                       from jsonb_array_elements(projeto_item.projeto -> 'walls')
                         with ordinality as parede_item(parede, ordem)
                     ),
                     '[]'::jsonb
                   ),
                   true
                 )
               else projeto_item.projeto
             end
             order by projeto_item.ordem
           ),
           '[]'::jsonb
         )
         from jsonb_array_elements(coalesce(e.configuracao -> 'projects', '[]'::jsonb))
           with ordinality as projeto_item(projeto, ordem)
       ),
       true
     ),
         updated_at = now()
   where e.id = 'global'
     and exists (
       select 1
         from jsonb_array_elements(coalesce(e.configuracao -> 'projects', '[]'::jsonb)) projeto_item(projeto)
        where jsonb_typeof(projeto_item.projeto -> 'walls') = 'array'
          and exists (
            select 1
              from jsonb_array_elements(projeto_item.projeto -> 'walls') parede_item(parede)
             where jsonb_typeof(parede_item.parede -> 'projectDocument') = 'object'
               and (parede_item.parede -> 'projectDocument') ? 'dataUrl'
          )
     );

  update public.auditoria_produto_estado e
     set registros = (
       select coalesce(
         jsonb_agg(
           case
             when jsonb_typeof(registro_item.registro -> 'projectDocument') = 'object' then
               jsonb_set(
                 registro_item.registro,
                 '{projectDocument}',
                 (registro_item.registro -> 'projectDocument') - 'dataUrl',
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
        where jsonb_typeof(registro_item.registro -> 'projectDocument') = 'object'
          and (registro_item.registro -> 'projectDocument') ? 'dataUrl'
     );
end;
$migration$;
