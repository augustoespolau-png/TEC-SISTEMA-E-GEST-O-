"use client";

import {
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  approveCadeiaLaudo,
  createCadeiaFornecedor,
  createCadeiaInspecao,
  createCadeiaLote,
  deleteCadeiaAnexo,
  deleteCadeiaLaudo,
  loadCadeiaMadeiraSnapshot,
  registerCadeiaAnexo,
  registerCadeiaLaudo,
  toggleCadeiaFornecedor,
  updateCadeiaFornecedor,
  updateCadeiaInspecao,
  updateCadeiaLote,
  type CadeiaFornecedorInput,
  type CadeiaInspecaoInput,
  type CadeiaLaudoInput,
  type CadeiaLoteInput,
} from "@/app/actions/cadeiaMadeira";
import {
  detalhesErroSupabase,
  extensaoParaMime,
  mimeArquivo,
  otimizarFoto,
  registrarErroSupabase,
  segmentoSeguro,
  textoErroSupabase,
} from "@/lib/anexos";
import {
  BUCKET_CADEIA_MADEIRA,
  CHECKLIST_RECEBIMENTO_MADEIRA,
  MAX_DOCUMENTO_CADEIA_BYTES,
  bytesMadeira,
  dataHoraMadeira,
  dataMadeira,
  LIMITE_UMIDADE_SEGURA,
  checklistRecebimentoVazio,
  loteUmidadeAlta,
  rotuloStatusLiberacao,
  rotuloTipoAnexo,
  rotuloTipoLaudo,
  COMPONENTES_ENSAIO_MADEIRA,
  STATUS_LIBERACAO_MADEIRA,
  TIPOS_ENSAIO_MADEIRA,
  TIPOS_LAUDO_MADEIRA,
  type CadeiaFornecedor,
  type CadeiaAnexo,
  type CadeiaInspecao,
  type CadeiaLaudo,
  type CadeiaLote,
  type CadeiaMadeiraSnapshot,
  type ChecklistRecebimentoMadeira,
  type ComponenteEnsaioMadeira,
  type StatusLiberacaoMadeira,
  type TipoAnexoCadeia,
  type TipoEnsaioMadeira,
  type TipoLaudoMadeira,
} from "@/lib/cadeiaMadeira";
import { createClient } from "@/lib/supabase/client";

export type AbaCadeia = "cadastro" | "lotes" | "laudos" | "inspecoes";


const ABA_POR_MODULO: Record<string, AbaCadeia> = {
  recebimento: "lotes",
  auditoria: "lotes",
  cadastro: "cadastro",
  laudos: "laudos",
  ensaios: "inspecoes",
};

const MODULO_POR_ABA: Record<AbaCadeia, string> = {
  cadastro: "cadastro",
  lotes: "auditoria",
  laudos: "laudos",
  inspecoes: "ensaios",
};

function abaPorModulo(modulo: string | null): AbaCadeia {
  return ABA_POR_MODULO[modulo ?? ""] ?? "lotes";
}

type FornecedorDraft = {
  id: string;
  razao_social: string;
  cnpj: string;
  homologacao_ativa: boolean;
  certificacao_origem: string;
  contato_tecnico_nome: string;
  contato_tecnico_email: string;
  contato_tecnico_telefone: string;
  historico_avaliacao: string;
  ativo: boolean;
};

type LoteDraft = {
  id: string;
  fornecedor_id: string;
  numero_nota_fiscal: string;
  volume_m3: string;
  data_recebimento: string;
  placa_veiculo: string;
  teor_umidade_medio: string;
  lote_autoclave: string;
  checklist: ChecklistRecebimentoMadeira;
  status_liberacao: StatusLiberacaoMadeira;
  observacoes: string;
  ativo: boolean;
};

type InspecaoDraft = {
  id: string;
  lote_id: string;
  data_inspecao: string;
  tipo_ensaio: TipoEnsaioMadeira;
  componente_ensaiado: ComponenteEnsaioMadeira;
  identificacao_prototipo: string;
  norma_procedimento: string;
  resultado_tecnico: string;
  bitola_nominal: string;
  dimensional_conforme: boolean;
  empenamento: boolean;
  fendas_profundas: boolean;
  nos_soltos: boolean;
  manchas_umidade_bolor: boolean;
  resultado: StatusLiberacaoMadeira;
  observacoes: string;
};

function dataLocal() {
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  return agora.toISOString().slice(0, 10);
}

function fornecedorVazio(): FornecedorDraft {
  return {
    id: "",
    razao_social: "",
    cnpj: "",
    homologacao_ativa: false,
    certificacao_origem: "",
    contato_tecnico_nome: "",
    contato_tecnico_email: "",
    contato_tecnico_telefone: "",
    historico_avaliacao: "",
    ativo: true,
  };
}

function fornecedorParaDraft(item: CadeiaFornecedor): FornecedorDraft {
  return {
    id: item.id,
    razao_social: item.razao_social,
    cnpj: item.cnpj ?? "",
    homologacao_ativa: item.homologacao_ativa,
    certificacao_origem: item.certificacao_origem ?? "",
    contato_tecnico_nome: item.contato_tecnico_nome ?? "",
    contato_tecnico_email: item.contato_tecnico_email ?? "",
    contato_tecnico_telefone: item.contato_tecnico_telefone ?? "",
    historico_avaliacao: item.historico_avaliacao ?? "",
    ativo: item.ativo,
  };
}

function loteVazio(fornecedorId = ""): LoteDraft {
  return {
    id: "",
    fornecedor_id: fornecedorId,
    numero_nota_fiscal: "",
    volume_m3: "",
    data_recebimento: dataLocal(),
    placa_veiculo: "",
    teor_umidade_medio: "",
    lote_autoclave: "",
    checklist: checklistRecebimentoVazio(),
    status_liberacao: "QUARENTENA",
    observacoes: "",
    ativo: true,
  };
}

function loteParaDraft(item: CadeiaLote): LoteDraft {
  return {
    id: item.id,
    fornecedor_id: item.fornecedor_id,
    numero_nota_fiscal: item.numero_nota_fiscal,
    volume_m3: String(item.volume_m3),
    data_recebimento: item.data_recebimento.slice(0, 10),
    placa_veiculo: item.placa_veiculo ?? "",
    teor_umidade_medio: String(item.teor_umidade_medio),
    lote_autoclave: item.lote_autoclave,
    checklist: { ...item.checklist },
    status_liberacao: item.status_liberacao,
    observacoes: item.observacoes ?? "",
    ativo: item.ativo,
  };
}

function inspecaoVazia(loteId = ""): InspecaoDraft {
  return {
    id: "",
    lote_id: loteId,
    data_inspecao: dataLocal(),
    tipo_ensaio: "RECEBIMENTO_MADEIRA",
    componente_ensaiado: "MADEIRA_ESTRUTURAL",
    identificacao_prototipo: "",
    norma_procedimento: "",
    resultado_tecnico: "",
    bitola_nominal: "",
    dimensional_conforme: true,
    empenamento: false,
    fendas_profundas: false,
    nos_soltos: false,
    manchas_umidade_bolor: false,
    resultado: "APROVADO",
    observacoes: "",
  };
}

