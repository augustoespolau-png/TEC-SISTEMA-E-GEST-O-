import { NextResponse } from "next/server";
import {
  criarInsightDeterministico,
  type InsightPreditivo,
} from "@/lib/ai/analytics";
import { obterContextoGestao } from "@/lib/ai/auth";
import { gerarJsonComOpenAI } from "@/lib/ai/openai";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store, max-age=0" };

const schemaInsight = {
  type: "object",
  additionalProperties: false,
  properties: {
    nivel: {
      type: "string",
      enum: ["ESTAVEL", "ATENCAO", "PRIORIDADE"],
    },
    titulo: { type: "string" },
    resumo: { type: "string" },
    sinais: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
    acoes: {
      type: "array",
      maxItems: 4,
      items: { type: "string" },
    },
  },
  required: ["nivel", "titulo", "resumo", "sinais", "acoes"],
};

export async function GET(request: Request) {
  const contexto = await obterContextoGestao();
  if (!contexto.ok) {
    return NextResponse.json(
      { ok: false, erro: contexto.erro },
      { status: contexto.status, headers: SEM_CACHE }
    );
  }

  const url = new URL(request.url);
  const projetoBruto = url.searchParams.get("project")?.trim() ?? "";
  const projeto = projetoBruto && projetoBruto.length <= 120 ? projetoBruto : null;

  const [tendencia, equipes, tipos] = await Promise.all([
    contexto.supabase.rpc("ai_suite_consulta", {
      p_intent: "tendencia_semanal",
      p_projeto: projeto,
      p_dias: 70,
      p_limite: 5,
    }),
    contexto.supabase.rpc("ai_suite_consulta", {
      p_intent: "equipes_setores",
      p_projeto: projeto,
      p_dias: 56,
      p_limite: 3,
    }),
    contexto.supabase.rpc("ai_suite_consulta", {
      p_intent: "top_tipos_desvio",
      p_projeto: projeto,
      p_dias: 56,
      p_limite: 3,
    }),
  ]);

  const falha = tendencia.error ?? equipes.error ?? tipos.error;
  if (falha) {
    return NextResponse.json(
      { ok: false, erro: falha.message, codigo: falha.code },
      { status: falha.code === "42501" ? 403 : 500, headers: SEM_CACHE }
    );
  }

  const fallback = criarInsightDeterministico({
    tendencia: tendencia.data,
    equipes: equipes.data,
    tipos: tipos.data,
  });

  const ia = await gerarJsonComOpenAI<InsightPreditivo>({
    name: "ai_suite_quality_insight",
    schema: schemaInsight,
    timeoutMs: 6500,
    maxOutputTokens: 950,
    instructions:
      "Você é um analista preventivo de qualidade industrial. Analise somente os agregados fornecidos. Não invente causas, não atribua culpa a pessoas/equipes, não trate correlação como causalidade e não faça previsões garantidas. Compare tendências semanais completas, recorrência de tipos de desvio e concentração por setor/equipe. Use PRIORIDADE apenas quando os próprios números mostrarem deterioração relevante; caso contrário use ATENCAO ou ESTAVEL. Recomende investigação preventiva e validação contra volume auditado.",
    input: {
      projeto: projeto ?? "consolidado",
      tendencia: tendencia.data,
      equipes: equipes.data,
      tipos: tipos.data,
      baseline_deterministico: fallback,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      projeto,
      periodo: "últimas 8 semanas",
      motor: ia.ok ? "openai" : "deterministico",
      modelo: ia.ok ? ia.model : ia.model,
      insight: ia.ok ? ia.data : fallback,
    },
    { headers: SEM_CACHE }
  );
}
