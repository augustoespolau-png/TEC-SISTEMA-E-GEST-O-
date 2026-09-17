"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  assinarAnexosEmLote,
  BUCKET_AUDITORIA,
  segmentoSeguro,
} from "@/lib/anexos";
import { canModule } from "@/lib/governanca-types";
import { getAuthContext, isAccountInactive } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  RESIDUO_CATEGORIAS,
  RESIDUO_STATUS,
  RESIDUOS_PAGE_SIZE,
  type ResiduoAnexo,
  type ResiduoAnexoTipo,
  type ResiduoCategoria,
  type ResiduoStatus,
  type ResiduoTroca,
  type ResiduosFilters,
  type ResiduosSnapshot,
} from "@/lib/residuos";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ResiduoTrocaInput {
  id?: string;
  categoria: ResiduoCategoria;
  data_troca: string;
  identificacao_cacamba: string | null;
  transportadora_destino: string | null;
  peso_kg: number | string | null;
  mtr_numero: string | null;
  observacao: string | null;
  empresa_coletora: string | null;
  placa_caminhao: string | null;
  motorista: string | null;
  horario_retirada: string | null;
  custo: number | string | null;
  destino_final: string | null;
  status: ResiduoStatus;
}

export interface ResiduoAnexoInput {
  troca_id: string;
  tipo: ResiduoAnexoTipo;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  storage_path: string;
}

const CAMPOS_TROCA =
  "id, categoria, data_troca, identificacao_cacamba, transportadora_destino, peso_kg, mtr_numero, observacao, empresa_coletora, placa_caminhao, motorista, horario_retirada, custo, destino_final, status, usuario_id, created_at, updated_at, updated_by";

function erroMensagem(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Não foi possível concluir a operação de resíduos.";
}

function falha(error: unknown): { ok: false; error: string } {
  const message = erroMensagem(error);
  if (/row-level security|permission denied|42501/i.test(message)) {
    return { ok: false, error: "Você não tem permissão para alterar o módulo Resíduos." };
  }
  return { ok: false, error: message };
}

function texto(value: unknown, label: string, max: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error(label + " inválido.");
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length > max) throw new Error(label + " deve ter até " + max + " caracteres.");
  return result || null;
}

function idSeguro(value: unknown, label = "Identificador") {
  if (typeof value !== "string") throw new Error(label + " inválido.");
  const result = value.trim();
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(result)) throw new Error(label + " inválido.");
  return result;
}

function dataValida(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(label + " inválida.");
  }
  const parts = value.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (
    date.getUTCFullYear() !== parts[0] ||
    date.getUTCMonth() !== parts[1] - 1 ||
    date.getUTCDate() !== parts[2]
  ) {
    throw new Error(label + " inválida.");
  }
  return value;
}

function numero(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const result =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(/\s/g, "").replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(result) || result < 0 || result > 1000000000) {
    throw new Error(label + " deve ser um número entre zero e 1 bilhão.");
  }
  return result;
}

function categoria(value: unknown): ResiduoCategoria {
  if (!RESIDUO_CATEGORIAS.some((item) => item.value === value)) {
    throw new Error("Categoria de resíduo inválida.");
  }
  return value as ResiduoCategoria;
}

function status(value: unknown): ResiduoStatus {
  if (!RESIDUO_STATUS.some((item) => item.value === value)) {
    throw new Error("Status da troca inválido.");
  }
  return value as ResiduoStatus;
}

function hora(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error("Horário de retirada inválido.");
  }
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) throw new Error("Horário de retirada inválido.");
  return value;
}

function normalizarTroca(input: ResiduoTrocaInput, exigirId = false) {
  const id = input.id ? idSeguro(input.id, "Troca") : null;
  if (exigirId && !id) throw new Error("Troca não informada.");
  return {
    id,
    categoria: categoria(input.categoria),
    data_troca: dataValida(input.data_troca, "Data da troca"),
    identificacao_cacamba: texto(input.identificacao_cacamba, "Identificação da caçamba", 160),
    transportadora_destino: texto(input.transportadora_destino, "Transportadora / destino", 160),
    peso_kg: numero(input.peso_kg, "Peso"),
    mtr_numero: texto(input.mtr_numero, "Número do MTR", 120),
    observacao: texto(input.observacao, "Observação", 4000),
    empresa_coletora: texto(input.empresa_coletora, "Empresa coletora", 160),
    placa_caminhao: texto(input.placa_caminhao, "Placa do caminhão", 20),
    motorista: texto(input.motorista, "Motorista", 160),
    horario_retirada: hora(input.horario_retirada),
    custo: numero(input.custo, "Custo"),
    destino_final: texto(input.destino_final, "Destinação final", 240),
    status: status(input.status),
  };
}

