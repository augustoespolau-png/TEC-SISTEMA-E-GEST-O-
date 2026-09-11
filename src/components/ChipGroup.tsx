"use client";

export default function ChipGroup({
  opcoes,
  valor,
  onChange,
  grade = false,
  rotulos,
}: {
  opcoes: string[];
  valor: string;
  onChange: (v: string) => void;
  grade?: boolean;
  /** texto a exibir quando o valor guardado é diferente do que se lê */
  rotulos?: Record<string, string>;
}) {
  return (
    <div className={`chips ${grade ? "grade" : ""}`}>
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o === valor ? "" : o)}
          className={`chip-esc ${o === valor ? "on" : ""}`}
        >
          {rotulos?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
