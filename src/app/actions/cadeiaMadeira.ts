"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assinarAnexosEmLote } from "@/lib/anexos";
import { canModule } from "@/lib/governanca-types";
import { getAuthContext, isAccountInactive } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  BUCKET_CADEIA_MADEIRA,
  CADEIA_MADEIRA_PAGE_SIZE,
  CHECKLIST_RECEBIMENTO_MADEIRA,
  checklistRecebimentoVazio,
  LIMITE_UMIDADE_SEGURA,
  MAX_DOCUMENTO_CADEIA_BYTES,
  type CadeiaAnexo,
  type CadeiaFornecedor,
  type CadeiaInspecao,
  type CadeiaLaudo,
  type CadeiaLote,
  type CadeiaMadeiraSnapshot,
  type ChecklistRecebimentoMadeira,
  type ComponenteEnsaioMadeira,
  type StatusLiberacaoMadeira,
  type TipoAnexoCadeia,
  type TipoEnsaioMadeira,
  type TipoLaudoMadeira,
} from "@/lib/cadeiaMadeira";

export type CadeiaActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface CadeiaFornecedorInput {
  id?: string;
  razao_social: string;
  cnpj: string | null;
  homologacao_ativa: boolean;
  certificacao_origem: string | null;
  contato_tecnico_nome: string | null;
  contato_tecnico_email: string | null;
  contato_tecnico_telefone: string | null;
  historico_avaliacao: string | null;
  ativo: boolean;
}

export interface CadeiaLoteInput {
  id?: string;
  fornecedor_id: string;
  numero_nota_fiscal: string;
  volume_m3: number | string;
  data_recebimento: string;
  placa_veiculo: string | null;
  teor_umidade_medio: number | string;
  lote_autoclave: string;
  checklist: ChecklistRecebimentoMadeira;
  status_liberacao: StatusLiberacaoMadeira;
  observacoes: string | null;
  ativo: boolean;
}

export interface CadeiaInspecaoInput {
  id?: string;
  lote_id: string;
  data_inspecao: string;
  tipo_ensaio: TipoEnsaioMadeira;
  componente_ensaiado: ComponenteEnsaioMadeira;
  identificacao_prototipo: string | null;
  norma_procedimento: string | null;
  resultado_tecnico: string | null;
  bitola_nominal: string | null;
  dimensional_conforme: boolean;
  empenamento: boolean;
  fendas_profundas: boolean;
  nos_soltos: boolean;
  manchas_umidade_bolor: boolean;
  resultado: StatusLiberacaoMadeira;
  observacoes: string | null;
}

export interface CadeiaLaudoInput {
  lote_id: string;
  tipo: TipoLaudoMadeira;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  storage_path: string;
  validade_ate: string | null;
  observacoes: string | null;
}

export interface CadeiaAnexoInput {
  lote_id: string;
  inspecao_id: string | null;
  tipo: TipoAnexoCadeia;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  storage_path: string;
  observacoes: string | null;
}

const CAMPO_FORNECEDOR =
  "id, razao_social, cnpj, homologacao_ativa, certificacao_origem, contato_tecnico_nome, contato_tecnico_email, contato_tecnico_telefone, historico_avaliacao, ativo, created_at, updated_at";
const CAMPO_LOTE =
  "id, fornecedor_id, numero_nota_fiscal, volume_m3, data_recebimento, placa_veiculo, teor_umidade_medio, lote_autoclave, checklist, status_liberacao, observacoes, ativo, created_at, updated_at";
const CAMPO_INSPECAO =
  "id, lote_id, data_inspecao, inspetor_id, tipo_ensaio, componente_ensaiado, identificacao_prototipo, norma_procedimento, resultado_tecnico, bitola_nominal, dimensional_conforme, empenamento, fendas_profundas, nos_soltos, manchas_umidade_bolor, resultado, observacoes, created_at, updated_at";
const CAMPO_LAUDO =
  "id, lote_id, tipo, nome_arquivo, mime_type, tamanho_bytes, storage_bucket, storage_path, validade_ate, aprovado, aprovado_por, aprovado_em, observacoes, created_at";
const CAMPO_ANEXO =
  "id, lote_id, inspecao_id, tipo, nome_arquivo, mime_type, tamanho_bytes, storage_bucket, storage_path, observacoes, created_at";
