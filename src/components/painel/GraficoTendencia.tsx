import type { PontoSemana } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";

const ALTURA = 130;
const BASE = ALTURA + 16;
const PASSO = 54;

/** Volume semanal empilhado por criticidade. */
export default function GraficoTendencia({
  pontos,
  aoFiltrar,
  ativo,
}: {
  pontos: PontoSemana[];
  /** o valor do recorte é a segunda-feira da semana (YYYY-MM-DD) */
  aoFiltrar?: (semana: string) => void;
  ativo?: (semana: string) => boolean;
}) {
  const max = Math.max(1, ...pontos.map((p) => p.total));

  return (
    <CartaoPn
      classe="col-7"
      titulo="Desvios por semana × criticidade"
      subtitulo="O volume pode cair enquanto os críticos sobem — aqui isso aparece"
    >
      {pontos.length === 0 ? (
        <SemDados />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${pontos.length * PASSO} ${BASE + 18}`}
            width="100%"
            height={ALTURA + 40}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Desvios por semana empilhados por criticidade"
          >
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={pontos.length * PASSO}
                y1={BASE - ALTURA * f}
                y2={BASE - ALTURA * f}
                stroke="var(--color-line)"
                strokeDasharray="3 5"
              />
            ))}
            <line
              x1={0}
              x2={pontos.length * PASSO}
              y1={BASE}
              y2={BASE}
              stroke="var(--color-line-2)"
            />
            {pontos.map((p, i) => {
              const x = i * PASSO + PASSO / 2 - 13;
              const segs = [
                { v: p.porCrit.BAIXO, c: "var(--color-baixa)" },
                { v: p.porCrit.MEDIO, c: "var(--color-media)" },
                { v: p.porCrit.CRITICO, c: "var(--color-alta)" },
              ];
              let y = BASE;
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
                  <title>{`Semana de ${p.rotulo}: ${p.total} desvios — ${p.porCrit.CRITICO} críticos, ${p.porCrit.MEDIO} médios, ${p.porCrit.BAIXO} baixos${aoFiltrar ? " · clique para filtrar esta semana" : ""}`}</title>
                  {/* alvo de clique e realce: cobre a coluna inteira */}
                  {aoFiltrar && (
                    <rect
                      className="alvo"
                      x={i * PASSO + 1}
                      y={0}
                      width={PASSO - 2}
                      height={BASE + 18}
                      rx={4}
                    />
                  )}
                  {segs.map((s, j) => {
                    if (s.v === 0) return null;
                    const h = Math.max(2, (s.v / max) * ALTURA - 2);
                    y -= h + 2;
                    return (
                      <rect
                        key={j}
                        x={x}
                        y={y + 2}
                        width={26}
                        height={h}
                        rx={2}
                        fill={s.c}
                      />
                    );
                  })}
                  <text
                    x={x + 13}
                    y={y - 3}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={600}
                    fill="var(--color-ink-2)"
                  >
                    {p.total}
                  </text>
                  <text
                    x={x + 13}
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
              <i style={{ background: "var(--color-alta)" }} />
              Crítico
            </span>
            <span>
              <i style={{ background: "var(--color-media)" }} />
              Médio
            </span>
            <span>
              <i style={{ background: "var(--color-baixa)" }} />
              Baixo
            </span>
          </div>
          {aoFiltrar && (
            <p className="sub" style={{ marginTop: 8 }}>
              Toque numa semana para filtrar o painel por ela.
            </p>
          )}
        </>
      )}
    </CartaoPn>
  );
}
