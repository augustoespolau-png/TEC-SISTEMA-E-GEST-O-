import { createClient } from "@/lib/supabase/client";

/*
 * As regras de negócio da qualidade, num lugar só.
 *
 * Este arquivo existe por causa de um defeito real: o FPY era calculado
 * em três pontos do sistema — o painel, a lista de casas auditadas e a
 * tela da auditoria aberta — e a regra "casa com N paredes afetadas zera
 * o FPY" tinha sido escrita só no primeiro. A casa 142 aparecia zerada no
 * painel e com 50% na Auditoria, ao mesmo tempo.
 *
 * Regra nova entra AQUI e vale nas três telas. Se algum dia o FPY
 * divergir de novo entre duas telas, é porque alguém calculou por fora
 * deste arquivo.
 */

export interface RegraFpy {
  ativa: boolean;
  /** a partir de quantas PAREDES AFETADAS a casa tem o FPY zerado */
  minParedesAfetadas: number;
}

export interface Regras {
  /** a regra geral, usada por projeto que não diga o contrário */
  fpy: RegraFpy;
  /** alvo de FPY, para a cor do número e a linha do gráfico */
  meta: number;
  /** projeto -> a regra dele; ver migration 022 */
  porProjeto: Record<string, RegraFpy>;
}

/** Vale enquanto os parâmetros não chegam do banco. */
export const REGRA_FPY_PADRAO: RegraFpy = {
  ativa: true,
  minParedesAfetadas: 6,
};
export const REGRAS_PADRAO: Regras = {
  fpy: REGRA_FPY_PADRAO,
  meta: 70,
  porProjeto: {},
};

/**
 * A regra que vale para um projeto.
 *
 * O zeramento pesa muito diferente conforme o tamanho da casa: 6 paredes
 * afetadas são metade de uma casa do C4A (12 paredes) e 6% da escola
 * (101). Por isso cada projeto diz se entra na regra — ver migration 022.
 */
export function regraDoProjeto(
  regras: Regras,
  projeto: string | null | undefined
): RegraFpy {
  if (!projeto) return regras.fpy;
  return regras.porProjeto[projeto.trim()] ?? regras.fpy;
}

/**
 * A casa perde o FPY?
 *
 * A unidade é parede afetada, não erro. Oito erros concentrados em duas
 * paredes não zeram a casa; seis erros espalhados por seis paredes zeram.
 * A leitura é de espalhamento — meia casa comprometida —, não de volume.
 */
export function casaZeraOFpy(
  paredesAfetadas: number,
  regra: RegraFpy = REGRA_FPY_PADRAO
): boolean {
  return regra.ativa && paredesAfetadas >= regra.minParedesAfetadas;
}

/**
 * FPY de uma casa, já com a regra aplicada.
 *
 * `conferidas` é o denominador (paredes olhadas) e `afetadas` são as que
 * tiveram pelo menos um erro. Devolve null quando não há parede conferida
 * — sem denominador não existe indicador, e mostrar 0% ali seria mentira.
 */
export function fpyDaCasa(
  conferidas: number,
  afetadas: number,
  regra: RegraFpy = REGRA_FPY_PADRAO
): number | null {
  if (conferidas === 0) return null;
  if (casaZeraOFpy(afetadas, regra)) return 0;
  return Math.round(((conferidas - afetadas) / conferidas) * 100);
}

/** Lê os parâmetros do banco. Toda tela que mostra FPY chama isto. */
export async function carregarRegras(): Promise<Regras> {
  const supabase = createClient();
  const [par, proj] = await Promise.all([
    supabase.from("parametros").select("chave, valor, ativo"),
    supabase.from("projetos").select("nome, fpy_regra_ativa"),
  ]);
  const r: Regras = {
    fpy: { ...REGRA_FPY_PADRAO },
    meta: REGRAS_PADRAO.meta,
    porProjeto: {},
  };
  for (const p of (par.data ?? []) as {
    chave: string;
    valor: number;
    ativo: boolean;
  }[]) {
    if (p.chave === "fpy_min_paredes_afetadas")
      r.fpy = { ativa: p.ativo, minParedesAfetadas: Number(p.valor) };
    if (p.chave === "fpy_meta" && p.ativo) r.meta = Number(p.valor);
  }
  /* O projeto só consegue DESLIGAR o zeramento para si; o limite continua
     sendo um número só, definido em Configurações. */
  for (const p of (proj.data ?? []) as {
    nome: string;
    fpy_regra_ativa: boolean;
  }[])
    r.porProjeto[p.nome.trim()] = {
      ...r.fpy,
      ativa: r.fpy.ativa && p.fpy_regra_ativa,
    };
  return r;
}
