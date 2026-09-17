"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/supabase/auth";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import {
  GOVERNANCE_MODULES,
  isGovernanceModule,
  isRole,
  permissionRowsForRole,
  type AccountStatus,
  type GovernancePermission,
  type GovernanceTeam,
  type GovernanceUser,
  type ProjectScope,
} from "@/lib/governanca-types";
import type { Role } from "@/lib/types";
import {
  readGovernanceUser,
  loadGovernanceSnapshot,
} from "@/lib/governanca-server";
import type { GovernanceSnapshot } from "@/lib/governanca-types";

export interface CreateGovernanceUserInput {
  nome: string;
  email: string;
  role: Role;
}

export interface UpdateGovernanceUserInput {
  id: string;
  nome: string;
  email: string;
  role: Role;
  status: AccountStatus;
  suspenso_ate: string | null;
  permissions: GovernancePermission[];
  project_scope: ProjectScope;
  project_ids: string[];
}

export interface CreateGovernanceTeamInput {
  nome: string;
  codigo: string | null;
}

export interface UpdateGovernanceTeamInput {
  id: string;
  nome: string;
  codigo: string | null;
  ativo: boolean;
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type AdminClient = ReturnType<typeof createAdminClient>;

export async function loadGovernancePage(
  page: number,
): Promise<ActionResult<GovernanceSnapshot>> {
  try {
    await requireGestao();
    return { ok: true, data: await loadGovernanceSnapshot(page) };
  } catch (error) {
    return failure(error);
  }
}

function messageFrom(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Não foi possível concluir a operação.";
}

function failure(error: unknown): { ok: false; error: string } {
  const message = messageFrom(error);
  if (message.includes("already registered") || message.includes("already exists")) {
    return { ok: false, error: "Já existe uma conta com este e-mail." };
  }
  return { ok: false, error: message };
}

async function requireGestao() {
  if (!isAdminConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor. A Gestão de contas está desabilitada até essa variável ser cadastrada na Vercel.",
    );
  }

  const contexto = await getAuthContext();
  if (!contexto || contexto.profile?.role !== "gestao") {
    throw new Error("Acesso restrito à Gestão.");
  }

  return { actorId: contexto.user.id, admin: createAdminClient() };
}

function normalizeUserId(value: string) {
  const id = value.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Usuário inválido.");
  return id;
}

function normalizeName(value: string, label: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new Error(`${label} é obrigatório.`);
  if (name.length > 120) throw new Error(`${label} deve ter até 120 caracteres.`);
  return name;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }
  return email;
}

function normalizeRole(value: Role) {
  if (!isRole(value)) throw new Error("Perfil inválido.");
  return value;
}

function normalizeStatus(status: AccountStatus, suspendedUntil: string | null) {
  if (status === "suspended") {
    if (!suspendedUntil) {
      throw new Error("Defina a data final da suspensão.");
    }
    const timestamp = new Date(suspendedUntil).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
      throw new Error("A suspensão precisa terminar no futuro.");
    }
    return { status, suspendedUntil: new Date(timestamp).toISOString() };
  }
  if (status === "blocked") return { status, suspendedUntil: null };
  return { status: "active" as const, suspendedUntil: null };
}

function banDuration(status: AccountStatus, suspendedUntil: string | null) {
  if (status === "active") return "none";
  if (status === "blocked") return "876000h";
  const until = suspendedUntil ? new Date(suspendedUntil).getTime() : 0;
  const hours = Math.max(1, Math.ceil((until - Date.now()) / 3_600_000));
  return `${hours}h`;
}

function normalizedPermissionRows(
  role: Role,
  input: GovernancePermission[] | null | undefined,
) {
  const received = new Map(
    (input ?? [])
      .filter((row) => isGovernanceModule(row.modulo))
      .map((row) => [row.modulo, row]),
  );

  return GOVERNANCE_MODULES.map(({ id }) => {
    const row = received.get(id);
    if (role === "gestao") {
      return {
        modulo: id,
        pode_visualizar: true,
        pode_editar: true,
        pode_gerenciar: true,
      };
    }
    const podeVisualizar = Boolean(row?.pode_visualizar);
    const podeEditar = Boolean(row?.pode_editar && podeVisualizar);
    return {
      modulo: id,
      pode_visualizar: podeVisualizar,
      pode_editar: podeEditar,
      pode_gerenciar: Boolean(row?.pode_gerenciar && podeEditar),
    };
  });
}

