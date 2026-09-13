import {
  inicioSemanaMes,
  nomeSemanaMes,
  rotuloSemanaMes,
  type LinhaDash,
  type ParedeConferida,
} from "@/lib/dashboard";
import { casaZeraOFpy, type RegraFpy } from "@/lib/regras";

/*
 * INDICADORES — a camada de conta das três folhas (FPY, Desvios,
 * Comparativos). Só funções puras: entram paredes conferidas e erros já
 * recortados por projeto e período, saem números.
 *
 * Por que existe separado de lib/painel2.ts: o Painel 2.0 conta ESTADO
 * de parede (aceita, retrabalhada, em retrabalho) para acompanhar a
 * execução da obra. Aqui a pergunta é outra — quanto se erra, de que
 * gravidade, e como isso evolui mês a mês. Misturar as duas leituras na
 * mesma função foi o que produziu, na versão antiga do dashboard, dois
 * números diferentes para a mesma pergunta.
 *
 * A regra do FPY continua vindo de lib/regras.ts. Nunca recalcule aqui.
 */

/* ------------------------------------------------------------------ */
/* Índice de qualidade                                                */
/* ------------------------------------------------------------------ */

export interface IndiceQualidade {
  paineisAuditados: number;
  /** null quando a quantidade varia entre os painéis. */
  itensPorPainel: number | null;
  totalBruto: number;
  naoAplicaveis: number;
  itensValidos: number;
  desvios: number;
  itensConformes: number;
  /** null quando não existe base válida para a divisão. */
  percentual: number | null;
}

export interface PainelIndiceQualidade {
  itensChecklist: number;
  naoAplicaveis?: number;
}

const inteiroNaoNegativo = (valor: number) =>
  Number.isFinite(valor) ? Math.max(0, Math.trunc(valor)) : 0;

function finalizarIndiceQualidade({
  paineisAuditados,
  itensPorPainel,
  totalBruto,
  naoAplicaveis,
  desvios,
}: {
  paineisAuditados: number;
  itensPorPainel: number | null;
  totalBruto: number;
  naoAplicaveis: number;
  desvios: number;
}): IndiceQualidade {
  const bruto = inteiroNaoNegativo(totalBruto);
  /* N/A não pode reduzir a base abaixo de zero. O limite também protege
     contra duplicação acidental de um registro na origem. */
  const na = Math.min(bruto, inteiroNaoNegativo(naoAplicaveis));
  const validos = bruto - na;
  const d = inteiroNaoNegativo(desvios);
  const conformes = Math.max(0, validos - d);

  return {
    paineisAuditados: inteiroNaoNegativo(paineisAuditados),
    itensPorPainel:
      itensPorPainel === null ? null : inteiroNaoNegativo(itensPorPainel),
    totalBruto: bruto,
    naoAplicaveis: na,
    itensValidos: validos,
    desvios: d,
    itensConformes: conformes,
    percentual:
      validos === 0 ? null : Math.round((conformes / validos) * 1000) / 10,
  };
}

/**
 * Índice com checklist fixo, usado hoje pelo painel.
 *
 * Total bruto = P × I; base válida = total bruto − N/A; conformes = base
 * válida − D. A base vazia vira null para a tela mostrar "—", em vez de
 * apresentar 0% como se houvesse inspeção reprovada.
 */
export function calcularIndiceQualidade({
  paineisAuditados,
  itensPorPainel,
  naoAplicaveis,
  desvios,
}: {
  paineisAuditados: number;
  itensPorPainel: number;
  naoAplicaveis: number;
  desvios: number;
}): IndiceQualidade {
  const p = inteiroNaoNegativo(paineisAuditados);
  const i = inteiroNaoNegativo(itensPorPainel);
  return finalizarIndiceQualidade({
    paineisAuditados: p,
    itensPorPainel: i,
    totalBruto: p * i,
    naoAplicaveis,
    desvios,
  });
}

/**
 * Variante para um checklist que possa mudar por painel. Mantém a mesma
 * fórmula sem inventar uma média: `itensPorPainel` só é preenchido quando
 * todos os painéis usam a mesma quantidade; o total bruto é sempre a soma
 * real dos checklists individuais.
 */
