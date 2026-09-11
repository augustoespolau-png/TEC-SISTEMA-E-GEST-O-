import type { LinhaDash, ParedeConferida } from "@/lib/dashboard";
import {
  formatarData,
  inicioSemana,
  inicioSemanaMes,
  ordemNaturalCasa,
  rotuloSemana,
  rotuloSemanaMes,
} from "@/lib/dashboard";
import { STATUS_ABERTOS, type Criticidade, type Status } from "@/lib/types";
import { casaZeraOFpy, type RegraFpy } from "@/lib/regras";

/*
 * PAINEL 2.0 — do macro ao micro, uma unidade só: a PAREDE.
 *
 * A versão anterior misturava duas unidades de contagem na mesma tela:
 * erros (uma parede com 20 erros pesava 20) e paredes (uma parede com 20
 * erros pesava 1). Dava para ler os dois números lado a lado e chegar a
 * conclusões opostas.
 *
 * Aqui a unidade é sempre a parede conferida, e cada parede tem UM
 * estado. Assim tudo soma: aceitas + retrabalhadas + aguardando + em
 * retrabalho = paredes conferidas. Erro é detalhe, e aparece no
 * relatório do micro, não como medida de progresso.
 *
 * O projeto é sempre um só, nunca somado com outro: projetos diferentes
 * têm quantidade de paredes diferente, e uma média entre eles não
 * significa nada na fábrica.
 */

export type EstadoParede =
  | "ACEITA"
  | "RETRABALHADA"
  | "AGUARDA_APROVACAO"
  | "EM_RETRABALHO";

export const ROTULO_ESTADO: Record<EstadoParede, string> = {
  ACEITA: "Aceita de primeira",
  RETRABALHADA: "Retrabalhada e aprovada",
  AGUARDA_APROVACAO: "Aguardando aprovação",
  EM_RETRABALHO: "Em retrabalho",
};

export const EXPLICACAO_ESTADO: Record<EstadoParede, string> = {
  ACEITA: "Conferida na auditoria e sem nenhum desvio apontado.",
  RETRABALHADA: "Teve desvio, foi corrigida e a gestão aprovou o retrabalho.",
  AGUARDA_APROVACAO:
    "O retrabalho foi executado mas ainda não foi aprovado — por isso a faixa é listrada e não conta como concluída.",
  EM_RETRABALHO: "Ainda tem desvio em aberto esperando a produção.",
};

/** A parede está resolvida? Só duas contam. */
export const ESTADOS_CONCLUIDOS: EstadoParede[] = ["ACEITA", "RETRABALHADA"];

export interface ParedeEstado {
  projeto: string;
  casa: string;
  parede: string;
  /** data da auditoria — é o eixo do tempo da qualidade, não a do erro */
  dataAuditoria: string;
  estado: EstadoParede;
  erros: number;
  abertos: number;
  pendentes: number;
  aprovados: number;
  criticosAbertos: number;
  /** true = auditoria deduzida do histórico da planilha, não medida */
  reconstruida: boolean;
  /** a casa toda estourou o limite de erros: esta parede não conta no FPY */
  casaZerada: boolean;
}

/* ------------------------------------------------------------------ */
/* Regra de negócio da empresa, editável em Configurações              */
/* ------------------------------------------------------------------ */

/* A regra mora em lib/regras.ts, usada também pela tela de Auditoria.
   Reexportada aqui para não quebrar quem já importava daqui. */
export {
  REGRA_FPY_PADRAO,
  casaZeraOFpy,
  fpyDaCasa,
  type RegraFpy,
} from "@/lib/regras";

/**
 * Marca as paredes das casas que espalharam erro demais.
 *
 * O que a regra NÃO faz: mexer no estado da parede. Uma parede sem erro
 * numa casa penalizada continua ACEITA para a execução — ela está pronta
 * de fato, e fingir o contrário faria o progresso da obra parecer menor
 * do que é. A penalidade vale só para o FPY.
 */
export function aplicarRegraDaCasa(
  paredes: ParedeEstado[],
  regra: RegraFpy
): ParedeEstado[] {
  const afetadasPorCasa = new Map<string, number>();
  for (const p of paredes)
    if (p.erros > 0)
      afetadasPorCasa.set(p.casa, (afetadasPorCasa.get(p.casa) ?? 0) + 1);

  return paredes.map((p) => ({
    ...p,
    casaZerada: casaZeraOFpy(afetadasPorCasa.get(p.casa) ?? 0, regra),
  }));
}

