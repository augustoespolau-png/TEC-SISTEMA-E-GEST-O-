import type { User } from "@supabase/supabase-js";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import {
  isGovernanceModule,
  isRole,
  normalizarPermissoes,
  type AccountStatus,
  type GovernancePermission,
  type GovernanceDirectoryUser,
  type GovernanceProject,
  type GovernanceSnapshot,
  type GovernanceTeam,
  type GovernanceUser,
  type ProjectScope,
} from "@/lib/governanca-types";
import type { Role } from "@/lib/types";

export const GOVERNANCE_PAGE_SIZE = 25;

type AdminClient = ReturnType<typeof createAdminClient>;

type ProfileRow = {
  id: string;
  nome: string | null;
  role: unknown;
  status: unknown;
  suspenso_ate: string | null;
  escopo_projetos: unknown;
  created_at: string;
};

type PermissionRow = {
  usuario_id: string;
  modulo: string;
  pode_visualizar: boolean;
  pode_editar: boolean;
  pode_gerenciar: boolean;
};

type ProjectAccessRow = { usuario_id: string; projeto_id: string };
type TeamRow = {
  id: string;
  nome: string;
  descricao: string;
  projeto_id: string | null;
  codigo: string | null;
  ativo: boolean;
  created_at: string;
};
type TeamMemberRow = { equipe_id: string; usuario_id: string };

function statusFromRow(value: unknown): AccountStatus {
  if (value === "blocked" || value === "suspended") return value;
  return "active";
}

function roleFromRow(value: unknown): Role {
  return isRole(value) ? value : "consultor";
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Não foi possível carregar a governança de acessos.";
}

function profileFallback(user: User): ProfileRow {
  return {
    id: user.id,
    nome: user.user_metadata?.nome ?? user.email ?? "",
    role: "consultor",
    status: "active",
    suspenso_ate: null,
    escopo_projetos: "all",
    created_at: user.created_at,
  };
}

function toPermission(row: PermissionRow): GovernancePermission | null {
  if (!isGovernanceModule(row.modulo)) return null;
  return {
    modulo: row.modulo,
    pode_visualizar: Boolean(row.pode_visualizar),
    pode_editar: Boolean(row.pode_editar),
    pode_gerenciar: Boolean(row.pode_gerenciar),
  };
}

function makeUser(
  user: User,
  profile: ProfileRow,
  permissionRows: PermissionRow[],
  projectIds: string[],
  teamIds: string[],
  projectScope: ProjectScope,
): GovernanceUser {
  const role = roleFromRow(profile.role);

  return {
    id: user.id,
    email: user.email ?? "",
    nome: profile.nome?.trim() || user.email || "",
    role,
    status: statusFromRow(profile.status),
    suspenso_ate: profile.suspenso_ate,
    project_scope: projectScope,
    created_at: profile.created_at || user.created_at,
    last_sign_in_at: user.last_sign_in_at ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    permissions: normalizarPermissoes(
      role,
      permissionRows.map(toPermission).filter(
        (permission): permission is GovernancePermission => permission !== null,
      ),
    ),
    project_ids: projectIds,
    team_ids: teamIds,
  };
}

function emptySnapshot(
  page: number,
  error?: string,
): GovernanceSnapshot {
  return {
    configured: false,
    error,
    users: [],
    directory_users: [],
    teams: [],
    projects: [],
    page,
    pageSize: GOVERNANCE_PAGE_SIZE,
    hasNextPage: false,
  };
}

async function listProjects(admin: AdminClient): Promise<GovernanceProject[]> {
  const first = await admin
    .from("projetos")
    .select("id, nome, ativo, origem_id")
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });

  if (!first.error) {
    return (first.data ?? []).map((row) => {
      const item = row as {
        id: number | string;
        nome: string;
        ativo: boolean;
        origem_id?: string | null;
      };
      return {
        id: String(item.origem_id ?? item.id),
        nome: item.nome,
        ativo: Boolean(item.ativo),
      };
    });
  }

  // A instalação anterior à migration 036 não tinha origem_id na view.
  // O fallback mantém o módulo operável durante a atualização gradual.
  const fallback = await admin
    .from("projetos")
    .select("id, nome, ativo")
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (fallback.error) throw new Error(errorText(first.error));

  return (fallback.data ?? []).map((row) => ({
    id: String(row.id),
    nome: String(row.nome),
    ativo: Boolean(row.ativo),
  }));
}

export async function readGovernanceUser(
  admin: AdminClient,
  userId: string,
): Promise<GovernanceUser | null> {
  const authResult = await admin.auth.admin.getUserById(userId);
  if (authResult.error || !authResult.data.user) return null;

  const [profileResult, permissionResult, projectResult, teamResult] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, nome, role, status, suspenso_ate, escopo_projetos, created_at")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("governanca_permissoes_modulo")
        .select("usuario_id, modulo, pode_visualizar, pode_editar, pode_gerenciar")
        .eq("usuario_id", userId),
      admin
        .from("governanca_projetos_usuarios")
        .select("usuario_id, projeto_id")
        .eq("usuario_id", userId),
      admin
        .from("usuario_equipes")
        .select("equipe_id, usuario_id")
        .eq("usuario_id", userId),
    ]);

  if (profileResult.error) throw new Error(errorText(profileResult.error));
  if (permissionResult.error) throw new Error(errorText(permissionResult.error));
  if (projectResult.error) throw new Error(errorText(projectResult.error));
  if (teamResult.error) throw new Error(errorText(teamResult.error));

  const profile = (profileResult.data as ProfileRow | null) ??
    profileFallback(authResult.data.user);
  const permissions = (permissionResult.data ?? []) as PermissionRow[];
  const projectIds = ((projectResult.data ?? []) as ProjectAccessRow[]).map(
    (row) => String(row.projeto_id),
  );
  const teamIds = ((teamResult.data ?? []) as TeamMemberRow[]).map(
    (row) => row.equipe_id,
  );

  return makeUser(
    authResult.data.user,
    profile,
    permissions,
    projectIds,
    teamIds,
    profile.escopo_projetos === "selected" ? "selected" : "all",
  );
}

