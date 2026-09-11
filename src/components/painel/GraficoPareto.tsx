import type { ItemPareto } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";
import { AvisoClique, Linha } from "./Interativo";

/** Os poucos tipos que causam a maior parte do retrabalho. */
export default function GraficoPareto({
  itens,
  total,
  aoFiltrar,
  ativo,
}: {
  itens: ItemPareto[];
  /** total do recorte atual, para a dica dizer quanto a barra representa */
  total: number;
  aoFiltrar?: (tipo: string) => void;
  ativo?: (tipo: string) => boolean;
}) {
  const max = Math.max(1, ...itens.map((i) => i.qtd));
  const vitais = itens.filter((i) => !i.outros && i.acumPct <= 80).length || 1;
  const pctVitais = itens[Math.min(vitais, itens.length) - 1]?.acumPct ?? 0;

  return (
    <CartaoPn
      classe="col-4"
      titulo="Pareto — onde atacar primeiro"
      subtitulo={`${vitais} tipos concentram ${pctVitais}% de todo o retrabalho`}
    >
      {itens.length === 0 ? (
        <SemDados />
      ) : (
        <>
          {itens.map((i, idx) => (
            <Linha
              key={i.nome}
              /* "Outros" é um agregado de vários tipos: não vira recorte */
              aoClicar={
                i.outros || !aoFiltrar ? undefined : () => aoFiltrar(i.nome)
              }
              ativo={ativo?.(i.nome)}
              titulo={`${i.nome}: ${i.qtd} de ${total}`}
              dica={
                <>
                  <b>{i.nome}</b>
                  <br />
                  {i.qtd} de {total} erros · {i.pct}% do total
                  <br />
                  acumulado até aqui: {i.acumPct}%
                </>
              }
            >
              <span className="n">{i.nome}</span>
              <span className="trilho">
                <i
                  style={{
                    width: `${(i.qtd / max) * 100}%`,
                    background: i.outros
                      ? "var(--color-ink-3)"
                      : idx < vitais
                        ? "var(--color-baixa)"
                        : "var(--color-line-2)",
                  }}
                />
              </span>
              <span className="q mono">
                {i.qtd}
                <span style={{ color: "var(--color-ink-3)" }}>
                  {" "}
                  ·{i.acumPct}%
                </span>
              </span>
            </Linha>
          ))}
          {aoFiltrar && <AvisoClique o_que="um tipo de desvio" />}
        </>
      )}
    </CartaoPn>
  );
}
