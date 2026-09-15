"use client";

import { useId } from "react";
import { Dica } from "@/components/painel/Interativo";
import {
  pct,
  type CasaFpy,
  type Fluxo,
  type FpyNoTempo,
  type Resumo,
} from "@/lib/indicadores";
import type { CampoRecorte } from "@/lib/dashboard";
import { opacidadeDaMarca, type Clicavel } from "./clique";
import { useTamanho } from "./medir";
import { COR, dBR, nBR, Vazio } from "./Pecas";

/*
 * Gráficos em SVG puro, sem biblioteca: o projeto não tem dependência de
 * chart e não vale trazer uma para cinco desenhos.
 *
 * POR QUE MEDIR A LARGURA em vez de deixar o SVG escalar sozinho:
 * um <svg viewBox="0 0 720 230"> sem largura ocupa 100% do pai e puxa a
 * altura pela proporção. Num cartão de 1150 px isso dava 367 px de
 * altura — o gráfico virava a tela inteira. Desenhando na largura real,
 * a altura é escolhida e não herdada, e de quebra o texto e a espessura
 * do traço saem no tamanho certo em vez de esticados.
 *
 * Em tela de toque não existe hover, então todo alvo carrega também um
 * `title` — é o que o celular mostra ao pressionar.
 */

/*
 * Alturas de referência. Elas valem quando o cartão deixa o gráfico
 * crescer à vontade; quando o painel inteiro tem de caber numa tela, o
 * cartão impõe a altura e o desenho se ajusta a ela. Por isso o gráfico
 * mede o contêiner nas DUAS direções: largura E altura.
 */
const ALTURA = {
  linha: 190,
  colunas: 165,
  area: 145,
  fluxo: 176,
};

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Quais números cabem em cima das colunas, sem um encostar no outro.
 *
 * Não dá para decidir isso por uma regra de espaçamento só: "67" ocupa
 * dois terços do que "100" ocupa, então a mesma largura de coluna às
 * vezes cabe e às vezes não. Aqui cada rótulo é medido pelo texto que
 * ele tem (0,68 de largura por caractere na fonte do sistema em negrito,
 * medido) e só entra se começar depois do fim do último que entrou.
 * O primeiro tem preferência, e quem não coube fica de fora — número
 * pela metade em cima do vizinho é pior do que número ausente.
 */
function rotulosQueCabem(
  textos: string[],
  centro: (i: number) => number,
  fonte: number,
  folga = 3
): boolean[] {
  let ultimoFim = -Infinity;
  return textos.map((t, i) => {
    const meia = (t.length * fonte * 0.68) / 2;
    const inicio = centro(i) - meia;
    if (inicio < ultimoFim + folga) return false;
    ultimoFim = centro(i) + meia;
    return true;
  });
}

/* Piso e teto da fonte do eixo de baixo. Subiu de 7–10 para 9–12: o
   painel é lido de longe, e o eixo Y saiu dos gráficos — a largura que
   ele ocupava virou espaço de desenho, então a letra maior não custa
   coluna. */
const EIXO_FONTE_MIN = 9;
const EIXO_FONTE_MAX = 12;

/* O mesmo para o número em cima da coluna. Ele some quando não cabe
   (ver rotulosQueCabem), então o piso pode ser generoso: melhor um
   número ausente do que um número ilegível. */
const VALOR_FONTE_MIN = 9;
const VALOR_FONTE_MAX = 13;
const fonteDoValor = (passo: number) =>
  Math.min(VALOR_FONTE_MAX, Math.max(VALOR_FONTE_MIN, passo * 0.5));

/**
 * O eixo de baixo mostra TODOS os rótulos — nenhum é pulado.
 *
 * Antes ele pulava de dois em dois (`i % salto`), e quem olhava o
 * gráfico via a coluna de uma semana sem conseguir dizer QUAL semana
 * era: a coluna estava entre "11/05" e "25/05" e o resto era conta de
 * cabeça. Um eixo em que o dado não pode ser nomeado não é um eixo.
 *
 * A ordem das tentativas é: primeiro encolher a letra até o piso;
 * só se nem assim couber é que o desenho ALARGA e o cartão passa a
 * rolar de lado — porque perder o rótulo é pior do que arrastar.
 *
 * Devolve o passo mínimo que cada coluna precisa ter (usado antes de
 * saber a largura, para dimensionar o desenho) e a fonte, dado o passo
 * que sobrou de fato.
 */
function eixoDeTodos(rotulos: string[]) {
  const maior = rotulos.reduce((n, t) => Math.max(n, t.length), 1);
  const largura = (fonte: number) => maior * fonte * 0.68 + 4;
  return {
    passoMinimo: largura(EIXO_FONTE_MIN),
    fonte: (passo: number) =>
      Math.min(
        EIXO_FONTE_MAX,
        Math.max(EIXO_FONTE_MIN, (passo - 4) / (maior * 0.68))
      ),
  };
}

/**
 * Dá ao desenho o tamanho real que ele tem para ocupar.
 *
 * Se o cartão define uma altura (painel que cabe numa tela), o gráfico
 * usa ela; se não define, cai na altura de referência. A largura vem
 * sempre da medição — foi o que resolveu o gráfico de 367 px de altura.
 */
