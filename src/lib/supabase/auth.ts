import { cache } from "react";
import { accessFromRow } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

/*
 * O layout e a página filha precisam do mesmo usuário/perfil durante a
 * renderização de uma rota. React.cache deduplica a leitura por request.
 * O perfil RBAC é carregado no mesmo contexto para navegação, rotas e ações
 * usarem exatamente a mesma regra que a RLS do Supabase.
 */
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: accessRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("nome, role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("perfis_acesso")
      .select("access_mode,status,app_role,permissions,suspended_until")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const fallbackRole =
    profile?.role === "gestao" ||
    profile?.role === "operador" ||
    profile?.role === "consultor"
      ? (profile.role as Role)
      : "consultor";
  const access = accessFromRow(accessRow, fallbackRole);

  return { user, profile, access, role: access.appRole };
});
