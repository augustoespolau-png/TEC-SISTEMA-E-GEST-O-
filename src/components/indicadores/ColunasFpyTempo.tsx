"use client";

import type { FpyNoTempo } from "@/lib/indicadores";
import { LinhaFpyTempo } from "./Graficos";
import type { Clicavel } from "./clique";

/**
 * FPY temporal no padrão histórico do painel: linha verde + área preenchida,
 * pontos coloridos por meta, valores no topo e rótulos na base.
 * Dia e semana compartilham exatamente o mesmo acabamento visual.
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