function inspecaoParaDraft(item: CadeiaInspecao): InspecaoDraft {
  return {
    id: item.id,
    lote_id: item.lote_id,
    data_inspecao: item.data_inspecao.slice(0, 10),
    tipo_ensaio: item.tipo_ensaio,
    componente_ensaiado: item.componente_ensaiado,
    identificacao_prototipo: item.identificacao_prototipo ?? "",
    norma_procedimento: item.norma_procedimento ?? "",
    resultado_tecnico: item.resultado_tecnico ?? "",
    bitola_nominal: item.bitola_nominal ?? "",
    dimensional_conforme: item.dimensional_conforme,
    empenamento: item.empenamento,
    fendas_profundas: item.fendas_profundas,
    nos_soltos: item.nos_soltos,
    manchas_umidade_bolor: item.manchas_umidade_bolor,
    resultado: item.resultado,
    observacoes: item.observacoes ?? "",
  };
}

function erroLocal(error: unknown) {
  return textoErroSupabase(error) || detalhesErroSupabase(error).message;
}

type TipoUploadCadeia = "LAUDO" | TipoAnexoCadeia;

function pastaUploadCadeia(tipo: TipoUploadCadeia) {
  if (tipo === "FOTO_INSPECAO") return "fotos-inspecao";
  if (tipo === "MTR") return "mtr";
  return "";
}

async function enviarArquivoCadeia(
  original: File,
  tipo: TipoUploadCadeia,
  loteId: string,
  userId: string,
) {
  if (original.size <= 0 || original.size > MAX_DOCUMENTO_CADEIA_BYTES) {
    throw new Error("O documento precisa ter entre 1 byte e 20 MB.");
  }
  const originalMime = mimeArquivo(original);
  const isImage = originalMime.startsWith("image/");
  const isPdf = originalMime === "application/pdf";
  if (tipo === "FOTO_INSPECAO" && !isImage) {
    throw new Error("A foto da inspeção precisa ser uma imagem.");
  }
  if (!isImage && !isPdf) throw new Error("Use um PDF ou uma imagem.");
  const ready = isImage ? await otimizarFoto(original) : original;
  const readyMime = mimeArquivo(ready) || originalMime;
  const extension = extensaoParaMime(readyMime);
  const name = segmentoSeguro(ready.name.replace(/\.[^.]+$/, "")) || "documento";
  const fileId = crypto.randomUUID();
  const folder = pastaUploadCadeia(tipo);
  const path = folder
    ? `${BUCKET_CADEIA_MADEIRA}/${segmentoSeguro(userId)}/${segmentoSeguro(loteId)}/${folder}/${fileId}_${name}.${extension}`
    : `${BUCKET_CADEIA_MADEIRA}/${segmentoSeguro(userId)}/${segmentoSeguro(loteId)}/${fileId}_${name}.${extension}`;
  const supabase = createClient();
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const upload = await supabase.storage.from(BUCKET_CADEIA_MADEIRA).upload(path, ready, {
        cacheControl: "3600",
        contentType: readyMime,
        upsert: true,
      });
      if (!upload.error) return { path, ready, readyMime };
      lastError = upload.error;
      registrarErroSupabase(`cadeia-madeira/upload-${tipo.toLowerCase()} tentativa ${attempt}`, upload.error);
    } catch (error) {
      lastError = error;
      registrarErroSupabase(`cadeia-madeira/upload-${tipo.toLowerCase()} tentativa ${attempt}`, error);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 350));
  }
  throw lastError ?? new Error("Não foi possível enviar o arquivo.");
}

