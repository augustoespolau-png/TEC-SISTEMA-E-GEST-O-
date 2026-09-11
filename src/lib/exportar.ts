import type { ParedeConferida } from "@/lib/dashboard";
import { ROTULO_STATUS, type Ocorrencia } from "@/lib/types";

/*
 * A CONSULTA FILTRADA VIRA PLANILHA.
 *
 * Formato CSV, e não XLSX: o Excel abre os dois, e o XLSX exigiria uma
 * biblioteca de zip só para isso. O que o CSV pede é cuidado com três
 * coisas que estragam a abertura no Excel em português:
 *
 *  1. SEPARADOR PONTO E VÍRGULA. Com vírgula, o Excel configurado em
 *     pt-BR joga a linha inteira numa célula só — a vírgula ali é
 *     separador decimal.
 *  2. BOM no começo. Sem ele o Excel lê o arquivo como ANSI e "PAREDE
 *     LATERAL" vira "PAREDE LATERAL" com acento quebrado.
 *  3. CRLF entre as linhas, que é o que o Excel espera.
 *
 * As datas saem em dd/mm/aaaa: o objetivo é uma planilha que a fábrica
 * lê e reenvia, não um arquivo de intercâmbio entre sistemas.
 */

/*
 * A planilha leva as duas espécies de linha da Consultar: o erro, com
 * tudo o que ele tem, e a parede que passou de primeira, que preenche só
 * as colunas que existem para ela. Fossem dois arquivos, quem recebesse
 * teria de cruzar os dois à mão para ter a produção inteira.
 */
export type LinhaExportada =
  | { especie: "erro"; erro: Ocorrencia }
  | { especie: "ok"; parede: ParedeConferida };

/*
 * Cada coluna sabe se aplicar às duas espécies.
 *
 * A tentação era vestir a parede OK de ocorrência e reaproveitar as
 * colunas — mas aí ela sairia da planilha com uma situação e uma
 * gravidade que ela não tem, e ninguém que abrisse o arquivo saberia
 * que aquilo foi inventado no caminho. Célula que não se aplica sai
 * VAZIA.
 */
const COLUNAS: { titulo: string; de: (l: LinhaExportada) => string }[] = [
  { titulo: "Data", de: (l) => dataBR(campo(l, "data")) },
  { titulo: "Projeto", de: (l) => campo(l, "projeto") },
  { titulo: "Casa", de: (l) => campo(l, "casa") },
  { titulo: "Parede", de: (l) => campo(l, "parede") },
  { titulo: "Setor", de: (l) => (l.especie === "erro" ? l.erro.setor : "") },
  {
    titulo: "Tipo de erro",
    de: (l) => (l.especie === "erro" ? l.erro.tipo_erro : ""),
  },
  {
    titulo: "Criticidade",
    de: (l) => (l.especie === "erro" ? rotuloCriticidade(l.erro.criticidade) : ""),
  },
  {
    titulo: "Situação",
    de: (l) =>
      l.especie === "erro"
        ? (ROTULO_STATUS[l.erro.status] ?? l.erro.status)
        : "PAREDE OK",
  },
  {
    titulo: "Ocorrência",
    de: (l) =>
      l.especie === "erro"
        ? l.erro.ocorrencia
        : "Passou de primeira, sem nenhum erro registrado",
  },
  {
    titulo: "Observação",
    de: (l) =>
      l.especie === "erro"
        ? (l.erro.observacao ?? "")
        : l.parede.reconstruida
          ? "Auditoria deduzida do histórico"
          : "",
  },
  {
    titulo: "Área (m²)",
    de: (l) =>
      l.especie === "ok" && l.parede.area_m2 != null
        ? String(l.parede.area_m2).replace(".", ",")
        : "",
  },
  {
    titulo: "Data do retrabalho",
    de: (l) => (l.especie === "erro" ? dataHoraBR(l.erro.resolved_at) : ""),
  },
  {
    titulo: "Aprovado em",
    de: (l) => (l.especie === "erro" ? dataHoraBR(l.erro.aprovado_em) : ""),
  },
  {
    titulo: "Registrado por",
    de: (l) => (l.especie === "erro" ? (l.erro.criador?.nome ?? "") : ""),
  },
  {
    titulo: "Registrado em",
    de: (l) => (l.especie === "erro" ? dataHoraBR(l.erro.created_at) : ""),
  },
  {
    titulo: "Nº do registro",
    de: (l) => (l.especie === "erro" ? String(l.erro.id) : ""),
  },
];

/** Os quatro campos que as duas espécies têm com o mesmo significado. */
function campo(
  l: LinhaExportada,
  nome: "data" | "projeto" | "casa" | "parede"
): string {
  return (l.especie === "erro" ? l.erro[nome] : l.parede[nome]) ?? "";
}

const dataBR = (d: string | null) =>
  d ? d.slice(0, 10).split("-").reverse().join("/") : "";

/** timestamptz do banco → "dd/mm/aaaa hh:mm" no fuso da fábrica */
function dataHoraBR(t: string | null): string {
  if (!t) return "";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const rotuloCriticidade = (c: string) =>
  c === "CRITICO" ? "Crítico" : c === "MEDIO" ? "Médio" : "Baixo";

/**
 * Uma célula de CSV.
 *
 * Aspas em volta sempre que houver separador, quebra de linha ou aspas
 * dentro — e a aspa de dentro dobrada, que é como o formato escapa. O
 * campo "ocorrência" é texto livre digitado no chão de fábrica: ele tem
 * ponto e vírgula, tem quebra de linha e tem aspas.
 */
function celula(v: string): string {
  const t = v.replace(/\r?\n/g, " ").trim();
  return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function montarCsv(itens: LinhaExportada[]): string {
  const linhas = [
    COLUNAS.map((c) => celula(c.titulo)).join(";"),
    ...itens.map((l) => COLUNAS.map((c) => celula(c.de(l))).join(";")),
  ];
  return "﻿" + linhas.join("\r\n") + "\r\n";
}

/**
 * O nome do arquivo diz o que tem dentro.
 *
 * Um "ocorrencias.csv" na pasta de Downloads, ao lado de outros cinco
 * iguais, não diz de que recorte veio nem quando foi tirado — e a
 * planilha exportada costuma virar anexo de e-mail dias depois.
 */
export function nomeDoArquivo(partes: string[], hoje: string): string {
  const pedaco = partes
    .filter(Boolean)
    .map((p) =>
      p
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
    )
    .join("-");
  return `ocorrencias-${pedaco ? pedaco + "-" : ""}${hoje}.csv`;
}

/** Entrega o arquivo ao navegador. Só isto toca o DOM. */
export function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(
    new Blob([conteudo], { type: "text/csv;charset=utf-8;" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
