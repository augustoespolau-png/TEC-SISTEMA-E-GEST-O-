import { exigirAcesso } from "@/lib/acesso-server";
import { pode } from "@/lib/permissoes";
import UsuariosPermissoes from "@/components/usuarios/UsuariosPermissoes";
import { listarUsuariosAction } from "./actions";

export default async function UsuariosPage() {
  const acesso = await exigirAcesso("CADASTROS", "ver");
  const resultado = await listarUsuariosAction();

  return (
    <UsuariosPermissoes
      initialUsers={resultado.ok ? resultado.data : []}
      initialError={resultado.ok ? "" : resultado.error}
      podeEditar={pode(acesso.permissoes, "CADASTROS", "editar")}
    />
  );
}
