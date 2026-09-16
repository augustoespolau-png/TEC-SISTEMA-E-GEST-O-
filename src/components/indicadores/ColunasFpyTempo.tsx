"use client";

import type { CSSProperties } from "react";
import type { CampoRecorte } from "@/lib/dashboard";
import type { FpyNoTempo } from "@/lib/indicadores";
import { opacidadeDaMarca, type Clicavel } from "./clique";
import { useTamanho } from "./medir";
import { nBR, Vazio } from "./Pecas";

const ALTURA_PADRAO = 165;
const FONTE_EIXO = 11;
const FONTE_VALOR = 12;
const LARGURA_BARRA_MAX = 38;

/**
 * FPY temporal em gráfico combinado (barra + linha), no estilo Pareto.
 *
 * A barra responde pela comparação do valor absoluto de cada período e
 * a linha mostra a tendência conectando exatamente o topo das barras.
 * Não existe preenchimento de área: o fundo permanece limpo e segue o
 * mesmo vocabulário visual do FPY por Casa.
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

  if (!pontos.length) {
    return <Vazio>Nenhuma parede conferida no período.</Vazio>;
  }

  const campo: CampoRecorte = unidade === "semana" ? "semanaMes" : "dia";
  const algumAceso = !!aceso && pontos.some((p) => aceso(campo, p.chave));

  const maiorRotulo = pontos.reduce(
    (maior, ponto) => Math.max(maior, ponto.rotulo.length),
    1
  );
  const maiorValor = pontos.reduce(
    (maior, ponto) => Math.max(maior, String(ponto.fpy).length),
    1
  );
  const passoMinimo = Math.max(
    unidade === "semana" ? 74 : 56,
    maiorRotulo * FONTE_EIXO * 0.62 + 16,
    maiorValor * FONTE_VALOR * 0.68 + 22
  );

  const caixa = tamanho.largura;
  const alturaMedida = tamanho.altura || ALTURA_PADRAO;
  const altura = Math.max(120, alturaMedida);
  const margem = { topo: 24, dir: 12, base: 27, esq: 12 };
  const largura = caixa
    ? Math.max(caixa, margem.esq + margem.dir + pontos.length * passoMinimo)
    : 0;
  const areaUtil = Math.max(1, largura - margem.esq - margem.dir);
  const passo = Math.max(1, areaUtil / pontos.length);
  const areaAltura = Math.max(1, altura - margem.topo - margem.base);
  const x = (indice: number) => margem.esq + (indice + 0.5) * passo;
  const y = (valor: number) =>
    margem.topo +
    areaAltura -
    (Math.max(0, Math.min(100, valor)) / 100) * areaAltura;
  const base = y(0);
  const larguraBarra = Math.max(16, Math.min(LARGURA_BARRA_MAX, passo * 0.52));

  const corDoValor = (fpy: number) =>
    fpy === 0
      ? "var(--color-alta)"
      : fpy >= meta
        ? "var(--color-brand)"
        : "var(--color-media)";

  const caminhoLinha = pontos
    .map((ponto, indice) =>
      `${indice === 0 ? "M" : "L"}${x(indice).toFixed(1)},${y(ponto.fpy).toFixed(1)}`
    )
    .join(" ");

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
          key={`${unidade}:${pontos.map((p) => `${p.chave}:${p.fpy}:${p.conferidas}`).join("|")}`}
          width={largura}
          height={altura}
          role="img"
          aria-label={`FPY por ${unidade}, ${pontos.length} ${pontos.length === 1 ? "período" : "períodos"}, meta ${meta}%`}
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
            strokeWidth={1.4}
            strokeDasharray="5 4"
            opacity={0.9}
            pointerEvents="none"
          >
            <title>{`Meta ${meta}%`}</title>
          </line>

          {pontos.map((ponto, indice) => {
            const cor = corDoValor(ponto.fpy);
            const estaAceso = !!aceso && aceso(campo, ponto.chave);
            const barraAtiva = estaAceso
              ? Math.min(LARGURA_BARRA_MAX + 8, passo * 0.68)
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
                    x={x(indice) - passo / 2 + 3}
                    y={margem.topo}
                    width={Math.max(1, passo - 6)}
                    height={areaAltura}
                    rx={5}
                    fill={cor}
                    opacity={0.08}
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
                          : ` · clique para filtrar esta ${unidade}`
                        : "")}
                  </title>
                </rect>

                <rect
                  x={x(indice) - barraAtiva / 2}
                  y={topoBarra}
                  width={barraAtiva}
                  height={alturaBarra}
                  rx={Math.min(3, barraAtiva / 2)}
                  fill={cor}
                  stroke={estaAceso ? "var(--color-papel)" : "none"}
                  strokeWidth={estaAceso ? 2 : 0}
                  pointerEvents="none"
                />
              </g>
            );
          })}

          {/* Halo na cor do papel separa a linha dos topos das barras. */}
          {pontos.length > 1 && (
            <path
              d={caminhoLinha}
              fill="none"
              stroke="var(--color-papel)"
              strokeWidth={5}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
              opacity={algumAceso ? 0.55 : 0.9}
            />
          )}
          {pontos.length > 1 && (
            <path
              d={caminhoLinha}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
              opacity={algumAceso ? 0.6 : 1}
            />
          )}

          {pontos.map((ponto, indice) => {
            const cor = corDoValor(ponto.fpy);
            const estaAceso = !!aceso && aceso(campo, ponto.chave);
            return (
              <g
                key={`topo-${ponto.chave}`}
                opacity={opacidadeDaMarca(algumAceso, estaAceso)}
                pointerEvents="none"
              >
                <circle
                  cx={x(indice)}
                  cy={y(ponto.fpy)}
                  r={estaAceso ? 5 : 4}
                  fill={cor}
                  stroke="var(--color-papel)"
                  strokeWidth={1.5}
                />
                <text
                  className="ind-valor-svg"
                  x={x(indice)}
                  y={Math.max(FONTE_VALOR, y(ponto.fpy) - 8)}
                  textAnchor="middle"
                  style={{ fontSize: FONTE_VALOR, fill: cor, fontWeight: 700 }}
                >
                  {ponto.fpy}
                </text>
                <text
                  className="ind-eixo"
                  x={x(indice)}
                  y={altura - 7}
                  textAnchor="middle"
                  style={{ fontSize: FONTE_EIXO }}
                >
                  {ponto.rotulo}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
