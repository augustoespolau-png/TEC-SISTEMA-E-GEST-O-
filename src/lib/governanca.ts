import "server-only";

import { getAuthContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const MODULOS_GOVERNANCA = [
  "AUDITORIA",
  "INDICADORES",
  "HISTÓRICO",
  "FORNECEDORES",
  "DOCUMENTOS",
  "NÃO CONFORMIDADES",
  "PLANOS DE AÇÃO",
  "CONTROLE DE PRODUÇÃO",
  "SUPORTE",
  "CONFIGURAÇÃO",
  "CADASTROS",
] as const;

export type ModuloGovernanca = (typeof MODULOS_GOVERNANCA)[number];
export type AcaoGovernanca = "ver" | "editar";
export type PermissoesGovernanca = Record<
  ModuloGovernanca,
  { ver: boolean; editar: boolean }
>;

export const PRESETS_ACESSO = [
  { id: "GESTAO", nome: "Gestão", descricao: "Acesso completo e governança." },
  {
    id: "LEITURA_GERAL",
    nome: "Leitura geral",
    descricao: "Consulta todos os dados e relatórios, sem mutações.",
  },
  {
    id: "INDICADORES",
    nome: "Somente indicadores",
    descricao: "Visualiza FPY/Indicadores e não acessa auditoria ou mutações.",
  },
  {
    id: "INSPETOR",
    nome: "Inspetor",
    descricao: "Opera auditoria e rotinas de qualidade autorizadas.",
  },
  {
    id: "PERSONALIZADO",
    nome: "Personalizado",
    descricao: "Visibilidade e escrita definidas módulo a módulo.",
  },
] as const;

export type PresetAcesso = (typeof PRESETS_ACESSO)[number]["id"];

export type PerfilAcessoRow = {
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  permissions: Record<string, { ver?: boolean; editar?: boolean }> | null;
  suspended_until: string | null;
  version: number;
};

export type EquipeRow = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
};

export type ObraProjetoRow = {
  id: string;
  codigo: string;
  nome: string | null;
  origem: string | null;
  status: string;
};

export function permissoesVazias(): PermissoesGovernanca {
  return Object.fromEntries(
    MODULOS_GOVERNANCA.map((modulo) => [
      modulo,
      { ver: false, editar: false },
    ])
  ) as PermissoesGovernanca;
}

export function normalizarPermissoes(
  raw: PerfilAcessoRow["permissions"]
): PermissoesGovernanca {
  const base = permissoesVazias();
  for (const modulo of MODULOS_GOVERNANCA) {
    const atual = raw?.[modulo];
    base[modulo] = {
      ver: Boolean(atual?.ver),
      editar: Boolean(atual?.editar),
    };
    if (base[modulo].editar) base[modulo].ver = true;
  }
  return base;
}

/**
 * Dupla validação para qualquer Server Action administrativa:
 * 1) coarse-grained no contexto autenticado da aplicação;
 * 2) autorização canônica no banco, pela função usada pelas RLS.
 */
export async function requireGestao() {
  const contexto = await getAuthContext();
  if (!contexto || contexto.profile?.role !== "gestao") {
    throw new Error("Acesso restrito à Gestão.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tecverde_is_gestao");
  if (error || data !== true) {
    throw new Error("A autorização de Gestão não foi confirmada pelo banco.");
  }

  return { contexto, supabase };
}
