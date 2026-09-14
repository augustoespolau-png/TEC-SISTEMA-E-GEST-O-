import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import TelaHistorico from "@/components/TelaHistorico";

export default async function HistoricoPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  // a trilha existe para apontar responsabilidade: leitura é da gestão
  if (contexto.profile?.role !== "gestao") redirect("/consultar");

  return <TelaHistorico />;
}
