type JsonSchema = Record<string, unknown>;

type OpenAiOk<T> = {
  ok: true;
  data: T;
  model: string;
};

type OpenAiFallback = {
  ok: false;
  reason: "missing_key" | "provider_error";
  error: string;
  model?: string;
};

export type OpenAiResult<T> = OpenAiOk<T> | OpenAiFallback;

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

export async function gerarJsonComOpenAI<T>({
  name,
  schema,
  instructions,
  input,
  maxOutputTokens = 1200,
  timeoutMs = 6500,
}: {
  name: string;
  schema: JsonSchema;
  instructions: string;
  input: unknown;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<OpenAiResult<T>> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) {
    return {
      ok: false,
      reason: "missing_key",
      error: "OPENAI_API_KEY não configurada.",
    };
  }

  const model =
    process.env.OPENAI_AI_SUITE_MODEL ||
    process.env.OPENAI_DIAGNOSTIC_MODEL ||
    "gpt-5.6-luna";

  try {
    const resposta = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        max_output_tokens: maxOutputTokens,
        instructions,
        input: JSON.stringify(input),
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema,
          },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resposta.ok) {
      const detalhe = (await resposta.text()).slice(0, 240);
      throw new Error(`OpenAI ${resposta.status}: ${detalhe}`);
    }

    const payload = (await resposta.json()) as unknown;
    const texto = extrairTextoResposta(payload);
    if (!texto) throw new Error("Resposta estruturada sem output_text.");

    return {
      ok: true,
      data: JSON.parse(texto) as T,
      model,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "provider_error",
      model,
      error: error instanceof Error ? error.message : "Falha desconhecida no provedor de IA.",
    };
  }
}
