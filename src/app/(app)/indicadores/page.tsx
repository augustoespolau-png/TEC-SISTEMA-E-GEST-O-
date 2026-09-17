import { exigirAcesso } from "@/lib/acesso-server";
import Indicadores from "@/components/indicadores/Indicadores";
import IndicadoresSincronizacao from "@/components/indicadores/IndicadoresSincronizacao";

export default async function IndicadoresPage() {
  const acesso = await exigirAcesso("INDICADORES", "ver");

  return (
    <>
      <IndicadoresSincronizacao />
      <Indicadores role={acesso.role === "operador" ? "operador" : "consultor"} />
    </>
  );
}
