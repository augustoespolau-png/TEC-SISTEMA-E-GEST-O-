import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import TabBar from "@/components/TabBar";
import NavInferior from "@/components/NavInferior";
import IndicadoresAiSlot from "@/components/ai/IndicadoresAiSlot";
import { isManagement } from "@/lib/access";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  const nome = contexto.profile?.nome || contexto.user.email || "";

  return (
    <div className="quadro-app">
      <TabBar role={contexto.role} nome={nome} access={contexto.access} />
      <div className="conteudo-app">
        {isManagement(contexto.access) && <IndicadoresAiSlot />}
        {children}
      </div>
      <NavInferior role={contexto.role} access={contexto.access} />
    </div>
  );
}
