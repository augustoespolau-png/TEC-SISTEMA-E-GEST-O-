"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ConfigItem, Criticidade } from "@/lib/types";
import { MAX_FOTO_BYTES, otimizarFoto, tamanhoLegivel } from "@/lib/anexos";

export interface NovoErro {
  tipo_erro: string;
  setor: string;
  criticidade: Criticidade;
  ocorrencia: string;
  anexo?: File | null;
}

/* A terceira coluna é a classe de preenchimento: a tinta de dentro do
   chip é decisão do tema, não deste componente. */
const CRITICIDADES: [Criticidade, string, string][] = [
  ["CRITICO", "Crítico", "preenche-alta"],
  ["MEDIO", "Médio", "preenche-media"],
  ["BAIXO", "Baixo", "preenche-baixa"],
];

/** Formulário de um erro dentro da parede que está sendo auditada. */
export default function FormularioErro({
  tipos,
  setores,
  aoAdicionar,
  aoCancelar,
  salvando,
}: {
  tipos: ConfigItem[];
  setores: ConfigItem[];
  aoAdicionar: (e: NovoErro) => void;
  aoCancelar: () => void;
  salvando: boolean;
}) {
  const [tipo, setTipo] = useState("");
  const [tipoOutro, setTipoOutro] = useState("");
  const [setor, setSetor] = useState("");
  const [criticidade, setCriticidade] = useState<Criticidade | "">("");
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState("");
  const [menuFotoAberto, setMenuFotoAberto] = useState(false);
  const inputGaleria = useRef<HTMLInputElement>(null);
  const inputCamera = useRef<HTMLInputElement>(null);
  const seletorFoto = useRef<HTMLDivElement>(null);
  const selecaoFoto = useRef(0);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (!menuFotoAberto) return;

    function fecharAoClicarFora(event: PointerEvent) {
      if (!seletorFoto.current?.contains(event.target as Node)) {
        setMenuFotoAberto(false);
      }
    }

    function fecharComEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuFotoAberto(false);
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEsc);
    return () => {
      document.removeEventListener("pointerdown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEsc);
    };
  }, [menuFotoAberto]);

  const ehOutro = tipo === "OUTRO";
  const tipoFinal = ehOutro ? tipoOutro.trim().toUpperCase() : tipo;
  const pronto = Boolean(tipoFinal && setor && criticidade && texto.trim());

  async function selecionarFoto(event: ChangeEvent<HTMLInputElement>) {
    const escolhido = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!escolhido) return;

    const idSelecao = ++selecaoFoto.current;
    setErroFoto("");
    if (!escolhido.type.startsWith("image/")) {
      setArquivo(null);
      setPreview(null);
      setErroFoto("Escolha uma imagem para anexar.");
      return;
    }
    if (escolhido.size > MAX_FOTO_BYTES) {
      setArquivo(null);
      setPreview(null);
      setErroFoto("A foto precisa ter no máximo 20 MB.");
      return;
    }

    const previewOriginal = URL.createObjectURL(escolhido);
    setArquivo(escolhido);
    setPreview(previewOriginal);
    setProcessandoFoto(true);

    try {
      const otimizada = await otimizarFoto(escolhido);
      if (idSelecao !== selecaoFoto.current) {
        return;
      }
      const previewOtimizado = URL.createObjectURL(otimizada);
      setArquivo(otimizada);
      setPreview(previewOtimizado);
    } catch (error) {
      if (idSelecao !== selecaoFoto.current) return;
      setArquivo(null);
      setPreview(null);
      setErroFoto(
        error instanceof Error
          ? error.message
          : "Não foi possível otimizar a foto. Escolha outra imagem."
      );
    } finally {
      if (idSelecao === selecaoFoto.current) setProcessandoFoto(false);
    }
  }

  function removerFoto() {
    ++selecaoFoto.current;
    setArquivo(null);
    setPreview(null);
    setErroFoto("");
    setProcessandoFoto(false);
    setMenuFotoAberto(false);
  }

  function abrirFonteFoto(fonte: "camera" | "galeria") {
    setMenuFotoAberto(false);
    if (fonte === "camera") {
      inputCamera.current?.click();
    } else {
      inputGaleria.current?.click();
    }
  }

  return (
    <div
      className="grid gap-3 rounded-lg border p-3"
      style={{
        borderColor: "var(--color-line-2)",
        background: "var(--color-papel)",
      }}
    >
      <div>
        <label className="rotulo">Tipo de erro</label>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="campo"
          autoFocus
        >
          <option value="">Selecione</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.nome}>
              {t.nome}
            </option>
          ))}
          <option value="OUTRO">Outro (especificar)</option>
        </select>
      </div>

      {ehOutro && (
        <div>
          <label className="rotulo">Qual é o tipo de erro?</label>
          <input
            type="text"
            value={tipoOutro}
            onChange={(e) => setTipoOutro(e.target.value)}
            placeholder="Ex.: RODAPÉ"
            className="campo"
          />
          <p className="sub">
            Se esse tipo passar a ser comum, a gestão pode adicioná-lo à lista
            em Configurações.
          </p>
        </div>
      )}

      <div>
        <label className="rotulo">Setor onde foi detectado</label>
        <select
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
          className="campo"
        >
          <option value="">Selecione</option>
          {setores.map((s) => (
            <option key={s.id} value={s.nome}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="rotulo">Criticidade</label>
        <div className="grid grid-cols-3 gap-2">
          {CRITICIDADES.map(([v, rotulo, classe]) => {
            const on = criticidade === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setCriticidade(on ? "" : v)}
                className={`chip-esc ${on ? classe : ""}`}
              >
                {rotulo}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="rotulo">O que foi encontrado</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Descreva o problema para quem vai retrabalhar"
          className="campo"
        />
      </div>

      <div>
        <label className="rotulo">Anexo / foto do desvio (opcional)</label>
        <div className="anexo-captura">
          <input
            ref={inputGaleria}
            id="foto-desvio-galeria"
            type="file"
            accept="image/*"
            onChange={selecionarFoto}
            className="anexo-input"
          />
          <input
            ref={inputCamera}
            id="foto-desvio-camera"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={selecionarFoto}
            className="anexo-input"
          />
          <div className="anexo-seletor" ref={seletorFoto}>
            {preview ? (
              <div className="anexo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Pré-visualização da foto do desvio"
                  className="anexo-imagem"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-ink">
                    {arquivo?.name ?? "Foto selecionada"}
                  </p>
                  <p className="sub">
                    {arquivo ? tamanhoLegivel(arquivo.size) : ""}
                    {processandoFoto ? " · preparando foto…" : " · pronta para salvar"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setMenuFotoAberto((aberto) => !aberto)}
                      className="btn"
                      disabled={salvando || processandoFoto}
                      aria-expanded={menuFotoAberto}
                      aria-haspopup="menu"
                      style={{ fontSize: 11, padding: "5px 9px" }}
                    >
                      Trocar foto
                    </button>
                    <button
                      type="button"
                      onClick={removerFoto}
                      className="btn"
                      disabled={salvando || processandoFoto}
                      style={{ fontSize: 11, padding: "5px 9px" }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              </div>
          ) : (
            <button
              type="button"
              className="anexo-escolher"
              onClick={() => setMenuFotoAberto((aberto) => !aberto)}
              disabled={salvando}
              aria-expanded={menuFotoAberto}
              aria-haspopup="menu"
            >
              <span className="anexo-icone" aria-hidden="true">
                ▣
              </span>
              <span>
                <b>Tirar foto ou escolher imagem</b>
                <small>Use a câmera do celular/tablet ou a galeria</small>
              </span>
            </button>
            )}
            {menuFotoAberto && (
              <div className="anexo-opcoes" role="menu" aria-label="Escolher origem da imagem">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => abrirFonteFoto("camera")}
                  disabled={salvando || processandoFoto}
                >
                  <span aria-hidden="true">▣</span>
                  <span>
                    <b>Tirar foto</b>
                    <small>Abrir a câmera do dispositivo</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => abrirFonteFoto("galeria")}
                  disabled={salvando || processandoFoto}
                >
                  <span aria-hidden="true">▤</span>
                  <span>
                    <b>Escolher da galeria</b>
                    <small>Selecionar uma imagem já salva</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        {erroFoto && (
          <p className="sub" style={{ color: "var(--color-alta)" }}>
            {erroFoto}
          </p>
        )}
        <p className="sub">
          A imagem será compactada para agilizar o envio e ficará vinculada a
          este desvio e à parede atual.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={aoCancelar} className="btn" disabled={salvando}>
          Cancelar
        </button>
        <button
          onClick={() =>
            aoAdicionar({
              tipo_erro: tipoFinal,
              setor,
              criticidade: criticidade as Criticidade,
              ocorrencia: texto.trim(),
              anexo: arquivo,
            })
          }
          disabled={!pronto || salvando || processandoFoto}
          className="btn btn-forte flex-1"
        >
          {salvando ? "Salvando…" : "Adicionar erro"}
        </button>
      </div>
    </div>
  );
}
