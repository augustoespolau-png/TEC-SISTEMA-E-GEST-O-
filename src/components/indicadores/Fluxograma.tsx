"use client";

import { useEffect, useState } from "react";
import { pct, type Percurso } from "@/lib/indicadores";
import { useTamanho } from "./medir";
import { nBR, Vazio } from "./Pecas";

/*
 * O FLUXOGRAMA — caixas e setas, como o desenho da fábrica.
 *
 * Leitura: CAIXA é onde a parede está agora (estoque). SETA é quanta
 * parede passou por ali (fluxo). São coisas diferentes, e por isso o
 * número da caixa e o da seta que chega nela não são o mesmo.
 *
 * PORCENTAGEM — todas sobre o MESMO 100%, o que entrou na auditoria.
 * Com bases diferentes na mesma tela ("88% das reprovadas" ao lado de
 * "29% do total", falando do mesmo 238), o diagrama mente para quem
 * bate o olho. Com uma base só, ele fecha à vista. A leitura por ramo
 * continua viva, na dica de cada seta.
 *
 * UNIDADE — sempre a PAREDE. Contar erro aqui responderia outra
 * pergunta (uma parede com vinte erros pesaria vinte no caminho e uma
 * no destino), e duas unidades na mesma tela foi o que produziu, na
 * versão antiga do dashboard, dois números para a mesma coisa.
 *
 * MOVIMENTO — pulsos, e a QUANTIDADE deles é a quantidade do fluxo.
 * Cada bolinha representa PAREDES percorrendo aquele caminho; não é
 * uma por parede, que seriam centenas. Todas correm na mesma
 * velocidade, e o que muda é quantas estão na linha ao mesmo tempo.
 * É água correndo: dá para ver a vazão sem ler número nenhum.
 */

/*
 * O DESENHO SE MEDE. Antes o quadro era fixo em 1120x500 e o SVG
 * escalava por proporcao: esticar o cartao so criava faixa vazia dos
 * lados. Agora as colunas, as linhas e a caixa saem da largura e da
 * altura reais, e o diagrama ocupa tudo o que recebe.
 */
function geometria(L: number, A: number) {
  const w = Math.min(210, Math.max(120, L * 0.155));
  const h = Math.min(104, Math.max(58, A * 0.16));
  return {
    L, A, CAIXA: { w, h },
    /* 10 de folga na direita, e nao 6: a caixa tem contorno e sombra,
       que somam ~4 alem do w e vazavam da tela na largura minima. */
    CX: { c1: 6, c2: L * 0.27, c3: L * 0.535, c4: L - w - 10 },
    RY: { r1: A * 0.07, r2: A * 0.42, r3: A * 0.76 },
  };
}

/*
 * LARGURA MINIMA DA TELA. As pilulas de porcentagem tem largura de
 * texto, em pixels, que nao encolhe junto com o desenho: a maior mede
 * ~85. Os vaos entre colunas, esses sim, saem de L — o menor deles vale
 * 0,11 x L. Abaixo de 850 o vao fica menor que a pilula e o numero cai
 * em cima da caixa, que era o estado do diagrama no celular. Com 880 o
 * menor vao fica em 96 e sobra folga dos dois lados.
 *
 * O CSS tem de repetir este numero em .ind-fluxograma { min-width },
 * senao o desenho e pintado num tamanho e medido noutro.
 */
const LARGURA_MINIMA = 880;
const ALTURA_MINIMA = 320;
const RAIO = 14;
/** pixels por segundo — igual em todas as setas */
const VELOCIDADE = 105;
/** pontos na linha no caminho mais cheio */
const PULSOS_MAX = 7;

const VERDE = "var(--color-brand-forte)";
const VERDE_ESCURO = "var(--color-baixa)";
const VERMELHO = "var(--color-alta)";
const AMBAR = "var(--color-media)";
const CINZA = "var(--color-ink-3)";
const ROXO = "var(--color-espera)";

/** "0%" ao lado de um número maior que zero parece defeito. */
function pctTexto(v: number, total: number) {
  const p = pct(v, total);
  return v > 0 && p === 0 ? "<1%" : `${p}%`;
}

const espessura = (v: number, total: number) =>
  !total || !v ? 1 : 1 + Math.sqrt(v / total) * 3.6;

type Ponto = [number, number];