export function calcularIndiceQualidadePorPaineis(
  paineis: readonly PainelIndiceQualidade[],
  desvios: number
): IndiceQualidade {
  const itens = paineis.map((painel) =>
    inteiroNaoNegativo(painel.itensChecklist)
  );
  const mesmoChecklist =
    itens.length > 0 && itens.every((item) => item === itens[0]);
  return finalizarIndiceQualidade({
    paineisAuditados: paineis.length,
    itensPorPainel: mesmoChecklist ? itens[0] : null,
    totalBruto: itens.reduce((soma, item) => soma + item, 0),
    naoAplicaveis: paineis.reduce(
      (soma, painel) =>
        soma + inteiroNaoNegativo(Number(painel.naoAplicaveis ?? 0)),
      0
    ),
    desvios,
  });
}

/* ------------------------------------------------------------------ */
/* FPY por casa                                                        */
/* ------------------------------------------------------------------ */

export interface CasaFpy {
  casa: string;
  conferidas: number;
  limpas: number;
  afetadas: number;
  /** FPY sem a regra: paredes que passaram ÷ paredes processadas */
  fpyPuro: number;
  /** o que vale no indicador, já com a regra do projeto aplicada */
  fpy: number;
  zerada: boolean;
}

/** Ordem natural: casa 9 antes de casa 10, e "PT 2" antes de "PT 10". */
export function ordemCasa(a: string, b: string) {
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
}

export function fpyPorCasa(
  paredes: ParedeConferida[],
  regra: RegraFpy
): CasaFpy[] {
  const m = new Map<string, { conferidas: number; limpas: number }>();
  for (const p of paredes) {
    const a = m.get(p.casa) ?? { conferidas: 0, limpas: 0 };
    a.conferidas++;
    if (p.passou_de_primeira) a.limpas++;
    m.set(p.casa, a);
  }
  return [...m.entries()]
    .map(([casa, a]) => {
      const afetadas = a.conferidas - a.limpas;
      const fpyPuro = Math.round((a.limpas / a.conferidas) * 100);
      const zerada = casaZeraOFpy(afetadas, regra);
      return { casa, ...a, afetadas, fpyPuro, fpy: zerada ? 0 : fpyPuro, zerada };
    })
    .sort((x, y) => ordemCasa(x.casa, y.casa));
}

/* ------------------------------------------------------------------ */
/* Resumo geral                                                        */
/* ------------------------------------------------------------------ */

export interface Resumo {
  casasAuditadas: number;
  paredesAuditadas: number;
  paredesAfetadas: number;
  paredesLimpas: number;
  erros: number;
  critico: number;
  medio: number;
  baixo: number;
  naoConformidades: number;
  /** DPU do que deu errado: erros ÷ paredes afetadas */
  errosPorParedeAfetada: number;
  /**
   * FPY GLOBAL: paredes limpas ÷ paredes processadas, na base inteira.
   *
   * É diferente da média dos FPYs das casas, e a diferença não é
   * detalhe. A média trata uma casa de 4 paredes e uma de 12 como se
   * pesassem igual; o global pesa cada parede uma vez. Quando as casas
   * pequenas vão melhor que as grandes, a média sobe sem que a fábrica
   * tenha melhorado. O número de abertura é o global; a média continua
   * existindo, como linha dentro do gráfico de FPY por casa.
   */
  fpyGlobal: number;
  /** m² inspecionados: soma da área das paredes conferidas */
  m2Auditados: number;
  /** m² das paredes que passaram de primeira */
  m2Limpos: number;
  /** paredes conferidas cuja posição ainda não tem metragem cadastrada */
  paredesSemArea: number;
  mediaFpy: number;
  casasZeradas: number;
  pctCasasZeradas: number;
  casas: CasaFpy[];
}

