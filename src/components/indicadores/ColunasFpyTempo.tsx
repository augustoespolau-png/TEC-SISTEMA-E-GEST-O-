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
const RAIO_TOPO = 6;

type PontoSvg = { x: number; y: number };

const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.max(minimo, Math.min(maximo, valor));

/**
 * Curva cardinal suavizada, limitada entre os dois pontos de cada trecho.
 * O efeito é equivalente visual ao "monotone" de bibliotecas de chart:
 * mantém continuidade e suavidade sem criar picos artificiais acima ou
 * abaixo dos valores reais.
 */
function caminhoSuave(pontos: PontoSvg[]) {
  if (!pontos.length) return "";
  if (pontos.length === 1) return `M${pontos[0].x},${pontos[0].y}`;
  if (pontos.length === 2) {
    return `M${pontos[0].x},${pontos[0].y} L${pontos[1].x},${pontos[1].y}`;
  }

  let caminho = `M${pontos[0].x.toFixed(1)},${pontos[0].y.toFixed(1)}`;

  for (let i = 0; i < pontos.length - 1; i += 1) {
    const p0 = pontos[Math.max(0, i - 1)];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[Math.min(pontos.length - 1, i + 2)];

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = limitar(p1.y + (p2.y - p0.y) / 6, minY, maxY);
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = limitar(p2.y - (p3.y - p1.y) / 6, minY, maxY);

    caminho += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }

  return caminho;
}

/** Barra com arredondamento SOMENTE nos cantos superiores. */
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
 * FPY temporal em gráfico combinado (barra + linha), no estilo Pareto.
 * Barras enxutas para leitura executiva; linha suavizada renderizada por
 * último para ficar sempre acima das colunas.
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

  // Mais respiro entre categorias, especialmente no Pareto semanal.
  const passoMinimo = Math.max(
    unidade === "semana" ? 96 : 64,
    maiorRotulo * FONTE_EIXO * 0.62 + 22,
    maiorValor * FONTE_VALOR * 0.68 + 26
  );

  const caixa = tamanho.largura;
  const alturaMedida = tamanho.altura || ALTURA_PADRAO;
  const altura = Math.max(120, alturaMedida);
  const margem = { topo: 26, dir: 14, base: 28, esq: 14 };
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

  const larguraMaxima = unidade === "semana" ? 34 : 30;
  const larguraBarra = Math.max(14, Math.min(larguraMaxima, passo * 0.34));

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
  const caminhoLinha = caminhoSuave(pontosDaLinha);

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
            strokeWidth={1.25}
            strokeDasharray="5 5"
            opacity={0.78}
            pointerEvents="none"
          >
            <title>{`Meta ${meta}%`}</title>
          </line>

          {/* Barras e alvos vêm primeiro: a linha é desenhada por último. */}
          {pontos.map((ponto, indice) => {
            const cor = corDoValor(ponto.fpy);
            const estaAceso = !!aceso && aceso(campo, ponto.chave);
            const barraAtiva = estaAceso
              ? Math.min(larguraMaxima + 6, passo * 0.42)
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
                    x={x(indice) - passo / 2 + 7}
                    y={margem.topo}
                    width={Math.max(1, passo - 14)}
                    height={areaAltura}
                    rx={8}
                    fill={cor}
                    opacity={0.055}
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

                <path
                  d={caminhoBarra(x(indice), topoBarra, base, barraAtiva)}
                  fill={cor}
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

          {/* Linha por ÚLTIMO: halo discreto + traço principal suavizado. */}
          {pontos.length > 1 && (
            <path
              d={caminhoLinha}
              fill="none"
              stroke="var(--color-papel)"
              strokeWidth={5.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
              opacity={algumAceso ? 0.48 : 0.82}
            />
          )}
          {pontos.length > 1 && (
            <path
              d={caminhoLinha}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth={2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
              opacity={algumAceso ? 0.68 : 1}
            />
          )}

          {/* Dots e valores pertencem à camada da linha e fecham o SVG. */}
          {pontos.map((ponto, indice) => {
            const cor = corDoValor(ponto.fpy);
            const estaAceso = !!aceso && aceso(campo, ponto.chave);
            const raio = estaAceso ? 4.8 : 4;
            return (
              <g
                key={`topo-${ponto.chave}`}
                opacity={opacidadeDaMarca(algumAceso, estaAceso)}
                pointerEvents="none"
              >
                <circle
                  cx={x(indice)}
                  cy={y(ponto.fpy)}
                  r={raio}
                  fill={cor}
                  stroke="var(--color-papel)"
                  strokeWidth={2}
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
