import type { ParedeConferida } from "@/lib/dashboard";
import { ROTULO_STATUS, type Ocorrencia } from "@/lib/types";

/**
 * Linha exportável da tela Consultar. Erros e paredes que passaram de
 * primeira convivem no mesmo relatório para representar todo o histórico
 * de qualidade do recorte selecionado.
 */
export type LinhaExportada =
  | { especie: "erro"; erro: Ocorrencia }
  | { especie: "ok"; parede: ParedeConferida };

export interface ContextoRelatorioExcel {
  projeto?: string | null;
  casa?: string | null;
  periodo?: string | null;
  situacao?: string | null;
  setor?: string | null;
  total?: number;
}

type ValorExcel = string | number | Date | null;

type ColunaExcel = {
  titulo: string;
  largura: number;
  formato?: string;
  de: (l: LinhaExportada) => ValorExcel;
};

const TITULO_RELATORIO =
  "TECVERDE — RELATÓRIO DE OCORRÊNCIAS E HISTÓRICO DA QUALIDADE";

const COLUNAS: ColunaExcel[] = [
  { titulo: "Data", largura: 13, formato: "dd/mm/yyyy", de: (l) => dataExcel(campo(l, "data")) },
  { titulo: "Projeto", largura: 34, de: (l) => campo(l, "projeto") },
  { titulo: "Casa", largura: 10, de: (l) => campo(l, "casa") },
  { titulo: "Parede", largura: 12, de: (l) => campo(l, "parede") },
  { titulo: "Setor", largura: 23, de: (l) => (l.especie === "erro" ? l.erro.setor : "") },
  { titulo: "Tipo de erro", largura: 28, de: (l) => (l.especie === "erro" ? l.erro.tipo_erro : "") },
  {
    titulo: "Criticidade",
    largura: 14,
    de: (l) => (l.especie === "erro" ? rotuloCriticidade(l.erro.criticidade) : ""),
  },
  {
    titulo: "Situação",
    largura: 22,
    de: (l) =>
      l.especie === "erro"
        ? (ROTULO_STATUS[l.erro.status] ?? l.erro.status)
        : "PAREDE OK",
  },
  {
    titulo: "Ocorrência",
    largura: 52,
    de: (l) =>
      l.especie === "erro"
        ? l.erro.ocorrencia
        : "Passou de primeira, sem nenhum erro registrado",
  },
  {
    titulo: "Observação",
    largura: 48,
    de: (l) =>
      l.especie === "erro"
        ? (l.erro.observacao ?? "")
        : l.parede.reconstruida
          ? "Auditoria deduzida do histórico"
          : "",
  },
  {
    titulo: "Área (m²)",
    largura: 13,
    formato: "0.00",
    de: (l) =>
      l.especie === "ok" && l.parede.area_m2 != null
        ? Number(l.parede.area_m2)
        : null,
  },
  {
    titulo: "Data do retrabalho",
    largura: 21,
    formato: "dd/mm/yyyy hh:mm",
    de: (l) => (l.especie === "erro" ? dataHoraExcel(l.erro.resolved_at) : null),
  },
  {
    titulo: "Aprovado em",
    largura: 21,
    formato: "dd/mm/yyyy hh:mm",
    de: (l) => (l.especie === "erro" ? dataHoraExcel(l.erro.aprovado_em) : null),
  },
  {
    titulo: "Registrado por",
    largura: 24,
    de: (l) => (l.especie === "erro" ? (l.erro.criador?.nome ?? "") : ""),
  },
  {
    titulo: "Registrado em",
    largura: 21,
    formato: "dd/mm/yyyy hh:mm",
    de: (l) => (l.especie === "erro" ? dataHoraExcel(l.erro.created_at) : null),
  },
  {
    titulo: "Nº do registro",
    largura: 20,
    de: (l) => (l.especie === "erro" ? String(l.erro.id) : ""),
  },
];

