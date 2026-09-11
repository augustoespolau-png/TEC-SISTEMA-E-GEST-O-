"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COLUNAS_LOG,
  ROTULO_ACAO,
  nomeCampo,
  nomeTabela,
  quando,
  valorLegivel,
} from "@/lib/log";
import { ROTULO_TABELA, type LogItem } from "@/lib/types";

const PAGINA = 100;

interface FiltrosLog {
  de: string;
  ate: string;
  tabela: string;
  acao: string;
  autor: string;
  busca: string;
}

const VAZIO: FiltrosLog = {
  de: "",
  ate: "",
  tabela: "",
  acao: "",
  autor: "",
  busca: "",
};

const ACOES: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Tudo" },
  { valor: "UPDATE", rotulo: "Alterações" },
  { valor: "INSERT", rotulo: "Criações" },
  { valor: "DELETE", rotulo: "Exclusões" },
];

/**
 * Trilha de auditoria da plataforma inteira: quem fez o quê, quando, em
 * qual registro, com o valor antes e depois. Nada aqui é editável — nem
 * pela gestão. É o que permite apontar o responsável por uma mudança.
 */
export default function TelaHistorico() {
  const [f, setF] = useState<FiltrosLog>(VAZIO);
  const [itens, setItens] = useState<LogItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [autores, setAutores] = useState<{ id: string; nome: string }[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, nome")
        .order("nome");
      setAutores(data ?? []);
    })();
  }, []);

  const buscar = useCallback(async (f: FiltrosLog, lim: number) => {
    setBuscando(true);
    setErro("");
    const supabase = createClient();
    let q = supabase
      .from("log_atividade")
      .select(COLUNAS_LOG, { count: "exact" });

    if (f.tabela) q = q.eq("tabela", f.tabela);
    if (f.acao) q = q.eq("acao", f.acao);
    if (f.autor) q = q.eq("autor", f.autor);
    // a data escolhida entra inteira: do primeiro ao último minuto local
    if (f.de) q = q.gte("criado_em", `${f.de}T00:00:00-03:00`);
    if (f.ate) q = q.lte("criado_em", `${f.ate}T23:59:59-03:00`);
    if (f.busca.trim()) q = q.ilike("rotulo", `%${f.busca.trim()}%`);

    const { data, error, count } = await q
      .order("criado_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(lim);

    setBuscando(false);
    if (error) {
      setErro("Erro ao carregar o histórico: " + error.message);
      return;
    }
    setItens((data ?? []) as LogItem[]);
    setTotal(count ?? 0);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscar(f, limite), 250);
    return () => clearTimeout(t);
  }, [f, limite, buscar]);

  function mudar(novo: Partial<FiltrosLog>) {
    setLimite(PAGINA);
    setF((v) => ({ ...v, ...novo }));
  }

  const filtrando = Object.values(f).some((v) => v !== "");

  return (
    <main className="tela">
      <section className="cartao">
        <h2>Histórico de alterações</h2>
        <p className="sub">
          Toda criação, alteração e exclusão feita na plataforma, com autor,
          papel e horário. O registro é gravado pelo próprio banco e ninguém
          pode editá-lo — nem a gestão.
        </p>

        <div className="corpo grid gap-3">
          <div className="segm" style={{ width: "fit-content" }}>
            {ACOES.map((a) => (
              <button
                key={a.valor}
                className={f.acao === a.valor ? "on" : ""}
                onClick={() => mudar({ acao: a.valor })}
              >
                {a.rotulo}
              </button>
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="rotulo">De</label>
              <input
                type="date"
                value={f.de}
                onChange={(e) => mudar({ de: e.target.value })}
                className="campo"
              />
            </div>
            <div>
              <label className="rotulo">Até</label>
              <input
                type="date"
                value={f.ate}
                onChange={(e) => mudar({ ate: e.target.value })}
                className="campo"
              />
            </div>
            <div>
              <label className="rotulo">Quem fez</label>
              <select
                value={f.autor}
                onChange={(e) => mudar({ autor: e.target.value })}
                className="campo"
              >
                <option value="">Todos</option>
                {autores.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rotulo">Onde</label>
              <select
                value={f.tabela}
                onChange={(e) => mudar({ tabela: e.target.value })}
                className="campo"
              >
                <option value="">Tudo</option>
                {Object.entries(ROTULO_TABELA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="rotulo">Buscar registro (casa, parede, nome)</label>
            <input
              type="search"
              value={f.busca}
              onChange={(e) => mudar({ busca: e.target.value })}
              placeholder="Ex.: 118, P12, SOLEIRA"
              className="campo"
            />
          </div>

          {filtrando && (
            <button className="btn" onClick={() => setF(VAZIO)}>
              Limpar filtros
            </button>
          )}
        </div>
      </section>

      {erro && <p className="py-8 text-center text-sm text-alta">{erro}</p>}

      {!erro && (
        <>
          <p className="num mt-3 mb-2.5 text-[11.5px] text-ink-3">
            {total ?? 0} {total === 1 ? "evento" : "eventos"}
            {total !== null && itens.length < total
              ? ` · mostrando ${itens.length}`
              : ""}
            {buscando ? " · atualizando…" : ""}
          </p>

          {itens.length === 0 && !buscando && (
            <div className="cartao py-8 text-center">
              <p className="text-sm text-ink-3">
                Nenhum evento neste recorte.
              </p>
            </div>
          )}

          {itens.length > 0 && (
            <section className="cartao">
              <div className="rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Quem</th>
                      <th>Ação</th>
                      <th>Registro</th>
                      <th>Campo</th>
                      <th>De</th>
                      <th>Para</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((l) => (
                      <tr key={l.id}>
                        <td className="num whitespace-nowrap text-ink-3">
                          {quando(l.criado_em)}
                        </td>
                        <td>
                          <b>{l.autor_nome}</b>
                          <span className="block text-[10.5px] text-ink-3">
                            {l.autor_papel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">
                          {ROTULO_ACAO[l.acao]}
                        </td>
                        <td>
                          <span className="block text-[10.5px] text-ink-3">
                            {nomeTabela(l.tabela)}
                          </span>
                          {l.rotulo}
                        </td>
                        <td className="whitespace-nowrap">
                          {nomeCampo(l.campo) || "—"}
                        </td>
                        <td style={{ color: "var(--color-ink-3)" }}>
                          {l.acao === "UPDATE"
                            ? valorLegivel(l.campo, l.de)
                            : "—"}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {l.acao === "UPDATE"
                            ? valorLegivel(l.campo, l.para)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {total !== null && itens.length < total && (
            <button
              onClick={() => setLimite((l) => l + PAGINA)}
              disabled={buscando}
              className="btn mt-3 w-full"
              style={{ padding: "12px 16px" }}
            >
              {buscando
                ? "Carregando…"
                : `Carregar mais ${Math.min(PAGINA, total - itens.length)}`}
            </button>
          )}
        </>
      )}
    </main>
  );
}
