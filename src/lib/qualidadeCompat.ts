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
  const funcao = operacao.startsWith("ALTERAR_REGRA_")
    ? "qualidade_compat_regra"
    : operacao.startsWith("CONFIG_")
      ? "qualidade_compat_configuracao"
    : "qualidade_compat_mutacao";

  return createClient().rpc(funcao, {
    p_operacao: operacao,
    p_dados: dados,
  });
}

/** Foto de correção: o RPC dedicado grava no estado canônico e deixa os
 * sincronizadores existentes materializarem produto_anexos/sistema_anexos. */
export async function adicionarAnexoRetrabalho(
  dados: Record<string, unknown>
) {
  return createClient().rpc("qualidade_adicionar_anexo_retrabalho", {
    p_dados: dados,
  });
}

/** Atualiza o documento técnico de uma parede no estado canônico. */
export async function salvarProjetoParedeAnexo(
  dados: Record<string, unknown>
) {
  return createClient().rpc("qualidade_salvar_projeto_parede_anexo", {
    p_dados: dados,
  });
}
