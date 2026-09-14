import type { SupabaseClient } from "@supabase/supabase-js";

/** O bucket já usado pela Auditoria de Produto. Ele é privado: a tela cria
 * URLs assinadas apenas para a visualização dos arquivos que o usuário pode
 * consultar. */
export const BUCKET_AUDITORIA = "auditoria-arquivos";

/** Limite igual ao configurado no bucket do Supabase. */
export const MAX_FOTO_BYTES = 20 * 1024 * 1024;
export const DURACAO_URL_ANEXO = 60 * 60;

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Faz decode, resize e encode fora da main thread em navegadores modernos.
 * Tablets/celulares deixam de travar a interface enquanto uma foto grande é
 * preparada. O fallback por canvas continua cobrindo browsers antigos.
 */
async function otimizarFotoEmWorker(arquivo: File): Promise<Blob | null> {
  if (
    typeof Worker === "undefined" ||
    typeof OffscreenCanvas === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    return null;
  }

  const codigo = `
self.onmessage = async (event) => {
  try {
    const arquivo = event.data;
    const bitmap = await createImageBitmap(arquivo);
    const maiorLado = Math.max(bitmap.width, bitmap.height);
    const escala = maiorLado > 1200 ? 1200 / maiorLado : 1;
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = new OffscreenCanvas(largura, altura);
    const contexto = canvas.getContext("2d");
    if (!contexto) throw new Error("Contexto 2D indisponível");
    contexto.drawImage(bitmap, 0, 0, largura, altura);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ erro: error instanceof Error ? error.message : "Falha ao compactar" });
  }
};`;

  const workerUrl = URL.createObjectURL(
    new Blob([codigo], { type: "text/javascript" })
  );
  const worker = new Worker(workerUrl);

  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ blob?: Blob; erro?: string }>) => {
        if (event.data?.blob) {
          resolve(event.data.blob);
          return;
        }
        reject(new Error(event.data?.erro || "Não foi possível compactar a foto."));
      };
      worker.onerror = () => reject(new Error("Não foi possível compactar a foto."));
      worker.postMessage(arquivo);
    });
  } catch {
    return null;
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  }
}

async function otimizarFotoNoCanvas(arquivo: File): Promise<Blob> {
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
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Converte a foto para JPEG leve, preservando a maior dimensão em 1200px. */
export async function otimizarFoto(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/")) {
    throw new Error("Escolha uma imagem para anexar.");
  }
  if (arquivo.size > MAX_FOTO_BYTES) {
    throw new Error("A foto precisa ter no máximo 20 MB.");
  }

  const blob =
    (await otimizarFotoEmWorker(arquivo)) ??
    (await otimizarFotoNoCanvas(arquivo));
  const nome = arquivo.name.replace(/\.[^.]+$/, "") || "foto-desvio";
  return new File([blob], `${nome}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
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

/**
 * Assina vários arquivos com uma chamada por bucket, em vez de abrir uma
 * requisição ao Storage para cada foto exibida na lista. O mapa é indexado
 * pelo bucket e pelo caminho para continuar aceitando buckets distintos.
 */
export async function assinarAnexosEmLote(
  supabase: SupabaseClient,
  arquivos: Array<{ bucket: string; path: string }>,
  expiresIn = DURACAO_URL_ANEXO
) {
  const porBucket = new Map<string, Set<string>>();
  for (const arquivo of arquivos) {
    if (!arquivo.bucket || !arquivo.path) continue;
    const caminhos = porBucket.get(arquivo.bucket) ?? new Set<string>();
    caminhos.add(arquivo.path);
    porBucket.set(bucket, caminhos);
  }

  const resultado = new Map<string, Map<string, string>>();
  await Promise.all(
    [...porBucket].map(async ([bucket, caminhos]) => {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrls([...caminhos], expiresIn);
      for (const arquivo of data ?? []) {
        if (!arquivo.path || !arquivo.signedUrl) continue;
        const urlsDoBucket = resultado.get(bucket) ?? new Map<string, string>();
        urlsDoBucket.set(arquivo.path, arquivo.signedUrl);
        resultado.set(bucket, urlsDoBucket);
      }
    })
  );
  return resultado;
}

/** Envia uma foto JPEG já otimizada para o Storage privado da auditoria. */
export async function enviarFotoAuditoria(
  supabase: SupabaseClient,
  dados: CaminhoAnexoAuditoria & { arquivo: File }
) {
  const caminho = caminhoAnexoAuditoria(dados);
  const { error } = await supabase.storage
    .from(BUCKET_AUDITORIA)
    .upload(caminho, dados.arquivo, {
      cacheControl: "3600",
      contentType: "image/jpeg",
      upsert: false,
    });
  if (error) {
    throw new Error("Não foi possível enviar a foto: " + error.message);
  }
  return caminho;
}
