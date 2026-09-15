from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"{label}: trecho não encontrado em {path}")
    p.write_text(s.replace(old, new, 1))


replace_once(
    "src/lib/auditoria.ts",
    "  anexos?: AnexoDaAuditoria[];\n}",
    "  anexos?: AnexoDaAuditoria[];\n  /** Estado efêmero da foto no cliente; não é persistido nem entra no FPY. */\n  fotoStatus?: \"ENVIANDO\" | \"ERRO\";\n}",
    "fotoStatus",
)

Path("src/components/auditoria/SeletorFoto.tsx").write_text(r'''"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { MAX_FOTO_BYTES, tamanhoLegivel } from "@/lib/anexos";

/**
 * Seletor de foto da auditoria.
 *
 * O arquivo original é entregue ao formulário imediatamente. Resize/encode
 * acontecem somente no job de upload em background, depois do envio do
 * desvio já ter sido disparado; escolher uma foto nunca trava o submit.
 */
export default function SeletorFoto({
  id,
  titulo,
  descricao,
  salvando,
  onArquivoPronto,
}: {
  id: string;
  titulo: string;
  descricao: string;
  salvando: boolean;
  onArquivoPronto: (arquivo: File | null) => void;
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function selecionar(event: ChangeEvent<HTMLInputElement>) {
    const escolhido = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!escolhido) return;

    setErro("");
    if (!escolhido.type.startsWith("image/")) {
      setArquivo(null);
      setPreview(null);
      onArquivoPronto(null);
      setErro("Escolha uma imagem para anexar.");
      return;
    }
    if (escolhido.size > MAX_FOTO_BYTES) {
      setArquivo(null);
      setPreview(null);
      onArquivoPronto(null);
      setErro("A foto precisa ter no máximo 20 MB.");
      return;
    }

    setArquivo(escolhido);
    setPreview(URL.createObjectURL(escolhido));
    onArquivoPronto(escolhido);
  }

  function remover() {
    setArquivo(null);
    setPreview(null);
    onArquivoPronto(null);
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
                  {arquivo ? tamanhoLegivel(arquivo.size) : ""} · será compactada e enviada em segundo plano
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => input.current?.click()} className="btn" disabled={salvando} style={{ fontSize: 11, padding: "5px 9px" }}>
                    Trocar foto
                  </button>
                  <button type="button" onClick={remover} className="btn" disabled={salvando} style={{ fontSize: 11, padding: "5px 9px" }}>
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

p = Path("src/components/auditoria/FormularioErro.tsx")
s = p.read_text()
s = s.replace('import { useState } from "react";', 'import { useRef, useState } from "react";', 1)
s = s.replace(
    '  const [arquivo, setArquivo] = useState<File | null>(null);\n  const [processandoFoto, setProcessandoFoto] = useState(false);',
    '  const [arquivo, setArquivo] = useState<File | null>(null);\n  const submetendoRef = useRef(false);',
    1,
)
alvo = '  const pronto = Boolean(tipoFinal && setor && criticidade && texto.trim());\n\n  return ('
novo = '''  const pronto = Boolean(tipoFinal && setor && criticidade && texto.trim());

  function enviar() {
    if (!pronto || salvando || submetendoRef.current) return;
    submetendoRef.current = true;
    aoAdicionar({
      tipo_erro: tipoFinal,
      setor,
      criticidade: criticidade as Criticidade,
      ocorrencia: texto.trim(),
      anexo: arquivo,
    });
  }

  return ('''
if alvo not in s:
    raise SystemExit("FormularioErro: inserir enviar falhou")
s = s.replace(alvo, novo, 1)
s = s.replace('        onProcessando={setProcessandoFoto}\n', '', 1)
s, n = re.subn(
    r'          onClick=\{\(\) =>\s*aoAdicionar\(\{.*?\}\)\s*\}\n          disabled=\{!pronto \|\| salvando \|\| processandoFoto\}',
    '          onClick={enviar}\n          disabled={!pronto || salvando}',
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit("FormularioErro: botão antigo não encontrado")
s = s.replace('{salvando ? "Salvando…" : "Adicionar erro"}', 'Adicionar erro', 1)
if "processandoFoto" in s:
    raise SystemExit("FormularioErro: processandoFoto ainda presente")
p.write_text(s)

p = Path("src/components/auditoria/FormularioNa.tsx")
s = p.read_text()
s = s.replace(
    '  const seletorRef = useRef<HTMLDivElement>(null);',
    '  const seletorRef = useRef<HTMLDivElement>(null);\n  const submetendoRef = useRef(false);',
    1,
)
alvo = '''  function alternarMenu() {
    if (!menuAberto) {
      setMenuParaCima(menuDeveAbrirParaCima(seletorRef.current));
    }
    setMenuAberto((aberto) => !aberto);
  }

  return ('''
novo = '''  function alternarMenu() {
    if (!menuAberto) {
      setMenuParaCima(menuDeveAbrirParaCima(seletorRef.current));
    }
    setMenuAberto((aberto) => !aberto);
  }

  function enviar() {
    if (tiposFinais.length === 0 || salvando || submetendoRef.current) return;
    submetendoRef.current = true;
    aoAdicionar({ tipos_erro: tiposFinais, observacao: texto.trim() });
  }

  return ('''
if alvo not in s:
    raise SystemExit("FormularioNa: inserir enviar falhou")
s = s.replace(alvo, novo, 1)
s = s.replace(
    '          onClick={() => aoAdicionar({ tipos_erro: tiposFinais, observacao: texto.trim() })}',
    '          onClick={enviar}',
    1,
)
old_text = '''          {salvando
            ? "Salvando…"
            : tiposFinais.length > 0
              ? `Adicionar ${tiposFinais.length} ${tiposFinais.length === 1 ? "NA" : "NAs"}`
              : "Adicionar NAs"}'''
new_text = '''          {tiposFinais.length > 0
            ? `Adicionar ${tiposFinais.length} ${tiposFinais.length === 1 ? "NA" : "NAs"}`
            : "Adicionar NAs"}'''
if old_text not in s:
    raise SystemExit("FormularioNa: texto botão não encontrado")
s = s.replace(old_text, new_text, 1)
p.write_text(s)

p = Path("src/components/auditoria/PainelParede.tsx")
s = p.read_text()
s = s.replace('  aoAdicionarErro: (e: NovoErro, dia: string) => Promise<void>;', '  aoAdicionarErro: (e: NovoErro, dia: string) => void;', 1)
s = s.replace('  aoAdicionarNa: (n: NovoNa) => Promise<void>;', '  aoAdicionarNa: (n: NovoNa) => void;', 1)
s = s.replace(
    '                <SeloStatus status={e.status} />\n                <span className="ml-auto text-[11px] text-ink-3">',
    '''                <SeloStatus status={e.status} />
                {e.fotoStatus === "ENVIANDO" && (
                  <span className="chip" title="Foto sendo compactada/enviada em segundo plano">◌ Foto enviando…</span>
                )}
                {e.fotoStatus === "ERRO" && (
                  <span className="chip" style={{ color: "var(--color-alta)" }} title="O desvio foi salvo, mas a foto não sincronizou">⚠ Foto pendente</span>
                )}
                <span className="ml-auto text-[11px] text-ink-3">''',
    1,
)
old = '''          aoAdicionar={async (e) => {
            const envio = aoAdicionarErro(e, dia);
            setAdicionando(false);
            await envio;
          }}'''
new = '''          aoAdicionar={(e) => {
            setAdicionando(false);
            aoAdicionarErro(e, dia);
          }}'''
if old not in s:
    raise SystemExit("PainelParede: handler erro não encontrado")
s = s.replace(old, new, 1)
old = '''          aoAdicionar={async (n) => {
            const envio = aoAdicionarNa(n);
            setAdicionandoNa(false);
            await envio;
          }}'''
new = '''          aoAdicionar={(n) => {
            setAdicionandoNa(false);
            aoAdicionarNa(n);
          }}'''
if old not in s:
    raise SystemExit("PainelParede: handler NA não encontrado")
s = s.replace(old, new, 1)
p.write_text(s)

p = Path("src/components/auditoria/AuditoriaCasa.tsx")
s = p.read_text()
s = s.replace(
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
    'import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";',
    1,
)
s = s.replace(
    '  enviarFotoAuditoria,\n} from "@/lib/anexos";',
    '  enviarFotoAuditoria,\n  otimizarFoto,\n} from "@/lib/anexos";',
    1,
)
s = s.replace('  situacaoDaParede,\n', '', 1)
s = s.replace(
    '  const [nas, setNas] = useState<NaDaAuditoria[]>([]);',
    '''  const [nas, setNas] = useState<NaDaAuditoria[]>([]);
  const datasRef = useRef<Record<string, string>>({});
  const errosRef = useRef<ErroDaAuditoria[]>([]);
  const nasRef = useRef<NaDaAuditoria[]>([]);
  const auditoriaIdRef = useRef<string | null>(null);
  datasRef.current = datas;
  errosRef.current = erros;
  nasRef.current = nas;
  auditoriaIdRef.current = auditoria?.id ?? null;''',
    1,
)
alvo = '''  }, [anexosProjetoParede, auditoria?.projeto, cfg, paredeAberta, projeto]);

  async function persistirObra'''
novo = '''  }, [anexosProjetoParede, auditoria?.projeto, cfg, paredeAberta, projeto]);

  const errosPorParede = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const erro of erros) mapa.set(erro.parede, (mapa.get(erro.parede) ?? 0) + 1);
    return mapa;
  }, [erros]);
  const errosDaParedeAberta = useMemo(
    () => (paredeAberta ? erros.filter((erro) => erro.parede === paredeAberta) : []),
    [erros, paredeAberta]
  );
  const nasDaParedeAberta = useMemo(
    () => (paredeAberta ? nas.filter((item) => item.parede === paredeAberta) : []),
    [nas, paredeAberta]
  );
  const alternarParede = useCallback((parede: string) => {
    setParedeAberta((atual) => (atual === parede ? null : parede));
  }, []);

  async function persistirObra'''
if alvo not in s:
    raise SystemExit("AuditoriaCasa: ponto dos memos não encontrado")
s = s.replace(alvo, novo, 1)
old = '''    let caminho: string;
    try {
      caminho = await enviarFotoAuditoria(supabase, {
        usuarioId: usuario.user.id,
        projetoId,
        casaId: auditoria.casa,
        paredeId,
        anexoId: anexoUid,
        extensao: "jpg",
        arquivo,
      });'''
new = '''    let caminho: string;
    let arquivoOtimizado: File;
    try {
      arquivoOtimizado = await otimizarFoto(arquivo);
      caminho = await enviarFotoAuditoria(supabase, {
        usuarioId: usuario.user.id,
        projetoId,
        casaId: auditoria.casa,
        paredeId,
        anexoId: anexoUid,
        extensao: "jpg",
        arquivo: arquivoOtimizado,
      });'''
if old not in s:
    raise SystemExit("AuditoriaCasa: upload antigo não encontrado")
s = s.replace(old, new, 1)
s = s.replace(
    '        name: arquivo.name,\n        type: "image/jpeg",\n        size: arquivo.size,',
    '        name: arquivoOtimizado.name,\n        type: "image/jpeg",\n        size: arquivoOtimizado.size,',
    1,
)

pattern = re.compile(r'  async function adicionarErro\(parede: string, novo: NovoErro, dia: string\) \{.*?\n  \}\n\n  /\* NA não confere a parede:', re.S)
novo_erro = r'''  function adicionarErro(parede: string, novo: NovoErro, dia: string) {
    if (!auditoria) return;
    const auditoriaAtual = auditoria;
    const auditoriaId = auditoriaAtual.id;
    const supabase = createClient();
    const { anexo, ...dadosErro } = novo;
    const idOtimista = `optimistic-error-${crypto.randomUUID()}`;
    const tinhaDataAntes = Boolean(datasRef.current[parede]);
    const novasDatas = { ...datasRef.current, [parede]: dia };
    const erroOtimista: ErroDaAuditoria = {
      id: idOtimista,
      parede,
      setor: dadosErro.setor,
      tipo_erro: dadosErro.tipo_erro,
      ocorrencia: dadosErro.ocorrencia,
      criticidade: dadosErro.criticidade,
      status: "AGUARDANDO",
      anexos: [],
      fotoStatus: anexo ? "ENVIANDO" : undefined,
    };
    const novosErros = [...errosRef.current, erroOtimista];

    datasRef.current = novasDatas;
    errosRef.current = novosErros;
    setDatas(novasDatas);
    setErros(novosErros);
    atualizarResumoLocal(auditoriaAtual, novasDatas, novosErros);
    toast.success(anexo ? "Erro adicionado. Foto sincronizando em segundo plano." : "Erro adicionado. Sincronizando em segundo plano.");

    const rollback = (mensagem: string) => {
      if (auditoriaIdRef.current !== auditoriaId) {
        toast.error(mensagem);
        return;
      }
      const errosAtuais = errosRef.current.filter((item) => item.id !== idOtimista);
      let datasAtuais = datasRef.current;
      if (!tinhaDataAntes && !errosAtuais.some((item) => item.parede === parede)) {
        const copia = { ...datasAtuais };
        delete copia[parede];
        datasAtuais = copia;
      }
      errosRef.current = errosAtuais;
      datasRef.current = datasAtuais;
      setErros(errosAtuais);
      setDatas(datasAtuais);
      atualizarResumoLocal(auditoriaAtual, datasAtuais, errosAtuais);
      toast.error(mensagem);
    };

    void (async () => {
      try {
        const { data: criacao, error } = await mutarQualidade("REGISTRAR_DESVIO", {
          data: dia,
          projeto: auditoriaAtual.projeto,
          casa: auditoriaAtual.casa,
          parede,
          auditoria_id: auditoriaId,
          ...dadosErro,
        });
        const id = (criacao as { id?: string } | null)?.id;
        if (error || !id) {
          rollback("Não foi possível sincronizar o erro: " + (error?.message ?? "sem identificador retornado"));
          return;
        }
        if (auditoriaIdRef.current !== auditoriaId) return;

        let atualizados = errosRef.current.map((item) => item.id === idOtimista ? { ...item, id } : item);
        errosRef.current = atualizados;
        setErros(atualizados);

        void (async () => {
          const leitura = await supabase
            .from("ocorrencias")
            .select("id, parede, setor, tipo_erro, ocorrencia, criticidade, status")
            .eq("id", id)
            .single();
          if (leitura.error || !leitura.data || auditoriaIdRef.current !== auditoriaId) return;
          const reconciliados = errosRef.current.map((item) =>
            item.id === id
              ? { ...(leitura.data as ErroDaAuditoria), anexos: item.anexos ?? [], fotoStatus: item.fotoStatus }
              : item
          );
          errosRef.current = reconciliados;
          setErros(reconciliados);
        })();

        if (!anexo) return;
        const anexoSalvo = await salvarFotoDoDesvio(supabase, parede, id, anexo);
        if (auditoriaIdRef.current !== auditoriaId) {
          if (anexoSalvo.error) toast.error("O erro foi salvo, mas a foto não sincronizou: " + anexoSalvo.error.message);
          return;
        }
        atualizados = errosRef.current.map((item) =>
          item.id === id ? { ...item, fotoStatus: anexoSalvo.error ? "ERRO" : undefined } : item
        );
        errosRef.current = atualizados;
        setErros(atualizados);
        if (anexoSalvo.error) {
          toast.error("O erro foi salvo, mas a foto não sincronizou: " + anexoSalvo.error.message);
        } else {
          toast.success("Foto anexada ao desvio.");
        }
      } catch (caught) {
        rollback("Não foi possível sincronizar o erro: " + (caught instanceof Error ? caught.message : "falha de conexão"));
      }
    })();
  }

  /* NA não confere a parede:'''
s, n = pattern.subn(novo_erro, s, count=1)
if n != 1:
    raise SystemExit(f"AuditoriaCasa: substituir adicionarErro falhou ({n})")

pattern = re.compile(r'  async function adicionarNa\(parede: string, novo: NovoNa\) \{.*?\n  \}\n\n  async function removerNa', re.S)
novo_na = r'''  function adicionarNa(parede: string, novo: NovoNa) {
    if (!auditoria) return;
    const auditoriaId = auditoria.id;
    const supabase = createClient();
    const itens = novo.tipos_erro.map((tipo_erro) => ({ tipo_erro, observacao: novo.observacao || null }));
    const idsOtimistas = itens.map(() => `optimistic-na-${crypto.randomUUID()}`);
    const nasOtimistas: NaDaAuditoria[] = itens.map((item, indice) => ({
      id: idsOtimistas[indice],
      parede,
      tipo_erro: item.tipo_erro,
      observacao: item.observacao,
    }));
    const novosNas = [...nasRef.current, ...nasOtimistas];
    nasRef.current = novosNas;
    setNas(novosNas);
    toast.success(`${itens.length} ${itens.length === 1 ? "NA adicionado" : "NAs adicionados"}. Sincronizando em segundo plano.`);

    const rollback = (mensagem: string) => {
      if (auditoriaIdRef.current !== auditoriaId) {
        toast.error(mensagem);
        return;
      }
      const atuais = nasRef.current.filter((item) => !idsOtimistas.includes(item.id));
      nasRef.current = atuais;
      setNas(atuais);
      toast.error(mensagem);
    };

    void (async () => {
      try {
        const { error } = await mutarQualidade("ADICIONAR_NAS", {
          auditoria_id: auditoriaId,
          parede,
          itens,
        });
        if (error) {
          rollback("Não foi possível sincronizar os NAs: " + error.message);
          return;
        }
        const leitura = await supabase
          .from("qualidade_auditoria_nas")
          .select("id, parede, tipo_erro, observacao")
          .eq("auditoria_id", auditoriaId)
          .eq("parede", parede)
          .order("id");
        if (leitura.error || auditoriaIdRef.current !== auditoriaId) return;
        const pendentesPosteriores = nasRef.current.filter(
          (item) => item.parede === parede && item.id.startsWith("optimistic-na-") && !idsOtimistas.includes(item.id)
        );
        const reconciliados = [
          ...nasRef.current.filter((item) => item.parede !== parede),
          ...((leitura.data ?? []) as NaDaAuditoria[]),
          ...pendentesPosteriores,
        ];
        nasRef.current = reconciliados;
        setNas(reconciliados);
      } catch (caught) {
        rollback("Não foi possível sincronizar os NAs: " + (caught instanceof Error ? caught.message : "falha de conexão"));
      }
    })();
  }

  async function removerNa'''
s, n = pattern.subn(novo_na, s, count=1)
if n != 1:
    raise SystemExit(f"AuditoriaCasa: substituir adicionarNa falhou ({n})")

old = '''              {paredesDoProjeto.map((p) => {
                const sit = situacaoDaParede(p, inspecionadas, erros);
                const qtd = erros.filter((e) => e.parede === p).length;
                return (
                  <button
                    key={p}
                    onClick={() => setParedeAberta(paredeAberta === p ? null : p)}
                    className={`chip-esc ${CLASSE_SITUACAO[sit]} ${
                      paredeAberta === p ? "selecionada" : ""
                    }`}
                    title={
                      sit === "OK"
                        ? "Sem erros"
                        : sit === "COM_ERROS"
                          ? `${qtd} erro(s)`
                          : "Ainda não conferida"
                    }
                  >
                    {p}
                    {qtd > 0 && <span className="num"> ·{qtd}</span>}
                  </button>
                );
              })}'''
new = '''              {paredesDoProjeto.map((p) => {
                const qtd = errosPorParede.get(p) ?? 0;
                const sit: SituacaoParede = qtd > 0 ? "COM_ERROS" : p in datas ? "OK" : "NAO_INSPECIONADA";
                return (
                  <ParedeChip
                    key={p}
                    parede={p}
                    situacao={sit}
                    qtd={qtd}
                    selecionada={paredeAberta === p}
                    aoAlternar={alternarParede}
                  />
                );
              })}'''
if old not in s:
    raise SystemExit("AuditoriaCasa: grade antiga não encontrada")
s = s.replace(old, new, 1)
s = s.replace('                erros={erros.filter((e) => e.parede === paredeAberta)}', '                erros={errosDaParedeAberta}', 1)
s = s.replace('                nas={nas.filter((n) => n.parede === paredeAberta)}', '                nas={nasDaParedeAberta}', 1)

marker = '/** A seta de "abre em outro lugar", no botão de abrir a casa. */'
componente = '''const ParedeChip = memo(function ParedeChip({
  parede,
  situacao,
  qtd,
  selecionada,
  aoAlternar,
}: {
  parede: string;
  situacao: SituacaoParede;
  qtd: number;
  selecionada: boolean;
  aoAlternar: (parede: string) => void;
}) {
  return (
    <button
      onClick={() => aoAlternar(parede)}
      className={`chip-esc ${CLASSE_SITUACAO[situacao]} ${selecionada ? "selecionada" : ""}`}
      title={situacao === "OK" ? "Sem erros" : situacao === "COM_ERROS" ? `${qtd} erro(s)` : "Ainda não conferida"}
    >
      {parede}
      {qtd > 0 && <span className="num"> ·{qtd}</span>}
    </button>
  );
});

'''
if marker not in s:
    raise SystemExit("AuditoriaCasa: marker ParedeChip ausente")
s = s.replace(marker, componente + marker, 1)
p.write_text(s)

print("Patch aplicado com sucesso")