export function resumir(
  paredes: ParedeConferida[],
  erros: LinhaDash[],
  regra: RegraFpy
): Resumo {
  const casas = fpyPorCasa(paredes, regra);
  const afetadas = paredes.filter((p) => !p.passou_de_primeira).length;
  const zeradas = casas.filter((c) => c.fpy === 0);
  const conta = (c: string) => erros.filter((e) => e.criticidade === c).length;
  return {
    casasAuditadas: casas.length,
    paredesAuditadas: paredes.length,
    paredesAfetadas: afetadas,
    paredesLimpas: paredes.length - afetadas,
    erros: erros.length,
    critico: conta("CRITICO"),
    medio: conta("MEDIO"),
    baixo: conta("BAIXO"),
    naoConformidades: erros.filter((e) => e.status === "NAO_CONFORMIDADE").length,
    errosPorParedeAfetada: afetadas ? erros.length / afetadas : 0,
    fpyGlobal: pct(paredes.length - afetadas, paredes.length),
    /* Number() e não confiança cega: o Postgres devolve numeric como
       texto por algumas portas e como número por outras, e "6.21" + 0
       vira "6.210" se ninguém converter. */
    m2Auditados: paredes.reduce((s, p) => s + Number(p.area_m2 ?? 0), 0),
    m2Limpos: paredes.reduce(
      (s, p) => s + (p.passou_de_primeira ? Number(p.area_m2 ?? 0) : 0),
      0
    ),
    paredesSemArea: paredes.filter((p) => p.area_m2 == null).length,
    mediaFpy: casas.length
      ? Math.round(casas.reduce((s, c) => s + c.fpy, 0) / casas.length)
      : 0,
    casasZeradas: zeradas.length,
    pctCasasZeradas: pct(zeradas.length, casas.length),
    casas,
  };
}

export const pct = (parte: number, todo: number) =>
  todo ? Math.round((parte / todo) * 100) : 0;

/* ------------------------------------------------------------------ */
/* Fluxo: onde as paredes param                                        */
/* ------------------------------------------------------------------ */

export interface Fluxo {
  processadas: number;
  aceitas: number;
  afetadas: number;
  retrabalhadas: number;
  aguardaAprovacao: number;
  emAberto: number;
}

/**
 * O estado final de cada parede, somando 100%.
 *
 * O cruzamento é por texto (casa + parede) e não por auditoria_id: erro
 * lançado fora de auditoria também pertence à parede.
 */
