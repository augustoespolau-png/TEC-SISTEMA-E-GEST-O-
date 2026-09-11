export type Role = "operador" | "consultor" | "gestao";
export type Criticidade = "CRITICO" | "MEDIO" | "BAIXO";
export type Status =
  | "AGUARDANDO"
  | "RETRABALHO_PENDENTE"
  | "RETRABALHO"
  | "NAO_CONFORMIDADE"
  | "BLOQUEADA";

export const CRITICIDADES: Criticidade[] = ["CRITICO", "MEDIO", "BAIXO"];
export const STATUSES: Status[] = [
  "AGUARDANDO",
  "RETRABALHO_PENDENTE",
  "RETRABALHO",
  "NAO_CONFORMIDADE",
  "BLOQUEADA",
];

/**
 * Status que ainda exigem que a PRODUÇÃO faça algo.
 * RETRABALHO_PENDENTE não entra: a produção já fez a parte dela, o que
 * falta é a gestão aprovar.
 */
export const STATUS_ABERTOS: Status[] = [
  "AGUARDANDO",
  "NAO_CONFORMIDADE",
  "BLOQUEADA",
];

/** Nada aqui está encerrado: ou falta executar, ou falta aprovar. */
export const STATUS_NAO_RESOLVIDOS: Status[] = [
  ...STATUS_ABERTOS,
  "RETRABALHO_PENDENTE",
];

/*
 * O NOME DO BANCO E O NOME DA TELA SÃO COISAS DIFERENTES.
 *
 * A fábrica passou a chamar de "erro" o que estava em aberto e de
 * "retrabalhado" o que já foi corrigido. Trocamos só o rótulo: o enum
 * do Postgres continua AGUARDANDO e RETRABALHO, e com ele continuam
 * valendo as 407 linhas gravadas, os gatilhos, a regra das 48 h e o
 * histórico de alterações. Renomear o enum seria migration em cascata
 * para ganhar exatamente nada.
 */
export const ROTULO_STATUS: Record<Status, string> = {
  AGUARDANDO: "COM DESVIO",
  RETRABALHO_PENDENTE: "RETRABALHO A APROVAR",
  RETRABALHO: "RETRABALHADO",
  NAO_CONFORMIDADE: "SEM DEVOLUTIVA",
  BLOQUEADA: "BLOQUEADA",
};

/** Rótulo curto, para chips de filtro e legendas apertadas. */
export const ROTULO_STATUS_CURTO: Record<Status, string> = {
  AGUARDANDO: "COM DESVIO",
  RETRABALHO_PENDENTE: "A APROVAR",
  RETRABALHO: "RETRABALHADO",
  NAO_CONFORMIDADE: "S/ DEVOLUTIVA",
  BLOQUEADA: "BLOQUEADA",
};

/** Horas até um erro em aberto virar não conformidade. */
export const PRAZO_HORAS = 48;

export interface Profile {
  id: string;
  nome: string;
  role: Role;
}

export interface ConfigItem {
  id: number;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface Parede extends ConfigItem {
  projeto_id: number;
  /** metragem da posição, em m². Nula = ainda não levantada (migration 024) */
  area_m2: number | null;
}

export interface Ocorrencia {
  /** A base nova usa números; o adaptador da base legada usa texto. */
  id: string | number;
  data: string;
  projeto: string;
  parede: string;
  casa: string;
  setor: string;
  tipo_erro: string;
  ocorrencia: string;
  criticidade: Criticidade;
  status: Status;
  observacao: string | null;
  resolved_at: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  criador?: { nome: string } | null;
  aprovador?: { nome: string } | null;
}

/** Uma linha do log de atividade: um campo alterado, com autor. */
export interface LogItem {
  id: number;
  criado_em: string;
  tabela: string;
  registro_id: string | number | null;
  acao: "INSERT" | "UPDATE" | "DELETE";
  campo: string | null;
  de: string | null;
  para: string | null;
  rotulo: string | null;
  autor: string | null;
  autor_nome: string;
  autor_papel: string;
}

export const ROTULO_TABELA: Record<string, string> = {
  ocorrencias: "Erro",
  auditorias: "Auditoria",
  auditoria_paredes: "Parede auditada",
  projetos: "Projeto",
  paredes: "Parede (config.)",
  setores: "Setor",
  tipos_erro: "Tipo de erro",
};

export const ROTULO_CAMPO: Record<string, string> = {
  status: "situação",
  observacao: "observação",
  criticidade: "criticidade",
  resolved_at: "data do retrabalho",
  aprovado_por: "aprovação",
  aprovado_em: "data da aprovação",
  auto_nc: "conversão automática",
  tipo_erro: "tipo de erro",
  ocorrencia: "descrição",
  setor: "setor",
  parede: "parede",
  casa: "casa",
  projeto: "projeto",
  data: "data do erro",
  nome: "nome",
  ativo: "ativo",
  ordem: "ordem",
  auditoria_id: "auditoria",
};
