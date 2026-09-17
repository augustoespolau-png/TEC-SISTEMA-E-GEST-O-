import { cache } from "react";
import {
  normalizarPermissoes,
  roleFromStored,
  statusFromStored,
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
    status: unknown;
    suspenso_ate?: string | null;
  } | null = null;

  // O projeto atual mantém perfis_acesso como tabela canônica. A view
  // profiles continua sendo consultada abaixo para instalações antigas.
  const canonicalProfile = await supabase
    .from("perfis_acesso")
    .select("email, full_name, role, status, suspended_until")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!canonicalProfile.error && canonicalProfile.data) {
    profile = {
      nome:
        canonicalProfile.data.full_name ??
        canonicalProfile.data.email ??
        user.email ??
        "",
      role: canonicalProfile.data.role,
      status: canonicalProfile.data.status,
      suspenso_ate: canonicalProfile.data.suspended_until ?? null,
    };
  } else {
    const extendedProfile = await supabase
      .from("profiles")
      .select("nome, role, status, suspenso_ate")
      .eq("id", user.id)
      .maybeSingle();

    if (!extendedProfile.error && extendedProfile.data) {
      profile = {
        nome: extendedProfile.data.nome,
        role: extendedProfile.data.role,
        status: extendedProfile.data.status,
        suspenso_ate: extendedProfile.data.suspenso_ate ?? null,
      };
    } else {
      // Compatibilidade durante a janela entre o deploy da aplicação e a
      // aplicação das migrations de governança no projeto Supabase.
      const legacyProfile = await supabase
        .from("profiles")
        .select("nome, role")
        .eq("id", user.id)
        .maybeSingle();
      profile = legacyProfile.data
        ? {
            ...legacyProfile.data,
            status: "active",
            suspenso_ate: null,
          }
        : null;
    }
  }

  const role = roleFromStored(profile?.role);
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
          status: statusFromStored(profile.status),
          suspenso_ate: profile.suspenso_ate ?? null,
        }
      : null,
    permissions: normalizarPermissoes(role, permissionRows),
  };
});
