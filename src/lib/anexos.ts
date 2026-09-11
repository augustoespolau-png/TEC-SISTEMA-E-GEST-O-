/** O bucket já usado pela Auditoria de Produto. Ele é privado: a tela cria
 * URLs assinadas apenas para a visualização dos arquivos que o usuário pode
 * consultar. */
export const BUCKET_AUDITORIA = "auditoria-arquivos";

/** Limite igual ao configurado no bucket do Supabase. */
export const MAX_FOTO_BYTES = 20 * 1024 * 1024;

/** Fallback de compatibilidade quando o Storage estiver indisponível. */
export const MAX_FOTO_FALLBACK_BYTES = 2 * 1024 * 1024;

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Converte a foto para JPEG leve, preservando a maior dimensão em 1440px. */
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
    const escala = maiorLado > 1440 ? 1440 / maiorLado : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
    const contexto = canvas.getContext("2d");
    if (!contexto) return arquivo;

    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.76)
    );
    if (!blob) return arquivo;

    const nome = arquivo.name.replace(/\.[^.]+$/, "") || "foto-desvio";
    return new File([blob], `${nome}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function arquivoComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(new Error("Não foi possível preparar a foto."));
    leitor.readAsDataURL(arquivo);
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
