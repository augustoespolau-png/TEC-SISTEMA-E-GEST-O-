import { createClient } from "@/lib/supabase/server";

export type GestaoContext =
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      userId: string;
    }
  | {
      ok: false;
      status: 401 | 403;
      erro: string;
    };

export async function obterContextoGestao(): Promise<GestaoContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, status: 401, erro: "Não autenticado." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "gestao") {
    return { ok: false, status: 403, erro: "Acesso restrito à Gestão." };
  }

  return { ok: true, supabase, userId: user.id };
}
