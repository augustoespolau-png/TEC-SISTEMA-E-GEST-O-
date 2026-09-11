import type { Criticidade, Status } from "@/lib/types";
import { fpyDaCasa, REGRA_FPY_PADRAO, type RegraFpy } from "@/lib/regras";

/*
 * Auditoria de casa: o auditor percorre as paredes uma a uma e declara
 * "sem erros" ou registra o que encontrou.
 *
 * As paredes conferidas são o denominador do First Pass Yield; as que
 * ficaram sem nenhum erro são o numerador.
 */

/* A casa não tem data própria: cada parede é conferida no seu dia.
   Ver migration 020. */
export interface Auditoria {
  /** O adaptador legado identifica a casa por projeto + número da casa. */
  id: string;
  projeto: string;
  casa: string;
  observacao: string | null;
  created_at: string;
}

export interface ParedeInspecionada {
  id: string;
  auditoria_id: string;
  parede: string;
  /** dia em que ESTA parede foi conferida */
  data: string;
}

export interface ErroDaAuditoria {
  id: string;
  parede: string;
  setor: string;
  tipo_erro: string;
  ocorrencia: string;
  criticidade: Criticidade;
  status: Status;
}

/**
 * NA — item NÃO APLICÁVEL àquela parede.
 *
 * Fica em tabela separada das ocorrências de propósito: NA não é erro.
 * Uma parede só com NA continua passando de primeira, e nenhum
 * indicador de defeito o enxerga. Ver migration 023.
 */
export interface NaDaAuditoria {
  id: string;
  parede: string;
  tipo_erro: string;
  observacao: string | null;
}

export type SituacaoParede = "NAO_INSPECIONADA" | "OK" | "COM_ERROS";

export function situacaoDaParede(
  parede: string,
  inspecionadas: Set<string>,
  erros: ErroDaAuditoria[]
): SituacaoParede {
  const temErro = erros.some((e) => e.parede === parede);
  if (temErro) return "COM_ERROS";
  return inspecionadas.has(parede) ? "OK" : "NAO_INSPECIONADA";
}

export interface ResumoAuditoria {
  total: number;
  inspecionadas: number;
  ok: number;
  comErros: number;
  erros: number;
  /** FPY desta casa: paredes sem nenhum erro ÷ paredes inspecionadas */
  fpy: number | null;
  /** true = tinha parede limpa, mas a regra da casa zerou mesmo assim */
  zeradaPelaRegra: boolean;
}

export interface ContagemNa {
  nome: string;
  qtd: number;
}

export interface ResumoNas {
  total: number;
  /** quantas paredes distintas têm ao menos um NA */
  paredes: number;
  porTipo: ContagemNa[];
  porParede: ContagemNa[];
}

/** Os NAs da casa somados por item e por parede, do maior para o menor. */
export function resumoDosNas(nas: NaDaAuditoria[]): ResumoNas {
  const conta = (chave: (n: NaDaAuditoria) => string) => {
    const m = new Map<string, number>();
    for (const n of nas) m.set(chave(n), (m.get(chave(n)) ?? 0) + 1);
    return [...m]
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR"));
  };
  const porParede = conta((n) => n.parede);
  return {
    total: nas.length,
    paredes: porParede.length,
    porTipo: conta((n) => n.tipo_erro),
    porParede,
  };
}

export function resumoAuditoria(
  paredesDoProjeto: string[],
  inspecionadas: Set<string>,
  erros: ErroDaAuditoria[],
  regra: RegraFpy = REGRA_FPY_PADRAO
): ResumoAuditoria {
  const comErros = new Set(erros.map((e) => e.parede));
  // uma parede com erro está inspecionada por definição
  const conferidas = new Set([...inspecionadas, ...comErros]);
  const ok = [...conferidas].filter((p) => !comErros.has(p)).length;
  return {
    total: paredesDoProjeto.length,
    inspecionadas: conferidas.size,
    ok,
    comErros: comErros.size,
    erros: erros.length,
    // mesma função do painel: FPY não pode divergir entre as duas telas
    fpy: fpyDaCasa(conferidas.size, comErros.size, regra),
    zeradaPelaRegra: fpyDaCasa(conferidas.size, comErros.size, regra) === 0 && ok > 0,
  };
}
