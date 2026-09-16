"use client";

import type { CampoRecorte } from "@/lib/dashboard";
import type { FpyNoTempo } from "@/lib/indicadores";
import { opacidadeDaMarca, type Clicavel } from "./clique";
import { useTamanho } from "./medir";
import { nBR, Vazio } from "./Pecas";

const ALTURA_PADRAO = 165;
const FONTE_EIXO = 11;
const FONTE_VALOR = 12;
const MAX_BARRA = 38;
const MAX_BARRA_ATIVA = 46;

/**
 * FPY por dia/semana em colunas verticais.
 *
 * Regra estrutural: independentemente da quantidade de pontos, este
 * componente NUNCA troca para linha/círculo. Um período único continua
 * sendo uma coluna vertical centralizada, com valor no topo e rótulo na
 * base. Para 2 ou 3 pontos, o conjunto fica centralizado e não se espalha
 * artificialmente por todo o card.
 *
 * Em séries longas, cada período mantém uma largura mínima e o container
 * passa a rolar horizontalmente. Isso evita sobreposição de rótulos e
 * preserva o mesmo vocabulário visual do FPY por Casa em qualquer filtro.
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
  const poucosDados = pontos.length <= 3;

  const maiorRotulo = pontos.reduce(
    (maior, p) => Math.max(maior, p.rotulo.length),
    1
  );
  const passoMinimo = Math.max(
    unidade === "semana" ? 58 : 46,
    maiorRotulo * FONTE_EIXO * 0.62 + 14
  );

  const caixa = tamanho.largura;
  const medidaAltura = tamanho.altura || ALTURA_PADRAO;
  const altura = Math.max(120, medidaAltura);
  const margem = { topo: 23, dir: 12, base: 25, esq: 12 };
  const largura = caixa
    ? Math.max(caixa, margem.esq + margem.dir + pontos.length * passoMinimo)
    : 0;
  const areaUtil = Math.max(1, largura - margem.esq - margem.dir);

  /*
   * Série esparsa: não deixa uma única barra herdar a largura inteira do
   * card. Criamos uma "janela" central de até 360 px e distribuímos nela
   * 1–3 colunas. Assim 1 ponto nasce exatamente no centro e 2/3 pontos
   * continuam visualmente próximos, sem parecerem uma linha temporal
   * incompleta esticada de uma borda à outra.
   */
  const larguraGrupo = poucosDados
    ? Math.min(areaUtil, Math.max(96, pontos.length * 104))
    : areaUtil;
  const deslocamentoGrupo = (areaUtil - larguraGrupo) / 2;
  const passo = Math.max(1, larguraGrupo / pontos.length);
  const areaAltura = Math.max(1, altura - margem.topo - margem.base);
  const larguraBarra = Math.max(18, Math.min(MAX_BARRA, passo * 0.46));
  const x = (i: number) =>
    margem.esq + deslocamentoGrupo + (i + 0.5) * passo;
  const y = (valor: number) =>
    margem.topo +
    areaAltura -
    (Math.max(0, Math.min(100, valor)) / 100) * areaAltura;
  const base = y(0);

  const corDaBarra = (fpy: number) =>
    fpy === 0
      ? "var(--color-alta)"
      : fpy >= meta
        ? "var(--color-brand)"
        : "var(--color-media)";

  return (
    <div
      ref={ref}
      className="ind-caixa-grafico"
      data-cardinalidade={pontos.length}
      data-modo={poucosDados ? "esparso" : "serie"}
      style={
        {
          "--alt-padrao": `${ALTURA_PADRAO}px`,
          overflowX: "auto",
          overflowY: "hidden",
        } as React.CSSProperties
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
          <rect
            x={margem.esq}
            y={y(100)}
            width={areaUtil}
            height={Math.max(0, y(meta) - y(100))}
            fill="var(--color-brand)"
            opacity={0.07}
            pointerEvents="none"
          />

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
            stroke="var(--color-brand)"
            strokeWidth={1}
            pointerEvents="none"
          >
            <title>{`Meta ${meta}%`}</title>
          </line>

          {pontos.map((ponto, i) => {
            const cor = corDaBarra(ponto.fpy);
            const estaAceso = !!aceso && aceso(campo, ponto.chave);
            /* 0% continua sendo barra: piso de 3px, nunca círculo/ponto. */
            const alturaBarra = Math.max(3, base - y(ponto.fpy));
            const topoBarra = base - alturaBarra;
            const larguraAtiva = estaAceso
              ? Math.min(Math.max(larguraBarra + 8, 26), MAX_BARRA_ATIVA)
              : larguraBarra;
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
                    x={x(i) - passo / 2 + 3}
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
                  x={x(i) - passo / 2}
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

                {estaAceso && (
                  <rect
                    x={x(i) - larguraAtiva / 2 - 3}
                    y={Math.max(margem.topo, topoBarra - 3)}
                    width={larguraAtiva + 6}
                    height={Math.max(6, alturaBarra + 6)}
                    rx={5}
                    fill="var(--color-papel)"
                    pointerEvents="none"
                  />
                )}

                <rect
                  x={x(i) - larguraAtiva / 2}
                  y={topoBarra}
                  width={larguraAtiva}
                  height={alturaBarra}
                  rx={Math.min(3, larguraAtiva / 2)}
                  fill={cor}
                  stroke={estaAceso ? cor : "none"}
                  strokeWidth={estaAceso ? 2 : 0}
                  pointerEvents="none"
                />

                <text
                  className="ind-valor-svg"
                  x={x(i)}
                  y={Math.max(FONTE_VALOR, topoBarra - 5)}
                  textAnchor="middle"
                  style={{ fontSize: FONTE_VALOR, fill: cor, fontWeight: 700 }}
                  pointerEvents="none"
                >
                  {ponto.fpy}
                </text>

                <text
                  className="ind-eixo"
                  x={x(i)}
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
        </svg>
      )}
    </div>
  );
}
