import type { DiagnosticoParede } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";

const META = 95;

function cor(fpy: number) {
  if (fpy >= META) return "var(--color-baixa)";
  if (fpy >= 75) return "var(--color-media)";
  return "var(--color-alta)";
}

/** Intensidade do vermelho conforme a posição falha mais. */
function fundoMapa(fpy: number) {
  const falha = Math.min(100, Math.max(0, 100 - fpy));
  return `color-mix(in srgb, var(--color-alta) ${Math.round(12 + falha * 0.78)}%, transparent)`;
}

/**
 * Onde está o gargalo: cada posição de parede com quanto passa de
 * primeira e quais problemas mais aparecem nela. Uma posição que falha
 * em várias casas aponta gabarito ou projeto, não operador.
 */
export default function DiagnosticoParedes({
  paredes,
  aoFiltrar,
  ativo,
}: {
  paredes: DiagnosticoParede[];
  aoFiltrar?: (parede: string) => void;
  ativo?: (parede: string) => boolean;
}) {
  if (paredes.length === 0)
    return (
      <CartaoPn titulo="Diagnóstico por parede">
        <SemDados />
      </CartaoPn>
    );

  const pior = paredes[0];
  const ordenadasPorNome = [...paredes].sort((a, b) => {
    const na = parseInt(a.parede.replace(/\D/g, ""), 10);
    const nb = parseInt(b.parede.replace(/\D/g, ""), 10);
    return (Number.isNaN(na) ? 99 : na) - (Number.isNaN(nb) ? 99 : nb);
  });

  return (
    <CartaoPn
      titulo="Diagnóstico por parede — onde está o gargalo"
      subtitulo={`A posição ${pior.parede} passa de primeira em apenas ${pior.fpy}% das casas. Quanto mais escuro, mais essa posição falha.`}
    >
      {/* mapa: a casa vista de cima, cada célula é uma posição */}
      <div className="mb-5 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-12">
        {ordenadasPorNome.map((p) => (
          <div
            key={p.parede}
            /* Célula é pequena e a grade muda de 4 para 12 colunas: um
               balão de HTML aqui sairia da tela em alguma largura. A
               dica é o title nativo, que o navegador posiciona sozinho —
               e o detalhe completo está na tabela logo abaixo. */
            title={
              `${p.parede}: passa de primeira em ${p.fpy}% das casas ` +
              `(${p.passaram} de ${p.conferidas}) · ${p.erros} desvios em ` +
              `${p.reprovadas} paredes reprovadas · quando falha, falha com ` +
              `${p.errosPorReprovada} desvios em média` +
              (p.principais.length > 0
                ? ` · principal: ${p.principais[0].nome} (${p.principais[0].qtd})`
                : "") +
              (aoFiltrar ? " — clique para filtrar o painel" : "")
            }
            onClick={aoFiltrar ? () => aoFiltrar(p.parede) : undefined}
            role={aoFiltrar ? "button" : undefined}
            tabIndex={aoFiltrar ? 0 : undefined}
            className={`rounded-lg border p-2 text-center ${
              aoFiltrar ? "clicavel" : ""
            } ${ativo?.(p.parede) ? "on" : ""}`}
            style={{
              borderColor: ativo?.(p.parede)
                ? "var(--color-info)"
                : "var(--color-line)",
              background: fundoMapa(p.fpy),
            }}
          >
            <div className="text-[10.5px] font-bold" style={{ opacity: 0.75 }}>
              {p.parede}
            </div>
            <div
              className="mono text-[17px] leading-tight font-black"
              style={{ color: cor(p.fpy) }}
            >
              {p.fpy}
              <span style={{ fontSize: 10 }}>%</span>
            </div>
            <div className="mono text-[9.5px]" style={{ opacity: 0.6 }}>
              {p.erros} erros
            </div>
            {p.naoConformidades > 0 && (
              <div
                className="mono mt-1 rounded-full text-[9px] font-bold"
                style={{
                  background: "var(--color-alta)",
                  color: "var(--color-sobre-alta)",
                  padding: "1px 4px",
                }}
                title={`${p.naoConformidades} não conformidade(s) em aberto nesta posição`}
              >
                {p.naoConformidades} NC
              </div>
            )}
          </div>
        ))}
      </div>

      {/* detalhe: o que dá errado em cada posição */}
      <div className="rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>Parede</th>
              <th>Passa de primeira</th>
              <th>Casas</th>
              <th>Desvios</th>
              <th title="Desvios por parede reprovada: o tamanho do estrago quando esta posição falha">
                Erros/reprovada
              </th>
              <th>Não conf.</th>
              <th>Principais problemas nesta posição</th>
            </tr>
          </thead>
          <tbody>
            {paredes.map((p) => (
              <tr key={p.parede}>
                <td className="mono" style={{ fontWeight: 700 }}>
                  {p.parede}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="mini" style={{ width: 90 }}>
                      <i
                        style={{ width: `${p.fpy}%`, background: cor(p.fpy) }}
                      />
                    </span>
                    <b className="mono" style={{ color: cor(p.fpy) }}>
                      {p.fpy}%
                    </b>
                  </div>
                </td>
                <td className="mono" style={{ color: "var(--color-ink-3)" }}>
                  {p.passaram}/{p.conferidas}
                </td>
                <td className="mono">{p.erros}</td>
                <td
                  className="mono"
                  title={`${p.reprovadas} paredes reprovadas nesta posição concentraram ${p.erros} desvios`}
                  style={{
                    fontWeight: p.errosPorReprovada >= 3 ? 700 : 400,
                    color:
                      p.errosPorReprovada >= 3
                        ? "var(--color-alta)"
                        : "var(--color-ink-2)",
                  }}
                >
                  {p.reprovadas === 0 ? "—" : p.errosPorReprovada}
                </td>
                <td
                  className="mono"
                  style={{
                    color:
                      p.naoConformidades > 0
                        ? "var(--color-alta)"
                        : "var(--color-ink-3)",
                    fontWeight: p.naoConformidades > 0 ? 700 : 400,
                  }}
                >
                  {p.naoConformidades}
                </td>
                <td>
                  {p.principais.length === 0 ? (
                    <span style={{ color: "var(--color-ink-3)" }}>
                      nenhum problema registrado
                    </span>
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {p.principais.map((t, i) => (
                        <span
                          key={t.nome}
                          className="chip"
                          style={{
                            background:
                              i === 0
                                ? "color-mix(in srgb, var(--color-alta) 16%, transparent)"
                                : "color-mix(in srgb, var(--color-ink-2) 12%, transparent)",
                            color:
                              i === 0
                                ? "var(--color-alta)"
                                : "var(--color-ink-2)",
                          }}
                        >
                          {t.nome} · {t.qtd}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="sub" style={{ marginTop: 12 }}>
        Uma posição que falha em várias casas diferentes costuma indicar
        gabarito, desenho ou sequência de montagem — não o operador do dia.{" "}
        <b>Desvios/reprovada</b> separa duas doenças diferentes: posição que erra
        muitas vezes por pouco (ajuste fino) e posição que erra poucas vezes mas
        com muitos defeitos de uma vez (problema de processo).
        {aoFiltrar && " Toque numa posição do mapa para filtrar o painel por ela."}
      </p>
    </CartaoPn>
  );
}
