"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { COLUNAS_LOG, frase, quando } from "@/lib/log";
import type { LogItem } from "@/lib/types";

/**
 * Trilha de um registro só, dentro do próprio cartão.
 * Carrega sob demanda: ninguém paga a consulta sem abrir.
 * Só a gestão lê o log (a RLS garante), então só ela recebe este bloco.
 */
export default function HistoricoRegistro({
  tabela,
  id,
}: {
  tabela: string;
  id: string | number;
}) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<LogItem[] | null>(null);
  const [erro, setErro] = useState("");

  async function alternar() {
    const novo = !aberto;
    setAberto(novo);
    if (!novo || itens) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("log_atividade")
      .select(COLUNAS_LOG)
      .eq("tabela", tabela)
      .eq("registro_id", id)
      .order("criado_em", { ascending: false })
      .order("id", { ascending: false })
      .limit(60);
    if (error) {
      setErro(error.message);
      return;
    }
    setItens((data ?? []) as LogItem[]);
  }

  return (
    <div
      className="mt-3 border-t pt-3"
      style={{ borderColor: "var(--color-line)" }}
    >
      <button
        type="button"
        onClick={alternar}
        className="text-[11.5px] font-semibold"
        style={{ color: "var(--color-info)" }}
        aria-expanded={aberto}
      >
        {aberto ? "Ocultar histórico" : "Ver histórico deste registro"}
      </button>

      {aberto && (
        <div className="mt-2.5">
          {erro && (
            <p className="text-[11.5px]" style={{ color: "var(--color-alta)" }}>
              {erro}
            </p>
          )}
          {!erro && itens === null && (
            <p className="text-[11.5px] text-ink-3">Carregando…</p>
          )}
          {itens?.length === 0 && (
            <p className="text-[11.5px] text-ink-3">
              Nenhuma alteração registrada desde que a trilha foi ligada.
            </p>
          )}
          {itens && itens.length > 0 && (
            <ul className="grid gap-1.5">
              {itens.map((l) => (
                <li key={l.id} className="text-[11.5px] leading-snug">
                  <span className="num text-ink-3">{quando(l.criado_em)}</span>{" "}
                  <b>{l.autor_nome}</b>{" "}
                  <span className="text-ink-3">({l.autor_papel})</span>{" "}
                  {frase(l)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
