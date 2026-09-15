from pathlib import Path

p = Path("src/components/auditoria/AuditoriaCasa.tsx")
s = p.read_text()

old_refs = '''  const datasRef = useRef<Record<string, string>>({});
  const errosRef = useRef<ErroDaAuditoria[]>([]);
  const nasRef = useRef<NaDaAuditoria[]>([]);
  const auditoriaIdRef = useRef<string | null>(null);
  datasRef.current = datas;
  errosRef.current = erros;
  nasRef.current = nas;
  auditoriaIdRef.current = auditoria?.id ?? null;'''
new_refs = '''  const datasRef = useRef<Record<string, string>>({});
  const errosRef = useRef<ErroDaAuditoria[]>([]);
  const nasRef = useRef<NaDaAuditoria[]>([]);
  const auditoriaIdRef = useRef<string | null>(null);'''
if old_refs not in s:
    raise SystemExit("Bloco de refs gerado pelo patch não encontrado")
s = s.replace(old_refs, new_refs, 1)

marker = '''  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);

  /* ---------- listas de configuração ---------- */'''
replacement = '''  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);

  useEffect(() => {
    datasRef.current = datas;
  }, [datas]);
  useEffect(() => {
    errosRef.current = erros;
  }, [erros]);
  useEffect(() => {
    nasRef.current = nas;
  }, [nas]);
  useEffect(() => {
    auditoriaIdRef.current = auditoria?.id ?? null;
  }, [auditoria?.id]);

  /* ---------- listas de configuração ---------- */'''
if marker not in s:
    raise SystemExit("Ponto de sincronização das refs não encontrado")
s = s.replace(marker, replacement, 1)

old_switch = '''        if (auditoriaIdRef.current !== auditoriaId) return;

        let atualizados = errosRef.current.map((item) => item.id === idOtimista ? { ...item, id } : item);'''
new_switch = '''        if (auditoriaIdRef.current !== auditoriaId) {
          if (anexo) {
            const anexoSalvoForaDaTela = await salvarFotoDoDesvio(
              supabase,
              parede,
              id,
              anexo
            );
            if (anexoSalvoForaDaTela.error) {
              toast.error(
                "O erro foi salvo, mas a foto não sincronizou: " +
                  anexoSalvoForaDaTela.error.message
              );
            }
          }
          return;
        }

        let atualizados = errosRef.current.map((item) => item.id === idOtimista ? { ...item, id } : item);'''
if old_switch not in s:
    raise SystemExit("Guarda de troca de auditoria não encontrada")
s = s.replace(old_switch, new_switch, 1)

old_pending = '''        const pendentesPosteriores = nasRef.current.filter(
          (item) => item.parede === parede && item.id.startsWith("optimistic-na-") && !idsOtimistas.includes(item.id)
        );
        const reconciliados = [
          ...nasRef.current.filter((item) => item.parede !== parede),
          ...((leitura.data ?? []) as NaDaAuditoria[]),
          ...pendentesPosteriores,
        ];'''
new_pending = '''        const persistidos = (leitura.data ?? []) as NaDaAuditoria[];
        const tiposPersistidos = new Set(persistidos.map((item) => item.tipo_erro));
        const pendentesPosteriores = nasRef.current.filter(
          (item) =>
            item.parede === parede &&
            item.id.startsWith("optimistic-na-") &&
            !idsOtimistas.includes(item.id) &&
            !tiposPersistidos.has(item.tipo_erro)
        );
        const reconciliados = [
          ...nasRef.current.filter((item) => item.parede !== parede),
          ...persistidos,
          ...pendentesPosteriores,
        ];'''
if old_pending not in s:
    raise SystemExit("Reconciliação de N/A concorrente não encontrada")
s = s.replace(old_pending, new_pending, 1)

p.write_text(s)

# O seletor é compartilhado com o fluxo de retrabalho. Na Auditoria de Erro,
# sem onProcessando, devolve o original imediatamente para não bloquear o
# submit. Nos consumidores legados que usam onProcessando, mantém a compressão
# antes da entrega exatamente como antes.
Path("src/components/auditoria/SeletorFoto.tsx").write_text(r'''"use client";

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
''')

print("Correções pós-patch aplicadas")
