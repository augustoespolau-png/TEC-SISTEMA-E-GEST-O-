"use client";

import { useState } from "react";
import type { LinhaDash, ParedeConferida } from "@/lib/dashboard";
import type { RegraFpy } from "@/lib/regras";
import {
  mesesDe,
  resumoDoMes,
  tiposPorMes,
  variacao,
  VOLUME_MINIMO,
  type SerieTipo,
} from "@/lib/indicadores";
import type { RegraPorProjeto } from "@/lib/indicadores";
import { Cartao, COR, dBR, nBR, Variacao, Vazio } from "./Pecas";
import { Tendencia } from "./Graficos";
import type { Clicavel } from "./clique";

/*
 * FOLHA 3 — COMPARATIVOS.
 *
 * A regra desta folha inteira: total de erros não compara meses. Um mês
 * que auditou 26 casas e outro que auditou 6 produzem totais
 * incomparáveis, e a queda de 77% seria só a queda da amostra. Toda
 * leitura de tendência aqui é POR CASA AUDITADA.
 */

const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

interface LinhaTipo {
  nome: string;
  qtdAntes: number;
  qtdAgora: number;
  normAntes: number;
  normAgora: number;
  v: number | null;
}

/**
 * Tabela de tipo de erro comparando dois meses.
 *
 * As duas primeiras colunas são a QUANTIDADE bruta e as duas seguintes a
 * mesma coisa dividida pelas casas do mês. As quatro juntas de propósito:
 * é o que deixa ver que "+300%" pode ser um erro virando dois.
 */
function TabelaTipos({
  lista,
  titulo,
  nota,
  mesA,
  mesB,
  largura = "meio",
  aoRecortar,
  aceso,
}: {
  lista: LinhaTipo[];
  titulo: string;
  nota: string;
  mesA: string;
  mesB: string;
  largura?: "cheio" | "meio" | "terco";
} & Clicavel) {
  return (
    <Cartao titulo={titulo} nota={nota} largura={largura}>
      {lista.length ? (
        <div className="ind-rolagem">
          <table className="ind-tabela">
            <thead>
              <tr>
                <th>Tipo de desvio</th>
                <th>{rotuloMes(mesA)}</th>
                <th>{rotuloMes(mesB)}</th>
                <th>por casa {rotuloMes(mesA)}</th>
                <th>por casa {rotuloMes(mesB)}</th>
                <th>Variação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr
                  key={x.nome}
                  className={aoRecortar ? "ind-clicavel" : undefined}
                  aria-selected={aceso ? aceso("tipo_erro", x.nome) : undefined}
                  onClick={aoRecortar && (() => aoRecortar("tipo_erro", x.nome))}
                  title={
                    `${x.nome}: ${nBR(x.qtdAntes)} em ${rotuloMes(mesA)} e ${nBR(x.qtdAgora)} em ${rotuloMes(mesB)}. ` +
                    `Por casa auditada, ${dBR(x.normAntes)} contra ${dBR(x.normAgora)} — ` +
                    (x.v === null
                      ? "não existia no mês de comparação."
                      : x.v === 0
                        ? "sem variação."
                        : `${x.v > 0 ? "alta" : "queda"} de ${Math.abs(x.v)}%.`) +
                    (aoRecortar ? " Clique para recortar o painel neste tipo." : "")
                  }
                >
                  <td>{x.nome}</td>
                  <td className="ind-fraco">{nBR(x.qtdAntes)}</td>
                  <td className="ind-fraco">{nBR(x.qtdAgora)}</td>
                  <td>{dBR(x.normAntes)}</td>
                  <td>
                    <b>{dBR(x.normAgora)}</b>
                  </td>
                  <td>
                    <Variacao v={x.v} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Vazio>Sem tipo suficiente para comparar.</Vazio>
      )}
    </Cartao>
  );
}

