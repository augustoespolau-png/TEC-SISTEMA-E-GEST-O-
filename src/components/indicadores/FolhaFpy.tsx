"use client";

import type { LinhaDash, ParedeConferida } from "@/lib/dashboard";
import type { RegraFpy } from "@/lib/regras";
import {
  comparativoMensal,
  mesAnterior,
  fpyPorDia,
  fpyPorSemana,
  pct,
  resumir,
} from "@/lib/indicadores";
import type { RegraPorProjeto } from "@/lib/indicadores";
import { Cartao, dBR, FaixaNumeros, nBR } from "./Pecas";
import { ColunasFpy, LinhaFpyTempo } from "./Graficos";
import type { Clicavel } from "./clique";

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const mesCurto = (m: string) =>
  `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

/*
 * FOLHA 1 — FPY. Uma pergunta só, vista de três ângulos:
 * quanta parede passa de primeira, ao longo dos dias, das semanas e
 * das casas.
 *
 * O que saiu daqui e por quê: o fluxo da produção continua inteiro na
 * folha Fluxo, em caixas e setas; a gravidade dos erros e a
 * concentração vivem na folha Qualidade, que é a folha do "onde dói".
 * Repetir os dois aqui só disputava a altura com os gráficos de FPY,
 * que são o assunto desta folha.
 */
export default function FolhaFpy({
  paredes,
  erros,
  paredesDoAno,
  paredesDoProjeto,
  mesSelecionado,
  ano,
  periodoRotulo,
  escopoRotulo,
  consolidado,
  regra,
  regraPorProjeto,
  meta,
  limiteRegra,
  aoRecortar,
  aceso,
}: {
  paredes: ParedeConferida[];
  erros: LinhaDash[];
  /** paredes do ano corrente inteiro; NÃO acompanha o filtro de período */
  paredesDoAno: ParedeConferida[];
  /** TODAS as paredes do projeto, de qualquer data: o cartão do mês
      passado precisa enxergar dezembro quando o filtro está em janeiro */
  paredesDoProjeto: ParedeConferida[];
  /** o mês que o filtro está mostrando, "2026-09" */
  mesSelecionado: string;
  ano: string;
  /** como o filtro de cima está recortando: "jul/26", "toda a base" */
  periodoRotulo: string;
  /** projeto único ou o rótulo da visão consolidada */
  escopoRotulo: string;
  consolidado: boolean;
  regra: RegraFpy;
  regraPorProjeto: RegraPorProjeto;
  meta: number;
  limiteRegra: number;
} & Clicavel) {
  const r = resumir(paredes, erros, regra, regraPorProjeto);
  /* O MES ANTERIOR AO FILTRO, sempre pelo calendario: filtro em
     setembro mostra agosto, filtro em agosto mostra julho. O mes do
     filtro ja esta no cartao ao lado ("FPY do periodo"); repetir ele
     aqui era dois cartoes com o mesmo numero.
     Pelo calendario e nao "o ultimo mes com producao": mes vazio agora
     aparece vazio, com o nome dele, em vez de outro mes no lugar. */
  const mesDoCartao = mesAnterior(mesSelecionado);
  const mes = comparativoMensal(paredesDoProjeto, mesDoCartao);
  const temOsDois = mes.atual.conferidas > 0 && mes.anterior.conferidas > 0;

  /* O FPY do ano é a conta global aplicada ao ano inteiro: paredes
     limpas ÷ paredes conferidas, sem a regra de zeramento por casa —
     ela é uma penalidade de casa, e no acumulado do ano ela puniria o
     ano inteiro por causa de uma casa ruim. */
  const limpasNoAno = paredesDoAno.filter((p) => p.passou_de_primeira).length;
  const fpyAno = pct(limpasNoAno, paredesDoAno.length);

  return (
    <div className="ind-grade folha-fpy">
      <FaixaNumeros
        itens={[
          {
            rotulo: "Casas auditadas",
            valor: nBR(r.casasAuditadas),
            pe: "com auditoria",
            dica: `${nBR(r.casasAuditadas)} casas tiveram ao menos uma parede conferida no período. Casa sem nenhuma parede conferida não aparece em lugar nenhum deste painel.`,
          },
          {
            rotulo: "Total auditadas",
            valor: nBR(r.paredesAuditadas),
            pe: "paredes",
            dica: `Denominador de tudo: ${nBR(r.paredesAuditadas)} paredes passaram pela auditoria, ${nBR(r.paredesLimpas)} sem nenhum desvio e ${nBR(r.paredesAfetadas)} com pelo menos um.`,
          },
          {
            rotulo: "m² inspecionados",
            valor: dBR(r.m2Auditados, 0),
            pe: r.paredesSemArea
              ? `${nBR(r.paredesSemArea)} sem metragem`
              : `${dBR(r.m2Limpos, 0)} m² limpos`,
            tom: r.paredesSemArea ? "alta" : undefined,
            dica: r.paredesSemArea
              ? `${dBR(r.m2Auditados)} m² somados a partir de ${nBR(r.paredesAuditadas - r.paredesSemArea)} paredes com metragem cadastrada. Outras ${nBR(r.paredesSemArea)} foram conferidas mas a posição delas ainda não tem área em Configurações, então não entram nesta soma.`
              : `${dBR(r.m2Auditados)} m² de parede passaram pela auditoria, e ${dBR(r.m2Limpos)} m² saíram sem precisar de retrabalho. A área vem da posição da parede no projeto, cadastrada em Configurações.`,
          },
          {
            rotulo: "Paredes afetadas",
            valor: nBR(r.paredesAfetadas),
            pe: `${pct(r.paredesAfetadas, r.paredesAuditadas)}% do total`,
            tom: "alta",
            dica: `${nBR(r.paredesAfetadas)} paredes tiveram ao menos um desvio, e nelas foram registrados ${nBR(r.erros)} desvios — ${dBR(r.errosPorParedeAfetada)} por parede afetada.`,
          },
          {
            /* Os TRÊS FPY fecham a régua, cada um com a sua barrinha e
               a meta marcada nela. Foram cartões grandes por uma versão:
               três blocos de 168px de altura para três números, e eles
               empurravam os gráficos — que são o assunto da folha — para
               fora da tela. Aqui dizem o mesmo em 4px de barra.

               "Global" era o nome de fábrica da CONTA (cada parede pesa
               uma vez, em oposição à média das casas), mas na tela
               parecia dizer que o número ignora o filtro — e ele obedece
               ao filtro. O nome agora diz o recorte; a conta continua a
               mesma e está explicada na dica. */
            rotulo: "FPY do período",
            valor: r.paredesAuditadas ? `${r.fpyGlobal}%` : "—",
            pe: `${nBR(r.paredesLimpas)} de ${nBR(r.paredesAuditadas)} limpas`,
            tom: r.fpyGlobal >= meta ? "marca" : "alta",
            barra: { valor: r.paredesAuditadas ? r.fpyGlobal : null, meta },
            dica: `${nBR(r.paredesLimpas)} de ${nBR(r.paredesAuditadas)} paredes passaram de primeira NO PERÍODO FILTRADO (${periodoRotulo}). Cada parede pesa uma vez, então casa grande e casa pequena entram na proporção do que produziram — não é a média dos FPYs das casas, que trataria uma casa de 4 paredes como uma de 12.`,
          },
          {
            /* O rótulo SEMPRE diz o mês, inclusive quando ele está
               vazio: "FPY do mês" sem nome deixava a pessoa achar que
               era o mês de hoje. */
            rotulo: `FPY de ${mesCurto(mes.atual.mes)}`,
            valor: mes.atual.conferidas ? `${mes.atual.fpy}%` : "—",
            pe: temOsDois
              ? `${mes.pontos > 0 ? "+" : ""}${mes.pontos} p.p. vs ${mesCurto(mes.anterior.mes)}`
              : mes.atual.conferidas
                ? `sem base em ${mesCurto(mes.anterior.mes)}`
                : "nenhuma parede conferida",
            tom: mes.atual.conferidas
              ? mes.atual.fpy >= meta
                ? "marca"
                : "alta"
              : undefined,
            barra: { valor: mes.atual.conferidas ? mes.atual.fpy : null, meta },
            dica: temOsDois
              ? `${mesCurto(mes.anterior.mes)}: ${mes.anterior.fpy}% (${nBR(mes.anterior.limpas)} de ${nBR(mes.anterior.conferidas)}). ${mesCurto(mes.atual.mes)}: ${mes.atual.fpy}% (${nBR(mes.atual.limpas)} de ${nBR(mes.atual.conferidas)}). A diferença é de ${Math.abs(mes.pontos)} PONTOS percentuais${mes.percentual === null ? "" : `, o que equivale a ${Math.abs(mes.percentual)}% sobre o mês anterior`} — as duas leituras juntas porque respondem coisas diferentes e vivem sendo confundidas. Este cartão é sempre o MÊS ANTERIOR ao que o filtro está mostrando, pelo calendário, comparado com o mês anterior a ele.`
              : mes.atual.conferidas
                ? `${mesCurto(mes.atual.mes)}: ${mes.atual.fpy}% (${nBR(mes.atual.limpas)} de ${nBR(mes.atual.conferidas)}). Não há comparação porque ${mesCurto(mes.anterior.mes)} não teve nenhuma parede conferida no escopo ${escopoRotulo}.`
                : `Nenhuma parede foi conferida no escopo ${escopoRotulo} em ${mesCurto(mes.atual.mes)}. O cartão é sempre o mês anterior ao que o filtro está mostrando, e mês sem auditoria aparece vazio de propósito — mostrar outro mês no lugar faria a pessoa ler um número do mês errado.`,
          },
          {
            /* A META vem ANTES do YTD, e não no fim da régua.
               Ela saía repetida no pé de cada FPY ("· meta 70%"), três
               vezes o espaço para um número que não muda — e o pé dos
               FPY é justamente onde falta espaço. Dita uma vez, o lugar
               dela é encostada nos números que ela julga. */
            rotulo: "Meta de FPY",
            valor: `${meta}%`,
            pe: "alvo da fábrica",
            tom: "marca",
            dica: `A meta de FPY da fábrica é ${meta}%: de cada 100 paredes conferidas, ao menos ${meta} têm de passar de primeira. Ela vale para todos os FPY da régua e é a linha marcada dentro de cada barrinha. Muda em Configurações.`,
          },
          {
            /* O único número da régua que NÃO obedece ao filtro de
               período: ele responde "onde o ano está", e mudaria de
               significado se acompanhasse o recorte. Fecha a régua por
               isso — é o de fora, o acumulado que não segue o filtro. */
            rotulo: `FPY YTD ${ano}`,
            valor: paredesDoAno.length ? `${fpyAno}%` : "—",
            pe: paredesDoAno.length
              ? `${nBR(limpasNoAno)} de ${nBR(paredesDoAno.length)} limpas`
              : "sem auditoria no ano",
            tom: paredesDoAno.length
              ? fpyAno >= meta
                ? "marca"
                : "alta"
              : undefined,
            barra: { valor: paredesDoAno.length ? fpyAno : null, meta },
            /* A sigla fica no rótulo, que é estreito; o nome por extenso
               fica aqui, para quem passar o ponteiro e não conhecer. */
            dica: `YTD (year to date) é o acumulado do ano: de 1º de janeiro de ${ano} até hoje, ${nBR(limpasNoAno)} de ${nBR(paredesDoAno.length)} paredes passaram de primeira. Este é o único número da régua que IGNORA o filtro de período, de propósito — ele é a régua do ano. O escopo ${escopoRotulo} é respeitado.`,
          },
        ]}
      />

      <Cartao titulo="FPY por dia" largura="meio">
        <LinhaFpyTempo
          pontos={fpyPorDia(paredes)}
          meta={meta}
          unidade="dia"
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>
      <Cartao titulo="FPY por semana" largura="meio">
        <LinhaFpyTempo
          pontos={fpyPorSemana(paredes)}
          meta={meta}
          unidade="semana"
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>

      <Cartao
        titulo="FPY por casa"
        nota={
          consolidado
            ? `Coluna dentro da faixa verde bateu a meta. Cada casa aplica a regra de FPY configurada para o respectivo projeto; a tracejada é a média das casas.`
            : regra.ativa
            ? `Coluna dentro da faixa verde bateu a meta. Coluna vermelha = FPY zerado, seja porque nenhuma parede passou ou porque a casa bateu ${limiteRegra} paredes afetadas. A tracejada é a média das casas.`
            : "Coluna dentro da faixa verde bateu a meta. Coluna vermelha = nenhuma parede passou de primeira; este projeto está fora da regra de zeramento. A tracejada é a média das casas."
        }
      >
        <ColunasFpy
          casas={r.casas}
          meta={meta}
          media={r.mediaFpy}
          mostrarProjeto={consolidado}
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      </Cartao>
    </div>
  );
}
