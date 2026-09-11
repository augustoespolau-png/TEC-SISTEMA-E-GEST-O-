"use client";

import { resumoDosNas, type NaDaAuditoria } from "@/lib/auditoria";

/**
 * O que a casa acumulou de NA, abaixo das paredes.
 *
 * Uma linha por NA, com parede, item e o motivo escrito. A contagem por
 * item fica no cabeçalho, em texto: o que o auditor quer aqui é reler o
 * que ele mesmo anotou, e para isso a frase inteira vale mais do que
 * uma barrinha comparando quantidades.
 */
export default function ResumoDeNas({
  nas,
  aoAbrirParede,
}: {
  nas: NaDaAuditoria[];
  aoAbrirParede: (parede: string) => void;
}) {
  const r = resumoDosNas(nas);
  if (!r.total) return null;

  // ordena por parede e, dentro dela, por item
  const linhas = [...nas].sort(
    (a, b) =>
      a.parede.localeCompare(b.parede, "pt-BR", { numeric: true }) ||
      a.tipo_erro.localeCompare(b.tipo_erro, "pt-BR")
  );

  const plural = (n: number, um: string, muitos: string) =>
    `${n} ${n === 1 ? um : muitos}`;

  return (
    <section className="cartao">
      <h2>NA desta casa</h2>
      <p className="sub">
        Itens que não se aplicam às paredes. Não são erros e não entram no FPY.
      </p>
      <div className="corpo grid gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="chip">{plural(r.total, "NA", "NAs")}</span>
          <span className="chip">
            em {plural(r.paredes, "parede", "paredes")}
          </span>
          <span className="chip">
            {plural(r.porTipo.length, "item distinto", "itens distintos")}
          </span>
        </div>

        <div className="ind-rolagem">
          <table className="ind-tabela">
            <thead>
              <tr>
                <th>Parede</th>
                <th>Item</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((n) => (
                <tr key={n.id}>
                  <td>
                    <button
                      onClick={() => aoAbrirParede(n.parede)}
                      className="ligacao"
                      title={`Abrir a parede ${n.parede}`}
                    >
                      {n.parede}
                    </button>
                  </td>
                  <td>{n.tipo_erro}</td>
                  <td className="na-obs">
                    {n.observacao || <span className="ind-fraco">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
