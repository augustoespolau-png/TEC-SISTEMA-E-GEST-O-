import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  criarRelatorioDeterministico,
  type HealthDiagnostico,
  type RelatorioIaDiagnostica,
} from "@/lib/diagnostico";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store, max-age=0" };

async function contextoGestao() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { erro: NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401, headers: SEM_CACHE }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "gestao") {
    return { erro: NextResponse.json({ ok: false, erro: "Acesso restrito à Gestão." }, { status: 403, headers: SEM_CACHE }) };
  }

  return { supabase, user };
}

function extrairTextoResposta(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

async function analisarComOpenAI(health: HealthDiagnostico): Promise<{
  relatorio: RelatorioIaDiagnostica;
  motor: "openai" | "deterministico";
  modelo?: string;
  aviso?: string;
}> {
  const fallback = criarRelatorioDeterministico(health);
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) {
    return {
      relatorio: fallback,
      motor: "deterministico",
      aviso: "OPENAI_API_KEY não configurada; usado motor determinístico seguro.",
    };
  }

  const modelo = process.env.OPENAI_DIAGNOSTIC_MODEL || "gpt-5.6-luna";
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      resumo: { type: "string" },
      criticidade_geral: {
        type: "string",
        enum: ["SAUDAVEL", "ATENCAO", "CRITICO"],
      },
      problemas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            codigo: { type: "string" },
            criticidade: {
              type: "string",
              enum: ["CRITICA", "ALTA", "MEDIA", "BAIXA"],
            },
            causa_raiz: { type: "string" },
            impacto: { type: "string" },
            acao_recomendada: { type: "string" },
            reparo_seguro_disponivel: { type: "boolean" },
            repair_code: { type: "string" },
            comando_sugerido: { type: "string" },
          },
          required: [
            "codigo",
            "criticidade",
            "causa_raiz",
            "impacto",
            "acao_recomendada",
            "reparo_seguro_disponivel",
            "repair_code",
            "comando_sugerido",
          ],
        },
      },
    },
    required: ["resumo", "criticidade_geral", "problemas"],
  };

  try {
    const resposta = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        reasoning: { effort: "low" },
        max_output_tokens: 2600,
        instructions:
          "Você é o auditor técnico interno de um sistema de qualidade industrial. Analise SOMENTE o JSON recebido. Classifique causas e impactos sem inventar fatos. Nunca gere SQL destrutivo, DELETE, DROP ou UPDATE livre. O único repair_code executável permitido é SKELETON_MISSING_WALLS quando o próprio health-check marcar auto_repair_safe=true. Para qualquer outro problema, repair_code deve ser string vazia e o comando deve exigir revisão humana. Não trate metadados de anexos órfãos como perda de arquivo confirmada: apenas como vínculo relacional pendente de revisão.",
        input: JSON.stringify(health),
        text: {
          format: {
            type: "json_schema",
            name: "diagnostico_sistema_qualidade",
            strict: true,
            schema,
          },
        },
      }),
      signal: AbortSignal.timeout(18_000),
    });

    if (!resposta.ok) {
      const texto = await resposta.text();
      throw new Error(`OpenAI ${resposta.status}: ${texto.slice(0, 240)}`);
    }

    const payload = (await resposta.json()) as unknown;
    const texto = extrairTextoResposta(payload);
    if (!texto) throw new Error("Resposta da IA sem output_text estruturado.");

    const relatorio = JSON.parse(texto) as RelatorioIaDiagnostica;
    return { relatorio, motor: "openai", modelo };
  } catch (error) {
    return {
      relatorio: fallback,
      motor: "deterministico",
      modelo,
      aviso:
        "A IA externa não respondeu; o diagnóstico continuou disponível pelo motor determinístico: " +
        (error instanceof Error ? error.message : "erro desconhecido"),
    };
  }
}

export async function GET(request: Request) {
  const contexto = await contextoGestao();
  if ("erro" in contexto) return contexto.erro;

  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const rpc = fresh ? "diagnostico_sistema_health_check" : "diagnostico_sistema_ultimo";
  const args = fresh ? { p_persistir: true } : undefined;
  const { data, error } = await contexto.supabase.rpc(rpc, args);

  if (error) {
    return NextResponse.json(
      { ok: false, erro: error.message, codigo: error.code },
      { status: 500, headers: SEM_CACHE }
    );
  }

  return NextResponse.json(
    { ok: true, health: data as HealthDiagnostico, fonte: fresh ? "recheck" : "snapshot" },
    { headers: SEM_CACHE }
  );
}

export async function POST(request: Request) {
  const contexto = await contextoGestao();
  if ("erro" in contexto) return contexto.erro;

  let body: {
    action?: "analyze" | "repair";
    codigo?: string;
    alvo?: { projeto?: string; casas?: string[] };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido." }, { status: 400, headers: SEM_CACHE });
  }

  if (body.action === "repair") {
    if (body.codigo !== "SKELETON_MISSING_WALLS") {
      return NextResponse.json(
        { ok: false, erro: "Código de reparo não permitido." },
        { status: 400, headers: SEM_CACHE }
      );
    }
    const projeto = body.alvo?.projeto?.trim();
    const casas = (body.alvo?.casas ?? []).map((casa) => String(casa).trim()).filter(Boolean);
    if (!projeto || casas.length === 0 || casas.length > 100) {
      return NextResponse.json(
        { ok: false, erro: "Projeto/casas inválidos para reparo." },
        { status: 400, headers: SEM_CACHE }
      );
    }

    const { data, error } = await contexto.supabase.rpc("diagnostico_sistema_reparar", {
      p_codigo: body.codigo,
      p_alvo: { projeto, casas },
    });
    if (error) {
      return NextResponse.json(
        { ok: false, erro: error.message, codigo: error.code },
        { status: 409, headers: SEM_CACHE }
      );
    }
    return NextResponse.json({ ok: true, repair: data }, { headers: SEM_CACHE });
  }

  const { data, error } = await contexto.supabase.rpc("diagnostico_sistema_health_check", {
    p_persistir: true,
  });
  if (error) {
    return NextResponse.json(
      { ok: false, erro: error.message, codigo: error.code },
      { status: 500, headers: SEM_CACHE }
    );
  }

  const health = data as HealthDiagnostico;
  const ia = await analisarComOpenAI(health);
  return NextResponse.json({ ok: true, health, ia }, { headers: SEM_CACHE });
}
