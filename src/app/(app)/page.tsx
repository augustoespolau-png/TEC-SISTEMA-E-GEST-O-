import { redirect } from "next/navigation";
import { obterAcessoAtual } from "@/lib/acesso-server";
import { primeiraRotaPermitida } from "@/lib/permissoes";

export default async function Entrada() {
  const acesso = await obterAcessoAtual();

  if (!acesso.ativo) redirect("/acesso-bloqueado");
  redirect(primeiraRotaPermitida(acesso.permissoes));
}
