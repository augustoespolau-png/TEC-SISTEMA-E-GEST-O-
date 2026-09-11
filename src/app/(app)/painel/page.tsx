import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Painel2 from "@/components/painel2/Painel2";
import type { Role } from "@/lib/types";

export default async function PainelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const papel = (profile?.role ?? "consultor") as Role;
  /* O painel é só da gestão. A checagem tem de ser AQUI, no servidor:
     tirar a aba do menu esconde o caminho, mas quem digitar /painel na
     barra de endereço entraria assim mesmo. */
  if (papel === "operador") redirect("/consultar");

  return <Painel2 role={papel} />;
}
