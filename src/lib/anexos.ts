/** O bucket já usado pela Auditoria de Produto. Ele é privado: a tela cria
 * URLs assinadas apenas para a visualização dos arquivos que o usuário pode
 * consultar. */
export const BUCKET_AUDITORIA = "auditoria-arquivos";

/** Limite igual ao configurado no bucket do Supabase. */
export const MAX_FOTO_BYTES = 20 * 1024 * 1024;

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Converte a foto para JPEG leve, preservando a maior dimensão em 1200px. */
export async function otimizarFoto(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/")) {
    throw new Error("Escolha uma imagem para anexar.");
  }
  if (arquivo.size > MAX_FOTO_BYTES) {
    throw new Error("A foto precisa ter no máximo 20 MB.");
  }

  const url = URL.createObjectURL(arquivo);
  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const elemento = new Image();
      elemento.onload = () => resolve(elemento);
      elemento.onerror = () => reject(new Error("Não foi possível ler a foto."));
      elemento.src = url;
    });

    const maiorLado = Math.max(imagem.naturalWidth, imagem.naturalHeight);
    const escala = maiorLado > 1200 ? 1200 / maiorLado : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const contexto = canvas.getContext("2d");
    if (!contexto) {
      throw new Error("O navegador não conseguiu preparar a imagem.");
    }

    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8)
    );
    if (!blob) {
      throw new Error("Não foi possível compactar a imagem.");
    }

    const nome = arquivo.name.replace(/\.[^.]+$/, "") || "foto-desvio";
    return new File([blob], `${nome}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function segmentoSeguro(valor: string) {
  return (
    valor
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "sem-identificador"
  );
}

export interface CaminhoAnexoAuditoria {
  usuarioId: string;
  projetoId: string;
  casaId: string;
  paredeId: string;
  anexoId: string;
  extensao?: string;
  agora?: Date;
}

export interface CaminhoProjetoParede {
  usuarioId: string;
  projetoId: string;
  paredeId: string;
  anexoId: string;
  extensao?: string;
  agora?: Date;
}

/**
 * Caminho canônico dos anexos da Auditoria de Produto.
 *
 * O prefixo de proprietário é parte da política RLS do Storage. Depois dele,
 * os IDs do domínio deixam cada arquivo localizável sem depender de nomes
 * editáveis da interface.
 */
export function caminhoAnexoAuditoria({
  usuarioId,
  projetoId,
  casaId,
  paredeId,
  anexoId,
  extensao = "jpg",
  agora = new Date(),
}: CaminhoAnexoAuditoria) {
  const timestamp = agora
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return [
    "produto",
    segmentoSeguro(usuarioId),
    segmentoSeguro(projetoId),
    segmentoSeguro(casaId),
    segmentoSeguro(paredeId),
    `${timestamp}-${segmentoSeguro(anexoId)}.${segmentoSeguro(extensao)}`,
  ].join("/");
}

/**
 * Caminho dos desenhos técnicos cadastrados na configuração da parede.
 *
 * O segmento `projeto` separa esse tipo de documento das fotos de uma casa,
 * mas mantém o mesmo proprietário e os mesmos IDs estáveis exigidos pelo
 * Storage. O nome da parede nunca entra no caminho: renomear a posição não
 * quebra o vínculo do arquivo.
 */
export function caminhoProjetoParede({
  usuarioId,
  projetoId,
  paredeId,
  anexoId,
  extensao = "pdf",
  agora = new Date(),
}: CaminhoProjetoParede) {
  const timestamp = agora
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  return [
    "produto",
    segmentoSeguro(usuarioId),
    segmentoSeguro(projetoId),
    segmentoSeguro(paredeId),
    "projeto",
    `${timestamp}-${segmentoSeguro(anexoId)}.${segmentoSeguro(extensao)}`,
  ].join("/");
}