function Tela({
  altura,
  classe = "",
  children,
}: {
  altura: number;
  /** classe extra na caixa, para quem precisa de outro arranjo dentro */
  classe?: string;
  children: (largura: number, altura: number) => React.ReactNode;
}) {
  const [ref, t] = useTamanho<HTMLDivElement>();
  /* Usa a altura MEDIDA sempre que existir. Antes só usava quando ela
     passava de 96, e o desenho caía no tamanho de referência — que num
     cartão de 111px de corpo virava um SVG de 165 estourando a borda.
     Foi o que aconteceu com a pizza de gravidade. */
  const alt = t.altura > 0 ? t.altura : altura;
  return (
    <div
      ref={ref}
      className={`ind-caixa-grafico ${classe}`.trim()}
      /* o piso vai como VARIÁVEL, não como min-height inline: assim o
         celular usa a altura de referência do gráfico e o computador,
         onde o cartão manda na altura, zera o piso pelo CSS. Inline
         ganharia dos dois. */
      style={{ "--alt-padrao": `${altura}px` } as React.CSSProperties}
    >
      {t.largura > 0 && children(t.largura, alt)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FPY por casa                                                        */
/* ------------------------------------------------------------------ */
/**
 * FPY por casa, em COLUNAS, com as referências FORA da área que rola.
 *
 * O desenho é mais largo que o cartão — 26px garantidos por casa — e
 * arrasta de lado. Enquanto meta e média moravam dentro dele, as duas
 * sumiam junto com as colunas: bastava arrastar um pouco e o gráfico
 * ficava sem nenhuma referência do que era bom ou ruim. Pior, os dois
 * rótulos ficavam colados um no outro, e não dava para saber qual
 * pertencia a qual linha.
 *
 * Agora são três pedaços lado a lado: uma coluna FIXA à esquerda com a
 * escala e a META, a faixa que ROLA no meio com as barras, e uma coluna
 * FIXA à direita com a MÉDIA. Cada referência de um lado, sempre à
 * vista, e nunca uma em cima da outra.
 *
 * A META também é a faixa de fundo, do valor dela até 100: coluna que
 * entra na faixa bateu a meta.
 */
export function ColunasFpy({
  casas,
  meta,
  media,
  mostrarProjeto = false,
  aoRecortar,
  aceso,
}: {
  casas: CasaFpy[];
  meta: number;
  /** média dos FPYs das casas; a linha de referência do desenho */
  media: number;
  /** identifica a obra no tooltip quando casas iguais vêm de obras distintas */
  mostrarProjeto?: boolean;
} & Clicavel) {
  if (!casas.length) return <Vazio>Nenhuma casa auditada no período.</Vazio>;

  const algumAceso = !!aceso && casas.some((c) => aceso("casa", c.casa));

  /* Largura minima por casa: o maior entre "a barra deixa de ser barra"
     (26) e "o numero da casa cabe embaixo dela" — nenhuma casa fica sem
     nome no eixo. */
  const eixo = eixoDeTodos(casas.map((c) => String(c.casa)));
  const PASSO_MIN = Math.max(26, eixo.passoMinimo);

  return (
    <Tela altura={ALTURA.linha} classe="ind-fpy">
      {(caixa, medida) => {
        /* topo derivado do rótulo, como nos outros: a coluna de uma casa
           com 100% chega ao teto do desenho e o número dela vai 4px
           acima — com 13px de letra, ele saía cortado. */
        const m = { topo: 22, dir: 8, base: 22, esq: 8 };

        /* No celular as duas colunas fixas custavam metade do cartao —
           sobravam 165px de grafico em 317. Ali o rotulo perde a palavra
           e fica so o numero: a nota acima do grafico so aparece no
           celular, e ela ja diz que a faixa verde e a meta e a tracejada
           e a media. O contorno de cada toco (cheio x tracejado) repete
           a distincao sem depender de cor. */
        const estreito = caixa < 520;
        const EIXO = estreito ? 48 : 78;
        const REF = estreito ? 44 : 74;
        const rotuloMeta = estreito ? `${meta}%` : `meta ${meta}%`;
        const rotuloMedia = estreito ? `${media}%` : `média ${media}%`;

        const visivel = Math.max(120, caixa - EIXO - REF);
        const L = Math.max(visivel, m.esq + m.dir + casas.length * PASSO_MIN);
        const rola = L > visivel;
        /* A barra de rolagem come ~10px de altura, e só da faixa do meio.
           Descontando de TODOS os pedaços, as três alturas continuam
           iguais e as linhas de um casam com as do outro. */
        const A = rola ? Math.max(120, medida - 10) : medida;

        const larg = L - m.esq - m.dir;
        const alt = A - m.topo - m.base;
        const passo = larg / casas.length;
        const w = Math.max(2, Math.min(34, passo * 0.62));
        const x = (i: number) => m.esq + (i + 0.5) * passo;
        const y = (v: number) => m.topo + alt - (v / 100) * alt;

        const fonte = fonteDoValor(passo);
        const cabe = rotulosQueCabem(casas.map((c) => String(c.fpy)), x, fonte);
        const fonteEixo = eixo.fonte(passo);

        return (
          <>
            {/* ---- coluna fixa: a meta ----
                O 0/50/100 saiu. Ele custava altura de linha para dizer
                o que a faixa verde e o número em cima de cada coluna já
                dizem, e a escala aqui é sempre a mesma — de 0 a 100,
                porque é percentual. Ficou a META, que é a única leitura
                que a coluna sozinha não dá. */}
            <svg width={EIXO} height={A} aria-hidden="true">
              <text className="ind-eixo" x={0} y={y(meta) + 3} fill="var(--color-brand)">
                {rotuloMeta}
              </text>
              {/* toco que liga o rótulo à linha lá dentro */}
              <line
                x1={EIXO - 8} x2={EIXO} y1={y(meta)} y2={y(meta)}
                stroke="var(--color-brand)" strokeWidth={1}
              />
            </svg>

            {/* ---- faixa que rola: as casas ---- */}
            <div className="ind-fpy-rolagem">
              <svg
                width={L}
                height={A}
                role="img"
                aria-label={`FPY de ${casas.length} casas auditadas, meta ${meta}%, média ${media}%`}
              >
                <rect
                  x={0} y={y(100)} width={L} height={y(meta) - y(100)}
                  fill="var(--color-brand)" opacity={0.07}
                />
                {[0, 50, 100].map((v) => (
                  <line key={v} className="ind-malha" x1={0} x2={L} y1={y(v)} y2={y(v)} />
                ))}
                <line
                  x1={0} x2={L} y1={y(meta)} y2={y(meta)}
                  stroke="var(--color-brand)" strokeWidth={1}
                />

                {casas.map((c, i) => {
                  const cor =
                    c.fpy === 0
                      ? "var(--color-alta)"
                      : c.fpy >= meta
                        ? "var(--color-brand)"
                        : "var(--color-media)";
                  const identificacao = mostrarProjeto
                    ? `${c.projeto} · casa ${c.casa}`
                    : `Casa ${c.casa}`;
                  const dica =
                    `${identificacao}: FPY ${c.fpy}% — ${c.limpas} de ${c.conferidas} paredes passaram de primeira` +
                    (c.zerada ? " (zerada pela regra)" : "");
                  const estaAceso = !!aceso && aceso("casa", c.casa);
                  return (
                    <g
                      key={c.chave}
                      className={`ind-alvo${aoRecortar ? " ind-clicavel" : ""}`}
                      opacity={opacidadeDaMarca(algumAceso, estaAceso)}
                    >
                      {/* o alvo é a fatia inteira: mirar numa barra de
                          16px de largura e 4% de altura é impossível */}
                      <rect
                        x={x(i) - passo / 2} y={m.topo} width={passo} height={alt}
                        fill="transparent"
                        onClick={aoRecortar && (() => aoRecortar("casa", c.casa))}
                        role={aoRecortar ? "button" : undefined}
                        aria-pressed={aoRecortar ? estaAceso : undefined}
                      >
                        <title>
                          {dica +
                            (aoRecortar
                              ? estaAceso
                                ? " · clique para tirar o recorte"
                                : " · clique para ver o painel só desta casa"
                              : "")}
                        </title>
                      </rect>
                      <rect
                        x={x(i) - w / 2} y={y(c.fpy)} width={w}
                        height={Math.max(1.5, m.topo + alt - y(c.fpy))}
                        rx={Math.min(3, w / 2)} fill={cor}
                        pointerEvents="none"
                      />
                      {cabe[i] && (
                        <text
                          className="ind-valor-svg" x={x(i)} y={y(c.fpy) - 4}
                          textAnchor="middle"
                          /* em style, não em atributo: .ind-valor-svg fixa
                             font-size e fill, e classe ganha de atributo */
                          style={{ fontSize: fonte, fill: cor }}
                          pointerEvents="none"
                        >
                          {c.fpy}
                        </text>
                      )}
                    </g>
                  );
                })}

                <line
                  x1={0} x2={L} y1={y(media)} y2={y(media)}
                  stroke="var(--color-ink-2)" strokeWidth={1.25} strokeDasharray="5 4"
                />

                {casas.map((c, i) => (
                  <text
                    key={`r${c.chave}`}
                    className="ind-eixo"
                    x={x(i)}
                    y={A - 7}
                    textAnchor="middle"
                    style={{ fontSize: fonteEixo }}
                  >
                    {c.casa}
                  </text>
                ))}
              </svg>
            </div>

            {/* ---- coluna fixa: média ---- */}
            <svg width={REF} height={A} aria-hidden="true">
              <line
                x1={0} x2={8} y1={y(media)} y2={y(media)}
                stroke="var(--color-ink-2)" strokeWidth={1.25} strokeDasharray="4 3"
              />
              <text className="ind-eixo" x={12} y={y(media) + 3} fill="var(--color-ink-2)">
                {rotuloMedia}
              </text>
            </svg>
          </>
        );
      }}
    </Tela>
  );
}

/* ------------------------------------------------------------------ */
/* FPY no tempo (por dia, por semana)                                  */
/* ------------------------------------------------------------------ */
/**
 * FPY ao longo do calendário, em LINHA.
 *
 * Já foi coluna, e coluna respondia a pergunta errada. O que se quer
 * saber do tempo é para onde a coisa vai, e a inclinação de uma linha
 * responde isso de relance — com barras, o olho compara altura de par em
 * par e tem de montar a tendência sozinho. (Para CASA a coluna continua,
 * porque ali a pergunta é "quais são as piores", que é comparação, não
 * tendência.)
 *
 * TRÊS CAMADAS, cada uma com um trabalho:
 *
 *   A ÁREA, em degradê do verde da marca, dá corpo ao caminho — é o
 *   volume do dado, forte junto da linha e desaparecendo até a base.
 *   Ela não acrescenta informação nenhuma que a linha já não dê;
 *   acrescenta PESO, e é isso que faz o gráfico ser visto de longe.
 *
 *   A LINHA, no mesmo verde, é o caminho.
 *
 *   OS PONTOS é que têm cor de veredito — verde bateu a meta, âmbar não
 *   bateu, vermelho é período em que nenhuma parede passou.
 *
 * O VERDE AQUI É IDENTIDADE, NÃO VEREDITO. Ele diz "este é o dado da
 * Tecverde", e não "está bom". Quem diz se está bom é a POSIÇÃO em
 * relação à meta, mais a cor do ponto e o número escrito em cima dele.
 * Por isso a meta deixou de ser verde neste gráfico: virou uma linha
 * TRACEJADA CINZA, que é o que uma referência deve ser — recessiva e
 * legível por cima da área. Se ela continuasse verde sólida sobre um
 * degradê verde, sumiria justamente onde mais importa. E a faixa verde
 * de fundo saiu pelo mesmo motivo: com a área verde, ela não se via.
 *
 * SEM EIXO Y. Os números 0/50/100 na lateral custavam 26px de desenho
 * para dizer o que a linha da meta e o rótulo em cima de cada ponto já
 * dizem — e a escala é sempre a mesma, de 0 a 100, porque é percentual.
 */
export function LinhaFpyTempo({
  pontos,
  meta,
  unidade,
  aoRecortar,
  aceso,
}: {
  pontos: FpyNoTempo[];
  meta: number;
  /** "dia" ou "semana", para a dica falar a língua certa */
  unidade: "dia" | "semana";
} & Clicavel) {
  /* O degradê é referenciado por id dentro do SVG, e os dois gráficos
     (dia e semana) vivem na MESMA página: com um id fixo, o segundo
     apontaria para o <defs> do primeiro. Funciona por acidente enquanto
     os dois são iguais, e quebra no dia em que não forem. */
  const idArea = useId();

  if (!pontos.length) return <Vazio>Nenhuma parede conferida no período.</Vazio>;

  /* a chave já vem no formato do recorte: o dia, ou a segunda da semana */
  /* "semanaMes" e não "semana": a semana deste gráfico é cortada na
     virada do mês, então ela precisa de um recorte próprio — o filtro
     por semana corrida continua existindo para o painel de produção. */
  const campo: CampoRecorte = unidade === "semana" ? "semanaMes" : "dia";
  const algumAceso = !!aceso && pontos.some((p) => aceso(campo, p.chave));

  return (
    <Tela altura={ALTURA.colunas}>
      {(caixa, medida) => {
        /* A ÁREA VAI DE PONTA A PONTA, como no gráfico de área de
           planilha: o primeiro ponto encosta na borda esquerda do
           desenho e o último na direita, sem meia-coluna de sobra dos
           dois lados. É o que faz a área parecer uma massa de dado, e
           não uma faixa flutuando no meio do cartão.

           A margem lateral existe só para o primeiro e o último rótulo
           do eixo não saírem cortados: eles ficam centrados NO ponto,
           então metade do rótulo passa da borda. */
        const eixo = eixoDeTodos(pontos.map((p) => p.rotulo));
        const meioRotulo = Math.ceil(eixo.passoMinimo / 2);
        const esq = meioRotulo;
        const dir = meioRotulo;
        const base = 24;
        const PASSO_MIN = Math.max(24, eixo.passoMinimo);
        const L = Math.max(caixa, esq + dir + pontos.length * PASSO_MIN);
        const rola = L > caixa;
        const A = rola ? Math.max(110, medida - 10) : medida;

        const larg = L - esq - dir;
        /* passo = distância ENTRE pontos, e não largura de fatia: com n
           pontos há n−1 vãos quando o primeiro e o último tocam a borda */
        const passo = pontos.length > 1 ? larg / (pontos.length - 1) : larg;
        const fonte = fonteDoValor(passo);
        /* o ponto encolhe quando são muitos, mas nunca abaixo de 2,5px —
           abaixo disso ele deixa de ser um ponto e vira sujeira */
        const raio = Math.max(2.5, Math.min(4.5, passo * 0.16));

        /* A MARGEM DE CIMA SAI DO RÓTULO, e não de um número fixo.
           Era 16, e o "100" de um dia perfeito nasce colado no topo do
           desenho: o ponto fica em y=topo, o número dele vai 5px acima
           do ponto, e a letra subiu para 13px — o texto terminava fora
           do SVG e aparecia cortado pela metade. Aqui a margem é o que
           o rótulo pede. */
        const m = {
          topo: Math.ceil(fonte + raio + 6),
          dir,
          base,
          esq,
        };
        const alt = A - m.topo - m.base;
        const x = (i: number) =>
          pontos.length > 1 ? m.esq + i * passo : m.esq + larg / 2;
        const y = (v: number) => m.topo + alt - (v / 100) * alt;

        const cabe = rotulosQueCabem(pontos.map((p) => String(p.fpy)), x, fonte);
        const fonteEixo = eixo.fonte(passo);
        const caminho = pontos
          .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.fpy).toFixed(1)}`)
          .join(" ");
        /* a área é o mesmo caminho, fechado até a base do desenho */
        const chao = (m.topo + alt).toFixed(1);
        const area =
          pontos.length > 1
            ? `${caminho} L${x(pontos.length - 1).toFixed(1)},${chao} L${x(0).toFixed(1)},${chao} Z`
            : "";
        const corDoPonto = (fpy: number) =>
          fpy === 0
            ? "var(--color-alta)"
            : fpy >= meta
              ? "var(--color-brand)"
              : "var(--color-media)";

        return (
          <svg
            width={L}
            height={A}
            role="img"
            aria-label={`FPY por ${unidade}, ${pontos.length} períodos, meta ${meta}%`}
          >
            <defs>
              {/* Degradê FORTE, e que não chega a zero: a área é para
                  ser massa, não véu. De 0,85 junto da linha a 0,18 no
                  chão — o fundo do cartão ainda aparece por baixo, então
                  a linha de 50% continua legível através dela. */}
              <linearGradient id={idArea} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.85} />
                <stop offset="60%" stopColor="var(--color-brand)" stopOpacity={0.42} />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.18} />
              </linearGradient>
            </defs>

            {[0, 50, 100].map((v) => (
              <line
                key={v}
                className="ind-malha"
                x1={m.esq} x2={L - m.dir} y1={y(v)} y2={y(v)}
              />
            ))}

            {/* A ÁREA vem antes da linha da meta, e não depois.
                Com a área fraca a ordem não importava; com ela forte,
                a meta ficava ENTERRADA embaixo justamente onde o FPY
                está acima dela — ou seja, sumia toda vez que a fábrica
                ia bem. A referência do que é bom não pode depender do
                resultado. */}
            {area && (
              <path
                d={area}
                fill={`url(#${idArea})`}
                pointerEvents="none"
                opacity={algumAceso ? 0.35 : 1}
              />
            )}
            {/* A meta atravessa a área toda vez que a fábrica vai bem,
                e cinza sobre verde é pouco contraste. O fio da cor do
                papel por baixo abre um vão para ela — mesma ideia do
                anel dos pontos. */}
            <line
              x1={m.esq} x2={L - m.dir} y1={y(meta)} y2={y(meta)}
              stroke="var(--color-papel)" strokeWidth={4} opacity={0.75}
            />
            <line
              x1={m.esq} x2={L - m.dir} y1={y(meta)} y2={y(meta)}
              stroke="var(--color-ink-2)" strokeWidth={1.5}
              strokeDasharray="5 4"
            >
              <title>{`meta ${meta}%`}</title>
            </line>

            <path
              d={caminho}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
              opacity={algumAceso ? 0.3 : 1}
            />

            {pontos.map((p, i) => {
              const cor = corDoPonto(p.fpy);
              const estaAceso = !!aceso && aceso(campo, p.chave);
              /* Seleção temporal = coluna. O piso de 8px mantém 0% visível
                 e a largura limitada evita que um único dia vire um bloco
                 gigante quando o gráfico tem poucos pontos. */
              const larguraBarra = Math.max(14, Math.min(40, passo * 0.54));
              const baseBarra = y(0);
              const alturaBarra = Math.max(8, baseBarra - y(p.fpy));
              const topoBarra = baseBarra - alturaBarra;
              const topoMarca = estaAceso ? topoBarra : y(p.fpy);
              return (
                <g
                  key={p.chave}
                  className={`ind-alvo${aoRecortar ? " ind-clicavel" : ""}`}
                  opacity={opacidadeDaMarca(algumAceso, estaAceso)}
                >
                  {/* O alvo é a fatia inteira: mirar num ponto de 4px é
                      impossível com o dedo, e quase com o ponteiro.
                      Nas pontas ela é MEIA fatia — o primeiro e o último
                      ponto encostam na borda, e a metade de fora não
                      existe. Sem o corte, o alvo do primeiro invadia a
                      margem e ficava por cima do rótulo do eixo. */}
                  <rect
                    x={Math.max(m.esq, x(i) - passo / 2)}
                    y={m.topo}
                    width={
                      Math.min(L - m.dir, x(i) + passo / 2) -
                      Math.max(m.esq, x(i) - passo / 2)
                    }
                    height={alt}
                    fill="transparent"
                    onClick={aoRecortar && (() => aoRecortar(campo, p.chave))}
                    role={aoRecortar ? "button" : undefined}
                    aria-pressed={aoRecortar ? estaAceso : undefined}
                  >
                    <title>
                      {`${p.rotuloLongo ?? p.rotulo}: FPY ${p.fpy}% — ${nBR(p.limpas)} de ${nBR(p.conferidas)} paredes passaram de primeira` +
                        (aoRecortar
                          ? estaAceso
                            ? " · clique para tirar o recorte"
                            : ` · clique para ver o painel só desta ${unidade}`
                          : "")}
                    </title>
                  </rect>
                  {/* anel da cor do papel: onde a linha passa por trás do
                      ponto, ela não borra a marca */}
                  {estaAceso ? (
                    <>
                      {/* halo de papel separa a barra da linha/área no tema escuro */}
                      <rect
                        x={x(i) - larguraBarra / 2}
                        y={topoBarra}
                        width={larguraBarra}
                        height={alturaBarra}
                        rx={3}
                        fill={cor}
                        fillOpacity={0.2}
                        stroke="var(--color-papel)"
                        strokeWidth={5}
                        pointerEvents="none"
                      />
                      <rect
                        x={x(i) - larguraBarra / 2}
                        y={topoBarra}
                        width={larguraBarra}
                        height={alturaBarra}
                        rx={3}
                        fill={cor}
                        fillOpacity={0.42}
                        stroke={cor}
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    </>
                  ) : (
                    <circle
                      cx={x(i)} cy={y(p.fpy)} r={raio}
                      fill={cor}
                      stroke="var(--color-papel)"
                      strokeWidth={1.5}
                      pointerEvents="none"
                    />
                  )}
                  {(estaAceso || cabe[i]) && (
                    <text
                      className="ind-valor-svg"
                      x={x(i)} y={topoMarca - (estaAceso ? 6 : raio + 5)}
                      textAnchor="middle"
                      style={{ fontSize: fonte, fill: cor }}
                      pointerEvents="none"
                    >
                      {p.fpy}
                    </text>
                  )}
                </g>
              );
            })}

            {pontos.map((p, i) => (
              <text
                key={`r${p.chave}`}
                className="ind-eixo"
                x={x(i)}
                y={A - 7}
                textAnchor="middle"
                style={{ fontSize: fonteEixo }}
              >
                {p.rotulo}
              </text>
            ))}
          </svg>
        );
      }}
    </Tela>
  );
}

