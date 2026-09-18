export const BUCKET_CADEIA_MADEIRA = "cadeia-madeira";
export const CADEIA_MADEIRA_PAGE_SIZE = 20;
export const LIMITE_UMIDADE_SEGURA = 20;
export const MAX_DOCUMENTO_CADEIA_BYTES = 20 * 1024 * 1024;

export const CADEIA_MADEIRA_MODULOS = [
  {
    id: "auditoria",
    rotulo: "Auditoria de recebimento",
    href: "/cadeia-madeira?modulo=auditoria",
  },
  { id: "cadastro", rotulo: "Cadastro", href: "/cadeia-madeira?modulo=cadastro" },
  { id: "ensaios", rotulo: "Ensaios", href: "/cadeia-madeira?modulo=ensaios" },
  { id: "laudos", rotulo: "Laudos", href: "/cadeia-madeira?modulo=laudos" },
] as const;

export type CadeiaMadeiraModuloId = (typeof CADEIA_MADEIRA_MODULOS)[number]["id"];

export type StatusLiberacaoMadeira = "APROVADO" | "REPROVADO" | "QUARENTENA";
export type TipoEnsaioMadeira =
  | "RECEBIMENTO_MADEIRA"
  | "ESTRUTURAL_PROTOTIPO"
  | "DESEMPENHO_PLACA_CIMENTICIA"
  | "PAINEL_ESTRUTURAL"
  | "MADEIRA_ESTRUTURAL"
  | "OUTRO";
export type ComponenteEnsaioMadeira =
  | "MADEIRA_ESTRUTURAL"
  | "PLACA_CIMENTICIA"
  | "PAINEL_ESTRUTURAL"
  | "PROTOTIPO_COMPLETO"
  | "LIGACAO_FIXACAO"
  | "OUTRO";
export type TipoLaudoMadeira =
  | "LAUDO_TECNICO"
  | "CERTIFICADO_CONFORMIDADE";
export type TipoAnexoCadeia = "FOTO_INSPECAO" | "MTR";

export const STATUS_LIBERACAO_MADEIRA: Array<{
  value: StatusLiberacaoMadeira;
  label: string;
}> = [
  { value: "QUARENTENA", label: "Quarentena" },
  { value: "APROVADO", label: "Aprovado" },
  { value: "REPROVADO", label: "Reprovado" },
];

export const TIPOS_LAUDO_MADEIRA: Array<{
  value: TipoLaudoMadeira;
  label: string;
}> = [
  { value: "LAUDO_TECNICO", label: "Laudo técnico" },
  { value: "CERTIFICADO_CONFORMIDADE", label: "Certificado de conformidade" },
];

export const TIPOS_ENSAIO_MADEIRA: Array<{
  value: TipoEnsaioMadeira;
  label: string;
}> = [
  { value: "RECEBIMENTO_MADEIRA", label: "Recebimento da madeira" },
  { value: "ESTRUTURAL_PROTOTIPO", label: "Ensaio estrutural de protótipo" },
  {
    value: "DESEMPENHO_PLACA_CIMENTICIA",
    label: "Desempenho da placa cimentícia",
  },
  { value: "PAINEL_ESTRUTURAL", label: "Painel estrutural" },
  { value: "MADEIRA_ESTRUTURAL", label: "Caracterização da madeira" },
  { value: "OUTRO", label: "Outro ensaio" },
];

export const COMPONENTES_ENSAIO_MADEIRA: Array<{
  value: ComponenteEnsaioMadeira;
  label: string;
}> = [
  { value: "MADEIRA_ESTRUTURAL", label: "Madeira estrutural" },
  { value: "PLACA_CIMENTICIA", label: "Placa cimentícia" },
  { value: "PAINEL_ESTRUTURAL", label: "Painel estrutural" },
  { value: "PROTOTIPO_COMPLETO", label: "Protótipo completo" },
  { value: "LIGACAO_FIXACAO", label: "Ligação / fixação" },
  { value: "OUTRO", label: "Outro componente" },
];

export interface CadeiaFornecedor {
  id: string;
  razao_social: string;
  cnpj: string | null;
  homologacao_ativa: boolean;
  certificacao_origem: string | null;
  contato_tecnico_nome: string | null;
  contato_tecnico_email: string | null;
  contato_tecnico_telefone: string | null;
  historico_avaliacao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CadeiaLote {
  id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  numero_nota_fiscal: string;
  volume_m3: number;
  data_recebimento: string;
  placa_veiculo: string | null;
  teor_umidade_medio: number;
  lote_autoclave: string;
  status_liberacao: StatusLiberacaoMadeira;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CadeiaInspecao {
  id: string;
  lote_id: string;
  data_inspecao: string;
  inspetor_id: string | null;
  inspetor_nome: string;
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
  created_at: string;
  updated_at: string;
}

export interface CadeiaLaudo {
  id: string;
  lote_id: string;
  tipo: TipoLaudoMadeira;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  storage_bucket: string;
  storage_path: string;
  validade_ate: string | null;
  aprovado: boolean;
  aprovado_por: string | null;
  aprovado_em: string | null;
  observacoes: string | null;
  created_at: string;
  url: string | null;
}

export interface CadeiaAnexo {
  id: string;
  lote_id: string;
  inspecao_id: string | null;
  tipo: TipoAnexoCadeia;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  storage_bucket: string;
  storage_path: string;
  observacoes: string | null;
  created_at: string;
  url: string | null;
}

export interface CadeiaMadeiraResumo {
  fornecedores_ativos: number;
  lotes_total: number;
  lotes_quarentena: number;
  lotes_umidade_alta: number;
  laudos_pendentes: number;
}

export interface CadeiaMadeiraSnapshot {
  fornecedores: CadeiaFornecedor[];
  lotes: CadeiaLote[];
  inspecoes: CadeiaInspecao[];
  laudos: CadeiaLaudo[];
  anexos: CadeiaAnexo[];
  page: number;
  pageSize: number;
  totalLotes: number;
  hasNextPage: boolean;
  resumo: CadeiaMadeiraResumo;
}

export function rotuloStatusLiberacao(status: StatusLiberacaoMadeira) {
  return STATUS_LIBERACAO_MADEIRA.find((item) => item.value === status)?.label ?? status;
}

export function rotuloTipoLaudo(tipo: TipoLaudoMadeira) {
  return TIPOS_LAUDO_MADEIRA.find((item) => item.value === tipo)?.label ?? tipo;
}

export function rotuloTipoAnexo(tipo: TipoAnexoCadeia) {
  return tipo === "FOTO_INSPECAO" ? "Foto da inspeção" : "Documento MTR";
}

export function dataMadeira(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function dataHoraMadeira(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function bytesMadeira(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function loteUmidadeAlta(value: number) {
  return value > LIMITE_UMIDADE_SEGURA;
}

export function snapshotCadeiaVazio(): CadeiaMadeiraSnapshot {
  return {
    fornecedores: [],
    lotes: [],
    inspecoes: [],
    laudos: [],
    anexos: [],
    page: 1,
    pageSize: CADEIA_MADEIRA_PAGE_SIZE,
    totalLotes: 0,
    hasNextPage: false,
    resumo: {
      fornecedores_ativos: 0,
      lotes_total: 0,
      lotes_quarentena: 0,
      lotes_umidade_alta: 0,
      laudos_pendentes: 0,
    },
  };
}
