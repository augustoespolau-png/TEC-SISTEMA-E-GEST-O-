import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import TelaConsultar from "@/components/TelaConsultar";
import { canAccess, roleForModule } from "@/lib/access";

export default async function ConsultarPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (!canAccess(contexto.access, "AUDITORIA", "ver")) redirect("/indicadores");

  return (
    <TelaConsultar
      role={roleForModule(contexto.access, "AUDITORIA", contexto.role)}
    />
  );
}
