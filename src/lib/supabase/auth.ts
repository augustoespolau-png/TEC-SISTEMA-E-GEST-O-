import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { PerfilAcesso } from "@/lib/permissoes";

/*
 * O layout e a página filha precisam do mesmo usuário/perfil durante a
 * renderização de uma rota. React.cache deduplica essa leitura por request,
 * evitando chamadas repetidas na entrada inicial do aplicativo.
 */
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: accessProfile }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nome, role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("perfis_acesso")
      .select("role, status, permissions, suspended_until")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return {
    user,
    profile,
    accessProfile: (accessProfile ?? null) as PerfilAcesso | null,
  };
});
