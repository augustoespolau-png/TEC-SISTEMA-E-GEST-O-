import { createClient } from "@/lib/supabase/client";

/**
 * Escritas da aplicação nova sobre a base de Auditoria de Produto legada.
 *
 * As views de compatibilidade são somente leitura por desenho. Toda
 * alteração passa por uma função RPC do banco, que valida o papel do
 * usuário e atualiza o estado legado de forma atômica.
 */
export async function mutarQualidade(
  operacao: string,
  dados: Record<string, unknown>
) {
  return createClient().rpc("qualidade_compat_mutacao", {
    p_operacao: operacao,
    p_dados: dados,
  });
}
