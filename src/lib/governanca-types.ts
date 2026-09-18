import type { Role } from "@/lib/types";

export const GOVERNANCE_MODULES = [
  {
    id: "AUDITORIA",
    label: "Auditoria",
    description: "Registrar e revisar auditorias de produção.",
  },
  {
    id: "CONSULTA",
    label: "Consultar",
    description: "Pesquisar ocorrências e histórico operacional.",
  },
  {
    id: "INDICADORES",
    label: "Indicadores",
    description: "Visualizar FPY, qualidade, fluxo e comparativos.",
  },
  {
    id: "HISTORICO",
    label: "Histórico",
    description: "Consultar trilha de alterações e aprovações.",
  },
  {
    id: "CONFIGURACOES",
    label: "Configurações",
    description: "Administrar listas, regras e parâmetros.",
  },
  {
    id: "IA",
    label: "IA-TEC",
    description: "Consultar análises internas e relatórios executivos.",
  },
  {
    id: "CADASTROS",
    label: "Cadastros",
    description: "Gerir contas, equipes e governança de acesso.",
  },
  {
    id: "RESÍDUOS",
    label: "Resíduos",
    description: "Registrar trocas de caçamba, MTR e destinação.",
  },
  {
    id: "CADEIA_MADEIRA",
    label: "Cadeia da Madeira",
    description: "Controlar fornecedores, lotes, inspeções e laudos de madeira estrutural.",
  },
] as const;

export type GovernanceModule = (typeof GOVERNANCE_MODULES)[number]["id"];
export type GovernanceAction = "ver" | "editar" | "gerenciar";
export type AccountStatus = "active" | "blocked" | "suspended";
export type ProjectScope = "all" | "selected";

export interface GovernancePermission {
  modulo: GovernanceModule;
  pode_visualizar: boolean;
  pode_editar: boolean;
  pode_gerenciar: boolean;
}

export interface GovernanceUser {
  id: string;
  email: string;
  nome: string;
  role: Role;
  status: AccountStatus;
  suspenso_ate: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  permissions: GovernancePermission[];
  project_scope: ProjectScope;
  project_ids: string[];
  team_ids: string[];
}

export interface GovernanceTeam {
  id: string;
  nome: string;
  descricao: string;
  projeto_id: string | null;
  codigo: string | null;
  ativo: boolean;
  created_at: string;
  member_ids: string[];
}

export interface GovernanceProject {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface GovernanceDirectoryUser {
  id: string;
  nome: string;
  email: string;
}

export interface GovernanceSnapshot {
  configured: boolean;
  error?: string;
  users: GovernanceUser[];
  directory_users: GovernanceDirectoryUser[];
  teams: GovernanceTeam[];
  projects: GovernanceProject[];
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export function isRole(value: unknown): value is Role {
  return value === "operador" || value === "consultor" || value === "gestao";
}

function normalizeStoredValue(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
    : "";
}

/** Converte os papéis legados/canônicos do Supabase para o domínio da UI. */
export function roleFromStored(value: unknown): Role {
  if (isRole(value)) return value;

  const role = normalizeStoredValue(value);
  if (["GESTAO", "GESTOR", "ADMIN", "ADMINISTRADOR"].includes(role)) {
    return "gestao";
  }
  if (["OPERADOR", "INSPETOR", "AUDITOR", "QUALIDADE"].includes(role)) {
    return "operador";
  }
  return "consultor";
}

/** Converte o papel da aplicação para o enum textual aceito pelo schema remoto. */
export function storedRoleFor(role: Role) {
  if (role === "gestao") return "GESTAO";
  if (role === "operador") return "INSPETOR";
  return "SUPERVISOR";
}

/** Converte os status legados/canônicos do Supabase para o domínio da UI. */
export function statusFromStored(value: unknown): AccountStatus {
  if (value === "active" || value === "blocked" || value === "suspended") {
    return value;
  }

  const status = normalizeStoredValue(value);
  if (["APROVADO", "ATIVO", "ACTIVE"].includes(status)) return "active";
  if (["SUSPENSO", "SUSPENDED"].includes(status)) return "suspended";
  return "blocked";
}

/** Converte o status da aplicação para o enum textual aceito pelo schema remoto. */
export function storedStatusFor(status: AccountStatus) {
  if (status === "active") return "APROVADO";
  if (status === "suspended") return "SUSPENSO";
  return "BLOQUEADO";
}

export function isGovernanceModule(value: unknown): value is GovernanceModule {
  return GOVERNANCE_MODULES.some((module) => module.id === value);
}

export function permissionRowsForRole(role: Role): GovernancePermission[] {
  return GOVERNANCE_MODULES.map(({ id }) => {
    if (role === "gestao") {
      return {
        modulo: id,
        pode_visualizar: true,
        pode_editar: true,
        pode_gerenciar: true,
      };
    }

    const podeVisualizar =
      (role === "consultor" || role === "operador") &&
      (id === "CONSULTA" ||
        id === "INDICADORES" ||
        id === "AUDITORIA" ||
        id === "CADEIA_MADEIRA");

    const podeEditar = role === "operador" && id === "AUDITORIA";

    return {
      modulo: id,
      pode_visualizar: podeVisualizar,
      pode_editar: podeEditar,
      pode_gerenciar: false,
    };
  });
}

export function normalizarPermissoes(
  role: Role,
  rows: GovernancePermission[] | null | undefined,
): GovernancePermission[] {
  const defaults = permissionRowsForRole(role);
  const byModule = new Map((rows ?? []).map((row) => [row.modulo, row]));

  return defaults.map((fallback) => {
    const row = byModule.get(fallback.modulo);
    if (!row) return fallback;
    if (role === "gestao") {
      return {
        modulo: fallback.modulo,
        pode_visualizar: true,
        pode_editar: true,
        pode_gerenciar: true,
      };
    }
    return {
      modulo: fallback.modulo,
      pode_visualizar: Boolean(row.pode_visualizar),
      pode_editar: Boolean(row.pode_editar && row.pode_visualizar),
      pode_gerenciar: Boolean(
        row.pode_gerenciar && row.pode_editar && row.pode_visualizar,
      ),
    };
  });
}

export function canModule(
  permissions: GovernancePermission[] | null | undefined,
  module: GovernanceModule,
  action: GovernanceAction = "ver",
) {
  const permission = permissions?.find((row) => row.modulo === module);
  if (!permission) return false;
  if (action === "gerenciar") return permission.pode_gerenciar;
  if (action === "editar") return permission.pode_editar;
  return permission.pode_visualizar;
}

export function roleLabel(role: Role) {
  if (role === "gestao") return "Gestão";
  if (role === "operador") return "Operador";
  return "Consultor";
}

export function statusLabel(status: AccountStatus) {
  if (status === "blocked") return "Bloqueado";
  if (status === "suspended") return "Suspenso";
  return "Ativo";
}
