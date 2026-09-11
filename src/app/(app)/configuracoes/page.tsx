import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConfigManager from "@/components/ConfigManager";

export default async function ConfiguracoesPage() {
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

  if (profile?.role !== "gestao") redirect("/");

  return <ConfigManager />;
}
