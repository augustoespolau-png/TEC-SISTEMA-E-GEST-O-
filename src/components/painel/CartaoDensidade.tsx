import type { Densidade } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";
import { Linha } from "./Interativo";

/*
 * O FPY é binário: passou ou não passou. Este cartão responde a pergunta
 * que ele não responde — quando uma parede é reprovada, ela é reprovada
 * com quantos erros. Uma parede com 1 erro é ajuste; com 20, é refazer.
 */

/** Cor por gravidade da faixa: quanto mais erros na mesma parede, pior. */
const CORES = [
  "var(--color-baixa)",
  "var(--color-baixa)",
  "var(--color-media)",
  "var(--color-media)",
  "var(--color-alta)",
  "var(--color-alta)",
];

export default function CartaoDensidade({
  d,
  limiar,
  aoMudarLimiar,
  aoFiltrarParede,
  aoFiltrarCasa,
}: {
  d: Densidade;
  limiar: number;
  aoMudarLimiar: (n: number) => void;
  aoFiltrarParede?: (parede: string) => void;
  aoFiltrarCasa?: (casa: string) => void;
}) {
  if (d.conferidas === 0)
    return (
      <CartaoPn
        classe="col-7"
        titulo="Densidade de desvios — o tamanho do estrago"
      >
        <SemDados>
          Nenhuma parede conferida no período. A densidade vem das auditorias,
          igual ao FPY.
        </SemDados>
      </CartaoPn>
    );

  const maxFaixa = Math.max(1, ...d.faixas.map((f) => f.qtd));
  const pctAcima =
    d.reprovadas === 0
      ? 0
      : Math.round((d.acimaDoLimiar / d.reprovadas) * 100);
  const pctErrosAcima =
    d.erros === 0 ? 0 : Math.round((d.errosAcimaDoLimiar / d.erros) * 100);

  return (
    <CartaoPn
      classe="col-7"
      titulo="Densidade de desvios — o tamanho do estrago"
      subtitulo="Duas paredes reprovadas contam igual no FPY, mesmo que uma tenha 1 desvio e a outra 20. Aqui elas não contam igual."
      acessorio={
        <label className="flex shrink-0 items-center gap-2 text-[11px] text-ink-3">
          a partir de
          <select
            value={limiar}
            onChange={(e) => aoMudarLimiar(Number(e.target.value))}
            className="campo"
            style={{ width: 68, padding: "6px 8px", fontSize: 12.5 }}
            aria-label="Desvios por parede a considerar crítico"
          >
            {[2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          erros
        </label>
      }
    >
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="text-[10px] tracking-wider text-ink-3 uppercase">
            Erros por parede reprovada
          </div>
          <div
            className="mono leading-none font-black"
            style={{ fontSize: 40, color: "var(--color-alta)" }}
          >
            {d.dpuReprovadas ?? "—"}
          </div>
          <div className="mt-1 text-[11.5px] text-ink-3">
            {d.erros} erros em {d.reprovadas} paredes reprovadas
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-wider text-ink-3 uppercase">
            Por parede conferida
          </div>
          <div className="mono text-[26px] font-black">{d.dpu ?? "—"}</div>
          <div className="text-[11px] text-ink-3">
            DPU do lote · {d.conferidas} conferidas
          </div>
        </div>

        <div>
          <div className="text-[10px] tracking-wider text-ink-3 uppercase">
            Pior parede
          </div>
          <div
            className="mono text-[26px] font-black"
            style={{ color: "var(--color-alta)" }}
          >
            {d.maxErros}
          </div>
          <div className="text-[11px] text-ink-3">desvios numa só parede</div>
        </div>

        <div className="min-w-52 flex-1">
          <div className="text-[10px] tracking-wider text-ink-3 uppercase">
            Com {limiar} erros ou mais
          </div>
          <div className="mono text-[26px] font-black">
            {d.acimaDoLimiar}
            <small
              className="ml-1.5 text-[13px] font-semibold"
              style={{ color: "var(--color-ink-2)" }}
            >
              paredes
            </small>
          </div>
          <div className="text-[11px] text-ink-3">
            {pctAcima}% das reprovadas, mas <b>{pctErrosAcima}%</b> de todos os
            erros
          </div>
        </div>
      </div>

      {/* distribuição: a forma da curva diz se o problema é agudo ou difuso */}
      <div className="mt-5">
        <div className="mb-2 text-[10px] tracking-wider text-ink-3 uppercase">
          Quantas paredes têm quantos erros
        </div>
        {d.reprovadas === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--color-baixa)" }}>
            Nenhuma parede reprovada no período.
          </p>
        ) : (
          d.faixas.map((f, i) => (
            <Linha
              key={f.rotulo}
              titulo={`${f.rotulo}: ${f.qtd} paredes`}
              dica={
                <>
                  <b>
                    {f.rotulo}
                    {f.min === f.max ? "" : " desvios"}
                  </b>
                  <br />
                  {f.qtd} de {d.reprovadas} paredes reprovadas (
                  {Math.round((f.qtd / d.reprovadas) * 100)}%)
                  <br />
                  {f.min >= limiar
                    ? "acima do limiar escolhido: candidata a refazer"
                    : "abaixo do limiar: retoque pontual"}
                </>
              }
            >
              <span className="n mono">{f.rotulo}</span>
              <span className="trilho">
                {f.qtd > 0 && (
                  <i
                    style={{
                      width: `${(f.qtd / maxFaixa) * 100}%`,
                      background: CORES[i],
                    }}
                  />
                )}
              </span>
              <span className="q mono">
                {f.qtd}
                <span style={{ color: "var(--color-ink-3)" }}>
                  {" "}
                  · {Math.round((f.qtd / d.reprovadas) * 100)}%
                </span>
              </span>
            </Linha>
          ))
        )}
      </div>

      {/* as piores paredes, com nome e sobrenome */}
      {d.piores.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[10px] tracking-wider text-ink-3 uppercase">
            Paredes mais carregadas
          </div>
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Casa</th>
                  <th>Parede</th>
                  <th>Desvios</th>
                  <th>O que deu errado</th>
                </tr>
              </thead>
              <tbody>
                {d.piores.map((p) => (
                  <tr key={`${p.projeto}|${p.casa}|${p.parede}`}>
                    <td className="mono" style={{ fontWeight: 700 }}>
                      {aoFiltrarCasa ? (
                        <button
                          type="button"
                          onClick={() => aoFiltrarCasa(p.casa)}
                          className="clicavel"
                          style={{
                            font: "inherit",
                            color: "inherit",
                            padding: "2px 6px",
                            marginInline: -6,
                          }}
                          title={`Ver só a casa ${p.casa}`}
                        >
                          {p.casa}
                        </button>
                      ) : (
                        p.casa
                      )}
                    </td>
                    <td className="mono">
                      {aoFiltrarParede ? (
                        <button
                          type="button"
                          onClick={() => aoFiltrarParede(p.parede)}
                          className="clicavel"
                          style={{
                            font: "inherit",
                            color: "inherit",
                            padding: "2px 6px",
                            marginInline: -6,
                          }}
                          title={`Ver só a posição ${p.parede}`}
                        >
                          {p.parede}
                        </button>
                      ) : (
                        p.parede
                      )}
                    </td>
                    <td
                      className="mono"
                      style={{
                        fontWeight: 700,
                        color:
                          p.erros >= limiar
                            ? "var(--color-alta)"
                            : "var(--color-ink-2)",
                      }}
                    >
                      {p.erros}
                    </td>
                    <td>
                      {p.principais.length === 0 ? (
                        <span style={{ color: "var(--color-ink-3)" }}>—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {p.principais.map((t) => (
                            <span
                              key={t.nome}
                              className="chip normal"
                              title={`${t.qtd}× ${t.nome}`}
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
        </div>
      )}

      <p className="sub" style={{ marginTop: 12 }}>
        Poucas paredes concentrando muitos erros é problema de processo naquela
        casa ou naquele lote de material — vale investigar uma por uma. Erros
        espalhados em pouca quantidade por muitas paredes é ajuste de gabarito.
      </p>
    </CartaoPn>
  );
}
