from pathlib import Path
import re

root = Path('.')

def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Anchor not found: {label}')
    return text.replace(old, new, 1)

# ---------------------------------------------------------------------
# AuditoriaCasa: signed URL + confirmed link + immediate local attachment
# ---------------------------------------------------------------------
p = root / 'src/components/auditoria/AuditoriaCasa.tsx'
s = p.read_text()

s = must_replace(s,
'''      return {
        error: new Error("Sua sessão expirou. Entre novamente para anexar a foto."),
        caminho: null,
        anexo: null,
      };''',
'''      return {
        error: new Error("Sua sessão expirou. Entre novamente para anexar a foto."),
        caminho: null,
        url: null,
        anexo: null,
      };''',
'session error return')

s = must_replace(s,
'''      return {
        error: null,
        caminho,
        anexo: {
          id: anexoId,
          name: arquivoOtimizado.name,
          type: "image/jpeg",
          size: arquivoOtimizado.size,
          path: caminho,
          wallId: paredeId,
        },
      };''',
'''      const assinatura = await supabase.storage
        .from(BUCKET_AUDITORIA)
        .createSignedUrl(caminho, 60 * 60);
      return {
        error: null,
        caminho,
        url: assinatura.data?.signedUrl ?? null,
        anexo: {
          id: anexoId,
          name: arquivoOtimizado.name,
          type: "image/jpeg",
          size: arquivoOtimizado.size,
          path: caminho,
          wallId: paredeId,
        },
      };''',
'success photo preparation')

s = must_replace(s,
'''      return {
        error:
          caught instanceof Error
            ? caught
            : new Error("Não foi possível enviar a foto."),
        caminho: null,
        anexo: null,
      };''',
'''      return {
        error:
          caught instanceof Error
            ? caught
            : new Error("Não foi possível enviar a foto."),
        caminho: null,
        url: null,
        anexo: null,
      };''',
'catch photo preparation')

s = must_replace(s,
'''    if (error) {
      await supabase.storage.from(BUCKET_AUDITORIA).remove([preparada.caminho]);
      return { error };
    }
    return { error: null };''',
'''    if (error) return { error };
    return { error: null };''',
'do not delete before retry')

old_block = '''        /* O arquivo já chegou ao Storage: libera o feedback visual agora.
           O vínculo final usa um RPC específico e continua em background. */
        marcarFoto(undefined);
        void (async () => {
          const vinculo = await vincularFotoAoDesvio(
            supabase,
            auditoriaAtual,
            parede,
            id,
            preparada
          );
          if (vinculo.error) {
            marcarFoto("ERRO");
            toast.error(
              "O erro foi salvo, mas a foto não foi vinculada: " +
                vinculo.error.message
            );
            return;
          }
          toast.success("Foto anexada ao desvio.");
        })();'''

new_block = '''        const anexoPreparado = preparada.anexo;
        const caminhoPreparado = preparada.caminho;
        if (!anexoPreparado || !caminhoPreparado) {
          marcarFoto("ERRO");
          toast.error("O erro foi salvo, mas a foto não ficou pronta para vincular.");
          return;
        }

        /* Mantém “Foto enviando…” até o banco confirmar o vínculo. Se a rede
           oscilar, uma segunda tentativa curta evita transformar um upload
           válido em foto órfã. */
        void (async () => {
          let vinculo = await vincularFotoAoDesvio(
            supabase,
            auditoriaAtual,
            parede,
            id,
            preparada
          );
          if (vinculo.error) {
            await new Promise((resolve) => window.setTimeout(resolve, 450));
            vinculo = await vincularFotoAoDesvio(
              supabase,
              auditoriaAtual,
              parede,
              id,
              preparada
            );
          }

          if (vinculo.error) {
            marcarFoto("ERRO");
            await supabase.storage
              .from(BUCKET_AUDITORIA)
              .remove([caminhoPreparado]);
            toast.error(
              "O erro foi salvo, mas a foto não foi vinculada: " +
                vinculo.error.message
            );
            return;
          }

          if (auditoriaIdRef.current === auditoriaId) {
            const anexoLocal: AnexoDaAuditoria = {
              id: anexoPreparado.id,
              nome_arquivo: anexoPreparado.name,
              mime_type: anexoPreparado.type,
              tamanho_bytes: anexoPreparado.size,
              storage_bucket: BUCKET_AUDITORIA,
              storage_path: caminhoPreparado,
              url: preparada.url,
            };
            const atualizados = errosRef.current.map((item) =>
              item.id === id || item.id === idOtimista
                ? {
                    ...item,
                    fotoStatus: undefined,
                    anexos: [
                      ...(item.anexos ?? []).filter(
                        (existente) => existente.id !== anexoLocal.id
                      ),
                      anexoLocal,
                    ],
                  }
                : item
            );
            errosRef.current = atualizados;
            setErros(atualizados);
          } else {
            marcarFoto(undefined);
          }
          toast.success("Foto anexada ao desvio.");
        })();'''