function chave(projeto: string, casa: string, parede: string) {
  return `${projeto.trim()}|${casa.trim()}|${parede.trim()}`;
}

/**
 * Cruza as paredes conferidas com os erros e dá a cada parede um estado.
 *
 * O cruzamento é por texto (projeto + casa + parede) e não pelo id da
 * auditoria: assim um erro lançado pela aba Registrar, fora de auditoria,
 * também conta na parede a que pertence.
 */
export function estadoDasParedes(
  paredes: ParedeConferida[],
  erros: LinhaDash[]
): ParedeEstado[] {
  const porParede = new Map<
    string,
    { abertos: number; pendentes: number; aprovados: number; criticos: number }
  >();
  for (const e of erros) {
    const k = chave(e.projeto ?? "", e.casa, e.parede);
    const at =
      porParede.get(k) ??
      { abertos: 0, pendentes: 0, aprovados: 0, criticos: 0 };
    if (e.status === "RETRABALHO") at.aprovados++;
    else if (e.status === "RETRABALHO_PENDENTE") at.pendentes++;
    else {
      at.abertos++;
      if (e.criticidade === "CRITICO") at.criticos++;
    }
    porParede.set(k, at);
  }

  return paredes.map((p) => {
    const c = porParede.get(chave(p.projeto, p.casa, p.parede)) ?? {
      abertos: 0,
      pendentes: 0,
      aprovados: 0,
      criticos: 0,
    };
    const total = c.abertos + c.pendentes + c.aprovados;
    // a ordem importa: o pior pendente define o estado da parede
    const estado: EstadoParede =
      total === 0
        ? "ACEITA"
        : c.abertos > 0
          ? "EM_RETRABALHO"
          : c.pendentes > 0
            ? "AGUARDA_APROVACAO"
            : "RETRABALHADA";
    return {
      projeto: p.projeto,
      casa: p.casa,
      parede: p.parede,
      dataAuditoria: p.data,
      estado,
      erros: total,
      abertos: c.abertos,
      pendentes: c.pendentes,
      aprovados: c.aprovados,
      criticosAbertos: c.criticos,
      reconstruida: p.reconstruida,
      // quem decide isto é aplicarRegraDaCasa, que enxerga a casa inteira
      casaZerada: false,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Contagem por estado, reaproveitada em projeto, casa e posição        */
/* ------------------------------------------------------------------ */

export interface Contagem {
  conferidas: number;
  aceitas: number;
  retrabalhadas: number;
  aguardando: number;
  emRetrabalho: number;
  erros: number;
  criticosAbertos: number;
  /** paredes sem erro que TAMBÉM contam no FPY (fora de casa penalizada) */
  passaramFpy: number;
  /** paredes sem erro que a regra da casa tirou do FPY */
  anuladasPelaRegra: number;
  /** passaramFpy ÷ conferidas */
  fpy: number | null;
  /** aceitas + retrabalhadas aprovadas ÷ conferidas */
  pctConcluido: number;
}

export function contar(paredes: ParedeEstado[]): Contagem {
  const n = paredes.length;
  const por = (e: EstadoParede) => paredes.filter((p) => p.estado === e).length;
  const aceitas = por("ACEITA");
  const retrabalhadas = por("RETRABALHADA");
  // o FPY usa "passou de primeira E a casa não estourou o limite"; a
  // execução continua usando "aceita", que é fato do chão de fábrica
  const passaramFpy = paredes.filter(
    (p) => p.estado === "ACEITA" && !p.casaZerada
  ).length;
  return {
    conferidas: n,
    aceitas,
    retrabalhadas,
    aguardando: por("AGUARDA_APROVACAO"),
    emRetrabalho: por("EM_RETRABALHO"),
    erros: paredes.reduce((s, p) => s + p.erros, 0),
    criticosAbertos: paredes.reduce((s, p) => s + p.criticosAbertos, 0),
    passaramFpy,
    anuladasPelaRegra: aceitas - passaramFpy,
    fpy: n === 0 ? null : Math.round((passaramFpy / n) * 100),
    pctConcluido: n === 0 ? 0 : Math.round(((aceitas + retrabalhadas) / n) * 100),
  };
}

export interface ResumoProjeto extends Contagem {
  casas: number;
  casasConcluidas: number;
  reconstruidas: number;
}

export function resumoProjeto(paredes: ParedeEstado[]): ResumoProjeto {
  const casas = resumoPorCasa(paredes);
  return {
    ...contar(paredes),
    casas: casas.length,
    casasConcluidas: casas.filter((c) => c.pctConcluido === 100).length,
    reconstruidas: paredes.filter((p) => p.reconstruida).length,
  };
}

/* ------------------------------------------------------------------ */
/* Casas                                                              */
/* ------------------------------------------------------------------ */

export interface ResumoCasa extends Contagem {
  casa: string;
  reconstruida: boolean;
}

export function resumoPorCasa(paredes: ParedeEstado[]): ResumoCasa[] {
  const mapa = new Map<string, ParedeEstado[]>();
  for (const p of paredes) {
    const c = p.casa.trim();
    if (!c) continue;
    mapa.set(c, [...(mapa.get(c) ?? []), p]);
  }
  return [...mapa.entries()]
    .map(([casa, ps]) => ({
      casa,
      ...contar(ps),
      reconstruida: ps.every((p) => p.reconstruida),
    }))
    // o que falta primeiro; entre iguais, a casa mais nova
    .sort(
      (a, b) =>
        a.pctConcluido - b.pctConcluido ||
        b.emRetrabalho - a.emRetrabalho ||
        ordemNaturalCasa(b.casa, a.casa)
    );
}

/* ------------------------------------------------------------------ */
/* Posições de parede                                                 */
/* ------------------------------------------------------------------ */

export interface ResumoPosicao extends Contagem {
  parede: string;
  /** quantas casas essa posição reprovou */
  reprovadas: number;
  errosPorReprovada: number;
  principais: { nome: string; qtd: number }[];
}

export function resumoPorPosicao(
  paredes: ParedeEstado[],
  erros: LinhaDash[],
  topTipos = 3
): ResumoPosicao[] {
  const mapa = new Map<string, ParedeEstado[]>();
  for (const p of paredes) {
    const k = p.parede.trim();
    if (!k) continue;
    mapa.set(k, [...(mapa.get(k) ?? []), p]);
  }

  const tipos = new Map<string, Map<string, number>>();
  for (const e of erros) {
    const k = e.parede.trim();
    if (!mapa.has(k)) continue;
    const m = tipos.get(k) ?? new Map<string, number>();
    m.set(e.tipo_erro, (m.get(e.tipo_erro) ?? 0) + 1);
    tipos.set(k, m);
  }

  return [...mapa.entries()]
    .map(([parede, ps]) => {
      const c = contar(ps);
      const reprovadas = c.conferidas - c.aceitas;
      return {
        parede,
        ...c,
        reprovadas,
        errosPorReprovada:
          reprovadas === 0 ? 0 : Math.round((c.erros / reprovadas) * 10) / 10,
        principais: [...(tipos.get(parede) ?? new Map<string, number>())]
          .sort((a, b) => b[1] - a[1])
          .slice(0, topTipos)
          .map(([nome, qtd]) => ({ nome, qtd })),
      };
    })
    /* Ordena por QUANTAS casas reprovaram, não por FPY.
       A altura da coluna no gráfico é reprovadas; se a ordem fosse por
       FPY, o texto anunciaria como pior uma posição que não é a coluna
       mais alta — uma posição conferida uma única vez e reprovada teria
       FPY 0 e passaria na frente de outra reprovada em dez casas. */
    .sort(
      (a, b) =>
        b.reprovadas - a.reprovadas ||
        (a.fpy ?? 100) - (b.fpy ?? 100) ||
        b.erros - a.erros
    );
}

/** As posições na ordem de montagem (P1, P2… P12), para o mapa. */
export function ordemDaPosicao(a: string, b: string): number {
  const na = parseInt(a.replace(/\D/g, ""), 10);
  const nb = parseInt(b.replace(/\D/g, ""), 10);
  if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b, "pt-BR");
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  return na - nb;
}

/* ------------------------------------------------------------------ */
/* Leitura da diretoria                                                */
/* ------------------------------------------------------------------ */

/*
 * As metas vivem aqui, num lugar só. Vieram do modelo que a diretoria
 * usa hoje: 70% de FPY e 80% de cobertura de inspeção. Não são as
 * referências de classe mundial (FPY 95%) — são o alvo desta fábrica
 * neste momento, e por isso mudam com uma linha quando a diretoria
 * quiser mudar.
 */
export const META = { fpy: 70, cobertura: 80 };

export interface PorCriticidade {
  criticos: number;
  medios: number;
  baixos: number;
  total: number;
  pctCriticos: number;
  pctMedios: number;
  pctBaixos: number;
}

export function contarPorCriticidade(erros: LinhaDash[]): PorCriticidade {
  const c = erros.filter((e) => e.criticidade === "CRITICO").length;
  const m = erros.filter((e) => e.criticidade === "MEDIO").length;
  const b = erros.filter((e) => e.criticidade === "BAIXO").length;
  const t = erros.length || 1;
  return {
    criticos: c,
    medios: m,
    baixos: b,
    total: erros.length,
    pctCriticos: Math.round((c / t) * 1000) / 10,
    pctMedios: Math.round((m / t) * 1000) / 10,
    pctBaixos: Math.round((b / t) * 1000) / 10,
  };
}

/**
 * Cobertura da inspeção: das paredes que as casas auditadas deveriam
 * ter, quantas foram de fato conferidas.
 *
 * Não é "% da produção inspecionada" — o sistema não sabe quantas casas
 * a fábrica produziu, só as que entraram em auditoria. É a cobertura
 * DENTRO do que foi auditado: mostra auditoria pela metade, que é o
 * defeito que faz o FPY mentir para cima.
 */
export interface Cobertura {
  conferidas: number;
  esperadas: number;
  pct: number;
  casasIncompletas: number;
}

export function coberturaInspecao(
  paredes: ParedeEstado[],
  paredesPorCasa: number
): Cobertura {
  const casas = new Map<string, number>();
  for (const p of paredes) casas.set(p.casa, (casas.get(p.casa) ?? 0) + 1);
  const esperadas = casas.size * paredesPorCasa;
  return {
    conferidas: paredes.length,
    esperadas,
    pct: esperadas === 0 ? 0 : Math.round((paredes.length / esperadas) * 100),
    casasIncompletas: [...casas.values()].filter((n) => n < paredesPorCasa)
      .length,
  };
}

/** Casas em que nenhuma parede passou de primeira. */
export function casasComFpyZero(casas: ResumoCasa[]): ResumoCasa[] {
  return casas.filter((c) => c.fpy === 0);
}

/* ---------------- evolução do FPY ---------------- */

export interface PontoCasa {
  casa: string;
  data: string;
  semana: string;
  fpy: number;
  conferidas: number;
  erros: number;
}

/** Uma casa por ponto, na ordem em que foram auditadas. */
export function fpyPorCasa(paredes: ParedeEstado[]): PontoCasa[] {
  const mapa = new Map<string, { ps: ParedeEstado[]; data: string }>();
  for (const p of paredes) {
    const at = mapa.get(p.casa) ?? { ps: [], data: p.dataAuditoria };
    at.ps.push(p);
    // a casa entra na linha do tempo pela auditoria mais antiga dela
    if (p.dataAuditoria < at.data) at.data = p.dataAuditoria;
    mapa.set(p.casa, at);
  }
  return [...mapa.entries()]
    .map(([casa, v]) => {
      const c = contar(v.ps);
      return {
        casa,
        data: v.data,
        /* semana CORTADA na virada do mês: a fábrica fecha por mês, e
           uma semana que atravessa a virada não serve a nenhum dos dois
           fechamentos. Ver lib/dashboard.ts. */
        semana: inicioSemanaMes(v.data),
        fpy: c.fpy ?? 0,
        conferidas: c.conferidas,
        erros: c.erros,
      };
    })
    .sort((a, b) => a.data.localeCompare(b.data) || ordemNaturalCasa(a.casa, b.casa));
}

export interface SemanaFpy {
  semana: string;
  rotulo: string;
  casas: number;
  primeiraCasa: string;
  ultimaCasa: string;
  fpy: number;
  conferidas: number;
  retrabalhos: number;
  naMeta: boolean;
}

export function fpyPorSemana(paredes: ParedeEstado[]): SemanaFpy[] {
  const pontos = fpyPorCasa(paredes);
  const mapa = new Map<string, ParedeEstado[]>();
  const casasDaSemana = new Map<string, string[]>();
  const semanaDaCasa = new Map<string, string>();
  for (const p of pontos) semanaDaCasa.set(p.casa, p.semana);
  for (const p of paredes) {
    const s = semanaDaCasa.get(p.casa);
    if (!s) continue;
    mapa.set(s, [...(mapa.get(s) ?? []), p]);
    const cs = casasDaSemana.get(s) ?? [];
    if (!cs.includes(p.casa)) cs.push(p.casa);
    casasDaSemana.set(s, cs);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([semana, ps]) => {
      const c = contar(ps);
      const cs = (casasDaSemana.get(semana) ?? []).sort(ordemNaturalCasa);
      return {
        semana,
        rotulo: rotuloSemanaMes(semana),
        casas: cs.length,
        primeiraCasa: cs[0] ?? "",
        ultimaCasa: cs[cs.length - 1] ?? "",
        fpy: c.fpy ?? 0,
        conferidas: c.conferidas,
        retrabalhos: c.erros,
        naMeta: (c.fpy ?? 0) >= META.fpy,
      };
    });
}

/* ---------------- retrabalhos no tempo ---------------- */

export interface PontoDia {
  data: string;
  rotulo: string;
  qtd: number;
  criticos: number;
}

export function retrabalhosPorDia(erros: LinhaDash[]): PontoDia[] {
  const mapa = new Map<string, { qtd: number; criticos: number }>();
  for (const e of erros) {
    const at = mapa.get(e.data) ?? { qtd: 0, criticos: 0 };
    at.qtd++;
    if (e.criticidade === "CRITICO") at.criticos++;
    mapa.set(e.data, at);
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, v]) => ({
      data,
      rotulo: formatarData(data).slice(0, 5),
      ...v,
    }));
}

export interface SemanaRetrabalho {
  semana: string;
  rotulo: string;
  qtd: number;
  pct: number;
}

export function retrabalhosPorSemana(erros: LinhaDash[]): SemanaRetrabalho[] {
  const mapa = new Map<string, number>();
  for (const e of erros) {
    const s = inicioSemana(e.data);
    mapa.set(s, (mapa.get(s) ?? 0) + 1);
  }
  const total = erros.length || 1;
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([semana, qtd]) => ({
      semana,
      rotulo: rotuloSemana(semana),
      qtd,
      pct: Math.round((qtd / total) * 1000) / 10,
    }));
}

