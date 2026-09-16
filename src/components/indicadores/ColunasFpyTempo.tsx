"use client";

import type { FpyNoTempo } from "@/lib/indicadores";
import { LinhaFpyTempo } from "./Graficos";
import type { Clicavel } from "./clique";

/**
 * Compatibilidade para a folha FPY.
 *
 * O visual temporal volta ao padrão histórico do painel:
 * linha verde, área preenchida, pontos coloridos por meta, valor no topo
 * e período na base. Mantemos este wrapper para não alterar a composição
 * da folha nem a lógica de filtros/cálculo.
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
