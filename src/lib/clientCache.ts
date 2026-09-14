/*
 * Cache pequeno, em memória, para leituras client-side.
 *
 * Ele guarda a Promise inteira, então duas telas montadas no mesmo ciclo
 * compartilham a mesma viagem ao Supabase. O TTL curto continua sendo o
 * padrão para dados vivos; listas estáticas podem optar por TTL maior com
 * uma chave iniciada por `static:`.
 */
interface EntradaCache {
  expiraEm: number;
  promise: Promise<unknown>;
}

interface OpcoesInvalidacao {
  /** Mantém projetos, paredes, setores, tipos de erro e outras listas estáticas. */
  preservarEstaticos?: boolean;
}

const entradas = new Map<string, EntradaCache>();
const TTL_PADRAO = 30_000;

export function cachedClientRequest<T>(
  chave: string,
  carregar: () => Promise<T>,
  ttl = TTL_PADRAO
): Promise<T> {
  const agora = Date.now();
  const atual = entradas.get(chave);
  if (atual && atual.expiraEm > agora) {
    return atual.promise as Promise<T>;
  }

  const promise = Promise.resolve().then(carregar);
  entradas.set(chave, { expiraEm: agora + ttl, promise });
  void promise.catch(() => {
    if (entradas.get(chave)?.promise === promise) entradas.delete(chave);
  });
  return promise;
}

/**
 * Invalida leituras depois de uma escrita.
 *
 * Mutações operacionais (desvio, N/A, parede OK...) não mudam catálogos de
 * projeto/configuração. Nesses casos o chamador preserva `static:*` e evita
 * baixar novamente as mesmas listas em toda troca de tela.
 */
export function invalidateClientRequestCache(
  prefix?: string,
  opcoes: OpcoesInvalidacao = {}
) {
  if (!prefix) {
    for (const chave of entradas.keys()) {
      if (opcoes.preservarEstaticos && chave.startsWith("static:")) continue;
      entradas.delete(chave);
    }
    return;
  }

  for (const chave of entradas.keys()) {
    if (chave.startsWith(prefix)) entradas.delete(chave);
  }
}
