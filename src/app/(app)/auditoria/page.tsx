import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AuditoriaCasa from "@/components/auditoria/AuditoriaCasa";
import type { Role } from "@/lib/types";

export default async function AuditoriaPage() {
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

  const papel = (profile?.role as Role) ?? "operador";
  /* Quem audita é operador e gestão. O consultor é acesso de leitura
     de indicador: ele não abre esta tela nem digitando o endereço. */
  if (papel === "consultor") redirect("/indicadores");

  return <AuditoriaCasa role={papel} />;
}
