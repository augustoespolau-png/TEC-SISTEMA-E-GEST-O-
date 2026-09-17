import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import Indicadores from "@/components/indicadores/Indicadores";
import IndicadoresSincronizacao from "@/components/indicadores/IndicadoresSincronizacao";
import { canAccess } from "@/lib/access";

export default async function IndicadoresPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (!canAccess(contexto.access, "INDICADORES", "ver")) redirect("/consultar");

  return (
    <>
      <IndicadoresSincronizacao />
      <Indicadores role={contexto.role} />
    </>
  );
}
