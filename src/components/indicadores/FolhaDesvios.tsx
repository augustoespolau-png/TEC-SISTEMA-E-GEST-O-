"use client";

import type { LinhaDash, ParedeConferida } from "@/lib/dashboard";
import type { RegraFpy } from "@/lib/regras";
import {
  casasMaisCriticas,
  errosPorDia,
  pct,
  porSemanaDoMes,
  resumir,
  tiposNasDuasGravidades,
  topPor,
} from "@/lib/indicadores";
import {
  Cartao,
  COR,
  dBR,
  FaixaNumeros,
  nBR,
  Ranking,
  Vazio,
} from "./Pecas";
import { BarraGravidade, ColunasDias } from "./Graficos";
import type { Clicavel } from "./clique";

/*
 * FOLHA 2 — DESVIOS. Responde "onde bater primeiro": que erro, que
 * setor, que casa. Tudo em ranking, porque a ação da fábrica é
 * priorizar, não contemplar.
 */
export default function FolhaDesvios({
  paredes,
  erros,
  regra,
  aoRecortar,
  aceso,
}: {
  paredes: ParedeConferida[];
  erros: LinhaDash[];
  regra: RegraFpy;
} & Clicavel) {
  const r = resumir(paredes, erros, regra);
  const criticos = erros.filter((e) => e.criticidade === "CRITICO");
  const medios = erros.filter((e) => e.criticidade === "MEDIO");
  const semanas = porSemanaDoMes(paredes, erros);
  const totalRetrabalhos = semanas.reduce((s, x) => s + x.retrabalhos, 0);
  const casas = casasMaisCriticas(erros);
  const duplos = tiposNasDuasGravidades(erros);

  return (
    <div className="ind-grade folha-desvios">
      <FaixaNumeros
        itens={[
          {
            /* PAREDES PRODUZIDAS. O sistema não captura produção — só
               registra o que passou pela auditoria —, então este número é
               o de paredes auditadas, por decisão de quem usa: enquanto a
               fábrica audita tudo o que produz, um é o outro.
               O pé e a dica dizem isso em voz alta. No dia em que a
               auditoria deixar de cobrir a produção inteira, este número
               passa a ser um piso, não um total — e é a dica que evita
               que alguém descubra isso tarde demais. */
            rotulo: "Paredes produzidas",
            valor: nBR(r.paredesAuditadas),
            pe: "= paredes auditadas",
            dica: `${nBR(r.paredesAuditadas)} paredes no período. O sistema não tem um contador de produção: ele só conhece a parede que passou pela auditoria. Como hoje a fábrica audita o que produz, o total auditado está sendo usado como o total produzido. Se algum dia sair parede sem auditoria, este número vira o MÍNIMO produzido, não o produzido.`,
          },
          {
            rotulo: "Paredes com desvio",
            valor: nBR(r.paredesAfetadas),
            pe: `${pct(r.paredesAfetadas, r.paredesAuditadas)}% das auditadas`,
            tom: "alta",
            dica: `${nBR(r.paredesAfetadas)} de ${nBR(r.paredesAuditadas)} paredes auditadas tiveram pelo menos um desvio. Conta PAREDE, não desvio: uma parede com cinco desvios aparece aqui uma vez só.`,
          },
          {
            rotulo: "Desvios registrados",
            valor: nBR(r.erros),
            pe: `${dBR(r.errosPorParedeAfetada)} por parede afetada`,
            dica: `${nBR(r.erros)} desvios no período: ${nBR(r.critico)} críticos, ${nBR(r.medio)} médios e ${nBR(r.baixo)} baixos.`,
          },
          {
            rotulo: "Não conformidades",
            valor: nBR(r.naoConformidades),
            pe: "sem devolutiva em 48 h",
            tom: r.naoConformidades ? "alta" : undefined,
            dica: `Desvios que passaram de 48 h sem devolutiva e seguiram para o cliente sem correção. Hoje são ${nBR(r.naoConformidades)}, ${pct(r.naoConformidades, r.erros)}% de tudo o que foi registrado.`,
          },
          {
            rotulo: "Casas com FPY zerado",
            valor: nBR(r.casasZeradas),
            pe: `${r.pctCasasZeradas}% das auditadas`,
            dica: `${nBR(r.casasZeradas)} de ${nBR(r.casasAuditadas)} casas terminaram com FPY 0 — nenhuma parede passou de primeira, ou a regra de paredes afetadas zerou a casa.`,
          },
        ]}
      />

      <Cartao titulo="Desvios por dia de inspeção" largura="doisTercos">
        <ColunasDias
          dias={errosPorDia(erros)}
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>
      <Cartao titulo={`${nBR(r.erros)} desvios por gravidade`} largura="terco">
        <BarraGravidade r={r} aoRecortar={aoRecortar} aceso={aceso} />
      </Cartao>

      <Cartao titulo="Casas com mais desvios críticos" largura="terco">
        {casas.length ? (
          <div className="ind-rolagem">
            <table className="ind-tabela">
              <thead>
                <tr>
                  <th />
                  <th>Casa</th>
                  <th>Críticos</th>
                  <th>Paredes afetadas</th>
                </tr>
              </thead>
              <tbody>
                {casas.map((c, i) => (
                  <tr
                    key={c.casa}
                    className={aoRecortar ? "ind-clicavel" : undefined}
                    aria-selected={
                      aceso ? aceso("casa", c.casa) : undefined
                    }
                    onClick={aoRecortar && (() => aoRecortar("casa", c.casa))}
                    title={
                      `Casa ${c.casa}: ${nBR(c.criticos)} desvios críticos espalhados por ${nBR(c.paredesAfetadas)} paredes. ${i + 1}ª no período.` +
                      (aoRecortar ? " Clique para recortar o painel nesta casa." : "")
                    }
                  >
                    <td className="ind-pos">{i + 1}</td>
                    <td>{c.casa}</td>
                    <td style={{ color: COR.CRITICO, fontWeight: 700 }}>
                      {nBR(c.criticos)}
                    </td>
                    <td>{nBR(c.paredesAfetadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio>Nenhum desvio crítico no período.</Vazio>
        )}
      </Cartao>

      <Cartao
        titulo="Tipo de desvio por gradação"
        nota="Tipos que aparecem nas duas gradações — quem classifica decide caso a caso."
        largura="terco"
      >
        {duplos.length ? (
          <div className="ind-rolagem">
            <table className="ind-tabela">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Críticos</th>
                  <th>Médios</th>
                  <th>% crítico</th>
                </tr>
              </thead>
              <tbody>
                {duplos.map((t) => (
                  <tr
                    key={t.nome}
                    className={aoRecortar ? "ind-clicavel" : undefined}
                    aria-selected={
                      aceso ? aceso("tipo_erro", t.nome) : undefined
                    }
                    onClick={
                      aoRecortar && (() => aoRecortar("tipo_erro", t.nome))
                    }
                    title={
                      `${t.nome} aparece nas duas gravidades: ${nBR(t.critico)} vezes como crítico e ${nBR(t.medio)} como médio — ${t.pctCritico}% das vezes é crítico. Quem classifica decide caso a caso.` +
                      (aoRecortar ? " Clique para recortar o painel neste tipo." : "")
                    }
                  >
                    <td>{t.nome}</td>
                    <td style={{ color: COR.CRITICO, fontWeight: 700 }}>
                      {nBR(t.critico)}
                    </td>
                    <td style={{ color: COR.MEDIO, fontWeight: 700 }}>
                      {nBR(t.medio)}
                    </td>
                    <td>{t.pctCritico}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio>Nenhum tipo nas duas gravidades no período.</Vazio>
        )}
      </Cartao>

      <Cartao titulo="Retrabalhos por semana" largura="terco">
        {totalRetrabalhos ? (
          <div className="ind-linhas">
            {semanas.map((s) => (
              <div key={s.semana} className="ind-item">
                <span className="ind-nome">Semana {s.semana}</span>
                <span className="ind-val">
                  {nBR(s.retrabalhos)}{" "}
                  <em>{pct(s.retrabalhos, totalRetrabalhos)}%</em>
                </span>
                <span className="ind-trilho">
                  <i
                    style={{
                      width: `${pct(s.retrabalhos, totalRetrabalhos)}%`,
                      background: "var(--color-brand)",
                    }}
                  />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Vazio>Nenhum retrabalho no período.</Vazio>
        )}
      </Cartao>

      <Cartao titulo="Top 5 desvios críticos" largura="quarto">
        <Ranking
          itens={topPor(criticos, "tipo_erro")}
          cor={COR.CRITICO}
          campo="tipo_erro"
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>
      <Cartao titulo="Top 5 desvios médios" largura="quarto">
        <Ranking
          itens={topPor(medios, "tipo_erro")}
          cor={COR.MEDIO}
          campo="tipo_erro"
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>
      <Cartao titulo="Top 5 setores · críticos" largura="quarto">
        <Ranking
          itens={topPor(criticos, "setor")}
          cor={COR.CRITICO}
          campo="setor"
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>
      <Cartao titulo="Top 5 setores · médios" largura="quarto">
        <Ranking
          itens={topPor(medios, "setor")}
          cor={COR.MEDIO}
          campo="setor"
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>
    </div>
  );
}
