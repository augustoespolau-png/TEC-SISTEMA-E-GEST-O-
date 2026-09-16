import { createClient } from "@/lib/supabase/client";
import { invalidateClientRequestCache } from "@/lib/clientCache";

/**
 * Mutações operacionais que nunca devem voltar ao snapshot JSON monolítico.
 * O RPC fast opera diretamente nas tabelas relacionais e mantém o caminho
 * crítico limitado às linhas realmente afetadas.
 */
const MUTACOES_DIRETAS = new Set([
  "ABRIR_AUDITORIA",
  "MARCAR_PAREDE_OK",
  "ALTERAR_DATA_PAREDE",
  "REGISTRAR_DESVIO",
  "ADICIONAR_NAS",
  "ADICIONAR_NA",
  "REMOVER_NA",
  "ADICIONAR_ANEXO",
  "ATUALIZAR_DESVIO",
  "REMOVER_DESVIO",
  "ZERAR_INSPECAO_PAREDE",
  "EXCLUIR_AUDITORIA",
]);

function payloadMinimo(dados: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(dados).filter(([, valor]) => valor !== undefined)
  );
}

async function executarRpc(
  funcao: string,
  operacao: string,
  dados: Record<string, unknown>
) {
  return await createClient().rpc(funcao, {
    p_operacao: operacao,
    p_dados: payloadMinimo(dados),
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
  return `${funcao}:${operacao}:${JSON.stringify(payloadMinimo(dados))}`;
}

function invalidarDepoisDaMutacao(operacao: string) {
  const alteraCatalogos =
    operacao.startsWith("ALTERAR_REGRA_") || operacao.startsWith("CONFIG_");
  invalidateClientRequestCache(undefined, {
    preservarEstaticos: !alteraCatalogos,
  });
}

/**
 * Escritas operacionais usam RPC relacional de baixa latência. A UI já
 * aplica o estado otimista antes da resposta de rede; esta camada apenas
 * confirma a mutação e invalida o cache local específico depois do commit.
 * Não existe router.refresh/revalidatePath no caminho quente.
 */
export async function mutarQualidade(
  operacao: string,
  dados: Record<string, unknown>
) {
  const funcao = operacao.startsWith("ALTERAR_REGRA_")
    ? "qualidade_compat_regra"
    : operacao.startsWith("CONFIG_")
      ? "qualidade_compat_configuracao"
      : MUTACOES_DIRETAS.has(operacao)
        ? "qualidade_compat_mutacao_fast"
        : "qualidade_compat_mutacao";

  const dadosMinimos = payloadMinimo(dados);
  const chave = chaveDaMutacao(funcao, operacao, dadosMinimos);
  const existente = mutacoesEmAndamento.get(chave);
  if (existente) return existente;

  const inicio = typeof performance !== "undefined" ? performance.now() : 0;
  const promise = executarRpc(funcao, operacao, dadosMinimos)
    .then((resposta) => {
      if (!resposta.error) invalidarDepoisDaMutacao(operacao);

      if (inicio > 0 && typeof performance !== "undefined") {
        const duracao = performance.now() - inicio;
        performance.measure(`qualidade:${operacao}`, {
          start: inicio,
          duration: duracao,
        });
        if (duracao > 1000) {
          console.warn(
            `[Zero-Latency] ${operacao} respondeu em ${duracao.toFixed(0)} ms`,
          );
        }
      }

      return resposta;
    })
    .finally(() => {
      mutacoesEmAndamento.delete(chave);
    });

  mutacoesEmAndamento.set(chave, promise);
  return promise;
}

/** Foto de correção: upload binário ocorre fora do RPC; aqui trafega apenas
 * o metadado mínimo que vincula o arquivo já salvo ao desvio. */
export async function adicionarAnexoRetrabalho(
  dados: Record<string, unknown>
) {
  const resposta = await createClient().rpc("qualidade_adicionar_anexo_retrabalho", {
    p_dados: payloadMinimo(dados),
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
    p_dados: payloadMinimo(dados),
  });
  if (!resposta.error) {
    invalidateClientRequestCache(undefined, { preservarEstaticos: true });
  }
  return resposta;
}
