"use client";

import { useState } from "react";
import type { ConfigItem, Criticidade } from "@/lib/types";
import SeletorFoto from "@/components/auditoria/SeletorFoto";

export interface NovoErro {
  tipo_erro: string;
  setor: string;
  criticidade: Criticidade;
  ocorrencia: string;
  anexo?: File | null;
}

/* A terceira coluna é a classe de preenchimento: a tinta de dentro do
   chip é decisão do tema, não deste componente. */
const CRITICIDADES: [Criticidade, string, string][] = [
  ["CRITICO", "Crítico", "preenche-alta"],
  ["MEDIO", "Médio", "preenche-media"],
  ["BAIXO", "Baixo", "preenche-baixa"],
];

/** Formulário de um erro dentro da parede que está sendo auditada. */
export default function FormularioErro({
  tipos,
  setores,
  aoAdicionar,
  aoCancelar,
  salvando,
}: {
  tipos: ConfigItem[];
  setores: ConfigItem[];
  aoAdicionar: (e: NovoErro) => void;
  aoCancelar: () => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState("");
  const [tipoOutro, setTipoOutro] = useState("");
  const [setor, setSetor] = useState("");
  const [criticidade, setCriticidade] = useState<Criticidade | "">("");
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);

  const ehOutro = tipo === "OUTRO";
  const tipoFinal = ehOutro ? tipoOutro.trim().toUpperCase() : tipo;
  const pronto = Boolean(tipoFinal && setor && criticidade && texto.trim());

  return (
    <div
      className="grid gap-3 rounded-lg border p-3"
      style={{
        borderColor: "var(--color-line-2)",
        background: "var(--color-papel)",
      }}
    >
      <div>
        <label className="rotulo">Tipo de erro</label>
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
          <label className="rotulo">Qual é o tipo de erro?</label>
          <input
            type="text"
            value={tipoOutro}
            onChange={(e) => setTipoOutro(e.target.value)}
            placeholder="Ex.: RODAPÉ"
            className="campo"
          />
          <p className="sub">
            Se esse tipo passar a ser comum, a gestão pode adicioná-lo à lista
            em Configurações.
          </p>
        </div>
      )}

      <div>
        <label className="rotulo">Setor onde foi detectado</label>
        <select
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
          className="campo"
        >
          <option value="">Selecione</option>
          {setores.map((s) => (
            <option key={s.id} value={s.nome}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="rotulo">Criticidade</label>
        <div className="grid grid-cols-3 gap-2">
          {CRITICIDADES.map(([v, rotulo, classe]) => {
            const on = criticidade === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setCriticidade(on ? "" : v)}
                className={`chip-esc ${on ? classe : ""}`}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="rotulo">O que foi encontrado</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Descreva o problema para quem vai retrabalhar"
          className="campo"
        />
      </div>

      <SeletorFoto
        id="foto-desvio"
        titulo="Anexo / foto do desvio (opcional)"
        descricao="A imagem será compactada para agilizar o envio e ficará vinculada a este desvio e à parede atual."
        salvando={salvando}
        onArquivoPronto={setArquivo}
        onProcessando={setProcessandoFoto}
      />

      <div className="flex gap-2">
        <button onClick={aoCancelar} className="btn" disabled={salvando}>
          Cancelar
        </button>
        <button
          onClick={() =>
            aoAdicionar({
              tipo_erro: tipoFinal,
              setor,
              criticidade: criticidade as Criticidade,
              ocorrencia: texto.trim(),
              anexo: arquivo,
            })
          }
          disabled={!pronto || salvando || processandoFoto}
          className="btn btn-forte flex-1"
        >
          {salvando ? "Salvando…" : "Adicionar erro"}
        </button>
      </div>
    </div>
  );
}
