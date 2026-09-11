"use client";

import { useMemo, useState } from "react";
import type { LinhaDash, ParedeConferida } from "@/lib/dashboard";
import { percursoDasParedes } from "@/lib/indicadores";
import { Cartao, nBR } from "./Pecas";
import Fluxograma from "./Fluxograma";

/*
 * FOLHA 4 — FLUXO. O caminho da parede, do chão de fábrica ao cliente.
 *
 * As outras três folhas respondem "quanto" e "onde". Esta responde
 * "por onde", que é a pergunta que revela travamento de processo em
 * vez de problema de qualidade.
 */

export default function FolhaFluxo({
  paredes,
  erros,
}: {
  paredes: ParedeConferida[];
  erros: LinhaDash[];
}) {
  const [setor, setSetor] = useState("todos");

  const setores = useMemo(
    () => [...new Set(erros.map((e) => e.setor))].sort(),
    [erros]
  );
  // o setor escolhido pode não existir no recorte de período atual
  const setorValido = setor === "todos" || setores.includes(setor) ? setor : "todos";

  const p = useMemo(
    () => percursoDasParedes(paredes, erros, setorValido),
    [paredes, erros, setorValido]
  );

  return (
    <div className="ind-grade folha-fluxo">
      <div className="ind-escolha">
        <div className="ind-campo">
          <label htmlFor="fluxo-setor">Setor</label>
          <select id="fluxo-setor" className="campo" value={setorValido}
                  onChange={(e) => setSetor(e.target.value)}>
            <option value="todos">Todos os setores</option>
            {setores.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <span className="sub" style={{ marginTop: 0, marginLeft: "auto" }}>
          {nBR(p.raiz)} paredes no recorte
        </span>
      </div>

      {/* Some quando nao ha filtro. Fica porque sem ele o 100% da tela
          significaria outra coisa sem avisar. */}
      {p.semOkPrimeira && (
        <div className="ind-aviso">
          Filtrado por setor: o 100% é <b>o que teve desvio neste setor</b>.
        </div>
      )}

      {/* a folha inteira e o fluxograma: sem cartoes de numero e sem
          tabela embaixo, ele fica com toda a altura da tela */}
      <Cartao titulo="Fluxo da qualidade · por parede">
        <Fluxograma p={p} />
      </Cartao>

    </div>
  );
}
