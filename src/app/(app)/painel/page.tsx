import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import Painel2 from "@/components/painel2/Painel2";
import type { Role } from "@/lib/types";

export default async function PainelPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  const papel = (contexto.profile?.role ?? "consultor") as Role;
  /* O painel é só da gestão. A checagem tem de ser AQUI, no servidor:
     tirar a aba do menu esconde o caminho, mas quem digitar /painel na
     barra de endereço entraria assim mesmo. */
  if (papel === "operador") redirect("/consultar");

  return <Painel2 role={papel} />;
}
