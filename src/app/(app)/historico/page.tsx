import { exigirAcesso } from "@/lib/acesso-server";
import TelaHistorico from "@/components/TelaHistorico";

export default async function HistoricoPage() {
  await exigirAcesso("HISTÓRICO", "ver");
  return <TelaHistorico />;
}