const CAMINHO_CADEIA_RE = /^[a-zA-Z0-9._/-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorText(error: unknown) {
  if (!error) return "Não foi possível concluir a operação na Cadeia da Madeira.";
  if (typeof error === "object") {
    const row = error as Record<string, unknown>;
    const message = typeof row.message === "string" ? row.message : "";
    const code = typeof row.code === "string" ? `código ${row.code}` : "";
    const details = typeof row.details === "string" ? `detalhes: ${row.details}` : "";
    const hint = typeof row.hint === "string" ? `orientação: ${row.hint}` : "";
    if (message || code || details || hint) {
      return [message, code, details, hint].filter(Boolean).join(" · ");
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : "Não foi possível concluir a operação na Cadeia da Madeira.";
}

function falha(error: unknown): { ok: false; error: string } {
  const message = errorText(error);
  if (/row-level security|permission denied|42501|not authorized/i.test(message)) {
    return {
      ok: false,
      error: "Você não tem permissão para alterar a Cadeia da Madeira.",
    };
  }
  return { ok: false, error: message };
}

function texto(value: unknown, label: string, max: number, obrigatorio = false) {
  if (value === null || value === undefined || value === "") {
    if (obrigatorio) throw new Error(label + " é obrigatório.");
    return null;
  }
  if (typeof value !== "string") throw new Error(label + " inválido.");
  const result = value.trim().replace(/\s+/g, " ");
  if (obrigatorio && !result) throw new Error(label + " é obrigatório.");
  if (result.length > max) throw new Error(label + " deve ter até " + max + " caracteres.");
  return result || null;
}

function uuid(value: unknown, label: string) {
  if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
    throw new Error(label + " inválido.");
  }
  return value.trim();
}

function data(value: unknown, label: string, obrigatoria = true) {
  if ((value === null || value === undefined || value === "") && !obrigatoria) {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(label + " inválida.");
  }
  const [ano, mes, dia] = value.split("-").map(Number);
  const date = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    date.getUTCFullYear() !== ano ||
    date.getUTCMonth() !== mes - 1 ||
    date.getUTCDate() !== dia
  ) {
    throw new Error(label + " inválida.");
  }
  return value;
}

function numero(value: unknown, label: string, max: number) {
  const result =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/\s/g, "").replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(result) || result < 0 || result > max) {
    throw new Error(label + " deve ser um número válido.");
  }
  return result;
}

function booleano(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(label + " inválido.");
  return value;
}

function normalizarChecklistRecebimento(value: unknown): ChecklistRecebimentoMadeira {
  if (
    value !== null &&
    value !== undefined &&
    (typeof value !== "object" || Array.isArray(value))
  ) {
    throw new Error("Checklist da auditoria inválido.");
  }

  const source = (value ?? {}) as Record<string, unknown>;
  const allowed = new Set<string>(
    CHECKLIST_RECEBIMENTO_MADEIRA.map((item) => item.id),
  );
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) {
      throw new Error("Checklist da auditoria contém um item não reconhecido.");
    }
  }

  const checklist = checklistRecebimentoVazio();
  for (const item of CHECKLIST_RECEBIMENTO_MADEIRA) {
    const raw = source[item.id];
    if (raw === undefined) continue;
    if (typeof raw !== "boolean") {
      throw new Error(`Checklist: ${item.label} inválido.`);
    }
    checklist[item.id] = raw;
  }
  return checklist;
}

function cnpj(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("CNPJ inválido.");
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) throw new Error("CNPJ deve conter 14 dígitos.");
  return digits;
}

function email(value: unknown) {
  const result = texto(value, "E-mail técnico", 180);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new Error("E-mail técnico inválido.");
  }
  return result?.toLowerCase() ?? null;
}

function status(value: unknown): StatusLiberacaoMadeira {
  if (value !== "APROVADO" && value !== "REPROVADO" && value !== "QUARENTENA") {
    throw new Error("Status de liberação inválido.");
  }
  return value;
}

function tipoEnsaio(value: unknown): TipoEnsaioMadeira {
  if (
    value !== "RECEBIMENTO_MADEIRA" &&
    value !== "ESTRUTURAL_PROTOTIPO" &&
    value !== "DESEMPENHO_PLACA_CIMENTICIA" &&
    value !== "PAINEL_ESTRUTURAL" &&
    value !== "MADEIRA_ESTRUTURAL" &&
    value !== "OUTRO"
  ) {
    throw new Error("Tipo de ensaio inválido.");
  }
  return value;
}

function componenteEnsaio(value: unknown): ComponenteEnsaioMadeira {
  if (
    value !== "MADEIRA_ESTRUTURAL" &&
    value !== "PLACA_CIMENTICIA" &&
    value !== "PAINEL_ESTRUTURAL" &&
    value !== "PROTOTIPO_COMPLETO" &&
    value !== "LIGACAO_FIXACAO" &&
    value !== "OUTRO"
  ) {
    throw new Error("Componente ensaiado inválido.");
  }
  return value;
}

function tipoLaudo(value: unknown): TipoLaudoMadeira {
  if (value !== "LAUDO_TECNICO" && value !== "CERTIFICADO_CONFORMIDADE") {
    throw new Error("Tipo de documento inválido.");
  }
  return value;
}

function tipoAnexo(value: unknown): TipoAnexoCadeia {
  if (value !== "FOTO_INSPECAO" && value !== "MTR") {
    throw new Error("Tipo de anexo inválido.");
  }
  return value;
}

function segmentoAnexo(tipo: TipoAnexoCadeia) {
  return tipo === "FOTO_INSPECAO" ? "fotos-inspecao" : "mtr";
}

function normalizarFornecedor(input: CadeiaFornecedorInput, exigirId = false) {
  const id = input.id ? uuid(input.id, "Fornecedor") : null;
  if (exigirId && !id) throw new Error("Fornecedor não informado.");
  return {
    id,
    razao_social: texto(input.razao_social, "Razão Social", 180, true),
    cnpj: cnpj(input.cnpj),
    homologacao_ativa: booleano(input.homologacao_ativa, "Homologação ativa"),
    certificacao_origem: texto(input.certificacao_origem, "Certificação / origem", 600),
    contato_tecnico_nome: texto(input.contato_tecnico_nome, "Contato técnico", 160),
    contato_tecnico_email: email(input.contato_tecnico_email),
    contato_tecnico_telefone: texto(input.contato_tecnico_telefone, "Telefone técnico", 40),
    historico_avaliacao: texto(input.historico_avaliacao, "Histórico de avaliação", 5000),
    ativo: booleano(input.ativo, "Status do fornecedor"),
  };
}

