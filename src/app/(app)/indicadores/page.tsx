import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Indicadores from "@/components/indicadores/Indicadores";
import type { Role } from "@/lib/types";

export default async function IndicadoresPage() {
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

  /* O operador ENTRA, a pedido, mas só alcança a folha de FPY — quem
     corta as outras é o próprio componente, com o papel na mão. Antes
     ele era mandado embora daqui. */
  return <Indicadores role={(profile?.role ?? "consultor") as Role} />;
}