async function ensureNotLastManager(
  admin: AdminClient,
  targetId: string,
  nextRole: Role,
  nextStatus: AccountStatus,
) {
  const current = await admin
    .from("profiles")
    .select("role, status")
    .eq("id", targetId)
    .maybeSingle();
  if (current.error) throw new Error(messageFrom(current.error));

  const isCurrentlyActiveManager =
    current.data?.role === "gestao" && current.data?.status === "active";
  const remainsManager = nextRole === "gestao" && nextStatus === "active";
  if (!isCurrentlyActiveManager || remainsManager) return;

  const managers = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "gestao")
    .eq("status", "active");
  if (managers.error) throw new Error(messageFrom(managers.error));
  if ((managers.count ?? 0) <= 1) {
    throw new Error("A última conta ativa de Gestão não pode ser removida ou suspensa.");
  }
}

async function audit(
  admin: AdminClient,
  actorId: string,
  acao: string,
  alvoId: string | null,
  detalhes: Record<string, unknown> = {},
) {
  const result = await admin.from("governanca_auditoria").insert({
    ator_id: actorId,
    alvo_id: alvoId,
    acao,
    detalhes,
  });
  if (result.error) {
    console.error("[governanca] não foi possível registrar auditoria", result.error);
  }
}

async function replaceAccess(
  admin: AdminClient,
  userId: string,
  role: Role,
  permissions: GovernancePermission[] | null | undefined,
  projectScope: ProjectScope,
  projectIds: string[],
) {
  const rows = normalizedPermissionRows(role, permissions);
  const permissionsResult = await admin
    .from("governanca_permissoes_modulo")
    .upsert(
      rows.map((row) => ({
        usuario_id: userId,
        modulo: row.modulo,
        pode_visualizar: row.pode_visualizar,
        pode_editar: row.pode_editar,
        pode_gerenciar: row.pode_gerenciar,
      })),
      { onConflict: "usuario_id,modulo" },
    );
  if (permissionsResult.error) throw new Error(messageFrom(permissionsResult.error));

  const scopeResult = await admin
    .from("profiles")
    .update({ escopo_projetos: projectScope })
    .eq("id", userId);
  if (scopeResult.error) throw new Error(messageFrom(scopeResult.error));

  const projectAccess = await admin
    .from("governanca_projetos_usuarios")
    .delete()
    .eq("usuario_id", userId);
  if (projectAccess.error) throw new Error(messageFrom(projectAccess.error));

  if (projectScope === "selected" && projectIds.length > 0) {
    const uniqueIds = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length > 100) {
      throw new Error("Selecione no máximo 100 projetos por usuário.");
    }
    const insertProjects = await admin
      .from("governanca_projetos_usuarios")
      .insert(uniqueIds.map((projetoId) => ({ usuario_id: userId, projeto_id: projetoId })));
    if (insertProjects.error) throw new Error(messageFrom(insertProjects.error));
  }

  return rows;
}

