"use client";

import { Dica } from "@/components/painel/Interativo";
import { ordemDaPosicao, type ResumoPosicao } from "@/lib/painel2";
import { corDoFpy } from "./estados";

/**
 * Onde está o gargalo: uma coluna por posição de parede, na ordem de
 * montagem. A altura é quantas casas aquela posição reprovou — a
 * pergunta "quais paredes têm mais problema" lida de relance.
 *
 * Uma posição que falha em várias casas diferentes aponta gabarito,
 * desenho ou sequência de montagem, não o operador do dia.
 */
export default function Posicoes({
  posicoes,
  paredeAtiva,
  aoEscolher,
}: {
  posicoes: ResumoPosicao[];
  paredeAtiva?: string;
  aoEscolher: (parede: string) => void;
}) {
  if (posicoes.length === 0)
    return (
      <section className="cartao">
        <h2>Posições de parede</h2>
        <p className="sub">Nenhuma parede conferida neste recorte.</p>
      </section>
    );

  const naOrdem = [...posicoes].sort((a, b) =>
    ordemDaPosicao(a.parede, b.parede)
  );
  const maxReprovadas = Math.max(1, ...posicoes.map((p) => p.reprovadas));
  const pior = posicoes[0]; // já vem da pior para a melhor

  return (
    <section className="cartao">
      <h2>Posições de parede — onde está o gargalo</h2>
      <p className="sub">
        {pior.reprovadas > 0 ? (
          <>
            A <b>{pior.parede}</b> é a que mais reprova: passa de primeira em{" "}
            {pior.fpy}% das casas
            {pior.principais.length > 0 && (
              <> e o problema mais comum nela é {pior.principais[0].nome}</>
            )}
            .
          </>
        ) : (
          "Nenhuma posição reprovou neste recorte."
        )}
      </p>

      <div className="corpo">
        <div className="colunas-parede">
          {naOrdem.map((p) => {
            const alt = Math.round((p.reprovadas / maxReprovadas) * 100);
            return (
              <button
                key={p.parede}
                onClick={() => aoEscolher(p.parede)}
                aria-pressed={paredeAtiva === p.parede}
                className={`coluna-parede dica-alvo ${
                  paredeAtiva === p.parede ? "on" : ""
                }`}
                title={`${p.parede}: ${p.reprovadas} de ${p.conferidas} casas reprovaram`}
              >
                <span className="cp-vazio">
                  <span
                    className="cp-cheio"
                    style={{
                      height: `${alt}%`,
                      background:
                        p.reprovadas === 0
                          ? "var(--color-baixa)"
                          : "var(--color-alta)",
                    }}
                  />
                </span>
                <span className="cp-num mono">{p.reprovadas}</span>
                <span className="cp-nome mono">{p.parede}</span>
                <span
                  className="cp-fpy mono"
                  style={{ color: corDoFpy(p.fpy) }}
                >
                  {p.fpy}%
                </span>
                <Dica lado="esq">
                  <b>{p.parede}</b>
                  <br />
                  reprovou em {p.reprovadas} de {p.conferidas} casas · passa de
                  primeira em {p.fpy}%
                  <br />
                  {p.erros} erros no total
                  {p.reprovadas > 0 && (
                    <> · {p.errosPorReprovada} por parede reprovada</>
                  )}
                  {p.principais.length > 0 && (
                    <>
                      <br />
                      {p.principais
                        .map((t) => `${t.nome} (${t.qtd})`)
                        .join(" · ")}
                    </>
                  )}
                  <br />
                  Clique para ver os erros desta posição.
                </Dica>
              </button>
            );
          })}
        </div>

        <p className="sub" style={{ marginTop: 12 }}>
          A altura da coluna é <b>em quantas casas aquela posição reprovou</b>.
          O número embaixo é o FPY dela. Posição que reprova em muitas casas é
          gabarito ou sequência de montagem, não operador.
        </p>
      </div>
    </section>
  );
}
