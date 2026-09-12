"use client";

import { useEffect, useRef, useState } from "react";
import type { ConfigItem } from "@/lib/types";

export interface NovoNa {
  tipos_erro: string[];
  observacao: string;
}

const VALOR_OUTRO = "__OUTRO__";

function menuDeveAbrirParaCima(elemento: HTMLElement | null) {
  if (!elemento || typeof window === "undefined") return false;

  const retangulo = elemento.getBoundingClientRect();
  const alturaNav = Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue("--altura-nav")
  ) || 72;
  const alturaMenu = Math.min(390, window.innerHeight * 0.58);
  const espacoAbaixo = window.innerHeight - retangulo.bottom - Math.max(72, alturaNav);

  return espacoAbaixo < alturaMenu && retangulo.top > alturaMenu;
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
  tiposJaAdicionados = [],
  aoAdicionar,
  aoCancelar,
  salvando,
}: {
  tipos: ConfigItem[];
  tiposJaAdicionados?: string[];
  aoAdicionar: (n: NovoNa) => void;
  aoCancelar: () => void;
  salvando: boolean;
}) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [tipoOutro, setTipoOutro] = useState("");
  const [texto, setTexto] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);
  const [menuParaCima, setMenuParaCima] = useState(false);
  const seletorRef = useRef<HTMLDivElement>(null);

  const existentes = new Set(tiposJaAdicionados);
  const ehOutro = selecionados.includes(VALOR_OUTRO);
  const outroFinal = tipoOutro.trim().toUpperCase();
  const tiposFinais = [
    ...selecionados.filter((tipo) => tipo !== VALOR_OUTRO),
    ...(ehOutro && outroFinal ? [outroFinal] : []),
  ];
  const nomesSelecionados = selecionados.map((tipo) =>
    tipo === VALOR_OUTRO ? "Outro" : tipo
  );
  const resumoSelecionados =
    nomesSelecionados.length === 0
      ? tipos.length > 0 && tipos.every((tipo) => existentes.has(tipo.nome))
        ? "Todos os itens já foram registrados"
        : "Selecione"
      : nomesSelecionados.length <= 2
        ? nomesSelecionados.join(", ")
        : `${nomesSelecionados.length} itens selecionados`;

  useEffect(() => {
    if (!menuAberto) return;

    const atualizarDirecao = () => {
      setMenuParaCima(menuDeveAbrirParaCima(seletorRef.current));
    };

    function fecharAoClicarFora(event: PointerEvent) {
      if (!seletorRef.current?.contains(event.target as Node)) {
        setMenuAberto(false);
      }
    }

    function fecharComEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuAberto(false);
    }

    atualizarDirecao();
    document.addEventListener("pointerdown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEsc);
    window.addEventListener("resize", atualizarDirecao);
    window.addEventListener("scroll", atualizarDirecao, true);
    return () => {
      document.removeEventListener("pointerdown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEsc);
      window.removeEventListener("resize", atualizarDirecao);
      window.removeEventListener("scroll", atualizarDirecao, true);
    };
  }, [menuAberto]);

  function alternarTipo(tipo: string) {
    if (existentes.has(tipo)) return;
    setSelecionados((lista) =>
      lista.includes(tipo)
        ? lista.filter((item) => item !== tipo)
        : [...lista, tipo]
    );
  }

  function selecionarTodos() {
    setSelecionados((lista) => [
      ...new Set([
        ...lista,
        ...tipos.map((tipo) => tipo.nome).filter((nome) => !existentes.has(nome)),
      ]),
    ]);
  }

  function alternarMenu() {
    if (!menuAberto) {
      setMenuParaCima(menuDeveAbrirParaCima(seletorRef.current));
    }
    setMenuAberto((aberto) => !aberto);
  }

  return (
    <div
      className="grid gap-3 rounded-lg border p-3"
      style={{
        borderColor: "var(--color-line-2)",
        background: "var(--color-papel)",
      }}
    >
      <div>
        <span className="rotulo">Itens que não se aplicam</span>
        <p className="sub">
          Abra a lista para marcar vários itens de uma vez. Os que já foram
          registrados ficam bloqueados para evitar duplicidade.
        </p>
        <div className="na-seletor" ref={seletorRef}>
          <button
            id="na-seletor-trigger"
            type="button"
            className={`na-select-trigger ${
              nomesSelecionados.length === 0 ? "placeholder" : ""
            }`}
            onClick={alternarMenu}
            disabled={salvando || tipos.every((tipo) => existentes.has(tipo.nome))}
            aria-expanded={menuAberto}
            aria-controls="na-select-menu"
            aria-haspopup="listbox"
            autoFocus
          >
            <span className="na-select-value">{resumoSelecionados}</span>
            <span className="na-select-seta" aria-hidden="true" />
          </button>

          {menuAberto && (
            <div
              id="na-select-menu"
              className={`na-select-menu ${menuParaCima ? "acima" : ""}`}
              role="listbox"
              aria-label="Itens que não se aplicam"
              aria-multiselectable="true"
            >
              <div className="na-select-acoes">
                <span className="na-select-contagem">
                  {selecionados.length === 0
                    ? "Selecione um ou mais itens"
                    : `${selecionados.length} selecionado(s)`}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selecionarTodos}
                    className="btn"
                    style={{ fontSize: 11, padding: "5px 9px" }}
                    disabled={salvando || tipos.every((tipo) => existentes.has(tipo.nome))}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelecionados([])}
                    className="btn"
                    style={{ fontSize: 11, padding: "5px 9px" }}
                    disabled={salvando || selecionados.length === 0}
                  >
                    Nenhum
                  </button>
                </div>
              </div>

              <div className="na-selecao" role="group" aria-label="Itens que não se aplicam">
                {tipos.map((t) => {
                  const jaAdicionado = existentes.has(t.nome);
                  const marcado = jaAdicionado || selecionados.includes(t.nome);
                  return (
                    <label
                      key={t.id}
                      className={`na-opcao ${marcado ? "selecionada" : ""} ${
                        jaAdicionado ? "bloqueada" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        disabled={salvando || jaAdicionado}
                        onChange={() => alternarTipo(t.nome)}
                        className="na-input"
                      />
                      <span className="na-check" aria-hidden="true">
                        {marcado ? "✓" : ""}
                      </span>
                      <span>{t.nome}</span>
                      {jaAdicionado && <span className="na-ja-adicionado">já salvo</span>}
                    </label>
                  );
                })}
                <label
                  className={`na-opcao ${selecionados.includes(VALOR_OUTRO) ? "selecionada" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selecionados.includes(VALOR_OUTRO)}
                    disabled={salvando}
                    onChange={() => alternarTipo(VALOR_OUTRO)}
                    className="na-input"
                  />
                  <span className="na-check" aria-hidden="true">
                    {selecionados.includes(VALOR_OUTRO) ? "✓" : ""}
                  </span>
                  <span>Outro (especificar)</span>
                </label>
              </div>
            </div>
          )}
        </div>
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
        <label className="rotulo">
          Por que não se aplica (opcional; vale para todos os selecionados)
        </label>
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
          onClick={() => aoAdicionar({ tipos_erro: tiposFinais, observacao: texto.trim() })}
          disabled={tiposFinais.length === 0 || salvando}
          className="btn btn-forte flex-1"
        >
          {salvando
            ? "Salvando…"
            : tiposFinais.length > 0
              ? `Adicionar ${tiposFinais.length} ${tiposFinais.length === 1 ? "NA" : "NAs"}`
              : "Adicionar NAs"}
        </button>
      </div>
    </div>
  );
}
