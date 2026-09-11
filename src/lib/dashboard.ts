import type { Criticidade, Status } from "@/lib/types";

/*
 * Agregações do Painel de Produção — funções puras, sem Supabase.
 *
 * Contagens são ABSOLUTAS: o sistema não captura quantos painéis são
 * produzidos, então taxas por painel produzido (FPY, defeitos por
 * unidade) não são calculáveis honestamente.
 *
 * Indicadores de TEMPO dependem de `resolved_at`, capturado quando o
 * status vira RETRABALHO. Registros importados da planilha antiga não
 * têm essa data — as medianas valem dos registros novos em diante.
 *
 * Campos futuros que destravariam mais métricas (não construído):
 *  - horas de retrabalho -> custo do retrabalho por tipo/setor
 *  - causa raiz          -> origem (material, desenho, máquina, setor anterior)
 *  - painéis produzidos  -> denominador para taxas e First Pass Yield
 *  - defeito escapado    -> erro encontrado após a expedição
 */

export type Periodo =
  | "hoje"
  | "ontem"
  | "7"
  | "semana"
  | "30"
  | "mes"
  | "90"
  | "tudo"
  | "custom";

/*
 * Os botões que a tela oferece. O tipo Periodo e a função intervaloDe
 * continuam entendendo "semana", "30" e "90": elas saíram da barra por
 * serem opção demais para a decisão que a fábrica toma, mas quem tiver
 * um desses valores guardado continua sendo atendido em vez de cair
 * num intervalo vazio.
 */
export const PERIODOS: { valor: Periodo; rotulo: string; dica: string }[] = [
  { valor: "hoje", rotulo: "Hoje", dica: "Somente o dia de hoje" },
  { valor: "ontem", rotulo: "Ontem", dica: "Somente o dia de ontem" },
  { valor: "7", rotulo: "7 dias", dica: "Os últimos 7 dias, incluindo hoje" },
  { valor: "mes", rotulo: "Mês", dica: "Do dia 1º deste mês até hoje" },
  { valor: "tudo", rotulo: "Tudo", dica: "Toda a base, sem corte de data" },
  {
    valor: "custom",
    rotulo: "Personalizado",
    dica: "Um intervalo definido por você",
  },
];

export interface LinhaDash {
  id: number;
  data: string; // YYYY-MM-DD
  projeto: string;
  setor: string;
  tipo_erro: string;
  parede: string;
  casa: string;
  ocorrencia: string;
  criticidade: Criticidade;
  status: Status;
  resolved_at: string | null; // timestamptz
}

export const COLUNAS_DASH =
  "id, data, projeto, setor, tipo_erro, parede, casa, ocorrencia, criticidade, status, resolved_at";

/* ------------------------------------------------------------------ */
/* Recortes: o clique no gráfico vira filtro do painel                 */
/* ------------------------------------------------------------------ */

export type CampoRecorte =
  | "projeto"
  | "setor"
  | "tipo_erro"
  | "parede"
  | "casa"
  | "criticidade"
  | "status"
  | "semana"
  | "semanaMes"
  | "dia"
  | "mes";

export interface Recorte {
  campo: CampoRecorte;
  valor: string;
}

export const ROTULO_RECORTE: Record<CampoRecorte, string> = {
  projeto: "Projeto",
  setor: "Setor",
  tipo_erro: "Tipo",
  parede: "Parede",
  casa: "Casa",
  criticidade: "Criticidade",
  status: "Situação",
  semana: "Semana de",
  semanaMes: "Semana",
  dia: "Dia",
  mes: "Mês",
};

/**
 * Campos que existem numa parede conferida. Um recorte por setor ou por
 * tipo de erro NÃO pode filtrar paredes: descartar as paredes sem aquele
 * erro tiraria do denominador justamente as que passaram, inflando o FPY.
 *
 * Projeto e casa, ao contrário, filtram os dois lados — é o que permite
 * ler o FPY de um projeto só, ou de uma casa só, sem falsear a conta.
 */
const RECORTES_DE_PAREDE: CampoRecorte[] = [
  "projeto",
  "parede",
  "casa",
  "semana",
  "semanaMes",
  "dia",
  "mes",
];

export function recortesQueNaoAfetamFpy(rs: Recorte[]): Recorte[] {
  return rs.filter((r) => !RECORTES_DE_PAREDE.includes(r.campo));
}

function combina(valorDaLinha: string, recorte: Recorte): boolean {
  return valorDaLinha.trim() === recorte.valor;
}

/** Todos os recortes valem ao mesmo tempo (E, não OU). */
export function aplicarRecortes(
  rows: LinhaDash[],
  rs: Recorte[]
): LinhaDash[] {
  if (rs.length === 0) return rows;
  return rows.filter((r) =>
    rs.every((rec) =>
      rec.campo === "semana"
        ? inicioSemana(r.data) === rec.valor
        : rec.campo === "semanaMes"
          ? inicioSemanaMes(r.data) === rec.valor
        : rec.campo === "dia"
          ? r.data === rec.valor
          : rec.campo === "mes"
            ? r.data.slice(0, 7) === rec.valor
            : combina(String(r[rec.campo] ?? ""), rec)
    )
  );
}

