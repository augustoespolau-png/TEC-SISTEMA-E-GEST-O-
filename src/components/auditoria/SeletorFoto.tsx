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
  const input = useRef<HTMLInputElement>(null);
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

  return (
    <div>
      <label className="rotulo" htmlFor={id}>{titulo}</label>
      <div className="anexo-captura">
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*"
          onChange={selecionar}
          className="anexo-input"
          aria-label={titulo}
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
                      : " · será compactada e enviada em segundo plano"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => input.current?.click()} className="btn" disabled={salvando || processando} style={{ fontSize: 11, padding: "5px 9px" }}>
                    Trocar foto
                  </button>
                  <button type="button" onClick={remover} className="btn" disabled={salvando || processando} style={{ fontSize: 11, padding: "5px 9px" }}>
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="anexo-escolher" onClick={() => input.current?.click()} disabled={salvando}>
              <span className="anexo-icone" aria-hidden="true">▣</span>
              <span>
                <b>Tirar foto ou escolher imagem</b>
                <small>Use a câmera do celular/tablet ou a galeria</small>
              </span>
            </button>
          )}
        </div>
      </div>
      {erro && <p className="sub" style={{ color: "var(--color-alta)" }} role="alert">{erro}</p>}
      <p className="sub">{descricao}</p>
    </div>
  );
}
