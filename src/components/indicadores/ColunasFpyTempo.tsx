"use client";

import type { CSSProperties } from "react";
import type { CampoRecorte } from "@/lib/dashboard";
import type { FpyNoTempo } from "@/lib/indicadores";
import { LinhaFpyTempo } from "./Graficos";
import { opacidadeDaMarca, type Clicavel } from "./clique";
import { useTamanho } from "./medir";
import { nBR, Vazio } from "./Pecas";

const ALTURA_PADRAO = 165;
const FONTE_EIXO = 11;
const FONTE_VALOR = 12;
const RAIO_TOPO = 6;

type PontoSvg = { x: number; y: number };

function caminhoReto(pontos: PontoSvg[]) {
  return pontos
    .map(
      (ponto, indice) =>
        `${indice === 0 ? "M" : "L"}${ponto.x.toFixed(1)},${ponto.y.toFixed(1)}`
    )
    .join(" ");
}

function caminhoBarra(
  centroX: number,
  topoY: number,
  baseY: number,
  largura: number
) {
  const esquerda = centroX - largura / 2;
  const direita = centroX + largura / 2;
  const altura = Math.max(1, baseY - topoY);
  const raio = Math.min(RAIO_TOPO, largura / 2, altura / 2);

  return [
    `M${esquerda.toFixed(1)},${baseY.toFixed(1)}`,
    `L${esquerda.toFixed(1)},${(topoY + raio).toFixed(1)}`,
    `Q${esquerda.toFixed(1)},${topoY.toFixed(1)} ${(esquerda + raio).toFixed(1)},${topoY.toFixed(1)}`,
    `L${(direita - raio).toFixed(1)},${topoY.toFixed(1)}`,
    `Q${direita.toFixed(1)},${topoY.toFixed(1)} ${direita.toFixed(1)},${(topoY + raio).toFixed(1)}`,
    `L${direita.toFixed(1)},${baseY.toFixed(1)}`,
    "Z",
  ].join(" ");
}

/**
 * Dia permanece no padrão histórico (linha + área). Semana usa o Pareto
 * executivo: barras finas, topo arredondado e linha nítida acima das barras.
 */
