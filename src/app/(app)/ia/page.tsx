import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import AISuite from "@/components/ai/AISuite";

export default async function IaSuitePage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (contexto.profile?.role !== "gestao") redirect("/indicadores");

  return <AISuite />;
}
