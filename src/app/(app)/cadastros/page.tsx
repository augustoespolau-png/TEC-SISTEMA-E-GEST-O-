import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import { loadGovernanceSnapshot } from "@/lib/governanca-server";
import GovernancaAcessos from "@/components/governanca/GovernancaAcessos";

export default async function CadastrosPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (contexto.profile?.role !== "gestao") redirect("/");

  const snapshot = await loadGovernanceSnapshot(1);

  return <GovernancaAcessos initialSnapshot={snapshot} />;
}