export default function CadeiaMadeira({
  initialSnapshot,
  initialError,
  canEdit,
  canManage,
}: {
  initialSnapshot: CadeiaMadeiraSnapshot;
  initialError?: string;
  canEdit: boolean;
  canManage: boolean;
}) {
  const busca = useSearchParams();
  const aba = abaPorModulo(busca.get("modulo"));
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fornecedorDraft, setFornecedorDraft] = useState<FornecedorDraft | null>(null);
  const [loteDraft, setLoteDraft] = useState<LoteDraft | null>(null);
  const [inspecaoDraft, setInspecaoDraft] = useState<InspecaoDraft | null>(null);
  const [selectedLoteId, setSelectedLoteId] = useState(initialSnapshot.lotes[0]?.id ?? "");
  const [fileBusy, setFileBusy] = useState(false);
  const [tipoLaudo, setTipoLaudo] = useState<TipoLaudoMadeira>("LAUDO_TECNICO");
  const [validadeLaudo, setValidadeLaudo] = useState("");
  const [observacaoLaudo, setObservacaoLaudo] = useState("");

  function selecionarAba(next: AbaCadeia) {
    const params = new URLSearchParams(busca.toString());
    params.set("modulo", MODULO_POR_ABA[next]);
    const destino = `/cadeia-madeira?${params.toString()}`;

    // Next 16 sincroniza pushState com useSearchParams sem refazer a Server
    // Component. Assim a troca entre submódulos é imediata e preserva o snapshot.
    window.history.pushState(null, "", destino);
  }

  const selectedLote = useMemo(
    () => snapshot.lotes.find((item) => item.id === selectedLoteId) ?? null,
    [selectedLoteId, snapshot.lotes],
  );
  const selectedInspecoes = useMemo(
    () => snapshot.inspecoes.filter((item) => item.lote_id === selectedLoteId),
    [selectedLoteId, snapshot.inspecoes],
  );
  const selectedLaudos = useMemo(
    () => snapshot.laudos.filter((item) => item.lote_id === selectedLoteId),
    [selectedLoteId, snapshot.laudos],
  );
  const selectedAnexos = useMemo(
    () => snapshot.anexos.filter((item) => item.lote_id === selectedLoteId),
    [selectedLoteId, snapshot.anexos],
  );
  const selectedMtrAnexos = useMemo(
    () => selectedAnexos.filter((item) => item.tipo === "MTR"),
    [selectedAnexos],
  );

  const load = useCallback(
    async (page = snapshot.page) => {
      setLoading(true);
      const result = await loadCadeiaMadeiraSnapshot(page);
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setError("");
      setSnapshot(result.data);
      if (
        selectedLoteId &&
        !result.data.lotes.some((item) => item.id === selectedLoteId)
      ) {
        setSelectedLoteId(result.data.lotes[0]?.id ?? "");
      }
    },
    [selectedLoteId, snapshot.page],
  );

  async function salvarFornecedor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fornecedorDraft || !canEdit) return;
    setSaving(true);
    const payload: CadeiaFornecedorInput = {
      ...fornecedorDraft,
      cnpj: fornecedorDraft.cnpj || null,
      certificacao_origem: fornecedorDraft.certificacao_origem || null,
      contato_tecnico_nome: fornecedorDraft.contato_tecnico_nome || null,
      contato_tecnico_email: fornecedorDraft.contato_tecnico_email || null,
      contato_tecnico_telefone: fornecedorDraft.contato_tecnico_telefone || null,
      historico_avaliacao: fornecedorDraft.historico_avaliacao || null,
    };
    const result = fornecedorDraft.id
      ? await updateCadeiaFornecedor(payload)
      : await createCadeiaFornecedor(payload);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setFornecedorDraft(null);
    toast.success(fornecedorDraft.id ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
    await load(snapshot.page);
  }

  async function alternarFornecedor(item: CadeiaFornecedor) {
    if (!canEdit) return;
    const acao = item.ativo ? "desativar" : "reativar";
    if (!window.confirm(`Deseja ${acao} o fornecedor ${item.razao_social}?`)) return;
    const result = await toggleCadeiaFornecedor(item.id, !item.ativo);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(item.ativo ? "Fornecedor desativado." : "Fornecedor reativado.");
    await load(snapshot.page);
  }

  async function salvarLote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loteDraft || !canEdit) return;
    setSaving(true);
    const payload: CadeiaLoteInput = {
      ...loteDraft,
      volume_m3: loteDraft.volume_m3,
      teor_umidade_medio: loteDraft.teor_umidade_medio,
      placa_veiculo: loteDraft.placa_veiculo || null,
      observacoes: loteDraft.observacoes || null,
    };
    const result = loteDraft.id ? await updateCadeiaLote(payload) : await createCadeiaLote(payload);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLoteDraft(null);
    setSelectedLoteId(result.data.id);
    toast.success(loteDraft.id ? "Lote atualizado." : "Lote recebido e salvo.");
    await load(snapshot.page);
  }

  async function salvarInspecao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inspecaoDraft || !canEdit) return;
    setSaving(true);
    const payload: CadeiaInspecaoInput = {
      ...inspecaoDraft,
      bitola_nominal: inspecaoDraft.bitola_nominal || null,
      observacoes: inspecaoDraft.observacoes || null,
    };
    const result = inspecaoDraft.id
      ? await updateCadeiaInspecao(payload)
      : await createCadeiaInspecao(payload);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setInspecaoDraft(null);
    toast.success(inspecaoDraft.id ? "Inspeção atualizada." : "Inspeção registrada.");
    await load(snapshot.page);
  }

  async function anexarLaudo(event: ChangeEvent<HTMLInputElement>) {
    const original = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!original || !selectedLote || !canEdit || fileBusy) return;
    setFileBusy(true);
    let path = "";
    let uploaded = false;
    try {
      const userResult = await createClient().auth.getUser();
      const userId = userResult.data.user?.id;
      if (!userId) throw new Error("Sua sessão expirou. Entre novamente.");
      const arquivo = await enviarArquivoCadeia(original, "LAUDO", selectedLote.id, userId);
      path = arquivo.path;
      uploaded = true;

      const payload: CadeiaLaudoInput = {
        lote_id: selectedLote.id,
        tipo: tipoLaudo,
        nome_arquivo: arquivo.ready.name,
        mime_type: arquivo.readyMime,
        tamanho_bytes: arquivo.ready.size,
        storage_path: path,
        validade_ate: validadeLaudo || null,
        observacoes: observacaoLaudo || null,
      };
      const linked = await registerCadeiaLaudo(payload);
      if (!linked.ok) throw new Error(linked.error);
      setValidadeLaudo("");
      setObservacaoLaudo("");
      toast.success("Documento anexado ao lote.");
      await load(snapshot.page);
    } catch (caught) {
      registrarErroSupabase("cadeia-madeira/anexar-laudo", caught);
      if (uploaded && path) {
        const cleanup = await createClient().storage.from(BUCKET_CADEIA_MADEIRA).remove([path]);
        if (cleanup.error) registrarErroSupabase("cadeia-madeira/limpar-upload", cleanup.error);
      }
      toast.error("Não foi possível salvar o documento: " + erroLocal(caught));
    } finally {
      setFileBusy(false);
    }
  }

  async function anexarAnexo(
    event: ChangeEvent<HTMLInputElement>,
    tipo: TipoAnexoCadeia,
    loteId: string,
    inspecaoId: string | null,
  ) {
    const original = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!original || !canEdit || fileBusy) return;
    setFileBusy(true);
    let path = "";
    let uploaded = false;
    try {
      const userResult = await createClient().auth.getUser();
      const userId = userResult.data.user?.id;
      if (!userId) throw new Error("Sua sessão expirou. Entre novamente.");
      const arquivo = await enviarArquivoCadeia(original, tipo, loteId, userId);
      path = arquivo.path;
      uploaded = true;
      const linked = await registerCadeiaAnexo({
        lote_id: loteId,
        inspecao_id: inspecaoId,
        tipo,
        nome_arquivo: arquivo.ready.name,
        mime_type: arquivo.readyMime,
        tamanho_bytes: arquivo.ready.size,
        storage_path: path,
        observacoes: null,
      });
      if (!linked.ok) throw new Error(linked.error);
      toast.success(tipo === "MTR" ? "MTR anexado ao lote." : "Foto vinculada à inspeção.");
      await load(snapshot.page);
    } catch (caught) {
      registrarErroSupabase(`cadeia-madeira/anexar-${tipo.toLowerCase()}`, caught);
      if (uploaded && path) {
        const cleanup = await createClient().storage.from(BUCKET_CADEIA_MADEIRA).remove([path]);
        if (cleanup.error) registrarErroSupabase("cadeia-madeira/limpar-upload-anexo", cleanup.error);
      }
      toast.error("Não foi possível salvar o anexo: " + erroLocal(caught));
    } finally {
      setFileBusy(false);
    }
  }

  async function aprovarLaudo(item: CadeiaLaudo, aprovado: boolean) {
    if (!canManage) return;
    const result = await approveCadeiaLaudo(item.id, aprovado);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(aprovado ? "Laudo aprovado formalmente." : "Aprovação removida.");
    await load(snapshot.page);
  }

  async function removerLaudo(item: CadeiaLaudo) {
    if (!canEdit || !window.confirm(`Remover o documento ${item.nome_arquivo}?`)) return;
    const result = await deleteCadeiaLaudo(item.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Documento removido.");
    await load(snapshot.page);
  }

  async function removerAnexo(item: CadeiaAnexo) {
    if (!canEdit || !window.confirm(`Remover o anexo ${item.nome_arquivo}?`)) return;
    const result = await deleteCadeiaAnexo(item.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Anexo removido.");
    await load(snapshot.page);
  }

  function abrirLote(loteId: string, destino: AbaCadeia) {
    setSelectedLoteId(loteId);
    selecionarAba(destino);
  }

  return (
    <main className="tela cadeia-madeira-tela">
      {error && (
        <section className="cartao cadeia-madeira-alert" role="alert">
          <strong>Não foi possível carregar a cadeia da madeira</strong>
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => void load(snapshot.page)} disabled={loading}>
            {loading ? "Tentando..." : "Tentar novamente"}
          </button>
        </section>
      )}

      {aba === "cadastro" && (
        <FornecedoresPanel
          fornecedores={snapshot.fornecedores}
          canEdit={canEdit}
          onNew={() => setFornecedorDraft(fornecedorVazio())}
          onEdit={(item) => setFornecedorDraft(fornecedorParaDraft(item))}
          onToggle={(item) => void alternarFornecedor(item)}
        />
      )}

      {aba === "lotes" && (
        <LotesPanel
          lotes={snapshot.lotes}
          fornecedores={snapshot.fornecedores}
          selectedLoteId={selectedLoteId}
          canEdit={canEdit}
          loading={loading}
          page={snapshot.page}
          total={snapshot.totalLotes}
          hasNextPage={snapshot.hasNextPage}
          onNew={() => setLoteDraft(loteVazio(snapshot.fornecedores.find((item) => item.ativo)?.id ?? ""))}
          onEdit={(item) => setLoteDraft(loteParaDraft(item))}
          onOpenInspections={(id) => abrirLote(id, "inspecoes")}
          onOpenReports={(id) => abrirLote(id, "laudos")}
          onSelect={setSelectedLoteId}
          onPage={(page) => void load(page)}
          onOpenCadastro={() => selecionarAba("cadastro")}
        />
      )}

      {aba === "inspecoes" && (
        <InspecoesPanel
          lotes={snapshot.lotes}
          selectedLoteId={selectedLoteId}
          selectedLote={selectedLote}
          inspecoes={selectedInspecoes}
          anexos={selectedAnexos}
          canEdit={canEdit}
          onSelect={setSelectedLoteId}
          onNew={() => selectedLote && setInspecaoDraft(inspecaoVazia(selectedLote.id))}
          onEdit={(item) => setInspecaoDraft(inspecaoParaDraft(item))}
          onPhoto={(event, inspecaoId) => void anexarAnexo(event, "FOTO_INSPECAO", selectedLoteId, inspecaoId)}
          onRemoveAnexo={(item) => void removerAnexo(item)}
        />
      )}

      {aba === "laudos" && (
        <LaudosPanel
          lotes={snapshot.lotes}
          selectedLoteId={selectedLoteId}
          selectedLote={selectedLote}
          laudos={selectedLaudos}
          mtrAnexos={selectedMtrAnexos}
          canEdit={canEdit}
          canManage={canManage}
          fileBusy={fileBusy}
          tipoLaudo={tipoLaudo}
          validadeLaudo={validadeLaudo}
          observacaoLaudo={observacaoLaudo}
          onSelect={setSelectedLoteId}
          onTipo={setTipoLaudo}
          onValidade={setValidadeLaudo}
          onObservacao={setObservacaoLaudo}
          onFile={anexarLaudo}
          onMtrFile={(event) => void anexarAnexo(event, "MTR", selectedLoteId, null)}
          onApprove={(item, value) => void aprovarLaudo(item, value)}
          onRemove={(item) => void removerLaudo(item)}
          onRemoveAnexo={(item) => void removerAnexo(item)}
        />
      )}

      {fornecedorDraft && canEdit && (
        <FornecedorForm
          draft={fornecedorDraft}
          saving={saving}
          onChange={(field, value) => setFornecedorDraft((current) => current ? { ...current, [field]: value } : current)}
          onSubmit={salvarFornecedor}
          onClose={() => { if (!saving) setFornecedorDraft(null); }}
        />
      )}

      {loteDraft && canEdit && (
        <LoteForm
          draft={loteDraft}
          fornecedores={snapshot.fornecedores}
          saving={saving}
          onChange={(field, value) => setLoteDraft((current) => current ? { ...current, [field]: value } : current)}
          onSubmit={salvarLote}
          onClose={() => { if (!saving) setLoteDraft(null); }}
        />
      )}

      {inspecaoDraft && canEdit && (
        <InspecaoForm
          draft={inspecaoDraft}
          lote={snapshot.lotes.find((item) => item.id === inspecaoDraft.lote_id) ?? null}
          saving={saving}
          onChange={(field, value) => setInspecaoDraft((current) => current ? { ...current, [field]: value } : current)}
          onSubmit={salvarInspecao}
          onClose={() => { if (!saving) setInspecaoDraft(null); }}
        />
      )}

      <div className="cadeia-madeira-loading" aria-live="polite">{loading ? "Atualizando dados técnicos…" : ""}</div>
    </main>
  );
}

