import type { Role } from "@/lib/types";

export type AcaoPermissao = "ver" | "editar";

export type PermissaoModulo = {
  ver: boolean;
  editar: boolean;
  folhas?: string[];
};

export type PermissoesUsuario = Record<string, PermissaoModulo>;

export type PerfilAcesso = {
  role: string | null;
  status: string | null;
  permissions: Record<string, Partial<PermissaoModulo>> | null;
  suspended_until: string | null;
};

export const MODULOS_ACESSO = [
  {
    id: "AUDITORIA",
    nome: "Auditoria e Consulta",
    descricao: "Casas, paredes, desvios, fotos, retrabalho e consulta operacional.",
  },
  {
    id: "INDICADORES",
    nome: "Indicadores",
    descricao: "FPY, qualidade, fluxo e comparativos.",
  },
  {
    id: "HISTÓRICO",
    nome: "Histórico",
    descricao: "Trilha e histórico das alterações do sistema.",
  },
  {
    id: "CONFIGURAÇÃO",
    nome: "Configurações",
    descricao: "Cadastros técnicos e parâmetros do sistema.",
  },
  {
    id: "CADASTROS",
    nome: "Usuários e Permissões",
    descricao: "Criar usuários e administrar acessos individuais.",
  },
] as const;

export type ModuloAcesso = (typeof MODULOS_ACESSO)[number]["id"];

const TODAS_FOLHAS = ["fpy", "desvios", "fluxo", "comparativos"];

function permissao(ver: boolean, editar: boolean, folhas?: string[]) {
  return { ver: ver || editar, editar, ...(folhas ? { folhas } : {}) };
}

export function normalizarPermissoes(
  valor: Record<string, Partial<PermissaoModulo>> | null | undefined,
  role: Role = "consultor"
): PermissoesUsuario {
  const fallback: PermissoesUsuario =
    role === "gestao"
      ? {
          AUDITORIA: permissao(true, true),
          INDICADORES: permissao(true, true, TODAS_FOLHAS),
          HISTÓRICO: permissao(true, true),
          CONFIGURAÇÃO: permissao(true, true),
          CADASTROS: permissao(true, true),
        }
      : role === "operador"
        ? {
            AUDITORIA: permissao(true, true),
            INDICADORES: permissao(true, false, ["fpy"]),
            HISTÓRICO: permissao(false, false),
            CONFIGURAÇÃO: permissao(false, false),
            CADASTROS: permissao(false, false),
          }
        : {
            AUDITORIA: permissao(true, false),
            INDICADORES: permissao(true, false, TODAS_FOLHAS),
            HISTÓRICO: permissao(false, false),
            CONFIGURAÇÃO: permissao(false, false),
            CADASTROS: permissao(false, false),
          };

  if (!valor) return fallback;

  const resultado: PermissoesUsuario = { ...fallback };
  for (const modulo of MODULOS_ACESSO) {
    const recebido = valor[modulo.id];
    if (!recebido) continue;
    const editar = recebido.editar === true;
    const ver = recebido.ver === true || editar;
    resultado[modulo.id] = {
      ver,
      editar,
      ...(modulo.id === "INDICADORES"
        ? {
            folhas:
              Array.isArray(recebido.folhas) && recebido.folhas.length
                ? recebido.folhas
                : ver
                  ? TODAS_FOLHAS
                  : [],
          }
        : {}),
    };
  }
  return resultado;
}

export function acessoAtivo(perfil: PerfilAcesso | null | undefined) {
  if (!perfil) return true;
  const status = String(perfil.status ?? "").toUpperCase();
  if (status === "APROVADO") return true;
  if (status !== "SUSPENSO" || !perfil.suspended_until) return false;
  return new Date(perfil.suspended_until).getTime() <= Date.now();
}

export function pode(
  permissoes: PermissoesUsuario,
  modulo: ModuloAcesso,
  acao: AcaoPermissao
) {
  const regra = permissoes[modulo];
  if (!regra) return false;
  return acao === "ver" ? regra.ver || regra.editar : regra.editar;
}

export function primeiraRotaPermitida(permissoes: PermissoesUsuario) {
  if (pode(permissoes, "AUDITORIA", "ver")) return "/auditoria";
  if (pode(permissoes, "INDICADORES", "ver")) return "/indicadores";
  if (pode(permissoes, "HISTÓRICO", "ver")) return "/historico";
  if (pode(permissoes, "CONFIGURAÇÃO", "ver")) return "/configuracoes";
  if (pode(permissoes, "CADASTROS", "ver")) return "/usuarios";
  return "/acesso-bloqueado";
}
