import {
  assinarAnexosEmLote,
  BUCKET_AUDITORIA,
  DURACAO_URL_ANEXO,
} from "@/lib/anexos";
import { cachedClientRequest } from "@/lib/clientCache";
import { createClient } from "@/lib/supabase/client";
import type { AnexoProjetoParede } from "@/lib/types";

interface AnexoProjetoParedeRow {
  id: string;
  registro_id: string | null;
  nome_arquivo: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
}

/**
 * Lê os documentos técnicos já materializados pela sincronização canônica e
 * cria URLs temporárias para a sessão atual. Configuração e Auditoria usam o
 * mesmo leitor para não divergirem sobre qual anexo pertence à parede.
 */
export async function carregarAnexosProjetoParede(paredeIds: string[]) {
  const ids = [...new Set(paredeIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return {
      data: {} as Record<string, AnexoProjetoParede>,
      error: null,
    };
  }

  const chave = `projetos-parede:${[...ids].sort().join("|")}`;
  return cachedClientRequest(
    chave,
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sistema_anexos")
        .select(
          "id, registro_id, nome_arquivo, mime_type, tamanho_bytes, storage_bucket, storage_path"
        )
        .eq("modulo", "AUDITORIA DE PRODUTO")
        .eq("entidade", "produto_paredes")
        .eq("tipo", "projeto")
        .eq("origem_tabela", "produto_paredes_documento")
        .in("registro_id", ids)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) {
        return { data: {} as Record<string, AnexoProjetoParede>, error };
      }

      const selecionados: AnexoProjetoParedeRow[] = [];
      const registrosConhecidos = new Set<string>();
      for (const row of (data ?? []) as AnexoProjetoParedeRow[]) {
        if (
          !row.registro_id ||
          registrosConhecidos.has(row.registro_id) ||
          !row.storage_path
        ) {
          continue;
        }
        registrosConhecidos.add(row.registro_id);
        selecionados.push(row);
      }

      const urls = await assinarAnexosEmLote(
        supabase,
        selecionados.map((row) => ({
          bucket: row.storage_bucket || BUCKET_AUDITORIA,
          path: row.storage_path as string,
        })),
        DURACAO_URL_ANEXO
      );
      const resultado: Record<string, AnexoProjetoParede> = {};
      for (const row of selecionados) {
        if (!row.registro_id || !row.storage_path) continue;
        const bucket = row.storage_bucket || BUCKET_AUDITORIA;
        resultado[row.registro_id] = {
          id: String(row.id),
          nome_arquivo: row.nome_arquivo || "Projeto da parede",
          mime_type: row.mime_type,
          tamanho_bytes: row.tamanho_bytes,
          storage_bucket: bucket,
          storage_path: row.storage_path,
          url: urls.get(bucket)?.get(row.storage_path) ?? null,
        };
      }

      return { data: resultado, error: null };
    },
    5 * 60_000
  );
}
