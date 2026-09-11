"use client";

import { useEffect, useState } from "react";

export type Tema = "claro" | "escuro";
const CHAVE = "tecverde_tema";

/** Script que roda antes da pintura para a tela não piscar no tema errado. */
export const SCRIPT_TEMA = `
try{
  var t = localStorage.getItem('${CHAVE}');
  if (t !== 'claro' && t !== 'escuro') {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }
  document.documentElement.dataset.tema = t;
}catch(e){}
`;

export default function BotaoTema() {
  const [tema, setTema] = useState<Tema>("claro");

  // o tema real é escolhido pelo SCRIPT_TEMA antes da pintura; aqui só
  // sincronizamos o botão com o que já está no <html>
  useEffect(() => {
    const atual = document.documentElement.dataset.tema;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura do DOM, roda uma vez na montagem
    if (atual === "escuro" || atual === "claro") setTema(atual);
  }, []);

  function alternar() {
    const novo: Tema = tema === "escuro" ? "claro" : "escuro";
    document.documentElement.dataset.tema = novo;
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {}
    setTema(novo);
  }

  return (
    <button
      onClick={alternar}
      className="btn"
      title={`Mudar para o tema ${tema === "escuro" ? "claro" : "escuro"}`}
      aria-label={`Mudar para o tema ${tema === "escuro" ? "claro" : "escuro"}`}
      style={{ paddingInline: 10 }}
    >
      {tema === "escuro" ? <IconeSol /> : <IconeLua />}
    </button>
  );
}

function IconeSol() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((g) => (
        <line
          key={g}
          x1="12"
          y1="1.5"
          x2="12"
          y2="4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${g} 12 12)`}
        />
      ))}
    </svg>
  );
}

function IconeLua() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