export function aplicarRecortesEmParedes(
  paredes: ParedeConferida[],
  rs: Recorte[]
): ParedeConferida[] {
  const uteis = rs.filter((r) => RECORTES_DE_PAREDE.includes(r.campo));
  if (uteis.length === 0) return paredes;
  return paredes.filter((p) =>
    uteis.every((rec) =>
      rec.campo === "semana"
        ? inicioSemana(p.data) === rec.valor
        : rec.campo === "semanaMes"
          ? inicioSemanaMes(p.data) === rec.valor
        : rec.campo === "dia"
          ? p.data === rec.valor
          : rec.campo === "mes"
            ? p.data.slice(0, 7) === rec.valor
            : combina(
              String(p[rec.campo as "projeto" | "parede" | "casa"] ?? ""),
              rec
            )
    )
  );
}

/** Liga/desliga um recorte: clicar de novo na mesma barra remove o filtro. */
export function alternarRecorte(
  rs: Recorte[],
  campo: CampoRecorte,
  valor: string
): Recorte[] {
  const v = valor.trim();
  const existe = rs.some((r) => r.campo === campo && r.valor === v);
  if (existe) return rs.filter((r) => !(r.campo === campo && r.valor === v));
  // um campo, um valor: trocar de setor substitui o setor anterior
  return [...rs.filter((r) => r.campo !== campo), { campo, valor: v }];
}

export function temRecorte(
  rs: Recorte[],
  campo: CampoRecorte,
  valor: string
): boolean {
  return rs.some((r) => r.campo === campo && r.valor === valor.trim());
}

/** Para seletores: valor vazio remove o recorte daquele campo. */
export function definirRecorte(
  rs: Recorte[],
  campo: CampoRecorte,
  valor: string
): Recorte[] {
  const outros = rs.filter((r) => r.campo !== campo);
  const v = valor.trim();
  return v ? [...outros, { campo, valor: v }] : outros;
}

export function valorDoRecorte(
  rs: Recorte[],
  campo: CampoRecorte
): string {
  return rs.find((r) => r.campo === campo)?.valor ?? "";
}

/**
 * Opções de projeto e de casa que existem de fato nos dados carregados —
 * erros e paredes auditadas. Uma casa auditada sem nenhum erro precisa
 * aparecer na lista: é justamente a casa com FPY 100%.
 */
export function opcoesDeRecorte(
  linhas: LinhaDash[],
  paredes: ParedeConferida[]
): { projetos: string[]; casasPorProjeto: Map<string, string[]> } {
  const projetos = new Set<string>();
  const porProjeto = new Map<string, Set<string>>();
  const todas = new Set<string>();

  const juntar = (projeto: string, casa: string) => {
    const p = projeto.trim();
    const c = casa.trim();
    if (p) projetos.add(p);
    if (!c) return;
    todas.add(c);
    if (!p) return;
    const s = porProjeto.get(p) ?? new Set<string>();
    s.add(c);
    porProjeto.set(p, s);
  };

  for (const l of linhas) juntar(l.projeto ?? "", l.casa);
  for (const p of paredes) juntar(p.projeto ?? "", p.casa);

  const ordenar = (s: Iterable<string>) =>
    // decrescente: a produção fala das casas mais novas primeiro
    [...s].sort((a, b) => ordemNaturalCasa(b, a));

  const casasPorProjeto = new Map<string, string[]>();
  casasPorProjeto.set("", ordenar(todas));
  for (const [p, s] of porProjeto) casasPorProjeto.set(p, ordenar(s));

  return {
    projetos: [...projetos].sort((a, b) => a.localeCompare(b, "pt-BR")),
    casasPorProjeto,
  };
}

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

const FMT_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
});

export function hojeSaoPaulo(): string {
  return FMT_SP.format(new Date());
}

/** Converte um timestamp ISO para a data (YYYY-MM-DD) em São Paulo. */
export function dataSP(iso: string): string {
  return FMT_SP.format(new Date(iso));
}

