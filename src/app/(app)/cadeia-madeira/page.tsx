import { redirect } from "next/navigation";
import CadeiaMadeira from "@/components/cadeia-madeira/CadeiaMadeira";
import { loadCadeiaMadeiraSnapshot } from "@/app/actions/cadeiaMadeira";
import { canModule } from "@/lib/governanca-types";
import { snapshotCadeiaVazio } from "@/lib/cadeiaMadeira";
import { getAuthContext, isAccountInactive } from "@/lib/supabase/auth";

export default async function CadeiaMadeiraPage() {
  const contexto = await getAuthContext();
  if (!contexto) redirect("/login");
  if (!contexto.profile || isAccountInactive(contexto.profile)) {
    redirect("/acesso-negado");
  }
  if (!canModule(contexto.permissions, "CADEIA_MADEIRA", "ver")) {
    redirect("/acesso-negado");
  }

  const result = await loadCadeiaMadeiraSnapshot(1);
  return (
    <CadeiaMadeira
      initialSnapshot={result.ok ? result.data : snapshotCadeiaVazio()}
      initialError={result.ok ? undefined : result.error}
      canEdit={canModule(contexto.permissions, "CADEIA_MADEIRA", "editar")}
      canManage={canModule(contexto.permissions, "CADEIA_MADEIRA", "gerenciar")}
    />
  );
}