/* ---------------- rankings ---------------- */

export interface CasaCritica {
  casa: string;
  criticos: number;
  paredesAfetadas: number;
  conferidas: number;
  /** true = todas as paredes conferidas da casa têm erro */
  todasAfetadas: boolean;
}

export function topCasasCriticas(
  paredes: ParedeEstado[],
  erros: LinhaDash[],
  topN = 5
): CasaCritica[] {
  const porCasa = new Map<string, { conferidas: number; afetadas: number }>();
  for (const p of paredes) {
    const at = porCasa.get(p.casa) ?? { conferidas: 0, afetadas: 0 };
    at.conferidas++;
    if (p.erros > 0) at.afetadas++;
    porCasa.set(p.casa, at);
  }
  const criticos = new Map<string, number>();
  for (const e of erros)
    if (e.criticidade === "CRITICO")
      criticos.set(e.casa.trim(), (criticos.get(e.casa.trim()) ?? 0) + 1);

  return [...porCasa.entries()]
    .map(([casa, v]) => ({
      casa,
      criticos: criticos.get(casa) ?? 0,
      paredesAfetadas: v.afetadas,
      conferidas: v.conferidas,
      todasAfetadas: v.afetadas > 0 && v.afetadas === v.conferidas,
    }))
    .filter((c) => c.criticos > 0)
    .sort(
      (a, b) =>
        b.criticos - a.criticos ||
        b.paredesAfetadas - a.paredesAfetadas ||
        ordemNaturalCasa(b.casa, a.casa)
    )
    .slice(0, topN);
}

