"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

type ObraCadastro = {
  id: string;
  codigo: string;
  nome: string | null;
  status: "ativo" | "inativo";
};

const ORIGEM = "AUDITORIA_QUALIDADE";

function codigoDaObra(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return `AUD_${base || "OBRA"}_${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export default function ObrasEmpreendimentosCard() {
  const [itens, setItens] = useState<ObraCadastro[] | null>(null);
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await createClient()
      .from("obras_projetos")
      .select("id, codigo, nome, status")
      .eq("origem", ORIGEM)
      .order("status", { ascending: true })
      .order("nome", { ascending: true });

    if (error) {
      toast.error("Não foi possível carregar as obras: " + error.message);
      setItens([]);
      return;
    }
    setItens((data ?? []) as ObraCadastro[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial após consulta ao Supabase
    void carregar();
  }, [carregar]);

  const nomes = useMemo(
    () => new Set((itens ?? []).map((item) => (item.nome ?? "").trim().toLocaleLowerCase("pt-BR"))),
    [itens]
  );

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novo.trim();
    if (!nome || ocupado) return;
    if (nomes.has(nome.toLocaleLowerCase("pt-BR"))) {
      toast.error("Essa obra / empreendimento já está cadastrada.");
      return;
    }

    setOcupado(true);
    const { error } = await createClient().from("obras_projetos").insert({
      codigo: codigoDaObra(nome),
      nome,
      status: "ativo",
      origem: ORIGEM,
    });
    setOcupado(false);

    if (error) {
      toast.error("Não foi possível cadastrar: " + error.message);
      return;
    }
    setNovo("");
    toast.success(`${nome} cadastrada. Já está disponível na Auditoria.`);
    await carregar();
  }

  async function salvarEdicao(item: ObraCadastro) {
    const nome = nomeEdicao.trim();
    if (!nome || ocupado) return;
    const repetido = (itens ?? []).some(
      (outro) =>
        outro.id !== item.id &&
        (outro.nome ?? "").trim().toLocaleLowerCase("pt-BR") ===
          nome.toLocaleLowerCase("pt-BR")
    );
    if (repetido) {
      toast.error("Já existe outra obra com esse nome.");
      return;
    }

    setOcupado(true);
    const { error } = await createClient()
      .from("obras_projetos")
      .update({ nome, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("origem", ORIGEM);
    setOcupado(false);

    if (error) {
      toast.error("Não foi possível editar: " + error.message);
      return;
    }
    setEditando(null);
    setNomeEdicao("");
    toast.success("Obra / empreendimento atualizada.");
    await carregar();
  }

  async function alternarStatus(item: ObraCadastro) {
    if (ocupado) return;
    const proximo = item.status === "ativo" ? "inativo" : "ativo";
    setOcupado(true);
    const { error } = await createClient()
      .from("obras_projetos")
      .update({ status: proximo, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("origem", ORIGEM);
    setOcupado(false);

    if (error) {
      toast.error("Não foi possível alterar o status: " + error.message);
      return;
    }
    toast.success(
      proximo === "ativo"
        ? "Obra reativada e disponível na Auditoria."
        : "Obra desativada para novas auditorias."
    );
    await carregar();
  }

  const ativos = (itens ?? []).filter((item) => item.status === "ativo").length;

  return (
    <section className="cartao">
      <h2>Obras / Empreendimentos</h2>
      <p className="sub">
        Cadastre aqui as obras usadas na Auditoria. O campo “Obra / Empreendimento”
        da criação da casa lê automaticamente esta lista e mostra somente os itens ativos.
      </p>

      <div className="corpo">
        <div className="mb-3 text-xs text-ink-3">
          {itens === null
            ? "Carregando…"
            : `${ativos} ativa${ativos === 1 ? "" : "s"} · ${itens.length} cadastrada${itens.length === 1 ? "" : "s"}`}
        </div>

        {itens && itens.length > 0 && (
          <div className="mb-4 grid gap-2">
            {itens.map((item) => {
              const ativo = item.status === "ativo";
              const emEdicao = editando === item.id;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5"
                  style={{ opacity: ativo ? 1 : 0.62 }}
                >
                  <div className="min-w-0 flex-1">
                    {emEdicao ? (
                      <input
                        autoFocus
                        className="campo"
                        value={nomeEdicao}
                        onChange={(e) => setNomeEdicao(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void salvarEdicao(item);
                          if (e.key === "Escape") setEditando(null);
                        }}
                      />
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-ink-1">
                          {item.nome || item.codigo}
                        </div>
                        <div className="text-[11px] text-ink-3">
                          {ativo ? "Disponível na Auditoria" : "Inativa para novas auditorias"}
                        </div>
                      </>
                    )}
                  </div>

                  {emEdicao ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-forte"
                        disabled={ocupado || !nomeEdicao.trim()}
                        onClick={() => void salvarEdicao(item)}
                      >
                        Salvar
                      </button>
                      <button type="button" className="btn" onClick={() => setEditando(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setEditando(item.id);
                          setNomeEdicao(item.nome ?? "");
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={ocupado}
                        onClick={() => void alternarStatus(item)}
                      >
                        {ativo ? "Desativar" : "Reativar"}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={adicionar} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="campo min-w-0 flex-1"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Nome da nova obra / empreendimento"
          />
          <button
            type="submit"
            className="btn btn-forte"
            disabled={ocupado || !novo.trim()}
          >
            Cadastrar obra
          </button>
        </form>
      </div>
    </section>
  );
}
