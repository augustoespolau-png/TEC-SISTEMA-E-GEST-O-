import { createClient } from "@/lib/supabase/client";
import { invalidateClientRequestCache } from "@/lib/clientCache";

const MUTACOES_QUENTES = new Set([
  "MARCAR_PAREDE_OK",
  "ALTERAR_DATA_PAREDE",
  "REGISTRAR_DESVIO",
  "ADICIONAR_NAS",
  "ADICIONAR_ANEXO",
  "ATUALIZAR_DESVIO",
  "REMOVER_DESVIO",
  "ZERAR_INSPECAO_PAREDE",
]);

async function executarRpc(
  funcao: string,
  operacao: string,
  dados: Record<string, unknown>
) {
  return await createClient().rpc(funcao, {
    p_operacao: operacao,
    p_dados: dados,
  });
}

type RespostaRpc = Awaited<ReturnType<typeof executarRpc>>;

/* Segunda barreira contra duplo clique/retry do navegador: se o mesmo RPC
   ainda está em voo, todos os chamadores compartilham a mesma Promise. */
const mutacoesEmAndamento = new Map<string, Promise<RespostaRpc>>();

function chaveDaMutacao(
  funcao: string,
  operacao: string,
  dados: Record<string, unknown>
) {
  return `${funcao}:${operacao}:${JSON.stringify(dados)}`;
}

function invalidarDepoisDaMutacao(operacao: string) {
  const alteraCatalogos =
    operacao.startsWith("ALTERAR_REGRA_") || operacao.startsWith("CONFIG_");
  invalidateClientRequestCache(undefined, {
    preservarEstaticos: !alteraCatalogos,
  });
}

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

  const chave = chaveDaMutacao(funcao, operacao, dados);
  const existente = mutacoesEmAndamento.get(chave);
  if (existente) return existente;

  const promise = executarRpc(funcao, operacao, dados)
    .then((resposta) => {
      if (!resposta.error) invalidarDepoisDaMutacao(operacao);
      return resposta;
    })
    .finally(() => {
      mutacoesEmAndamento.delete(chave);
    });

  mutacoesEmAndamento.set(chave, promise);
  return promise;
}

/** Foto de correção: o RPC dedicado grava no estado canônico e deixa os
 * sincronizadores existentes materializarem produto_anexos/sistema_anexos. */
export async function adicionarAnexoRetrabalho(
  dados: Record<string, unknown>
) {
  const resposta = await createClient().rpc("qualidade_adicionar_anexo_retrabalho", {
    p_dados: dados,
  });
  if (!resposta.error) {
    invalidateClientRequestCache(undefined, { preservarEstaticos: true });
  }
  return resposta;
}

/** Atualiza o documento técnico de uma parede no estado canônico. */
export async function salvarProjetoParedeAnexo(
  dados: Record<string, unknown>
) {
  const resposta = await createClient().rpc("qualidade_salvar_projeto_parede_anexo", {
    p_dados: dados,
  });
  if (!resposta.error) {
    invalidateClientRequestCache(undefined, { preservarEstaticos: true });
  }
  return resposta;
}
