"use client";

import { useEffect, useState } from "react";
import type { InsightPreditivo } from "@/lib/ai/analytics";

export default function InsightsPreditivos({
  projeto,
}: {
  projeto: string | null;
}) {
  const [insight, setInsight] = useState<InsightPreditivo | null>(null);
  const [motor, setMotor] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    let ativo = true;
    const controller = new AbortController();

    async function carregar() {
      setCarregando(true);
      setOculto(false);
      try {
        const query = projeto ? `?project=${encodeURIComponent(projeto)}` : "";
        const resposta = await fetch(`/api/ai/insights${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (resposta.status === 401 || resposta.status === 403) {
          if (ativo) setOculto(true);
          return;
        }
        const data = (await resposta.json()) as {
          ok?: boolean;
          insight?: InsightPreditivo;
          motor?: string;
        };
        if (!resposta.ok || !data.ok || !data.insight) throw new Error("Insight indisponível");
        if (ativo) {
          setInsight(data.insight);
          setMotor(data.motor || "");
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (ativo) setOculto(true);
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    return () => {
      ativo = false;
      controller.abort();
    };
  }, [projeto]);

  if (oculto) return null;

  return (
    <section className="col-span-full rounded-2xl border border-line bg-papel p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Insights Preditivos da IA</h2>
            <span className="rounded-full bg-brand-suave px-2 py-0.5 text-[10px] font-medium text-brand-forte">
              {motor === "openai" ? "OpenAI + regras" : motor ? "fallback seguro" : "analítico"}
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Tendências das últimas semanas por FPY, recorrência e equipe/setor. Sinal preventivo, não previsão causal.
          </p>
        </div>
        {insight && (
          <span
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              insight.nivel === "PRIORIDADE"
                ? "border-alta text-alta"
                : insight.nivel === "ATENCAO"
                  ? "border-media text-media"
                  : "border-baixa text-baixa"
            }`}
          >
            {insight.nivel}
          </span>
        )}
      </div>

      {carregando ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-xl border border-line bg-papel-2" />
          ))}
        </div>
      ) : insight ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-xl border border-line bg-papel-2 p-3.5">
            <h3 className="text-sm font-medium text-ink">{insight.titulo}</h3>
            <p className="mt-1.5 text-xs leading-5 text-ink-2">{insight.resumo}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-papel-2 p-3.5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Sinais observados</div>
              <ul className="space-y-1.5 text-xs leading-5 text-ink-2">
                {insight.sinais.map((sinal) => (
                  <li key={sinal}>• {sinal}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-papel-2 p-3.5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-3">Ações preventivas</div>
              <ul className="space-y-1.5 text-xs leading-5 text-ink-2">
                {insight.acoes.map((acao) => (
                  <li key={acao}>• {acao}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
