import type { DadosMapa } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";

function tom(v: number, max: number) {
  if (v === 0) return { background: "var(--color-papel-2)", color: "transparent" };
  const r = v / max;
  const alpha = 0.15 + r * 0.85;
  return {
    background: `color-mix(in srgb, var(--color-baixa) ${Math.round(alpha * 100)}%, transparent)`,
    color: r > 0.5 ? "#04140f" : "var(--color-ink)",
    fontWeight: r > 0.5 ? 700 : 500,
  };
}

/** Onde cada tipo de erro se concentra — cruzamento setor × tipo. */
export default function MapaCalor({
  dados,
  aoFiltrar,
}: {
  dados: DadosMapa;
  /** o clique numa célula filtra pelos DOIS eixos ao mesmo tempo */
  aoFiltrar?: (setor: string, tipo: string) => void;
}) {
  const hot = dados.setores.length > 0 && dados.max > 0;

  return (
    <CartaoPn
      classe="col-4"
      titulo="Concentração setor × tipo"
      subtitulo="Hotspots: onde um tipo específico se repete num setor específico"
    >
      {!hot ? (
        <SemDados />
      ) : (
        <>
          <div className="rolagem">
            <table className="mapa">
              <thead>
                <tr>
                  <th />
                  {dados.tipos.map((t) => (
                    <th key={t} title={t}>
                      {t.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.setores.map((s) => (
                  <tr key={s}>
                    <th
                      style={{
                        textAlign: "right",
                        paddingRight: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s}
                    </th>
                    {dados.tipos.map((t) => {
                      const v = dados.valores[`${s}|${t}`] ?? 0;
                      // célula vazia não filtra: levaria a uma tela em branco
                      const clicavel = v > 0 && !!aoFiltrar;
                      return (
                        <td
                          key={t}
                          className={`mono ${clicavel ? "clicavel" : ""}`}
                          style={tom(v, dados.max)}
                          onClick={
                            clicavel ? () => aoFiltrar(s, t) : undefined
                          }
                          /* balão de HTML aqui seria cortado pela rolagem
                             horizontal da tabela: a dica é o title nativo */
                          title={
                            v === 0
                              ? `${s} × ${t}: nenhum desvio`
                              : `${s} × ${t}: ${v} ${v === 1 ? "desvio" : "desvios"}${
                                  clicavel
                                    ? " — clique para ver só este cruzamento"
                                    : ""
                                }`
                          }
                        >
                          {v || "·"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {aoFiltrar && (
            <p className="sub" style={{ marginTop: 10 }}>
              Cada célula é um cruzamento. Toque numa para filtrar o painel por
              aquele setor e aquele tipo ao mesmo tempo.
            </p>
          )}
        </>
      )}
    </CartaoPn>
  );
}
