"use client";

import { useEffect, useRef, useState } from "react";

/*
 * INTERVALO NUM CALENDÁRIO SÓ — o gesto de site de passagem aérea:
 * clica no dia da ida, clica no dia da volta, pronto.
 *
 * Antes eram dois campos <input type="date"> um ao lado do outro, e
 * eles custavam duas coisas: uma FAIXA INTEIRA de altura abaixo dos
 * filtros, que só aparecia no modo personalizado e empurrava os
 * gráficos para baixo; e dois calendários separados, em que a pessoa
 * escolhia a data inicial num, fechava, e abria outro para a final —
 * sem nunca ver as duas pontas juntas.
 *
 * Aqui o intervalo se lê enquanto se escolhe: o dia sob o ponteiro
 * pinta o trecho inteiro antes do clique.
 *
 * ARITMÉTICA EM UTC, sempre. `new Date("2026-08-11")` é meia-noite UTC,
 * mas `new Date(2026, 7, 11)` é meia-noite local — misturar os dois num
 * fuso a oeste de Greenwich faz o dia 1º virar o último dia do mês
 * anterior. Todo cálculo aqui passa por Date.UTC.
 */

const DIA = 86_400_000;
const SEMANA = ["S", "T", "Q", "Q", "S", "S", "D"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const paraMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const paraIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const bonito = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

/** Segunda-feira da semana daquele dia, para alinhar a grade. */
function segunda(ms: number) {
  const dow = new Date(ms).getUTCDay();
  return ms - ((dow + 6) % 7) * DIA;
}

/** Os 42 dias que a grade de um mês mostra (6 semanas fechadas). */
function gradeDoMes(ano: number, mes: number) {
  const primeiro = Date.UTC(ano, mes, 1);
  const inicio = segunda(primeiro);
  return Array.from({ length: 42 }, (_, i) => inicio + i * DIA);
}

export default function EscolhaDeDatas({
  de,
  ate,
  max,
  vazio = "Escolher datas",
  larguraCheia = false,
  aoEscolher,
  aoLimpar,
}: {
  de: string;
  ate: string;
  /** último dia selecionável (hoje) */
  max: string;
  /** o que o botão diz quando não há intervalo escolhido */
  vazio?: string;
  /** ocupa a largura do pai — na coluna de filtros, e não numa faixa */
  larguraCheia?: boolean;
  aoEscolher: (de: string, ate: string) => void;
  /** quando existe, o calendário oferece tirar o recorte de data */
  aoLimpar?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [inicio, setInicio] = useState<string>(de);
  const [fim, setFim] = useState<string>(ate);
  const [sobre, setSobre] = useState<string>("");
  const caixa = useRef<HTMLDivElement>(null);

  /* o mês que a grade mostra à esquerda; começa onde o intervalo está */
  const base = de || max;
  const [mesBase, setMesBase] = useState(() => base.slice(0, 7));

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function abrir() {
    setInicio(de);
    setFim(ate);
    setSobre("");
    setMesBase((de || max).slice(0, 7));
    setAberto(true);
  }

  function clicar(iso: string) {
    /* Sem ponta aberta esperando: um clique com o intervalo já fechado
       recomeça a escolha. É o que a pessoa quer quando volta ao
       calendário — trocar o intervalo, não estender o antigo. */
    if (!inicio || fim) {
      setInicio(iso);
      setFim("");
      return;
    }
    if (paraMs(iso) < paraMs(inicio)) {
      setInicio(iso);
      return;
    }
    setFim(iso);
    aoEscolher(inicio, iso);
    setAberto(false);
  }

  const [a, m] = mesBase.split("-").map(Number);
  const andar = (n: number) => {
    const d = new Date(Date.UTC(a, m - 1 + n, 1));
    setMesBase(d.toISOString().slice(0, 7));
  };

  /* o fim provisório é o dia sob o ponteiro: pinta o trecho antes do
     segundo clique, que é o que faz o intervalo ser lido enquanto se
     escolhe */
  const fimVisual = fim || (inicio && sobre && sobre >= inicio ? sobre : "");

  const rotulo =
    de && ate
      ? `${bonito(de)} – ${bonito(ate)}`
      : de
        ? `de ${bonito(de)}`
        : ate
          ? `até ${bonito(ate)}`
          : vazio;

  return (
    <div
      className={`ind-datas-caixa${larguraCheia ? " ind-datas-larga" : ""}`}
      ref={caixa}
    >
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className="btn ind-datas-botao"
        aria-expanded={aberto}
        title="Escolher o intervalo num calendário só"
      >
        {rotulo}
      </button>

      {aberto && (
        <div className="ind-calendario" role="dialog" aria-label="Intervalo de datas">
          <div className="ind-cal-topo">
            <button type="button" onClick={() => andar(-1)} aria-label="Mês anterior">
              ‹
            </button>
            <span>
              {inicio && !fim
                ? "Agora escolha o dia final"
                : "Escolha o dia inicial"}
            </span>
            <button type="button" onClick={() => andar(1)} aria-label="Próximo mês">
              ›
            </button>
          </div>

          {/* Sem esta saída, quem escolhe um intervalo fica preso a ele:
              o calendário só sabe trocar um intervalo por outro, e não há
              gesto nenhum que signifique "nenhuma data". */}
          {aoLimpar && (de || ate) && (
            <button
              type="button"
              className="ind-cal-limpa"
              onClick={() => {
                aoLimpar();
                setAberto(false);
              }}
            >
              Sem recorte de data
            </button>
          )}

          <div className="ind-cal-meses">
            {[0, 1].map((n) => {
              const d = new Date(Date.UTC(a, m - 1 + n, 1));
              const ano = d.getUTCFullYear();
              const mes = d.getUTCMonth();
              return (
                <div key={n} className={`ind-cal-mes${n ? " ind-cal-segundo" : ""}`}>
                  <div className="ind-cal-nome">
                    {MESES[mes]} de {ano}
                  </div>
                  <div className="ind-cal-grade">
                    {SEMANA.map((s, i) => (
                      <span key={i} className="ind-cal-dow">
                        {s}
                      </span>
                    ))}
                    {gradeDoMes(ano, mes).map((ms) => {
                      const iso = paraIso(ms);
                      const doMes = new Date(ms).getUTCMonth() === mes;
                      const futuro = iso > max;
                      const ehInicio = iso === inicio;
                      const ehFim = iso === fimVisual;
                      const dentro =
                        !!inicio &&
                        !!fimVisual &&
                        iso > inicio &&
                        iso < fimVisual;
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={futuro || !doMes}
                          onMouseEnter={() => setSobre(iso)}
                          onClick={() => clicar(iso)}
                          className={
                            "ind-cal-dia" +
                            (doMes ? "" : " vazio") +
                            (ehInicio || ehFim ? " ponta" : "") +
                            (dentro ? " dentro" : "")
                          }
                        >
                          {doMes ? Number(iso.slice(8, 10)) : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
