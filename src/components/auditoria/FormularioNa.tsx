"use client";

import { useState } from "react";
import type { ConfigItem } from "@/lib/types";

export interface NovoNa {
  tipo_erro: string;
  observacao: string;
}

/**
 * Formulário de um NA — item NÃO APLICÁVEL àquela parede.
 *
 * Tem tipo e observação como o erro, e nada além disso: sem setor e sem
 * criticidade, porque não há defeito para classificar nem estação para
 * responsabilizar. Um item que não se aplica não tem gravidade.
 */
export default function FormularioNa({
  tipos,
  aoAdicionar,
  aoCancelar,
  salvando,
}: {
  tipos: ConfigItem[];
  aoAdicionar: (n: NovoNa) => void;
  aoCancelar: () => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState("");
  const [tipoOutro, setTipoOutro] = useState("");
  const [texto, setTexto] = useState("");

  const ehOutro = tipo === "OUTRO";
  const tipoFinal = ehOutro ? tipoOutro.trim().toUpperCase() : tipo;

  return (
    <div
      className="grid gap-3 rounded-lg border p-3"
      style={{
        borderColor: "var(--color-line-2)",
        background: "var(--color-papel)",
      }}
    >
      <div>
        <label className="rotulo">Item que não se aplica</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="campo"
          autoFocus
        >
          <option value="">Selecione</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.nome}>
              {t.nome}
            </option>
          ))}
          <option value="OUTRO">Outro (especificar)</option>
        </select>
      </div>

      {ehOutro && (
        <div>
          <label className="rotulo">Qual item?</label>
          <input
            type="text"
            value={tipoOutro}
            onChange={(e) => setTipoOutro(e.target.value)}
            placeholder="Ex.: RODAPÉ"
            className="campo"
          />
        </div>
      )}

      <div>
        <label className="rotulo">Por que não se aplica (opcional)</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: esta parede não leva esquadria"
          className="campo"
        />
      </div>

      <div className="flex gap-2">
        <button onClick={aoCancelar} className="btn" disabled={salvando}>
          Cancelar
        </button>
        <button
          onClick={() =>
            aoAdicionar({ tipo_erro: tipoFinal, observacao: texto.trim() })
          }
          disabled={!tipoFinal || salvando}
          className="btn btn-forte flex-1"
        >
          {salvando ? "Salvando…" : "Adicionar NA"}
        </button>
      </div>
    </div>
  );
}
