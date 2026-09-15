"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  HealthDiagnostico,
  IssueDiagnostico,
  RelatorioIaDiagnostica,
} from "@/lib/diagnostico";

type RespostaHealth = {
  ok: boolean;
  health?: HealthDiagnostico;
  erro?: string;
};

type RespostaIa = RespostaHealth & {
  ia?: {
    relatorio: RelatorioIaDiagnostica;
    motor: "openai" | "deterministico";
    modelo?: string;
    aviso?: string;
  };
};

type GrupoEsqueleto = {
  projeto: string;
  casas: string[];
  paredes: number;
};

function formatarData(valor?: string) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function gruposEsqueleto(issue?: IssueDiagnostico): GrupoEsqueleto[] {
  const mapa = new Map<string, GrupoEsqueleto>();
  for (const exemplo of issue?.examples ?? []) {
    const projeto = typeof exemplo.projeto_nome === "string" ? exemplo.projeto_nome : "";
    const casa = typeof exemplo.casa === "string" ? exemplo.casa : "";
    const faltantes = typeof exemplo.faltantes === "number" ? exemplo.faltantes : 0;
    if (!projeto || !casa) continue;
    const atual = mapa.get(projeto) ?? { projeto, casas: [], paredes: 0 };
    atual.casas.push(casa);
    atual.paredes += faltantes;
    mapa.set(projeto, atual);
  }
  return Array.from(mapa.values()).map((grupo) => ({
    ...grupo,
    casas: Array.from(new Set(grupo.casas)),
  }));
}

function CartaoMetrica({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{ borderColor: "var(--color-line)", background: "var(--color-papel-2)" }}
    >
      <div className="text-[11px] text-ink-3">{rotulo}</div>
      <div className="mt-1 text-xl font-semibold">{valor}</div>
      {detalhe && <div className="mt-1 text-[10.5px] text-ink-3">{detalhe}</div>}
    </div>
  );
}

