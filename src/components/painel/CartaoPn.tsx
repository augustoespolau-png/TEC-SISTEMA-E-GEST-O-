export default function CartaoPn({
  titulo,
  subtitulo,
  acessorio,
  classe = "",
  children,
}: {
  titulo: string;
  subtitulo?: string;
  acessorio?: React.ReactNode;
  classe?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`cartao ${classe}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2>{titulo}</h2>
          {subtitulo && <p className="sub">{subtitulo}</p>}
        </div>
        {acessorio}
      </div>
      <div className="corpo">{children}</div>
    </section>
  );
}

export function SemDados({ children }: { children?: React.ReactNode }) {
  return (
    <p
      className="py-6 text-center text-[12px]"
      style={{ color: "var(--color-ink-3)" }}
    >
      {children ?? "Sem registros no período."}
    </p>
  );
}

/** Aviso para indicadores que só passam a existir com a data do retrabalho. */
export function AguardandoDados({ o_que }: { o_que: string }) {
  return (
    <div
      className="rounded-lg border border-dashed p-4 text-[12px] leading-relaxed"
      style={{ borderColor: "var(--color-line-2)", color: "var(--color-ink-3)" }}
    >
      <b style={{ color: "var(--color-ink-2)" }}>Medindo a partir de agora.</b>{" "}
      {o_que} depende da data em que o retrabalho foi concluído, capturada
      quando alguém marca o erro como RETRABALHO na tela Consultar. Os
      registros importados da planilha antiga não têm essa data, então este
      indicador se preenche conforme os retrabalhos forem sendo registrados.
    </div>
  );
}
