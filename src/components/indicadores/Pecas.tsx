"use client";

import { Dica } from "@/components/painel/Interativo";
import type { CampoRecorte } from "@/lib/dashboard";
import type { ItemRanking } from "@/lib/indicadores";
import type { Clicavel } from "./clique";

/*
 * Peças repetidas nas três folhas: cartão, número grande, barra de
 * gravidade e ranking horizontal.
 *
 * Sobre a cor de BAIXO: no sistema ela é verde (--color-baixa). Medido
 * em OKLab, esse verde fica a ΔE 11 do verde da marca — abaixo do piso
 * de 15 para visão normal, ou seja, no mesmo gráfico ninguém separa os
 * dois. Aqui BAIXO usa --color-baixa-graf (azul, ΔE 26 a 37). O verde
 * da marca só aparece no fluxo, contra o vermelho, e lá sempre com o
 * rótulo escrito ao lado — cor nunca identifica sozinha.
 */

export const COR = {
  CRITICO: "var(--color-alta)",
  MEDIO: "var(--color-media)",
  BAIXO: "var(--color-baixa-graf)",
} as const;

export const nBR = (n: number) => new Intl.NumberFormat("pt-BR").format(n);
export const dBR = (n: number, casas = 2) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(n);

export function Cartao({
  titulo,
  nota,
  largura = "cheio",
  children,
}: {
  titulo: string;
  nota?: string;
  /** meio = metade da grade em telas largas */
  largura?: "cheio" | "meio" | "terco" | "quarto" | "doisTercos";
  children: React.ReactNode;
}) {
  return (
    <section className={`cartao ind-${largura}`}>
      <h3 className="titulo-secao">{titulo}</h3>
      {nota && <p className="sub">{nota}</p>}
      <div className="corpo">{children}</div>
    </section>
  );
}

export interface Indicador {
  rotulo: string;
  valor: string;
  pe?: string;
  tom?: "alta" | "marca";
  /** o que o número quer dizer; aparece ao passar o ponteiro */
  dica?: string;
  /**
   * Barrinha de 0 a 100 com a meta marcada, para os números que são
   * percentual de meta — hoje, os três FPY.
   *
   * Cabe na régua porque é só um risco de 4px: o número continua sendo
   * o que se lê, e a barra responde de relance o que o número sozinho
   * não responde — falta quanto para a meta. `null` no valor desenha o
   * trilho vazio, sem acusar resultado que não houve.
   */
  barra?: { valor: number | null; meta: number };
}

/**
 * Os números de abertura, numa faixa só.
 *
 * Antes eram quatro cartões separados: quatro molduras, quatro sombras e
 * quatro recuos para quatro números. Numa faixa única com fios de
 * divisão, o olho lê a linha inteira de uma vez e sobra espaço para o
 * que de fato precisa dele — os gráficos.
 */
export function FaixaNumeros({ itens }: { itens: Indicador[] }) {
  return (
    <section className="cartao ind-faixa-num">
      {itens.map((i) => (
        <div
          key={i.rotulo}
          className={`ind-num-item${i.dica ? " dica-alvo" : ""}`}
          title={i.dica ? `${i.rotulo}: ${i.dica}` : undefined}
          tabIndex={i.dica ? 0 : undefined}
        >
          <div className="ind-rot">{i.rotulo}</div>
          <div className={`ind-num ${i.tom ? "t-" + i.tom : ""}`}>{i.valor}</div>
          {i.barra && (
            <div className="ind-regua" aria-hidden>
              <i
                className={i.tom === "marca" ? "t-marca" : "t-alta"}
                style={{ width: `${i.barra.valor ?? 0}%` }}
              />
              <span style={{ left: `${i.barra.meta}%` }} />
            </div>
          )}
          {i.pe && <div className="ind-pe">{i.pe}</div>}
          {i.dica && (
            <Dica lado="esq">
              <b>{i.rotulo}</b>
              <br />
              {i.dica}
            </Dica>
          )}
        </div>
      ))}
    </section>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="ind-vazio">{children}</p>;
}

export function Ranking({
  itens,
  cor,
  sufixo = "ocorrências",
  campo,
  aoRecortar,
  aceso,
}: {
  itens: ItemRanking[];
  cor: string;
  sufixo?: string;
  /** o campo que uma linha representa, quando ela recorta o painel */
  campo?: CampoRecorte;
} & Clicavel) {
  if (!itens.length) return <Vazio>Nada no período.</Vazio>;
  const max = Math.max(...itens.map((i) => i.qtd), 1);
  const clicavel = !!(campo && aoRecortar);
  const algumAceso = !!(
    campo &&
    aceso &&
    itens.some((i) => aceso(campo, i.nome))
  );
  return (
    <div className="ind-linhas">
      {itens.map((i) => {
        const estaAceso = !!(campo && aceso && aceso(campo, i.nome));
        return (
          <div
            key={i.nome}
            className={`ind-item dica-alvo${clicavel ? " ind-clicavel" : ""}`}
            title={
              `${i.nome}: ${nBR(i.qtd)} ${sufixo}, ${i.pct}%` +
              (clicavel
                ? estaAceso
                  ? " · clique para tirar o recorte"
                  : " · clique para recortar o painel"
                : "")
            }
            tabIndex={0}
            role={clicavel ? "button" : undefined}
            aria-pressed={clicavel ? estaAceso : undefined}
            onClick={clicavel ? () => aoRecortar!(campo!, i.nome) : undefined}
            style={
              algumAceso && !estaAceso ? { opacity: 0.35 } : undefined
            }
          >
            <span className="ind-nome">{i.nome}</span>
            <span className="ind-val">
              {nBR(i.qtd)} <em>{i.pct}%</em>
            </span>
            <span className="ind-trilho">
              <i style={{ width: `${(i.qtd / max) * 100}%`, background: cor }} />
            </span>
            <Dica lado="esq">
              <b>{i.nome}</b>
              <br />
              {nBR(i.qtd)} {sufixo} · {i.pct}% do total
            </Dica>
          </div>
        );
      })}
    </div>
  );
}

/** Variação percentual: queda é boa notícia, alta é má. */
export function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="ind-fraco">novo</span>;
  const classe = v < 0 ? "ind-melhora" : v > 0 ? "ind-piora" : "";
  return (
    <span className={classe}>
      {v > 0 ? "+" : ""}
      {v}%
    </span>
  );
}