export function fluxoDe(paredes: ParedeConferida[], erros: LinhaDash[]): Fluxo {
  const porParede = new Map<string, { aberto: number; pendente: number }>();
  for (const e of erros) {
    const k = `${e.casa}|${e.parede}`;
    const a = porParede.get(k) ?? { aberto: 0, pendente: 0 };
    if (e.status === "RETRABALHO_PENDENTE") a.pendente++;
    else if (e.status !== "RETRABALHO") a.aberto++;
    porParede.set(k, a);
  }
  const f: Fluxo = {
    processadas: paredes.length, aceitas: 0, afetadas: 0,
    retrabalhadas: 0, aguardaAprovacao: 0, emAberto: 0,
  };
  for (const p of paredes) {
    const c = porParede.get(`${p.casa}|${p.parede}`);
    if (!c) {
      f.aceitas++;
      continue;
    }
    f.afetadas++;
    if (c.aberto) f.emAberto++;
    else if (c.pendente) f.aguardaAprovacao++;
    else f.retrabalhadas++;
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* Fluxograma: o caminho da parede, do chão de fábrica ao cliente      */
/* ------------------------------------------------------------------ */

export interface Percurso {
  /** o 100% de referência: tudo que entrou no recorte */
  raiz: number;
  okPrimeira: number;
  reprovadas: number;
  /** corrigida, conferida e aprovada */
  okRetrabalho: number;
  /** o retrabalho foi feito e espera aprovação */
  pendente: number;
  /** ainda esperando a produção agir */
  aberto: number;
  /** passou de 48 h sem devolutiva e seguiu assim mesmo */
  nc: number;
  /** true = filtrado por setor, e aí "passou de primeira" não existe */
  semOkPrimeira: boolean;
}

/**
 * Onde cada parede terminou, com os ramos somando exatamente a raiz.
 *
 * A UNIDADE É SEMPRE A PAREDE. Contar erro aqui responderia outra
 * pergunta — uma parede com vinte erros pesaria vinte no caminho e uma
 * no destino — e as duas leituras na mesma tela é o que produziu, na
 * versão antiga do dashboard, dois números para a mesma coisa. Quem
 * quer contagem de erro tem as folhas de Desvios e Comparativos.
 *
 * A ordem de precedência é o mais importante daqui: uma parede com um
 * erro em não conformidade E outro já aprovado é uma parede que
 * ESCAPOU. O pior destino manda, porque foi ele que chegou ao cliente.
 *
 * Sobre o filtro de setor: parede limpa não tem setor — ela não gerou
 * erro nenhum. Com um setor escolhido, a raiz deixa de ser "tudo que
 * foi auditado" e passa a ser "o que teve erro neste setor", e o ramo
 * de quem passou de primeira desaparece. Fingir que dá para filtrar
 * seria inventar número.
 */
export function percursoDasParedes(
  paredes: ParedeConferida[],
  erros: LinhaDash[],
  setor = "todos"
): Percurso {
  const doSetor = setor === "todos" ? erros : erros.filter((e) => e.setor === setor);

  const porParede = new Map<string, LinhaDash[]>();
  for (const e of doSetor) {
    const k = `${e.casa}|${e.parede}`;
    porParede.set(k, [...(porParede.get(k) ?? []), e]);
  }
  const consideradas =
    setor === "todos"
      ? paredes
      : paredes.filter((p) => porParede.has(`${p.casa}|${p.parede}`));

  const r: Percurso = {
    raiz: consideradas.length, okPrimeira: 0, reprovadas: 0,
    okRetrabalho: 0, pendente: 0, aberto: 0, nc: 0,
    semOkPrimeira: setor !== "todos",
  };
  for (const p of consideradas) {
    const meus = porParede.get(`${p.casa}|${p.parede}`);
    if (!meus?.length) { r.okPrimeira++; continue; }
    r.reprovadas++;
    const tem = (st: string) => meus.some((e) => e.status === st);
    if (tem("NAO_CONFORMIDADE")) r.nc++;
    else if (tem("AGUARDANDO") || tem("BLOQUEADA")) r.aberto++;
    else if (tem("RETRABALHO_PENDENTE")) r.pendente++;
    else r.okRetrabalho++;
  }
  return r;
}

export interface TempoDaParede {
  /** paredes cujos erros foram todos resolvidos */
  fechadas: number;
  /** dias médios entre a auditoria e o último erro resolvido */
  mediaFechamento: number;
  /** paredes com pelo menos um erro sem resolução */
  abertas: number;
  mediaIdade: number;
  piorIdade: number;
}

/**
 * Tempo medido em PAREDE, não em erro — a unidade do fluxograma.
 *
 * Uma parede só conta como fechada quando o último erro dela foi
 * resolvido: enquanto sobrar um, a parede continua parada no processo.
 * Contar erro aqui daria um tempo médio melhor do que a realidade, já
 * que uma parede com cinco erros teria quatro "vitórias" antes de sair
 * do lugar.
 */
export function tempoDasParedes(
  paredes: ParedeConferida[],
  erros: LinhaDash[],
  hoje: string
): TempoDaParede {
  const DIA = 86_400_000;
  const dias = (de: string, ate: string) =>
    Math.max(0, Math.round((new Date(ate).getTime() - new Date(de).getTime()) / DIA));

  const porParede = new Map<string, LinhaDash[]>();
  for (const e of erros) {
    const k = `${e.casa}|${e.parede}`;
    porParede.set(k, [...(porParede.get(k) ?? []), e]);
  }

  const fechamentos: number[] = [];
  const idades: number[] = [];
  for (const p of paredes) {
    const meus = porParede.get(`${p.casa}|${p.parede}`);
    if (!meus?.length) continue; // passou de primeira: nunca esperou nada
    const todosResolvidos = meus.every((e) => e.resolved_at);
    if (todosResolvidos) {
      const ultimo = meus
        .map((e) => e.resolved_at!.slice(0, 10))
        .sort()
        .at(-1)!;
      fechamentos.push(dias(p.data, ultimo));
    } else {
      idades.push(dias(p.data, hoje));
    }
  }
  const media = (l: number[]) => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : 0);
  return {
    fechadas: fechamentos.length,
    mediaFechamento: media(fechamentos),
    abertas: idades.length,
    mediaIdade: media(idades),
    piorIdade: idades.length ? Math.max(...idades) : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Tempo                                                               */
/* ------------------------------------------------------------------ */

/** Semana do mês, 1 a 4. Os dias 29 em diante entram na quarta. */
export const semanaDoMes = (iso: string) =>
  Math.min(4, Math.ceil(Number(iso.slice(8, 10)) / 7));

export interface Semana {
  semana: number;
  paredesAfetadas: number;
  erros: number;
  retrabalhos: number;
}

/* ------------------------------------------------------------------ */
/* FPY no tempo: por dia e por semana                                  */
/* ------------------------------------------------------------------ */

export interface FpyNoTempo {
  /** a chave do período: o dia, ou o primeiro dia do pedaço de semana */
  chave: string;
  /** curto, para o eixo */
  rotulo: string;
  /** por extenso, para a dica; quando falta, a dica usa o rótulo */
  rotuloLongo?: string;
  conferidas: number;
  limpas: number;
  fpy: number;
}

/**
 * FPY agrupado por um período do calendário.
 *
 * A data usada é a DA PAREDE — o dia em que ela foi conferida —, e não
 * a do erro: o FPY é uma medida da inspeção, e uma parede conferida na
 * terça pertence à terça mesmo que o erro dela só seja tratado na
 * sexta. Períodos sem nenhuma parede conferida não aparecem: FPY de
 * zero conferidas seria 0%, e um dia sem produção viraria um dia
 * péssimo.
 */
function fpyPor(
  paredes: ParedeConferida[],
  chaveDe: (data: string) => string,
  rotuloDe: (chave: string) => string,
  nomeDe?: (chave: string) => string
): FpyNoTempo[] {
  const m = new Map<string, { conferidas: number; limpas: number }>();
  for (const p of paredes) {
    const k = chaveDe(p.data);
    const a = m.get(k) ?? { conferidas: 0, limpas: 0 };
    a.conferidas++;
    if (p.passou_de_primeira) a.limpas++;
    m.set(k, a);
  }
  return [...m]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, a]) => ({
      chave,
      rotulo: rotuloDe(chave),
      rotuloLongo: nomeDe?.(chave),
      conferidas: a.conferidas,
      limpas: a.limpas,
      fpy: pct(a.limpas, a.conferidas),
    }));
}

