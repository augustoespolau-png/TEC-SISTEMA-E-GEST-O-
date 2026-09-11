"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import ChipGroup from "@/components/ChipGroup";
import type { ConfigItem, Criticidade, Parede } from "@/lib/types";
import { PRAZO_HORAS } from "@/lib/types";

interface Config {
  projetos: ConfigItem[];
  paredes: Parede[];
  setores: ConfigItem[];
  tipos: ConfigItem[];
}

function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

const CTX_KEY = "tecverde_erros_ctx";

/*
 * TELA APOSENTADA — fora do ar desde 30/07/2026.
 *
 * A aba Registrar saiu da navegação e a rota / virou porta de entrada.
 * O componente ficou inteiro de propósito: é o lançamento avulso de
 * erro, útil se um dia a fábrica precisar registrar algo que não nasceu
 * de auditoria de casa.
 *
 * O que ele faz e a auditoria não faz: lança erro sem exigir uma casa
 * conferida. O que ele NÃO faz: dizer quantas paredes foram olhadas —
 * por isso o erro dele entra na conta de erros, mas não no denominador
 * do FPY. Foi essa lacuna que motivou aposentá-lo.
 *
 * Para religar, veja o comentário em src/app/(app)/page.tsx.
 */
export default function RegistrarForm({ userId }: { userId: string }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [erroCarga, setErroCarga] = useState("");

  const [data, setData] = useState(hojeISO());
  const [projeto, setProjeto] = useState("");
  const [projetoOutro, setProjetoOutro] = useState("");
  const [parede, setParede] = useState("");
  const [paredeTexto, setParedeTexto] = useState("");
  const [casa, setCasa] = useState("");
  const [setor, setSetor] = useState("");
  const [setorOutro, setSetorOutro] = useState("");
  const [tipo, setTipo] = useState("");
  const [tipoOutro, setTipoOutro] = useState("");
  const [ocorrencia, setOcorrencia] = useState("");
  const [criticidade, setCriticidade] = useState<Criticidade | "">("");
  const [observacao, setObservacao] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [hoje, setHoje] = useState(0);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [p, w, s, t] = await Promise.all([
        supabase.from("projetos").select("*").eq("ativo", true).order("ordem").order("nome"),
        supabase.from("paredes").select("*").eq("ativo", true).order("ordem").order("nome"),
        supabase.from("setores").select("*").eq("ativo", true).order("ordem").order("nome"),
        supabase.from("tipos_erro").select("*").eq("ativo", true).order("ordem").order("nome"),
      ]);
      const falha = p.error || w.error || s.error || t.error;
      if (falha) {
        setErroCarga("Falha ao carregar as listas: " + falha.message);
        return;
      }
      const config: Config = {
        projetos: p.data ?? [],
        paredes: (w.data ?? []) as Parede[],
        setores: s.data ?? [],
        tipos: t.data ?? [],
      };
      setCfg(config);

      try {
        const ctx = JSON.parse(localStorage.getItem(CTX_KEY) || "{}");
        if (ctx.projeto) setProjeto(ctx.projeto);
        else if (config.projetos[0]) setProjeto(config.projetos[0].nome);
        if (ctx.parede) setParede(ctx.parede);
        if (ctx.setor) setSetor(ctx.setor);
      } catch {
        if (config.projetos[0]) setProjeto(config.projetos[0].nome);
      }

      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("ocorrencias")
        .select("id", { count: "exact", head: true })
        .eq("created_by", userId)
        .gte("created_at", inicio.toISOString());
      setHoje(count ?? 0);
    })();
  }, [userId]);

  const ehOutroProjeto = projeto === "OUTRO";

  const paredesDoProjeto = useMemo(() => {
    if (!cfg || ehOutroProjeto) return [];
    const proj = cfg.projetos.find((p) => p.nome === projeto);
    if (!proj) return [];
    return cfg.paredes.filter((p) => p.projeto_id === proj.id).map((p) => p.nome);
  }, [cfg, projeto, ehOutroProjeto]);

  const valores = {
    projeto: ehOutroProjeto ? projetoOutro.trim() : projeto,
    parede: ehOutroProjeto ? paredeTexto.trim() : parede,
    setor: setor === "OUTROS" ? setorOutro.trim() : setor,
    tipo_erro: tipo === "OUTRO" ? tipoOutro.trim() : tipo,
  };

  const pendentes = [
    { ok: !!data, nome: "data" },
    { ok: !!valores.projeto, nome: "projeto" },
    { ok: !!valores.parede, nome: "parede" },
    { ok: !!casa.trim(), nome: "casa" },
    { ok: !!valores.setor, nome: "setor" },
    { ok: !!valores.tipo_erro, nome: "tipo" },
    { ok: !!ocorrencia.trim(), nome: "descrição" },
    { ok: !!criticidade, nome: "criticidade" },
  ];
  const faltam = pendentes.filter((i) => !i.ok);
  const pronto = faltam.length === 0;
  const progresso = Math.round(
    ((pendentes.length - faltam.length) / pendentes.length) * 100
  );

  function guardarContexto(novo: Partial<Record<string, string>> = {}) {
    try {
      localStorage.setItem(
        CTX_KEY,
        JSON.stringify({ projeto, parede, setor, ...novo })
      );
    } catch {}
  }

  async function enviar() {
    if (!pronto || enviando) return;
    setEnviando(true);
    const supabase = createClient();
    const { error } = await supabase.from("ocorrencias").insert({
      data,
      projeto: valores.projeto,
      parede: valores.parede,
      casa: casa.trim(),
      setor: valores.setor,
      tipo_erro: valores.tipo_erro,
      ocorrencia: ocorrencia.trim(),
      criticidade,
      // o status não é escolhido: todo erro nasce AGUARDANDO (padrão do banco)
      observacao: observacao.trim() || null,
    });
    setEnviando(false);
    if (error) {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    toast.success("Registro salvo.");
    setHoje((n) => n + 1);
    // limpa só o que muda de um erro para o outro — projeto, parede, setor
    // e status seguem para o próximo registro da mesma inspeção
    setCasa("");
    setTipo("");
    setTipoOutro("");
    setOcorrencia("");
    setCriticidade("");
    setObservacao("");
    guardarContexto();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (erroCarga)
    return (
      <div className="tela">
        <p className="text-sm text-alta">{erroCarga}</p>
      </div>
    );
  if (!cfg)
    return (
      <div className="tela">
        <p className="text-sm text-ink-3">Carregando…</p>
      </div>
    );

  return (
    <>
      <main className="tela tela-2col tela-form">
        {/* ---------- projeto e local ---------- */}
        <section className="cartao">
          <h2>Projeto e local</h2>
          <p className="sub">Onde o erro foi encontrado</p>
          <div className="corpo grid gap-3.5">
            {/* empilhado no celular: o seletor de data do iOS mostra a data
                por extenso e não cabe ao lado de outro campo */}
            <div className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
              <Campo rotulo="Data">
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="campo"
                />
              </Campo>
              <Campo rotulo="Casa">
                <input
                  type="text"
                  value={casa}
                  onChange={(e) => setCasa(e.target.value)}
                  placeholder="110"
                  className="campo"
                />
              </Campo>
            </div>

            <Campo rotulo="Projeto">
              <select
                value={projeto}
                onChange={(e) => {
                  setProjeto(e.target.value);
                  setParede("");
                  guardarContexto({ projeto: e.target.value, parede: "" });
                }}
                className="campo"
              >
                {cfg.projetos.map((p) => (
                  <option key={p.id} value={p.nome}>
                    {p.nome}
                  </option>
                ))}
                <option value="OUTRO">Outros (especificar)</option>
              </select>
            </Campo>

            {ehOutroProjeto && (
              <Campo rotulo="Nome do projeto">
                <input
                  type="text"
                  value={projetoOutro}
                  onChange={(e) => setProjetoOutro(e.target.value)}
                  placeholder="Escreva o projeto"
                  className="campo"
                />
              </Campo>
            )}

            {ehOutroProjeto ? (
              <Campo rotulo="Parede">
                <input
                  type="text"
                  value={paredeTexto}
                  onChange={(e) => setParedeTexto(e.target.value)}
                  placeholder="Escreva a parede"
                  className="campo"
                />
              </Campo>
            ) : (
              <Campo rotulo="Parede">
                <ChipGroup
                  grade
                  opcoes={paredesDoProjeto}
                  valor={parede}
                  onChange={(v) => {
                    setParede(v);
                    guardarContexto({ parede: v });
                  }}
                />
              </Campo>
            )}

            <Campo rotulo="Setor">
              <ChipGroup
                opcoes={[...cfg.setores.map((s) => s.nome), "OUTROS"]}
                valor={setor}
                onChange={(v) => {
                  setSetor(v);
                  guardarContexto({ setor: v });
                }}
              />
            </Campo>

            {setor === "OUTROS" && (
              <Campo rotulo="Qual setor?">
                <input
                  type="text"
                  value={setorOutro}
                  onChange={(e) => setSetorOutro(e.target.value)}
                  placeholder="Escreva o setor"
                  className="campo"
                />
              </Campo>
            )}
          </div>
        </section>

        <div className="grid gap-3">
          {/* ---------- ocorrência ---------- */}
          <section className="cartao">
            <h2>Ocorrência</h2>
            <p className="sub">O que foi encontrado e qual a gravidade</p>
            <div className="corpo grid gap-3.5">
              <Campo rotulo="Tipo de erro">
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="campo"
                >
                  <option value="">Selecione</option>
                  {cfg.tipos.map((t) => (
                    <option key={t.id} value={t.nome}>
                      {t.nome}
                    </option>
                  ))}
                  <option value="OUTRO">Outro (especificar)</option>
                </select>
              </Campo>

              {tipo === "OUTRO" && (
                <Campo rotulo="Especificar o tipo">
                  <input
                    type="text"
                    value={tipoOutro}
                    onChange={(e) => setTipoOutro(e.target.value)}
                    placeholder="Ex.: RODAPÉ"
                    className="campo"
                  />
                </Campo>
              )}

              <Campo rotulo="Descrição">
                <textarea
                  value={ocorrencia}
                  onChange={(e) => setOcorrencia(e.target.value)}
                  placeholder="O que foi encontrado"
                  className="campo"
                />
              </Campo>

              <Campo rotulo="Criticidade">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["CRITICO", "Crítico", "preenche-alta"],
                      ["MEDIO", "Médio", "preenche-media"],
                      ["BAIXO", "Baixo", "preenche-baixa"],
                    ] as const
                  ).map(([v, rotulo, classe]) => {
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
              </Campo>
            </div>
          </section>

          {/* ---------- tratativa ---------- */}
          <section className="cartao">
            <h2>Tratativa</h2>
            <p className="sub">
              Todo erro entra como <b>AGUARDANDO</b>. A produção marca
              RETRABALHO quando resolver; se passar de {PRAZO_HORAS} h sem
              resolução, o sistema converte em NÃO CONFORMIDADE sozinho.
            </p>
            <div className="corpo grid gap-3.5">
              <Campo rotulo="Observação (opcional)">
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Alguma informação extra sobre a ocorrência"
                  className="campo"
                />
              </Campo>
            </div>
          </section>
        </div>
      </main>

      {/* ---------- rodapé fixo ---------- */}
      <div className="rodape">
        <div style={{ height: 2, background: "var(--color-line)" }}>
          <div
            style={{
              height: "100%",
              width: `${progresso}%`,
              background: "var(--color-brand)",
              transition: "width 200ms",
            }}
          />
        </div>
        <div className="rodape-linha">
          <div className="min-w-0 flex-1 text-[11.5px] leading-tight text-ink-3">
            {pronto
              ? "Pronto para registrar"
              : faltam.length === 1
                ? `Falta: ${faltam[0].nome}`
                : `${faltam.length} campos pendentes`}
            <span className="num mt-0.5 block">
              hoje: <b className="text-ink-2">{hoje}</b>
            </span>
          </div>
          <button
            onClick={enviar}
            disabled={!pronto || enviando}
            className="btn btn-forte"
            style={{ minWidth: 140, padding: "11px 22px", fontSize: 14.5 }}
          >
            {enviando ? "Registrando…" : "Registrar"}
          </button>
        </div>
      </div>
    </>
  );
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  // min-w-0: itens de grid não encolhem abaixo do conteúdo por padrão,
  // e é isso que faz um campo invadir a coluna do lado
  return (
    <div className="min-w-0">
      <label className="rotulo">{rotulo}</label>
      {children}
    </div>
  );
}
