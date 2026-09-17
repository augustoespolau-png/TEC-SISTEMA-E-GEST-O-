import { cache } from "react";
import {
  isRole,
  normalizarPermissoes,
  type GovernancePermission,
} from "@/lib/governanca-types";
import { createClient } from "@/lib/supabase/server";

export function isAccountInactive(profile: {
  status?: "active" | "blocked" | "suspended";
  suspenso_ate?: string | null;
} | null) {
  return Boolean(
    profile?.status === "blocked" ||
      (profile?.status === "suspended" &&
        (!profile.suspenso_ate ||
          new Date(profile.suspenso_ate).getTime() > Date.now())),
  );
}

/*
 * O layout e a página filha precisam do mesmo usuário/perfil durante a
 * renderização de uma rota. React.cache deduplica essa leitura por request,
 * evitando duas chamadas a auth.getUser() e duas consultas a profiles na
 * entrada inicial do aplicativo.
 */
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let profile: {
    nome: string | null;
    role: unknown;
    status?: unknown;
    suspenso_ate?: string | null;
  } | null = null;

  const extendedProfile = await supabase
    .from("profiles")
    .select("nome, role, status, suspenso_ate")
    .eq("id", user.id)
    .maybeSingle();

  if (!extendedProfile.error) {
    profile = extendedProfile.data;
  } else {
    // Compatibilidade durante a janela entre o deploy da aplicação e a
    // aplicação da migration 050 no projeto Supabase.
    const legacyProfile = await supabase
      .from("profiles")
      .select("nome, role")
      .eq("id", user.id)
      .maybeSingle();
    profile = legacyProfile.data
      ? { ...legacyProfile.data, status: "active", suspenso_ate: null }
      : null;
  }

  const role = isRole(profile?.role) ? profile.role : "consultor";
  let permissionRows: GovernancePermission[] = [];
  if (profile) {
    const permissions = await supabase
      .from("governanca_permissoes_modulo")
      .select("modulo, pode_visualizar, pode_editar, pode_gerenciar")
      .eq("usuario_id", user.id);
    if (!permissions.error) {
      permissionRows = permissions.data as GovernancePermission[];
    }
  }

  return {
    user,
    profile: profile
      ? {
          id: user.id,
          nome: profile.nome ?? "",
          role,
          status: (profile.status === "blocked" || profile.status === "suspended"
            ? profile.status
            : "active") as "active" | "blocked" | "suspended",
          suspenso_ate: profile.suspenso_ate ?? null,
        }
      : null,
    permissions: normalizarPermissoes(role, permissionRows),
  };
});