function normalizarLote(input: CadeiaLoteInput, exigirId = false) {
  const id = input.id ? uuid(input.id, "Lote") : null;
  if (exigirId && !id) throw new Error("Lote não informado.");
  const umidade = numero(input.teor_umidade_medio, "Teor de umidade", 100);
  const volume = numero(input.volume_m3, "Volume em m³", 1000000);
  if (volume <= 0) throw new Error("Volume em m³ deve ser maior que zero.");
  return {
    id,
    fornecedor_id: uuid(input.fornecedor_id, "Fornecedor"),
    numero_nota_fiscal: texto(input.numero_nota_fiscal, "Nota fiscal", 80, true),
    volume_m3: volume,
    data_recebimento: data(input.data_recebimento, "Data de recebimento"),
    placa_veiculo: texto(input.placa_veiculo, "Placa do veículo", 20),
    teor_umidade_medio: umidade,
    lote_autoclave: texto(input.lote_autoclave, "Lote de autoclave", 120, true),
    checklist: normalizarChecklistRecebimento(input.checklist),
    status_liberacao: status(input.status_liberacao),
    observacoes: texto(input.observacoes, "Observações", 5000),
    ativo: booleano(input.ativo, "Status do lote"),
  };
}

function normalizarInspecao(input: CadeiaInspecaoInput, exigirId = false) {
  const id = input.id ? uuid(input.id, "Inspeção") : null;
  if (exigirId && !id) throw new Error("Inspeção não informada.");
  return {
    id,
    lote_id: uuid(input.lote_id, "Lote"),
    data_inspecao: data(input.data_inspecao, "Data da inspeção"),
    tipo_ensaio: tipoEnsaio(input.tipo_ensaio),
    componente_ensaiado: componenteEnsaio(input.componente_ensaiado),
    identificacao_prototipo: texto(
      input.identificacao_prototipo,
      "Identificação do protótipo",
      240,
    ),
    norma_procedimento: texto(input.norma_procedimento, "Norma / procedimento", 240),
    resultado_tecnico: texto(input.resultado_tecnico, "Resultado técnico", 4000),
    bitola_nominal: texto(input.bitola_nominal, "Bitola nominal", 120),
    dimensional_conforme: booleano(input.dimensional_conforme, "Verificação dimensional"),
    empenamento: booleano(input.empenamento, "Empenamento"),
    fendas_profundas: booleano(input.fendas_profundas, "Fendas profundas"),
    nos_soltos: booleano(input.nos_soltos, "Nós soltos"),
    manchas_umidade_bolor: booleano(input.manchas_umidade_bolor, "Manchas / bolor"),
    resultado: status(input.resultado),
    observacoes: texto(input.observacoes, "Observações", 5000),
  };
}

function validarCaminhoLaudo(pathInput: unknown, actorId: string, loteId: string) {
  if (typeof pathInput !== "string") throw new Error("Caminho do documento inválido.");
  const path = pathInput.trim();
  const prefix = `${BUCKET_CADEIA_MADEIRA}/${actorId}/${loteId}/`;
  const partes = path.split("/");
  if (
    !path.startsWith(prefix) ||
    path.includes("..") ||
    path.length > 500 ||
    !CAMINHO_CADEIA_RE.test(path) ||
    partes.length !== 4 ||
    !partes[3]
  ) {
    throw new Error(
      "Caminho do documento inválido. Use o prefixo cadeia-madeira/<usuário>/<lote>.",
    );
  }
  return path;
}

function validarCaminhoAnexo(
  pathInput: unknown,
  actorId: string,
  loteId: string,
  tipo: TipoAnexoCadeia,
) {
  if (typeof pathInput !== "string") throw new Error("Caminho do anexo inválido.");
  const path = pathInput.trim();
  const prefix = `${BUCKET_CADEIA_MADEIRA}/${actorId}/${loteId}/${segmentoAnexo(tipo)}/`;
  const partes = path.split("/");
  if (
    !path.startsWith(prefix) ||
    path.includes("..") ||
    path.length > 500 ||
    !CAMINHO_CADEIA_RE.test(path) ||
    partes.length !== 5 ||
    !partes[4]
  ) {
    throw new Error("Caminho do anexo inválido.");
  }
  return path;
}

