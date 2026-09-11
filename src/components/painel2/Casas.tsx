"use client";

import { useState } from "react";
import { Dica } from "@/components/painel/Interativo";
import {
  ROTULO_ESTADO,
  type EstadoParede,
  type ResumoCasa,
} from "@/lib/painel2";
import { ORDEM_ESTADOS, corDoFpy, fundoEstado } from "./estados";

const LIMITE = 12;

/**
 * O meio do caminho: uma linha por casa, com a mesma barra do projeto em
 * miniatura. Ordenadas pelo que falta, não por número — quem abre o
 * painel quer ver primeiro a casa que está travando.
 */
export default function Casas({
  casas,
  casaAtiva,
  aoEscolherCasa,
  aoEscolherEstado,
}: {
  casas: ResumoCasa[];
  casaAtiva?: string;
  aoEscolherCasa: (casa: string) => void;
  aoEscolherEstado: (casa: string, estado: EstadoParede) => void;
}) {
  const [tudo, setTudo] = useState(false);
  const visiveis = tudo ? casas : casas.slice(0, LIMITE);

  if (casas.length === 0)
    return (
      <section className="cartao">
        <h2>Casas</h2>
        <p className="sub">Nenhuma casa auditada neste recorte.</p>
      </section>
    );

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2>Casas — o que falta em cada uma</h2>
          <p className="sub">
            Da mais atrasada para a mais pronta. Toque na casa para filtrar
            todo o painel por ela; toque numa faixa para ver os erros.
          </p>
        </div>
        {casas.length > LIMITE && (
          <button className="btn shrink-0" onClick={() => setTudo(!tudo)}>
            {tudo ? "Ver menos" : `Ver todas (${casas.length})`}
          </button>
        )}
      </div>

      <div className="corpo grid gap-1.5">
        {visiveis.map((c) => {
          const valor: Record<EstadoParede, number> = {
            ACEITA: c.aceitas,
            RETRABALHADA: c.retrabalhadas,
            AGUARDA_APROVACAO: c.aguardando,
            EM_RETRABALHO: c.emRetrabalho,
          };
          return (
            <div
              key={c.casa}
              className={`linha-casa ${casaAtiva === c.casa ? "on" : ""}`}
            >
              <button
                className="casa-nome clicavel"
                onClick={() => aoEscolherCasa(c.casa)}
                title={`Ver só a casa ${c.casa}`}
              >
                <span className="num">{c.casa}</span>
                {c.reconstruida && (
                  <span className="casa-recon" title="Auditoria reconstruída do histórico da planilha, não medida no sistema">
                    hist.
                  </span>
                )}
              </button>

              <div className="barra-estados fina">
                {ORDEM_ESTADOS.filter((e) => valor[e] > 0).map((e) => (
                  <button
                    key={e}
                    onClick={() => aoEscolherEstado(c.casa, e)}
                    className="dica-alvo faixa"
                    style={{ flexGrow: valor[e], background: fundoEstado(e) }}
                    title={`Casa ${c.casa} · ${ROTULO_ESTADO[e]}: ${valor[e]}`}
                  >
                    <Dica lado={e === "EM_RETRABALHO" ? "dir" : "esq"}>
                      <b>
                        Casa {c.casa} · {ROTULO_ESTADO[e]}
                      </b>
                      <br />
                      {valor[e]} de {c.conferidas} paredes
                      <br />
                      Clique para ver os erros.
                    </Dica>
                  </button>
                ))}
              </div>

              <span
                className="mono casa-pct"
                style={{
                  color:
                    c.pctConcluido === 100
                      ? "var(--color-baixa)"
                      : "var(--color-ink-2)",
                }}
                title={`${c.aceitas + c.retrabalhadas} de ${c.conferidas} paredes resolvidas`}
              >
                {c.pctConcluido}%
              </span>
              <span
                className="mono casa-fpy"
                style={{ color: corDoFpy(c.fpy) }}
                title={
                  c.anuladasPelaRegra > 0
                    ? `FPY zerado pela regra da casa: o erro se espalhou por ${c.conferidas - c.aceitas} paredes, e por isso as ${c.anuladasPelaRegra} paredes limpas não contam`
                    : `FPY: ${c.passaramFpy} de ${c.conferidas} passaram de primeira`
                }
              >
                {c.fpy === null ? "—" : `${c.fpy}%`}
              </span>
            </div>
          );
        })}

        <div className="legenda mt-1.5">
          <span className="text-[10.5px] text-ink-3">
            1ª coluna de número: <b>execução</b> · 2ª: <b>FPY</b>
          </span>
        </div>
      </div>
    </section>
  );
}
