"use client";

import { Dica } from "@/components/painel/Interativo";
import type { Criticidade } from "@/lib/types";
import {
  META,
  type Cobertura,
  type PorCriticidade,
  type ResumoProjeto,
} from "@/lib/painel2";

/**
 * A leitura de abertura da diretoria: o tamanho do lote inspecionado e a
 * composição da gravidade. Responde "quanto foi olhado e quão grave é o
 * que apareceu" antes de qualquer gráfico.
 */
export default function Diretoria({
  r,
  crit,
  cobertura,
  casasZeradas,
  aoFiltrarCriticidade,
  criticidadeAtiva,
}: {
  r: ResumoProjeto;
  crit: PorCriticidade;
  cobertura: Cobertura;
  casasZeradas: number;
  aoFiltrarCriticidade: (c: Criticidade) => void;
  criticidadeAtiva?: Criticidade;
}) {
  return (
    <section className="cartao">
      <h2>Inspeção do período</h2>
      <p className="sub">
        Tamanho do que foi auditado e gravidade do que apareceu. A barra de
        criticidade filtra o relatório lá embaixo.
      </p>

      <div className="corpo">
        <div className="tiras">
          <Tira
            rotulo="Casas auditadas"
            valor={r.casas}
            detalhe={`${r.casasConcluidas} sem pendência`}
          />
          <Tira
            rotulo="Painéis auditados"
            valor={r.conferidas}
            detalhe="paredes conferidas"
          />
          <Tira
            rotulo="Retrabalhos encontrados"
            valor={crit.total}
            cor="var(--color-alta)"
            detalhe="erros apontados"
          />
          <Tira
            rotulo="Paredes afetadas"
            valor={r.conferidas - r.aceitas}
            cor="var(--color-media)"
            detalhe={`de ${r.conferidas} conferidas`}
          />
          <Tira
            rotulo="Cobertura da inspeção"
            valor={cobertura.pct}
            sufixo="%"
            cor={
              cobertura.pct >= META.cobertura
                ? "var(--color-baixa)"
                : "var(--color-media)"
            }
            detalhe={`${cobertura.conferidas} de ${cobertura.esperadas} · meta ${META.cobertura}%`}
            dica={
              <>
                <b>Cobertura da inspeção</b>
                <br />
                Das paredes que as casas auditadas deveriam ter, quantas foram
                de fato conferidas.
                <br />
                Não é o % da produção inspecionada — o sistema só enxerga as
                casas que entraram em auditoria. Serve para pegar auditoria
                pela metade, que é o que faz o FPY subir sem merecer.
                {cobertura.casasIncompletas > 0 && (
                  <>
                    <br />
                    {cobertura.casasIncompletas} casa
                    {cobertura.casasIncompletas === 1 ? "" : "s"} com auditoria
                    incompleta.
                  </>
                )}
              </>
            }
          />
          <Tira
            rotulo="Casas com FPY zerado"
            valor={casasZeradas}
            cor={casasZeradas > 0 ? "var(--color-alta)" : "var(--color-baixa)"}
            detalhe={
              r.casas > 0
                ? `${Math.round((casasZeradas / r.casas) * 1000) / 10}% das casas`
                : "—"
            }
            dica={
              <>
                <b>Casa com FPY zerado</b>
                <br />
                Nenhuma parede conferida daquela casa passou de primeira. É o
                sinal de problema sistêmico na casa, não de erro isolado.
              </>
            }
          />
        </div>

        {/* composição da gravidade, clicável */}
        <div className="mt-4">
          <div className="mb-2 text-[10px] tracking-wider text-ink-3 uppercase">
            Gravidade dos {crit.total} retrabalhos
          </div>
          <div className="barra-estados">
            {(
              [
                ["CRITICO", crit.criticos, crit.pctCriticos, "var(--color-alta)"],
                ["MEDIO", crit.medios, crit.pctMedios, "var(--color-media)"],
                ["BAIXO", crit.baixos, crit.pctBaixos, "var(--color-baixa)"],
              ] as const
            )
              .filter(([, q]) => q > 0)
              .map(([nome, qtd, pct, cor]) => (
                <button
                  key={nome}
                  onClick={() => aoFiltrarCriticidade(nome as Criticidade)}
                  aria-pressed={criticidadeAtiva === nome}
                  className={`dica-alvo faixa ${criticidadeAtiva === nome ? "on" : ""}`}
                  style={{ flexGrow: qtd, background: cor }}
                  title={`${nome}: ${qtd} erros (${pct}%)`}
                >
                  {pct >= 9 && (
                    <span className="mono faixa-num">
                      {qtd} · {pct}%
                    </span>
                  )}
                  <Dica lado={nome === "BAIXO" ? "dir" : "esq"}>
                    <b>{nome}</b>
                    <br />
                    {qtd} de {crit.total} retrabalhos · {pct}%
                    <br />
                    Clique para ver só estes erros.
                  </Dica>
                </button>
              ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Tira({
  rotulo,
  valor,
  sufixo,
  detalhe,
  cor,
  dica,
}: {
  rotulo: string;
  valor: number;
  sufixo?: string;
  detalhe: string;
  cor?: string;
  dica?: React.ReactNode;
}) {
  return (
    <div className="tira dica-alvo" title={`${rotulo}: ${valor}${sufixo ?? ""}`}>
      <span className="tira-rotulo">{rotulo}</span>
      <span className="tira-valor mono" style={{ color: cor }}>
        {valor.toLocaleString("pt-BR")}
        {sufixo && <small>{sufixo}</small>}
      </span>
      <span className="tira-detalhe">{detalhe}</span>
      {dica && <Dica lado="esq">{dica}</Dica>}
    </div>
  );
}
