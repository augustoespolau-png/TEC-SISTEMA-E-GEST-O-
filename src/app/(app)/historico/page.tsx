import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import TelaHistorico from "@/components/TelaHistorico";
import { canAccess } from "@/lib/access";

export default async function HistoricoPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (!canAccess(contexto.access, "HISTÓRICO", "ver")) redirect("/consultar");

  return <TelaHistorico />;
}
