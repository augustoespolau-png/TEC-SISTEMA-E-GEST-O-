/*
 * O nome do sistema, num lugar só.
 *
 * Ele aparece ao lado do logo em toda tela e na entrada. Ficava escrito
 * à mão em três arquivos, com textos diferentes ("Registro de Erros",
 * "Painel de Produção"), o que fazia o sistema parecer três coisas.
 *
 * A quebra de linha é fixa e não automática: em duas linhas o bloco tem
 * a mesma altura do logo ao lado, e a marca não fica torta.
 */

export const NOME_SISTEMA = "Sistema de Gestão da Qualidade";

export default function NomeSistema({
  className = "",
  cor = "var(--color-ink-3)",
}: {
  className?: string;
  cor?: string;
}) {
  return (
    <span
      className={`shrink-0 border-l pl-2 text-[10px] leading-[1.25] font-light ${className}`}
      style={{ color: cor, borderColor: "var(--color-line)" }}
      title={NOME_SISTEMA}
    >
      Sistema de Gestão
      <br />
      da Qualidade
    </span>
  );
}
