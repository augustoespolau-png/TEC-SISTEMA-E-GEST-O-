import type { PontoFluxo } from "@/lib/dashboard";
import CartaoPn, { AguardandoDados, SemDados } from "./CartaoPn";

const ALTURA = 130;
const BASE = ALTURA + 16;

/** Entram × resolvidas por semana: a fábrica está ganhando ou perdendo? */
export default function GraficoFluxo({
  pontos,
  aoFiltrar,
  ativo,
}: {
  pontos: PontoFluxo[];
  aoFiltrar?: (semana: string) => void;
  ativo?: (semana: string) => boolean;
}) {
  const max = Math.max(
    1,
    ...pontos.map((p) => Math.max(p.entraram, p.resolvidas))
  );
  const temResolvidas = pontos.some((p) => p.resolvidas > 0);

  return (
    <CartaoPn
      classe="col-7"
      titulo="Fluxo da fábrica — entram × resolvidas"
      subtitulo="Barras azuis à esquerda são desvios novos; verdes à direita, retrabalhos concluídos na semana"
    >
      {pontos.length === 0 ? (
        <SemDados />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${pontos.length * 60} ${BASE + 18}`}
            width="100%"
            height={ALTURA + 40}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Desvios que entraram e retrabalhos concluídos por semana"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={pontos.length * 60}
                y1={BASE - ALTURA * f}
                y2={BASE - ALTURA * f}
                stroke="var(--color-line)"
                strokeDasharray="3 5"
              />
            ))}
            <line
              x1={0}
              x2={pontos.length * 60}
              y1={BASE}
              y2={BASE}
              stroke="var(--color-line-2)"
            />
            {pontos.map((p, i) => {
              const x = i * 60;
              const he = (p.entraram / max) * ALTURA;
              const hr = (p.resolvidas / max) * ALTURA;
              return (
                <g
                  key={p.semana}
                  className={
                    aoFiltrar
                      ? `col-svg ${ativo?.(p.semana) ? "on" : ""}`
                      : undefined
                  }
                  onClick={aoFiltrar ? () => aoFiltrar(p.semana) : undefined}
                  role={aoFiltrar ? "button" : undefined}
                  tabIndex={aoFiltrar ? 0 : undefined}
                >
                  <title>{`Semana de ${p.rotulo}: ${p.entraram} desvios novos, ${p.resolvidas} retrabalhos concluídos · saldo ${p.saldo > 0 ? "+" : ""}${p.saldo}${aoFiltrar ? " · clique para filtrar esta semana" : ""}`}</title>
                  {aoFiltrar && (
                    <rect
                      className="alvo"
                      x={x + 4}
                      y={0}
                      width={52}
                      height={BASE + 18}
                      rx={4}
                    />
                  )}
                  {p.entraram > 0 && (
                    <rect
                      x={x + 12}
                      y={BASE - he}
                      width={17}
                      height={he}
                      rx={2}
                      fill="var(--color-info)"
                    />
                  )}
                  {p.resolvidas > 0 && (
                    <rect
                      x={x + 31}
                      y={BASE - hr}
                      width={17}
                      height={hr}
                      rx={2}
                      fill="var(--color-baixa)"
                    />
                  )}
                  <text
                    x={x + 30}
                    y={BASE - Math.max(he, hr) - 5}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--color-ink-2)"
                    fontWeight={600}
                  >
                    {p.entraram}
                  </text>
                  <text
                    x={x + 30}
                    y={BASE + 15}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill="var(--color-ink-3)"
                  >
                    {p.rotulo}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="legenda">
            <span>
              <i style={{ background: "var(--color-info)" }} />
              Erros que entraram
            </span>
            <span>
              <i style={{ background: "var(--color-baixa)" }} />
              Retrabalhos concluídos
            </span>
          </div>
          {!temResolvidas && (
            <div className="mt-3">
              <AguardandoDados o_que="A barra verde de retrabalhos concluídos" />
            </div>
          )}
        </>
      )}
    </CartaoPn>
  );
}