s = must_replace(s, old_block, new_block, 'background link block')
p.write_text(s)

# ---------------------------------------------------------------------
# PainelParede: professional full-width attachment card, not tiny thumbnail
# ---------------------------------------------------------------------
p = root / 'src/components/auditoria/PainelParede.tsx'
s = p.read_text()
old = '''                        <img
                          src={anexo.url}
                          alt={`Foto anexada ao desvio ${e.tipo_erro}`}
                        />
                      </a>'''
new = '''                        <img
                          src={anexo.url}
                          alt={`Foto anexada ao desvio ${e.tipo_erro}`}
                        />
                        <span className="anexo-miniatura-info">
                          <b>Foto do desvio</b>
                          <small>{anexo.nome_arquivo ?? "Imagem anexada"}</small>
                          <span>Abrir imagem ↗</span>
                        </span>
                      </a>'''
s = must_replace(s, old, new, 'attachment card markup')
p.write_text(s)

# ---------------------------------------------------------------------
# CSS: replace 58x46 tiny thumb by readable single attachment card
# ---------------------------------------------------------------------
p = root / 'src/app/globals.css'
s = p.read_text()
pattern = re.compile(r'''\.anexos-erro \{\n\s*display: flex;\n\s*flex-wrap: wrap;\n\s*gap: 7px;\n\s*margin-top: 9px;\n\}\n\.anexo-miniatura \{\n\s*display: block;\n\s*width: 58px;\n\s*height: 46px;\n\s*overflow: hidden;\n\s*border: 1px solid var\(--color-line-2\);\n\s*border-radius: 6px;\n\s*background: var\(--color-papel-2\);\n\s*transition: border-color 130ms, transform 80ms;\n\}\n\.anexo-miniatura:hover \{\n\s*border-color: var\(--color-brand\);\n\s*transform: translateY\(-1px\);\n\}\n\.anexo-miniatura img \{\n\s*display: block;\n\s*width: 100%;\n\s*height: 100%;\n\s*object-fit: cover;\n\}''')
replacement = '''.anexos-erro {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}
.anexo-miniatura {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 88px;
  align-items: center;
  gap: 10px;
  padding: 7px;
  overflow: hidden;
  border: 1px solid var(--color-line-2);
  border-radius: 8px;
  background: var(--color-papel-2);
  text-decoration: none;
  transition: border-color 130ms, transform 80ms;
}
.anexo-miniatura:hover {
  border-color: var(--color-brand);
  transform: translateY(-1px);
}
.anexo-miniatura img {
  display: block;
  width: 104px;
  height: 76px;
  flex: 0 0 auto;
  border-radius: 6px;
  object-fit: cover;
}
.anexo-miniatura-info {
  display: grid;
  min-width: 0;
  gap: 2px;
  text-align: left;
}
.anexo-miniatura-info b {
  color: var(--color-ink);
  font-size: 12.5px;
  font-weight: 600;
}
.anexo-miniatura-info small {
  overflow: hidden;
  color: var(--color-ink-3);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.anexo-miniatura-info > span {
  margin-top: 3px;
  color: var(--color-brand);
  font-size: 11.5px;
  font-weight: 600;
}'''
s2, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit(f'CSS attachment block replacements: {count}')
p.write_text(s2)

