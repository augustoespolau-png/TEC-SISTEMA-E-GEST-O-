import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import AuditoriaCasa from "@/components/auditoria/AuditoriaCasa";
import { canModule } from "@/lib/governanca-types";
import type { Role } from "@/lib/types";

export default async function AuditoriaPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  const papel = (contexto.profile?.role as Role) ?? "operador";
  if (!canModule(contexto.permissions, "AUDITORIA")) redirect("/consultar");
  /* O consultor mantém a experiência de leitura em Indicadores/Consultar;
     a permissão de auditoria continua restrita aos perfis operacionais. */
  if (papel === "consultor") redirect("/indicadores");

  return <AuditoriaCasa role={papel} />;
}
