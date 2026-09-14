/*
 * Cache pequeno, em memória, para leituras client-side.
 *
 * Ele guarda a Promise inteira, então duas telas montadas no mesmo ciclo
 * compartilham a mesma viagem ao Supabase. O TTL curto evita transformar a
 * navegação em uma cópia permanente dos dados; qualquer mutação bem-sucedida
 * limpa o cache inteiro em qualidadeCompat.ts.
 */
interface EntradaCache {
  expiraEm: number;
  promise: Promise<unknown>;
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

/** Invalida leituras depois de qualquer escrita autorizada pela aplicação. */
export function invalidateClientRequestCache(prefix?: string) {
  if (!prefix) {
    entradas.clear();
    return;
  }

  for (const chave of entradas.keys()) {
    if (chave.startsWith(prefix)) entradas.delete(chave);
  }
}