/** Canto arredondado: ângulo reto puro tem cara de diagrama de manual. */
function caminho(pontos: Ponto[], raio = RAIO) {
  let d = `M${pontos[0][0]},${pontos[0][1]}`;
  for (let i = 1; i < pontos.length - 1; i++) {
    const [ax, ay] = pontos[i - 1], [bx, by] = pontos[i], [cx, cy] = pontos[i + 1];
    const d1 = Math.hypot(bx - ax, by - ay), d2 = Math.hypot(cx - bx, cy - by);
    const r = Math.min(raio, d1 / 2, d2 / 2);
    d += ` L${bx + ((ax - bx) / d1) * r},${by + ((ay - by) / d1) * r}`;
    d += ` Q${bx},${by} ${bx + ((cx - bx) / d2) * r},${by + ((cy - by) / d2) * r}`;
  }
  const f = pontos[pontos.length - 1];
  return `${d} L${f[0]},${f[1]}`;
}

const comprimento = (p: Ponto[]) =>
  p.slice(1).reduce((s, x, i) => s + Math.hypot(x[0] - p[i][0], x[1] - p[i][1]), 0);

/* ------------------------------------------------------------------ */

function Caixa({
  x, y, w, h, titulo, valor, pctRotulo, cor, apagada, dica, ordem,
}: {
  x: number; y: number; w: number; h: number;
  titulo: string; valor: number; pctRotulo: string;
  cor: string; apagada?: boolean; dica: string; ordem: number;
}) {
  return (
    <g
      className={`no${apagada ? " apagada" : ""}`}
      style={{ ["--atraso" as string]: `${ordem * 60}ms` }}
    >
      <title>{dica}</title>
      <rect className="corpo" x={x} y={y} width={w} height={h} rx={9}
            fill="var(--color-papel)" stroke="var(--color-line-2)" strokeWidth={1} />
      <path d={`M${x + 9},${y + 0.5} L${x + w - 9},${y + 0.5}`}
            stroke={cor} strokeWidth={2} strokeLinecap="round" />
      <text x={x + 14} y={y + 22} fontSize={10} fontWeight={700}
            letterSpacing=".09em" fill="var(--color-ink-3)">{titulo}</text>
      <text x={x + 14} y={y + h - 16} fontSize={Math.min(30, h * 0.36)} fontWeight={700}
            fill={cor} style={{ fontVariantNumeric: "tabular-nums" }}>{nBR(valor)}</text>
      <text x={x + w - 14} y={y + h - 16} fontSize={12} fontWeight={600}
            textAnchor="end" fill="var(--color-ink-3)">{pctRotulo}</text>
    </g>
  );
}