export interface FpyDoMes {
  /** "2026-08" */
  mes: string;
  conferidas: number;
  limpas: number;
  fpy: number;
}

export interface ComparativoMensal {
  atual: FpyDoMes;
  anterior: FpyDoMes;
  /** diferença em PONTOS percentuais: 72 − 67 = 5 p.p. */
  pontos: number;
  /** variação relativa: 5 sobre 67 = 7% */
  percentual: number | null;
}

/** "2026-01" -> "2025-12". */
export function mesAnterior(mes: string): string {
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return m === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Um MÊS DO CALENDÁRIO contra o mês anterior a ele.
 *
 * Já foi "os dois últimos meses com produção", que pulava mês vazio
 * para o cartão nunca virar um traço. A fábrica pediu o contrário, e
 * tem razão: quem lê "mês passado" quer o mês passado, não o último
 * que teve movimento. O C4A não auditou nada em agosto de 2026 — com
 * a regra antiga, setembro aparecia comparado com JULHO, e a pessoa
 * lia "caiu 6 pontos no mês" sem perceber que estava pulando um mês
 * inteiro.
 *
 * O preço é que agora o cartão PODE vir vazio, e ele diz isso com
 * todas as letras em vez de mostrar outro mês no lugar. Mês sem
 * auditoria é informação, não é falha do painel.
 *
 * Os dois meses vêm NOMEADOS para quem lê: número de mês sem o nome
 * do mês é uma mentira esperando para acontecer.
 *
 * As duas leituras da diferença andam juntas porque respondem coisas
 * diferentes e são confundidas o tempo todo: de 73% para 68% são 5
 * PONTOS percentuais de queda, e ao mesmo tempo uma queda de 7% sobre o
 * valor anterior. Só "−7%" faz parecer que o FPY caiu para 66.
 */
export function comparativoMensal(
  paredes: ParedeConferida[],
  /** o mês do cartão, "2026-08"; o anterior sai do calendário */
  mes: string
): ComparativoMensal {
  const porMes = new Map<string, { conferidas: number; limpas: number }>();
  for (const p of paredes) {
    const k = p.data.slice(0, 7);
    const a = porMes.get(k) ?? { conferidas: 0, limpas: 0 };
    a.conferidas++;
    if (p.passou_de_primeira) a.limpas++;
    porMes.set(k, a);
  }
  const monta = (m: string): FpyDoMes => {
    const a = porMes.get(m) ?? { conferidas: 0, limpas: 0 };
    return {
      mes: m,
      conferidas: a.conferidas,
      limpas: a.limpas,
      fpy: pct(a.limpas, a.conferidas),
    };
  };
  const atual = monta(mes);
  const anterior = monta(mesAnterior(mes));
  const pontos = atual.fpy - anterior.fpy;
  return {
    atual,
    anterior,
    pontos,
    /* sem mês anterior não existe variação relativa — dividir por zero
       daria "infinito de melhora", que é pior do que não dizer nada */
    percentual: anterior.conferidas && anterior.fpy > 0
      ? Math.round((pontos / anterior.fpy) * 100)
      : null,
  };
}

export const fpyPorDia = (paredes: ParedeConferida[]) =>
  fpyPor(
    paredes,
    (d) => d,
    (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  );

/*
 * A semana aqui é a semana CORTADA NA VIRADA DO MÊS (inicioSemanaMes),
 * e não a semana corrida: a fábrica fecha por mês, e uma barra que
 * mistura os dois lados da virada não serve para nenhuma das duas
 * reuniões de fechamento. Ver a explicação em lib/dashboard.ts.
 */
export const fpyPorSemana = (paredes: ParedeConferida[]) =>
  fpyPor(paredes, inicioSemanaMes, rotuloSemanaMes, nomeSemanaMes);

export function porSemanaDoMes(
  paredes: ParedeConferida[],
  erros: LinhaDash[]
): Semana[] {
  return [1, 2, 3, 4].map((semana) => {
    const er = erros.filter((e) => semanaDoMes(e.data) === semana);
    return {
      semana,
      paredesAfetadas: paredes.filter(
        (p) => !p.passou_de_primeira && semanaDoMes(p.data) === semana
      ).length,
      erros: er.length,
      retrabalhos: er.filter((e) => e.status === "RETRABALHO").length,
    };
  });
}

export function errosPorDia(erros: LinhaDash[]) {
  const m = new Map<string, number>();
  for (const e of erros) m.set(e.data, (m.get(e.data) ?? 0) + 1);
  return [...m.entries()]
    .map(([data, n]) => ({ data, n }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/* ------------------------------------------------------------------ */
/* Rankings                                                            */
/* ------------------------------------------------------------------ */

export interface ItemRanking {
  nome: string;
  qtd: number;
  pct: number;
}

export function topPor<T>(lista: T[], campo: keyof T, n = 5): ItemRanking[] {
  const m = new Map<string, number>();
  for (const x of lista) {
    const k = String(x[campo]);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([nome, qtd]) => ({ nome, qtd, pct: pct(qtd, lista.length) }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, n);
}

export interface CasaCritica {
  casa: string;
  criticos: number;
  paredesAfetadas: number;
}

export function casasMaisCriticas(erros: LinhaDash[], n = 5): CasaCritica[] {
  const criticos = erros.filter((e) => e.criticidade === "CRITICO");
  return [...new Set(criticos.map((e) => e.casa))]
    .map((casa) => ({
      casa,
      criticos: criticos.filter((e) => e.casa === casa).length,
      paredesAfetadas: new Set(
        erros.filter((e) => e.casa === casa).map((e) => e.parede)
      ).size,
    }))
    .sort((a, b) => b.criticos - a.criticos)
    .slice(0, n);
}

export interface TipoDuploNivel {
  nome: string;
  critico: number;
  medio: number;
  pctCritico: number;
}

/**
 * Tipos que aparecem como crítico E como médio.
 *
 * Substitui "médios que evoluem para críticos", que a base não sustenta:
 * o log guarda alteração campo a campo e nunca houve uma única mudança
 * de criticidade. O que dá para medir é o mesmo defeito sendo às vezes
 * classificado como médio e às vezes como crítico.
 */
export function tiposNasDuasGravidades(
  erros: LinhaDash[],
  n = 3
): TipoDuploNivel[] {
  const m = new Map<string, { critico: number; medio: number }>();
  for (const e of erros) {
    const a = m.get(e.tipo_erro) ?? { critico: 0, medio: 0 };
    if (e.criticidade === "CRITICO") a.critico++;
    if (e.criticidade === "MEDIO") a.medio++;
    m.set(e.tipo_erro, a);
  }
  return [...m.entries()]
    .filter(([, a]) => a.critico > 0 && a.medio > 0)
    .map(([nome, a]) => ({
      nome, ...a,
      pctCritico: pct(a.critico, a.critico + a.medio),
    }))
    .sort((a, b) => b.critico + b.medio - (a.critico + a.medio))
    .slice(0, n);
}

/* ------------------------------------------------------------------ */
/* Comparativo mensal                                                  */
/* ------------------------------------------------------------------ */

export function mesesDe(paredes: ParedeConferida[], erros: LinhaDash[]) {
  const s = new Set<string>();
  for (const p of paredes) s.add(p.data.slice(0, 7));
  for (const e of erros) s.add(e.data.slice(0, 7));
  return [...s].sort();
}

export interface ResumoMes {
  mes: string;
  casas: number;
  paredes: number;
  erros: number;
  critico: number;
  medio: number;
  baixo: number;
  casasZeradas: number;
  errosPorCasa: number;
  criticosPorCasa: number;
}

export function resumoDoMes(
  paredes: ParedeConferida[],
  erros: LinhaDash[],
  mes: string,
  regra: RegraFpy
): ResumoMes {
  const par = paredes.filter((p) => p.data.startsWith(mes));
  const er = erros.filter((e) => e.data.startsWith(mes));
  const casas = fpyPorCasa(par, regra);
  const conta = (c: string) => er.filter((e) => e.criticidade === c).length;
  // divisor mínimo 1: mês sem casa auditada não pode virar divisão por zero
  const nc = casas.length || 1;
  return {
    mes,
    casas: casas.length,
    paredes: par.length,
    erros: er.length,
    critico: conta("CRITICO"),
    medio: conta("MEDIO"),
    baixo: conta("BAIXO"),
    /* "FPY zerado" é FPY = 0, venha de onde vier. Uma casa pode chegar
       a zero sem a regra: a 75 do C4A tem 5 paredes conferidas e nenhuma
       limpa. Contar só o zeramento pela regra aqui daria um número
       diferente do cartão da folha de FPY, para o mesmo rótulo. */
    casasZeradas: casas.filter((c) => c.fpy === 0).length,
    errosPorCasa: er.length / nc,
    criticosPorCasa: conta("CRITICO") / nc,
  };
}

export interface PontoTipo {
  mes: string;
  qtd: number;
  critico: number;
  /** erros do tipo ÷ casas auditadas no mês */
  norm: number;
  normCritico: number;
}

export interface SerieTipo {
  nome: string;
  serie: PontoTipo[];
  total: number;
}

/**
 * Erros por tipo, mês a mês, já divididos pelas casas do mês.
 *
 * Sem a divisão, "julho teve menos erros" só informa que julho auditou
 * menos casas. É a única forma de comparar meses de tamanhos diferentes.
 */
export function tiposPorMes(
  paredes: ParedeConferida[],
  erros: LinhaDash[],
  meses: string[]
): SerieTipo[] {
  const casasDoMes = new Map<string, number>();
  for (const m of meses)
    casasDoMes.set(
      m,
      new Set(paredes.filter((p) => p.data.startsWith(m)).map((p) => p.casa)).size || 1
    );

  const tipos = new Map<string, Map<string, { qtd: number; critico: number }>>();
  for (const e of erros) {
    const m = e.data.slice(0, 7);
    if (!meses.includes(m)) continue;
    const t = tipos.get(e.tipo_erro) ?? new Map();
    const c = t.get(m) ?? { qtd: 0, critico: 0 };
    c.qtd++;
    if (e.criticidade === "CRITICO") c.critico++;
    t.set(m, c);
    tipos.set(e.tipo_erro, t);
  }

  return [...tipos.entries()].map(([nome, porMes]) => {
    const serie = meses.map((mes) => {
      const c = porMes.get(mes) ?? { qtd: 0, critico: 0 };
      const casas = casasDoMes.get(mes) ?? 1;
      return {
        mes, qtd: c.qtd, critico: c.critico,
        norm: c.qtd / casas, normCritico: c.critico / casas,
      };
    });
    return { nome, serie, total: serie.reduce((s, x) => s + x.qtd, 0) };
  });
}

/** null = não havia base para comparar (era zero e passou a existir). */
export function variacao(antes: number, agora: number): number | null {
  if (antes === 0) return agora === 0 ? 0 : null;
  return Math.round(((agora - antes) / antes) * 100);
}

/**
 * Volume mínimo para um tipo entrar em ranking de variação.
 *
 * Sem isto o topo da lista é ocupado por "+339%", que na base real é um
 * erro virando um erro num mês que auditou menos casas. Variação de três
 * dígitos sobre número de um dígito é ruído, não tendência.
 */
export const VOLUME_MINIMO = 3;
