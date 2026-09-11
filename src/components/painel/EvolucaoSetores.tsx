import type { EvolucaoSetor } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";

/** Mini-séries semanais dos setores mais problemáticos, mesma escala. */
export default function EvolucaoSetores({
  setores,
}: {
  setores: EvolucaoSetor[];
}) {
  const max = Math.max(1, ...setores.flatMap((s) => s.serie.map((p) => p.qtd)));

  return (
    <CartaoPn
      classe="col-5"
      titulo="Evolução dos setores"
      subtitulo="Semanas na mesma escala — a última barra é a semana mais recente"
    >
      {setores.length === 0 ? (
        <SemDados />
      ) : (
        <div className="flex flex-col gap-3">
          {setores.map((s) => (
            <div key={s.setor} className="flex items-end gap-3">
              <div style={{ width: 92, flexShrink: 0 }}>
                <div style={{ fontSize: 12, color: "var(--color-ink)" }}>
                  {s.setor}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: "var(--color-ink-3)" }}
                >
                  {s.total} erros
                </div>
              </div>
              <div
                className="flex flex-1 items-end gap-[3px]"
                style={{ height: 34 }}
                title={s.serie.map((p) => `${p.rotulo}: ${p.qtd}`).join(" · ")}
              >
                {s.serie.map((p, i) => (
                  <div
                    key={p.rotulo}
                    style={{
                      flex: 1,
                      minWidth: 3,
                      height: p.qtd === 0 ? 2 : `${(p.qtd / max) * 100}%`,
                      borderRadius: "2px 2px 0 0",
                      background:
                        p.qtd === 0
                          ? "var(--color-line)"
                          : i === s.serie.length - 1
                            ? "var(--color-brand)"
                            : "var(--color-baixa)",
                    }}
                  />
                ))}
              </div>
              <span
                style={{
                  fontSize: 11,
                  width: 74,
                  textAlign: "right",
                  flexShrink: 0,
                  color:
                    s.direcao === 1
                      ? "var(--color-alta)"
                      : s.direcao === -1
                        ? "var(--color-baixa)"
                        : "var(--color-ink-3)",
                  fontWeight: s.direcao === 0 ? 400 : 700,
                }}
              >
                {s.direcao === 1
                  ? "↑ piorou"
                  : s.direcao === -1
                    ? "↓ melhorou"
                    : "→ estável"}
              </span>
            </div>
          ))}
          <p className="sub">
            Comparação da última semana com a média das anteriores.
          </p>
        </div>
      )}
    </CartaoPn>
  );
}
