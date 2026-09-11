import type { TempoSetor } from "@/lib/dashboard";
import CartaoPn, { AguardandoDados } from "./CartaoPn";

const META = 3; // dias
const LIMITE = 7;

/** Mediana de dias entre o registro do erro e o retrabalho concluído. */
export default function TempoRetrabalho({ setores }: { setores: TempoSetor[] }) {
  const max = Math.max(LIMITE, ...setores.map((s) => s.mediana));

  return (
    <CartaoPn
      classe="col-5"
      titulo="Tempo de retrabalho por setor"
      subtitulo={`Mediana de dias entre registrar o desvio e concluir o retrabalho · meta ≤ ${META} d`}
    >
      {setores.length === 0 ? (
        <AguardandoDados o_que="O tempo de retrabalho" />
      ) : (
        <>
          {setores.map((s) => {
            const cor =
              s.mediana > LIMITE
                ? "var(--color-alta)"
                : s.mediana > META
                  ? "var(--color-media)"
                  : "var(--color-baixa)";
            return (
              <div className="bar" key={s.setor}>
                <span className="n">{s.setor}</span>
                <span className="trilho">
                  <i
                    style={{
                      width: `${(s.mediana / max) * 100}%`,
                      background: cor,
                    }}
                  />
                </span>
                <span className="q mono" style={{ color: cor }}>
                  {s.mediana.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  d
                  <span style={{ color: "var(--color-ink-3)" }}> ·{s.amostra}</span>
                </span>
              </div>
            );
          })}
          <div className="legenda">
            <span>
              <i style={{ background: "var(--color-baixa)" }} />
              dentro da meta
            </span>
            <span>
              <i style={{ background: "var(--color-media)" }} />
              acima da meta
            </span>
            <span>
              <i style={{ background: "var(--color-alta)" }} />
              acima de {LIMITE} d
            </span>
          </div>
        </>
      )}
    </CartaoPn>
  );
}