function campo(
  l: LinhaExportada,
  nome: "data" | "projeto" | "casa" | "parede"
): string {
  return (l.especie === "erro" ? l.erro[nome] : l.parede[nome]) ?? "";
}

function dataExcel(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const partes = valor.slice(0, 10).split("-").map(Number);
  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n))) return null;
  const [ano, mes, dia] = partes;
  return new Date(ano, mes - 1, dia, 12, 0, 0, 0);
}

/** timestamptz do banco → Date com os componentes do fuso da fábrica. */
function dataHoraExcel(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const original = new Date(valor);
  if (Number.isNaN(original.getTime())) return null;

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(original);
  const numero = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return new Date(
    numero("year"),
    numero("month") - 1,
    numero("day"),
    numero("hour"),
    numero("minute"),
    0,
    0
  );
}

const rotuloCriticidade = (c: string) =>
  c === "CRITICO" ? "Crítico" : c === "MEDIO" ? "Médio" : "Baixo";

function textoSeguro(v: unknown): string {
  return String(v ?? "").replace(/\r?\n/g, " ").trim();
}

function periodoDosItens(itens: LinhaExportada[]): string {
  const datas = itens
    .map((item) => campo(item, "data").slice(0, 10))
    .filter(Boolean)
    .sort();
  if (!datas.length) return "Sem período";
  const br = (v: string) => v.split("-").reverse().join("/");
  return datas[0] === datas[datas.length - 1]
    ? br(datas[0])
    : `${br(datas[0])} a ${br(datas[datas.length - 1])}`;
}