async function acesso(action: "ver" | "editar" | "gerenciar") {
  const contexto = await getAuthContext();
  if (!contexto || !contexto.profile || isAccountInactive(contexto.profile)) {
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  if (!canModule(contexto.permissions, "CADEIA_MADEIRA", action)) {
    throw new Error(
      action === "ver"
        ? "Você não tem permissão para visualizar a Cadeia da Madeira."
        : action === "gerenciar"
          ? "A aprovação formal exige permissão de Gestão da Cadeia da Madeira."
          : "Você não tem permissão para alterar a Cadeia da Madeira.",
    );
  }
  return { supabase: await createClient(), actorId: contexto.user.id };
}

function converterFornecedor(row: Record<string, unknown>): CadeiaFornecedor {
  return {
    id: String(row.id ?? ""),
    razao_social: String(row.razao_social ?? ""),
    cnpj: (row.cnpj as string | null) ?? null,
    homologacao_ativa: Boolean(row.homologacao_ativa),
    certificacao_origem: (row.certificacao_origem as string | null) ?? null,
    contato_tecnico_nome: (row.contato_tecnico_nome as string | null) ?? null,
    contato_tecnico_email: (row.contato_tecnico_email as string | null) ?? null,
    contato_tecnico_telefone: (row.contato_tecnico_telefone as string | null) ?? null,
    historico_avaliacao: (row.historico_avaliacao as string | null) ?? null,
    ativo: Boolean(row.ativo),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function converterLote(
  row: Record<string, unknown>,
  fornecedorNome: string,
): CadeiaLote {
  const statusValue = row.status_liberacao;
  return {
    id: String(row.id ?? ""),
    fornecedor_id: String(row.fornecedor_id ?? ""),
    fornecedor_nome: fornecedorNome,
    numero_nota_fiscal: String(row.numero_nota_fiscal ?? ""),
    volume_m3: Number(row.volume_m3 ?? 0),
    data_recebimento: String(row.data_recebimento ?? ""),
    placa_veiculo: (row.placa_veiculo as string | null) ?? null,
    teor_umidade_medio: Number(row.teor_umidade_medio ?? 0),
    lote_autoclave: String(row.lote_autoclave ?? ""),
    checklist: normalizarChecklistRecebimento(row.checklist),
    status_liberacao:
      statusValue === "APROVADO" || statusValue === "REPROVADO"
        ? statusValue
        : "QUARENTENA",
    observacoes: (row.observacoes as string | null) ?? null,
    ativo: Boolean(row.ativo),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function converterInspecao(
  row: Record<string, unknown>,
  inspetorNome: string,
): CadeiaInspecao {
  const resultado = row.resultado;
  return {
    id: String(row.id ?? ""),
    lote_id: String(row.lote_id ?? ""),
    data_inspecao: String(row.data_inspecao ?? ""),
    inspetor_id: (row.inspetor_id as string | null) ?? null,
    inspetor_nome: inspetorNome,
    tipo_ensaio:
      row.tipo_ensaio === "ESTRUTURAL_PROTOTIPO" ||
      row.tipo_ensaio === "DESEMPENHO_PLACA_CIMENTICIA" ||
      row.tipo_ensaio === "PAINEL_ESTRUTURAL" ||
      row.tipo_ensaio === "MADEIRA_ESTRUTURAL" ||
      row.tipo_ensaio === "OUTRO"
        ? row.tipo_ensaio
        : "RECEBIMENTO_MADEIRA",
    componente_ensaiado:
      row.componente_ensaiado === "PLACA_CIMENTICIA" ||
      row.componente_ensaiado === "PAINEL_ESTRUTURAL" ||
      row.componente_ensaiado === "PROTOTIPO_COMPLETO" ||
      row.componente_ensaiado === "LIGACAO_FIXACAO" ||
      row.componente_ensaiado === "OUTRO"
        ? row.componente_ensaiado
        : "MADEIRA_ESTRUTURAL",
    identificacao_prototipo: (row.identificacao_prototipo as string | null) ?? null,
    norma_procedimento: (row.norma_procedimento as string | null) ?? null,
    resultado_tecnico: (row.resultado_tecnico as string | null) ?? null,
    bitola_nominal: (row.bitola_nominal as string | null) ?? null,
    dimensional_conforme: Boolean(row.dimensional_conforme),
    empenamento: Boolean(row.empenamento),
    fendas_profundas: Boolean(row.fendas_profundas),
    nos_soltos: Boolean(row.nos_soltos),
    manchas_umidade_bolor: Boolean(row.manchas_umidade_bolor),
    resultado:
      resultado === "APROVADO" || resultado === "REPROVADO"
        ? resultado
        : "QUARENTENA",
    observacoes: (row.observacoes as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function converterLaudo(row: Record<string, unknown>, url: string | null): CadeiaLaudo {
  return {
    id: String(row.id ?? ""),
    lote_id: String(row.lote_id ?? ""),
    tipo: row.tipo === "CERTIFICADO_CONFORMIDADE" ? row.tipo : "LAUDO_TECNICO",
    nome_arquivo: String(row.nome_arquivo ?? "Documento"),
    mime_type: String(row.mime_type ?? "application/pdf"),
    tamanho_bytes: Number(row.tamanho_bytes ?? 0),
    storage_bucket: String(row.storage_bucket ?? BUCKET_CADEIA_MADEIRA),
    storage_path: String(row.storage_path ?? ""),
    validade_ate: (row.validade_ate as string | null) ?? null,
    aprovado: Boolean(row.aprovado),
    aprovado_por: (row.aprovado_por as string | null) ?? null,
    aprovado_em: (row.aprovado_em as string | null) ?? null,
    observacoes: (row.observacoes as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    url,
  };
}

function converterAnexo(row: Record<string, unknown>, url: string | null): CadeiaAnexo {
  return {
    id: String(row.id ?? ""),
    lote_id: String(row.lote_id ?? ""),
    inspecao_id: (row.inspecao_id as string | null) ?? null,
    tipo: row.tipo === "MTR" ? "MTR" : "FOTO_INSPECAO",
    nome_arquivo: String(row.nome_arquivo ?? "Anexo"),
    mime_type: String(row.mime_type ?? "application/octet-stream"),
    tamanho_bytes: Number(row.tamanho_bytes ?? 0),
    storage_bucket: String(row.storage_bucket ?? BUCKET_CADEIA_MADEIRA),
    storage_path: String(row.storage_path ?? ""),
    observacoes: (row.observacoes as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    url,
  };
}

async function carregarPessoas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
) {
  const nomes = new Map<string, string>();
  if (!ids.length) return nomes;
  const result = await supabase.from("profiles").select("id, nome").in("id", ids);
  if (!result.error) {
    for (const row of (result.data ?? []) as Array<Record<string, unknown>>) {
      nomes.set(String(row.id), String(row.nome ?? row.id));
    }
  }
  return nomes;
}

async function carregarDetalhes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotes: Array<Record<string, unknown>>,
) {
  const ids = lotes.map((row) => String(row.id));
  if (!ids.length) return { inspecoes: [], laudos: [], anexos: [] };

  const [inspecoesResult, laudosResult, anexosResult] = await Promise.all([
    supabase
      .from("cadeia_madeira_inspecoes")
      .select(CAMPO_INSPECAO)
      .in("lote_id", ids)
      .order("data_inspecao", { ascending: false }),
    supabase
      .from("cadeia_madeira_laudos")
      .select(CAMPO_LAUDO)
      .in("lote_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("cadeia_madeira_anexos")
      .select(CAMPO_ANEXO)
      .in("lote_id", ids)
      .order("created_at", { ascending: false }),
  ]);
  if (inspecoesResult.error) throw new Error(errorText(inspecoesResult.error));
  if (laudosResult.error) throw new Error(errorText(laudosResult.error));
  if (anexosResult.error) throw new Error(errorText(anexosResult.error));

  const inspeccaoRows = (inspecoesResult.data ?? []) as Array<Record<string, unknown>>;
  const laudoRows = (laudosResult.data ?? []) as Array<Record<string, unknown>>;
  const anexoRows = (anexosResult.data ?? []) as Array<Record<string, unknown>>;
  const pessoaIds = [
    ...inspeccaoRows.map((row) => String(row.inspetor_id ?? "")).filter(Boolean),
    ...laudoRows.map((row) => String(row.aprovado_por ?? "")).filter(Boolean),
  ];
  const nomes = await carregarPessoas(supabase, [...new Set(pessoaIds)]);

  let urls = new Map<string, Map<string, string>>();
  try {
    urls = await assinarAnexosEmLote(
      supabase,
      [...laudoRows, ...anexoRows].map((row) => ({
        bucket: String(row.storage_bucket ?? BUCKET_CADEIA_MADEIRA),
        path: String(row.storage_path ?? ""),
      })),
    );
  } catch (error) {
    console.warn("[cadeia-madeira] URLs dos laudos indisponíveis", errorText(error));
  }

  return {
    inspecoes: inspeccaoRows.map((row) =>
      converterInspecao(
        row,
        nomes.get(String(row.inspetor_id ?? "")) ?? String(row.inspetor_id ?? "Não informado"),
      ),
    ),
    laudos: laudoRows.map((row) => {
      const bucket = String(row.storage_bucket ?? BUCKET_CADEIA_MADEIRA);
      const path = String(row.storage_path ?? "");
      return converterLaudo(row, urls.get(bucket)?.get(path) ?? null);
    }),
    anexos: anexoRows.map((row) => {
      const bucket = String(row.storage_bucket ?? BUCKET_CADEIA_MADEIRA);
      const path = String(row.storage_path ?? "");
      return converterAnexo(row, urls.get(bucket)?.get(path) ?? null);
    }),
  };
}

export async function loadCadeiaMadeiraSnapshot(
  requestedPage = 1,
): Promise<CadeiaActionResult<CadeiaMadeiraSnapshot>> {
  try {
    const { supabase } = await acesso("ver");
    const page = Math.max(1, Math.min(10000, Math.floor(Number(requestedPage) || 1)));
    const from = (page - 1) * CADEIA_MADEIRA_PAGE_SIZE;
    const [
      fornecedoresResult,
      lotesResult,
      quarentenaResult,
      umidadeResult,
      pendentesResult,
    ] = await Promise.all([
      supabase.from("cadeia_madeira_fornecedores").select(CAMPO_FORNECEDOR).order("razao_social"),
      supabase
        .from("cadeia_madeira_lotes")
        .select(CAMPO_LOTE, { count: "exact" })
        .eq("ativo", true)
        .order("data_recebimento", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + CADEIA_MADEIRA_PAGE_SIZE - 1),
      supabase
        .from("cadeia_madeira_lotes")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true)
        .eq("status_liberacao", "QUARENTENA"),
      supabase
        .from("cadeia_madeira_lotes")
        .select("id", { count: "exact", head: true })
        .eq("ativo", true)
        .gt("teor_umidade_medio", LIMITE_UMIDADE_SEGURA),
      supabase
        .from("cadeia_madeira_laudos")
        .select("id", { count: "exact", head: true })
        .eq("aprovado", false),
    ]);
    if (fornecedoresResult.error) throw new Error(errorText(fornecedoresResult.error));
    if (lotesResult.error) throw new Error(errorText(lotesResult.error));
    if (quarentenaResult.error) throw new Error(errorText(quarentenaResult.error));
    if (umidadeResult.error) throw new Error(errorText(umidadeResult.error));
    if (pendentesResult.error) throw new Error(errorText(pendentesResult.error));

    const fornecedoresRows = (fornecedoresResult.data ?? []) as Array<Record<string, unknown>>;
    const lotesRows = (lotesResult.data ?? []) as Array<Record<string, unknown>>;
    const fornecedorNomes = new Map(
      fornecedoresRows.map((row) => [String(row.id), String(row.razao_social ?? "Fornecedor")]),
    );
    const detalhes = await carregarDetalhes(supabase, lotesRows);
    const totalLotes = Number(lotesResult.count ?? lotesRows.length);

    return {
      ok: true,
      data: {
        fornecedores: fornecedoresRows.map(converterFornecedor),
        lotes: lotesRows.map((row) =>
          converterLote(row, fornecedorNomes.get(String(row.fornecedor_id)) ?? "Fornecedor não localizado"),
        ),
        inspecoes: detalhes.inspecoes,
        laudos: detalhes.laudos,
        anexos: detalhes.anexos,
        page,
        pageSize: CADEIA_MADEIRA_PAGE_SIZE,
        totalLotes,
        hasNextPage: from + lotesRows.length < totalLotes,
        resumo: {
          fornecedores_ativos: fornecedoresRows.filter((row) => Boolean(row.ativo)).length,
          lotes_total: totalLotes,
          lotes_quarentena: Number(quarentenaResult.count ?? 0),
          lotes_umidade_alta: Number(umidadeResult.count ?? 0),
          laudos_pendentes: Number(pendentesResult.count ?? 0),
        },
      },
    };
  } catch (error) {
    return falha(error);
  }
}

export async function createCadeiaFornecedor(
  input: CadeiaFornecedorInput,
): Promise<CadeiaActionResult<CadeiaFornecedor>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const fornecedor = normalizarFornecedor(input);
    const result = await supabase
      .from("cadeia_madeira_fornecedores")
      .insert({ ...fornecedor, id: randomUUID(), created_by: actorId, updated_by: actorId })
      .select(CAMPO_FORNECEDOR)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: converterFornecedor(result.data as Record<string, unknown>) };
  } catch (error) {
    return falha(error);
  }
}

export async function updateCadeiaFornecedor(
  input: CadeiaFornecedorInput,
): Promise<CadeiaActionResult<CadeiaFornecedor>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const fornecedor = normalizarFornecedor(input, true);
    const result = await supabase
      .from("cadeia_madeira_fornecedores")
      .update({
        razao_social: fornecedor.razao_social,
        cnpj: fornecedor.cnpj,
        homologacao_ativa: fornecedor.homologacao_ativa,
        certificacao_origem: fornecedor.certificacao_origem,
        contato_tecnico_nome: fornecedor.contato_tecnico_nome,
        contato_tecnico_email: fornecedor.contato_tecnico_email,
        contato_tecnico_telefone: fornecedor.contato_tecnico_telefone,
        historico_avaliacao: fornecedor.historico_avaliacao,
        ativo: fornecedor.ativo,
        updated_by: actorId,
      })
      .eq("id", fornecedor.id)
      .select(CAMPO_FORNECEDOR)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: converterFornecedor(result.data as Record<string, unknown>) };
  } catch (error) {
    return falha(error);
  }
}

export async function toggleCadeiaFornecedor(
  idInput: string,
  ativo: boolean,
): Promise<CadeiaActionResult<CadeiaFornecedor>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const id = uuid(idInput, "Fornecedor");
    const result = await supabase
      .from("cadeia_madeira_fornecedores")
      .update({ ativo: booleano(ativo, "Status do fornecedor"), updated_by: actorId })
      .eq("id", id)
      .select(CAMPO_FORNECEDOR)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: converterFornecedor(result.data as Record<string, unknown>) };
  } catch (error) {
    return falha(error);
  }
}

