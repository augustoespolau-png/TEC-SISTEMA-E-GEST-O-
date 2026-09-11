import type { Fpy, PontoFpy } from "@/lib/dashboard";
import CartaoPn from "./CartaoPn";

const META = 95;

/**
 * First Pass Yield: quantas paredes passaram de primeira, sem retrabalho.
 * O denominador vem das paredes conferidas na aba Auditoria — por isso o
 * indicador só existe para casas que passaram por auditoria completa.
 */
export default function CartaoFpy({
  fpy,
  serie,
}: {
  fpy: Fpy;
  serie: PontoFpy[];
}) {
  const vazio = fpy.fpy === null;
  const cor =
    fpy.fpy === null
      ? "var(--color-ink-3)"
      : fpy.fpy >= META
        ? "var(--color-baixa)"
        : fpy.fpy >= 85
          ? "var(--color-media)"
          : "var(--color-alta)";

  return (
    <CartaoPn
      classe="col-7"
      titulo="First Pass Yield — passou de primeira"
      subtitulo={`Paredes sem nenhum desvio ÷ paredes conferidas na auditoria · meta ≥ ${META}%`}
    >
      {vazio ? (
        <div
          className="rounded-lg border border-dashed p-4 text-[12px] leading-relaxed"
          style={{
            borderColor: "var(--color-line-2)",
            color: "var(--color-ink-3)",
          }}
        >
          <b style={{ color: "var(--color-ink-2)" }}>
            Nenhuma casa auditada ainda.
          </b>{" "}
          O FPY precisa saber quantas paredes foram conferidas, não só quantas
          deram problema. Use a aba <b>Auditoria</b>: ao percorrer a casa e
          marcar as paredes sem erro, o indicador se forma sozinho.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div
                className="mono leading-none font-black"
                style={{ fontSize: 46, color: cor }}
              >
                {fpy.fpy}
                <span style={{ fontSize: 22 }}>%</span>
              </div>
              <div className="mt-1 text-[11.5px] text-ink-3">
                {fpy.passaram} de {fpy.conferidas} paredes · {fpy.casas}{" "}
                {fpy.casas === 1 ? "casa" : "casas"}
              </div>
              {fpy.medidas > 0 && fpy.reconstruidas > 0 && (
                <div className="mt-1 text-[11.5px]">
                  <b style={{ color: "var(--color-baixa)" }}>
                    {fpy.fpyMedido}%
                  </b>{" "}
                  <span className="text-ink-3">
                    nas {fpy.medidas} paredes auditadas no sistema
                  </span>
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] tracking-wider text-ink-3 uppercase">
                Defeitos por parede
              </div>
              <div className="mono text-[26px] font-black">{fpy.dpu}</div>
              <div className="text-[11px] text-ink-3">
                intensidade que o FPY não mostra
              </div>
            </div>

            <div className="min-w-40 flex-1">
              <div className="mb-1.5 flex justify-between text-[10.5px] text-ink-3">
                <span>0%</span>
                <span>meta {META}%</span>
              </div>
              <div
                className="relative h-3 overflow-hidden rounded-full"
                style={{ background: "var(--color-papel-2)" }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${fpy.fpy}%`,
                    background: cor,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${META}%`,
                    width: 2,
                    background: "var(--color-ink-2)",
                  }}
                />
              </div>
            </div>
          </div>

          {fpy.reconstruidas > 0 && (
            <p
              className="mt-3 rounded-lg border border-dashed p-2.5 text-[11.5px] leading-relaxed"
              style={{
                borderColor: "var(--color-line-2)",
                color: "var(--color-ink-3)",
              }}
            >
              {fpy.reconstruidas} destas paredes vêm de{" "}
              <b style={{ color: "var(--color-ink-2)" }}>
                auditoria reconstruída
              </b>{" "}
              do histórico da planilha: assumiu-se que toda parede sem erro
              anotado passou de primeira. É uma referência, não uma medição —
              o número medido de verdade é o das auditorias feitas no sistema.
            </p>
          )}

          {serie.length > 1 && (
            <div className="mt-4">
              <div className="mb-2 text-[10px] tracking-wider text-ink-3 uppercase">
                Por semana
              </div>
              <div className="flex items-end gap-2" style={{ height: 56 }}>
                {serie.map((p) => (
                  <div
                    key={p.semana}
                    className="flex flex-1 flex-col items-center gap-1"
                    title={`${p.rotulo}: ${p.fpy}% (${p.passaram}/${p.conferidas})`}
                  >
                    <span className="mono text-[9.5px] text-ink-3">
                      {p.fpy}
                    </span>
                    <div
                      className="w-full rounded-t-[2px]"
                      style={{
                        height: `${Math.max(3, p.fpy * 0.35)}px`,
                        background:
                          p.fpy >= META
                            ? "var(--color-baixa)"
                            : "var(--color-media)",
                      }}
                    />
                    <span className="mono text-[9px] text-ink-3">
                      {p.rotulo}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </CartaoPn>
  );
}