export interface ItemRanking {
  nome: string;
  qtd: number;
  pct: number;
}

/** Top N de um campo, dentro de uma criticidade. */
export function topPorCriticidade(
  erros: LinhaDash[],
  campo: "tipo_erro" | "setor",
  criticidade: Criticidade,
  topN = 5
): { itens: ItemRanking[]; outros: number; total: number } {
  const alvo = erros.filter((e) => e.criticidade === criticidade);
  const mapa = new Map<string, number>();
  for (const e of alvo) {
    const v = String(e[campo] ?? "").trim();
    if (!v) continue;
    mapa.set(v, (mapa.get(v) ?? 0) + 1);
  }
  const total = alvo.length || 1;
  const ordenado = [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  const itens = ordenado.slice(0, topN).map(([nome, qtd]) => ({
    nome,
    qtd,
    pct: Math.round((qtd / total) * 1000) / 10,
  }));
  return {
    itens,
    outros: ordenado.slice(topN).reduce((s, [, n]) => s + n, 0),
    total: alvo.length,
  };
}

/* ------------------------------------------------------------------ */
/* Recorte do relatório (o micro)                                     */
/* ------------------------------------------------------------------ */

export interface Recorte2 {
  casa?: string;
  parede?: string;
  tipo?: string;
  setor?: string;
  criticidade?: Criticidade;
  status?: Status;
  /** só os erros de paredes naquele estado */
  estado?: EstadoParede;
}

export function recorteVazio(r: Recorte2): boolean {
  return Object.values(r).every((v) => !v);
}

export function aplicarRecorte2(
  erros: LinhaDash[],
  r: Recorte2,
  paredes: ParedeEstado[]
): LinhaDash[] {
  // recorte por estado não existe na linha do erro: vem da parede dele
  const paredesDoEstado = r.estado
    ? new Set(
        paredes
          .filter((p) => p.estado === r.estado)
          .map((p) => chave(p.projeto, p.casa, p.parede))
      )
    : null;

  return erros.filter((e) => {
    if (r.casa && e.casa.trim() !== r.casa) return false;
    if (r.parede && e.parede.trim() !== r.parede) return false;
    if (r.tipo && e.tipo_erro.trim() !== r.tipo) return false;
    if (r.setor && e.setor.trim() !== r.setor) return false;
    if (r.criticidade && e.criticidade !== r.criticidade) return false;
    if (r.status && e.status !== r.status) return false;
    if (
      paredesDoEstado &&
      !paredesDoEstado.has(chave(e.projeto ?? "", e.casa, e.parede))
    )
      return false;
    return true;
  });
}

/** Descrição em texto do recorte, para o título do relatório. */
export function descreverRecorte(r: Recorte2): string {
  const partes: string[] = [];
  if (r.estado) partes.push(ROTULO_ESTADO[r.estado].toLowerCase());
  if (r.casa) partes.push(`casa ${r.casa}`);
  if (r.parede) partes.push(r.parede);
  if (r.tipo) partes.push(r.tipo);
  if (r.setor) partes.push(`setor ${r.setor}`);
  if (r.criticidade) partes.push(r.criticidade.toLowerCase());
  return partes.join(" · ");
}

export interface ItemTipo {
  nome: string;
  qtd: number;
  abertos: number;
  pct: number;
}

/** Os tipos de erro do recorte, do mais frequente ao menos. */
export function tiposDoRecorte(erros: LinhaDash[], topN = 8): ItemTipo[] {
  const mapa = new Map<string, { qtd: number; abertos: number }>();
  for (const e of erros) {
    const n = e.tipo_erro.trim();
    if (!n) continue;
    const at = mapa.get(n) ?? { qtd: 0, abertos: 0 };
    at.qtd++;
    if (STATUS_ABERTOS.includes(e.status)) at.abertos++;
    mapa.set(n, at);
  }
  const total = erros.length || 1;
  return [...mapa.entries()]
    .map(([nome, v]) => ({
      nome,
      ...v,
      pct: Math.round((v.qtd / total) * 100),
    }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, topN);
}
