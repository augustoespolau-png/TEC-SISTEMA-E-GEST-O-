import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import ConfigManager from "@/components/ConfigManager";

export default async function ConfiguracoesPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  if (contexto.profile?.role !== "gestao") redirect("/");

  return <ConfigManager />;
}
