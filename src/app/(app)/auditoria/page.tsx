import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import AuditoriaCasa from "@/components/auditoria/AuditoriaCasa";
import type { Role } from "@/lib/types";

export default async function AuditoriaPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  const papel = (contexto.profile?.role as Role) ?? "operador";
  /* Quem audita é operador e gestão. O consultor é acesso de leitura
     de indicador: ele não abre esta tela nem digitando o endereço. */
  if (papel === "consultor") redirect("/indicadores");

  return <AuditoriaCasa role={papel} />;
}
