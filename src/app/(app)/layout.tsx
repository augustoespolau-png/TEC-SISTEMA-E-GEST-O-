import { redirect } from "next/navigation";
import { getAuthContext, isAccountInactive } from "@/lib/supabase/auth";
import TabBar from "@/components/TabBar";
import NavInferior from "@/components/NavInferior";
import type { Role } from "@/lib/types";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  if (isAccountInactive(contexto.profile)) redirect("/acesso-negado");

  const role = (contexto.profile?.role ?? "consultor") as Role;
  const nome = contexto.profile?.nome || contexto.user.email || "";

  // largura livre: o Painel ocupa a tela inteira; as demais telas se
  // centralizam sozinhas (classe .tela). No celular a navegação fica
  // numa barra fixa embaixo, em todas as telas — inclusive no Painel.
  /* No PC a navegação virou uma coluna à esquerda: com cinco telas, ler
     de cima para baixo e mais rápido que varrer uma faixa horizontal, e
     sobra largura para os paineis. No celular nada muda — a navegação
     continua na barra de baixo, ao alcance do polegar. */
  return (
    <div className="quadro-app">
      <TabBar role={role} nome={nome} permissions={contexto.permissions} />
      <div className="conteudo-app">
        {children}
      </div>
      <NavInferior role={role} permissions={contexto.permissions} />
    </div>
  );
}
