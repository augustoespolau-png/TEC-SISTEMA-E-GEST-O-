import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente administrativo exclusivamente server-side.
 *
 * A chave secreta nunca pode chegar ao bundle do navegador. O nome
 * SUPABASE_SECRET_KEY é o formato atual recomendado pelo Supabase; o
 * service_role legado continua aceito durante a transição.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) {
    throw new Error(
      "Governança de usuários requer SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) no ambiente do servidor."
    );
  }

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