export default function ColunasFpyTempo({
  pontos,
  meta,
  unidade,
  aoRecortar,
  aceso,
}: {
  pontos: FpyNoTempo[];
  meta: number;
  unidade: "dia" | "semana";
} & Clicavel) {
  const [ref, tamanho] = useTamanho<HTMLDivElement>();

  if (unidade === "dia") {
    return (
      <LinhaFpyTempo
        pontos={pontos}
        meta={meta}
        unidade="dia"
        aoRecortar={aoRecortar}
        aceso={aceso}
      />
    );
  }

  if (!pontos.length) {
    return <Vazio>Nenhuma parede conferida no período.</Vazio>;
  }

  const campo: CampoRecorte = "semanaMes";
  const algumAceso = !!aceso && pontos.some((ponto) => aceso(campo, ponto.chave));
  const caixa = tamanho.largura;
  const altura = Math.max(128, tamanho.altura || ALTURA_PADRAO);

  // Margens maiores impedem corte do primeiro/último ponto e dos valores.
  const margem = { topo: 28, dir: 24, base: 30, esq: 24 };
  const passoMinimo = 112;
  const largura = caixa
    ? Math.max(caixa, margem.esq + margem.dir + pontos.length * passoMinimo)
    : 0;
  const areaUtil = Math.max(1, largura - margem.esq - margem.dir);
  const passo = areaUtil / pontos.length;
  const areaAltura = Math.max(1, altura - margem.topo - margem.base);
  const x = (indice: number) => margem.esq + (indice + 0.5) * passo;
  const y = (valor: number) =>
    margem.topo +
    areaAltura -
    (Math.max(0, Math.min(100, valor)) / 100) * areaAltura;
  const base = y(0);
  const larguraBarra = Math.max(20, Math.min(36, passo * 0.25));

  const corDoValor = (fpy: number) =>
    fpy === 0
      ? "var(--color-alta)"
      : fpy >= meta
        ? "var(--color-brand)"
        : "var(--color-media)";

  const pontosDaLinha = pontos.map((ponto, indice) => ({
    x: x(indice),
    y: y(ponto.fpy),
  }));
  const linha = caminhoReto(pontosDaLinha);

  return (
    <div
      ref={ref}
      className="ind-caixa-grafico"
      style={
        {
          "--alt-padrao": `${ALTURA_PADRAO}px`,
          overflowX: "auto",
          overflowY: "hidden",
        } as CSSProperties
      }
    >
      {largura > 0 && (
        <svg
          key={`semana:${pontos.map((p) => `${p.chave}:${p.fpy}:${p.conferidas}`).join("|")}`}
          width={largura}
          height={altura}
          role="img"
          aria-label={`FPY por semana, ${pontos.length} ${pontos.length === 1 ? "período" : "períodos"}, meta ${meta}%`}
        >
          {[0, 50, 100].map((valor) => (
            <line
              key={valor}
              className="ind-malha"
              x1={margem.esq}
              x2={largura - margem.dir}
              y1={y(valor)}
              y2={y(valor)}
              pointerEvents="none"
            />
          ))}

          <line
            x1={margem.esq}
            x2={largura - margem.dir}
            y1={y(meta)}
            y2={y(meta)}
            stroke="var(--color-ink-2)"
            strokeWidth={1.15}
            strokeDasharray="5 5"
            opacity={0.72}
            pointerEvents="none"
          >
            <title>{`Meta ${meta}%`}</title>
          </line>

          {pontos.map((ponto, indice) => {
            const cor = corDoValor(ponto.fpy);
            const estaAceso = !!aceso && aceso(campo, ponto.chave);
            const barraAtiva = estaAceso
              ? Math.min(42, passo * 0.32)
              : larguraBarra;
            const alturaBarra = Math.max(2, base - y(ponto.fpy));
            const topoBarra = base - alturaBarra;
            const dica =
              `${ponto.rotuloLongo ?? ponto.rotulo}: FPY ${ponto.fpy}% — ` +
              `${nBR(ponto.limpas)} de ${nBR(ponto.conferidas)} paredes passaram de primeira`;

            return (
              <g
                key={ponto.chave}
                className={`ind-alvo${aoRecortar ? " ind-clicavel" : ""}`}
                opacity={opacidadeDaMarca(algumAceso, estaAceso)}
              >
                {estaAceso && (
                  <rect
                    x={x(indice) - passo / 2 + 9}
                    y={margem.topo}
                    width={Math.max(1, passo - 18)}
                    height={areaAltura}
                    rx={8}
                    fill={cor}
                    opacity={0.05}
                    pointerEvents="none"
                  />
                )}

                <rect
                  x={x(indice) - passo / 2}
                  y={margem.topo}
                  width={passo}
                  height={areaAltura}
                  fill="transparent"
                  onClick={aoRecortar && (() => aoRecortar(campo, ponto.chave))}
                  role={aoRecortar ? "button" : undefined}
                  aria-pressed={aoRecortar ? estaAceso : undefined}
                >
                  <title>
                    {dica +
                      (aoRecortar
                        ? estaAceso
                          ? " · clique para tirar o recorte"
                          : " · clique para filtrar esta semana"
                        : "")}
                  </title>
                </rect>

                <path
                  d={caminhoBarra(x(indice), topoBarra, base, barraAtiva)}
                  fill={cor}
                  opacity={0.94}
                  stroke={estaAceso ? "var(--color-papel)" : "none"}
                  strokeWidth={estaAceso ? 2 : 0}
                  pointerEvents="none"
                />

                <text
                  className="ind-eixo"
                  x={x(indice)}
                  y={altura - 7}
                  textAnchor="middle"
                  style={{ fontSize: FONTE_EIXO }}
                  pointerEvents="none"
                >
                  {ponto.rotulo}
                </text>
              </g>
            );
          })}

          {/* Linha sempre depois das barras para manter sobreposição perfeita. */}
          {pontos.length > 1 && (
            <path
              d={linha}
              fill="none"
              stroke="var(--color-papel)"
              strokeWidth={4}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.58}
              pointerEvents="none"
            />
          )}
          {pontos.length > 1 && (
            <path
              d={linha}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={algumAceso ? 0.7 : 1}
              pointerEvents="none"
            />
          )}

          {pontos.map((ponto, indice) => {
            const cor = corDoValor(ponto.fpy);
            const estaAceso = !!aceso && aceso(campo, ponto.chave);
            return (
              <g
                key={`linha-${ponto.chave}`}
                opacity={opacidadeDaMarca(algumAceso, estaAceso)}
                pointerEvents="none"
              >
                <circle
                  cx={x(indice)}
                  cy={y(ponto.fpy)}
                  r={estaAceso ? 4.8 : 4}
                  fill={cor}
                  stroke="var(--color-papel)"
                  strokeWidth={1.8}
                />
                <text
                  className="ind-valor-svg"
                  x={x(indice)}
                  y={Math.max(FONTE_VALOR, y(ponto.fpy) - 9)}
                  textAnchor="middle"
                  style={{ fontSize: FONTE_VALOR, fill: cor, fontWeight: 700 }}
                >
                  {ponto.fpy}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
