"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { mutarQualidade } from "@/lib/qualidadeCompat";

/*
 * Regras de negócio que a empresa muda sem programador.
 *
 * Elas vivem na tabela `parametros`, não no código: quem define quantos
 * erros zeram o FPY de uma casa é a qualidade, e essa conta muda com o
 * tempo. O banco guarda também o mínimo e o máximo aceitáveis e recusa
 * valor fora da faixa, para um dedo escorregado não deixar o indicador
 * sem sentido. Toda alteração vai para o Histórico com autor e horário.
 */

/** A chave cujo alcance é escolhido projeto a projeto. */
const CHAVE_ZERAMENTO = "fpy_min_paredes_afetadas";

interface ProjetoRegra {
  id: number;
  nome: string;
  fpy_regra_ativa: boolean;
}

interface Parametro {
  chave: string;
  valor: number;
  ativo: boolean;
  rotulo: string;
  descricao: string;
  unidade: string | null;
  minimo: number | null;
  maximo: number | null;
}

export default function RegrasQualidade() {
  const [itens, setItens] = useState<Parametro[] | null>(null);
  const [projetos, setProjetos] = useState<ProjetoRegra[]>([]);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [{ data, error }, proj] = await Promise.all([
      supabase.from("parametros").select("*").order("ordem"),
      supabase
        .from("projetos")
        .select("id, nome, fpy_regra_ativa")
        .eq("ativo", true)
        .order("ordem"),
    ]);
    const leituraError = error ?? proj.error;
    if (leituraError) {
      toast.error("Erro ao carregar as regras: " + leituraError.message);
      return;
    }
    const lista = (data ?? []) as Parametro[];
    setItens(lista);
    setProjetos((proj.data ?? []) as ProjetoRegra[]);
    setRascunho(
      Object.fromEntries(lista.map((p) => [p.chave, String(p.valor)]))
    );
  }, []);

  /* O zeramento vale por projeto: 6 paredes afetadas são metade de uma
     casa do C4A e 6% de um bloco da escola. Ver migration 022. */
  async function alternarProjeto(p: ProjetoRegra, vale: boolean) {
    setSalvando(`projeto-${p.id}`);
    const { error } = await mutarQualidade("ALTERAR_REGRA_PROJETO", {
      projeto: p.nome,
      ativo: vale,
    });
    setSalvando(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      vale
        ? `A regra passa a valer no ${p.nome}.`
        : `O ${p.nome} sai da regra: o FPY dele será sempre paredes que passaram ÷ paredes processadas.`
    );
    await carregar();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial; só resolve após o await
    carregar();
  }, [carregar]);

  async function salvar(p: Parametro, campos: { valor?: number; ativo?: boolean }) {
    setSalvando(p.chave);
    const { error } = await mutarQualidade("ALTERAR_REGRA_GLOBAL", {
      chave: p.chave,
      ...campos,
    });
    setSalvando(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Regra atualizada.");
    await carregar();
  }

  return (
    <section className="cartao" style={{ gridColumn: "1 / -1" }}>
      <h2>Regras da qualidade</h2>
      <p className="sub">
        Valem para o cálculo dos indicadores do painel, valem daqui para a
        frente e ficam registradas no Histórico. Só a gestão altera.
      </p>

      <div className="corpo grid gap-4">
        {itens === null && <p className="sub">Carregando…</p>}
        {itens?.length === 0 && (
          <p className="sub">Nenhuma regra cadastrada.</p>
        )}

        {itens?.map((p) => {
          const texto = rascunho[p.chave] ?? String(p.valor);
          const n = Number(texto);
          const invalido =
            texto.trim() === "" ||
            Number.isNaN(n) ||
            (p.minimo !== null && n < p.minimo) ||
            (p.maximo !== null && n > p.maximo);
          const mudou = !invalido && n !== p.valor;

          return (
            <div
              key={p.chave}
              className="rounded-lg border p-3"
              style={{
                borderColor: "var(--color-line-2)",
                background: "var(--color-papel-2)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold">{p.rotulo}</p>
                  <p className="sub">{p.descricao}</p>
                </div>

                <label className="flex shrink-0 items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={p.ativo}
                    disabled={salvando === p.chave}
                    onChange={(e) => salvar(p, { ativo: e.target.checked })}
                    style={{ width: 18, height: 18 }}
                  />
                  {p.ativo ? "Regra ligada" : "Regra desligada"}
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div style={{ width: 130 }}>
                  <label className="rotulo">
                    Valor{p.unidade ? ` (${p.unidade})` : ""}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={texto}
                    min={p.minimo ?? undefined}
                    max={p.maximo ?? undefined}
                    disabled={!p.ativo || salvando === p.chave}
                    onChange={(e) =>
                      setRascunho((r) => ({ ...r, [p.chave]: e.target.value }))
                    }
                    className={`campo ${invalido ? "invalido" : ""}`}
                  />
                </div>
                <button
                  className="btn btn-forte"
                  disabled={!mudou || !p.ativo || salvando === p.chave}
                  onClick={() => salvar(p, { valor: n })}
                >
                  {salvando === p.chave ? "Salvando…" : "Salvar"}
                </button>
                {mudou && (
                  <span className="sub" style={{ marginTop: 0 }}>
                    era {p.valor}
                  </span>
                )}
                {invalido && (
                  <span
                    className="text-[11.5px]"
                    style={{ color: "var(--color-alta)" }}
                  >
                    {p.minimo !== null && p.maximo !== null
                      ? `Use um número entre ${p.minimo} e ${p.maximo}.`
                      : "Use um número."}
                  </span>
                )}
              </div>

              {p.chave === CHAVE_ZERAMENTO && projetos.length > 0 && (
                <div
                  className="mt-3 border-t pt-3"
                  style={{ borderColor: "var(--color-line-2)" }}
                >
                  <p className="text-[12.5px] font-bold">
                    Em quais projetos esta regra vale
                  </p>
                  <p className="sub">
                    O mesmo número pesa diferente conforme o tamanho da casa.
                    Projeto desmarcado usa o FPY puro: paredes que passaram de
                    primeira ÷ paredes processadas.
                  </p>
                  <div className="mt-2 grid gap-2">
                    {projetos.map((pr) => (
                      <label
                        key={pr.id}
                        className="flex items-center gap-2 text-[12.5px]"
                      >
                        <input
                          type="checkbox"
                          checked={pr.fpy_regra_ativa}
                          disabled={!p.ativo || salvando === `projeto-${pr.id}`}
                          onChange={(e) =>
                            alternarProjeto(pr, e.target.checked)
                          }
                          style={{ width: 18, height: 18 }}
                        />
                        <span className="min-w-0 flex-1">{pr.nome}</span>
                        {!pr.fpy_regra_ativa && (
                          <span className="sub" style={{ marginTop: 0 }}>
                            fora da regra
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