export async function createGovernanceUser(
  input: CreateGovernanceUserInput,
): Promise<ActionResult<GovernanceUser>> {
  try {
    const { admin, actorId } = await requireGestao();
    const nome = normalizeName(input.nome, "Nome");
    const email = normalizeEmail(input.email);
    const role = normalizeRole(input.role);
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://tec-sistema-e-gestao.vercel.app");

    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome },
      redirectTo: `${siteUrl}/login`,
    });
    if (invited.error || !invited.data.user) {
      throw new Error(messageFrom(invited.error ?? new Error("Convite não criado.")));
    }

    const userId = invited.data.user.id;
    try {
      const profile = await admin
        .from("profiles")
        .update({
          nome,
          role,
          status: "active",
          suspenso_ate: null,
          escopo_projetos: "all",
        })
        .eq("id", userId);
      if (profile.error) throw new Error(messageFrom(profile.error));
      await replaceAccess(admin, userId, role, permissionRowsForRole(role), "all", []);
    } catch (error) {
      await admin.auth.admin.deleteUser(userId);
      throw error;
    }

    await audit(admin, actorId, "USUARIO_CRIADO", userId, { role });
    const created = await readGovernanceUser(admin, userId);
    if (!created) throw new Error("A conta foi criada, mas não pôde ser recarregada.");
    revalidatePath("/cadastros");
    return { ok: true, data: created };
  } catch (error) {
    return failure(error);
  }
}

export async function updateGovernanceUser(
  input: UpdateGovernanceUserInput,
): Promise<ActionResult<GovernanceUser>> {
  try {
    const { admin, actorId } = await requireGestao();
    const id = normalizeUserId(input.id);
    const nome = normalizeName(input.nome, "Nome");
    const email = normalizeEmail(input.email);
    const role = normalizeRole(input.role);
    const normalizedStatus = normalizeStatus(input.status, input.suspenso_ate);

    if (id === actorId && (role !== "gestao" || normalizedStatus.status !== "active")) {
      throw new Error("Você não pode retirar o próprio acesso de Gestão.");
    }
    await ensureNotLastManager(admin, id, role, normalizedStatus.status);

    const authUpdate = await admin.auth.admin.updateUserById(id, {
      email,
      user_metadata: { nome },
      ban_duration: banDuration(normalizedStatus.status, normalizedStatus.suspendedUntil),
    });
    if (authUpdate.error) throw new Error(messageFrom(authUpdate.error));

    const profile = await admin
      .from("profiles")
      .update({
        nome,
        role,
        status: normalizedStatus.status,
        suspenso_ate: normalizedStatus.suspendedUntil,
      })
      .eq("id", id);
    if (profile.error) throw new Error(messageFrom(profile.error));

    await replaceAccess(
      admin,
      id,
      role,
      input.permissions,
      input.project_scope,
      input.project_ids,
    );
    await audit(admin, actorId, "USUARIO_ATUALIZADO", id, {
      role,
      status: normalizedStatus.status,
      project_scope: input.project_scope,
    });

    const updated = await readGovernanceUser(admin, id);
    if (!updated) throw new Error("A conta não pôde ser recarregada após a atualização.");
    revalidatePath("/cadastros");
    revalidatePath("/", "layout");
    return { ok: true, data: updated };
  } catch (error) {
    return failure(error);
  }
}