export async function createCadeiaLote(
  input: CadeiaLoteInput,
): Promise<CadeiaActionResult<CadeiaLote>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const lote = normalizarLote(input);
    const fornecedor = await supabase
      .from("cadeia_madeira_fornecedores")
      .select("id, razao_social")
      .eq("id", lote.fornecedor_id)
      .eq("ativo", true)
      .maybeSingle();
    if (fornecedor.error || !fornecedor.data) throw new Error("Fornecedor ativo não encontrado.");
    const result = await supabase
      .from("cadeia_madeira_lotes")
      .insert({ ...lote, id: randomUUID(), created_by: actorId, updated_by: actorId })
      .select(CAMPO_LOTE)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return {
      ok: true,
      data: converterLote(result.data as Record<string, unknown>, String(fornecedor.data.razao_social)),
    };
  } catch (error) {
    return falha(error);
  }
}

export async function updateCadeiaLote(
  input: CadeiaLoteInput,
): Promise<CadeiaActionResult<CadeiaLote>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const lote = normalizarLote(input, true);
    const fornecedor = await supabase
      .from("cadeia_madeira_fornecedores")
      .select("id, razao_social")
      .eq("id", lote.fornecedor_id)
      .maybeSingle();
    if (fornecedor.error || !fornecedor.data) throw new Error("Fornecedor não encontrado.");
    const result = await supabase
      .from("cadeia_madeira_lotes")
      .update({
        fornecedor_id: lote.fornecedor_id,
        numero_nota_fiscal: lote.numero_nota_fiscal,
        volume_m3: lote.volume_m3,
        data_recebimento: lote.data_recebimento,
        placa_veiculo: lote.placa_veiculo,
        teor_umidade_medio: lote.teor_umidade_medio,
        lote_autoclave: lote.lote_autoclave,
        checklist: lote.checklist,
        status_liberacao: lote.status_liberacao,
        observacoes: lote.observacoes,
        ativo: lote.ativo,
        updated_by: actorId,
      })
      .eq("id", lote.id)
      .select(CAMPO_LOTE)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return {
      ok: true,
      data: converterLote(result.data as Record<string, unknown>, String(fornecedor.data.razao_social)),
    };
  } catch (error) {
    return falha(error);
  }
}