function emitidoEm(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

async function carregarLogoBase64(): Promise<string | null> {
  try {
    const resposta = await fetch("/logo-claro.png", { cache: "force-cache" });
    if (!resposta.ok) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    let binario = "";
    const bloco = 0x8000;
    for (let i = 0; i < bytes.length; i += bloco) {
      binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
    }
    return `data:image/png;base64,${btoa(binario)}`;
  } catch {
    return null;
  }
}

/**
 * Gera o XLSX oficial da Qualidade. O módulo é importado sob demanda para
 * não aumentar o carregamento inicial da tela Consultar.
 */
export async function montarExcel(
  itens: LinhaExportada[],
  contexto: ContextoRelatorioExcel = {}
): Promise<Uint8Array> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Tecverde — Sistema de Gestão da Qualidade";
  workbook.company = "Tecverde";
  workbook.subject = TITULO_RELATORIO;
  workbook.title = TITULO_RELATORIO;
  workbook.created = new Date();

  const aba = workbook.addWorksheet("Ocorrências", {
    properties: { defaultRowHeight: 20 },
    views: [{ state: "frozen", xSplit: 0, ySplit: 6 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  const ultimaColuna = COLUNAS.length;
  const ultimaLetra = aba.getColumn(ultimaColuna).letter;

  aba.mergeCells(`C1:${ultimaLetra}2`);
  const titulo = aba.getCell("C1");
  titulo.value = TITULO_RELATORIO;
  titulo.font = { name: "Aptos", size: 18, bold: true, color: { argb: "FF1D3B2A" } };
  titulo.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  aba.mergeCells(`C3:${ultimaLetra}3`);
  const subtitulo = aba.getCell("C3");
  subtitulo.value = "QUALIDADE · HISTÓRICO RASTREÁVEL DE AUDITORIAS E OCORRÊNCIAS";
  subtitulo.font = { name: "Aptos", size: 9, bold: true, color: { argb: "FF668071" } };
  subtitulo.alignment = { vertical: "middle", horizontal: "left" };

  const logo = await carregarLogoBase64();
  if (logo) {
    const idLogo = workbook.addImage({ base64: logo, extension: "png" });
    aba.addImage(idLogo, { tl: { col: 0.1, row: 0.15 }, ext: { width: 118, height: 46 } });
  } else {
    aba.mergeCells("A1:B3");
    const marca = aba.getCell("A1");
    marca.value = "TECVERDE";
    marca.font = { name: "Aptos", size: 16, bold: true, color: { argb: "FF1F6B45" } };
    marca.alignment = { vertical: "middle", horizontal: "center" };
  }

  const projeto = textoSeguro(contexto.projeto) || "Todos os projetos";
  const periodo = textoSeguro(contexto.periodo) || periodoDosItens(itens);
  const situacao = textoSeguro(contexto.situacao) || "Todas as situações";
  const total = contexto.total ?? itens.length;

  const meta = [
    `Projeto: ${projeto}${contexto.casa ? ` · Casa: ${textoSeguro(contexto.casa)}` : ""}`,
    `Período: ${periodo}`,
    `Situação: ${situacao}${contexto.setor ? ` · Setor: ${textoSeguro(contexto.setor)}` : ""}`,
    `${total.toLocaleString("pt-BR")} registros · Emitido em ${emitidoEm()}`,
  ];
  const grupos = [
    ["A4", "D4"],
    ["E4", "H4"],
    ["I4", "L4"],
    ["M4", `${ultimaLetra}4`],
  ] as const;
  grupos.forEach(([inicio, fim], indice) => {
    aba.mergeCells(`${inicio}:${fim}`);
    const cel = aba.getCell(inicio);
    cel.value = meta[indice];
    cel.font = { name: "Aptos", size: 9, bold: indice === 0, color: { argb: "FF40554A" } };
    cel.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F7F4" } };
    cel.border = { bottom: { style: "thin", color: { argb: "FFD7E2DC" } } };
  });

  aba.getRow(1).height = 25;
  aba.getRow(2).height = 25;
  aba.getRow(3).height = 20;
  aba.getRow(4).height = 28;
  aba.getRow(5).height = 8;

  const cabecalho = aba.getRow(6);
  cabecalho.values = COLUNAS.map((c) => c.titulo);
  cabecalho.height = 30;
  cabecalho.eachCell((cel) => {
    cel.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6B45" } };
    cel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cel.border = {
      top: { style: "thin", color: { argb: "FF174F34" } },
      left: { style: "thin", color: { argb: "FF174F34" } },
      bottom: { style: "thin", color: { argb: "FF174F34" } },
      right: { style: "thin", color: { argb: "FF174F34" } },
    };
  });

  COLUNAS.forEach((coluna, i) => {
    const col = aba.getColumn(i + 1);
    col.width = coluna.largura;
    if (coluna.formato) col.numFmt = coluna.formato;
  });

  itens.forEach((item, indice) => {
    const linha = aba.addRow(COLUNAS.map((c) => c.de(item)));
    linha.height = 31;
    linha.eachCell({ includeEmpty: true }, (cel, numeroColuna) => {
      cel.font = { name: "Aptos", size: 9, color: { argb: "FF26382F" } };
      cel.alignment = {
        vertical: "top",
        horizontal: numeroColuna === 3 || numeroColuna === 4 || numeroColuna === 7 || numeroColuna === 8 || numeroColuna === 11
          ? "center"
          : "left",
        wrapText: true,
      };
      cel.border = {
        bottom: { style: "hair", color: { argb: "FFDCE5E0" } },
        right: { style: "hair", color: { argb: "FFEEF2F0" } },
      };
      if (indice % 2 === 1) {
        cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAFCFB" } };
      }
    });

    const criticidade = textoSeguro(linha.getCell(7).value).toUpperCase();
    const situacaoLinha = textoSeguro(linha.getCell(8).value).toUpperCase();
    const celCrit = linha.getCell(7);
    const celSit = linha.getCell(8);

    if (criticidade === "CRÍTICO") {
      celCrit.font = { ...celCrit.font, bold: true, color: { argb: "FFB42318" } };
      celCrit.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDECEC" } };
    } else if (criticidade === "MÉDIO") {
      celCrit.font = { ...celCrit.font, bold: true, color: { argb: "FF9A6700" } };
      celCrit.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF5D6" } };
    } else if (criticidade === "BAIXO") {
      celCrit.font = { ...celCrit.font, bold: true, color: { argb: "FF237A57" } };
    }

    const corSituacao = situacaoLinha === "PAREDE OK" || situacaoLinha === "RETRABALHADO"
      ? { fundo: "FFEAF7F0", texto: "FF237A57" }
      : situacaoLinha === "SEM DEVOLUTIVA" || situacaoLinha === "COM DESVIO"
        ? { fundo: "FFFDECEC", texto: "FFB42318" }
        : situacaoLinha === "BLOQUEADA"
          ? { fundo: "FFF0F1F2", texto: "FF4B5563" }
          : situacaoLinha === "RETRABALHO A APROVAR"
            ? { fundo: "FFFFF5D6", texto: "FF9A6700" }
            : null;
    if (corSituacao) {
      celSit.fill = { type: "pattern", pattern: "solid", fgColor: { argb: corSituacao.fundo } };
      celSit.font = { ...celSit.font, bold: true, color: { argb: corSituacao.texto } };
    }
  });

  const ultimaLinha = 6 + itens.length;
  aba.autoFilter = { from: { row: 6, column: 1 }, to: { row: ultimaLinha, column: ultimaColuna } };
  aba.pageSetup.printTitlesRow = "1:6";
  aba.headerFooter.oddFooter =
    "&LTecverde · Sistema de Gestão da Qualidade&CRelatório de Ocorrências&RPage &P de &N";
  aba.headerFooter.evenFooter = aba.headerFooter.oddFooter;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function nomeDoArquivoExcel(partes: string[], hoje: string): string {
  const pedaco = partes
    .filter(Boolean)
    .map((p) =>
      p
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
    )
    .filter(Boolean)
    .join("-");
  return `tecverde-relatorio-qualidade-${pedaco ? pedaco + "-" : ""}${hoje}.xlsx`;
}

export async function baixarExcel(
  nome: string,
  itens: LinhaExportada[],
  contexto: ContextoRelatorioExcel = {}
): Promise<void> {
  const bytes = await montarExcel(itens, contexto);
  const arquivo = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const url = URL.createObjectURL(
    new Blob([arquivo], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Compatibilidade temporária com qualquer chamada antiga ainda existente. */
function celulaCsv(v: string): string {
  const t = v.replace(/\r?\n/g, " ").trim();
  return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const PACOTE_XLSX = "__TECVERDE_XLSX__";

export function montarCsv(itens: LinhaExportada[]): string {
  return PACOTE_XLSX + JSON.stringify(itens);
}

export function nomeDoArquivo(partes: string[], hoje: string): string {
  return nomeDoArquivoExcel(partes, hoje);
}

export function baixar(nome: string, conteudo: string) {
  if (conteudo.startsWith(PACOTE_XLSX)) {
    const itens = JSON.parse(conteudo.slice(PACOTE_XLSX.length)) as LinhaExportada[];
    const projetos = [...new Set(itens.map((item) => campo(item, "projeto")).filter(Boolean))];
    const casas = [...new Set(itens.map((item) => campo(item, "casa")).filter(Boolean))];
    const situacoes = [...new Set(itens.map((item) => item.especie === "erro" ? (ROTULO_STATUS[item.erro.status] ?? item.erro.status) : "PAREDE OK"))];
    void baixarExcel(nome.replace(/\.csv$/i, ".xlsx"), itens, {
      projeto: projetos.length === 1 ? projetos[0] : "Todos os projetos",
      casa: casas.length === 1 ? casas[0] : null,
      situacao: situacoes.length === 1 ? situacoes[0] : "Múltiplas situações",
      total: itens.length,
    }).catch((erro) => console.error("Erro ao gerar Excel", erro));
    return;
  }
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
