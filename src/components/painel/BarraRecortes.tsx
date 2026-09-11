import {
  ROTULO_RECORTE,
  formatarData,
  nomeSemanaMes,
  recortesQueNaoAfetamFpy,
  type Recorte,
} from "@/lib/dashboard";
import { ROTULO_STATUS, type Status } from "@/lib/types";

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function valor(r: Recorte): string {
  /* "Semana 2 de agosto" já se explica sozinho; o rótulo do campo é
     que fica curto ("Semana") para não sair "Semana: Semana 2 de..." */
  if (r.campo === "semanaMes") return nomeSemanaMes(r.valor).replace("Semana ", "");
  // o rótulo do campo já diz "Semana de", então aqui vai só a data
  if (r.campo === "semana" || r.campo === "dia") return formatarData(r.valor);
  /* "2026-07" não é como ninguém fala um mês; vira jul/26 */
  if (r.campo === "mes")
    return `${MESES[Number(r.valor.slice(5, 7)) - 1]}/${r.valor.slice(2, 4)}`;
  if (r.campo === "status") return ROTULO_STATUS[r.valor as Status] ?? r.valor;
  return r.valor;
}

/**
 * Os recortes vindos dos cliques nos gráficos, sempre visíveis e sempre
 * removíveis. Nada de filtro invisível: se o número na tela está
 * recortado, o recorte está escrito aqui.
 */
export default function BarraRecortes({
  recortes,
  aoRemover,
  aoLimpar,
  resultado,
}: {
  recortes: Recorte[];
  aoRemover: (r: Recorte) => void;
  aoLimpar: () => void;
  /** quantos erros sobraram no recorte */
  resultado: number;
}) {
  if (recortes.length === 0) return null;
  const semFpy = recortesQueNaoAfetamFpy(recortes);

  return (
    <>
      <span className="text-[11px] tracking-wider text-ink-3 uppercase">
        Recorte
      </span>
      <div className="recortes">
        {recortes.map((r) => (
          <button
            key={`${r.campo}|${r.valor}`}
            className="recorte"
            onClick={() => aoRemover(r)}
            title="Remover este recorte"
          >
            {ROTULO_RECORTE[r.campo]}: {valor(r)}
            <span className="x" aria-hidden>
              ×
            </span>
            <span className="sr-only">remover</span>
          </button>
        ))}
        <button className="btn" onClick={aoLimpar}>
          Limpar tudo
        </button>
      </div>
      <span className="num text-[11px] text-ink-3">
        {resultado} {resultado === 1 ? "desvio" : "desvios"} no recorte
      </span>
      {semFpy.length > 0 && (
        <span className="text-[11px]" style={{ color: "var(--color-media)" }}>
          O FPY ignora{" "}
          {semFpy.map((r) => ROTULO_RECORTE[r.campo].toLowerCase()).join(" e ")}
          : filtrar paredes por isso tiraria do cálculo justamente as que
          passaram sem erro.
        </span>
      )}
    </>
  );
}
