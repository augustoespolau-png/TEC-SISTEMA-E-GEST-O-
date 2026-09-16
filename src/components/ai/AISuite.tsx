"use client";

import { FormEvent, useState } from "react";

type Mensagem = {
  id: string;
  papel: "gestor" | "assistente";
  texto: string;
  motor?: string;
};

const EXEMPLOS = [
  "Quais casas tiveram mais desvios na última semana?",
  "Qual o FPY consolidado do projeto C4A?",
  "Quais tipos de desvio mais se repetiram nos últimos 30 dias?",
  "Como está a tendência semanal de qualidade?",
];

export default function AISuite() {
  const [pergunta, setPergunta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: "boas-vindas",
      papel: "assistente",
      texto:
        "Consulte FPY, desvios, casas, equipes/setores, tendências e o Health-Check em linguagem natural. A consulta é executada somente por RPCs allowlisted — nenhum SQL livre gerado por IA é executado.",
      motor: "seguro",
    },
  ]);
  const [gerandoDigest, setGerandoDigest] = useState(false);
  const [digest, setDigest] = useState("");
  const [motorDigest, setMotorDigest] = useState("");
  const [copiado, setCopiado] = useState(false);

  async function perguntar(textoForcado?: string) {
    const question = (textoForcado ?? pergunta).trim();
    if (!question || enviando) return;

    const id = `${Date.now()}`;
    setMensagens((atuais) => [
      ...atuais,
      { id: `${id}-q`, papel: "gestor", texto: question },
    ]);
    setPergunta("");
    setEnviando(true);

    try {
      const resposta = await fetch("/api/ai/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = (await resposta.json()) as {
        ok?: boolean;
        answer?: string;
        erro?: string;
        motor?: string;
      };
      if (!resposta.ok || !data.ok) throw new Error(data.erro || "Falha na consulta.");

      setMensagens((atuais) => [
        ...atuais,
        {
          id: `${id}-a`,
          papel: "assistente",
          texto: data.answer || "Consulta concluída sem conteúdo.",
          motor: data.motor,
        },
      ]);
    } catch (error) {
      setMensagens((atuais) => [
        ...atuais,
        {
          id: `${id}-e`,
          papel: "assistente",
          texto:
            "A consulta inteligente não ficou disponível agora. O restante do sistema continua operando normalmente. " +
            (error instanceof Error ? error.message : ""),
          motor: "fallback",
        },
      ]);
    } finally {
      setEnviando(false);
    }
  }

  async function aoEnviar(event: FormEvent) {
    event.preventDefault();
    await perguntar();
  }

  async function gerarDigest() {
    if (gerandoDigest) return;
    setGerandoDigest(true);
    setCopiado(false);
    try {
      const resposta = await fetch("/api/ai/digest", { method: "POST" });
      const data = (await resposta.json()) as {
        ok?: boolean;
        texto?: string;
        erro?: string;
        motor?: string;
      };
      if (!resposta.ok || !data.ok) throw new Error(data.erro || "Falha ao gerar relatório.");
      setDigest(data.texto || "");
      setMotorDigest(data.motor || "");
    } catch (error) {
      setDigest(
        "Não foi possível gerar o digest neste momento. O painel e as rotinas operacionais não foram afetados.\n\n" +
          (error instanceof Error ? error.message : "")
      );
      setMotorDigest("indisponível");
    } finally {
      setGerandoDigest(false);
    }
  }

  async function copiarDigest() {
    if (!digest) return;
    await navigator.clipboard.writeText(digest);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1800);
  }

  return (
    <main className="tela py-5 sm:py-7">
      <header className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
            Gestão · Lapidação Inteligente
          </p>
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">AI Suite</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Analytics em linguagem natural, tendências preventivas e relatório executivo com motor híbrido resiliente.
          </p>
        </div>
        <div className="w-fit rounded-full border border-line bg-papel-2 px-3 py-1.5 text-[11px] text-ink-2">
          Gestão only · RPC allowlist · sem SQL livre
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="flex min-h-[560px] flex-col rounded-2xl border border-line bg-papel shadow-sm">
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Consulta Inteligente</h2>
                <p className="mt-0.5 text-xs text-ink-3">Pergunte como falaria com um analista de qualidade.</p>
              </div>
              <span className="rounded-full bg-brand-suave px-2.5 py-1 text-[10px] font-medium text-brand-forte">
                Text-to-RPC seguro
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
            {mensagens.map((mensagem) => (
              <div
                key={mensagem.id}
                className={`flex ${mensagem.papel === "gestor" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl border px-3.5 py-3 text-sm leading-6 sm:max-w-[82%] ${
                    mensagem.papel === "gestor"
                      ? "border-brand bg-brand-suave text-ink"
                      : "border-line bg-papel-2 text-ink"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{mensagem.texto}</div>
                  {mensagem.papel === "assistente" && mensagem.motor && (
                    <div className="mt-2 text-[10px] uppercase tracking-wide text-ink-3">
                      motor: {mensagem.motor === "openai" ? "OpenAI" : mensagem.motor}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="w-fit rounded-2xl border border-line bg-papel-2 px-3.5 py-3 text-sm text-ink-3">
                Analisando intenção e agregados…
              </div>
            )}
          </div>

          <div className="border-t border-line p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {EXEMPLOS.map((exemplo) => (
                <button
                  key={exemplo}
                  type="button"
                  onClick={() => void perguntar(exemplo)}
                  disabled={enviando}
                  className="rounded-full border border-line bg-papel-2 px-3 py-1.5 text-left text-[11px] text-ink-2 transition hover:border-brand hover:text-ink disabled:opacity-50"
                >
                  {exemplo}
                </button>
              ))}
            </div>
            <form onSubmit={aoEnviar} className="flex gap-2">
              <input
                value={pergunta}
                onChange={(event) => setPergunta(event.target.value)}
                maxLength={600}
                placeholder="Ex.: quais casas concentraram mais desvios nos últimos 7 dias?"
                className="min-w-0 flex-1 rounded-xl border border-line bg-papel px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-brand"
                aria-label="Pergunta para a AI Suite"
              />
              <button
                type="submit"
                disabled={enviando || pergunta.trim().length < 3}
                className="rounded-xl border border-brand bg-brand px-4 py-2.5 text-sm font-medium text-white transition hover:border-brand-forte hover:bg-brand-forte disabled:cursor-not-allowed disabled:opacity-50"
              >
                Consultar
              </button>
            </form>
          </div>
        </section>

        <section className="flex min-h-[560px] flex-col rounded-2xl border border-line bg-papel shadow-sm">
          <div className="border-b border-line px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">Relatório Executivo Semanal</h2>
                <p className="mt-0.5 text-xs text-ink-3">FPY, desvios, recorrências e Health-Check.</p>
              </div>
              <button
                type="button"
                onClick={() => void gerarDigest()}
                disabled={gerandoDigest}
                className="rounded-xl border border-brand bg-brand px-3.5 py-2 text-xs font-medium text-white transition hover:bg-brand-forte disabled:opacity-50"
              >
                {gerandoDigest ? "Gerando…" : "Gerar Relatório Executivo com IA"}
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 sm:p-5">
            {digest ? (
              <div className="flex h-full flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-wide text-ink-3">
                    motor: {motorDigest === "openai" ? "OpenAI" : motorDigest}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copiarDigest()}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink-2 transition hover:border-brand hover:text-ink"
                  >
                    {copiado ? "Copiado" : "Copiar para ata/e-mail"}
                  </button>
                </div>
                <pre className="min-h-0 flex-1 whitespace-pre-wrap rounded-xl border border-line bg-papel-2 p-4 font-sans text-xs leading-6 text-ink sm:text-sm">
                  {digest}
                </pre>
              </div>
            ) : (
              <div className="flex h-full min-h-[360px] items-center justify-center rounded-xl border border-dashed border-line bg-papel-2 p-6 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-papel text-lg text-brand">
                    ✦
                  </div>
                  <p className="text-sm font-medium text-ink">Digest pronto sob demanda</p>
                  <p className="mt-1 text-xs leading-5 text-ink-3">
                    O relatório usa apenas dados agregados da semana e o último Health-Check. Se a OpenAI estiver indisponível, o motor determinístico produz a versão de contingência.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
