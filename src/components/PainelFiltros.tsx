"use client";

import { useEffect } from "react";
import {
  alternarStatus,
  OPCOES_STATUS,
  ORDENS,
  PAREDE_OK,
  type Filtros,
  type ListasConfig,
  type OrdemKey,
} from "@/lib/filtros";
import {
  CRITICIDADES,
  ROTULO_STATUS,
  ROTULO_STATUS_CURTO,
  type Status,
} from "@/lib/types";
import { hojeSaoPaulo } from "@/lib/dashboard";
import EscolhaDeDatas from "@/components/EscolhaDeDatas";

/** PAREDE OK não é status do banco, por isso a checagem antes do rótulo. */
function rotulo(s: string) {
  return s === PAREDE_OK ? "PAREDE OK" : ROTULO_STATUS[s as Status];
}

/** Na faixa horizontal do celular cada chip precisa caber no polegar. */
function rotuloCurto(s: string) {
  return s === PAREDE_OK ? "OK" : ROTULO_STATUS_CURTO[s as Status];
}

/* No PC os filtros ficam sempre visíveis numa coluna à esquerda;
   no celular viram uma gaveta que sobe pela base, ao alcance do polegar. */

export default function PainelFiltros({
  filtros,
  aoMudar,
  listas,
  aberto,
  aoAbrir,
  aoFechar,
  extras,
  aoLimpar,
  totalResultados,
}: {
  filtros: Filtros;
  aoMudar: (novo: Partial<Filtros>) => void;
  listas: ListasConfig | null;
  aberto: boolean;
  aoAbrir: () => void;
  aoFechar: () => void;
  extras: number;
  aoLimpar: () => void;
  totalResultados: number | null;
}) {
  useEffect(() => {
    document.body.style.overflow = aberto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [aberto]);

  const campos = (
    <CamposFiltro filtros={filtros} aoMudar={aoMudar} listas={listas} />
  );

  return (
    <>
      {/* ---------- PC: coluna fixa ---------- */}
      <aside className="cartao hidden lg:block">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2>Filtros</h2>
            <p className="sub">
              {totalResultados === null
                ? "Buscando…"
                : `${totalResultados} ${totalResultados === 1 ? "registro" : "registros"}`}
            </p>
          </div>
          {extras > 0 && (
            <button className="btn" onClick={aoLimpar}>
              Limpar
            </button>
          )}
        </div>
        <div className="corpo grid gap-4">{campos}</div>
      </aside>

      {/* ---------- celular: faixa + gaveta ---------- */}
      <div className="cartao lg:hidden">
        {/* Os chips agora ACUMULAM: cada um liga e desliga a sua
            situação, e o que está aceso é o que a lista mostra. */}
        <div className="-mx-2 mb-2.5 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {OPCOES_STATUS.map((s) => (
            <button
              key={s}
              onClick={() => aoMudar({ status: alternarStatus(filtros.status, s) })}
              aria-pressed={filtros.status.includes(s)}
              className={`chip-esc shrink-0 ${filtros.status.includes(s) ? "on" : ""}`}
              style={{ borderRadius: 999 }}
            >
              {rotuloCurto(s)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="search"
            inputMode="numeric"
            value={filtros.casa}
            onChange={(e) => aoMudar({ casa: e.target.value })}
            placeholder="Buscar casa"
            className="campo min-w-0 flex-1"
          />
          <button
            onClick={aoAbrir}
            className={`btn ${extras > 0 ? "btn-forte" : ""}`}
          >
            Filtros{extras > 0 ? ` (${extras})` : ""}
          </button>
        </div>
      </div>

      {!aberto && (
        <button
          onClick={aoAbrir}
          aria-label="Abrir filtros"
          className="btn btn-forte fixed right-4 z-40 lg:hidden"
          style={{
            bottom: "calc(14px + var(--altura-nav))",
            borderRadius: 999,
            padding: "13px 20px",
            fontSize: 14,
          }}
        >
          Filtros{extras > 0 ? ` · ${extras}` : ""}
        </button>
      )}

      {aberto && (
        <>
          <div
            onClick={aoFechar}
            className="fixed inset-0 z-[70] bg-black/50 lg:hidden"
            aria-hidden
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[80] mx-auto flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl lg:hidden"
            style={{ background: "var(--color-papel)" }}
          >
            <div className="shrink-0 px-5 pt-3 pb-2">
              <div
                className="mx-auto mb-3 h-1 w-10 rounded-full"
                style={{ background: "var(--color-line-2)" }}
              />
              <div className="flex items-center justify-between">
                <h2 className="titulo-secao">Filtros e ordenação</h2>
                <button
                  onClick={aoFechar}
                  className="-mr-2 px-2 py-1 text-2xl leading-none text-ink-3"
                  aria-label="Fechar"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 pt-2 pb-4">
              <Bloco rotulo="Situação">
                <div className="grid gap-2">
                  {OPCOES_STATUS.map((s) => (
                    <button
                      key={s}
                      onClick={() =>
                        aoMudar({ status: alternarStatus(filtros.status, s) })
                      }
                      aria-pressed={filtros.status.includes(s)}
                      className={`chip-esc ${filtros.status.includes(s) ? "on" : ""}`}
                    >
                      {rotulo(s)}
                    </button>
                  ))}
                </div>
              </Bloco>
              {campos}
            </div>

            <div
              className="shrink-0 border-t px-5 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]"
              style={{ borderColor: "var(--color-line)" }}
            >
              <div className="flex gap-2">
                <button
                  onClick={aoLimpar}
                  disabled={extras === 0}
                  className="btn"
                  style={{ padding: "12px 16px" }}
                >
                  Limpar
                </button>
                <button
                  onClick={aoFechar}
                  className="btn btn-forte flex-1"
                  style={{ padding: "12px 16px", fontSize: 15 }}
                >
                  {totalResultados === null
                    ? "Ver resultados"
                    : `Ver ${totalResultados} ${
                        totalResultados === 1 ? "resultado" : "resultados"
                      }`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function CamposFiltro({
  filtros,
  aoMudar,
  listas,
}: {
  filtros: Filtros;
  aoMudar: (novo: Partial<Filtros>) => void;
  listas: ListasConfig | null;
}) {
  /* Com um projeto escolhido, a lista de paredes é só a dele. Sem
     projeto, aparecem todas — e aí nomes repetidos entre projetos
     ("PT 12" existe nos dois) viram a mesma opção, que é o certo:
     a busca por parede não é por projeto. */
  const projetoId = listas?.projetos.find(
    (p) => p.nome === filtros.projeto
  )?.id;
  const paredesVisiveis = (listas?.paredes ?? []).filter(
    (p) => projetoId === undefined || p.projeto_id === projetoId
  );

  return (
    <>
      <div className="hidden lg:block">
        <Bloco rotulo="Situação">
          {/* Caixas de marcar, e não um <select multiple>: no seletor
              múltiplo do navegador a escolha se perde com um clique
              distraído — ele desmarca tudo o que não estava sob o
              ponteiro — e não há como ver o que está ligado sem rolar
              a caixinha. Aqui as seis opções ficam à vista. */}
          <div className="grid gap-1.5">
            {OPCOES_STATUS.map((s) => (
              <label key={s} className="filtro-marca">
                <input
                  type="checkbox"
                  checked={filtros.status.includes(s)}
                  onChange={() =>
                    aoMudar({ status: alternarStatus(filtros.status, s) })
                  }
                />
                {rotulo(s)}
              </label>
            ))}
          </div>
          <div className="mt-1.5 flex gap-3 text-[11.5px]">
            <button
              className="underline underline-offset-2 text-ink-3"
              onClick={() => aoMudar({ status: [...OPCOES_STATUS] })}
            >
              todas
            </button>
            <button
              className="underline underline-offset-2 text-ink-3"
              onClick={() => aoMudar({ status: [] })}
            >
              nenhuma
            </button>
          </div>
        </Bloco>
      </div>

      <div className="hidden lg:block">
        <Bloco rotulo="Casa">
          <input
            type="search"
            value={filtros.casa}
            onChange={(e) => aoMudar({ casa: e.target.value })}
            placeholder="Número da casa"
            className="campo"
          />
        </Bloco>
      </div>

      <Bloco rotulo="Criticidade">
        <div className="grid grid-cols-3 gap-2">
          {CRITICIDADES.map((c) => {
            const on = filtros.criticidade === c;
            // a tinta de dentro do chip preenchido é decisão do tema
            const classe =
              c === "CRITICO"
                ? "preenche-alta"
                : c === "MEDIO"
                  ? "preenche-media"
                  : "preenche-baixa";
            return (
              <button
                key={c}
                onClick={() => aoMudar({ criticidade: on ? "" : c })}
                className={`chip-esc ${on ? classe : ""}`}
              >
                {c === "CRITICO" ? "Crítico" : c === "MEDIO" ? "Médio" : "Baixo"}
              </button>
            );
          })}
        </div>
      </Bloco>

      <Bloco rotulo="Projeto">
        <select
          value={filtros.projeto}
          onChange={(e) =>
            /* Trocar de projeto limpa a parede escolhida: "PT 12" existe
               nos dois projetos e são paredes diferentes, então manter a
               anterior devolveria uma lista vazia sem dizer por quê. */
            aoMudar({ projeto: e.target.value, parede: "" })
          }
          className="campo"
        >
          <option value="">Todos os projetos</option>
          {listas?.projetos.map((p) => (
            <option key={p.id} value={p.nome}>
              {p.nome}
            </option>
          ))}
        </select>
      </Bloco>

      <Bloco rotulo="Setor">
        <select
          value={filtros.setor}
          onChange={(e) => aoMudar({ setor: e.target.value })}
          className="campo"
        >
          <option value="">Todos os setores</option>
          {listas?.setores.map((s) => (
            <option key={s.id} value={s.nome}>
              {s.nome}
            </option>
          ))}
        </select>
      </Bloco>

      <Bloco rotulo="Tipo de erro">
        <select
          value={filtros.tipo}
          onChange={(e) => aoMudar({ tipo: e.target.value })}
          className="campo"
        >
          <option value="">Todos os tipos</option>
          {listas?.tipos.map((t) => (
            <option key={t.id} value={t.nome}>
              {t.nome}
            </option>
          ))}
        </select>
      </Bloco>

      <Bloco rotulo="Parede">
        <select
          value={filtros.parede}
          onChange={(e) => aoMudar({ parede: e.target.value })}
          className="campo"
        >
          <option value="">Todas as paredes</option>
          {paredesVisiveis.map((p) => (
            <option key={p.id} value={p.nome}>
              {p.nome}
            </option>
          ))}
        </select>
      </Bloco>

      <Bloco rotulo="Período do erro">
        {/* Eram dois campos de data soltos, e o segundo vivia em branco:
            quem escolhia o início achava que tinha escolhido o período.
            No calendário o intervalo é UM gesto — clica no começo, clica
            no fim — e o botão mostra as duas pontas juntas. É o mesmo
            componente dos indicadores, para o filtro de data ser a mesma
            coisa em toda parte do sistema. */}
        <EscolhaDeDatas
          de={filtros.de}
          ate={filtros.ate}
          max={hojeSaoPaulo()}
          vazio="Qualquer data"
          larguraCheia
          aoEscolher={(de, ate) => aoMudar({ de, ate })}
          aoLimpar={() => aoMudar({ de: "", ate: "" })}
        />
      </Bloco>

      <Bloco rotulo="Ordenar por">
        <select
          value={filtros.ordem}
          onChange={(e) => aoMudar({ ordem: e.target.value as OrdemKey })}
          className="campo"
        >
          {ORDENS.map((o) => (
            <option key={o.chave} value={o.chave}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </Bloco>
    </>
  );
}

function Bloco({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="rotulo">{rotulo}</label>
      {children}
    </div>
  );
}
