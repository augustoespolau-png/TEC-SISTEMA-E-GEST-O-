import { createBrowserClient } from "@supabase/ssr";
import { invalidateClientRequestCache } from "@/lib/clientCache";

function criarBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let browserClient: ReturnType<typeof criarBrowserClient> | null = null;

function getBrowserClient() {
  if (browserClient) return browserClient;

  /* Um único cliente por bundle evita recriar o GoTrue client e seus listeners
   * de sessão a cada montagem de aba ou componente. A criação é tardia para
   * não exigir as variáveis públicas durante o prerender de /login. */
  browserClient = criarBrowserClient();

  /* Os dados cacheados respeitam a sessão atual. Em um logout/login sem
   * recarregar a página, nenhum resultado do usuário anterior pode reaparecer. */
  browserClient.auth.onAuthStateChange((evento) => {
    if (
      evento === "SIGNED_IN" ||
      evento === "SIGNED_OUT" ||
      evento === "USER_UPDATED"
    ) {
      invalidateClientRequestCache();
    }
  });

  return browserClient;
}

export function createClient() {
  return getBrowserClient();
}
