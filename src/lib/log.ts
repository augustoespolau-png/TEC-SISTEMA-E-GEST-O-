import {
  ROTULO_CAMPO,
  ROTULO_STATUS,
  ROTULO_TABELA,
  type LogItem,
  type Status,
} from "@/lib/types";

/*
 * Tradução do log de atividade para português de gente.
 *
 * O banco guarda a alteração crua (campo, de, para) porque é isso que
 * resiste ao tempo: se amanhã um rótulo mudar, a trilha antiga continua
 * verdadeira. A leitura bonita é feita aqui, na hora de mostrar.
 */

const FMT_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function quando(iso: string): string {
  return FMT_HORA.format(new Date(iso)).replace(",", " ·");
}

const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Deixa o valor cru legível sem inventar informação que não está lá. */
export function valorLegivel(campo: string | null, valor: string | null): string {
  if (valor === null || valor === "") return "—";
  if (campo === "status") return ROTULO_STATUS[valor as Status] ?? valor;
  if (valor === "true") return "sim";
  if (valor === "false") return "não";
  if (RE_UUID.test(valor)) return "usuário";
  if (RE_TIMESTAMP.test(valor)) return quando(valor.replace(" ", "T"));
  if (RE_DATA.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  if (valor.length > 90) return valor.slice(0, 90) + "…";
  return valor;
}

export function nomeCampo(campo: string | null): string {
  if (!campo) return "";
  return ROTULO_CAMPO[campo] ?? campo.replace(/_/g, " ");
}

export function nomeTabela(tabela: string): string {
  return ROTULO_TABELA[tabela] ?? tabela;
}

export const ROTULO_ACAO: Record<LogItem["acao"], string> = {
  INSERT: "criou",
  UPDATE: "alterou",
  DELETE: "excluiu",
};

/** Uma frase única descrevendo a linha do log. */
export function frase(l: LogItem): string {
  const alvo = `${nomeTabela(l.tabela).toLowerCase()}${l.rotulo ? ` ${l.rotulo}` : ""}`;
  if (l.acao === "INSERT") return `criou ${alvo}`;
  if (l.acao === "DELETE") return `excluiu ${alvo}`;
  return `mudou ${nomeCampo(l.campo)} de ${valorLegivel(
    l.campo,
    l.de
  )} para ${valorLegivel(l.campo, l.para)}`;
}

export const COLUNAS_LOG =
  "id, criado_em, tabela, registro_id, acao, campo, de, para, rotulo, autor, autor_nome, autor_papel";