function FornecedoresPanel({
  fornecedores,
  canEdit,
  onNew,
  onEdit,
  onToggle,
}: {
  fornecedores: CadeiaFornecedor[];
  canEdit: boolean;
  onNew: () => void;
  onEdit: (item: CadeiaFornecedor) => void;
  onToggle: (item: CadeiaFornecedor) => void;
}) {
  return (
    <section className="cartao cadeia-madeira-section">
      <SectionHeading title="Cadastro de fornecedores" description="Mantenha a origem da madeira estrutural homologada e auditável.">
        {canEdit && <button type="button" className="btn btn-forte" onClick={onNew}>+ Novo fornecedor</button>}
      </SectionHeading>
      {fornecedores.length === 0 ? (
        <EmptyState title="Nenhum fornecedor cadastrado" text="Cadastre a primeira madeireira ou fornecedor de madeira estrutural." />
      ) : (
        <div className="cadeia-fornecedor-lista">
          {fornecedores.map((item) => (
            <article className={"cadeia-fornecedor-card " + (!item.ativo ? "inativo" : "")} key={item.id}>
              <div className="cadeia-fornecedor-main">
                <span className="cadeia-code">FORNECEDOR</span>
                <h3>{item.razao_social}</h3>
                <p>{item.cnpj ? `CNPJ ${item.cnpj}` : "CNPJ não informado"}</p>
              </div>
              <div className="cadeia-fornecedor-tags">
                <span className={item.homologacao_ativa ? "cadeia-tag ok" : "cadeia-tag alerta"}>{item.homologacao_ativa ? "Homologação ativa" : "Homologação pendente"}</span>
                <span className="cadeia-tag">{item.certificacao_origem || "Origem sem certificação"}</span>
              </div>
              <div className="cadeia-fornecedor-contact">
                <small>Contato técnico</small>
                <b>{item.contato_tecnico_nome || "Não informado"}</b>
                <span>{item.contato_tecnico_email || item.contato_tecnico_telefone || "—"}</span>
              </div>
              {canEdit && (
                <div className="cadeia-card-actions">
                  <button type="button" className="btn" onClick={() => onEdit(item)}>Editar</button>
                  <button type="button" className="btn" onClick={() => onToggle(item)}>{item.ativo ? "Desativar" : "Reativar"}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LotesPanel({
  lotes,
  fornecedores,
  selectedLoteId,
  canEdit,
  loading,
  page,
  total,
  hasNextPage,
  onNew,
  onEdit,
  onOpenInspections,
  onOpenReports,
  onSelect,
  onPage,
  onOpenCadastro,
}: {
  lotes: CadeiaLote[];
  fornecedores: CadeiaFornecedor[];
  selectedLoteId: string;
  canEdit: boolean;
  loading: boolean;
  page: number;
  total: number;
  hasNextPage: boolean;
  onNew: () => void;
  onEdit: (item: CadeiaLote) => void;
  onOpenInspections: (id: string) => void;
  onOpenReports: (id: string) => void;
  onSelect: (id: string) => void;
  onPage: (page: number) => void;
  onOpenCadastro: () => void;
}) {
  return (
    <>
      <section className="cartao cadeia-madeira-section">
        <SectionHeading title="Auditoria de recebimento" description="Registre e audite cada carga antes de liberar a madeira para a produção.">
          {canEdit && <button type="button" className="btn btn-forte" onClick={onNew} disabled={!fornecedores.some((item) => item.ativo)}>+ Novo recebimento</button>}
        </SectionHeading>
        {!fornecedores.some((item) => item.ativo) && (
          <div className="cadeia-inline-alert">
            <span>Cadastre e ative um fornecedor antes de registrar um recebimento.</span>
            <button type="button" className="btn" onClick={onOpenCadastro}>Abrir Cadastro</button>
          </div>
        )}
        {lotes.length === 0 ? (
          <EmptyState title="Nenhum recebimento registrado" text="Os recebimentos auditados aparecerão aqui com fornecedor, umidade e lote de autoclave." />
        ) : (
          <div className="cadeia-lote-lista">
            {lotes.map((item) => {
              const umidadeAlta = loteUmidadeAlta(item.teor_umidade_medio);
              const selecionado = item.id === selectedLoteId;
              return (
                <article className={"cadeia-lote-card " + (selecionado ? "selecionado " : "") + (umidadeAlta ? "umidade-alta" : "")} key={item.id}>
                  <button type="button" className="cadeia-lote-summary" onClick={() => onSelect(item.id)} aria-pressed={selecionado}>
                    <span className="cadeia-lote-data">{dataMadeira(item.data_recebimento)}</span>
                    <span className="cadeia-lote-principal"><b>NF {item.numero_nota_fiscal}</b><small>{item.fornecedor_nome}</small></span>
                    <span className="cadeia-lote-umidade"><small>Umidade média</small><b>{item.teor_umidade_medio.toFixed(1)}%</b></span>
                    <span className={"cadeia-status cadeia-status-" + item.status_liberacao.toLowerCase()}>{rotuloStatusLiberacao(item.status_liberacao)}</span>
                  </button>
                  <div className="cadeia-lote-facts"><span><small>Volume</small><b>{item.volume_m3.toFixed(3)} m³</b></span><span><small>Autoclave</small><b>{item.lote_autoclave}</b></span><span><small>Placa</small><b>{item.placa_veiculo || "—"}</b></span></div>
                  {umidadeAlta && <div className="cadeia-umidade-alerta"><strong>Atenção de engenharia</strong><span>O teor de umidade está acima do limite seguro de {LIMITE_UMIDADE_SEGURA}%.</span></div>}
                  <div className="cadeia-card-actions">
                    {canEdit && <button type="button" className="btn" onClick={() => onEdit(item)}>Editar lote</button>}
                    <button type="button" className="btn" onClick={() => onOpenInspections(item.id)}>Ensaios</button>
                    <button type="button" className="btn" onClick={() => onOpenReports(item.id)}>Laudos</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <Pagination page={page} total={total} hasNextPage={hasNextPage} loading={loading} onPage={onPage} />
      </section>
    </>
  );
}

function InspecoesPanel({
  lotes,
  selectedLoteId,
  selectedLote,
  inspecoes,
  anexos,
  canEdit,
  onSelect,
  onNew,
  onEdit,
  onPhoto,
  onRemoveAnexo,
}: {
  lotes: CadeiaLote[];
  selectedLoteId: string;
  selectedLote: CadeiaLote | null;
  inspecoes: CadeiaInspecao[];
  anexos: CadeiaAnexo[];
  canEdit: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onEdit: (item: CadeiaInspecao) => void;
  onPhoto: (event: ChangeEvent<HTMLInputElement>, inspecaoId: string) => void;
  onRemoveAnexo: (item: CadeiaAnexo) => void;
}) {
  return (
    <section className="cartao cadeia-madeira-section">
      <SectionHeading title="Ensaios técnicos e inspeções" description="Registre recebimento, protótipos estruturais, placa cimentícia, painel e ligações.">
        {canEdit && <button type="button" className="btn btn-forte" onClick={onNew} disabled={!selectedLote}>+ Novo ensaio</button>}
      </SectionHeading>
      <LoteSelector label="Recebimento em análise" lotes={lotes} value={selectedLoteId} onChange={onSelect} />
      {!selectedLote ? (
        <EmptyState title="Selecione um lote" text="Abra um lote recebido para registrar ou consultar seus ensaios." />
      ) : inspecoes.length === 0 ? (
        <EmptyState title="Nenhum ensaio neste recebimento" text="Registre a verificação dimensional, o protótipo ou o ensaio de desempenho correspondente." />
      ) : (
        <div className="cadeia-inspecao-lista">
          {inspecoes.map((item) => (
            <article className="cadeia-inspecao-card" key={item.id}>
              <div className="cadeia-inspecao-head"><div><span className="cadeia-code">{dataMadeira(item.data_inspecao)}</span><h3>{item.inspetor_nome}</h3></div><span className={"cadeia-status cadeia-status-" + item.resultado.toLowerCase()}>{rotuloStatusLiberacao(item.resultado)}</span></div>
              <div className="cadeia-ensaio-contexto">
                <span><small>Tipo de ensaio</small><b>{rotuloTipoEnsaio(item.tipo_ensaio)}</b></span>
                <span><small>Componente</small><b>{rotuloComponenteEnsaio(item.componente_ensaiado)}</b></span>
                <span><small>Protótipo / identificação</small><b>{item.identificacao_prototipo || "Não informado"}</b></span>
                <span><small>Norma / procedimento</small><b>{item.norma_procedimento || "Não informado"}</b></span>
                <span><small>Resultado técnico</small><b>{item.resultado_tecnico || "Não informado"}</b></span>
              </div>
              <div className="cadeia-defeitos"><Defeito label="Bitola" value={item.bitola_nominal || "Não informada"} good={item.dimensional_conforme} /><Defeito label="Empenamento" value={item.empenamento ? "Identificado" : "Não identificado"} good={!item.empenamento} /><Defeito label="Fendas profundas" value={item.fendas_profundas ? "Identificadas" : "Não identificadas"} good={!item.fendas_profundas} /><Defeito label="Nós soltos" value={item.nos_soltos ? "Identificados" : "Não identificados"} good={!item.nos_soltos} /><Defeito label="Umidade / bolor" value={item.manchas_umidade_bolor ? "Identificados" : "Não identificados"} good={!item.manchas_umidade_bolor} /></div>
              {item.observacoes && <p className="cadeia-inspecao-note">{item.observacoes}</p>}
              <div className="cadeia-inspecao-anexos">
                <div className="cadeia-anexo-heading"><span>Fotos da inspeção</span><small>{anexos.filter((anexo) => anexo.inspecao_id === item.id).length} anexo(s)</small></div>
                <div className="cadeia-anexo-lista">
                  {anexos.filter((anexo) => anexo.inspecao_id === item.id).map((anexo) => <AnexoCard key={anexo.id} item={anexo} canEdit={canEdit} onRemove={onRemoveAnexo} />)}
                  {canEdit && <label className="btn cadeia-upload-button cadeia-upload-small"><span>+ Foto</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => onPhoto(event, item.id)} disabled={false} /></label>}
                </div>
              </div>
              {canEdit && <div className="cadeia-card-actions"><button type="button" className="btn" onClick={() => onEdit(item)}>Editar inspeção</button></div>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LaudosPanel({
  lotes,
  selectedLoteId,
  selectedLote,
  laudos,
  mtrAnexos,
  canEdit,
  canManage,
  fileBusy,
  tipoLaudo,
  validadeLaudo,
  observacaoLaudo,
  onSelect,
  onTipo,
  onValidade,
  onObservacao,
  onFile,
  onMtrFile,
  onApprove,
  onRemove,
  onRemoveAnexo,
}: {
  lotes: CadeiaLote[];
  selectedLoteId: string;
  selectedLote: CadeiaLote | null;
  laudos: CadeiaLaudo[];
  mtrAnexos: CadeiaAnexo[];
  canEdit: boolean;
  canManage: boolean;
  fileBusy: boolean;
  tipoLaudo: TipoLaudoMadeira;
  validadeLaudo: string;
  observacaoLaudo: string;
  onSelect: (id: string) => void;
  onTipo: (value: TipoLaudoMadeira) => void;
  onValidade: (value: string) => void;
  onObservacao: (value: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onMtrFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onApprove: (item: CadeiaLaudo, aprovado: boolean) => void;
  onRemove: (item: CadeiaLaudo) => void;
  onRemoveAnexo: (item: CadeiaAnexo) => void;
}) {
  return (
    <section className="cartao cadeia-madeira-section">
      <SectionHeading title="Laudos do recebimento" description="Fixe o laudo técnico ou certificado ao fornecedor e ao recebimento auditado correspondente." />
      <LoteSelector label="Recebimento com laudo" lotes={lotes} value={selectedLoteId} onChange={onSelect} />
      {!selectedLote ? (
        <EmptyState title="Selecione um recebimento" text="Os laudos ficam vinculados ao fornecedor e à nota fiscal do recebimento de origem." />
      ) : (
        <>
          <div className="cadeia-inline-context">
            <strong>Vínculo do documento</strong>
            <span>{selectedLote.fornecedor_nome} · NF {selectedLote.numero_nota_fiscal} · recebido em {dataMadeira(selectedLote.data_recebimento)}</span>
          </div>
          {canEdit && (
            <div className="cadeia-document-upload">
              <div><span className="cadeia-code">NOVO DOCUMENTO</span><h3>Anexar ao recebimento NF {selectedLote.numero_nota_fiscal}</h3><p className="sub">Fornecedor: {selectedLote.fornecedor_nome}. PDF, JPG, PNG ou WebP até 20 MB. O arquivo é salvo no Storage privado.</p></div>
              <div className="cadeia-document-fields"><label><span className="rotulo">Tipo</span><select className="campo" value={tipoLaudo} onChange={(event) => onTipo(event.target.value as TipoLaudoMadeira)}>{TIPOS_LAUDO_MADEIRA.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span className="rotulo">Validade</span><input className="campo" type="date" value={validadeLaudo} onChange={(event) => onValidade(event.target.value)} /></label><label className="cadeia-document-observacao"><span className="rotulo">Observação</span><input className="campo" value={observacaoLaudo} onChange={(event) => onObservacao(event.target.value)} maxLength={3000} placeholder="Ex.: certificado do lote de tratamento" /></label><label className={"btn btn-forte cadeia-upload-button " + (fileBusy ? "disabled" : "")}><span>{fileBusy ? "Enviando…" : "Selecionar documento"}</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onFile} disabled={fileBusy} /></label></div>
            </div>
          )}
          <div className="cadeia-mtr-box">
            <div><span className="cadeia-code">RASTREABILIDADE DE DESTINAÇÃO</span><h3>Documentos MTR</h3><p className="sub">Vincule o Manifesto de Transporte de Resíduos ao lote ou à destinação registrada.</p></div>
            <div className="cadeia-mtr-content">
              <div className="cadeia-anexo-lista">{mtrAnexos.length ? mtrAnexos.map((item) => <AnexoCard key={item.id} item={item} canEdit={canEdit} onRemove={onRemoveAnexo} />) : <span className="cadeia-anexo-empty">Nenhum MTR anexado a este lote.</span>}</div>
              {canEdit && <label className="btn cadeia-upload-button"><span>+ Anexar MTR</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onMtrFile} disabled={fileBusy} /></label>}
            </div>
          </div>
          {laudos.length === 0 ? <EmptyState title="Nenhum laudo neste recebimento" text="Anexe o laudo técnico ou certificado de conformidade deste fornecedor e desta nota fiscal." /> : <div className="cadeia-laudo-lista">{laudos.map((item) => <LaudoCard key={item.id} item={item} canEdit={canEdit} canManage={canManage} onApprove={onApprove} onRemove={onRemove} />)}</div>}
        </>
      )}
    </section>
  );
}

function AnexoCard({ item, canEdit, onRemove }: { item: CadeiaAnexo; canEdit: boolean; onRemove: (item: CadeiaAnexo) => void }) {
  const isImage = item.mime_type.startsWith("image/");
  return (
    <article className="cadeia-anexo-card">
      {isImage && item.url ? <Image src={item.url} alt={item.nome_arquivo} width={36} height={36} unoptimized /> : <span className="cadeia-anexo-icon">{isImage ? "IMG" : "PDF"}</span>}
      <div className="cadeia-anexo-main"><b title={item.nome_arquivo}>{item.nome_arquivo}</b><small>{rotuloTipoAnexo(item.tipo)} · {bytesMadeira(item.tamanho_bytes)}</small></div>
      <div className="cadeia-anexo-actions">{item.url && <a className="btn" href={item.url} target="_blank" rel="noreferrer">Abrir</a>}{canEdit && <button type="button" className="btn cadeia-danger" onClick={() => onRemove(item)}>Remover</button>}</div>
    </article>
  );
}

function LaudoCard({ item, canEdit, canManage, onApprove, onRemove }: { item: CadeiaLaudo; canEdit: boolean; canManage: boolean; onApprove: (item: CadeiaLaudo, aprovado: boolean) => void; onRemove: (item: CadeiaLaudo) => void }) {
  const vencido = Boolean(item.validade_ate && item.validade_ate < dataLocal());
  return <article className={"cadeia-laudo-card " + (vencido ? "vencido" : "")}><div className="cadeia-laudo-icon">{item.mime_type === "application/pdf" ? "PDF" : "IMG"}</div><div className="cadeia-laudo-main"><span className="cadeia-code">{rotuloTipoLaudo(item.tipo)}</span><h3>{item.nome_arquivo}</h3><p>{bytesMadeira(item.tamanho_bytes)} · enviado em {dataHoraMadeira(item.created_at)}</p><div className="cadeia-laudo-tags"><span className={item.aprovado ? "cadeia-tag ok" : "cadeia-tag alerta"}>{item.aprovado ? "Aprovado pela qualidade" : "Aguardando aprovação"}</span>{item.validade_ate && <span className={vencido ? "cadeia-tag alerta" : "cadeia-tag"}>{vencido ? "Vencido" : `Válido até ${dataMadeira(item.validade_ate)}`}</span>}</div></div><div className="cadeia-card-actions">{item.url && <a className="btn" href={item.url} target="_blank" rel="noreferrer">Abrir</a>}{canManage && <button type="button" className="btn" onClick={() => onApprove(item, !item.aprovado)}>{item.aprovado ? "Reabrir" : "Aprovar"}</button>}{canEdit && <button type="button" className="btn cadeia-danger" onClick={() => onRemove(item)}>Remover</button>}</div></article>;
}

function LoteSelector({ label = "Recebimento em análise", lotes, value, onChange }: { label?: string; lotes: CadeiaLote[]; value: string; onChange: (value: string) => void }) {
  return <label className="cadeia-lote-selector"><span className="rotulo">{label}</span><select className="campo" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Selecione um recebimento</option>{lotes.map((item) => <option key={item.id} value={item.id}>NF {item.numero_nota_fiscal} · {item.fornecedor_nome} · {dataMadeira(item.data_recebimento)}</option>)}</select></label>;
}

function rotuloTipoEnsaio(value: CadeiaInspecao["tipo_ensaio"]) {
  return TIPOS_ENSAIO_MADEIRA.find((item) => item.value === value)?.label ?? value;
}

function rotuloComponenteEnsaio(value: CadeiaInspecao["componente_ensaiado"]) {
  return COMPONENTES_ENSAIO_MADEIRA.find((item) => item.value === value)?.label ?? value;
}

function Defeito({ label, value, good }: { label: string; value: string; good: boolean }) {
  return <span className={good ? "cadeia-defeito ok" : "cadeia-defeito erro"}><small>{label}</small><b>{value}</b></span>;
}

function SectionHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="cadeia-section-heading"><div><h2>{title}</h2><p className="sub">{description}</p></div>{children}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="cadeia-empty"><h3>{title}</h3><p className="sub">{text}</p></div>;
}

function Pagination({ page, total, hasNextPage, loading, onPage }: { page: number; total: number; hasNextPage: boolean; loading: boolean; onPage: (page: number) => void }) {
  return <div className="cadeia-pagination"><button type="button" className="btn" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Anterior</button><span>Página {page} · {total} lote{total === 1 ? "" : "s"}</span><button type="button" className="btn" disabled={loading || !hasNextPage} onClick={() => onPage(page + 1)}>Próxima</button></div>;
}

function ModalShell({ title, eyebrow, saving, onClose, children }: { title: string; eyebrow: string; saving: boolean; onClose: () => void; children: ReactNode }) {
  return <div className="cadeia-modal" role="presentation"><div className="cadeia-modal-backdrop" onClick={onClose} /><section className="cartao cadeia-modal-card" role="dialog" aria-modal="true" aria-label={title}><div className="cadeia-modal-heading"><div><p className="cadeia-madeira-eyebrow">{eyebrow}</p><h2>{title}</h2></div><button type="button" className="btn cadeia-close" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></div>{children}</section></div>;
}

function FornecedorForm({ draft, saving, onChange, onSubmit, onClose }: { draft: FornecedorDraft; saving: boolean; onChange: <K extends keyof FornecedorDraft>(field: K, value: FornecedorDraft[K]) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return <ModalShell title={draft.id ? "Editar fornecedor" : "Novo fornecedor"} eyebrow="Cadastro de origem" saving={saving} onClose={onClose}><form className="cadeia-form-grid" onSubmit={onSubmit}><label className="cadeia-form-wide"><span className="rotulo">Razão Social *</span><input className="campo" value={draft.razao_social} onChange={(event) => onChange("razao_social", event.target.value)} maxLength={180} required /></label><label><span className="rotulo">CNPJ</span><input className="campo" value={draft.cnpj} onChange={(event) => onChange("cnpj", event.target.value)} maxLength={18} placeholder="00.000.000/0000-00" /></label><label className="cadeia-check-field"><input type="checkbox" checked={draft.homologacao_ativa} onChange={(event) => onChange("homologacao_ativa", event.target.checked)} /><span>Homologação ativa</span></label><label className="cadeia-form-wide"><span className="rotulo">Certificação / origem</span><input className="campo" value={draft.certificacao_origem} onChange={(event) => onChange("certificacao_origem", event.target.value)} maxLength={600} placeholder="Ex.: FSC, DOF, origem controlada" /></label><label><span className="rotulo">Contato técnico</span><input className="campo" value={draft.contato_tecnico_nome} onChange={(event) => onChange("contato_tecnico_nome", event.target.value)} maxLength={160} /></label><label><span className="rotulo">E-mail técnico</span><input className="campo" type="email" value={draft.contato_tecnico_email} onChange={(event) => onChange("contato_tecnico_email", event.target.value)} maxLength={180} /></label><label><span className="rotulo">Telefone técnico</span><input className="campo" value={draft.contato_tecnico_telefone} onChange={(event) => onChange("contato_tecnico_telefone", event.target.value)} maxLength={40} /></label><label className="cadeia-form-wide"><span className="rotulo">Histórico de avaliação dos lotes</span><textarea className="campo" rows={4} value={draft.historico_avaliacao} onChange={(event) => onChange("historico_avaliacao", event.target.value)} maxLength={5000} placeholder="Registre desempenho, não conformidades e ações tomadas." /></label><label className="cadeia-check-field"><input type="checkbox" checked={draft.ativo} onChange={(event) => onChange("ativo", event.target.checked)} /><span>Fornecedor ativo</span></label><FormActions saving={saving} onClose={onClose} submitLabel={draft.id ? "Salvar fornecedor" : "Cadastrar fornecedor"} /></form></ModalShell>;
}

function LoteForm({
  draft,
  fornecedores,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  draft: LoteDraft;
  fornecedores: CadeiaFornecedor[];
  saving: boolean;
  onChange: <K extends keyof LoteDraft>(field: K, value: LoteDraft[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const marcados = CHECKLIST_RECEBIMENTO_MADEIRA.filter(
    (item) => draft.checklist[item.id],
  ).length;

  return (
    <ModalShell
      title={draft.id ? "Editar recebimento" : "Novo recebimento de madeira"}
      eyebrow="Auditoria de recebimento"
      saving={saving}
      onClose={onClose}
    >
      <form className="cadeia-form-grid" onSubmit={onSubmit}>
        <label>
          <span className="rotulo">Fornecedor cadastrado *</span>
          <select
            className="campo"
            value={draft.fornecedor_id}
            onChange={(event) => onChange("fornecedor_id", event.target.value)}
            required
          >
            <option value="">Selecione</option>
            {fornecedores
              .filter((item) => item.ativo)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.razao_social}
                </option>
              ))}
          </select>
        </label>

        <label>
          <span className="rotulo">Nota fiscal *</span>
          <input
            className="campo"
            value={draft.numero_nota_fiscal}
            onChange={(event) => onChange("numero_nota_fiscal", event.target.value)}
            maxLength={80}
            required
          />
        </label>

        <label>
          <span className="rotulo">Volume (m³) *</span>
          <input
            className="campo"
            type="number"
            min="0.001"
            step="0.001"
            value={draft.volume_m3}
            onChange={(event) => onChange("volume_m3", event.target.value)}
            required
          />
        </label>

        <label>
          <span className="rotulo">Data de recebimento *</span>
          <input
            className="campo"
            type="date"
            value={draft.data_recebimento}
            onChange={(event) => onChange("data_recebimento", event.target.value)}
            required
          />
        </label>

        <label>
          <span className="rotulo">Placa do veículo</span>
          <input
            className="campo"
            value={draft.placa_veiculo}
            onChange={(event) => onChange("placa_veiculo", event.target.value)}
            maxLength={20}
          />
        </label>

        <label>
          <span className="rotulo">Umidade média (%) *</span>
          <input
            className={
              "campo " +
              (Number(draft.teor_umidade_medio) > LIMITE_UMIDADE_SEGURA
                ? "cadeia-campo-alerta"
                : "")
            }
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={draft.teor_umidade_medio}
            onChange={(event) => onChange("teor_umidade_medio", event.target.value)}
            required
          />
          <small className="cadeia-field-help">
            Acima de {LIMITE_UMIDADE_SEGURA}% gera alerta de engenharia.
          </small>
        </label>

        <label>
          <span className="rotulo">Lote de autoclave *</span>
          <input
            className="campo"
            value={draft.lote_autoclave}
            onChange={(event) => onChange("lote_autoclave", event.target.value)}
            maxLength={120}
            required
          />
        </label>

        <label>
          <span className="rotulo">Status preliminar</span>
          <select
            className="campo"
            value={draft.status_liberacao}
            onChange={(event) =>
              onChange(
                "status_liberacao",
                event.target.value as StatusLiberacaoMadeira,
              )
            }
          >
            {STATUS_LIBERACAO_MADEIRA.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="cadeia-recebimento-checklist">
          <legend>Checklist da inspeção</legend>
          <div className="cadeia-checklist-head">
            <p className="sub">
              Confira as condições do material antes da liberação.
            </p>
            <span>
              {marcados}/{CHECKLIST_RECEBIMENTO_MADEIRA.length} verificados
            </span>
          </div>
          <div className="cadeia-recebimento-checks">
            {CHECKLIST_RECEBIMENTO_MADEIRA.map((item) => {
              const checked = draft.checklist[item.id];
              return (
                <label
                  key={item.id}
                  className={
                    "cadeia-recebimento-check " + (checked ? "on" : "")
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      onChange("checklist", {
                        ...draft.checklist,
                        [item.id]: event.target.checked,
                      })
                    }
                  />
                  <span>{item.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="cadeia-form-wide">
          <span className="rotulo">Observações da auditoria</span>
          <textarea
            className="campo"
            rows={3}
            value={draft.observacoes}
            onChange={(event) => onChange("observacoes", event.target.value)}
            maxLength={5000}
          />
        </label>

        <label className="cadeia-check-field">
          <input
            type="checkbox"
            checked={draft.ativo}
            onChange={(event) => onChange("ativo", event.target.checked)}
          />
          <span>Recebimento ativo no histórico</span>
        </label>

        <FormActions
          saving={saving}
          onClose={onClose}
          submitLabel={draft.id ? "Salvar recebimento" : "Salvar auditoria"}
        />
      </form>
    </ModalShell>
  );
}

function InspecaoForm({ draft, lote, saving, onChange, onSubmit, onClose }: { draft: InspecaoDraft; lote: CadeiaLote | null; saving: boolean; onChange: <K extends keyof InspecaoDraft>(field: K, value: InspecaoDraft[K]) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  return (
    <ModalShell title={draft.id ? "Editar ensaio técnico" : "Novo ensaio técnico"} eyebrow={lote ? `Recebimento NF ${lote.numero_nota_fiscal}` : "Qualidade estrutural"} saving={saving} onClose={onClose}>
      <form className="cadeia-form-grid" onSubmit={onSubmit}>
        <label>
          <span className="rotulo">Tipo de ensaio *</span>
          <select className="campo" value={draft.tipo_ensaio} onChange={(event) => onChange("tipo_ensaio", event.target.value as TipoEnsaioMadeira)} required>
            {TIPOS_ENSAIO_MADEIRA.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span className="rotulo">Componente ensaiado *</span>
          <select className="campo" value={draft.componente_ensaiado} onChange={(event) => onChange("componente_ensaiado", event.target.value as ComponenteEnsaioMadeira)} required>
            {COMPONENTES_ENSAIO_MADEIRA.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          <span className="rotulo">Identificação do protótipo</span>
          <input className="campo" value={draft.identificacao_prototipo} onChange={(event) => onChange("identificacao_prototipo", event.target.value)} maxLength={240} placeholder="Ex.: Protótipo P-01 · painel C4A" />
        </label>
        <label>
          <span className="rotulo">Norma / procedimento</span>
          <input className="campo" value={draft.norma_procedimento} onChange={(event) => onChange("norma_procedimento", event.target.value)} maxLength={240} placeholder="Ex.: ABNT NBR / procedimento interno" />
        </label>
        <label>
          <span className="rotulo">Data do ensaio *</span>
          <input className="campo" type="date" value={draft.data_inspecao} onChange={(event) => onChange("data_inspecao", event.target.value)} required />
        </label>
        <label>
          <span className="rotulo">Bitola nominal</span>
          <input className="campo" value={draft.bitola_nominal} onChange={(event) => onChange("bitola_nominal", event.target.value)} maxLength={120} placeholder="Ex.: 38 × 89 mm" />
        </label>
        <fieldset className="cadeia-defeitos-fieldset">
          <legend>Verificações físicas</legend>
          <Check label="Bitola dimensional conforme" checked={draft.dimensional_conforme} onChange={(value) => onChange("dimensional_conforme", value)} />
          <Check label="Empenamento identificado" checked={draft.empenamento} onChange={(value) => onChange("empenamento", value)} />
          <Check label="Fendas profundas identificadas" checked={draft.fendas_profundas} onChange={(value) => onChange("fendas_profundas", value)} />
          <Check label="Nós soltos identificados" checked={draft.nos_soltos} onChange={(value) => onChange("nos_soltos", value)} />
          <Check label="Manchas de umidade ou bolor" checked={draft.manchas_umidade_bolor} onChange={(value) => onChange("manchas_umidade_bolor", value)} />
        </fieldset>
        <label>
          <span className="rotulo">Classificação do ensaio *</span>
          <select className="campo" value={draft.resultado} onChange={(event) => onChange("resultado", event.target.value as StatusLiberacaoMadeira)}>
            {STATUS_LIBERACAO_MADEIRA.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="cadeia-form-wide">
          <span className="rotulo">Resultado técnico</span>
          <textarea className="campo" rows={4} value={draft.resultado_tecnico} onChange={(event) => onChange("resultado_tecnico", event.target.value)} maxLength={4000} placeholder="Registre carga, comportamento, deformação, ruptura, conformidade ou conclusão do protótipo." />
        </label>
        <label className="cadeia-form-wide">
          <span className="rotulo">Observações técnicas</span>
          <textarea className="campo" rows={3} value={draft.observacoes} onChange={(event) => onChange("observacoes", event.target.value)} maxLength={5000} />
        </label>
        <FormActions saving={saving} onClose={onClose} submitLabel={draft.id ? "Salvar ensaio" : "Registrar ensaio"} />
      </form>
    </ModalShell>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="cadeia-check-field"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function FormActions({ saving, onClose, submitLabel }: { saving: boolean; onClose: () => void; submitLabel: string }) {
  return <div className="cadeia-modal-actions"><button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="btn btn-forte" disabled={saving}>{saving ? "Salvando…" : submitLabel}</button></div>;
}
