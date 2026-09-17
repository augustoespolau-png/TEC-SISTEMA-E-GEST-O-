import "server-only";

import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import {
  acessoAtivo,
  normalizarPermissoes,
  pode,
  primeiraRotaPermitida,
  type AcaoPermissao,
  type ModuloAcesso,
} from "@/lib/permissoes";
import type { Role } from "@/lib/types";

function papelLegado(valor: string | null | undefined): Role {
  return valor === "gestao" || valor === "operador" || valor === "consultor"
    ? valor
    : "consultor";
}

export async function obterAcessoAtual() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  const role = papelLegado(contexto.profile?.role);
  const permissoes = normalizarPermissoes(
    contexto.accessProfile?.permissions,
    role
  );

  return {
    ...contexto,
    role,
    permissoes,
    ativo: acessoAtivo(contexto.accessProfile),
  };
}

export async function exigirAcesso(
  modulo: ModuloAcesso,
  acao: AcaoPermissao = "ver"
) {
  const acesso = await obterAcessoAtual();

  if (!acesso.ativo) redirect("/acesso-bloqueado");

  if (!pode(acesso.permissoes, modulo, acao)) {
    redirect(primeiraRotaPermitida(acesso.permissoes));
  }

  return acesso;
}
