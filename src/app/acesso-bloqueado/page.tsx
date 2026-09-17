import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoTecverde from "@/components/LogoTecverde";

export default function AcessoBloqueadoPage() {
  async function sair() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-papel-2 p-4">
      <section className="w-full max-w-md rounded-3xl border border-line bg-papel p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <LogoTecverde />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
              Controle de acesso
            </p>
            <h1 className="mt-1 text-lg font-semibold text-ink">Acesso indisponível</h1>
          </div>
        </div>
        <p className="text-sm leading-6 text-ink-2">
          Este usuário está bloqueado, suspenso ou não possui nenhum módulo liberado no momento. Procure um administrador do sistema para revisar as permissões.
        </p>
        <form action={sair} className="mt-6">
          <button type="submit" className="btn w-full">
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
