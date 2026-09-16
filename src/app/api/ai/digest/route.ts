import { NextResponse } from "next/server";
import {
  criarDigestDeterministico,
  digestParaTexto,
  type DigestExecutivo,
} from "@/lib/ai/analytics";
import { obterContextoGestao } from "@/lib/ai/auth";
import { gerarJsonComOpenAI } from "@/lib/ai/openai";
import type { HealthDiagnostico } from "@/lib/diagnostico";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store, max-age=0" };

const schemaDigest = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    periodo: { type: "string" },
    resumo_executivo: { type: "string" },
    destaques: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
    riscos: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
    acoes: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
    saude_sistema: { type: "string" },
  },
  required: [
    "titulo",
    "periodo",
    "resumo_executivo",
    "destaques",
    "riscos",
    "acoes",
    "saude_sistema",
  ],
};

export async function POST() {
  const contexto = await obterContextoGestao();
  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, erro: contexto.erro },
      { status: contexto.status, headers: SEM_CACHE }
    );
  }

  const [resumo, healthResult] = await Promise.all([
    contexto.supabase.rpc("ai_suite_consulta", {
      p_intent: "resumo_semanal",
      p_projeto: null,
      p_dias: null,
      p_limite: 5,
    }),
    contexto.supabase.rpc("diagnostico_sistema_ultimo"),
  ]);

  const falha = resumo.error ?? healthResult.error;
  if (falha) {
    return NextResponse.json(
      { ok: false, erro: falha.message, codigo: falha.code },
      { status: falha.code === "42501" ? 403 : 500, headers: SEM_CACHE }
    );
  }

  const health = healthResult.data as HealthDiagnostico;
  const fallback = criarDigestDeterministico(resumo.data, health);
  const healthSeguro = {
    checked_at: health.checked_at,
    status: health.status,
    integrity_percent: health.integrity_percent,
    critical_count: health.critical_count,
    warning_count: health.warning_count,
    anomaly_count: health.anomaly_count,
    totals: health.totals,
    issues: health.issues
      .filter((issue) => Number(issue.count) > 0)
      .map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        count: issue.count,
        message: issue.message,
        auto_repair_safe: issue.auto_repair_safe,
      })),
  };

  const ia = await gerarJsonComOpenAI<DigestExecutivo>({
    name: "ai_suite_executive_digest",
    schema: schemaDigest,
    timeoutMs: 8000,
    maxOutputTokens: 1500,
    instructions:
      "Você redige um resumo executivo semanal de qualidade industrial para diretoria. Use somente os agregados e o Health-Check fornecidos. Seja objetivo, profissional e factual. Compare a janela atual com a anterior, destaque FPY, desvios críticos, recorrências e saúde do sistema. Não invente causas, metas ou números. Não esconda alertas do Health-Check e não recomende auto-reparo fora do que estiver explicitamente marcado como seguro. As ações devem ser gerenciais e verificáveis.",
    input: {
      resumo_semanal: resumo.data,
      health_check: healthSeguro,
      baseline_deterministico: fallback,
    },
  });

  const digest = ia.ok ? ia.data : fallback;
  return NextResponse.json(
    {
      ok: true,
      motor: ia.ok ? "openai" : "deterministico",
      modelo: ia.ok ? ia.model : ia.model,
      digest,
      texto: digestParaTexto(digest),
      healthCheckedAt: health.checked_at,
    },
    { headers: SEM_CACHE }
  );
}
