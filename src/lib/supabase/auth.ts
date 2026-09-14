import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/*
 * O layout e a página filha precisam do mesmo usuário/perfil durante a
 * renderização de uma rota. React.cache deduplica essa leitura por request,
 * evitando duas chamadas a auth.getUser() e duas consultas a profiles na
 * entrada inicial do aplicativo.
 */
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, role")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
});