function paraUTC(data: string): number {
  const [a, m, d] = data.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

function deUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DIA_MS = 86_400_000;

export interface Intervalo {
  /** null = sem limite (a base inteira) */
  inicio: string | null;
  fim: string | null;
}

export interface DatasEscolhidas {
  de: string;
  ate: string;
}

/**
 * Traduz o botão de período no intervalo de datas usado nas consultas.
 * "Semana" começa na segunda; "Mês" no dia 1º. Ambos vão até hoje — são
 * períodos em curso, não fechados.
 */
export function intervaloDe(
  p: Periodo,
  hoje: string,
  escolhidas?: DatasEscolhidas
): Intervalo {
  switch (p) {
    case "tudo":
      return { inicio: null, fim: null };
    case "hoje":
      return { inicio: hoje, fim: hoje };
    case "ontem": {
      const d = deUTC(paraUTC(hoje) - DIA_MS);
      return { inicio: d, fim: d };
    }
    case "semana":
      return { inicio: inicioSemana(hoje), fim: hoje };
    case "mes":
      return { inicio: hoje.slice(0, 8) + "01", fim: hoje };
    case "custom": {
      const de = escolhidas?.de || null;
      const ate = escolhidas?.ate || null;
      // datas invertidas pelo usuário: endireita em vez de zerar a tela
      if (de && ate && de > ate) return { inicio: ate, fim: de };
      return { inicio: de, fim: ate };
    }
    default:
      return {
        inicio: deUTC(paraUTC(hoje) - (Number(p) - 1) * DIA_MS),
        fim: hoje,
      };
  }
}

/** Texto do intervalo para o cabeçalho e para as notas dos cartões. */
export function rotuloIntervalo(i: Intervalo): string {
  if (!i.inicio && !i.fim) return "toda a base";
  if (i.inicio && i.fim)
    return i.inicio === i.fim
      ? formatarData(i.inicio)
      : `${formatarData(i.inicio)} a ${formatarData(i.fim)}`;
  if (i.inicio) return `de ${formatarData(i.inicio)} em diante`;
  return `até ${formatarData(i.fim as string)}`;
}

export function inicioSemana(data: string): string {
  const ms = paraUTC(data);
  const dow = new Date(ms).getUTCDay();
  return deUTC(ms - ((dow + 6) % 7) * DIA_MS);
}

export function rotuloSemana(segunda: string): string {
  const [, m, d] = segunda.split("-");
  return `${d}/${m}`;
}

/* ------------------------------------------------------------------ *
 * A SEMANA QUE RESPEITA O MÊS
 *
 * A fábrica fecha resultado por MÊS. Uma semana corrida que começa dia
 * 30 e termina dia 3 não pertence a mês nenhum: ela mistura o
 * fechamento de um com a abertura do outro, e o número que sai dali
 * não serve para nenhuma das duas reuniões.
 *
 * Então a semana é CORTADA na virada. A que ia de 30/06 a 06/07 vira
 * duas: uma de dois dias (30 e 31 de junho) e outra de cinco (1º a 6
 * de julho). Semana de tamanho diferente é o preço, e é um preço
 * barato: o FPY é uma PROPORÇÃO, não um total. Dois dias com 40
 * paredes conferidas dão um FPY tão legítimo quanto cinco dias com
 * 100 — o que muda é a confiança, e para isso o gráfico já diz
 * quantas paredes entraram na conta.
 *
 * A chave do período é o primeiro dia do pedaço: a segunda-feira, ou
 * o dia 1º do mês, o que vier depois. Como isso é função pura da
 * data, o clique no gráfico continua virando filtro com uma simples
 * comparação de igualdade, sem precisar carregar intervalo.
 * ------------------------------------------------------------------ */
export function inicioSemanaMes(data: string): string {
  const segunda = inicioSemana(data);
  const primeiroDoMes = `${data.slice(0, 8)}01`;
  /* Datas ISO comparam certo como texto: 2026-06-29 < 2026-07-01. */
  return segunda > primeiroDoMes ? segunda : primeiroDoMes;
}

const MES_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const MES_LONGO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Qual pedaço do mês é este: 1 para o primeiro, 2 para o seguinte.
 *
 * Dentro de um mês, os pedaços começam no dia 1º e depois em toda
 * segunda-feira. Então a ordem sai de conta, sem precisar varrer o
 * calendário: descubro em que dia cai a primeira segunda depois do 1º
 * e conto de sete em sete a partir dela.
 */
function ordemNoMes(chave: string): number {
  const dia = Number(chave.slice(8, 10));
  if (dia === 1) return 1;
  const dow = new Date(paraUTC(`${chave.slice(0, 8)}01`)).getUTCDay();
  const desdeSegunda = (dow + 6) % 7; // 0 = o mês começa numa segunda
  const primeiraSegunda = 8 - desdeSegunda;
  return 2 + Math.round((dia - primeiraSegunda) / 7);
}

/** Curto, para caber no eixo: "S1 jun". */
export function rotuloSemanaMes(chave: string): string {
  const mes = MES_CURTO[Number(chave.slice(5, 7)) - 1];
  return `S${ordemNoMes(chave)} ${mes}`;
}

/** Por extenso, para a dica e para a etiqueta do filtro. */
export function nomeSemanaMes(chave: string): string {
  const mes = MES_LONGO[Number(chave.slice(5, 7)) - 1];
  return `Semana ${ordemNoMes(chave)} de ${mes}`;
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((paraUTC(ate) - paraUTC(de)) / DIA_MS);
}

export function formatarData(data: string): string {
  const [a, m, d] = data.slice(0, 10).split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

function mediana(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/** Dias entre o registro do erro e o retrabalho concluído. */
function diasDeRetrabalho(r: LinhaDash): number | null {
  if (r.status !== "RETRABALHO" || !r.resolved_at) return null;
  const d = diasEntre(r.data, dataSP(r.resolved_at));
  return d < 0 ? 0 : d;
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* First Pass Yield                                                    */
/* ------------------------------------------------------------------ */

/** Uma linha por parede conferida na auditoria (view fpy_paredes). */
export interface ParedeConferida {
  data: string;
  projeto: string;
  casa: string;
  parede: string;
  erros: number;
  passou_de_primeira: boolean;
  /** true = deduzida do histórico; false = conferida no sistema */
  reconstruida: boolean;
  /**
   * Área da POSIÇÃO desta parede no projeto, em m² (migration 024).
   *
   * Nula quando o projeto ainda não teve a metragem levantada. Quem
   * soma áreas precisa contar quantas vieram nulas e dizer isso na
   * tela: um total menor por falta de cadastro parece um total menor
   * por falta de produção, e são coisas opostas.
   */
  area_m2: number | null;
}

export interface Fpy {
  conferidas: number;
  passaram: number;
  /** % de paredes que passaram de primeira, sem retrabalho */
  fpy: number | null;
  /** defeitos por unidade: erros ÷ paredes conferidas */
  dpu: number | null;
  casas: number;
  /** paredes vindas de auditoria reconstruída do histórico */
  reconstruidas: number;
  /** FPY apenas das auditorias feitas no sistema (mais confiável) */
  fpyMedido: number | null;
  medidas: number;
}

export function calcularFpy(paredes: ParedeConferida[]): Fpy {
  const conferidas = paredes.length;
  const passaram = paredes.filter((p) => p.passou_de_primeira).length;
  const erros = paredes.reduce((s, p) => s + p.erros, 0);
  const medidasArr = paredes.filter((p) => !p.reconstruida);
  const medidasOk = medidasArr.filter((p) => p.passou_de_primeira).length;
  return {
    conferidas,
    passaram,
    fpy: conferidas === 0 ? null : Math.round((passaram / conferidas) * 100),
    dpu:
      conferidas === 0
        ? null
        : Math.round((erros / conferidas) * 100) / 100,
    casas: new Set(paredes.map((p) => `${p.projeto}|${p.casa}`)).size,
    reconstruidas: paredes.filter((p) => p.reconstruida).length,
    medidas: medidasArr.length,
    fpyMedido:
      medidasArr.length === 0
        ? null
        : Math.round((medidasOk / medidasArr.length) * 100),
  };
}

/** Ordena "88", "110", "PT 45" como a fábrica lê: pelo número. */
export function ordemNaturalCasa(a: string, b: string): number {
  const na = parseInt(a.replace(/\D/g, ""), 10);
  const nb = parseInt(b.replace(/\D/g, ""), 10);
  if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b, "pt-BR");
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  if (na !== nb) return na - nb;
  return a.localeCompare(b, "pt-BR");
}

/* ------------------------------------------------------------------ */
/* Diagnóstico por posição de parede                                   */
/* ------------------------------------------------------------------ */

export interface DiagnosticoParede {
  parede: string;
  conferidas: number;
  passaram: number;
  fpy: number;
  erros: number;
  /** paredes desta posição que foram reprovadas (têm ao menos um erro) */
  reprovadas: number;
  /**
   * Quando esta posição falha, falha com quantos erros. O FPY diz com que
   * frequência a posição erra; isto diz o tamanho do estrago.
   */
  errosPorReprovada: number;
  /** erros nesta posição que estouraram o prazo e viraram não conformidade */
  naoConformidades: number;
  /** os tipos de erro que mais aparecem nesta posição */
  principais: { nome: string; qtd: number }[];
}

/**
 * Cruza as paredes conferidas (quantas passaram) com os erros (quais
 * problemas) para responder: qual posição é o gargalo e por quê.
 */
export function diagnosticoPorParede(
  paredes: ParedeConferida[],
  erros: LinhaDash[],
  topTipos = 3
): DiagnosticoParede[] {
  const porParede = new Map<
    string,
    { conferidas: number; passaram: number; erros: number; reprovadas: number }
  >();
  for (const p of paredes) {
    const at = porParede.get(p.parede) ?? {
      conferidas: 0,
      passaram: 0,
      erros: 0,
      reprovadas: 0,
    };
    at.conferidas++;
    if (p.passou_de_primeira) at.passaram++;
    else at.reprovadas++;
    at.erros += p.erros;
    porParede.set(p.parede, at);
  }

  const tipos = new Map<string, Map<string, number>>();
  const ncs = new Map<string, number>();
  for (const e of erros) {
    const parede = e.parede.trim();
    if (!porParede.has(parede)) continue;
    const m = tipos.get(parede) ?? new Map<string, number>();
    m.set(e.tipo_erro, (m.get(e.tipo_erro) ?? 0) + 1);
    tipos.set(parede, m);
    if (e.status === "NAO_CONFORMIDADE")
      ncs.set(parede, (ncs.get(parede) ?? 0) + 1);
  }

  return [...porParede.entries()]
    .map(([parede, v]) => ({
      parede,
      ...v,
      naoConformidades: ncs.get(parede) ?? 0,
      fpy: v.conferidas === 0 ? 0 : Math.round((v.passaram / v.conferidas) * 100),
      errosPorReprovada:
        v.reprovadas === 0
          ? 0
          : Math.round((v.erros / v.reprovadas) * 10) / 10,
      principais: [...(tipos.get(parede) ?? new Map())]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topTipos)
        .map(([nome, qtd]) => ({ nome, qtd })),
    }))
    .sort((a, b) => a.fpy - b.fpy || b.erros - a.erros);
}

/* ------------------------------------------------------------------ */
/* Densidade de defeitos — o que o FPY esconde                         */
/* ------------------------------------------------------------------ */

/*
 * O FPY é binário: a parede passou ou não passou. Uma parede reprovada
 * com 1 erro e outra com 20 pesam igual no indicador, mas não pesam
 * igual na fábrica — a de 20 provavelmente vai ser refeita inteira.
 *
 * A densidade responde a outra pergunta: QUANDO falha, falha com quanto.
 *   DPU        = erros ÷ paredes conferidas       (visão do lote)
 *   DPU das reprovadas = erros ÷ paredes reprovadas (tamanho do estrago)
 */

export interface ParedeCritica {
  projeto: string;
  casa: string;
  parede: string;
  erros: number;
  principais: { nome: string; qtd: number }[];
}

export interface FaixaDensidade {
  rotulo: string;
  min: number;
  max: number;
  qtd: number;
}

export interface Densidade {
  conferidas: number;
  reprovadas: number;
  erros: number;
  dpu: number | null;
  dpuReprovadas: number | null;
  /** maior número de erros encontrado numa única parede */
  maxErros: number;
  faixas: FaixaDensidade[];
  /** paredes com erros ≥ limiar escolhido na tela */
  acimaDoLimiar: number;
  errosAcimaDoLimiar: number;
  piores: ParedeCritica[];
}

const FAIXAS_DENSIDADE: [string, number, number][] = [
  ["1 erro", 1, 1],
  ["2", 2, 2],
  ["3", 3, 3],
  ["4–5", 4, 5],
  ["6–9", 6, 9],
  ["10+", 10, Infinity],
];

export function densidadeErros(
  paredes: ParedeConferida[],
  erros: LinhaDash[],
  limiar = 4,
  topN = 12
): Densidade {
  const reprovadas = paredes.filter((p) => p.erros > 0);
  const totalErros = paredes.reduce((s, p) => s + p.erros, 0);

  const faixas: FaixaDensidade[] = FAIXAS_DENSIDADE.map(
    ([rotulo, min, max]) => ({
      rotulo,
      min,
      max,
      qtd: reprovadas.filter((p) => p.erros >= min && p.erros <= max).length,
    })
  );

  // tipos de erro de cada parede reprovada, para o "por quê" da pior lista
  const tipos = new Map<string, Map<string, number>>();
  for (const e of erros) {
    const chave = `${e.casa.trim()}|${e.parede.trim()}`;
    const m = tipos.get(chave) ?? new Map<string, number>();
    m.set(e.tipo_erro, (m.get(e.tipo_erro) ?? 0) + 1);
    tipos.set(chave, m);
  }

  const acima = reprovadas.filter((p) => p.erros >= limiar);

  return {
    conferidas: paredes.length,
    reprovadas: reprovadas.length,
    erros: totalErros,
    dpu:
      paredes.length === 0
        ? null
        : Math.round((totalErros / paredes.length) * 100) / 100,
    dpuReprovadas:
      reprovadas.length === 0
        ? null
        : Math.round((totalErros / reprovadas.length) * 100) / 100,
    maxErros: reprovadas.reduce((m, p) => Math.max(m, p.erros), 0),
    faixas,
    acimaDoLimiar: acima.length,
    errosAcimaDoLimiar: acima.reduce((s, p) => s + p.erros, 0),
    piores: [...reprovadas]
      .sort(
        (a, b) =>
          b.erros - a.erros ||
          ordemNaturalCasa(b.casa, a.casa) ||
          a.parede.localeCompare(b.parede, "pt-BR")
      )
      .slice(0, topN)
      .map((p) => ({
        projeto: p.projeto,
        casa: p.casa,
        parede: p.parede,
        erros: p.erros,
        principais: [
          ...(tipos.get(`${p.casa.trim()}|${p.parede.trim()}`) ??
            new Map<string, number>()),
        ]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([nome, qtd]) => ({ nome, qtd })),
      })),
  };
}

export interface PontoFpy {
  semana: string;
  rotulo: string;
  conferidas: number;
  passaram: number;
  fpy: number;
}

export function fpySemanal(paredes: ParedeConferida[]): PontoFpy[] {
  if (paredes.length === 0) return [];
  const mapa = new Map<string, { conferidas: number; passaram: number }>();
  for (const p of paredes) {
    const s = inicioSemana(p.data);
    const atual = mapa.get(s) ?? { conferidas: 0, passaram: 0 };
    atual.conferidas++;
    if (p.passou_de_primeira) atual.passaram++;
    mapa.set(s, atual);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([semana, v]) => ({
      semana,
      rotulo: rotuloSemana(semana),
      ...v,
      fpy: Math.round((v.passaram / v.conferidas) * 100),
    }));
}

export interface Kpis {
  aguardando: number;
  /** retrabalho executado que ainda espera a aprovação da gestão */
  pendentesAprovacao: number;
  naoConformidades: number;
  criticosEmAberto: number;
  bloqueadas: number;
  retrabalhadasPeriodo: number;
  totalPeriodo: number;
  taxaResolucao: number;
  maisAntigoDias: number | null;
  tempoMedianoRetrabalho: number | null;
  casasComPendencia: number;
  casasNoPeriodo: number;
  medianaCasaCompleta: number | null;
}

export function calcularKpis(
  periodo: LinhaDash[],
  abertas: LinhaDash[],
  hoje: string,
  casas: SituacaoCasa[],
  /** fila de aprovação: não é pendência de produção, é de gestão */
  pendentesAprovacao: LinhaDash[] = []
): Kpis {
  const maisAntiga = abertas.reduce<string | null>(
    (min, r) => (min === null || r.data < min ? r.data : min),
    null
  );
  const retrab = periodo.filter((r) => r.status === "RETRABALHO").length;
  const tempos = periodo
    .map(diasDeRetrabalho)
    .filter((d): d is number => d !== null);
  const completas = casas
    .map((c) => c.completaEmDias)
    .filter((d): d is number => d !== null);

  return {
    aguardando: abertas.filter((r) => r.status === "AGUARDANDO").length,
    pendentesAprovacao: pendentesAprovacao.length,
    naoConformidades: abertas.filter((r) => r.status === "NAO_CONFORMIDADE")
      .length,
    criticosEmAberto: abertas.filter((r) => r.criticidade === "CRITICO").length,
    bloqueadas: abertas.filter((r) => r.status === "BLOQUEADA").length,
    retrabalhadasPeriodo: retrab,
    totalPeriodo: periodo.length,
    taxaResolucao:
      periodo.length === 0 ? 0 : Math.round((retrab / periodo.length) * 100),
    maisAntigoDias: maisAntiga === null ? null : diasEntre(maisAntiga, hoje),
    tempoMedianoRetrabalho: mediana(tempos),
    casasComPendencia: casas.filter((c) => c.situacao !== "COMPLETA").length,
    casasNoPeriodo: casas.length,
    medianaCasaCompleta: mediana(completas),
  };
}

/* ------------------------------------------------------------------ */
/* Fluxo: entram × resolvidas por semana                               */
/* ------------------------------------------------------------------ */

export interface PontoFluxo {
  semana: string;
  rotulo: string;
  entraram: number;
  resolvidas: number;
  saldo: number;
}

function semanasEntre(min: string, max: string): string[] {
  const out: string[] = [];
  for (
    let ms = paraUTC(inicioSemana(min));
    ms <= paraUTC(inicioSemana(max));
    ms += 7 * DIA_MS
  )
    out.push(deUTC(ms));
  return out;
}

export function fluxoSemanal(rows: LinhaDash[]): PontoFluxo[] {
  if (rows.length === 0) return [];
  const datas = rows.map((r) => r.data);
  const semanas = semanasEntre(
    datas.reduce((a, b) => (a < b ? a : b)),
    datas.reduce((a, b) => (a > b ? a : b))
  );
  const entrada = new Map<string, number>();
  const saida = new Map<string, number>();
  for (const r of rows) {
    const se = inicioSemana(r.data);
    entrada.set(se, (entrada.get(se) ?? 0) + 1);
    if (r.status === "RETRABALHO" && r.resolved_at) {
      const ss = inicioSemana(dataSP(r.resolved_at));
      saida.set(ss, (saida.get(ss) ?? 0) + 1);
    }
  }
  return semanas.map((s) => {
    const entraram = entrada.get(s) ?? 0;
    const resolvidas = saida.get(s) ?? 0;
    return {
      semana: s,
      rotulo: rotuloSemana(s),
      entraram,
      resolvidas,
      saldo: entraram - resolvidas,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Tendência semanal por criticidade                                   */
/* ------------------------------------------------------------------ */

export interface PontoSemana {
  semana: string;
  rotulo: string;
  porCrit: Record<Criticidade, number>;
  total: number;
}

export function tendenciaSemanal(rows: LinhaDash[]): PontoSemana[] {
  if (rows.length === 0) return [];
  const mapa = new Map<string, Record<Criticidade, number>>();
  for (const r of rows) {
    const s = inicioSemana(r.data);
    const atual = mapa.get(s) ?? { CRITICO: 0, MEDIO: 0, BAIXO: 0 };
    atual[r.criticidade]++;
    mapa.set(s, atual);
  }
  const datas = rows.map((r) => r.data);
  return semanasEntre(
    datas.reduce((a, b) => (a < b ? a : b)),
    datas.reduce((a, b) => (a > b ? a : b))
  ).map((semana) => {
    const porCrit = mapa.get(semana) ?? { CRITICO: 0, MEDIO: 0, BAIXO: 0 };
    return {
      semana,
      rotulo: rotuloSemana(semana),
      porCrit,
      total: porCrit.CRITICO + porCrit.MEDIO + porCrit.BAIXO,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Tempo de retrabalho                                                 */
/* ------------------------------------------------------------------ */

export interface TempoSetor {
  setor: string;
  mediana: number;
  amostra: number;
}

export function tempoRetrabalhoPorSetor(rows: LinhaDash[]): TempoSetor[] {
  const mapa = new Map<string, number[]>();
  for (const r of rows) {
    const d = diasDeRetrabalho(r);
    if (d === null) continue;
    const s = r.setor.trim();
    if (!s) continue;
    mapa.set(s, [...(mapa.get(s) ?? []), d]);
  }
  return [...mapa.entries()]
    .map(([setor, dias]) => ({
      setor,
      mediana: mediana(dias) as number,
      amostra: dias.length,
    }))
    .sort((a, b) => b.mediana - a.mediana);
}

/* ------------------------------------------------------------------ */
/* Pareto de tipos                                                     */
/* ------------------------------------------------------------------ */

export interface ItemPareto {
  nome: string;
  qtd: number;
  pct: number;
  acumPct: number;
  outros?: boolean;
}

function contarPor(rows: LinhaDash[], campo: keyof LinhaDash) {
  const mapa = new Map<string, number>();
  for (const r of rows) {
    const v = String(r[campo] ?? "").trim();
    if (!v) continue;
    mapa.set(v, (mapa.get(v) ?? 0) + 1);
  }
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

export function paretoTipos(rows: LinhaDash[], topN = 7): ItemPareto[] {
  const total = rows.length;
  if (total === 0) return [];
  const ordenado = contarPor(rows, "tipo_erro");
  const top = ordenado.slice(0, topN);
  const resto = ordenado.slice(topN).reduce((s, [, n]) => s + n, 0);
  let acum = 0;
  const itens: ItemPareto[] = top.map(([nome, qtd]) => {
    acum += qtd;
    return {
      nome,
      qtd,
      pct: Math.round((qtd / total) * 100),
      acumPct: Math.round((acum / total) * 100),
    };
  });
  if (resto > 0)
    itens.push({
      nome: `Outros (${ordenado.length - topN})`,
      qtd: resto,
      pct: Math.round((resto / total) * 100),
      acumPct: 100,
      outros: true,
    });
  return itens;
}

/* ------------------------------------------------------------------ */
/* Setores                                                             */
/* ------------------------------------------------------------------ */

export interface BarraSetor {
  setor: string;
  porCrit: Record<Criticidade, number>;
  total: number;
}

export function contagemPorSetor(rows: LinhaDash[]): BarraSetor[] {
  const mapa = new Map<string, Record<Criticidade, number>>();
  for (const r of rows) {
    const s = r.setor.trim();
    if (!s) continue;
    const atual = mapa.get(s) ?? { CRITICO: 0, MEDIO: 0, BAIXO: 0 };
    atual[r.criticidade]++;
    mapa.set(s, atual);
  }
  return [...mapa.entries()]
    .map(([setor, porCrit]) => ({
      setor,
      porCrit,
      total: porCrit.CRITICO + porCrit.MEDIO + porCrit.BAIXO,
    }))
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------------ */
/* Mapa de calor setor × tipo                                          */
/* ------------------------------------------------------------------ */

export interface DadosMapa {
  setores: string[];
  tipos: string[];
  valores: Record<string, number>;
  max: number;
}

export function mapaSetorTipo(
  rows: LinhaDash[],
  tiposTop: string[]
): DadosMapa {
  const conjunto = new Set(tiposTop);
  const valores: Record<string, number> = {};
  const setores = new Map<string, number>();
  let max = 0;
  for (const r of rows) {
    const setor = r.setor.trim();
    const tipo = r.tipo_erro.trim();
    if (!setor || !conjunto.has(tipo)) continue;
    const chave = `${setor}|${tipo}`;
    valores[chave] = (valores[chave] ?? 0) + 1;
    setores.set(setor, (setores.get(setor) ?? 0) + 1);
    if (valores[chave] > max) max = valores[chave];
  }
  return {
    setores: [...setores.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    tipos: tiposTop,
    valores,
    max,
  };
}

/* ------------------------------------------------------------------ */
/* Situação por casa                                                   */
/* ------------------------------------------------------------------ */

export type SituacaoTipo =
  | "COMPLETA"
  | "P. APROVAÇÃO"
  | "PENDENTE"
  | "NAO CONFORME"
  | "BLOQUEADA";

export interface SituacaoCasa {
  casa: string;
  total: number;
  retrabalhadas: number;
  pendentes: number;
  /** retrabalhos desta casa esperando a gestão aprovar */
  pendAprovacao: number;
  naoConformidades: number;
  bloqueadas: number;
  criticasAbertas: number;
  pctResolvido: number;
  situacao: SituacaoTipo;
  primeiroErro: string;
  diasDesdePrimeiro: number;
  /** dias do 1º erro até a última pendência zerada (só casas completas com data) */
  completaEmDias: number | null;
}

export function situacaoCasas(
  rows: LinhaDash[],
  hoje: string
): SituacaoCasa[] {
  const mapa = new Map<string, LinhaDash[]>();
  for (const r of rows) {
    const c = r.casa.trim();
    if (!c) continue;
    mapa.set(c, [...(mapa.get(c) ?? []), r]);
  }
  const lista = [...mapa.entries()].map(([casa, rs]) => {
    const retrabalhadas = rs.filter((r) => r.status === "RETRABALHO").length;
    const pendentes = rs.filter((r) => r.status === "AGUARDANDO").length;
    const naoConformidades = rs.filter(
      (r) => r.status === "NAO_CONFORMIDADE"
    ).length;
    const bloqueadas = rs.filter((r) => r.status === "BLOQUEADA").length;
    const pendAprovacao = rs.filter(
      (r) => r.status === "RETRABALHO_PENDENTE"
    ).length;
    const primeiroErro = rs.map((r) => r.data).reduce((a, b) => (a < b ? a : b));
    // uma casa só é COMPLETA quando não sobrou nada — nem aprovação
    const situacao: SituacaoTipo =
      bloqueadas > 0
        ? "BLOQUEADA"
        : naoConformidades > 0
          ? "NAO CONFORME"
          : pendentes > 0
            ? "PENDENTE"
            : pendAprovacao > 0
              ? "P. APROVAÇÃO"
              : "COMPLETA";

    // "completa em N dias" exige que todas tenham data de retrabalho
    let completaEmDias: number | null = null;
    if (situacao === "COMPLETA" && rs.every((r) => r.resolved_at)) {
      const ultima = rs
        .map((r) => dataSP(r.resolved_at as string))
        .reduce((a, b) => (a > b ? a : b));
      completaEmDias = Math.max(0, diasEntre(primeiroErro, ultima));
    }

    return {
      casa,
      total: rs.length,
      retrabalhadas,
      pendentes,
      pendAprovacao,
      naoConformidades,
      bloqueadas,
      criticasAbertas: rs.filter(
        (r) => r.status !== "RETRABALHO" && r.criticidade === "CRITICO"
      ).length,
      pctResolvido: Math.round((retrabalhadas / rs.length) * 100),
      situacao,
      primeiroErro,
      diasDesdePrimeiro: diasEntre(primeiroErro, hoje),
      completaEmDias,
    };
  });

  // as mais travadas primeiro, depois as que têm mais coisa em aberto
  const ordem: Record<SituacaoTipo, number> = {
    BLOQUEADA: 0,
    "NAO CONFORME": 1,
    PENDENTE: 2,
    "P. APROVAÇÃO": 3,
    COMPLETA: 4,
  };
  const emAberto = (c: SituacaoCasa) =>
    c.pendentes + c.naoConformidades + c.bloqueadas + c.pendAprovacao;
  return lista.sort(
    (a, b) =>
      ordem[a.situacao] - ordem[b.situacao] ||
      emAberto(b) - emAberto(a) ||
      b.total - a.total
  );
}

/* ------------------------------------------------------------------ */
/* Fila de pendências priorizada                                       */
/* ------------------------------------------------------------------ */

export type Prioridade =
  | "BLOQUEADA"
  | "NÃO CONFORME"
  | "CRÍTICA"
  | "AGUARDANDO";

export interface ItemFila extends LinhaDash {
  dias: number;
  prioridade: Prioridade;
}

const PESO: Record<Prioridade, number> = {
  BLOQUEADA: 0,
  "NÃO CONFORME": 1,
  CRÍTICA: 2,
  AGUARDANDO: 3,
};

export function filaPrioritaria(
  abertas: LinhaDash[],
  hoje: string
): ItemFila[] {
  return abertas
    .map((r) => {
      const prioridade: Prioridade =
        r.status === "BLOQUEADA"
          ? "BLOQUEADA"
          : r.status === "NAO_CONFORMIDADE"
            ? "NÃO CONFORME"
            : r.criticidade === "CRITICO"
              ? "CRÍTICA"
              : "AGUARDANDO";
      return { ...r, dias: diasEntre(r.data, hoje), prioridade };
    })
    .sort(
      (a, b) => PESO[a.prioridade] - PESO[b.prioridade] || b.dias - a.dias
    );
}

/* ------------------------------------------------------------------ */
/* Idade das pendências                                                */
/* ------------------------------------------------------------------ */

export interface FaixaIdade {
  rotulo: string;
  qtd: number;
}

export function faixasIdade(abertas: LinhaDash[], hoje: string): FaixaIdade[] {
  const faixas = [
    { rotulo: "0–3 d", min: 0, max: 3, qtd: 0 },
    { rotulo: "4–7 d", min: 4, max: 7, qtd: 0 },
    { rotulo: "8–14 d", min: 8, max: 14, qtd: 0 },
    { rotulo: "> 14 d", min: 15, max: Infinity, qtd: 0 },
  ];
  for (const r of abertas) {
    const dias = diasEntre(r.data, hoje);
    const f = faixas.find((x) => dias >= x.min && dias <= x.max);
    if (f) f.qtd++;
  }
  return faixas.map(({ rotulo, qtd }) => ({ rotulo, qtd }));
}

/* ------------------------------------------------------------------ */
/* Eficiência de tratativa                                             */
/* ------------------------------------------------------------------ */

export interface Eficiencia {
  nome: string;
  retrabalhadas: number;
  aguardando: number;
  pendAprovacao: number;
  naoConformidades: number;
  bloqueadas: number;
  total: number;
  pctResolvido: number;
}

export function eficienciaPorCampo(
  rows: LinhaDash[],
  campo: "setor" | "parede",
  topN?: number
): Eficiencia[] {
  const mapa = new Map<
    string,
    {
      retrabalhadas: number;
      aguardando: number;
      pendAprovacao: number;
      naoConformidades: number;
      bloqueadas: number;
    }
  >();
  for (const r of rows) {
    const nome = r[campo].trim();
    if (!nome) continue;
    const atual = mapa.get(nome) ?? {
      retrabalhadas: 0,
      aguardando: 0,
      pendAprovacao: 0,
      naoConformidades: 0,
      bloqueadas: 0,
    };
    // só o retrabalho APROVADO conta como resolvido
    if (r.status === "RETRABALHO") atual.retrabalhadas++;
    else if (r.status === "RETRABALHO_PENDENTE") atual.pendAprovacao++;
    else if (r.status === "AGUARDANDO") atual.aguardando++;
    else if (r.status === "NAO_CONFORMIDADE") atual.naoConformidades++;
    else atual.bloqueadas++;
    mapa.set(nome, atual);
  }
  let lista = [...mapa.entries()].map(([nome, c]) => {
    const total =
      c.retrabalhadas +
      c.aguardando +
      c.pendAprovacao +
      c.naoConformidades +
      c.bloqueadas;
    return {
      nome,
      ...c,
      total,
      pctResolvido:
        total === 0 ? 0 : Math.round((c.retrabalhadas / total) * 100),
    };
  });
  if (topN) lista = lista.sort((a, b) => b.total - a.total).slice(0, topN);
  return lista.sort(
    (a, b) => a.pctResolvido - b.pctResolvido || b.total - a.total
  );
}

/* ------------------------------------------------------------------ */
/* Evolução semanal dos setores                                        */
/* ------------------------------------------------------------------ */

export interface EvolucaoSetor {
  setor: string;
  total: number;
  serie: { rotulo: string; qtd: number }[];
  direcao: 1 | -1 | 0;
}

export function evolucaoSetores(rows: LinhaDash[], topN = 5): EvolucaoSetor[] {
  if (rows.length === 0) return [];
  const semanas = tendenciaSemanal(rows).map((p) => p.semana);
  const top = contagemPorSetor(rows)
    .slice(0, topN)
    .map((b) => b.setor);
  const porSetor = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const setor = r.setor.trim();
    if (!top.includes(setor)) continue;
    const s = inicioSemana(r.data);
    const serie = porSetor.get(setor) ?? new Map<string, number>();
    serie.set(s, (serie.get(s) ?? 0) + 1);
    porSetor.set(setor, serie);
  }
  return top.map((setor) => {
    const m = porSetor.get(setor) ?? new Map<string, number>();
    const serie = semanas.map((s) => ({
      rotulo: rotuloSemana(s),
      qtd: m.get(s) ?? 0,
    }));
    const total = serie.reduce((s, p) => s + p.qtd, 0);
    let direcao: 1 | -1 | 0 = 0;
    if (serie.length >= 2) {
      const ultima = serie[serie.length - 1].qtd;
      const ant = serie.slice(0, -1);
      const media = ant.reduce((s, p) => s + p.qtd, 0) / ant.length;
      if (ultima > media * 1.2) direcao = 1;
      else if (ultima < media * 0.8) direcao = -1;
    }
    return { setor, total, serie, direcao };
  });
}

/* ------------------------------------------------------------------ */
/* Reincidentes                                                        */
/* ------------------------------------------------------------------ */

export interface Reincidente {
  nome: string;
  qtd: number;
}

export function reincidentes(
  rows: LinhaDash[],
  campo: "parede" | "casa",
  topN = 5
): Reincidente[] {
  return contarPor(rows, campo)
    .slice(0, topN)
    .map(([nome, qtd]) => ({ nome, qtd }));
}
