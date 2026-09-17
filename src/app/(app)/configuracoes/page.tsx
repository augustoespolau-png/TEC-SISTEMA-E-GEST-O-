import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/supabase/auth";
import ConfigManager from "@/components/ConfigManager";
import DiagnosticoSistemaCard from "@/components/config/DiagnosticoSistemaCard";
import ObrasEmpreendimentosCard from "@/components/config/ObrasEmpreendimentosCard";
import { isManagement } from "@/lib/access";

export default async function ConfiguracoesPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (!isManagement(contexto.access)) redirect("/");

  return (
    <>
      <main className="tela tela-2col" style={{ paddingBottom: 0 }}>
        <DiagnosticoSistemaCard />
        <Link
          href="/ia"
          className="group rounded-2xl border border-line bg-papel p-5 shadow-sm transition hover:border-brand"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
                Lapidação Inteligente
              </p>
              <h2 className="mt-1 text-base font-semibold text-ink">AI Suite · Gestão</h2>
              <p className="mt-2 text-sm leading-6 text-ink-2">
                Consulte a base em linguagem natural, acompanhe tendências preventivas e gere o relatório executivo semanal com IA.
              </p>
            </div>
            <span className="rounded-full border border-line bg-papel-2 px-2.5 py-1 text-[10px] text-ink-2 transition group-hover:border-brand">
              seguro
            </span>
          </div>
          <div className="mt-4 inline-flex rounded-xl border border-brand bg-brand px-3.5 py-2 text-xs font-medium text-white transition group-hover:bg-brand-forte">
            Abrir AI Suite
          </div>
        </Link>
        <ObrasEmpreendimentosCard />
      </main>
      <ConfigManager />
    </>
  );
}
