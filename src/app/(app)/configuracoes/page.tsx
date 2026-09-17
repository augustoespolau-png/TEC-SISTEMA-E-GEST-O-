import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import ConfigManager from "@/components/ConfigManager";
import ObrasEmpreendimentosCard from "@/components/config/ObrasEmpreendimentosCard";

export default async function ConfiguracoesPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  if (contexto.profile?.role !== "gestao") redirect("/");

  return (
    <>
      <main className="tela" style={{ paddingBottom: 0 }}>
        <ObrasEmpreendimentosCard />
      </main>
      <ConfigManager />
    </>
  );
}
