import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TelaConsultar from "@/components/TelaConsultar";
import type { Role } from "@/lib/types";

export default async function ConsultarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // o papel decide quem aprova retrabalho e quem enxerga a trilha
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  /* O consultor ENTRA aqui, e entra para ler: quem decide o que
     aparece é o papel, passado abaixo — no cartão dele o formulário
     inteiro some —, e a RLS do banco por trás recusa qualquer escrita
     que venha por fora da tela (migration 026). */
  return <TelaConsultar role={(profile?.role ?? "consultor") as Role} />;
}