export default function DiagnosticoSistemaCard() {
  const [health, setHealth] = useState<HealthDiagnostico | null>(null);
  const [ia, setIa] = useState<RespostaIa["ia"]>(null);
  const [carregando, setCarregando] = useState(true);
  const [rechecando, setRechecando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [reparando, setReparando] = useState<string | null>(null);

  const carregar = useCallback(async (fresh = false, silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const resposta = await fetch(`/api/diagnostico${fresh ? "?fresh=1" : ""}`, {
        cache: "no-store",
      });
      const payload = (await resposta.json()) as RespostaHealth;
      if (!resposta.ok || !payload.ok || !payload.health) {
        throw new Error(payload.erro || "Não foi possível carregar o diagnóstico.");
      }
      setHealth(payload.health);
      if (fresh) setIa(null);
    } catch (error) {
      if (!silencioso) {
        toast.error(error instanceof Error ? error.message : "Erro ao carregar diagnóstico.");
      }
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar(false);
    const timer = window.setInterval(() => void carregar(false, true), 60_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  const duplicidades = useMemo(() => {
    if (!health) return 0;
    return (
      health.metrics.duplicate_relational_walls +
      health.metrics.duplicate_canonical_walls +
      health.metrics.duplicate_quality_logs
    );
  }, [health]);

  const issuesAtivos = useMemo(
    () => (health?.issues ?? []).filter((issue) => Number(issue.count) > 0),
    [health]
  );

  const skeleton = health?.issues.find((issue) => issue.code === "SKELETON_MISSING_WALLS");
  const grupos = useMemo(() => gruposEsqueleto(skeleton), [skeleton]);

  async function rodarRecheck() {
    if (rechecando) return;
    setRechecando(true);
    await carregar(true);
    setRechecando(false);
    toast.success("Recheck concluído com leitura atual da base.");
  }

  async function analisarComIa() {
    if (analisando) return;
    setAnalisando(true);
    try {
      const resposta = await fetch("/api/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      const payload = (await resposta.json()) as RespostaIa;
      if (!resposta.ok || !payload.ok || !payload.health || !payload.ia) {
        throw new Error(payload.erro || "Não foi possível gerar a análise diagnóstica.");
      }
      setHealth(payload.health);
      setIa(payload.ia);
      if (payload.ia.aviso) toast.message(payload.ia.aviso);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro na análise diagnóstica.");
    } finally {
      setAnalisando(false);
    }
  }

  async function repararEsqueleto(grupo: GrupoEsqueleto) {
    const chave = `${grupo.projeto}:${grupo.casas.join(",")}`;
    if (reparando) return;
    const confirmado = window.confirm(
      `Reparar o esqueleto de ${grupo.casas.length} casa(s) do projeto ${grupo.projeto}?\n\nO sistema criará um backup antes da transação e só acrescentará paredes pendentes. Nenhum N/A, desvio ou inspeção existente será removido.`
    );
    if (!confirmado) return;

    setReparando(chave);
    try {
      const resposta = await fetch("/api/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "repair",
          codigo: "SKELETON_MISSING_WALLS",
          alvo: { projeto: grupo.projeto, casas: grupo.casas },
        }),
      });
      const payload = (await resposta.json()) as {
        ok: boolean;
        erro?: string;
        repair?: {
          paredes_adicionadas?: number;
          backup_id?: number;
          health_after?: HealthDiagnostico;
        };
      };
      if (!resposta.ok || !payload.ok || !payload.repair) {
        throw new Error(payload.erro || "O reparo foi bloqueado.");
      }
      if (payload.repair.health_after) setHealth(payload.repair.health_after);
      setIa(null);
      toast.success(
        `Reparo concluído: ${payload.repair.paredes_adicionadas ?? 0} parede(s) acrescentada(s). Backup #${payload.repair.backup_id ?? "—"}.`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro no reparo seguro.");
    } finally {
      setReparando(null);
    }
  }

  const status = health?.status ?? "ATENCAO";
  const statusTexto = status === "SAUDAVEL" ? "Saudável" : status === "CRITICO" ? "Crítico" : "Atenção";

  return (
    <section className="cartao" style={{ gridColumn: "1 / -1" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2>Diagnóstico do Sistema</h2>
            <span className="chip">{statusTexto}</span>
            <span className="chip">Recheck automático · 15 min</span>
          </div>
          <p className="sub">
            Auditoria interna de integridade, FPY, duplicidades, vínculos e esqueleto de casas. O painel apenas lê por padrão; reparos exigem confirmação e usam rotinas allowlisted com backup.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" type="button" onClick={rodarRecheck} disabled={rechecando || carregando}>
            {rechecando ? "Rechecando…" : "Rodar recheck"}
          </button>
          <button className="btn btn-forte" type="button" onClick={analisarComIa} disabled={analisando || carregando}>
            {analisando ? "Analisando…" : "Analisar com IA"}
          </button>
        </div>
      </div>

      {carregando && !health ? (
        <div className="mt-4 text-sm text-ink-3">Carregando integridade…</div>
      ) : health ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <CartaoMetrica rotulo="Integridade" valor={`${Number(health.integrity_percent).toFixed(0)}%`} detalhe={`Último check ${formatarData(health.checked_at)}`} />
            <CartaoMetrica rotulo="Duplicidades" valor={duplicidades} detalhe="relacional + canônico + logs" />
            <CartaoMetrica rotulo="Desvios órfãos" valor={health.metrics.orphan_deviations} detalhe="sem auditoria correspondente" />
            <CartaoMetrica rotulo="FPY divergente" valor={health.metrics.fpy_inconsistencies} detalhe={`${health.totals.fpy_rows} linhas verificadas`} />
            <CartaoMetrica rotulo="Casas incompletas" valor={health.metrics.incomplete_houses} detalhe={`${health.metrics.missing_required_walls} paredes pendentes`} />
            <CartaoMetrica rotulo="Anomalias" valor={health.anomaly_count} detalhe={`${health.critical_count} críticas · ${health.warning_count} alertas`} />
          </div>

          {issuesAtivos.length === 0 ? (
            <div className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
              Nenhuma anomalia detectada no recheck atual.
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              {issuesAtivos.map((issue) => (
                <details key={issue.code} className="rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
                  <summary className="cursor-pointer text-sm font-medium">
                    {issue.code} · {issue.count} ocorrência(s) · {issue.severity}
                  </summary>
                  <p className="mt-2 text-[12px] text-ink-2">{issue.message}</p>
                  {issue.examples.length > 0 && (
                    <pre className="mt-2 max-h-52 overflow-auto rounded-md p-2 text-[10.5px]" style={{ background: "var(--color-papel-2)" }}>
                      {JSON.stringify(issue.examples.slice(0, 6), null, 2)}
                    </pre>
                  )}
                </details>
              ))}
            </div>
          )}

          {grupos.length > 0 && (
            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
              <div className="text-sm font-medium">Reparo estrutural disponível</div>
              <p className="mt-1 text-[12px] text-ink-3">
                Somente para paredes faltantes. Cada execução valida novamente o alvo no banco e cria snapshot antes de alterar o estado canônico.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {grupos.map((grupo) => {
                  const chave = `${grupo.projeto}:${grupo.casas.join(",")}`;
                  return (
                    <button
                      key={chave}
                      type="button"
                      className="btn"
                      disabled={Boolean(reparando)}
                      onClick={() => repararEsqueleto(grupo)}
                    >
                      {reparando === chave
                        ? "Reparando…"
                        : `Reparar ${grupo.projeto} · ${grupo.casas.length} casa(s) · ${grupo.paredes} parede(s)`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {ia && (
            <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium">Assistente de Correção</div>
                <span className="chip">{ia.motor === "openai" ? `OpenAI · ${ia.modelo ?? "modelo configurado"}` : "Motor determinístico seguro"}</span>
              </div>
              <p className="mt-2 text-[12.5px] text-ink-2">{ia.relatorio.resumo}</p>
              <div className="mt-3 grid gap-2">
                {ia.relatorio.problemas.map((problema) => (
                  <div key={`${problema.codigo}-${problema.causa_raiz}`} className="rounded-md border p-2.5" style={{ borderColor: "var(--color-line)" }}>
                    <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium">
                      <span>{problema.codigo}</span>
                      <span className="chip">{problema.criticidade}</span>
                    </div>
                    <div className="mt-1 text-[11.5px] text-ink-2"><b>Causa:</b> {problema.causa_raiz}</div>
                    <div className="mt-1 text-[11.5px] text-ink-2"><b>Impacto:</b> {problema.impacto}</div>
                    <div className="mt-1 text-[11.5px] text-ink-2"><b>Ação:</b> {problema.acao_recomendada}</div>
                    <div className="mt-1 text-[11px] text-ink-3">{problema.comando_sugerido}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
