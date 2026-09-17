import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import AuditoriaCasa from "@/components/auditoria/AuditoriaCasa";
import { canAccess, roleForModule } from "@/lib/access";

export default async function AuditoriaPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (!canAccess(contexto.access, "AUDITORIA", "ver")) redirect("/indicadores");

  return (
    <AuditoriaCasa
      role={roleForModule(contexto.access, "AUDITORIA", contexto.role)}
    />
  );
}
