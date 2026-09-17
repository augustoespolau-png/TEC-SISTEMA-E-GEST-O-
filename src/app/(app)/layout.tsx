import { redirect } from "next/navigation";
import { obterAcessoAtual } from "@/lib/acesso-server";
import TabBar from "@/components/TabBar";
import NavInferior from "@/components/NavInferior";
import IndicadoresAiSlot from "@/components/ai/IndicadoresAiSlot";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const acesso = await obterAcessoAtual();
  if (!acesso.ativo) redirect("/acesso-bloqueado");

  const nome =
    acesso.accessProfile?.full_name ||
    acesso.profile?.nome ||
    acesso.user.email ||
    "";

  // A navegação continua com a mesma estrutura visual. A diferença é que
  // agora a lista de destinos é filtrada pela permissão individual do usuário,
  // e não somente pelo papel legado.
  return (
    <div className="quadro-app">
      <TabBar
        role={acesso.role}
        nome={nome}
        permissoes={acesso.permissoes}
      />
      <div className="conteudo-app">
        {acesso.role === "gestao" && <IndicadoresAiSlot />}
        {children}
      </div>
      <NavInferior role={acesso.role} permissoes={acesso.permissoes} />
    </div>
  );
}
