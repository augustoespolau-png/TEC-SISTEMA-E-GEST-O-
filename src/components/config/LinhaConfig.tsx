"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { AnexoProjetoParede, ConfigItem } from "@/lib/types";
import SeletorProjetoParede from "./SeletorProjetoParede";

export type TabelaConfig = "projetos" | "paredes" | "setores" | "tipos_erro";

const NOMES: Record<TabelaConfig, string> = {
  projetos: "projeto",
  paredes: "parede",
  setores: "setor",
  tipos_erro: "tipo de erro",
};

/* Em ocorrencias a dimensão é guardada como texto, com nome de coluna
   diferente do da tabela de configuração. */
const COLUNA_EM_OCORRENCIAS: Record<TabelaConfig, string> = {
  projetos: "projeto",
  paredes: "parede",
  setores: "setor",
  tipos_erro: "tipo_erro",
};

async function contarUso(
  tabela: TabelaConfig,
  nome: string,
  projetoDaParede?: string
): Promise<number> {
  const supabase = createClient();
  let q = supabase
    .from("ocorrencias")
    .select("id", { count: "exact", head: true })
    .eq(COLUNA_EM_OCORRENCIAS[tabela], nome);
  // "P1" existe em vários projetos: sem esse recorte a conta mentiria
  if (tabela === "paredes" && projetoDaParede)
    q = q.eq("projeto", projetoDaParede);
  const { count } = await q;
  return count ?? 0;
}

/**
 * Uma linha de lista de configuração, com editar e excluir.
 *
 * As duas ações são seguras para o histórico pelo mesmo motivo: as
 * ocorrências guardam projeto, parede, setor e tipo como TEXTO copiado
 * no momento do registro. A lista é a fonte das opções, não a dona do
 * dado — então renomear vale para o que vier depois, e excluir não apaga
 * nada do que já foi lançado.
 */