export async function loadGovernanceSnapshot(
  requestedPage = 1,
): Promise<GovernanceSnapshot> {
  const page = Math.max(1, Math.floor(requestedPage));
  if (!isAdminConfigured()) {
    return emptySnapshot(
      page,
      "Configure SUPABASE_SERVICE_ROLE_KEY no ambiente da Vercel para habilitar o cadastro de contas.",
    );
  }

  try {
    const admin = createAdminClient();
    const [usersResult, directoryResult, teamsResult, membersResult, projects] = await Promise.all([
      admin.auth.admin.listUsers({
        page,
        perPage: GOVERNANCE_PAGE_SIZE,
      }),
      admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      }),
      admin
        .from("equipes")
        .select("id, nome, descricao, projeto_id, codigo, ativo, created_at")
        .order("nome", { ascending: true }),
      admin
        .from("usuario_equipes")
        .select("equipe_id, usuario_id"),
      listProjects(admin),
    ]);

    if (usersResult.error) throw new Error(errorText(usersResult.error));
    if (directoryResult.error) throw new Error(errorText(directoryResult.error));
    if (teamsResult.error) throw new Error(errorText(teamsResult.error));
    if (membersResult.error) throw new Error(errorText(membersResult.error));

    const users = usersResult.data.users ?? [];
    const directoryUsers: GovernanceDirectoryUser[] = (
      directoryResult.data.users ?? []
    ).map((user) => ({
      id: user.id,
      nome: String(user.user_metadata?.nome ?? user.email ?? ""),
      email: user.email ?? "",
    }));
    const userIds = users.map((user) => user.id);
    const [profilesResult, permissionsResult, projectAccessResult] =
      userIds.length === 0
        ? [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ]
        : await Promise.all([
            admin
              .from("profiles")
              .select("id, nome, role, status, suspenso_ate, escopo_projetos, created_at")
              .in("id", userIds),
            admin
              .from("governanca_permissoes_modulo")
              .select(
                "usuario_id, modulo, pode_visualizar, pode_editar, pode_gerenciar",
              )
              .in("usuario_id", userIds),
            admin
              .from("governanca_projetos_usuarios")
              .select("usuario_id, projeto_id")
              .in("usuario_id", userIds),
          ]);

    if (profilesResult.error) throw new Error(errorText(profilesResult.error));
    if (permissionsResult.error) {
      throw new Error(errorText(permissionsResult.error));
    }
    if (projectAccessResult.error) {
      throw new Error(errorText(projectAccessResult.error));
    }

    const profiles = new Map(
      (profilesResult.data as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    const permissionsByUser = new Map<string, PermissionRow[]>();
    for (const row of (permissionsResult.data ?? []) as PermissionRow[]) {
      const current = permissionsByUser.get(row.usuario_id) ?? [];
      current.push(row);
      permissionsByUser.set(row.usuario_id, current);
    }
    const projectsByUser = new Map<string, string[]>();
    for (const row of (projectAccessResult.data ?? []) as ProjectAccessRow[]) {
      const current = projectsByUser.get(row.usuario_id) ?? [];
      current.push(String(row.projeto_id));
      projectsByUser.set(row.usuario_id, current);
    }
    const teamsByUser = new Map<string, string[]>();
    for (const row of (membersResult.data ?? []) as TeamMemberRow[]) {
      const current = teamsByUser.get(row.usuario_id) ?? [];
      current.push(row.equipe_id);
      teamsByUser.set(row.usuario_id, current);
    }

    const serializedUsers = users
      .map((user) =>
          makeUser(
          user,
          profiles.get(user.id) ?? profileFallback(user),
          permissionsByUser.get(user.id) ?? [],
          projectsByUser.get(user.id) ?? [],
          teamsByUser.get(user.id) ?? [],
          profiles.get(user.id)?.escopo_projetos === "selected" ? "selected" : "all",
        ),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const membersByTeam = new Map<string, string[]>();
    for (const row of (membersResult.data ?? []) as TeamMemberRow[]) {
      const current = membersByTeam.get(row.equipe_id) ?? [];
      current.push(row.usuario_id);
      membersByTeam.set(row.equipe_id, current);
    }
    const teams = (teamsResult.data as TeamRow[]).map<GovernanceTeam>((team) => ({
      id: team.id,
      nome: team.nome,
      descricao: team.descricao ?? "",
      projeto_id: team.projeto_id ?? null,
      codigo: team.codigo,
      ativo: Boolean(team.ativo),
      created_at: team.created_at,
      member_ids: membersByTeam.get(team.id) ?? [],
    }));

    return {
      configured: true,
      users: serializedUsers,
      directory_users: directoryUsers,
      teams,
      projects,
      page,
      pageSize: GOVERNANCE_PAGE_SIZE,
      hasNextPage: users.length === GOVERNANCE_PAGE_SIZE,
    };
  } catch (error) {
    console.error("[governanca] falha ao carregar snapshot", error);
    return emptySnapshot(
      page,
      "A migração de governança ainda não está disponível neste projeto ou houve uma falha ao consultar o Supabase.",
    );
  }
}
