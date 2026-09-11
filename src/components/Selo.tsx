import type { Criticidade, Status } from "@/lib/types";
import { ROTULO_STATUS } from "@/lib/types";

const CLASSE_STATUS: Record<Status, string> = {
  AGUARDANDO: "aguardando",
  RETRABALHO_PENDENTE: "pendaprov",
  RETRABALHO: "retrabalho",
  NAO_CONFORMIDADE: "naoconf",
  BLOQUEADA: "bloqueada",
};

const CLASSE_CRIT: Record<Criticidade, string> = {
  CRITICO: "critica",
  MEDIO: "pendente",
  BAIXO: "ok",
};

export function SeloStatus({ status }: { status: Status }) {
  return (
    <span className={`chip ${CLASSE_STATUS[status]}`}>
      {ROTULO_STATUS[status]}
    </span>
  );
}

export function SeloCriticidade({ criticidade }: { criticidade: Criticidade }) {
  return (
    <span className={`chip ${CLASSE_CRIT[criticidade]}`}>{criticidade}</span>
  );
}
