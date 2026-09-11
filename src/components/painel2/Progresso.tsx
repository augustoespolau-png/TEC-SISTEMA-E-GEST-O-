"use client";

import {
  EXPLICACAO_ESTADO,
  ROTULO_ESTADO,
  type EstadoParede,
  type ResumoProjeto,
} from "@/lib/painel2";
import { Dica } from "@/components/painel/Interativo";
import { ORDEM_ESTADOS, fundoEstado } from "./estados";

/**
 * "Quanto deste projeto já foi executado" numa barra só.
 *
 * A unidade é a parede conferida, então as quatro faixas somam o total —
 * não há sobra nem dupla contagem. Cada faixa abre o relatório dos erros
 * que estão por trás dela.
 */
export default function Progresso({
  r,
  aoEscolher,
  estadoAtivo,
}: {
  r: ResumoProjeto;
  aoEscolher: (e: EstadoParede) => void;
  estadoAtivo?: EstadoParede;
}) {
  const valor: Record<EstadoParede, number> = {
    ACEITA: r.aceitas,
    RETRABALHADA: r.retrabalhadas,
    AGUARDA_APROVACAO: r.aguardando,
    EM_RETRABALHO: r.emRetrabalho,
  };

  if (r.conferidas === 0)
    return (
      <section className="cartao">
        <h2>Execução do projeto</h2>
        <p className="sub">
          Nenhuma parede conferida neste recorte. O progresso vem das
          auditorias: é lá que o sistema fica sabendo quais paredes foram
          olhadas e quais passaram.
        </p>
      </section>
    );

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2>Execução do projeto</h2>
          <p className="sub">
            {r.conferidas} paredes conferidas em {r.casas}{" "}
            {r.casas === 1 ? "casa" : "casas"} · {r.casasConcluidas} casa
            {r.casasConcluidas === 1 ? "" : "s"} sem nenhuma pendência
          </p>
        </div>
        <div className="text-right">
          <div
            className="mono leading-none font-black"
            style={{ fontSize: 34, color: "var(--color-baixa)" }}
          >
            {r.pctConcluido}
            <span style={{ fontSize: 17 }}>%</span>
          </div>
          <div className="text-[11px] text-ink-3">concluído</div>
        </div>
      </div>

      <div className="corpo">
        {/* a barra: cada faixa é proporcional e clicável */}
        <div className="barra-estados">
          {ORDEM_ESTADOS.filter((e) => valor[e] > 0).map((e) => {
            const pct = Math.round((valor[e] / r.conferidas) * 100);
            return (
              <button
                key={e}
                onClick={() => aoEscolher(e)}
                aria-pressed={estadoAtivo === e}
                className={`dica-alvo faixa ${estadoAtivo === e ? "on" : ""}`}
                style={{ flexGrow: valor[e], background: fundoEstado(e) }}
                title={`${ROTULO_ESTADO[e]}: ${valor[e]} de ${r.conferidas} paredes (${pct}%)`}
              >
                {pct >= 8 && <span className="mono faixa-num">{valor[e]}</span>}
                <Dica lado={e === "EM_RETRABALHO" ? "dir" : "esq"}>
                  <b>{ROTULO_ESTADO[e]}</b>
                  <br />
                  {valor[e]} de {r.conferidas} paredes · {pct}%
                  <br />
                  {EXPLICACAO_ESTADO[e]}
                  <br />
                  Clique para ver os erros.
                </Dica>
              </button>
            );
          })}
        </div>

        <div className="legenda mt-3">
          {ORDEM_ESTADOS.map((e) => (
            <span key={e}>
              <i style={{ background: fundoEstado(e) }} />
              {ROTULO_ESTADO[e]}
              <b className="mono ml-1">{valor[e]}</b>
            </span>
          ))}
        </div>

        <p className="sub" style={{ marginTop: 12 }}>
          Concluído conta só o que está resolvido de verdade: parede aceita de
          primeira ou retrabalhada <b>com aprovação</b>. A faixa listrada é
          retrabalho feito e ainda não aprovado — está fora dos{" "}
          {r.pctConcluido}% de propósito.
          {r.reconstruidas > 0 && (
            <>
              {" "}
              {r.reconstruidas} destas paredes vêm de auditoria reconstruída do
              histórico da planilha: é referência, não medição.
            </>
          )}
        </p>
      </div>
    </section>
  );
}
