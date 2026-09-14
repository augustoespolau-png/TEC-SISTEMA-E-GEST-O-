-- Zero-Latency: garante cobertura de FKs sem criar índices duplicados
DO $$
DECLARE
  r record;
  v_index_name text;
BEGIN
  FOR r IN
    WITH fk AS (
      SELECT
        con.oid,
        con.conrelid,
        con.conkey,
        n.nspname,
        c.relname,
        con.conname,
        string_agg(format('%I', a.attname), ', ' ORDER BY u.ord) AS cols_sql
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY u(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
      GROUP BY con.oid, con.conrelid, con.conkey, n.nspname, c.relname, con.conname
    )
    SELECT *
    FROM fk f
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_index i
      WHERE i.indrelid = f.conrelid
        AND i.indisvalid
        AND i.indisready
        AND (
          SELECT array_agg(k.attnum::smallint ORDER BY k.ord)
          FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum, ord)
          WHERE k.ord <= cardinality(f.conkey)
        ) = f.conkey
    )
  LOOP
    v_index_name := left(format('%s_%s_perf_idx', r.relname, r.conname), 63);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
      v_index_name,
      r.nspname,
      r.relname,
      r.cols_sql
    );
  END LOOP;
END
$$;

-- Auditoria/indicadores: filtros quentes usados pelas views e RPCs.
CREATE INDEX IF NOT EXISTS produto_auditorias_casa_idx
  ON public.produto_auditorias (casa);
CREATE INDEX IF NOT EXISTS produto_auditorias_projeto_nome_casa_parede_idx
  ON public.produto_auditorias (projeto_nome, casa, parede_nome);
CREATE INDEX IF NOT EXISTS produto_auditorias_parede_nome_data_idx
  ON public.produto_auditorias (parede_nome, data_inspecao DESC)
  WHERE data_inspecao IS NOT NULL;
CREATE INDEX IF NOT EXISTS produto_desvios_auditoria_status_data_idx
  ON public.produto_desvios (auditoria_id, status, data_inspecao DESC);
CREATE INDEX IF NOT EXISTS produto_anexos_auditoria_tipo_desvio_idx
  ON public.produto_anexos (auditoria_id, tipo, desvio_id)
  WHERE auditoria_id IS NOT NULL;

-- Casas/obra/listagens.
CREATE INDEX IF NOT EXISTS qualidade_casas_casa_idx
  ON public.qualidade_casas (casa);
CREATE INDEX IF NOT EXISTS qualidade_casas_obra_idx
  ON public.qualidade_casas (obra)
  WHERE obra IS NOT NULL;
CREATE INDEX IF NOT EXISTS qualidade_casas_created_at_idx
  ON public.qualidade_casas (created_at DESC);

-- Logs/anexos: ordenações por tempo e telas de histórico.
CREATE INDEX IF NOT EXISTS sistema_auditoria_log_created_at_idx
  ON public.sistema_auditoria_log (created_at DESC);
CREATE INDEX IF NOT EXISTS sistema_anexos_created_at_active_idx
  ON public.sistema_anexos (created_at DESC)
  WHERE deleted_at IS NULL;

ANALYZE public.produto_auditorias;
ANALYZE public.produto_desvios;
ANALYZE public.produto_anexos;
ANALYZE public.qualidade_casas;