export async function createCadeiaInspecao(
  input: CadeiaInspecaoInput,
): Promise<CadeiaActionResult<CadeiaInspecao>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const inspecao = normalizarInspecao(input);
    const lote = await supabase
      .from("cadeia_madeira_lotes")
      .select("id")
      .eq("id", inspecao.lote_id)
      .maybeSingle();
    if (lote.error || !lote.data) throw new Error("Lote não encontrado.");
    const result = await supabase
      .from("cadeia_madeira_inspecoes")
      .insert({ ...inspecao, id: randomUUID(), inspetor_id: actorId, created_by: actorId, updated_by: actorId })
      .select(CAMPO_INSPECAO)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return {
      ok: true,
      data: converterInspecao(result.data as Record<string, unknown>, "Você"),
    };
  } catch (error) {
    return falha(error);
  }
}

export async function updateCadeiaInspecao(
  input: CadeiaInspecaoInput,
): Promise<CadeiaActionResult<CadeiaInspecao>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const inspecao = normalizarInspecao(input, true);
    const result = await supabase
      .from("cadeia_madeira_inspecoes")
      .update({
        data_inspecao: inspecao.data_inspecao,
        tipo_ensaio: inspecao.tipo_ensaio,
        componente_ensaiado: inspecao.componente_ensaiado,
        identificacao_prototipo: inspecao.identificacao_prototipo,
        norma_procedimento: inspecao.norma_procedimento,
        resultado_tecnico: inspecao.resultado_tecnico,
        bitola_nominal: inspecao.bitola_nominal,
        dimensional_conforme: inspecao.dimensional_conforme,
        empenamento: inspecao.empenamento,
        fendas_profundas: inspecao.fendas_profundas,
        nos_soltos: inspecao.nos_soltos,
        manchas_umidade_bolor: inspecao.manchas_umidade_bolor,
        resultado: inspecao.resultado,
        observacoes: inspecao.observacoes,
        updated_by: actorId,
      })
      .eq("id", inspecao.id)
      .select(CAMPO_INSPECAO)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return {
      ok: true,
      data: converterInspecao(result.data as Record<string, unknown>, "Você"),
    };
  } catch (error) {
    return falha(error);
  }
}

