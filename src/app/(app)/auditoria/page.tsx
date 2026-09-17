import { exigirAcesso } from "@/lib/acesso-server";
import { pode } from "@/lib/permissoes";
import AuditoriaCasa from "@/components/auditoria/AuditoriaCasa";

export default async function AuditoriaPage() {
  const acesso = await exigirAcesso("AUDITORIA", "ver");

  return (
    <AuditoriaCasa
      role={pode(acesso.permissoes, "AUDITORIA", "editar") ? "gestao" : "consultor"}
    />
  );
}
