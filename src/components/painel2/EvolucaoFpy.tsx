"use client";

import { formatarData } from "@/lib/dashboard";
import { META, type PontoCasa, type SemanaFpy } from "@/lib/painel2";
import { corDoFpy } from "./estados";

const ALTURA = 128;
const PASSO = 46;

/**
 * O FPY no tempo, em duas leituras que se completam:
 * a semana (a tendência) e a casa (a dispersão dentro da semana).
 *
 * A linha por casa é a que a diretoria lê para achar a casa que puxou a
 * semana para baixo — média de semana esconde isso.
 */
export default function EvolucaoFpy({
  semanas,
  casas,
  casaAtiva,
  aoEscolherCasa,
}: {
  semanas: SemanaFpy[];
  casas: PontoCasa[];
  casaAtiva?: string;
  aoEscolherCasa: (casa: string) => void;
}) {
  if (casas.length === 0)
    return (
      <section className="cartao">
        <h2>Evolução do FPY</h2>
        <p className="sub">Nenhuma casa auditada neste recorte.</p>
      </section>
    );

  const largura = Math.max(casas.length * PASSO, 300);
  const y = (fpy: number) => ALTURA - (fpy / 100) * ALTURA + 8;
  const x = (i: number) => i * PASSO + PASSO / 2;
  const linha = casas.map((c, i) => `${x(i)},${y(c.fpy)}`).join(" ");

  // faixas de semana no fundo, para ler a casa dentro da semana dela
  const faixas: { semana: string; de: number; ate: number; rotulo: string }[] =
    [];
  casas.forEach((c, i) => {
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima.semana === c.semana) ultima.ate = i;
    else
      faixas.push({
        semana: c.semana,
        de: i,
        ate: i,
        rotulo: formatarData(c.semana).slice(0, 5),
      });
  });

  return (
    <section className="cartao">
      <h2>Evolução do FPY</h2>
      <p className="sub">
        Cada ponto é uma casa, na ordem em que foi auditada. A linha
        tracejada é a meta de {META.fpy}%.
      </p>

      <div className="corpo">
        {/* semana a semana */}
        {semanas.length > 1 && (
          <div className="semanas-fpy">
            {semanas.map((s) => (
              <div key={s.semana} className="semana-cartao">
                <div className="semana-topo">
                  Semana de {s.rotulo}
                  <span className="semana-casas">
                    {s.primeiraCasa === s.ultimaCasa
                      ? `casa ${s.primeiraCasa}`
                      : `casas ${s.primeiraCasa} a ${s.ultimaCasa}`}
                  </span>
                </div>
                <div className="semana-nums">
                  <span>
                    <b className="mono" style={{ color: corDoFpy(s.fpy) }}>
                      {s.fpy}%
                    </b>
                    <i>FPY</i>
                  </span>
                  <span>
                    <b className="mono">{s.casas}</b>
                    <i>casas</i>
                  </span>
                  <span>
                    <b className="mono" style={{ color: "var(--color-alta)" }}>
                      {s.retrabalhos}
                    </b>
                    <i>retrabalhos</i>
                  </span>
                </div>
                <div
                  className="semana-status"
                  style={{
                    color: s.naMeta ? "var(--color-baixa)" : "var(--color-media)",
                  }}
                >
                  {s.naMeta ? "dentro da meta" : "abaixo da meta"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* casa a casa */}
        <div className="rolagem mt-4">
          <svg
            viewBox={`0 0 ${largura} ${ALTURA + 46}`}
            width={largura}
            height={ALTURA + 46}
            role="img"
            aria-label="FPY de cada casa auditada, em ordem cronológica"
          >
            {faixas.map((f, i) => (
              <rect
                key={f.semana}
                x={f.de * PASSO}
                y={0}
                width={(f.ate - f.de + 1) * PASSO}
                height={ALTURA + 16}
                fill={
                  i % 2 === 0
                    ? "color-mix(in srgb, var(--color-ink-3) 7%, transparent)"
                    : "transparent"
                }
              />
            ))}
            {[0, 50, 100].map((v) => (
              <line
                key={v}
                x1={0}
                x2={largura}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--color-line)"
              />
            ))}
            <line
              x1={0}
              x2={largura}
              y1={y(META.fpy)}
              y2={y(META.fpy)}
              stroke="var(--color-baixa)"
              strokeDasharray="5 4"
            />
            <polyline
              points={linha}
              fill="none"
              stroke="var(--color-info)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {casas.map((c, i) => (
              <g
                key={c.casa}
                className="col-svg"
                onClick={() => aoEscolherCasa(c.casa)}
                role="button"
                tabIndex={0}
              >
                <title>{`Casa ${c.casa} · auditada em ${formatarData(c.data)} · FPY ${c.fpy}% (${c.conferidas} paredes, ${c.erros} erros)`}</title>
                <rect
                  className="alvo"
                  x={i * PASSO}
                  y={0}
                  width={PASSO}
                  height={ALTURA + 46}
                />
                <circle
                  cx={x(i)}
                  cy={y(c.fpy)}
                  r={casaAtiva === c.casa ? 6 : 4}
                  fill={corDoFpy(c.fpy)}
                  stroke="var(--color-papel)"
                  strokeWidth={2}
                />
                <text
                  x={x(i)}
                  y={y(c.fpy) - 10}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={700}
                  fill="var(--color-ink-2)"
                >
                  {c.fpy}
                </text>
                <text
                  x={x(i)}
                  y={ALTURA + 30}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--color-ink-3)"
                >
                  {c.casa}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <p className="sub" style={{ marginTop: 10 }}>
          O fundo alterna a cada semana. Toque numa casa para filtrar o painel
          por ela.
        </p>
      </div>
    </section>
  );
}
