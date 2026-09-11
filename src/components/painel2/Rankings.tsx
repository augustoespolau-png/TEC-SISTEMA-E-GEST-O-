"use client";

import type { Criticidade } from "@/lib/types";
import type { CasaCritica, ItemRanking, PontoDia, SemanaRetrabalho } from "@/lib/painel2";

/**
 * Os "top" que a diretoria lê para decidir onde mexer: quais casas, quais
 * itens de inspeção e quais setores concentram o problema grave.
 *
 * Tudo é clicável e cai no relatório de erros lá embaixo — o ranking
 * aponta, o relatório mostra caso a caso.
 */

export function RetrabalhosNoTempo({
  dias,
  semanas,
  total,
}: {
  dias: PontoDia[];
  semanas: SemanaRetrabalho[];
  total: number;
}) {
  if (dias.length === 0) return null;
  const max = Math.max(1, ...dias.map((d) => d.qtd));
  // a leitura que a diretoria faz: o problema está concentrado ou espalhado?
  const maiores = [...semanas].sort((a, b) => b.qtd - a.qtd).slice(0, 2);
  const concentracao = maiores.reduce((s, x) => s + x.pct, 0);

  return (
    <section className="cartao">
      <h2>Retrabalhos no tempo</h2>
      <p className="sub">
        {semanas.length > 1 && maiores.length === 2 ? (
          <>
            Duas semanas concentram <b>{Math.round(concentracao)}%</b> dos{" "}
            {total} retrabalhos: {maiores[0].rotulo} e {maiores[1].rotulo}.
          </>
        ) : (
          <>{total} retrabalhos no recorte.</>
        )}
      </p>

      <div className="corpo">
        <div className="rolagem">
          <div className="dias-barras">
            {dias.map((d) => (
              <span
                key={d.data}
                className="dia-col"
                title={`${d.rotulo}: ${d.qtd} retrabalhos · ${d.criticos} críticos`}
              >
                <span className="dia-num mono">{d.qtd}</span>
                <span className="dia-vazio">
                  <span
                    className="dia-cheio"
                    style={{
                      height: `${(d.qtd / max) * 100}%`,
                      background:
                        d.criticos > d.qtd / 2
                          ? "var(--color-alta)"
                          : "var(--color-info)",
                    }}
                  />
                </span>
                <span className="dia-rot mono">{d.rotulo}</span>
              </span>
            ))}
          </div>
        </div>

        {semanas.length > 1 && (
          <div className="mt-4 grid gap-1.5">
            {semanas.map((s) => (
              <div key={s.semana} className="bar">
                <span className="n mono">semana {s.rotulo}</span>
                <span className="trilho">
                  <i
                    style={{
                      width: `${s.pct}%`,
                      background: "var(--color-info)",
                    }}
                  />
                </span>
                <span className="q mono">
                  {s.qtd}
                  <span style={{ color: "var(--color-ink-3)" }}> · {s.pct}%</span>
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="sub" style={{ marginTop: 10 }}>
          A coluna fica vermelha no dia em que a maioria dos retrabalhos foi
          crítica.
        </p>
      </div>
    </section>
  );
}

export function CasasCriticas({
  casas,
  casaAtiva,
  aoEscolher,
}: {
  casas: CasaCritica[];
  casaAtiva?: string;
  aoEscolher: (casa: string) => void;
}) {
  if (casas.length === 0) return null;
  return (
    <section className="cartao">
      <h2>Casas com mais erros críticos</h2>
      <p className="sub">
        Onde a gravidade se concentra. Toque para filtrar o painel pela casa.
      </p>
      <div className="corpo rolagem">
        <table className="tabela">
          <thead>
            <tr>
              <th>#</th>
              <th>Casa</th>
              <th>Críticos</th>
              <th>Paredes afetadas</th>
              <th>Leitura</th>
            </tr>
          </thead>
          <tbody>
            {casas.map((c, i) => (
              <tr
                key={c.casa}
                onClick={() => aoEscolher(c.casa)}
                className="clicavel"
                style={{
                  background:
                    casaAtiva === c.casa
                      ? "color-mix(in srgb, var(--color-info) 12%, transparent)"
                      : undefined,
                }}
              >
                <td className="mono text-ink-3">{i + 1}</td>
                <td className="mono" style={{ fontWeight: 700 }}>
                  {c.casa}
                </td>
                <td
                  className="mono"
                  style={{ color: "var(--color-alta)", fontWeight: 700 }}
                >
                  {c.criticos}
                </td>
                <td className="mono">
                  {c.paredesAfetadas} de {c.conferidas}
                </td>
                <td className="text-ink-2">
                  {/* leitura derivada do número, sem comentário inventado */}
                  {c.todasAfetadas
                    ? "todas as paredes conferidas têm erro"
                    : c.paredesAfetadas === 1
                      ? "concentrado numa parede só"
                      : `espalhado por ${c.paredesAfetadas} paredes`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TopRanking({
  titulo,
  subtitulo,
  itens,
  outros,
  total,
  cor,
  ativo,
  aoEscolher,
}: {
  titulo: string;
  subtitulo: string;
  itens: ItemRanking[];
  outros: number;
  total: number;
  cor: string;
  ativo?: string;
  aoEscolher: (nome: string) => void;
}) {
  if (total === 0) return null;
  const max = Math.max(1, ...itens.map((i) => i.qtd));
  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      <p className="sub">{subtitulo}</p>
      <div className="corpo">
        {itens.map((it, i) => (
          <button
            key={it.nome}
            onClick={() => aoEscolher(it.nome)}
            className={`bar clicavel ${ativo === it.nome ? "on" : ""}`}
            title={`${it.nome}: ${it.qtd} de ${total} (${it.pct}%)`}
          >
            <span className="n">
              <span className="mono text-ink-3">{i + 1}.</span> {it.nome}
            </span>
            <span className="trilho">
              <i style={{ width: `${(it.qtd / max) * 100}%`, background: cor }} />
            </span>
            <span className="q mono">
              {it.qtd}
              <span style={{ color: "var(--color-ink-3)" }}> · {it.pct}%</span>
            </span>
          </button>
        ))}
        {outros > 0 && (
          <p className="sub" style={{ marginTop: 8 }}>
            Outros {outros} em itens fora do top {itens.length} · total {total}.
          </p>
        )}
      </div>
    </section>
  );
}

export const COR_CRITICIDADE: Record<Criticidade, string> = {
  CRITICO: "var(--color-alta)",
  MEDIO: "var(--color-media)",
  BAIXO: "var(--color-baixa)",
};
