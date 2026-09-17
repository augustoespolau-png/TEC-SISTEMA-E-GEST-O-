import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/*
 * Este módulo só deve ser importado por Server Components, Route Handlers ou
 * Server Actions. A chave usada aqui ignora RLS e por isso nunca pode chegar
 * ao bundle do navegador.
 */
export function isAdminConfigured() {
  return Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  );
}
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "A gestão de contas exige SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET_KEY) configurada no servidor.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
