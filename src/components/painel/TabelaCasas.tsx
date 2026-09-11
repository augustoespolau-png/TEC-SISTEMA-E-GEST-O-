"use client";

import { useState } from "react";
import type { SituacaoCasa, SituacaoTipo } from "@/lib/dashboard";
import CartaoPn, { SemDados } from "./CartaoPn";

const LIMITE_INICIAL = 8;

const CLASSE_SITUACAO: Record<SituacaoTipo, string> = {
  COMPLETA: "completa",
  "P. APROVAÇÃO": "pendaprov",
  PENDENTE: "pendente",
  "NAO CONFORME": "naoconf",
  BLOQUEADA: "bloqueada",
};

/** A visão que responde "onde a produção está travada". */
export default function TabelaCasas({
  casas,
  aoFiltrar,
  ativo,
}: {
  casas: SituacaoCasa[];
  aoFiltrar?: (casa: string) => void;
  ativo?: (casa: string) => boolean;
}) {
  const [tudo, setTudo] = useState(false);
  const visiveis = tudo ? casas : casas.slice(0, LIMITE_INICIAL);
  const travadas = casas.filter((c) => c.situacao !== "COMPLETA").length;

  return (
    <CartaoPn
      titulo="Situação por casa"
      subtitulo={`${travadas} de ${casas.length} casas ainda têm pendência — ordenadas das mais travadas para as concluídas`}
      acessorio={
        casas.length > LIMITE_INICIAL ? (
          <button className="btn esconde-tv" onClick={() => setTudo(!tudo)}>
            {tudo ? "Ver menos" : `Ver todas (${casas.length})`}
          </button>
        ) : undefined
      }
    >
      {casas.length === 0 ? (
        <SemDados />
      ) : (
        <div className="rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Casa</th>
                <th>Situação</th>
                <th>Desvios</th>
                <th>Aguardando</th>
                <th>P. aprov.</th>
                <th>Não conf.</th>
                <th>Críticas</th>
                <th>Tratativa</th>
                <th>1º desvio há</th>
                <th>Resolvida em</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <tr key={c.casa}>
                  <td className="mono" style={{ fontWeight: 700 }}>
                    {aoFiltrar ? (
                      <button
                        type="button"
                        onClick={() => aoFiltrar(c.casa)}
                        className={`clicavel ${ativo?.(c.casa) ? "on" : ""}`}
                        style={{
                          font: "inherit",
                          padding: "2px 6px",
                          marginInline: -6,
                          color: "inherit",
                        }}
                        title={`Ver só a casa ${c.casa}`}
                      >
                        {c.casa}
                      </button>
                    ) : (
                      c.casa
                    )}
                  </td>
                  <td>
                    <span className={`chip ${CLASSE_SITUACAO[c.situacao]}`}>
                      {c.situacao}
                    </span>
                  </td>
                  <td className="mono">{c.total}</td>
                  <td
                    className="mono"
                    style={{
                      color:
                        c.pendentes > 0
                          ? "var(--color-media)"
                          : "var(--color-ink-3)",
                    }}
                  >
                    {c.pendentes}
                  </td>
                  <td
                    className="mono"
                    style={{
                      color:
                        c.pendAprovacao > 0
                          ? "var(--color-espera)"
                          : "var(--color-ink-3)",
                      fontWeight: c.pendAprovacao > 0 ? 700 : 400,
                    }}
                    title={
                      c.pendAprovacao > 0
                        ? `${c.pendAprovacao} retrabalho(s) desta casa esperando aprovação da gestão`
                        : undefined
                    }
                  >
                    {c.pendAprovacao}
                  </td>
                  <td
                    className="mono"
                    style={{
                      color:
                        c.naoConformidades > 0
                          ? "var(--color-alta)"
                          : "var(--color-ink-3)",
                    }}
                  >
                    {c.naoConformidades}
                  </td>
                  <td
                    className="mono"
                    style={{
                      color:
                        c.criticasAbertas > 0
                          ? "var(--color-alta)"
                          : "var(--color-ink-3)",
                    }}
                  >
                    {c.criticasAbertas}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="mini">
                        <i style={{ width: `${c.pctResolvido}%` }} />
                      </span>
                      <span
                        className="mono"
                        style={{ fontSize: 11, color: "var(--color-ink-2)" }}
                      >
                        {c.pctResolvido}%
                      </span>
                    </div>
                  </td>
                  <td className="mono" style={{ color: "var(--color-ink-2)" }}>
                    {c.diasDesdePrimeiro} d
                  </td>
                  <td
                    className="mono"
                    style={{
                      color:
                        c.completaEmDias === null
                          ? "var(--color-ink-3)"
                          : "var(--color-baixa)",
                    }}
                  >
                    {c.completaEmDias === null ? "—" : `${c.completaEmDias} d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CartaoPn>
  );
}
