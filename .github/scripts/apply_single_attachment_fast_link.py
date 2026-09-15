from pathlib import Path

repo = Path('.')

seletor = repo / 'src/components/auditoria/SeletorFoto.tsx'
seletor.write_text(r'''"use client";

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
''', encoding='utf-8')

path = repo / 'src/components/auditoria/AuditoriaCasa.tsx'
text = path.read_text(encoding='utf-8')

old_rpc = '''    const { error } = await mutarQualidade("ADICIONAR_ANEXO", {
      auditoria_id: auditoriaFoto.id,
      parede,
      deviation_id: desvioId,
      anexo: {
        ...preparada.anexo,
        deviationId: desvioId,
      },
    });'''
new_rpc = '''    const { error } = await supabase.rpc("qualidade_adicionar_anexo_fast", {
      p_auditoria_id: auditoriaFoto.id,
      p_parede: parede,
      p_desvio_id: desvioId,
      p_anexo: {
        ...preparada.anexo,
        deviationId: desvioId,
      },
    });'''
if old_rpc not in text:
    raise SystemExit('Bloco ADICIONAR_ANEXO não encontrado')
text = text.replace(old_rpc, new_rpc, 1)

old_wait = '''        const vinculo = await vincularFotoAoDesvio(
          supabase,
          auditoriaAtual,
          parede,
          id,
          preparada
        );
        if (vinculo.error) {
          marcarFoto("ERRO");
          toast.error(
            "O erro foi salvo, mas a foto não foi vinculada: " +
              vinculo.error.message
          );
          return;
        }

        marcarFoto(undefined);
        toast.success("Foto anexada ao desvio.");'''
new_wait = '''        /* O arquivo já chegou ao Storage: libera o feedback visual agora.
           O vínculo final usa um RPC específico e continua em background. */
        marcarFoto(undefined);
        void (async () => {
          const vinculo = await vincularFotoAoDesvio(
            supabase,
            auditoriaAtual,
            parede,
            id,
            preparada
          );
          if (vinculo.error) {
            marcarFoto("ERRO");
            toast.error(
              "O erro foi salvo, mas a foto não foi vinculada: " +
                vinculo.error.message
            );
            return;
          }
          toast.success("Foto anexada ao desvio.");
        })();'''
if old_wait not in text:
    raise SystemExit('Bloco de espera do vínculo não encontrado')
text = text.replace(old_wait, new_wait, 1)
path.write_text(text, encoding='utf-8')

workflow = repo / '.github/workflows/verify-production-build.yml'
w = workflow.read_text(encoding='utf-8')
needle = '          grep -Fq "Foto enviando…" src/components/auditoria/PainelParede.tsx\n'
addition = '          grep -Fq "qualidade_adicionar_anexo_fast" src/components/auditoria/AuditoriaCasa.tsx\n          grep -Fq "Tirar foto ou escolher imagem" src/components/auditoria/SeletorFoto.tsx\n'
if addition not in w:
    if needle not in w:
        raise SystemExit('Ponto de verificação CI não encontrado')
    w = w.replace(needle, needle + addition, 1)
workflow.write_text(w, encoding='utf-8')