async function acesso(action: "ver" | "editar") {
  const contexto = await getAuthContext();
  if (!contexto || !contexto.profile || isAccountInactive(contexto.profile)) {
    throw new Error("Sua sessão expirou. Entre novamente.");
  }
  if (!canModule(contexto.permissions, "RESÍDUOS", action)) {
    throw new Error(
      action === "editar"
        ? "Você não tem permissão para alterar o módulo Resíduos."
        : "Você não tem permissão para visualizar o módulo Resíduos.",
    );
  }
  return { supabase: await createClient(), actorId: contexto.user.id };
}

function converter(row: Record<string, unknown>): ResiduoTroca {
  return {
    id: String(row.id ?? ""),
    categoria: categoria(row.categoria),
    data_troca: String(row.data_troca ?? ""),
    identificacao_cacamba: (row.identificacao_cacamba as string | null) ?? null,
    transportadora_destino: (row.transportadora_destino as string | null) ?? null,
    peso_kg: row.peso_kg == null ? null : Number(row.peso_kg),
    mtr_numero: (row.mtr_numero as string | null) ?? null,
    observacao: (row.observacao as string | null) ?? null,
    empresa_coletora: (row.empresa_coletora as string | null) ?? null,
    placa_caminhao: (row.placa_caminhao as string | null) ?? null,
    motorista: (row.motorista as string | null) ?? null,
    horario_retirada: (row.horario_retirada as string | null) ?? null,
    custo: row.custo == null ? null : Number(row.custo),
    destino_final: (row.destino_final as string | null) ?? null,
    status: status(row.status),
    usuario_id: (row.usuario_id as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    updated_by: (row.updated_by as string | null) ?? null,
    anexos: [],
  };
}

function converterAnexo(row: Record<string, unknown>, url: string | null): ResiduoAnexo {
  return {
    id: String(row.id ?? ""),
    troca_id: String(row.troca_id ?? ""),
    tipo: row.tipo === "mtr" ? "mtr" : "foto",
    nome_arquivo: String(row.nome_arquivo ?? "Arquivo"),
    mime_type: (row.mime_type as string | null) ?? null,
    tamanho_bytes: row.tamanho_bytes == null ? null : Number(row.tamanho_bytes),
    storage_path: (row.storage_path as string | null) ?? null,
    uploaded_at: String(row.uploaded_at ?? ""),
    created_by: (row.created_by as string | null) ?? null,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    url,
  };
}

function normalizarFiltros(filters: ResiduosFilters) {
  const page = Math.max(1, Math.min(10000, Math.floor(Number(filters.page ?? 1))));
  if (!Number.isFinite(page)) throw new Error("Página inválida.");
  const search =
    typeof filters.search === "string"
      ? filters.search.trim().replace(/[^\p{L}\p{N}\s._/-]/gu, "").slice(0, 80)
      : "";
  const dataInicio = filters.data_inicio
    ? dataValida(filters.data_inicio, "Data inicial")
    : null;
  const dataFim = filters.data_fim
    ? dataValida(filters.data_fim, "Data final")
    : null;
  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new Error("A data inicial não pode ser maior que a data final.");
  }
  return {
    page,
    search,
    categoria: filters.categoria ? categoria(filters.categoria) : null,
    status: filters.status ? status(filters.status) : null,
    dataInicio,
    dataFim,
  };
}

