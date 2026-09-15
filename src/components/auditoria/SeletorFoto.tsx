"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MAX_FOTO_BYTES, otimizarFoto, tamanhoLegivel } from "@/lib/anexos";

export default function SeletorFoto({
  id,
  titulo,
  descricao,
  salvando,
  onArquivoPronto,
  onProcessando,
}: {
  id: string;
  titulo: string;
  descricao: string;
  salvando: boolean;
  onArquivoPronto: (arquivo: File | null) => void;
  onProcessando?: (processando: boolean) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galeriaInput = useRef<HTMLInputElement>(null);
  const selecao = useRef(0);
  const processarAntesDeEntregar = Boolean(onProcessando);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function atualizarProcessamento(valor: boolean) {
    setProcessando(valor);
    onProcessando?.(valor);
  }

  async function selecionar(event: ChangeEvent<HTMLInputElement>) {
    const escolhido = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!escolhido) return;

    const idSelecao = ++selecao.current;
    setErro("");
    if (!escolhido.type.startsWith("image/")) {
      setArquivo(null);
      setPreview(null);
      onArquivoPronto(null);
      atualizarProcessamento(false);
      setErro("Escolha uma imagem para anexar.");
      return;
    }
    if (escolhido.size > MAX_FOTO_BYTES) {
      setArquivo(null);
      setPreview(null);
      onArquivoPronto(null);
      atualizarProcessamento(false);
      setErro("A foto precisa ter no máximo 20 MB.");
      return;
    }

    setArquivo(escolhido);
    setPreview(URL.createObjectURL(escolhido));

    if (!processarAntesDeEntregar) {
      onArquivoPronto(escolhido);
      return;
    }

    onArquivoPronto(null);
    atualizarProcessamento(true);
    try {
      const otimizada = await otimizarFoto(escolhido);
      if (idSelecao !== selecao.current) return;
      setArquivo(otimizada);
      setPreview(URL.createObjectURL(otimizada));
      onArquivoPronto(otimizada);
    } catch (caught) {
      if (idSelecao !== selecao.current) return;
      setArquivo(null);
      setPreview(null);
      onArquivoPronto(null);
      setErro(
        caught instanceof Error
          ? caught.message
          : "Não foi possível otimizar a foto. Escolha outra imagem."
      );
    } finally {
      if (idSelecao === selecao.current) atualizarProcessamento(false);
    }
  }

  function remover() {
    ++selecao.current;
    setArquivo(null);
    setPreview(null);
    onArquivoPronto(null);
    atualizarProcessamento(false);
    setErro("");
  }

  const bloqueado = salvando || processando;

  return (
    <div>
      <label className="rotulo" htmlFor={`${id}-camera`}>{titulo}</label>
      <div className="anexo-captura">
        <input
          ref={cameraInput}
          id={`${id}-camera`}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={selecionar}
          className="anexo-input"
          aria-label={`${titulo} — tirar foto`}
        />
        <input
          ref={galeriaInput}
          id={`${id}-galeria`}
          type="file"
          accept="image/*"
          onChange={selecionar}
          className="anexo-input"
          aria-label={`${titulo} — escolher da galeria`}
        />

        <div className="anexo-seletor">
          {preview ? (
            <div className="anexo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={`Pré-visualização: ${titulo}`} className="anexo-imagem" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-ink">{arquivo?.name ?? "Foto selecionada"}</p>
                <p className="sub">
                  {arquivo ? tamanhoLegivel(arquivo.size) : ""}
                  {processando
                    ? " · preparando foto…"
                    : processarAntesDeEntregar
                      ? " · pronta para salvar"
                      : " · será enviada em segundo plano"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInput.current?.click()}
                    className="btn"
                    disabled={bloqueado}
                    style={{ fontSize: 11, padding: "5px 9px" }}
                  >
                    Tirar outra
                  </button>
                  <button
                    type="button"
                    onClick={() => galeriaInput.current?.click()}
                    className="btn"
                    disabled={bloqueado}
                    style={{ fontSize: 11, padding: "5px 9px" }}
                  >
                    Galeria
                  </button>
                  <button
                    type="button"
                    onClick={remover}
                    className="btn"
                    disabled={bloqueado}
                    style={{ fontSize: 11, padding: "5px 9px" }}
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="anexo-escolher"
                onClick={() => cameraInput.current?.click()}
                disabled={salvando}
              >
                <span className="anexo-icone" aria-hidden="true">◉</span>
                <span>
                  <b>Tirar foto</b>
                  <small>Abre a câmera traseira</small>
                </span>
              </button>
              <button
                type="button"
                className="anexo-escolher"
                onClick={() => galeriaInput.current?.click()}
                disabled={salvando}
              >
                <span className="anexo-icone" aria-hidden="true">▣</span>
                <span>
                  <b>Galeria</b>
                  <small>Escolher imagem existente</small>
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
      {erro && <p className="sub" style={{ color: "var(--color-alta)" }} role="alert">{erro}</p>}
      <p className="sub">{descricao}</p>
    </div>
  );
}