/* ------------------------------------------------------------------ */
/* Colunas                                                             */
/* ------------------------------------------------------------------ */
export interface Coluna {
  rotulo: string;
  valor: number;
  extra?: string;
  /** valor do recorte desta barra; sem ele a barra não recorta nada */
  chave?: string;
}

/**
 * Barras DEITADAS, com o nome ao lado.
 *
 * Em pé, o rótulo vai parar embaixo da coluna, escrito num espaço que
 * tem a largura da coluna — e "Semana 1" não cabe em 60 px sem virar
 * "Sem…". Deitada, o nome fica na horizontal, no seu tamanho, encostado
 * na barra que ele nomeia: não há como trocar qual é qual.
 *
 * Vale para série curta e de nome comprido (semana, setor, turno). Para
 * série longa continua valendo a coluna em pé, que é onde cabem 72
 * casas lado a lado.
 */
export function Barras({
  itens,
  cor,
  sufixo = "",
  campo,
  aoRecortar,
  aceso,
}: {
  itens: Coluna[];
  cor: string;
  sufixo?: string;
  /** o campo que uma barra representa, quando ela recorta o painel */
  campo?: CampoRecorte;
} & Clicavel) {
  if (!itens.length || itens.every((i) => !i.valor))
    return <Vazio>Nada no período.</Vazio>;

  const clicavel = !!(campo && aoRecortar);
  const estaAceso = (it: Coluna) =>
    !!(campo && aceso && it.chave && aceso(campo, it.chave));
  const algumAceso = itens.some(estaAceso);

  return (
    <Tela altura={ALTURA.colunas}>
      {(L, A) => {
        const max = Math.max(...itens.map((i) => i.valor), 1);
        const linha = A / itens.length;
        const h = Math.min(26, Math.max(6, linha * 0.56));
        const fonte = Math.min(12, Math.max(9, linha * 0.32));

        /* A coluna do nome sai do nome mais comprido, com teto de 42% da
           largura: sem teto, um rótulo enorme come a barra inteira e o
           gráfico deixa de comparar tamanhos, que é o que ele existe
           para fazer. */
        const maiorNome = Math.max(...itens.map((i) => i.rotulo.length));
        const xBarra = Math.min(L * 0.42, maiorNome * fonte * 0.58 + 8);
        // espaço à direita para o número no fim da barra
        const reservaValor = Math.max(26, String(max).length * fonte * 0.68 + 10);
        const util = L - xBarra - reservaValor;

        return (
          <svg width={L} height={A} role="img" aria-label="gráfico de barras">
            {itens.map((it, i) => {
              const y = i * linha + (linha - h) / 2;
              const w = Math.max(2, (it.valor / max) * util);
              const acesa = estaAceso(it);
              const clique =
                clicavel && it.chave
                  ? () => aoRecortar!(campo!, it.chave!)
                  : undefined;
              return (
                <g
                  key={it.rotulo}
                  className={`ind-alvo${clique ? " ind-clicavel" : ""}`}
                  opacity={opacidadeDaMarca(algumAceso, acesa)}
                >
                  {/* a faixa inteira é o alvo, do nome ao fim da linha */}
                  <rect
                    x={0} y={i * linha} width={L} height={linha}
                    fill="transparent"
                    onClick={clique}
                    role={clique ? "button" : undefined}
                    aria-pressed={clique ? acesa : undefined}
                  >
                    <title>
                      {`${it.rotulo}: ${nBR(it.valor)} ${sufixo}${it.extra ? ` — ${it.extra}` : ""}` +
                        (clique
                          ? acesa
                            ? " · clique para tirar o recorte"
                            : " · clique para recortar o painel"
                          : "")}
                    </title>
                  </rect>
                  <text
                    className="ind-eixo" x={0} y={y + h / 2 + fonte * 0.36}
                    style={{ fontSize: fonte }} pointerEvents="none"
                  >
                    {it.rotulo}
                  </text>
                  <rect
                    x={xBarra} y={y} width={w} height={h}
                    rx={Math.min(3, h / 2)} fill={cor} pointerEvents="none"
                  />
                  <text
                    className="ind-valor-svg" x={xBarra + w + 6}
                    y={y + h / 2 + fonte * 0.36}
                    style={{ fontSize: fonte }} pointerEvents="none"
                  >
                    {nBR(it.valor)}
                  </text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </Tela>
  );
}

/* ------------------------------------------------------------------ */
/* Pizza                                                               */
/* ------------------------------------------------------------------ */
export interface Fatia {
  nome: string;
  valor: number;
  cor: string;
  /** valor do recorte que esta fatia representa, quando ela é clicável */
  chave?: string;
}

/**
 * Pizza de composição.
 *
 * Serve para PARTE DE UM TODO com poucas fatias — gravidade do erro são
 * três. Com muitas fatias ela deixa de ser legível, porque o olho compara
 * ângulo pior do que compara comprimento; por isso o resto do painel usa
 * barra, e a pizza fica só onde a pergunta é "quanto de cada um dentro
 * do total".
 *
 * O rótulo entra na fatia só quando a fatia é grande o bastante para
 * ele; as pequenas ficam por conta da legenda, que está sempre lá — cor
 * nunca identifica sozinha.
 */
export function Pizza({
  fatias,
  campo,
  aoRecortar,
  aceso,
}: {
  fatias: Fatia[];
  /** o campo que uma fatia representa, quando ela recorta o painel */
  campo?: CampoRecorte;
} & Clicavel) {
  const vivas = fatias.filter((f) => f.valor > 0);
  const total = vivas.reduce((s, f) => s + f.valor, 0);
  if (!total) return <Vazio>Nenhum desvio no período.</Vazio>;

  const clicavel = !!(campo && aoRecortar);
  const estaAcesa = (f: Fatia) =>
    !!(campo && aceso && f.chave && aceso(campo, f.chave));
  const algumAceso = vivas.some(estaAcesa);

  return (
    <Tela altura={ALTURA.colunas}>
      {(L, A) => {
        const r = Math.max(24, Math.min(L, A) / 2 - 6);
        const cx = L / 2;
        const cy = A / 2;
        const ponto = (ang: number, raio = r) => [
          cx + raio * Math.cos(ang - Math.PI / 2),
          cy + raio * Math.sin(ang - Math.PI / 2),
        ];

        let inicio = 0;
        return (
          <svg
            width={L}
            height={A}
            role="img"
            aria-label={vivas
              .map((f) => `${f.nome} ${pct(f.valor, total)}%`)
              .join(", ")}
          >
            {vivas.map((f) => {
              const fracao = f.valor / total;
              const fim = inicio + fracao * Math.PI * 2;
              const meio = (inicio + fim) / 2;
              const [x1, y1] = ponto(inicio);
              const [x2, y2] = ponto(fim);
              const grande = fim - inicio > Math.PI ? 1 : 0;
              const dica = `${f.nome}: ${nBR(f.valor)} desvios, ${pct(f.valor, total)}% do total`;
              const [tx, ty] = ponto(meio, r * 0.62);
              inicio = fim;

              const acesa = estaAcesa(f);
              const clique =
                clicavel && f.chave
                  ? () => aoRecortar!(campo!, f.chave!)
                  : undefined;
              const rotulo =
                dica +
                (clique
                  ? acesa
                    ? " · clique para tirar o recorte"
                    : " · clique para ver o painel só desta gravidade"
                  : "");

              return (
                <g
                  key={f.nome}
                  className={`ind-fatia${clique ? " ind-clicavel" : ""}`}
                  opacity={opacidadeDaMarca(algumAceso, acesa)}
                  onClick={clique}
                  role={clique ? "button" : undefined}
                  aria-pressed={clique ? acesa : undefined}
                >
                  {/* uma fatia só não fecha com arco: 360° tem começo e
                      fim no mesmo ponto e o caminho sai vazio */}
                  {vivas.length === 1 ? (
                    <circle cx={cx} cy={cy} r={r} fill={f.cor}>
                      <title>{rotulo}</title>
                    </circle>
                  ) : (
                    <path
                      d={`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${grande},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`}
                      fill={f.cor}
                      stroke="var(--color-papel)"
                      strokeWidth={2}
                    >
                      <title>{rotulo}</title>
                    </path>
                  )}
                  {fracao > 0.08 && (
                    <text
                      x={tx} y={ty} textAnchor="middle" dominantBaseline="middle"
                      className="ind-valor-svg"
                      style={{ fill: "#fff", fontSize: Math.min(13, r * 0.24) }}
                      pointerEvents="none"
                    >
                      {pct(f.valor, total)}%
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        );
      }}
    </Tela>
  );
}

/**
 * Gravidade dos erros em pizza, com a legenda embaixo.
 *
 * Mora aqui, e não em Pecas, porque virou desenho: se ficasse lá, Pecas
 * importaria Graficos e Graficos importaria Pecas — um ciclo que o
 * empacotador até resolve, mas que quebra do nada quando a ordem de
 * carga muda.
 *
 * A legenda continua trazendo nome e número de cada gravidade: ninguém
 * precisa medir ângulo para saber quantos críticos existem, e cor nunca
 * identifica sozinha.
 */
export function BarraGravidade({
  r,
  aoRecortar,
  aceso,
}: { r: Resumo } & Clicavel) {
  const total = r.critico + r.medio + r.baixo;
  if (!total) return <Vazio>Nenhum desvio no período.</Vazio>;
  /* `chave` é o valor gravado na coluna criticidade; `nome` é como a
     fábrica fala. Os dois separados porque o recorte compara o do banco
     e a tela mostra o outro. */
  const faixas = [
    { nome: "Crítico", chave: "CRITICO", v: r.critico, cor: COR.CRITICO },
    { nome: "Médio", chave: "MEDIO", v: r.medio, cor: COR.MEDIO },
    { nome: "Baixo", chave: "BAIXO", v: r.baixo, cor: COR.BAIXO },
  ];
  return (
    <div className="ind-pizza">
      <Pizza
        fatias={faixas.map((f) => ({
          nome: f.nome,
          valor: f.v,
          cor: f.cor,
          chave: f.chave,
        }))}
        campo="criticidade"
        aoRecortar={aoRecortar}
        aceso={aceso}
      />
      <div className="ind-legenda">
        {faixas.map((f) => {
          const estaAceso = !!aceso && aceso("criticidade", f.chave);
          const dica = `${f.nome}: ${nBR(f.v)} desvios, ${pct(f.v, total)}% do total`;
          /* A legenda recorta igual à fatia: numa gravidade de 3% a fatia
             é um risco, e mirar nela com o dedo é sorte. */
          return (
            <span
              key={f.nome}
              className={`dica-alvo${aoRecortar ? " ind-clicavel" : ""}`}
              title={
                dica +
                (aoRecortar
                  ? estaAceso
                    ? " · clique para tirar o recorte"
                    : " · clique para recortar o painel"
                  : "")
              }
              tabIndex={0}
              role={aoRecortar ? "button" : undefined}
              aria-pressed={aoRecortar ? estaAceso : undefined}
              onClick={aoRecortar && (() => aoRecortar("criticidade", f.chave))}
              style={aoRecortar && estaAceso ? { fontWeight: 700 } : undefined}
            >
              <i style={{ background: f.cor }} />
              {f.nome} <b>{nBR(f.v)}</b> · {pct(f.v, total)}%
              <Dica lado="esq">
                <b>{f.nome}</b>
                <br />
                {nBR(f.v)} desvios · {pct(f.v, total)}% do total
              </Dica>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Erros por dia                                                       */
/* ------------------------------------------------------------------ */
/** Erros por dia de inspeção, em colunas com o número em cima. */
export function ColunasDias({
  dias,
  aoRecortar,
  aceso,
}: { dias: { data: string; n: number }[] } & Clicavel) {
  if (!dias.length) return <Vazio>Nenhum desvio no período.</Vazio>;

  const algumAceso = !!aceso && dias.some((d) => aceso("dia", d.data));

  return (
    <Tela altura={ALTURA.area}>
      {(caixa, medida) => {
        /* esq de 12, e não 26: o "máximo" que morava na lateral saiu
           junto com os outros eixos Y. Aqui ele dizia menos ainda que
           nos gráficos de FPY — a escala muda a cada filtro —, e o
           número em cima de cada coluna já dá o valor exato. */
        const m = { topo: 22, dir: 8, base: 22, esq: 12 };
        /* mesma regra dos outros: todo dia tem nome embaixo dele, nem
           que para isso o desenho passe da caixa e o cartão role */
        const eixo = eixoDeTodos(dias.map((d) => diaCurto(d.data)));
        const L = Math.max(caixa, m.esq + m.dir + dias.length * eixo.passoMinimo);
        const rola = L > caixa;
        const A = rola ? Math.max(110, medida - 10) : medida;

        const larg = L - m.esq - m.dir;
        const alt = A - m.topo - m.base;
        const max = Math.max(...dias.map((d) => d.n), 1);
        const passo = larg / dias.length;
        const w = Math.max(2, Math.min(30, passo * 0.62));
        const x = (i: number) => m.esq + (i + 0.5) * passo;
        const y = (v: number) => m.topo + alt - (v / max) * alt;

        const fonte = fonteDoValor(passo);
        const cabe = rotulosQueCabem(
          dias.map((d) => nBR(d.n)),
          x,
          fonte
        );
        const fonteEixo = eixo.fonte(passo);

        return (
          <svg width={L} height={A} role="img" aria-label="desvios por dia de inspeção">
            <line className="ind-malha" x1={m.esq} x2={L - m.dir} y1={m.topo + alt} y2={m.topo + alt} />
            {dias.map((d, i) => {
              const estaAceso = !!aceso && aceso("dia", d.data);
              return (
              <g
                key={d.data}
                className={`ind-alvo${aoRecortar ? " ind-clicavel" : ""}`}
                opacity={opacidadeDaMarca(algumAceso, estaAceso)}
              >
                <rect
                  x={x(i) - passo / 2} y={m.topo} width={passo} height={alt}
                  fill="transparent"
                  onClick={aoRecortar && (() => aoRecortar("dia", d.data))}
                  role={aoRecortar ? "button" : undefined}
                  aria-pressed={aoRecortar ? estaAceso : undefined}
                >
                  <title>
                    {`${diaCurto(d.data)}: ${nBR(d.n)} ${d.n === 1 ? "desvio" : "desvios"}` +
                      (aoRecortar
                        ? estaAceso
                          ? " · clique para tirar o recorte"
                          : " · clique para ver o painel só deste dia"
                        : "")}
                  </title>
                </rect>
                <rect
                  x={x(i) - w / 2} y={y(d.n)} width={w}
                  height={Math.max(1.5, m.topo + alt - y(d.n))}
                  rx={Math.min(3, w / 2)} fill="var(--color-alta)"
                  pointerEvents="none"
                />
                {cabe[i] && (
                  <text
                    className="ind-valor-svg" x={x(i)} y={y(d.n) - 4}
                    textAnchor="middle" style={{ fontSize: fonte }}
                    pointerEvents="none"
                  >
                    {nBR(d.n)}
                  </text>
                )}
              </g>
              );
            })}
            {dias.map((d, i) => (
              <text
                key={`r${d.data}`}
                className="ind-eixo"
                x={x(i)}
                y={A - 7}
                textAnchor="middle"
                style={{ fontSize: fonteEixo }}
              >
                {diaCurto(d.data)}
              </text>
            ))}
          </svg>
        );
      }}
    </Tela>
  );
}


/* ------------------------------------------------------------------ */
/* Fluxo da produção                                                   */
/* ------------------------------------------------------------------ */
/**
 * Onde as paredes param, em LISTA: nome, barra, número e porcentagem.
 *
 * Era um desenho de faixas encaixadas em três andares, e ele brigava com
 * o espaço em todas as larguras: o rótulo só cabia dentro da faixa se a
 * faixa fosse larga, os textos dos andares colidiam quando o cartão
 * encolhia, e o que ele mostrava — proporção — já estava dito pelo
 * tamanho da faixa. Em lista, cada estado tem sua linha e nada depende
 * de caber.
 *
 * Os quatro estados fecham exatamente as paredes processadas: cada
 * parede cai em um deles e em nenhum outro (ver fluxoDe). Por isso as
 * porcentagens somam 100 e a barra pode ser lida como fatia do todo.
 */
export function FluxoProducao({ f }: { f: Fluxo }) {
  if (!f.processadas) return <Vazio>Nenhuma parede auditada no período.</Vazio>;

  const destinos = [
    {
      nome: "Passou de primeira",
      v: f.aceitas,
      cor: "var(--color-brand)",
      dica: "Saiu da auditoria sem nenhum desvio registrado.",
    },
    {
      nome: "Retrabalhada e aprovada",
      v: f.retrabalhadas,
      cor: "var(--color-brand-forte)",
      dica: "Teve desvio, foi corrigida, e a gestão aprovou o retrabalho.",
    },
    {
      nome: "Aguardando aprovação",
      v: f.aguardaAprovacao,
      cor: "var(--color-media)",
      dica: "O retrabalho foi marcado como feito e espera a conferência da gestão.",
    },
    {
      nome: "Ainda em aberto",
      v: f.emAberto,
      cor: "var(--color-alta)",
      dica: "Continua com pelo menos um desvio esperando a produção agir.",
    },
  ].filter((d) => d.v > 0);

  return (
    <div className="ind-linhas">
      {destinos.map((d) => {
        const p = pct(d.v, f.processadas);
        return (
          <div
            key={d.nome}
            className="ind-item dica-alvo"
            title={`${d.nome}: ${nBR(d.v)} de ${nBR(f.processadas)} paredes, ${p}%. ${d.dica}`}
            tabIndex={0}
          >
            <span className="ind-nome">{d.nome}</span>
            <span className="ind-val">
              {nBR(d.v)} <em>{p}%</em>
            </span>
            <span className="ind-trilho">
              <i style={{ width: `${p}%`, background: d.cor }} />
            </span>
            <Dica lado="esq">
              <b>{d.nome}</b>
              <br />
              {nBR(d.v)} de {nBR(f.processadas)} paredes · {p}%
              <br />
              {d.dica}
            </Dica>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Faixinha de tendência dentro da tabela                              */
/* ------------------------------------------------------------------ */
export function Tendencia({ valores }: { valores: number[] }) {
  const max = Math.max(...valores, 0.0001);
  return (
    <span
      className="ind-mini"
      title={valores.map((v) => dBR(v)).join(" · ")}
      aria-label={`evolução: ${valores.map((v) => dBR(v)).join(", ")}`}
    >
      {valores.map((v, i) => (
        <i key={i} style={{ height: Math.max(1, (v / max) * 18) }} />
      ))}
    </span>
  );
}