async function carregarAnexos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
) {
  if (!ids.length) return new Map<string, ResiduoAnexo[]>();
  const result = await supabase
    .from("residuos_anexos")
    .select(
      "id, troca_id, tipo, nome_arquivo, mime_type, tamanho_bytes, storage_path, uploaded_at, created_by, metadata",
    )
    .in("troca_id", ids)
    .order("uploaded_at", { ascending: false });
  if (result.error) throw new Error(erroMensagem(result.error));
  const rows = (result.data ?? []) as Array<Record<string, unknown>>;
  let urls = new Map<string, Map<string, string>>();
  try {
    urls = await assinarAnexosEmLote(
      supabase,
      rows.flatMap((row) =>
        row.storage_path
          ? [{ bucket: BUCKET_AUDITORIA, path: String(row.storage_path) }]
          : [],
      ),
    );
  } catch {
    urls = new Map<string, Map<string, string>>();
  }
  const grouped = new Map<string, ResiduoAnexo[]>();
  for (const row of rows) {
    const path = row.storage_path ? String(row.storage_path) : "";
    const url = path ? urls.get(BUCKET_AUDITORIA)?.get(path) ?? null : null;
    const list = grouped.get(String(row.troca_id)) ?? [];
    list.push(converterAnexo(row, url));
    grouped.set(String(row.troca_id), list);
  }
  return grouped;
}

export async function loadResiduosSnapshot(
  input: ResiduosFilters = {},
): Promise<ActionResult<ResiduosSnapshot>> {
  try {
    const { supabase } = await acesso("ver");
    const filters = normalizarFiltros(input);
    const from = (filters.page - 1) * RESIDUOS_PAGE_SIZE;
    let query = supabase
      .from("residuos_trocas")
      .select(CAMPOS_TROCA, { count: "exact" })
      .order("data_troca", { ascending: false })
      .order("created_at", { ascending: false });
    if (filters.search) {
      const search = filters.search.replace(/[,()]/g, " ");
      query = query.or(
        "identificacao_cacamba.ilike.%" +
          search +
          "%,mtr_numero.ilike.%" +
          search +
          "%,empresa_coletora.ilike.%" +
          search +
          "%,motorista.ilike.%" +
          search +
          "%",
      );
    }
    if (filters.categoria) query = query.eq("categoria", filters.categoria);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.dataInicio) query = query.gte("data_troca", filters.dataInicio);
    if (filters.dataFim) query = query.lte("data_troca", filters.dataFim);
    const result = await query.range(from, from + RESIDUOS_PAGE_SIZE - 1);
    if (result.error) throw new Error(erroMensagem(result.error));
    const rows = (result.data ?? []) as Array<Record<string, unknown>>;
    const items = rows.map(converter);
    const attachments = await carregarAnexos(supabase, items.map((item) => item.id));
    for (const item of items) item.anexos = attachments.get(item.id) ?? [];
    const total = Number(result.count ?? items.length);
    return {
      ok: true,
      data: {
        items,
        total,
        page: filters.page,
        pageSize: RESIDUOS_PAGE_SIZE,
        hasNextPage: from + items.length < total,
        summary: {
          total,
          pendentes: items.filter((item) => item.status === "PENDENTE").length,
          peso_total: items.reduce((sum, item) => sum + (item.peso_kg ?? 0), 0),
          custo_total: items.reduce((sum, item) => sum + (item.custo ?? 0), 0),
        },
      },
    };
  } catch (error) {
    return falha(error);
  }
}

export async function createResiduoTroca(
  input: ResiduoTrocaInput,
): Promise<ActionResult<ResiduoTroca>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const troca = normalizarTroca(input);
    const id = "residuo_troca_" + randomUUID();
    const result = await supabase
      .from("residuos_trocas")
      .insert({ ...troca, id, usuario_id: actorId, updated_by: actorId })
      .select(CAMPOS_TROCA)
      .single();
    if (result.error || !result.data) throw new Error(erroMensagem(result.error));
    revalidatePath("/residuos");
    return { ok: true, data: converter(result.data as Record<string, unknown>) };
  } catch (error) {
    return falha(error);
  }
}