export async function registerCadeiaLaudo(
  input: CadeiaLaudoInput,
): Promise<CadeiaActionResult<CadeiaLaudo>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const loteId = uuid(input.lote_id, "Lote");
    const tipo = tipoLaudo(input.tipo);
    const nome = texto(input.nome_arquivo, "Nome do arquivo", 240, true);
    const mime = texto(input.mime_type, "Tipo do arquivo", 120, true)?.toLowerCase();
    const tamanho = numero(input.tamanho_bytes, "Tamanho do arquivo", 20 * 1024 * 1024);
    const validade = data(input.validade_ate, "Validade", false);
    const observacoes = texto(input.observacoes, "Observações", 3000);
    if (
      !mime ||
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mime)
    ) {
      throw new Error("Use PDF, JPEG, PNG ou WebP para o laudo.");
    }
    if (!Number.isInteger(tamanho) || tamanho <= 0) {
      throw new Error("O documento precisa ter entre 1 byte e 20 MB.");
    }
    const path = validarCaminhoLaudo(input.storage_path, actorId, loteId);
    const lote = await supabase
      .from("cadeia_madeira_lotes")
      .select("id")
      .eq("id", loteId)
      .maybeSingle();
    if (lote.error || !lote.data) throw new Error("Lote não encontrado.");
    const result = await supabase
      .from("cadeia_madeira_laudos")
      .insert({
        id: randomUUID(),
        lote_id: loteId,
        tipo,
        nome_arquivo: nome,
        mime_type: mime,
        tamanho_bytes: tamanho,
        storage_bucket: BUCKET_CADEIA_MADEIRA,
        storage_path: path,
        validade_ate: validade,
        observacoes,
        created_by: actorId,
      })
      .select(CAMPO_LAUDO)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: converterLaudo(result.data as Record<string, unknown>, null) };
  } catch (error) {
    return falha(error);
  }
}

