export default function IaTecIcone({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="ia-tec-icone"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ia-tec-orbe" cx="35%" cy="28%" r="76%">
          <stop offset="0" stopColor="#5ddcff" />
          <stop offset="0.42" stopColor="#2e6df2" />
          <stop offset="1" stopColor="#10257f" />
        </radialGradient>
        <linearGradient
          id="ia-tec-anel"
          x1="3"
          y1="21"
          x2="21"
          y2="3"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#1be1ff" />
          <stop offset="0.5" stopColor="#2374ff" />
          <stop offset="1" stopColor="#8cecff" />
        </linearGradient>
        <radialGradient
          id="ia-tec-nucleo"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(9 8) rotate(47) scale(10 9)"
        >
          <stop stopColor="#4478ef" />
          <stop offset="0.42" stopColor="#2449bd" />
          <stop offset="1" stopColor="#14267f" />
        </radialGradient>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="10.1"
        fill="url(#ia-tec-orbe)"
        stroke="url(#ia-tec-anel)"
        strokeWidth="1.1"
      />
      <g className="ia-tec-nucleo-giro">
        <circle
          cx="12"
          cy="12"
          r="7.7"
          fill="url(#ia-tec-nucleo)"
          stroke="#53d8ff"
          strokeOpacity="0.74"
          strokeWidth="0.8"
        />
        <path
          d="M7.4 12.8c1.45.86 3.02 1.3 4.72 1.3 1.65 0 3.18-.43 4.48-1.28v3.13c-1.15 1.25-2.63 1.88-4.45 1.88-1.86 0-3.45-.64-4.75-1.92Z"
          fill="#0c1a6e"
        />
        <path
          d="M8.25 9.35c1.15-.84 2.42-1.26 3.8-1.26 1.48 0 2.8.44 3.96 1.32"
          stroke="#86edff"
          strokeLinecap="round"
          strokeWidth="0.8"
          strokeOpacity="0.78"
        />
        <circle
          cx="8.45"
          cy="7.65"
          r="0.85"
          fill="#b3f7ff"
          fillOpacity="0.9"
        />
      </g>

      {/* Anel interno em rotação: mantém o orbe estável e dá movimento
          apenas dentro dele, sem deslocar o ícone na navegação. */}
      <g className="ia-tec-giro">
        <circle
          cx="12"
          cy="12"
          r="8.65"
          fill="none"
          stroke="url(#ia-tec-anel)"
          strokeWidth="0.7"
          strokeLinecap="round"
          strokeDasharray="5.2 3.1 1.2 4.4"
          strokeOpacity="0.86"
        />
        <circle
          cx="12"
          cy="3.35"
          r="0.72"
          fill="#b8f7ff"
          fillOpacity="0.92"
        />
      </g>
    </svg>
  );
}
