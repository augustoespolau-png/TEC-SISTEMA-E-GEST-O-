import type { BarraSetor } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";
import { AvisoClique, Linha } from "./Interativo";

/** Volume por setor, empilhado por criticidade. */
export default function VolumeSetores({
  barras,
  aoFiltrar,
  ativo,
}: {
  barras: BarraSetor[];
  aoFiltrar?: (setor: string) => void;
  ativo?: (setor: string) => boolean;
}) {
  const max = Math.max(1, ...barras.map((b) => b.total));
  const total = barras.reduce((s, b) => s + b.total, 0);

  return (
    <CartaoPn
      classe="col-5"
      titulo="Volume por setor"
      subtitulo="Setor onde o desvio foi detectado — não necessariamente onde foi criado"
    >
      {barras.length === 0 ? (
        <SemDados />
      ) : (
        <>
          {barras.map((b) => (
            <Linha
              key={b.setor}
              aoClicar={aoFiltrar ? () => aoFiltrar(b.setor) : undefined}
              ativo={ativo?.(b.setor)}
              titulo={`${b.setor}: ${b.total} desvios`}
              dica={
                <>
                  <b>{b.setor}</b> · {b.total} erros
                  {total > 0 && ` (${Math.round((b.total / total) * 100)}%)`}
                  <br />
                  {b.porCrit.CRITICO} críticos · {b.porCrit.MEDIO} médios ·{" "}
                  {b.porCrit.BAIXO} baixos
                </>
              }
            >
              <span className="n">{b.setor}</span>
              <span
                className="trilho"
                style={{ width: `${(b.total / max) * 100}%` }}
              >
                {b.porCrit.CRITICO > 0 && (
                  <i
                    style={{
                      flexGrow: b.porCrit.CRITICO,
                      background: "var(--color-alta)",
                    }}
                  />
                )}
                {b.porCrit.MEDIO > 0 && (
                  <i
                    style={{
                      flexGrow: b.porCrit.MEDIO,
                      background: "var(--color-media)",
                    }}
                  />
                )}
                {b.porCrit.BAIXO > 0 && (
                  <i
                    style={{
                      flexGrow: b.porCrit.BAIXO,
                      background: "var(--color-baixa)",
                    }}
                  />
                )}
              </span>
              <span className="q mono">{b.total}</span>
            </Linha>
          ))}
          <div className="legenda">
            <span>
              <i style={{ background: "var(--color-alta)" }} />
              Crítico
            </span>
            <span>
              <i style={{ background: "var(--color-media)" }} />
              Médio
            </span>
            <span>
              <i style={{ background: "var(--color-baixa)" }} />
              Baixo
            </span>
          </div>
          {aoFiltrar && <AvisoClique o_que="um setor" />}
        </>
      )}
    </CartaoPn>
  );
}
