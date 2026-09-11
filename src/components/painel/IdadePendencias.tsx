import type { FaixaIdade } from "@/lib/dashboard";
import CartaoPn from "./CartaoPn";
import { Linha } from "./Interativo";

const CORES = [
  "var(--color-baixa)",
  "var(--color-baixa)",
  "var(--color-media)",
  "var(--color-alta)",
];

/** Há quantos dias as pendências esperam — envelhecer é o sintoma de fila parada. */
export default function IdadePendencias({
  faixas,
}: {
  faixas: FaixaIdade[];
}) {
  const total = faixas.reduce((s, f) => s + f.qtd, 0);
  const max = Math.max(1, ...faixas.map((f) => f.qtd));

  return (
    <CartaoPn
      classe="col-5"
      titulo="Idade das pendências"
      subtitulo="Quanto tempo o que está em aberto já espera por tratativa"
    >
      {total === 0 ? (
        <p
          className="py-6 text-center text-[12.5px]"
          style={{ color: "var(--color-baixa)" }}
        >
          Nenhuma pendência em aberto.
        </p>
      ) : (
        <>
          {faixas.map((f, i) => (
            <Linha
              key={f.rotulo}
              titulo={`${f.rotulo}: ${f.qtd}`}
              dica={
                <>
                  <b>{f.rotulo}</b> em aberto
                  <br />
                  {f.qtd} de {total} pendências ·{" "}
                  {Math.round((f.qtd / total) * 100)}%
                  <br />
                  {i >= 2
                    ? "faixa de risco: item parado costuma virar não conformidade"
                    : "dentro do tempo esperado de tratativa"}
                </>
              }
            >
              <span className="n mono">{f.rotulo}</span>
              <span className="trilho">
                {f.qtd > 0 && (
                  <i
                    style={{
                      width: `${(f.qtd / max) * 100}%`,
                      background: CORES[i],
                    }}
                  />
                )}
              </span>
              <span className="q mono">
                {f.qtd}
                <span style={{ color: "var(--color-ink-3)" }}>
                  {" "}
                  · {Math.round((f.qtd / total) * 100)}%
                </span>
              </span>
            </Linha>
          ))}
          <p className="sub" style={{ marginTop: 12 }}>
            {total} pendência{total > 1 ? "s" : ""} no total. Acima de 14 dias
            costuma indicar item esquecido — priorize pela fila abaixo.
          </p>
        </>
      )}
    </CartaoPn>
  );
}