export default function LinhaConfig({
  item,
  tabela,
  projetoDaParede,
  area,
  anexoProjeto,
  anexandoProjeto,
  aoAnexarProjeto,
  onRenomear,
  onReativar,
  onExcluir,
}: {
  item: ConfigItem;
  tabela: TabelaConfig;
  /** projeto da parede, para contar o uso sem confundir P1 de dois projetos */
  projetoDaParede?: string;
  /** só para paredes: a metragem, editável na própria linha */
  area?: { valor: number | null; aoSalvar: (m2: number | null) => Promise<void> };
  /** só para paredes: documento técnico da posição. */
  anexoProjeto?: AnexoProjetoParede | null;
  anexandoProjeto?: boolean;
  aoAnexarProjeto?: (arquivo: File) => void;
  onRenomear: (nome: string) => Promise<void> | void;
  onReativar: () => void;
  onExcluir: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(item.nome);
  const [salvando, setSalvando] = useState(false);

  const [confirmando, setConfirmando] = useState(false);
  const [usos, setUsos] = useState<number | null>(null);
  const [paredesFilhas, setParedesFilhas] = useState<number | null>(null);

  async function pedirConfirmacao() {
    setConfirmando(true);
    setUsos(null);
    setParedesFilhas(null);
    setUsos(await contarUso(tabela, item.nome, projetoDaParede));
    // apagar projeto arrasta as paredes dele: o aviso precisa dizer quantas
    if (tabela === "projetos") {
      const supabase = createClient();
      const { count } = await supabase
        .from("paredes")
        .select("id", { count: "exact", head: true })
        .eq("projeto_id", item.id);
      setParedesFilhas(count ?? 0);
    }
  }

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault();
    const novo = nome.trim().toUpperCase();
    if (!novo || salvando) return;
    if (novo === item.nome) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    await onRenomear(novo);
    setSalvando(false);
    setEditando(false);
  }

  /* ---------------- editar ---------------- */
  if (editando)
    return (
      <li
        className="py-2.5"
        style={{ borderBottom: "1px solid var(--color-line)" }}
      >
        <form onSubmit={salvarNome}>
          <label className="rotulo">Novo nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            className="campo"
            style={{ padding: "9px 11px", fontSize: 15 }}
          />
          <p className="sub">
            Vale para os registros novos. Os antigos continuam com o nome que
            tinham quando foram lançados — cada registro guarda o próprio
            texto, então o histórico não muda.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              disabled={salvando || !nome.trim()}
              className="btn btn-forte"
              style={{ fontSize: 11.5 }}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNome(item.nome);
                setEditando(false);
              }}
              className="btn"
              style={{ fontSize: 11.5 }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </li>
    );

  /* ---------------- confirmar exclusão ---------------- */
  if (confirmando)
    return (
      <li
        className="py-2.5"
        style={{ borderBottom: "1px solid var(--color-line)" }}
      >
        <p className="text-[13px] font-bold">Excluir {item.nome}?</p>
        <p className="sub">
          {usos === null ? (
            "Conferindo o histórico…"
          ) : (
            <>
              {usos === 0
                ? `Nenhum registro usa este ${NOMES[tabela]}.`
                : `${usos} registro${usos === 1 ? "" : "s"} do histórico usa${
                    usos === 1 ? "" : "m"
                  } este ${NOMES[tabela]} e não muda${
                    usos === 1 ? "" : "m"
                  } — o nome fica gravado como texto em cada registro.`}
              {paredesFilhas !== null && paredesFilhas > 0 && (
                <>
                  {" "}
                  <b style={{ color: "var(--color-alta)" }}>
                    As {paredesFilhas} paredes deste projeto também serão
                    excluídas.
                  </b>
                </>
              )}{" "}
              A exclusão fica registrada no Histórico.
            </>
          )}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={onExcluir}
            disabled={usos === null}
            className="btn"
            style={{
              fontSize: 11.5,
              borderColor: "var(--color-alta)",
              color: "var(--color-alta)",
              fontWeight: 700,
            }}
          >
            Sim, excluir
          </button>
          <button
            onClick={() => setConfirmando(false)}
            className="btn"
            style={{ fontSize: 11.5 }}
          >
            Cancelar
          </button>
        </div>
      </li>
    );

  /* ---------------- normal ---------------- */
  return (
    <li
      className="py-2"
      style={{ borderBottom: "1px solid var(--color-line)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            item.ativo ? "" : "text-ink-3 line-through"
          }`}
          title={item.nome}
        >
          {item.nome}
        </span>
        {area && <CampoArea {...area} nome={item.nome} />}
        <span className="flex shrink-0 gap-1.5">
          {/* Desativar saiu da tela. Este botão só aparece para item que já
              estava inativo (dá para mexer no ativo pelo painel do Supabase),
              senão ele ficaria escondido do formulário para sempre. */}
          {!item.ativo && (
            <button onClick={onReativar} className="btn" style={{ fontSize: 11.5 }}>
              Reativar
            </button>
          )}
          <button
            onClick={() => setEditando(true)}
            className="btn"
            style={{ fontSize: 11.5 }}
          >
            Editar
          </button>
          <button
            onClick={pedirConfirmacao}
            className="btn"
            style={{ fontSize: 11.5, color: "var(--color-alta)" }}
            title={`Excluir ${item.nome} de vez`}
          >
            Excluir
          </button>
        </span>
      </div>
      {tabela === "paredes" && aoAnexarProjeto && (
        <SeletorProjetoParede
          id={`projeto-parede-${item.origem_id ?? item.id}`}
          anexo={anexoProjeto ?? null}
          salvando={anexandoProjeto ?? false}
          onArquivoPronto={(arquivo) => {
            if (arquivo) aoAnexarProjeto(arquivo);
          }}
        />
      )}
    </li>
  );
}

/**
 * A metragem da parede, editada na própria linha.
 *
 * Salva ao sair do campo, sem botão: é um número por linha, e num
 * projeto de 101 paredes um "salvar" por linha seria 101 cliques a mais.
 * Só vai ao servidor se o valor mudou de verdade.
 *
 * Aceita vírgula porque é assim que se escreve 6,21 em português — o
 * campo number do navegador recusaria em teclado brasileiro.
 */
function CampoArea({
  valor,
  nome,
  aoSalvar,
}: {
  valor: number | null;
  nome: string;
  aoSalvar: (m2: number | null) => Promise<void>;
}) {
  const texto = (v: number | null) =>
    v == null ? "" : String(v).replace(".", ",");
  const [rascunho, setRascunho] = useState(texto(valor));
  const [salvando, setSalvando] = useState(false);

  async function sair() {
    const limpo = rascunho.trim().replace(",", ".");
    const novo = limpo === "" ? null : Number(limpo);
    if (novo !== null && (!Number.isFinite(novo) || novo <= 0)) {
      toast.error(`Metragem inválida em ${nome}. Use algo como 6,21.`);
      setRascunho(texto(valor));
      return;
    }
    if (novo === valor) return;
    setSalvando(true);
    await aoSalvar(novo);
    setSalvando(false);
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={sair}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        inputMode="decimal"
        placeholder="—"
        disabled={salvando}
        aria-label={`Área da parede ${nome} em metros quadrados`}
        title={`Área de ${nome} em m². Deixe vazio se ainda não foi levantada.`}
        className="campo"
        style={{ width: 74, padding: "4px 6px", fontSize: 12, textAlign: "right" }}
      />
      <span className="text-[11px] text-ink-3">m²</span>
    </span>
  );
}
