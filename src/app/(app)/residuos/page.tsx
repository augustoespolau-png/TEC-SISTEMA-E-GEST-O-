import { redirect } from "next/navigation";
import Residuos from "@/components/residuos/Residuos";
import { loadResiduosSnapshot } from "@/app/actions/residuos";
import { canModule } from "@/lib/governanca-types";
import { getAuthContext, isAccountInactive } from "@/lib/supabase/auth";
import { snapshotVazio } from "@/lib/residuos";

export default async function ResiduosPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (!contexto.profile || isAccountInactive(contexto.profile)) {
    redirect("/acesso-negado");
  }
  if (!canModule(contexto.permissions, "RESÍDUOS", "ver")) {
    redirect("/acesso-negado");
  }

  const result = await loadResiduosSnapshot({ page: 1 });
  return (
    <Residuos
      initialSnapshot={result.ok ? result.data : snapshotVazio()}
      initialError={result.ok ? undefined : result.error}
      canEdit={canModule(contexto.permissions, "RESÍDUOS", "editar")}
    />
  );
}