export async function registerCadeiaAnexo(
  input: CadeiaAnexoInput,
): Promise<CadeiaActionResult<CadeiaAnexo>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const loteId = uuid(input.lote_id, "Lote");
    const inspecaoId = input.inspecao_id ? uuid(input.inspecao_id, "Inspeção") : null;
    const tipo = tipoAnexo(input.tipo);
    const nome = texto(input.nome_arquivo, "Nome do arquivo", 240, true);
    const mime = texto(input.mime_type, "Tipo do arquivo", 120, true)?.toLowerCase();
    const tamanho = numero(input.tamanho_bytes, "Tamanho do arquivo", MAX_DOCUMENTO_CADEIA_BYTES);
    if (!mime || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(mime)) {
      throw new Error("Use PDF, JPEG, PNG ou WebP para o anexo.");
    }
    if (tipo === "FOTO_INSPECAO" && !mime.startsWith("image/")) {
      throw new Error("A foto da inspeção precisa ser uma imagem.");
    }
    if (!Number.isInteger(tamanho) || tamanho <= 0) {
      throw new Error("O anexo precisa ter entre 1 byte e 20 MB.");
    }
    const path = validarCaminhoAnexo(input.storage_path, actorId, loteId, tipo);
    const lote = await supabase
      .from("cadeia_madeira_lotes")
      .select("id")
      .eq("id", loteId)
      .maybeSingle();
    if (lote.error || !lote.data) throw new Error("Lote não encontrado.");
    if (inspecaoId) {
      const inspecao = await supabase
        .from("cadeia_madeira_inspecoes")
        .select("id, lote_id")
        .eq("id", inspecaoId)
        .maybeSingle();
      if (inspecao.error || !inspecao.data || inspecao.data.lote_id !== loteId) {
        throw new Error("A inspeção não pertence ao lote selecionado.");
      }
    }
    const result = await supabase
      .from("cadeia_madeira_anexos")
      .insert({
        id: randomUUID(),
        lote_id: loteId,
        inspecao_id: inspecaoId,
        tipo,
        nome_arquivo: nome,
        mime_type: mime,
        tamanho_bytes: tamanho,
        storage_bucket: BUCKET_CADEIA_MADEIRA,
        storage_path: path,
        observacoes: texto(input.observacoes, "Observações", 3000),
        created_by: actorId,
      })
      .select(CAMPO_ANEXO)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: converterAnexo(result.data as Record<string, unknown>, null) };
  } catch (error) {
    return falha(error);
  }
}

export async function approveCadeiaLaudo(
  idInput: string,
  aprovado: boolean,
): Promise<CadeiaActionResult<CadeiaLaudo>> {
  try {
    const { supabase, actorId } = await acesso("gerenciar");
    const id = uuid(idInput, "Laudo");
    const result = await supabase
      .from("cadeia_madeira_laudos")
      .update({
        aprovado: booleano(aprovado, "Aprovação"),
        aprovado_por: aprovado ? actorId : null,
        aprovado_em: aprovado ? new Date().toISOString() : null,
      })
      .eq("id", id)
      .select(CAMPO_LAUDO)
      .single();
    if (result.error || !result.data) throw new Error(errorText(result.error));
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: converterLaudo(result.data as Record<string, unknown>, null) };
  } catch (error) {
    return falha(error);
  }
}

export async function deleteCadeiaLaudo(
  idInput: string,
): Promise<CadeiaActionResult<{ id: string }>> {
  try {
    const { supabase } = await acesso("editar");
    const id = uuid(idInput, "Laudo");
    const existing = await supabase
      .from("cadeia_madeira_laudos")
      .select("id, storage_bucket, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (existing.error || !existing.data) throw new Error("Laudo não encontrado.");
    const removed = await supabase.from("cadeia_madeira_laudos").delete().eq("id", id);
    if (removed.error) throw new Error(errorText(removed.error));
    const bucket = String(existing.data.storage_bucket ?? BUCKET_CADEIA_MADEIRA);
    const path = String(existing.data.storage_path ?? "");
    if (path) {
      const storage = await supabase.storage.from(bucket).remove([path]);
      if (storage.error) {
        console.warn("[cadeia-madeira] não foi possível remover o arquivo físico", errorText(storage.error));
      }
    }
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: { id } };
  } catch (error) {
    return falha(error);
  }
}

export async function deleteCadeiaAnexo(
  idInput: string,
): Promise<CadeiaActionResult<{ id: string }>> {
  try {
    const { supabase } = await acesso("editar");
    const id = uuid(idInput, "Anexo");
    const existing = await supabase
      .from("cadeia_madeira_anexos")
      .select("id, storage_bucket, storage_path")
      .eq("id", id)
      .maybeSingle();
    if (existing.error || !existing.data) throw new Error("Anexo não encontrado.");
    const removed = await supabase.from("cadeia_madeira_anexos").delete().eq("id", id);
    if (removed.error) throw new Error(errorText(removed.error));
    const bucket = String(existing.data.storage_bucket ?? BUCKET_CADEIA_MADEIRA);
    const path = String(existing.data.storage_path ?? "");
    if (path) {
      const storage = await supabase.storage.from(bucket).remove([path]);
      if (storage.error) {
        console.warn("[cadeia-madeira] não foi possível remover o anexo físico", errorText(storage.error));
      }
    }
    revalidatePath("/cadeia-madeira");
    return { ok: true, data: { id } };
  } catch (error) {
    return falha(error);
  }
}
