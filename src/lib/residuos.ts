export const RESIDUO_CATEGORIAS = [
  { value: "madeira", label: "Madeira" },
  { value: "obs", label: "Outros / OBS" },
  { value: "gesso", label: "Gesso" },
] as const;

export const RESIDUO_STATUS = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "CONCLUIDO", label: "Concluído" },
  { value: "CANCELADO", label: "Cancelado" },
] as const;

export type ResiduoCategoria = (typeof RESIDUO_CATEGORIAS)[number]["value"];
export type ResiduoStatus = (typeof RESIDUO_STATUS)[number]["value"];
export type ResiduoAnexoTipo = "foto" | "mtr";

export interface ResiduoAnexo {
  id: string;
  troca_id: string;
  tipo: ResiduoAnexoTipo;
  nome_arquivo: string;
  mime_type: string | null;
  tamanho_bytes: number | null;
  storage_path: string | null;
  uploaded_at: string;
  created_by: string | null;
  metadata: Record<string, unknown>;
  url: string | null;
}

export interface ResiduoTroca {
  id: string;
  categoria: ResiduoCategoria;
  data_troca: string;
  identificacao_cacamba: string | null;
  transportadora_destino: string | null;
  peso_kg: number | null;
  mtr_numero: string | null;
  observacao: string | null;
  empresa_coletora: string | null;
  placa_caminhao: string | null;
  motorista: string | null;
  horario_retirada: string | null;
  custo: number | null;
  destino_final: string | null;
  status: ResiduoStatus;
  usuario_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  anexos: ResiduoAnexo[];
}

export interface ResiduosFilters {
  page?: number;
  search?: string;
  categoria?: ResiduoCategoria | "";
  status?: ResiduoStatus | "";
  data_inicio?: string;
  data_fim?: string;
}

export interface ResiduosSummary {
  total: number;
  pendentes: number;
  peso_total: number;
  custo_total: number;
}

export interface ResiduosSnapshot {
  items: ResiduoTroca[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  summary: ResiduosSummary;
}

export const RESIDUOS_PAGE_SIZE = 20;

export function snapshotVazio(): ResiduosSnapshot {
  return {
    items: [],
    total: 0,
    page: 1,
    pageSize: RESIDUOS_PAGE_SIZE,
    hasNextPage: false,
    summary: { total: 0, pendentes: 0, peso_total: 0, custo_total: 0 },
  };
}

export function labelCategoria(value: ResiduoCategoria) {
  return RESIDUO_CATEGORIAS.find((item) => item.value === value)?.label ?? value;
}

export function labelStatus(value: ResiduoStatus) {
  return RESIDUO_STATUS.find((item) => item.value === value)?.label ?? value;
}

export function formatarDataResiduo(value: string) {
  const date = new Date(value + (value.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

export function formatarDataHoraResiduo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatarNumeroResiduo(value: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatarMoedaResiduo(value: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}