export async function updateResiduoTroca(
  input: ResiduoTrocaInput,
): Promise<ActionResult<ResiduoTroca>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const troca = normalizarTroca(input, true);
    const result = await supabase
      .from("residuos_trocas")
      .update({
        categoria: troca.categoria,
        data_troca: troca.data_troca,
        identificacao_cacamba: troca.identificacao_cacamba,
        transportadora_destino: troca.transportadora_destino,
        peso_kg: troca.peso_kg,
        mtr_numero: troca.mtr_numero,
        observacao: troca.observacao,
        empresa_coletora: troca.empresa_coletora,
        placa_caminhao: troca.placa_caminhao,
        motorista: troca.motorista,
        horario_retirada: troca.horario_retirada,
        custo: troca.custo,
        destino_final: troca.destino_final,
        status: troca.status,
        updated_by: actorId,
      })
      .eq("id", troca.id)
      .select(CAMPOS_TROCA)
      .single();
    if (result.error || !result.data) throw new Error(erroMensagem(result.error));
    revalidatePath("/residuos");
    return { ok: true, data: converter(result.data as Record<string, unknown>) };
  } catch (error) {
    return falha(error);
  }
}

export async function cancelResiduoTroca(
  idInput: string,
): Promise<ActionResult<ResiduoTroca>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const id = idSeguro(idInput, "Troca");
    const result = await supabase
      .from("residuos_trocas")
      .update({ status: "CANCELADO", updated_by: actorId })
      .eq("id", id)
      .select(CAMPOS_TROCA)
      .single();
    if (result.error || !result.data) throw new Error(erroMensagem(result.error));
    revalidatePath("/residuos");
    return { ok: true, data: converter(result.data as Record<string, unknown>) };
  } catch (error) {
    return falha(error);
  }
}

export async function registerResiduoAnexo(
  input: ResiduoAnexoInput,
): Promise<ActionResult<ResiduoAnexo>> {
  try {
    const { supabase, actorId } = await acesso("editar");
    const trocaId = idSeguro(input.troca_id, "Troca");
    if (input.tipo !== "foto" && input.tipo !== "mtr") {
      throw new Error("Tipo de anexo inválido.");
    }
    const nome = texto(input.nome_arquivo, "Nome do arquivo", 240);
    const mime = texto(input.mime_type, "Tipo do arquivo", 120)?.toLowerCase();
    const size = numero(input.tamanho_bytes, "Tamanho do arquivo");
    if (!nome || !mime || size == null || !Number.isInteger(size) || size <= 0 || size > 20 * 1024 * 1024) {
      throw new Error("O arquivo precisa ter entre 1 byte e 20 MB.");
    }
    if (
      mime !== "application/pdf" &&
      mime !== "image/jpeg" &&
      mime !== "image/png" &&
      mime !== "image/webp"
    ) {
      throw new Error("Use PDF, JPEG, PNG ou WebP.");
    }
    const path = typeof input.storage_path === "string" ? input.storage_path.trim() : "";
    const prefix = "residuos/" + segmentoSeguro(trocaId) + "/" + input.tipo + "/";
    if (
      !path.startsWith(prefix) ||
      path.includes("..") ||
      path.length > 500 ||
      !/^[a-zA-Z0-9._/-]+$/.test(path) ||
      path.split("/").length !== 4 ||
      !path.split("/")[3]
    ) {
      throw new Error("Caminho de anexo inválido.");
    }
    const exists = await supabase
      .from("residuos_trocas")
      .select("id")
      .eq("id", trocaId)
      .maybeSingle();
    if (exists.error || !exists.data) throw new Error("Troca de caçamba não encontrada.");
    const result = await supabase
      .from("residuos_anexos")
      .insert({
        id: "residuo_anexo_" + randomUUID(),
        troca_id: trocaId,
        tipo: input.tipo,
        nome_arquivo: nome,
        mime_type: mime,
        tamanho_bytes: size,
        storage_path: path,
        created_by: actorId,
        metadata: { origem: "modulo_residuos" },
      })
      .select(
        "id, troca_id, tipo, nome_arquivo, mime_type, tamanho_bytes, storage_path, uploaded_at, created_by, metadata",
      )
      .single();
    if (result.error || !result.data) throw new Error(erroMensagem(result.error));
    revalidatePath("/residuos");
    return { ok: true, data: converterAnexo(result.data as Record<string, unknown>, null) };
  } catch (error) {
    return falha(error);
  }
}