function Seta({
  id, pontos, cor, valor, total, fracao, dica, ladoPilula = 0, ordem,
}: {
  id: string; pontos: Ponto[]; cor: string; valor: number; total: number;
  fracao: number; dica: string; ladoPilula?: number; ordem: number;
}) {
  const d = caminho(pontos);
  const percurso = comprimento(pontos);
  const largura = espessura(valor, total || 1);

  // o rótulo pousa no meio do trecho mais longo
  let melhor = 1, maior = 0;
  for (let i = 1; i < pontos.length; i++) {
    const t = Math.hypot(pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]);
    if (t > maior) { maior = t; melhor = i; }
  }
  const mx = (pontos[melhor][0] + pontos[melhor - 1][0]) / 2;
  const my = (pontos[melhor][1] + pontos[melhor - 1][1]) / 2 + ladoPilula;
  const texto = `${nBR(valor)} · ${pctTexto(valor, total)}`;
  const wPilula = 16 + texto.length * 6.9;

  const dur = Math.max(1.1, percurso / VELOCIDADE);
  const quantos = valor === 0 ? 0 : Math.max(1, Math.round(fracao * PULSOS_MAX));
  /* O rastro não pode ser maior que o espaço entre um pulso e o
     seguinte: numa seta cheia os rastros se encostariam e o efeito
     viraria uma linha contínua, que é o que os pulsos vieram
     substituir. */
  const rastro = quantos ? Math.min(30, (percurso / quantos) * 0.62) : 0;
  const raio = 2.2 + largura * 0.3;

  return (
    <g
      className="fluxo"
      style={{
        ["--atraso" as string]: `${300 + ordem * 80}ms`,
        ["--comp" as string]: `${Math.ceil(percurso) + 40}`,
      }}
    >
      <title>{dica}</title>
      <path id={id} className="trilho" d={d} fill="none" stroke="var(--color-ink-3)"
            strokeWidth={largura} strokeLinejoin="round" strokeLinecap="round"
            markerEnd="url(#ind-ponta)" />

      <g className="pulsos">
        {/* um degradê por seta: o comprimento do rastro muda de uma
            para outra, e o desbotamento tem de acompanhar */}
        <linearGradient id={`ra-${id}`} gradientUnits="userSpaceOnUse"
                        x1={-rastro} y1={0} x2={0} y2={0}>
          <stop offset="0" stopColor={cor} stopOpacity="0" />
          <stop offset="1" stopColor={cor} stopOpacity=".5" />
        </linearGradient>
        {Array.from({ length: quantos }, (_, k) => {
          // espalhados por igual no percurso, para virar fluxo e não rajada
          const inicio = (ordem * 0.2 - (k * dur) / quantos).toFixed(2);
          return (
            <g key={k} opacity={0}>
              <path d={`M${-rastro.toFixed(1)},0 L0,0`} fill="none"
                    stroke={`url(#ra-${id})`} strokeWidth={raio * 1.55}
                    strokeLinecap="round" />
              <circle r={raio} fill={cor} />
              <animateMotion dur={`${dur.toFixed(2)}s`} begin={`${inicio}s`}
                             repeatCount="indefinite" rotate="auto">
                <mpath href={`#${id}`} />
              </animateMotion>
              <animate attributeName="opacity" values="0;.9;.9;0"
                       keyTimes="0;.1;.85;1" dur={`${dur.toFixed(2)}s`}
                       begin={`${inicio}s`} repeatCount="indefinite" />
            </g>
          );
        })}
      </g>

      <g className="pilula" transform={`translate(${mx}, ${my})`}>
        <rect x={-wPilula / 2} y={-12} width={wPilula} height={24} rx={12}
              fill="var(--color-papel)" />
        <rect x={-wPilula / 2} y={-12} width={wPilula} height={24} rx={12}
              fill={cor} opacity=".1" />
        <text x={0} y={4} textAnchor="middle" fontSize={11.5} fontWeight={700}
              fill={cor} style={{ fontVariantNumeric: "tabular-nums" }}>{texto}</text>
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */

export default function Fluxograma({ p }: { p: Percurso }) {
  /* REDE DE SEGURANÇA: a entrada começa em opacity 0, então se a
     animação não rodar — aba em segundo plano, navegador que bloqueia —
     o fluxograma fica invisível. Passado o tempo da entrada, .pronto
     força tudo a aparecer. Conteúdo não depende de animação. */
  const [pronto, setPronto] = useState(false);
  const [ref, tam] = useTamanho<HTMLDivElement>();
  useEffect(() => {
    const t = setTimeout(() => setPronto(true), 1600);
    return () => clearTimeout(t);
  }, [p]);

  if (!p.raiz) return <Vazio>Nada no período selecionado.</Vazio>;

  const L = Math.max(LARGURA_MINIMA, tam.largura);
  const A = Math.max(ALTURA_MINIMA, tam.altura);
  const g = geometria(L, A);
  const { CAIXA, CX, RY } = g;

  const total = p.raiz;
  const foramAprovacao = p.okRetrabalho + p.pendente;
  const meioY = (y: number) => y + CAIXA.h / 2;
  const dirX = (x: number) => x + CAIXA.w;
  const fr = (v: number) => (total ? v / total : 0);

  const caixas = [
    { x: CX.c1, y: RY.r1, titulo: "PRODUÇÃO", valor: total, pctRotulo: "100%",
      cor: CINZA, apagada: p.semOkPrimeira,
      dica: `Produção: ${nBR(total)} paredes entregues à auditoria` },
    { x: CX.c2, y: RY.r1, titulo: "AUDITORIA", valor: total, pctRotulo: "100%", cor: CINZA,
      dica: `Auditoria: todas as ${nBR(total)} paredes passaram por aqui` },
    { x: CX.c4, y: RY.r1, titulo: "OK", valor: p.okPrimeira,
      pctRotulo: pctTexto(p.okPrimeira, total), cor: VERDE,
      dica: `OK: ${nBR(p.okPrimeira)} paredes passaram de primeira, sem nenhum retrabalho` },
    { x: CX.c2, y: RY.r2, titulo: "RETRABALHO", valor: p.aberto,
      pctRotulo: pctTexto(p.aberto, total), cor: AMBAR,
      dica: `Retrabalho: ${nBR(p.reprovadas)} passaram por aqui; ${nBR(p.aberto)} continuam paradas esperando a produção` },
    { x: CX.c3, y: RY.r2, titulo: "AUDITORIA 2", valor: p.pendente,
      pctRotulo: pctTexto(p.pendente, total), cor: ROXO,
      dica: `Auditoria 2 é a conferência do retrabalho: ${nBR(foramAprovacao)} passaram por aqui; ${nBR(p.pendente)} esperam aprovação agora` },
    /* A parede que foi corrigida e aprovada termina AQUI, e nao na
       caixa OK. As duas coisas sao verdes, mas nao sao a mesma: uma
       saiu boa da primeira vez e a outra precisou voltar. Juntar as
       duas escondia o custo do retrabalho dentro do resultado bom. */
    { x: CX.c4, y: RY.r2, titulo: "PAREDES RETRABALHADAS", valor: p.okRetrabalho,
      pctRotulo: pctTexto(p.okRetrabalho, total), cor: VERDE_ESCURO,
      dica: `Retrabalhadas e aprovadas: ${nBR(p.okRetrabalho)} paredes voltaram conformes depois da correção — ${pctTexto(p.okRetrabalho, total)} do auditado` },
    { x: CX.c4, y: RY.r3, titulo: "SEM DEVOLUTIVA", valor: p.nc,
      pctRotulo: pctTexto(p.nc, total), cor: VERMELHO,
      dica: `Sem devolutiva: passou de 48 h sem resposta e seguiu ao cliente sem correção — ${nBR(p.nc)} paredes, ${pctTexto(p.nc, total)} do auditado` },
  ];

  const ramo = (v: number) => pct(v, p.reprovadas);
  const setas = [
    { id: "ind-f1", pontos: [[dirX(CX.c1), meioY(RY.r1)], [CX.c2 - 5, meioY(RY.r1)]] as Ponto[],
      cor: CINZA, valor: total, dica: `Produção → Auditoria: ${nBR(total)} paredes` },
    { id: "ind-f2", pontos: [[dirX(CX.c2), meioY(RY.r1)], [CX.c4 - 5, meioY(RY.r1)]] as Ponto[],
      cor: VERDE, valor: p.okPrimeira, ladoPilula: -17,
      dica: `Passou de primeira: ${nBR(p.okPrimeira)} paredes, ${pctTexto(p.okPrimeira, total)} do auditado` },
    { id: "ind-f3", pontos: [[CX.c2 + CAIXA.w / 2, RY.r1 + CAIXA.h], [CX.c2 + CAIXA.w / 2, RY.r2 - 5]] as Ponto[],
      cor: VERMELHO, valor: p.reprovadas,
      dica: `Reprovou na auditoria: ${nBR(p.reprovadas)} paredes, ${pctTexto(p.reprovadas, total)} do auditado` },
    { id: "ind-f4", pontos: [[dirX(CX.c2), meioY(RY.r2)], [CX.c3 - 5, meioY(RY.r2)]] as Ponto[],
      cor: ROXO, valor: foramAprovacao, ladoPilula: -17,
      dica: `Foi corrigida: ${nBR(foramAprovacao)} de ${nBR(p.reprovadas)} reprovadas, ${ramo(foramAprovacao)}% delas` },
    /* Segue em frente, na mesma linha: antes ela subia para a caixa OK,
       e o desenho dizia que retrabalhar levava ao mesmo lugar que
       acertar de primeira. */
    { id: "ind-f5", pontos: [[dirX(CX.c3), meioY(RY.r2)], [CX.c4 - 5, meioY(RY.r2)]] as Ponto[],
      cor: VERDE_ESCURO, valor: p.okRetrabalho,
      dica: `Aprovada no retrabalho: ${nBR(p.okRetrabalho)} de ${nBR(p.reprovadas)} reprovadas, ${ramo(p.okRetrabalho)}% delas` },
    { id: "ind-f6", pontos: [[CX.c2 + CAIXA.w / 2, RY.r2 + CAIXA.h], [CX.c2 + CAIXA.w / 2, meioY(RY.r3)],
                             [CX.c4 - 5, meioY(RY.r3)]] as Ponto[],
      cor: VERMELHO, valor: p.nc,
      dica: `Ficou sem devolutiva: ${nBR(p.nc)} de ${nBR(p.reprovadas)} reprovadas, ${ramo(p.nc)}% delas — 48 h sem devolutiva` },
  ];

  return (
    <div className="ind-rolagem ind-caixa-fluxo" ref={ref}>
      <svg
        width={L}
        height={A}
        viewBox={`0 0 ${L} ${A}`}
        className={`ind-fluxograma${pronto ? " pronto" : ""}`}
        role="img"
        aria-label={`Fluxograma: de ${nBR(total)} paredes auditadas, ${pctTexto(p.okPrimeira, total)} passaram de primeira, ${pctTexto(p.reprovadas, total)} foram para retrabalho e ${pctTexto(p.nc, total)} seguiram sem devolutiva`}
      >
        <defs>
          <marker id="ind-ponta" viewBox="0 0 10 10" refX="8" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,1.5 L8,5 L0,8.5 z" fill="var(--color-ink-3)" />
          </marker>
        </defs>
        {caixas.map((c, i) => (
          <Caixa key={c.titulo} {...c} w={CAIXA.w} h={CAIXA.h} ordem={i} />
        ))}
        {setas.map((s, i) => (
          <Seta key={s.id} {...s} total={total} fracao={fr(s.valor)} ordem={i} />
        ))}
      </svg>
    </div>
  );
}