# ---------------------------------------------------------------------
# Migration 043: optimized exact-record attachment link.
# No generated/test IDs or data repair in migration.
# ---------------------------------------------------------------------
migration = root / 'supabase/migrations/043_optimize_fast_attachment_link_single_wall.sql'
if migration.exists():
    raise SystemExit('Migration 043 already exists')
migration.write_text(r'''-- Vincula a foto ao desvio sem reconstruir o array global inteiro.
-- 042 percorria todos os registros e concatenava JSONB N vezes; em produção
-- isso chegou a ~6,8 s por foto. Aqui localizamos a posição exata com
-- WITH ORDINALITY e fazemos um único jsonb_set no elemento da parede.
create or replace function public.qualidade_adicionar_anexo_fast(
  p_auditoria_id text,
  p_parede text,
  p_desvio_id text,
  p_anexo jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_catalog', 'pg_temp'
set statement_timeout to '5s'
as $function$
declare
  v_registros jsonb;
  v_rec jsonb;
  v_anexos jsonb;
  v_idx bigint;
  projeto_id text;
  casa text;
  ator text;
  agora text;
  anexo_id text;
  storage_path text;
  auditoria_rel_id text;
  parede_id text;
begin
  if auth.uid() is null or not public.tecverde_can('AUDITORIA', 'editar') then
    raise exception 'Sem permissão para alterar a auditoria' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_auditoria_id,'')), '') is null
     or nullif(trim(coalesce(p_parede,'')), '') is null
     or nullif(trim(coalesce(p_desvio_id,'')), '') is null
     or coalesce(jsonb_typeof(p_anexo), '') <> 'object' then
    raise exception 'Auditoria, parede, desvio e anexo são obrigatórios';
  end if;

  anexo_id := nullif(p_anexo->>'id','');
  storage_path := nullif(p_anexo->>'path','');
  if anexo_id is null or storage_path is null then
    raise exception 'O anexo precisa ter id e path do Supabase Storage';
  end if;
  if p_anexo ? 'dataUrl' then
    raise exception 'Base64 não é aceito para anexos';
  end if;

  projeto_id := split_part(p_auditoria_id, '|', 1);
  casa := nullif(split_part(p_auditoria_id, '|', 2), '');
  if nullif(projeto_id,'') is null or casa is null then
    raise exception 'Auditoria inválida';
  end if;

  ator := coalesce(nullif(public.tecverde_email_atual(), ''), auth.uid()::text);
  agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  select registros
    into v_registros
    from public.auditoria_produto_estado
   where id = 'global'
   for update;
  if not found then
    raise exception 'Estado legado da auditoria não encontrado';
  end if;

  select e.ordinality, e.value
    into v_idx, v_rec
    from jsonb_array_elements(coalesce(v_registros, '[]'::jsonb)) with ordinality as e(value, ordinality)
   where e.value->>'projectId' = projeto_id
     and e.value->>'house' = casa
     and (e.value->>'wallName' = p_parede or e.value->>'wallId' = p_parede)
     and exists (
       select 1
         from jsonb_array_elements(coalesce(e.value->'deviations','[]'::jsonb)) d(value)
        where d.value->>'id' = p_desvio_id
     )
   limit 1;

  if v_idx is null then
    raise exception 'Desvio não encontrado nessa parede';
  end if;

  parede_id := coalesce(nullif(v_rec->>'wallId',''), p_parede);
  v_anexos := coalesce(v_rec->'attachments','[]'::jsonb);
  if not exists (
    select 1 from jsonb_array_elements(v_anexos) a(value)
     where a.value->>'id' = anexo_id
  ) then
    v_anexos := v_anexos || jsonb_build_array(
      jsonb_build_object(
        'id', anexo_id,
        'name', coalesce(nullif(p_anexo->>'name',''), 'foto-desvio'),
        'type', coalesce(nullif(p_anexo->>'type',''), 'image/jpeg'),
        'size', coalesce(p_anexo->>'size','0'),
        'path', storage_path,
        'deviationId', p_desvio_id,
        'wallId', parede_id
      )
    );
    v_rec := jsonb_set(v_rec, '{attachments}', v_anexos, true);
    v_rec := jsonb_set(v_rec, '{updatedAt}', to_jsonb(agora), true);
    v_registros := jsonb_set(v_registros, array[(v_idx - 1)::text], v_rec, false);
  end if;

  select pd.auditoria_id into auditoria_rel_id
    from public.produto_desvios pd
   where pd.id = p_desvio_id
   limit 1;
  if auditoria_rel_id is null then
    raise exception 'Desvio relacional não encontrado';
  end if;

  perform set_config('tecverde.skip_produto_full_sync','on',true);
  update public.auditoria_produto_estado
     set registros = v_registros, updated_by = ator
   where id = 'global';

  insert into public.produto_anexos(
    id,auditoria_id,desvio_id,parede_id,tipo,nome_arquivo,mime_type,
    tamanho_bytes,storage_bucket,storage_path,raw,synced_at
  ) values (
    anexo_id,auditoria_rel_id,p_desvio_id,parede_id,'desvio',
    coalesce(nullif(p_anexo->>'name',''),'foto-desvio'),
    coalesce(nullif(p_anexo->>'type',''),'image/jpeg'),
    case when coalesce(p_anexo->>'size','') ~ '^[0-9]+$' then (p_anexo->>'size')::bigint else 0 end,
    'auditoria-arquivos',storage_path,p_anexo - 'dataUrl',now()
  )
  on conflict(id) do update set
    auditoria_id=excluded.auditoria_id,
    desvio_id=excluded.desvio_id,
    parede_id=excluded.parede_id,
    tipo=excluded.tipo,
    nome_arquivo=excluded.nome_arquivo,
    mime_type=excluded.mime_type,
    tamanho_bytes=excluded.tamanho_bytes,
    storage_bucket=excluded.storage_bucket,
    storage_path=excluded.storage_path,
    raw=excluded.raw,
    synced_at=now();

  insert into public.sistema_anexos(
    modulo,entidade,registro_id,tipo,nome_arquivo,mime_type,tamanho_bytes,
    storage_bucket,storage_path,metadata,origem_tabela,origem_id,
    created_at,updated_at,deleted_at
  ) values (
    'AUDITORIA DE PRODUTO','produto_desvios',p_desvio_id,'desvio',
    coalesce(nullif(p_anexo->>'name',''),'foto-desvio'),
    coalesce(nullif(p_anexo->>'type',''),'image/jpeg'),
    case when coalesce(p_anexo->>'size','') ~ '^[0-9]+$' then (p_anexo->>'size')::bigint else 0 end,
    'auditoria-arquivos',storage_path,p_anexo - 'dataUrl','produto_anexos',anexo_id,
    now(),now(),null
  )
  on conflict (origem_tabela,origem_id)
    where origem_tabela is not null and origem_id is not null
  do update set
    entidade=excluded.entidade,
    registro_id=excluded.registro_id,
    tipo=excluded.tipo,
    nome_arquivo=excluded.nome_arquivo,
    mime_type=excluded.mime_type,
    tamanho_bytes=excluded.tamanho_bytes,
    storage_bucket=excluded.storage_bucket,
    storage_path=excluded.storage_path,
    metadata=excluded.metadata,
    updated_at=now(),
    deleted_at=null;

  perform set_config('tecverde.skip_produto_full_sync','off',true);
  return jsonb_build_object('ok',true,'id',anexo_id);
exception when others then
  perform set_config('tecverde.skip_produto_full_sync','off',true);
  raise;
end;
$function$;
''')
