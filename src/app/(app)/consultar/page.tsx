import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import TelaConsultar from "@/components/TelaConsultar";
import { canModule } from "@/lib/governanca-types";
import type { Role } from "@/lib/types";

export default async function ConsultarPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");

  if (!canModule(contexto.permissions, "CONSULTA")) {
    redirect(
      canModule(contexto.permissions, "INDICADORES") ? "/indicadores" : "/",
    );
  }

  // o papel decide quem aprova retrabalho e quem enxerga a trilha
  /* O consultor ENTRA aqui, e entra para ler: quem decide o que
     aparece é o papel, passado abaixo — no cartão dele o formulário
     inteiro some —, e a RLS do banco por trás recusa qualquer escrita
     que venha por fora da tela (migration 026). */
  return <TelaConsultar role={(contexto.profile?.role ?? "consultor") as Role} />;
}
