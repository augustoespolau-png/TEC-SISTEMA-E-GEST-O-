import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import Indicadores from "@/components/indicadores/Indicadores";
import IndicadoresSincronizacao from "@/components/indicadores/IndicadoresSincronizacao";
import type { Role } from "@/lib/types";

export default async function IndicadoresPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  /* O operador ENTRA, a pedido, mas só alcança a folha de FPY — quem
     corta as outras é o próprio componente, com o papel na mão. Antes
     ele era mandado embora daqui. */
  return (
    <>
      <IndicadoresSincronizacao />
      <Indicadores role={(contexto.profile?.role ?? "consultor") as Role} />
    </>
  );
}
