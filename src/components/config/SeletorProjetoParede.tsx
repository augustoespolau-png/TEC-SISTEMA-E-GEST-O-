"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  MAX_FOTO_BYTES,
  otimizarFoto,
  tamanhoLegivel,
} from "@/lib/anexos";
import type { AnexoProjetoParede } from "@/lib/types";

/**
 * Seletor de desenho técnico da parede.
 *
 * Um único input deixa o celular oferecer câmera, galeria e arquivos. Fotos
 * passam pelo mesmo redimensionamento dos anexos da auditoria; PDFs seguem
 * sem conversão e nunca são transformados em Base64.
 */
export default function SeletorProjetoParede({
  id,
  anexo,
  salvando,
  onArquivoPronto,
}: {
  id: string;
  anexo: AnexoProjetoParede | null;
  salvando: boolean;
  onArquivoPronto: (arquivo: File | null) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const previewAtual = useRef<string | null>(null);
  const selecao = useRef(0);

  useEffect(() => {
    return () => {
      if (previewAtual.current) URL.revokeObjectURL(previewAtual.current);
    };
  }, []);

  function trocarPreview(novo: string | null) {
    if (previewAtual.current) URL.revokeObjectURL(previewAtual.current);
    previewAtual.current = novo;
    setPreview(novo);
  }

  function limparEscolha() {
    ++selecao.current;
    setArquivo(null);
    trocarPreview(null);
    setProcessando(false);
    onArquivoPronto(null);
    setErro("");
  }

  async function selecionar(event: ChangeEvent<HTMLInputElement>) {
    const escolhido = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!escolhido) return;

    const idSelecao = ++selecao.current;
    setErro("");
    onArquivoPronto(null);
    setArquivo(null);
    trocarPreview(null);

    const ehImagem = escolhido.type.startsWith("image/");
    const ehPdf = escolhido.type === "application/pdf";
    if (!ehPdf && !ehImagem) {
      setErro("Escolha um PDF ou uma imagem técnica.");
      return;
    }
    if (escolhido.size > MAX_FOTO_BYTES) {
      setErro("O arquivo precisa ter no máximo 20 MB.");
      return;
    }

    setProcessando(true);
    if (ehImagem) trocarPreview(URL.createObjectURL(escolhido));

    try {
      const pronto = ehImagem ? await otimizarFoto(escolhido) : escolhido;
      if (idSelecao !== selecao.current) return;
      setArquivo(pronto);
      if (ehImagem) trocarPreview(URL.createObjectURL(pronto));
      onArquivoPronto(pronto);
    } catch (caught) {
      if (idSelecao !== selecao.current) return;
      limparEscolha();
      setErro(
        caught instanceof Error
          ? caught.message
          : "Não foi possível preparar o arquivo. Escolha outro."
      );
    } finally {
      if (idSelecao === selecao.current) setProcessando(false);
    }
  }

  const nome = arquivo?.name ?? anexo?.nome_arquivo ?? "Projeto da parede";
  const tamanho = arquivo?.size ?? anexo?.tamanho_bytes ?? null;
  const imagemRemota = !arquivo && anexo?.url && anexo.mime_type?.startsWith("image/")
    ? anexo.url
    : null;
  const imagem = preview ?? imagemRemota;
  const temDocumento = Boolean(arquivo || anexo);

  return (
    <div className="projeto-parede-anexo">
      <label className="rotulo" htmlFor={id}>
        Projeto da parede
      </label>
      <div className="anexo-captura">
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*,application/pdf,.pdf"
          onChange={selecionar}
          className="anexo-input"
          aria-label="Projeto da parede em PDF ou imagem"
        />
        <div className="anexo-seletor">
          {temDocumento ? (
            <div className="anexo-preview">
              {imagem ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagem}
                  alt={`Pré-visualização: ${nome}`}
                  className="anexo-imagem"
                />
              ) : (
                <span className="anexo-documento" aria-hidden="true">
                  PDF
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-ink">{nome}</p>
                <p className="sub">
                  {tamanho == null ? "" : tamanhoLegivel(tamanho)}
                  {arquivo
                    ? processando
                      ? " · preparando arquivo…"
                      : " · pronto para enviar"
                    : " · cadastrado"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className="btn"
                    disabled={salvando || processando}
                    style={{ fontSize: 11, padding: "5px 9px" }}
                  >
                    Trocar projeto
                  </button>
                  {anexo?.url && !arquivo && (
                    <a
                      href={anexo.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn"
                      style={{ fontSize: 11, padding: "5px 9px" }}
                    >
                      Abrir atual ↗
                    </a>
                  )}
                  {arquivo && (
                    <button
                      type="button"
                      onClick={limparEscolha}
                      className="btn"
                      disabled={salvando || processando}
                      style={{ fontSize: 11, padding: "5px 9px" }}
                    >
                      Cancelar escolha
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="anexo-escolher"
              onClick={() => input.current?.click()}
              disabled={salvando}
            >
              <span className="anexo-icone" aria-hidden="true">
                ▣
              </span>
              <span>
                <b>Anexar PDF ou imagem técnica</b>
                <small>Câmera, galeria ou arquivos · até 20 MB</small>
              </span>
            </button>
          )}
        </div>
      </div>
      {erro && (
        <p className="sub" style={{ color: "var(--color-alta)" }} role="alert">
          {erro}
        </p>
      )}
      <p className="sub">
        O arquivo fica vinculado somente a esta parede e é armazenado no
        Storage privado.
      </p>
    </div>
  );
}
