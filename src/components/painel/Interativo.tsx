/*
 * ATENÇÃO: este arquivo NÃO está aposentado.
 * Ele mora na pasta do painel antigo por ser mais velho, mas o painel
 * atual (src/components/painel2/) depende dele — Dica, Linha e
 * AvisoClique são usados lá. Apagar a pasta inteira quebra o painel que
 * está no ar.
 *
 * Peças de interação compartilhadas pelos gráficos do painel.
 *
 * Duas regras valem em todos eles:
 *   - passar o mouse (ou dar foco pelo teclado) explica a marca por
 *     extenso, com os números que a barra resume;
 *   - clicar aplica um recorte no painel inteiro; clicar de novo remove.
 *
 * Quem não recebe `aoClicar` continua sendo uma linha estática, sem
 * fingir ser botão.
 */

export function Dica({
  children,
  lado = "centro",
}: {
  children: React.ReactNode;
  /**
   * De que lado o balão se ancora. Encostado numa borda, o balão
   * centralizado sairia da tela — daí "esq" para marcas da esquerda e
   * "dir" para as da direita.
   */
  lado?: "esq" | "dir" | "centro";
}) {
  return (
    <span className={`dica ${lado === "centro" ? "" : lado}`}>{children}</span>
  );
}

/** Uma linha de barra horizontal, clicável quando há recorte possível. */
export function Linha({
  ativo,
  aoClicar,
  dica,
  titulo,
  children,
}: {
  ativo?: boolean;
  aoClicar?: () => void;
  dica?: React.ReactNode;
  /** texto do title, para quem chega pelo toque ou por leitor de tela */
  titulo?: string;
  children: React.ReactNode;
}) {
  if (!aoClicar)
    return (
      <div
        className={`bar ${dica ? "dica-alvo" : ""}`}
        title={titulo}
        tabIndex={dica ? 0 : undefined}
      >
        {children}
        {dica && <Dica lado="esq">{dica}</Dica>}
      </div>
    );

  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      title={titulo}
      className={`bar dica-alvo clicavel ${ativo ? "on" : ""}`}
    >
      {children}
      {dica && <Dica lado="esq">{dica}</Dica>}
    </button>
  );
}

/** Rodapé padrão dos gráficos que filtram. */
export function AvisoClique({ o_que = "a barra" }: { o_que?: string }) {
  return (
    <p className="sub" style={{ marginTop: 10 }}>
      Toque em {o_que} para filtrar o painel inteiro por ela. Toque de novo
      para desfazer.
    </p>
  );
}
