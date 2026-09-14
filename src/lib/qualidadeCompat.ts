import { createClient } from "@/lib/supabase/client";
import { invalidateClientRequestCache } from "@/lib/clientCache";

const MUTACOES_QUENTES = new Set([
  "MARCAR_PAREDE_OK",
  "ALTERAR_DATA_PAREDE",
  "REGISTRAR_DESVIO",
  "ADICIONAR_NAS",
  "ADICIONAR_ANEXO",
]);

/**
 * Escritas da aplicação nova sobre a base de Auditoria de Produto legada.
 *
 * As views de compatibilidade são somente leitura por desenho. Toda
 * alteração passa por uma função RPC do banco, que valida o papel do
 * usuário e atualiza o estado legado de forma atômica. As ações mais comuns
 * usam o fast-path incremental: apenas a parede alterada é reprojetada nas
 * tabelas relacionais, evitando reconstruir toda a base a cada clique.
 */
export async function mutarQualidade(
  operacao: string,
  dados: Record<string, unknown>
) {
  const funcao = operacao.startsWith("ALTERAR_REGRA_")
    ? "qualidade_compat_regra"
    : operacao.startsWith("CONFIG_")
      ? "qualidade_compat_configuracao"
      : MUTACOES_QUENTES.has(operacao)
        ? "qualidade_compat_mutacao_fast"
        : "qualidade_compat_mutacao";

  const resposta = await createClient().rpc(funcao, {
    p_operacao: operacao,
    p_dados: dados,
  });
  if (!resposta.error) invalidateClientRequestCache();
  return resposta;
}

/** Foto de correção: o RPC dedicado grava no estado canônico e deixa os
 * sincronizadores existentes materializarem produto_anexos/sistema_anexos. */
export async function adicionarAnexoRetrabalho(
  dados: Record<string, unknown>
) {
  const resposta = await createClient().rpc("qualidade_adicionar_anexo_retrabalho", {
    p_dados: dados,
  });
  if (!resposta.error) invalidateClientRequestCache();
  return resposta;
}

/** Atualiza o documento técnico de uma parede no estado canônico. */
export async function salvarProjetoParedeAnexo(
  dados: Record<string, unknown>
) {
  const resposta = await createClient().rpc("qualidade_salvar_projeto_parede_anexo", {
    p_dados: dados,
  });
  if (!resposta.error) invalidateClientRequestCache();
  return resposta;
}
