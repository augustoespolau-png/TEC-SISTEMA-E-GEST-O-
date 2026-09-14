"use client";

import { useMemo, useState } from "react";
import { ordemNaturalCasa } from "@/lib/dashboard";
import { META } from "@/lib/painel2";
import type { Auditoria } from "@/lib/auditoria";
import type { ConfigItem } from "@/lib/types";

const POR_PAGINA = 50;
const PREVIA = 4;
const TODAS_OBRAS = "__todas__";
const SEM_OBRA = "__sem_obra__";

export interface ResumoDaCasa {
  conferidas: number;
  ok: number;
  erros: number;
  naoConformidades: number;
  fpy: number | null;
  zeradaPelaRegra: boolean;
}

export default function ListaAuditorias({
  auditorias,
  resumos,
  projetos,
  projeto,
  aoTrocarProjeto,
  aoAbrir,
}: {
  auditorias: Auditoria[];
  resumos: Record<string, ResumoDaCasa>;
  projetos: ConfigItem[];
  projeto: string;
  aoTrocarProjeto: (p: string) => void;
  aoAbrir: (a: Auditoria) => void;
}) {
  const [pagina, setPagina] = useState(0);
  const [busca, setBusca] = useState("");
  const [obra, setObra] = useState(TODAS_OBRAS);
  const [todas, setTodas] = useState(false);
  const obrasDisponiveis = useMemo(() => {
    const projetoNormalizado = projeto.trim().toLocaleLowerCase("pt-BR");
    const nomes = auditorias
      .filter(
        (a) =>
          a.projeto.trim().toLocaleLowerCase("pt-BR") === projetoNormalizado
      )
      .map((a) => a.obra?.trim() ?? "")
      .filter(Boolean);
    return [...new Set(nomes)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [auditorias, projeto]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const projetoNormalizado = projeto.trim().toLocaleLowerCase("pt-BR");
    return auditorias
      .filter(
        (a) =>
          a.projeto.trim().toLocaleLowerCase("pt-BR") === projetoNormalizado
      )
      .filter((a) => {
        if (obra === TODAS_OBRAS) return true;
        if (obra === SEM_OBRA) return !a.obra;
        return a.obra === obra;
      })
      .filter((a) => !termo || a.casa.toLowerCase().includes(termo))
      .sort((a, b) => ordemNaturalCasa(b.casa, a.casa));
  }, [auditorias, projeto, obra, busca]);

  const aberta = todas || busca.trim() !== "" || obra !== TODAS_OBRAS;
  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas - 1);
  const visiveis = aberta
    ? filtradas.slice(atual * POR_PAGINA, atual * POR_PAGINA + POR_PAGINA)
    : filtradas.slice(0, PREVIA);
  const sobram = filtradas.length - visiveis.length;

  function trocarProjeto(p: string) {
    setPagina(0);
    setObra(TODAS_OBRAS);
    aoTrocarProjeto(p);
  }

  return (
    <section className="cartao">
      <h2>Casas auditadas</h2>
      <p className="sub">
        {filtradas.length}{" "}
        {filtradas.length === 1 ? "casa auditada" : "casas auditadas"} em{" "}
        {projeto} · da maior para a menor. Toque para abrir.
      </p>

      <div className="corpo grid gap-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className="rotulo">Projeto</label>
            <select
              value={projeto}
              onChange={(e) => trocarProjeto(e.target.value)}
              className="campo"
            >
              {projetos.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo">Obra / Empreendimento</label>
            <select
              value={obra}
              onChange={(e) => {
                setObra(e.target.value);
                setPagina(0);
              }}
              className="campo"
            >
              <option value={TODAS_OBRAS}>Todas as obras</option>
              {obrasDisponiveis.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
              <option value={SEM_OBRA}>Sem Obra / A definir</option>
            </select>
          </div>
          <div>
            <label className="rotulo">Buscar casa</label>
            <input
              type="search"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(0);
              }}
              placeholder="Número da casa"
              className="campo"
            />
          </div>
        </div>

        {filtradas.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-ink-3">
            Nenhuma casa encontrada para os filtros selecionados.
          </p>
        ) : (
          <>
            <div className="aud-casas">
              {visiveis.map((a) => {
                const r = resumos[a.id];
                const fpy = r?.fpy ?? null;
                const cor =
                  fpy === null
                    ? "var(--color-ink-3)"
                    : fpy >= META.fpy
                      ? "var(--color-baixa)"
                      : fpy >= META.fpy * 0.75
                        ? "var(--color-media)"
                        : "var(--color-alta)";
                return (
                  <button
                    key={a.id}
                    onClick={() => aoAbrir(a)}
                    className="aud-casa"
                    title={`Casa ${a.casa} · ${a.obra ?? "Sem Obra"}: ${r ? `${r.conferidas} paredes conferidas, ${r.ok} sem erro` : "0 paredes conferidas"}. Abrir.`}
                  >
                    <span className="aud-casa-topo">
                      <b className="num">{a.casa}</b>
                      <em style={{ color: cor }}>
                        {fpy === null ? "—" : `${fpy}%`}
                      </em>
                    </span>
                    <span className="aud-casa-pe">
                      {a.obra ?? "Sem Obra"} · {r?.conferidas ?? 0} conferidas
                    </span>
                    {r &&
                      (r.erros > 0 ||
                        r.zeradaPelaRegra ||
                        r.naoConformidades > 0) && (
                        <span className="aud-casa-marcas">
                          {r.erros > 0 && (
                            <i style={{ color: "var(--color-media)" }}>
                              <b />
                              {r.erros} {r.erros === 1 ? "erro" : "erros"}
                            </i>
                          )}
                          {r.zeradaPelaRegra && (
                            <i
                              style={{ color: "var(--color-alta)" }}
                              title={`FPY zerado pela regra: o erro se espalhou por ${r.conferidas - r.ok} paredes, então as ${r.ok} paredes limpas não contam`}
                            >
                              <b />
                              zerada
                            </i>
                          )}
                          {r.naoConformidades > 0 && (
                            <i
                              style={{ color: "var(--color-alta)" }}
                              title="Passaram de 48 h sem devolutiva e seguiram ao cliente sem correção"
                            >
                              <b />
                              {r.naoConformidades} s/ devolutiva
                            </i>
                          )}
                        </span>
                      )}
                  </button>
                );
              })}

              {(sobram > 0 || aberta) && !busca.trim() && obra === TODAS_OBRAS && (
                <button
                  className="aud-casa aud-casa-mais"
                  onClick={() => {
                    setTodas(!todas);
                    setPagina(0);
                  }}
                  title={
                    todas
                      ? "Mostrar só as casas mais recentes"
                      : `Mostrar as ${filtradas.length} casas auditadas`
                  }
                >
                  <IconeLista />
                  {todas ? "Ver menos" : "Ver todas"}
                </button>
              )}
            </div>

            {aberta && paginas > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  className="btn"
                  onClick={() => setPagina(atual - 1)}
                  disabled={atual === 0}
                >
                  ← Anterior
                </button>
                <span className="mono text-[12px] text-ink-3">
                  {atual + 1} de {paginas}
                </span>
                <button
                  className="btn"
                  onClick={() => setPagina(atual + 1)}
                  disabled={atual >= paginas - 1}
                >
                  Próxima →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function IconeLista() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
