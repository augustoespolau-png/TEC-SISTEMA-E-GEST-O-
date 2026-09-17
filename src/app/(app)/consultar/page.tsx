import { exigirAcesso } from "@/lib/acesso-server";
import { pode } from "@/lib/permissoes";
import TelaConsultar from "@/components/TelaConsultar";

export default async function ConsultarPage() {
  const acesso = await exigirAcesso("AUDITORIA", "ver");

  return (
    <TelaConsultar
      role={pode(acesso.permissoes, "AUDITORIA", "editar") ? "gestao" : "consultor"}
    />
  );
}
