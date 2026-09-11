import type { Eficiencia } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";
import { AvisoClique, Linha } from "./Interativo";

const META = 90;

/** Quanto do que foi registrado já virou retrabalho aprovado. */
export default function GraficoEficiencia({
  titulo,
  subtitulo,
  itens,
  classe = "col-4",
  aoFiltrar,
  ativo,
}: {
  titulo: string;
  subtitulo?: string;
  itens: Eficiencia[];
  classe?: string;
  aoFiltrar?: (nome: string) => void;
  ativo?: (nome: string) => boolean;
}) {
  return (
    <CartaoPn classe={classe} titulo={titulo} subtitulo={subtitulo}>
      {itens.length === 0 ? (
        <SemDados />
      ) : (
        <>
          {itens.map((e) => {
            const cor =
              e.pctResolvido >= META
                ? "var(--color-baixa)"
                : e.pctResolvido >= 75
                  ? "var(--color-media)"
                  : "var(--color-alta)";
            return (
              <Linha
                key={e.nome}
                aoClicar={aoFiltrar ? () => aoFiltrar(e.nome) : undefined}
                ativo={ativo?.(e.nome)}
                titulo={`${e.nome}: ${e.pctResolvido}% resolvido`}
                dica={
                  <>
                    <b>{e.nome}</b> · {e.total} erros
                    <br />
                    {e.retrabalhadas} retrabalhados e aprovados ({e.pctResolvido}
                    %)
                    <br />
                    {e.pendAprovacao} esperando aprovação da gestão
                    <br />
                    {e.aguardando} aguardando · {e.naoConformidades} não
                    conformidades · {e.bloqueadas} bloqueadas
                  </>
                }
              >
                <span className="n">
                  {e.nome}
                  <span
                    className="mono"
                    style={{ color: "var(--color-ink-3)" }}
                  >
                    {" "}
                    ·{e.total}
                  </span>
                </span>
                {/* ordem validada para daltonismo: nenhum par vizinho se
                    confunde em deuteranopia nem em tritanopia */}
                <span className="trilho">
                  {(
                    [
                      [e.retrabalhadas, "var(--color-baixa)"],
                      [e.pendAprovacao, "var(--color-espera)"],
                      [e.aguardando, "var(--color-media)"],
                      [e.bloqueadas, "var(--color-info)"],
                      [e.naoConformidades, "var(--color-alta)"],
                    ] as const
                  ).map(([v, c], i) =>
                    v === 0 ? null : (
                      <i key={i} style={{ flexGrow: v, background: c }} />
                    )
                  )}
                </span>
                <span className="q mono" style={{ color: cor }}>
                  {e.pctResolvido}%
                </span>
              </Linha>
            );
          })}
          <div className="legenda">
            <span>
              <i style={{ background: "var(--color-baixa)" }} />
              Retrabalhadas
            </span>
            <span>
              <i style={{ background: "var(--color-espera)" }} />
              Aguardando aprovação
            </span>
            <span>
              <i style={{ background: "var(--color-media)" }} />
              Aguardando
            </span>
            <span>
              <i style={{ background: "var(--color-info)" }} />
              Bloqueadas
            </span>
            <span>
              <i style={{ background: "var(--color-alta)" }} />
              Não conformidades
            </span>
          </div>
          {aoFiltrar && <AvisoClique />}
        </>
      )}
    </CartaoPn>
  );
}
