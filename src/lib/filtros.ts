import { STATUSES, type ConfigItem } from "@/lib/types";

/*
 * PAREDE OK não é um status do banco.
 *
 * A tabela de ocorrências só guarda o que deu errado; uma parede que
 * passou de primeira não gera linha nenhuma lá — ela existe na
 * auditoria, em fpy_paredes. Aqui ela entra como um status a mais na
 * lista de escolha, e a consulta é que sabe ir buscar noutro lugar.
 *
 * Fica DESMARCADA por padrão: quem abre a Consultar está atrás do que
 * precisa de ação, e as paredes boas são a maioria — ligadas por padrão,
 * elas empurrariam os desvios para a segunda página.
 */
export const PAREDE_OK = "PAREDE_OK";

export interface Filtros {
  /** vários ao mesmo tempo; vazio = nenhum, e a lista sai vazia */
  status: string[];
  projeto: string; // "" = todos
  casa: string;
  criticidade: string; // "" = todas
  setor: string;
  tipo: string;
  parede: string;
  de: string; // data inicial (YYYY-MM-DD)
  ate: string; // data final
  ordem: OrdemKey;
}

export type OrdemKey =
  | "recentes"
  | "antigos"
  | "data_nova"
  | "data_antiga"
  | "criticidade"
  | "casa"
  | "setor";

export const ORDENS: { chave: OrdemKey; rotulo: string }[] = [
  { chave: "recentes", rotulo: "Registrados por último" },
  { chave: "antigos", rotulo: "Registrados primeiro" },
  { chave: "data_nova", rotulo: "Data do erro — mais recente" },
  { chave: "data_antiga", rotulo: "Data do erro — mais antiga" },
  { chave: "criticidade", rotulo: "Criticidade — mais grave" },
  { chave: "casa", rotulo: "Casa" },
  { chave: "setor", rotulo: "Setor" },
];

/** Quantos dias a consulta mostra antes de alguém mexer no filtro. */
export const DIAS_PADRAO = 30;

/** Data de N dias atrás, no fuso de São Paulo, em YYYY-MM-DD. */
export function diasAtras(dias: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const [a, m, d] = hoje.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1, d));
  alvo.setUTCDate(alvo.getUTCDate() - dias);
  return alvo.toISOString().slice(0, 10);
}

/*
 * A consulta abre nos últimos 30 dias.
 *
 * Sem recorte, a tela abria com a base inteira e a primeira página vinha
 * cheia de erro de meses atrás — quem consulta quer ver o que está
 * acontecendo agora. Para ver mais que isso, é só mexer no campo "de".
 *
 * O campo "até" fica vazio de propósito: limitar no dia de hoje
 * esconderia registro lançado com data futura, que existe quando alguém
 * digita a data errada — e some da tela justamente o que precisa ser
 * corrigido.
 */
export const FILTROS_PADRAO: Filtros = {
  status: [...STATUSES],
  projeto: "",
  casa: "",
  criticidade: "",
  setor: "",
  tipo: "",
  parede: "",
  de: diasAtras(DIAS_PADRAO),
  ate: "",
  ordem: "recentes",
};

/**
 * Quantos filtros o usuário aplicou além do status e da ordenação.
 *
 * O período só conta como filtro quando difere do padrão: senão o botão
 * "Limpar" apareceria sempre aceso numa tela que ninguém filtrou.
 */
export function contarFiltrosExtras(f: Filtros): number {
  const extras = [
    f.projeto,
    f.casa,
    f.criticidade,
    f.setor,
    f.tipo,
    f.parede,
  ].filter((v) => v.trim() !== "").length;
  const periodoMudou =
    f.de !== FILTROS_PADRAO.de || f.ate !== FILTROS_PADRAO.ate;
  /* A situação passou a contar. Enquanto era uma escolha só, mexer nela
     era o gesto mais comum da tela e não fazia sentido acender o
     "Limpar" por causa disso; agora que são seis caixas, dá para acabar
     com uma combinação que não devolve nada — e sem o "Limpar" aceso não
     há caminho de volta visível. */
  const situacaoMudou =
    f.status.length !== FILTROS_PADRAO.status.length ||
    f.status.some((s) => !FILTROS_PADRAO.status.includes(s));
  return extras + (periodoMudou ? 1 : 0) + (situacaoMudou ? 1 : 0);
}

/** Todas as opções da escolha de situação, na ordem em que aparecem. */
export const OPCOES_STATUS: string[] = [...STATUSES, PAREDE_OK];

/** Marca/desmarca uma situação sem mexer nas outras. */
export function alternarStatus(atual: string[], s: string): string[] {
  return atual.includes(s)
    ? atual.filter((x) => x !== s)
    : [...atual, s];
}

/** As situações escolhidas que são status de verdade, do banco. */
export function statusDeErro(f: Filtros): string[] {
  return f.status.filter((s) => s !== PAREDE_OK);
}

/**
 * A consulta precisa buscar paredes sem erro?
 *
 * Só quando PAREDE OK está marcada E nenhum filtro que só existe em erro
 * está ligado: uma parede que passou de primeira não tem setor, nem tipo
 * de erro, nem criticidade. Buscá-la com esses filtros ligados devolveria
 * parede boa dentro de um recorte de "erros do setor L", o que seria
 * mentira.
 */
export function querParedesOk(f: Filtros): boolean {
  return (
    f.status.includes(PAREDE_OK) && !f.criticidade && !f.setor && !f.tipo
  );
}

export interface ListasConfig {
  setores: ConfigItem[];
  tipos: ConfigItem[];
  /* As paredes carregam o projeto a que pertencem: "PT 12" existe no C4A
     e na escola, e sao paredes diferentes. Com o filtro de projeto
     escolhido, a lista de paredes mostra so as daquele projeto — senao a
     pessoa escolhe uma parede que nao existe ali e a busca volta vazia
     sem explicar por que. */
  paredes: ParedeConfig[];
  projetos: ConfigItem[];
}

export interface ParedeConfig extends ConfigItem {
  projeto_id: number;
}
