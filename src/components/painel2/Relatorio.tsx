"use client";

import { useState } from "react";
import Link from "next/link";
import { formatarData, type LinhaDash } from "@/lib/dashboard";
import { descreverRecorte, recorteVazio, type ItemTipo, type Recorte2 } from "@/lib/painel2";
import { ROTULO_STATUS, STATUS_ABERTOS, type Status } from "@/lib/types";

const PAGINA = 25;

const CLASSE_STATUS: Record<Status, string> = {
  AGUARDANDO: "aguardando",
  RETRABALHO_PENDENTE: "pendaprov",
  RETRABALHO: "retrabalho",
  NAO_CONFORMIDADE: "naoconf",
  BLOQUEADA: "bloqueada",
};

/**
 * O micro: os erros que estão por trás do que foi clicado.
 *
 * Fica sempre visível, mesmo sem recorte — assim ninguém precisa
 * descobrir que existe. Sem recorte mostra todos os erros do projeto e do
 * período; com recorte, só os daquele pedaço, e o título diz qual.
 */
export default function Relatorio({
  erros,
  tipos,
  recorte,
  aoFiltrarTipo,
  aoLimpar,
}: {
  erros: LinhaDash[];
  tipos: ItemTipo[];
  recorte: Recorte2;
  aoFiltrarTipo: (tipo: string) => void;
  aoLimpar: () => void;
}) {
  const [limite, setLimite] = useState(PAGINA);
  const descricao = descreverRecorte(recorte);
  const abertos = erros.filter((e) => STATUS_ABERTOS.includes(e.status)).length;
  const maxTipo = Math.max(1, ...tipos.map((t) => t.qtd));

  return (
    <section className="cartao">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2>Erros {descricao ? `· ${descricao}` : "do projeto"}</h2>
          <p className="sub">
            {erros.length} {erros.length === 1 ? "erro" : "erros"} ·{" "}
            {abertos} em aberto
            {!descricao && " · clique em qualquer barra acima para recortar"}
          </p>
        </div>
        {!recorteVazio(recorte) && (
          <button className="btn shrink-0" onClick={aoLimpar}>
            Limpar recorte
          </button>
        )}
      </div>

      {erros.length === 0 ? (
        <p
          className="py-6 text-center text-[12.5px]"
          style={{ color: "var(--color-baixa)" }}
        >
          Nenhum erro neste recorte.
        </p>
      ) : (
        <div className="corpo">
          {/* que problema é esse: tipos do recorte, clicáveis */}
          {tipos.length > 1 && (
            <div className="mb-4">
              <div className="mb-2 text-[10px] tracking-wider text-ink-3 uppercase">
                Que problema é
              </div>
              {tipos.map((t) => (
                <button
                  key={t.nome}
                  onClick={() => aoFiltrarTipo(t.nome)}
                  className={`bar clicavel ${recorte.tipo === t.nome ? "on" : ""}`}
                  title={`${t.nome}: ${t.qtd} erros, ${t.abertos} em aberto`}
                >
                  <span className="n">{t.nome}</span>
                  <span className="trilho">
                    <i
                      style={{
                        width: `${(t.qtd / maxTipo) * 100}%`,
                        background:
                          t.abertos > 0
                            ? "var(--color-alta)"
                            : "var(--color-baixa)",
                      }}
                    />
                  </span>
                  <span className="q mono">
                    {t.qtd}
                    {t.abertos > 0 && (
                      <span style={{ color: "var(--color-alta)" }}>
                        {" "}
                        · {t.abertos} aberto{t.abertos === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Casa</th>
                  <th>Parede</th>
                  <th>Tipo</th>
                  <th>Setor</th>
                  <th>Crit.</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {erros.slice(0, limite).map((e) => (
                  <tr key={e.id}>
                    <td className="num whitespace-nowrap text-ink-3">
                      {formatarData(e.data)}
                    </td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {e.casa}
                    </td>
                    <td className="mono">{e.parede}</td>
                    <td>{e.tipo_erro}</td>
                    <td className="text-ink-2">{e.setor}</td>
                    <td>
                      <span
                        className={`chip ${
                          e.criticidade === "CRITICO"
                            ? "critica"
                            : e.criticidade === "MEDIO"
                              ? "pendente"
                              : "ok"
                        }`}
                      >
                        {e.criticidade}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${CLASSE_STATUS[e.status]}`}>
                        {ROTULO_STATUS[e.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {erros.length > limite && (
            <button
              className="btn mt-3 w-full"
              onClick={() => setLimite((l) => l + PAGINA)}
            >
              Ver mais {Math.min(PAGINA, erros.length - limite)}
            </button>
          )}

          <p className="sub" style={{ marginTop: 12 }}>
            Para tratar um erro — mudar situação, escrever observação, aprovar
            retrabalho — use a tela{" "}
            <Link
              href="/consultar"
              className="font-semibold"
              style={{ color: "var(--color-info)" }}
            >
              Consultar
            </Link>
            . Este painel é de leitura.
          </p>
        </div>
      )}
    </section>
  );
}
