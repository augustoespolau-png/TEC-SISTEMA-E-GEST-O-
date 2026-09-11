import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TelaHistorico from "@/components/TelaHistorico";

export default async function HistoricoPage() {
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

  // a trilha existe para apontar responsabilidade: leitura é da gestão
  if (profile?.role !== "gestao") redirect("/consultar");

  return <TelaHistorico />;
}