export default function FolhaComparativos({
  paredes,
  erros,
  regra,
  regraPorProjeto,
  hoje,
  aoRecortar,
  aceso,
}: {
  paredes: ParedeConferida[];
  erros: LinhaDash[];
  regra: RegraFpy;
  regraPorProjeto?: RegraPorProjeto;
  hoje: string;
} & Clicavel) {
  const meses = mesesDe(paredes, erros);
  /* Guarda só a escolha explícita do usuário. Quando o filtro de período
     muda, o mês escolhido pode deixar de existir — aí a leitura abaixo
     cai no padrão sozinha. Sincronizar isso num efeito seria estado
     derivado guardado duas vezes, e um render a mais por clique. */
  const [mesA, setMesA] = useState<string>("");
  const [mesB, setMesB] = useState<string>("");

  if (meses.length < 2)
    return (
      <div className="ind-grade folha-comparativos">
        <div className="ind-aviso">
          O período selecionado tem{" "}
          <b>{meses.length === 1 ? "um mês só" : "nenhum mês"}</b>. Comparativo
          precisa de pelo menos dois — amplie o período no topo.
        </div>
      </div>
    );

  const A = meses.includes(mesA) ? mesA : meses[meses.length - 2];
  const B = meses.includes(mesB) ? mesB : meses[meses.length - 1];
  const iA = meses.indexOf(A);
  const iB = meses.indexOf(B);

  const resumos = meses.map((m) =>
    resumoDoMes(paredes, erros, m, regra, regraPorProjeto)
  );
  const rA = resumos[iA];
  const rB = resumos[iB];
  const emAndamento = (m: string) => m === hoje.slice(0, 7);

  const series = tiposPorMes(paredes, erros, meses);
  const linha = (t: SerieTipo, critico: boolean): LinhaTipo => ({
    nome: t.nome,
    qtdAntes: critico ? t.serie[iA].critico : t.serie[iA].qtd,
    qtdAgora: critico ? t.serie[iB].critico : t.serie[iB].qtd,
    normAntes: critico ? t.serie[iA].normCritico : t.serie[iA].norm,
    normAgora: critico ? t.serie[iB].normCritico : t.serie[iB].norm,
    v: variacao(
      critico ? t.serie[iA].normCritico : t.serie[iA].norm,
      critico ? t.serie[iB].normCritico : t.serie[iB].norm
    ),
  });

  /* Sete linhas, e não cinco, porque é o que cabe: medido na tela, cada
     tabela desta folha tem espaço para oito linhas de corpo. Deixar o
     resto em branco seria esconder tipo de erro por nada. */
  const geral = series
    .map((t) => linha(t, false))
    .filter((x) => x.qtdAntes + x.qtdAgora > 0)
    .sort((a, b) => b.normAgora - a.normAgora)
    .slice(0, 7);

  const soCriticos = series
    .map((t) => linha(t, true))
    .filter((x) => x.qtdAntes + x.qtdAgora > 0)
    .sort((a, b) => b.normAgora - a.normAgora)
    .slice(0, 7);

  const comVolume = series
    .map((t) => linha(t, false))
    .filter((x) => x.qtdAntes + x.qtdAgora >= VOLUME_MINIMO);
  /* Quedas e altas na MESMA tabela, ordenadas da maior queda para a
     maior alta. Duas tabelas iguais gastavam dois cabecalhos para dizer
     a mesma coisa, e separadas escondiam o tamanho da distancia entre
     um extremo e o outro. */
  const quedas = comVolume
    .filter((x) => x.v !== null && x.v < 0)
    .sort((a, b) => (a.v ?? 0) - (b.v ?? 0))
    .slice(0, 4);
  const altas = comVolume
    .filter((x) => x.v === null || x.v > 0)
    .sort((a, b) => (b.v ?? 9999) - (a.v ?? 9999))
    .slice(0, 4);
  const variacao4 = [...quedas, ...altas.reverse()];

  /* Tendência olha TODOS os meses do período, não só os dois escolhidos:
     é o que separa piora consistente de mês fora da curva. */
  const tendencia = series
    .map((t) => ({
      ...t,
      primeiro: t.serie[0].norm,
      ultimo: t.serie[t.serie.length - 1].norm,
      v: variacao(t.serie[0].norm, t.serie[t.serie.length - 1].norm),
    }))
    .filter((t) => t.total >= VOLUME_MINIMO && (t.v === null || t.v > 0))
    .sort((a, b) => b.ultimo - b.primeiro - (a.ultimo - a.primeiro))
    .slice(0, 6);

  return (
    <div className="ind-grade folha-comparativos">
      <div className="ind-escolha">
        <div className="ind-campo">
          <label htmlFor="mesA">Comparar</label>
          <select id="mesA" className="campo" value={A} onChange={(e) => setMesA(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {rotuloMes(m)}
                {emAndamento(m) ? " (parcial)" : ""}
              </option>
            ))}
          </select>
        </div>
        <span className="ind-seta">com</span>
        <div className="ind-campo">
          <label htmlFor="mesB">Contra</label>
          <select id="mesB" className="campo" value={B} onChange={(e) => setMesB(e.target.value)}>
            {meses.map((m) => (
              <option key={m} value={m}>
                {rotuloMes(m)}
                {emAndamento(m) ? " (parcial)" : ""}
              </option>
            ))}
          </select>
        </div>
        <span className="sub" style={{ marginTop: 0, marginLeft: "auto" }}>
          {nBR(rA.casas)} casas em {rotuloMes(A)} · {nBR(rB.casas)} em {rotuloMes(B)}
        </span>
      </div>

      <div className="ind-aviso">
        Totais dependem de quanto foi auditado no mês. A leitura que compara de
        verdade é a coluna <b>por casa</b>: total do mês dividido pelas casas
        auditadas naquele mês.
        {(emAndamento(A) || emAndamento(B)) &&
          " Um dos meses escolhidos está em andamento e ainda vai crescer."}
      </div>

      <Cartao
        titulo="Quadro mensal completo"
        nota="Tudo o que muda de mês para mês, com a coluna normalizada ao lado do total."
      >
        <div className="ind-rolagem">
          <table className="ind-tabela">
            <thead>
              <tr>
                <th>Mês</th>
                <th>Casas</th>
                <th>Paredes</th>
                <th>Desvios</th>
                <th>Crítico</th>
                <th>Médio</th>
                <th>Baixo</th>
                <th>Desvios/casa</th>
                <th>Críticos/casa</th>
                <th>Variação</th>
                <th>FPY zerado</th>
              </tr>
            </thead>
            <tbody>
              {resumos.map((x, i) => (
                <tr
                  key={x.mes}
                  className={aoRecortar ? "ind-clicavel" : undefined}
                  aria-selected={aceso ? aceso("mes", x.mes) : undefined}
                  onClick={aoRecortar && (() => aoRecortar("mes", x.mes))}
                  title={
                    `${rotuloMes(x.mes)}: ${nBR(x.casas)} casas e ${nBR(x.paredes)} paredes auditadas, ` +
                    `${nBR(x.erros)} desvios (${dBR(x.errosPorCasa)} por casa). ` +
                    `${nBR(x.casasZeradas)} casas com FPY zerado.` +
                    (emAndamento(x.mes) ? " Mês em andamento: ainda vai crescer." : "") +
                    (aoRecortar ? " Clique para recortar o painel neste mês." : "")
                  }
                >
                  <td>
                    {rotuloMes(x.mes)}
                    {emAndamento(x.mes) ? " *" : ""}
                  </td>
                  <td>{nBR(x.casas)}</td>
                  <td>{nBR(x.paredes)}</td>
                  <td>{nBR(x.erros)}</td>
                  <td style={{ color: COR.CRITICO }}>{nBR(x.critico)}</td>
                  <td style={{ color: COR.MEDIO }}>{nBR(x.medio)}</td>
                  <td style={{ color: COR.BAIXO }}>{nBR(x.baixo)}</td>
                  <td>
                    <b>{dBR(x.errosPorCasa)}</b>
                  </td>
                  <td>{dBR(x.criticosPorCasa)}</td>
                  <td>
                    {i ? (
                      <Variacao v={variacao(resumos[i - 1].errosPorCasa, x.errosPorCasa)} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{nBR(x.casasZeradas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {resumos.some((x) => emAndamento(x.mes)) && (
          <p className="sub">* mês em andamento</p>
        )}
      </Cartao>

      <TabelaTipos
        mesA={A}
        mesB={B}
        lista={geral}
        titulo="Todos os tipos de desvio"
        nota={`Ordenado pelo peso em ${rotuloMes(B)}. As duas primeiras colunas são a quantidade bruta.`}
        aoRecortar={aoRecortar}
        aceso={aceso}
      />
      <TabelaTipos
        mesA={A}
        mesB={B}
        lista={soCriticos}
        titulo="Só os desvios críticos"
        nota="Mesma conta, contando apenas as ocorrências críticas."
        aoRecortar={aoRecortar}
        aceso={aceso}
      />
      <TabelaTipos
        mesA={A}
        mesB={B}
        largura="meio"
        lista={variacao4}
        titulo="Quem caiu e quem subiu"
        nota="Da maior queda para a maior alta, com pelo menos 3 ocorrências somando os dois meses."
        aoRecortar={aoRecortar}
        aceso={aceso}
      />
      <Cartao
        titulo="Tipos em alta sustentada"
        largura="meio"
        nota="Compara o primeiro mês do período com o último, e não apenas os dois meses escolhidos."
      >
        {tendencia.length ? (
          <div className="ind-rolagem">
            <table className="ind-tabela">
              <thead>
                <tr>
                  <th>Tipo de desvio</th>
                  <th>Evolução</th>
                  {meses.map((m) => (
                    <th key={m}>{rotuloMes(m)}</th>
                  ))}
                  <th>
                    {rotuloMes(meses[0])} → {rotuloMes(meses[meses.length - 1])}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tendencia.map((t) => (
                  <tr
                    key={t.nome}
                    className={aoRecortar ? "ind-clicavel" : undefined}
                    aria-selected={aceso ? aceso("tipo_erro", t.nome) : undefined}
                    onClick={aoRecortar && (() => aoRecortar("tipo_erro", t.nome))}
                    title={
                      `${t.nome}: ${dBR(t.primeiro)} por casa em ${rotuloMes(meses[0])} e ${dBR(t.ultimo)} em ${rotuloMes(meses[meses.length - 1])}. ` +
                      `${nBR(t.total)} ocorrências somando o período` +
                      (t.v === null ? "; não existia no primeiro mês." : `; ${t.v > 0 ? "alta" : "queda"} de ${Math.abs(t.v)}%.`) +
                      (aoRecortar ? " Clique para recortar o painel neste tipo." : "")
                    }
                  >
                    <td>{t.nome}</td>
                    <td>
                      <Tendencia valores={t.serie.map((s) => s.norm)} />
                    </td>
                    {t.serie.map((s) => (
                      <td key={s.mes} title={`${nBR(s.qtd)} ocorrências`}>
                        {dBR(s.norm)}
                      </td>
                    ))}
                    <td>
                      <Variacao v={t.v} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="sub">
              Valores por casa auditada no mês. Passe o ponteiro para ver a
              quantidade bruta.
            </p>
          </div>
        ) : (
          <Vazio>Nenhum tipo em alta sustentada no período.</Vazio>
        )}
      </Cartao>
    </div>
  );
}
