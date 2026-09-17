-- Remove a redundant category-only index kept by the first residue migration.
-- The composite index below already supports category filtering and date ordering.
drop index if exists public.residuos_trocas_categoria_idx;

notify pgrst, 'reload schema';
