"use client";

import Link from "next/link";
import { useState } from "react";
import type { ItemFila, Prioridade } from "@/lib/dashboard";
import CartaoPn from "./CartaoPn";

const LIMITE = 8;

const CLASSE_PRIORIDADE: Record<Prioridade, string> = {
  BLOQUEADA: "bloqueada",
  "NÃO CONFORME": "naoconf",
  CRÍTICA: "critica",
  AGUARDANDO: "pendente",
};

/** O que resolver primeiro: bloqueadas, depois críticas, depois as mais velhas. */
export default function FilaPendencias({ itens }: { itens: ItemFila[] }) {
  const [tudo, setTudo] = useState(false);
  const visiveis = tudo ? itens : itens.slice(0, LIMITE);

  return (
    <CartaoPn
      classe="col-7"
      titulo="O que falta resolver"
      subtitulo="Bloqueadas primeiro, depois não conformidades, críticas e as mais antigas"
      acessorio={
        itens.length > LIMITE ? (
          <button className="btn esconde-tv" onClick={() => setTudo(!tudo)}>
            {tudo ? "Ver menos" : `Ver todas (${itens.length})`}
          </button>
        ) : undefined
      }
    >
      {itens.length === 0 ? (
        <p
          className="py-6 text-center text-[12.5px]"
          style={{ color: "var(--color-baixa)" }}
        >
          Fila vazia — nada pendente.
        </p>
      ) : (
        <>
          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Prioridade</th>
                  <th>Casa</th>
                  <th>Parede</th>
                  <th>Setor</th>
                  <th>Ocorrência</th>
                  <th>Idade</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={`chip ${CLASSE_PRIORIDADE[r.prioridade]}`}>
                        {r.prioridade}
                      </span>
                    </td>
                    <td className="mono" style={{ fontWeight: 700 }}>
                      {r.casa}
                    </td>
                    <td className="mono">{r.parede}</td>
                    <td style={{ color: "var(--color-ink-2)" }}>{r.setor}</td>
                    <td
                      style={{
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={r.ocorrencia}
                    >
                      <b>{r.tipo_erro}</b>
                      <span style={{ color: "var(--color-ink-3)" }}>
                        {" "}
                        — {r.ocorrencia}
                      </span>
                    </td>
                    <td
                      className="mono"
                      style={{
                        color:
                          r.dias > 14 ? "var(--color-alta)" : "var(--color-ink-2)",
                      }}
                    >
                      {r.dias} d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub esconde-tv" style={{ marginTop: 12 }}>
            Para tratar, abra a{" "}
            <Link
              href="/consultar"
              style={{ color: "var(--color-brand)", textDecoration: "underline" }}
            >
              tela Consultar
            </Link>{" "}
            e filtre pela casa.
          </p>
        </>
      )}
    </CartaoPn>
  );
}
