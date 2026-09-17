"use server";

import { revalidatePath } from "next/cache";
import { exigirAcesso } from "@/lib/acesso-server";
import { createClient } from "@/lib/supabase/server";
import type { PermissoesUsuario } from "@/lib/permissoes";

export type StatusUsuario = "APROVADO" | "BLOQUEADO" | "SUSPENSO";

export type UsuarioAdministrado = {
  id: string;
  nome: string;
  email: string;
  role: string;
  status: StatusUsuario | string;
  permissions: PermissoesUsuario;
  suspendedUntil: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  currentUser: boolean;
  protectedAdmin: boolean;
};

export type ResultadoAcao<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CriarUsuarioInput = {
  nome: string;
  email: string;
  password: string;
  permissions: PermissoesUsuario;
};

export type AtualizarUsuarioInput = {
  userId: string;
  nome: string;
  status: StatusUsuario;
  suspendedUntil: string | null;
  permissions: PermissoesUsuario;
};

function erroLegivel(valor: unknown, fallback: string) {
  if (valor && typeof valor === "object" && "error" in valor) {
    const texto = (valor as { error?: unknown }).error;
    if (typeof texto === "string" && texto.trim()) return texto.trim();
  }
  return fallback;
}

async function chamarAdminUsuarios<T>(
  action: string,
  payload: Record<string, unknown> = {},
  edicao = false
): Promise<ResultadoAcao<T>> {
  await exigirAcesso("CADASTROS", edicao ? "editar" : "ver");

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return { ok: false, error: "Sua sessão expirou. Entre novamente." };
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anonKey) {
    return {
      ok: false,
      error: "Configuração do servidor incompleta para administrar usuários.",
    };
  }

  try {
    const response = await fetch(`${base}/functions/v1/admin-usuarios`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        error: erroLegivel(body, "Não foi possível concluir a operação."),
      };
    }

    return { ok: true, data: body as T };
  } catch (caught) {
    return {
      ok: false,
      error:
        caught instanceof Error
          ? caught.message
          : "Não foi possível comunicar com o serviço de usuários.",
    };
  }
}

export async function listarUsuariosAction(): Promise<
  ResultadoAcao<UsuarioAdministrado[]>
> {
  const resultado = await chamarAdminUsuarios<{
    users?: UsuarioAdministrado[];
  }>("list");

  if (!resultado.ok) return resultado;
  return { ok: true, data: resultado.data.users ?? [] };
}

export async function criarUsuarioAction(
  input: CriarUsuarioInput
): Promise<ResultadoAcao<{ userId: string }>> {
  const resultado = await chamarAdminUsuarios<{ userId?: string }>(
    "create",
    input as unknown as Record<string, unknown>,
    true
  );

  if (!resultado.ok) return resultado;
  revalidatePath("/usuarios");
  return { ok: true, data: { userId: resultado.data.userId ?? "" } };
}

export async function atualizarUsuarioAction(
  input: AtualizarUsuarioInput
): Promise<ResultadoAcao> {
  const resultado = await chamarAdminUsuarios<Record<string, never>>(
    "update",
    input as unknown as Record<string, unknown>,
    true
  );

  if (!resultado.ok) return resultado;
  revalidatePath("/usuarios");
  return { ok: true, data: undefined };
}

export async function excluirUsuarioAction(
  userId: string
): Promise<ResultadoAcao> {
  const resultado = await chamarAdminUsuarios<Record<string, never>>(
    "delete",
    { userId },
    true
  );

  if (!resultado.ok) return resultado;
  revalidatePath("/usuarios");
  return { ok: true, data: undefined };
}