export async function sendGovernancePasswordReset(
  userId: string,
): Promise<ActionResult<true>> {
  try {
    const { admin, actorId } = await requireGestao();
    const id = normalizeUserId(userId);
    const user = await admin.auth.admin.getUserById(id);
    if (user.error || !user.data.user?.email) {
      throw new Error("E-mail da conta não encontrado.");
    }
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "https://tec-sistema-e-gestao.vercel.app");
    const result = await admin.auth.resetPasswordForEmail(user.data.user.email, {
      redirectTo: `${siteUrl}/login`,
    });
    if (result.error) throw new Error(messageFrom(result.error));
    await audit(admin, actorId, "RESET_SENHA_ENVIADO", id);
    return { ok: true, data: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteGovernanceUser(
  userId: string,
): Promise<ActionResult<true>> {
  try {
    const { admin, actorId } = await requireGestao();
    const id = normalizeUserId(userId);
    if (id === actorId) throw new Error("A conta usada na sessão não pode ser excluída.");
    await ensureNotLastManager(admin, id, "consultor", "blocked");
    await audit(admin, actorId, "USUARIO_EXCLUIDO", id);
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) throw new Error(messageFrom(deleted.error));
    revalidatePath("/cadastros");
    return { ok: true, data: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createGovernanceTeam(
  input: CreateGovernanceTeamInput,
): Promise<ActionResult<GovernanceTeam>> {
  try {
    const { admin, actorId } = await requireGestao();
    const nome = normalizeName(input.nome, "Nome da equipe");
    const codigo = input.codigo?.trim().toUpperCase() || null;
    if (codigo && codigo.length > 24) throw new Error("O código deve ter até 24 caracteres.");
    const result = await admin
      .from("governanca_equipes")
      .insert({ nome, codigo, ativo: true, created_by: actorId })
      .select("id, nome, codigo, ativo, created_at")
      .single();
    if (result.error || !result.data) throw new Error(messageFrom(result.error));
    await audit(admin, actorId, "EQUIPE_CRIADA", result.data.id, { nome });
    revalidatePath("/cadastros");
    return {
      ok: true,
      data: { ...result.data, member_ids: [] } as GovernanceTeam,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateGovernanceTeam(
  input: UpdateGovernanceTeamInput,
): Promise<ActionResult<GovernanceTeam>> {
  try {
    const { admin, actorId } = await requireGestao();
    const id = normalizeUserId(input.id);
    const nome = normalizeName(input.nome, "Nome da equipe");
    const codigo = input.codigo?.trim().toUpperCase() || null;
    if (codigo && codigo.length > 24) throw new Error("O código deve ter até 24 caracteres.");
    const result = await admin
      .from("governanca_equipes")
      .update({ nome, codigo, ativo: Boolean(input.ativo) })
      .eq("id", id)
      .select("id, nome, codigo, ativo, created_at")
      .single();
    if (result.error || !result.data) throw new Error(messageFrom(result.error));
    const members = await admin
      .from("governanca_equipe_membros")
      .select("usuario_id")
      .eq("equipe_id", id);
    if (members.error) throw new Error(messageFrom(members.error));
    await audit(admin, actorId, "EQUIPE_ATUALIZADA", id, { ativo: input.ativo });
    revalidatePath("/cadastros");
    return {
      ok: true,
      data: {
        ...result.data,
        member_ids: (members.data ?? []).map((row) => row.usuario_id),
      } as GovernanceTeam,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function saveGovernanceTeamMembers(
  teamId: string,
  userIds: string[],
): Promise<ActionResult<GovernanceTeam>> {
  try {
    const { admin, actorId } = await requireGestao();
    const id = normalizeUserId(teamId);
    const uniqueUserIds = [...new Set(userIds.map(normalizeUserId))];
    if (uniqueUserIds.length > 500) throw new Error("Uma equipe pode ter até 500 membros.");
    const team = await admin
      .from("governanca_equipes")
      .select("id, nome, codigo, ativo, created_at")
      .eq("id", id)
      .single();
    if (team.error || !team.data) throw new Error("Equipe não encontrada.");

    const existing = await admin
      .from("governanca_equipe_membros")
      .delete()
      .eq("equipe_id", id);
    if (existing.error) throw new Error(messageFrom(existing.error));
    if (uniqueUserIds.length > 0) {
      const inserted = await admin.from("governanca_equipe_membros").insert(
        uniqueUserIds.map((usuarioId) => ({ equipe_id: id, usuario_id: usuarioId })),
      );
      if (inserted.error) throw new Error(messageFrom(inserted.error));
    }
    await audit(admin, actorId, "MEMBROS_EQUIPE_ATUALIZADOS", id, {
      total_membros: uniqueUserIds.length,
    });
    revalidatePath("/cadastros");
    return {
      ok: true,
      data: { ...team.data, member_ids: uniqueUserIds } as GovernanceTeam,
    };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteGovernanceTeam(
  teamId: string,
): Promise<ActionResult<true>> {
  try {
    const { admin, actorId } = await requireGestao();
    const id = normalizeUserId(teamId);
    const result = await admin.from("governanca_equipes").delete().eq("id", id);
    if (result.error) throw new Error(messageFrom(result.error));
    await audit(admin, actorId, "EQUIPE_EXCLUIDA", id);
    revalidatePath("/cadastros");
    return { ok: true, data: true };
  } catch (error) {
    return failure(error);
  }
}
