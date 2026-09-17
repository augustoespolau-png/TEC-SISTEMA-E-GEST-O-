import type { Role } from "@/lib/types";

export type AccessMode = "GESTAO" | "LEITURA_GLOBAL" | "PERSONALIZADO";
export type AccessAction = "ver" | "editar";

export type PermissionMatrix = Record<
  string,
  { ver?: boolean; editar?: boolean } | undefined
>;

export type AccessSnapshot = {
  mode: AccessMode;
  status: string;
  appRole: Role;
  permissions: PermissionMatrix;
  suspendedUntil: string | null;
};

export const ACCESS_MODULES = [
  "AUDITORIA",
  "INDICADORES",
  "HISTÓRICO",
  "CONFIGURAÇÃO",
  "ADMINISTRAÇÃO",
  "DOCUMENTOS",
  "FORNECEDORES",
  "NÃO CONFORMIDADES",
  "PLANOS DE AÇÃO",
  "CONTROLE DE PRODUÇÃO",
  "SUPORTE",
] as const;

export type AccessModule = (typeof ACCESS_MODULES)[number];

function normalizarMode(value: unknown): AccessMode {
  return value === "GESTAO" || value === "LEITURA_GLOBAL"
    ? value
    : "PERSONALIZADO";
}

function normalizarRole(value: unknown, fallback: Role): Role {
  return value === "gestao" || value === "operador" || value === "consultor"
    ? value
    : fallback;
}

function legacyPermissions(role: Role): PermissionMatrix {
  if (role === "gestao") {
    return Object.fromEntries(
      ACCESS_MODULES.map((modulo) => [modulo, { ver: true, editar: true }])
    );
  }
  if (role === "operador") {
    return {
      AUDITORIA: { ver: true, editar: true },
      INDICADORES: { ver: true, editar: false },
    };
  }
  return {
    AUDITORIA: { ver: true, editar: false },
    INDICADORES: { ver: true, editar: false },
    HISTÓRICO: { ver: true, editar: false },
  };
}

export function accessFromRow(
  row: {
    access_mode?: unknown;
    status?: unknown;
    app_role?: unknown;
    permissions?: unknown;
    suspended_until?: unknown;
  } | null,
  fallbackRole: Role
): AccessSnapshot {
  if (!row) {
    return {
      mode: fallbackRole === "gestao" ? "GESTAO" : "PERSONALIZADO",
      status: "APROVADO",
      appRole: fallbackRole,
      permissions: legacyPermissions(fallbackRole),
      suspendedUntil: null,
    };
  }

  const permissions =
    row.permissions && typeof row.permissions === "object"
      ? (row.permissions as PermissionMatrix)
      : {};

  return {
    mode: normalizarMode(row.access_mode),
    status: String(row.status ?? "PENDENTE").toUpperCase(),
    appRole: normalizarRole(row.app_role, fallbackRole),
    permissions,
    suspendedUntil:
      typeof row.suspended_until === "string" ? row.suspended_until : null,
  };
}

export function isAccessActive(access: AccessSnapshot) {
  if (access.status !== "APROVADO") return false;
  if (!access.suspendedUntil) return true;
  return new Date(access.suspendedUntil).getTime() <= Date.now();
}

export function canAccess(
  access: AccessSnapshot,
  modulo: AccessModule | string,
  acao: AccessAction = "ver"
) {
  if (!isAccessActive(access)) return false;
  if (access.mode === "GESTAO") return true;
  if (access.mode === "LEITURA_GLOBAL") return acao === "ver";

  const regra = access.permissions[String(modulo).toUpperCase()];
  return Boolean(regra?.[acao]);
}

export function isManagement(access: AccessSnapshot) {
  return access.mode === "GESTAO" && access.appRole === "gestao" && isAccessActive(access);
}

export function roleForModule(
  access: AccessSnapshot,
  modulo: AccessModule | string,
  fallback: Role
): Role {
  if (!canAccess(access, modulo, "editar")) return "consultor";
  if (isManagement(access)) return "gestao";
  return fallback === "consultor" ? "operador" : fallback;
}
