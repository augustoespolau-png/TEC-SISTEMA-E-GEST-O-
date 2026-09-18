"use client";

import type { FpyNoTempo } from "@/lib/indicadores";
import { LinhaFpyTempo } from "./Graficos";
import type { Clicavel } from "./clique";

/**
 * FPY temporal (dia e semana) usa a mesma leitura de tendência:
 * linha, área, meta tracejada e pontos com o veredito do período.
 *
 * O componente mantém o nome e a API histórica para não alterar a
 * arquitetura das folhas nem dos recortes. A semana deixou de ter uma
 * apresentação de Pareto porque a pergunta aqui é evolução no tempo,
 * exatamente como no gráfico de referência.
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
  return (
    <LinhaFpyTempo
      pontos={pontos}
      meta={meta}
      unidade={unidade}
      aoRecortar={aoRecortar}
      aceso={aceso}
    />
  );
}
