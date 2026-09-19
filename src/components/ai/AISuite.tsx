"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import IaTecIcone from "@/components/IaTecIcone";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
};

const SUGESTOES = [
  "Qual o FPY consolidado do projeto C4A?",
  "Como está a casa 153 do projeto C4A?",
  "Mostre o panorama de resíduos e MTRs dos últimos 30 dias.",
  "Há lotes de madeira fora do padrão de umidade?",
  "Explique como montar um plano de ação 5W2H para qualidade.",
];

function idMensagem(prefixo: string) {
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AISuite() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [receivedFirstChunk, setReceivedFirstChunk] = useState(false);
  const [erroGeral, setErroGeral] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const area = scrollRef.current;
    if (!area) return;
    area.scrollTo({
      top: area.scrollHeight,
      behavior: messages.length > 2 ? "smooth" : "auto",
    });
  }, [messages, sending, receivedFirstChunk]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function enviar(textoForcado?: string) {
    const question = (textoForcado ?? input).trim();
    if (!question || sending) return;

    const userMessage: ChatMessage = {
      id: idMensagem("user"),
      role: "user",
      content: question,
    };
    const assistantId = idMensagem("assistant");

    const historico = [...messages, userMessage]
      .filter((message) => !message.error && message.content.trim())
      .slice(-24)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setErroGeral("");
    setSending(true);
    setReceivedFirstChunk(false);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historico }),
      });

      if (!response.ok) {
        let message = "Não foi possível consultar o IA-TEC.";
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } else {
          const text = await response.text();
          if (text.trim()) message = text.trim();
        }
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("O servidor não iniciou o streaming da resposta.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        accumulated += chunk;
        setReceivedFirstChunk(true);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: accumulated }
              : message,
          ),
        );
      }

      accumulated += decoder.decode();

      if (!accumulated.trim()) {
        throw new Error(
          "O Gemini encerrou a resposta sem texto. Tente reformular a pergunta.",
        );
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: accumulated.trimEnd() }
            : message,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "O agente ficou indisponível neste momento.";

      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content:
                  "Não consegui concluir essa resposta. " +
                  message,
                error: true,
              }
            : item,
        ),
      );
      setErroGeral(message);
    } finally {
      setSending(false);
      setReceivedFirstChunk(false);
      window.setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await enviar();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void enviar();
    }
  }

  function novaConversa() {
    if (sending) return;
    setMessages([]);
    setInput("");
    setErroGeral("");
    textareaRef.current?.focus();
  }

  const vazio = messages.length === 0;

  return (
    <main className="tela ia-agent-page">
      <section className="ia-agent-shell" aria-label="IA-TEC">
        <header className="ia-agent-header">
          <div className="ia-agent-title">
            <div className="ia-agent-orbe" aria-hidden>
              <IaTecIcone size={30} />
            </div>
            <div>
              <div className="ia-agent-kicker">IA-TEC · AGENTE CONVERSACIONAL</div>
              <h1>Como posso ajudar?</h1>
              <p>
                Conhecimento geral + dados do sistema em tempo real por ferramentas seguras.
              </p>
            </div>
          </div>

          <div className="ia-agent-header-actions">
            <span className="ia-agent-provider">
              <i aria-hidden />
              Gemini
            </span>
            <button
              type="button"
              className="ia-agent-new"
              onClick={novaConversa}
              disabled={sending || vazio}
            >
              Nova conversa
            </button>
          </div>
        </header>

        <div className="ia-agent-stream" ref={scrollRef} aria-live="polite">
          {vazio ? (
            <div className="ia-agent-empty">
              <div className="ia-agent-empty-orbe" aria-hidden>
                <IaTecIcone size={48} />
              </div>
              <h2>Converse naturalmente com o IA-TEC</h2>
              <p>
                Pergunte sobre FPY, uma casa, resíduos, MTRs ou lotes de madeira.
                Para outros assuntos, o agente responde com o conhecimento do Gemini.
              </p>

              <div className="ia-agent-suggestions">
                {SUGESTOES.map((sugestao) => (
                  <button
                    key={sugestao}
                    type="button"
                    onClick={() => void enviar(sugestao)}
                    disabled={sending}
                  >
                    <span>{sugestao}</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M5 12h14" />
                      <path d="m13 6 6 6-6 6" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="ia-agent-messages">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    "ia-agent-message " +
                    (message.role === "user" ? "user" : "assistant") +
                    (message.error ? " error" : "")
                  }
                >
                  {message.role === "assistant" && (
                    <div className="ia-agent-avatar" aria-hidden>
                      <IaTecIcone size={24} />
                    </div>
                  )}

                  <div className="ia-agent-message-body">
                    <div className="ia-agent-message-label">
                      {message.role === "user" ? "Você" : "IA-TEC"}
                    </div>

                    {message.role === "assistant" &&
                    !message.content &&
                    sending ? (
                      <div className="ia-agent-thinking">
                        <span />
                        <span />
                        <span />
                        <em>
                          {receivedFirstChunk
                            ? "Respondendo"
                            : "Pensando e consultando ferramentas"}
                        </em>
                      </div>
                    ) : (
                      <div className="ia-agent-message-text">
                        {message.content}
                        {sending &&
                          message.role === "assistant" &&
                          message.id === messages.at(-1)?.id &&
                          message.content && (
                            <span className="ia-agent-caret" aria-hidden />
                          )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="ia-agent-composer-wrap">
          {erroGeral && (
            <div className="ia-agent-error" role="status">
              {erroGeral}
            </div>
          )}

          <form className="ia-agent-composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 4000))}
              onKeyDown={onKeyDown}
              rows={1}
              maxLength={4000}
              placeholder="Pergunte qualquer coisa ao IA-TEC…"
              aria-label="Mensagem para o IA-TEC"
              disabled={sending}
            />
            <button
              type="submit"
              className="ia-agent-send"
              disabled={sending || input.trim().length === 0}
              aria-label="Enviar mensagem"
            >
              {sending ? (
                <span className="ia-agent-stop-dot" />
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m5 12 14-7-4 14-3-6-7-1Z" />
                  <path d="m12 13 7-8" />
                </svg>
              )}
            </button>
          </form>

          <div className="ia-agent-footnote">
            <span>Enter envia · Shift + Enter quebra linha</span>
            <span>Dados internos somente via ferramentas autenticadas</span>
          </div>
        </div>
      </section>
    </main>
  );
}
