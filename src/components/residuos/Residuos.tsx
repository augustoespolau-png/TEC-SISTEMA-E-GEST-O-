"use client";

import {
  useCallback,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { toast } from "sonner";
import {
  cancelResiduoTroca,
  createResiduoTroca,
  loadResiduosSnapshot,
  registerResiduoAnexo,
  updateResiduoTroca,
  type ResiduoAnexoInput,
  type ResiduoTrocaInput,
} from "@/app/actions/residuos";
import {
  BUCKET_AUDITORIA,
  MAX_FOTO_BYTES,
  otimizarFoto,
  segmentoSeguro,
  tamanhoLegivel,
} from "@/lib/anexos";
import {
  formatarDataHoraResiduo,
  formatarDataResiduo,
  formatarMoedaResiduo,
  formatarNumeroResiduo,
  labelCategoria,
  labelStatus,
  RESIDUO_CATEGORIAS,
  RESIDUO_STATUS,
  type ResiduoAnexoTipo,
  type ResiduoCategoria,
  type ResiduoStatus,
  type ResiduoTroca,
  type ResiduosFilters,
  type ResiduosSnapshot,
} from "@/lib/residuos";
import { createClient } from "@/lib/supabase/client";

type Draft = {
  id: string;
  categoria: ResiduoCategoria;
  data_troca: string;
  identificacao_cacamba: string;
  empresa_coletora: string;
  transportadora_destino: string;
  mtr_numero: string;
  peso_kg: string;
  placa_caminhao: string;
  motorista: string;
  horario_retirada: string;
  custo: string;
  destino_final: string;
  observacao: string;
  status: ResiduoStatus;
};

type FilterDraft = {
  search: string;
  categoria: "" | ResiduoCategoria;
  status: "" | ResiduoStatus;
  data_inicio: string;
  data_fim: string;
};

const EMPTY_FILTERS: FilterDraft = {
  search: "",
  categoria: "",
  status: "",
  data_inicio: "",
  data_fim: "",
};

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    id: "",
    categoria: "madeira",
    data_troca: localDate(),
    identificacao_cacamba: "",
    empresa_coletora: "",
    transportadora_destino: "",
    mtr_numero: "",
    peso_kg: "",
    placa_caminhao: "",
    motorista: "",
    horario_retirada: "",
    custo: "",
    destino_final: "",
    observacao: "",
    status: "PENDENTE",
  };
}

function draftFromItem(item: ResiduoTroca): Draft {
  return {
    id: item.id,
    categoria: item.categoria,
    data_troca: item.data_troca.slice(0, 10),
    identificacao_cacamba: item.identificacao_cacamba ?? "",
    empresa_coletora: item.empresa_coletora ?? "",
    transportadora_destino: item.transportadora_destino ?? "",
    mtr_numero: item.mtr_numero ?? "",
    peso_kg: item.peso_kg == null ? "" : String(item.peso_kg),
    placa_caminhao: item.placa_caminhao ?? "",
    motorista: item.motorista ?? "",
    horario_retirada: item.horario_retirada?.slice(0, 5) ?? "",
    custo: item.custo == null ? "" : String(item.custo),
    destino_final: item.destino_final ?? "",
    observacao: item.observacao ?? "",
    status: item.status,
  };
}

function textOrNull(value: string) {
  return value.trim() || null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Falha de comunicação com o servidor.";
}

export default function Residuos({
  initialSnapshot,
  initialError,
  canEdit,
}: {
  initialSnapshot: ResiduosSnapshot;
  initialError?: string;
  canEdit: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [error, setError] = useState(initialError ?? "");
  const [filters, setFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async (page: number, current: FilterDraft) => {
    setLoading(true);
    const result = await loadResiduosSnapshot({
      page,
      search: current.search,
      categoria: current.categoria,
      status: current.status,
      data_inicio: current.data_inicio,
      data_fim: current.data_fim,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError("");
    setSnapshot(result.data);
  }, []);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(1, filters);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    void load(1, EMPTY_FILTERS);
  }

  function changeDraft<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !canEdit || saving) return;
    setSaving(true);
    const input: ResiduoTrocaInput = {
      id: draft.id || undefined,
      categoria: draft.categoria,
      data_troca: draft.data_troca,
      identificacao_cacamba: textOrNull(draft.identificacao_cacamba),
      empresa_coletora: textOrNull(draft.empresa_coletora),
      transportadora_destino: textOrNull(draft.transportadora_destino),
      mtr_numero: textOrNull(draft.mtr_numero),
      peso_kg: draft.peso_kg || null,
      placa_caminhao: textOrNull(draft.placa_caminhao),
      motorista: textOrNull(draft.motorista),
      horario_retirada: draft.horario_retirada || null,
      custo: draft.custo || null,
      destino_final: textOrNull(draft.destino_final),
      observacao: textOrNull(draft.observacao),
      status: draft.status,
    };
    const result = draft.id
      ? await updateResiduoTroca(input)
      : await createResiduoTroca(input);
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDraft(null);
    setExpandedId(result.data.id);
    toast.success(draft.id ? "Troca atualizada." : "Troca registrada.");
    await load(snapshot.page, filters);
  }

  async function cancel(item: ResiduoTroca) {
    if (!canEdit || cancellingId) return;
    if (!window.confirm("Cancelar o registro da troca de " + formatarDataResiduo(item.data_troca) + "?")) return;
    setCancellingId(item.id);
    const result = await cancelResiduoTroca(item.id);
    setCancellingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Troca cancelada.");
    await load(snapshot.page, filters);
  }

  async function attach(item: ResiduoTroca, tipo: ResiduoAnexoTipo, event: ChangeEvent<HTMLInputElement>) {
    const original = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!original || !canEdit) return;
    setFileBusy(item.id + ":" + tipo);
    let path = "";
    let uploaded = false;
    try {
      if (original.size <= 0 || original.size > MAX_FOTO_BYTES) {
        throw new Error("O arquivo precisa ter entre 1 byte e 20 MB.");
      }
      const isImage = original.type.startsWith("image/");
      const isPdf = original.type === "application/pdf";
      if (!isImage && !isPdf) throw new Error("Use uma imagem ou um PDF.");
      if (tipo === "foto" && !isImage) throw new Error("A foto precisa ser uma imagem.");

      const ready = isImage ? await otimizarFoto(original) : original;
      const extension = ready.type === "application/pdf" ? "pdf" : "jpg";
      const baseName = segmentoSeguro(ready.name.replace(/\.[^.]+$/, ""));
      const fileName = String(Date.now()) + "_" + crypto.randomUUID() + "_" + baseName + "." + extension;
      path = "residuos/" + segmentoSeguro(item.id) + "/" + tipo + "/" + fileName;
      const supabase = createClient();
      const userResult = await supabase.auth.getUser();
      if (!userResult.data.user) throw new Error("Sua sessão expirou. Entre novamente.");
      const upload = await supabase.storage.from(BUCKET_AUDITORIA).upload(path, ready, {
        cacheControl: "3600",
        contentType: ready.type,
        upsert: false,
      });
      if (upload.error) throw new Error("Não foi possível enviar o arquivo: " + upload.error.message);
      uploaded = true;
      const payload: ResiduoAnexoInput = {
        troca_id: item.id,
        tipo,
        nome_arquivo: ready.name,
        mime_type: ready.type,
        tamanho_bytes: ready.size,
        storage_path: path,
      };
      const linked = await registerResiduoAnexo(payload);
      if (!linked.ok) throw new Error(linked.error);
      toast.success(tipo === "foto" ? "Foto anexada à troca." : "MTR anexado à troca.");
      await load(snapshot.page, filters);
    } catch (caught) {
      if (uploaded && path) {
        await createClient().storage.from(BUCKET_AUDITORIA).remove([path]);
      }
      toast.error("Não foi possível salvar o anexo: " + errorMessage(caught));
    } finally {
      setFileBusy(null);
    }
  }

  return (
    <main className="tela residuos-tela">
      <section className="cartao residuos-hero">
        <div>
          <p className="residuos-eyebrow">Controle ambiental</p>
          <h1 className="residuos-title">Resíduos e troca de caçambas</h1>
          <p className="sub residuos-lead">
            Registre retirada, transportadora, MTR, peso e destinação em um único histórico.
          </p>
        </div>
        {canEdit && (
          <button type="button" className="btn btn-forte" onClick={() => setDraft(emptyDraft())}>
            + Nova troca
          </button>
        )}
      </section>

      {error && (
        <section className="cartao residuos-alert" role="alert">
          <strong>Não foi possível carregar os registros</strong>
          <p>{error}</p>
          <button type="button" className="btn" onClick={() => void load(snapshot.page, filters)} disabled={loading}>
            {loading ? "Tentando..." : "Tentar novamente"}
          </button>
        </section>
      )}

      <section className="residuos-kpis" aria-label="Resumo dos resíduos">
        <div className="cartao"><span>Total filtrado</span><b>{snapshot.summary.total}</b><small>trocas registradas</small></div>
        <div className="cartao"><span>Pendentes</span><b className="residuos-kpi-alerta">{snapshot.summary.pendentes}</b><small>aguardando conclusão</small></div>
        <div className="cartao"><span>Peso total</span><b>{formatarNumeroResiduo(snapshot.summary.peso_total)} <em>kg</em></b><small>no filtro atual</small></div>
        <div className="cartao"><span>Custo total</span><b>{formatarMoedaResiduo(snapshot.summary.custo_total)}</b><small>no filtro atual</small></div>
      </section>

      <section className="cartao residuos-filtros">
        <div className="residuos-section-heading">
          <div>
            <h2>Histórico de trocas</h2>
            <p className="sub">Pesquise caçamba, MTR, coletora ou motorista.</p>
          </div>
          <span className="residuos-page-label">Página {snapshot.page}</span>
        </div>
        <form className="residuos-filter-grid" onSubmit={submitFilters}>
          <label className="residuos-filter-wide"><span className="rotulo">Buscar</span><input className="campo" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Ex.: CCB-014 ou MTR" /></label>
          <label><span className="rotulo">Categoria</span><select className="campo" value={filters.categoria} onChange={(event) => setFilters((current) => ({ ...current, categoria: event.target.value as FilterDraft["categoria"] }))}><option value="">Todas</option>{RESIDUO_CATEGORIAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span className="rotulo">Status</span><select className="campo" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as FilterDraft["status"] }))}><option value="">Todos</option>{RESIDUO_STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span className="rotulo">De</span><input className="campo" type="date" value={filters.data_inicio} onChange={(event) => setFilters((current) => ({ ...current, data_inicio: event.target.value }))} /></label>
          <label><span className="rotulo">Até</span><input className="campo" type="date" value={filters.data_fim} onChange={(event) => setFilters((current) => ({ ...current, data_fim: event.target.value }))} /></label>
          <div className="residuos-filter-actions"><button type="submit" className="btn btn-forte" disabled={loading}>{loading ? "Consultando..." : "Aplicar filtros"}</button><button type="button" className="btn" onClick={clearFilters} disabled={loading}>Limpar</button></div>
        </form>
      </section>

      <section className="residuos-lista" aria-live="polite">
        {snapshot.items.length === 0 ? (
          <div className="cartao residuos-vazio">
            <h2>Nenhuma troca encontrada</h2>
            <p className="sub">Registre a retirada de uma caçamba para acompanhar MTR e destinação.</p>
            {canEdit && <button type="button" className="btn btn-forte" onClick={() => setDraft(emptyDraft())}>Registrar primeira troca</button>}
          </div>
        ) : snapshot.items.map((item) => (
          <ResiduoCard
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            canEdit={canEdit}
            fileBusy={fileBusy}
            cancelling={cancellingId === item.id}
            onToggle={() => setExpandedId((current) => current === item.id ? null : item.id)}
            onEdit={() => setDraft(draftFromItem(item))}
            onCancel={() => void cancel(item)}
            onAttach={(tipo, event) => void attach(item, tipo, event)}
          />
        ))}
      </section>

      <div className="residuos-pagination">
        <button type="button" className="btn" disabled={loading || snapshot.page <= 1} onClick={() => void load(snapshot.page - 1, filters)}>Anterior</button>
        <span>{snapshot.total} registro{snapshot.total === 1 ? "" : "s"}</span>
        <button type="button" className="btn" disabled={loading || !snapshot.hasNextPage} onClick={() => void load(snapshot.page + 1, filters)}>Próxima</button>
      </div>

      {draft && canEdit && (
        <ResiduoForm
          draft={draft}
          saving={saving}
          onChange={changeDraft}
          onSubmit={save}
          onClose={() => { if (!saving) setDraft(null); }}
        />
      )}
    </main>
  );
}

function ResiduoCard({
  item,
  expanded,
  canEdit,
  fileBusy,
  cancelling,
  onToggle,
  onEdit,
  onCancel,
  onAttach,
}: {
  item: ResiduoTroca;
  expanded: boolean;
  canEdit: boolean;
  fileBusy: string | null;
  cancelling: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onAttach: (tipo: ResiduoAnexoTipo, event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <article className={"cartao residuo-card " + (expanded ? "aberto" : "")}>
      <div className="residuo-card-topo">
        <button type="button" className="residuo-card-summary" onClick={onToggle} aria-expanded={expanded}>
          <span className="residuo-card-date">{formatarDataResiduo(item.data_troca)}</span>
          <span className="residuo-card-main"><b>{item.identificacao_cacamba || "Caçamba sem identificação"}</b><small>{labelCategoria(item.categoria)} · {item.empresa_coletora || item.transportadora_destino || "Coleta não informada"}</small></span>
          <span className={"residuo-status residuo-status-" + item.status.toLowerCase()}>{labelStatus(item.status)}</span>
          <span className="residuo-card-arrow" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
        </button>
        {canEdit && <button type="button" className="btn residuo-edit-btn" onClick={onEdit}>Editar</button>}
      </div>
      <div className="residuo-card-facts">
        <span><small>Peso</small><b>{formatarNumeroResiduo(item.peso_kg)} kg</b></span>
        <span><small>MTR</small><b>{item.mtr_numero || "Não informado"}</b></span>
        <span><small>Destino</small><b>{item.destino_final || "Não informado"}</b></span>
        <span><small>Custo</small><b>{formatarMoedaResiduo(item.custo)}</b></span>
      </div>
      {expanded && (
        <div className="residuo-card-detalhes">
          <div className="residuo-detail-grid">
            <Detail label="Empresa coletora" value={item.empresa_coletora} />
            <Detail label="Transportadora / destino" value={item.transportadora_destino} />
            <Detail label="Placa do caminhão" value={item.placa_caminhao} />
            <Detail label="Motorista" value={item.motorista} />
            <Detail label="Horário da retirada" value={item.horario_retirada?.slice(0, 5)} />
            <Detail label="Atualizado em" value={formatarDataHoraResiduo(item.updated_at)} />
            <Detail label="Observação" value={item.observacao} wide />
          </div>
          <div className="residuo-anexos">
            <div className="residuo-subheading"><h3>Documentos da troca</h3><span>{item.anexos.length} anexo{item.anexos.length === 1 ? "" : "s"}</span></div>
            {item.anexos.length > 0 && <div className="residuo-anexo-lista">{item.anexos.map((anexo) => <ResiduoAttachment key={anexo.id} anexo={anexo} />)}</div>}
            {canEdit && (
              <div className="residuo-upload-actions">
                <UploadButton label={fileBusy === item.id + ":foto" ? "Enviando foto..." : "Adicionar foto"} accept="image/*" disabled={Boolean(fileBusy) || cancelling} onChange={(event) => onAttach("foto", event)} />
                <UploadButton label={fileBusy === item.id + ":mtr" ? "Enviando MTR..." : "Adicionar MTR"} accept="application/pdf,image/*" disabled={Boolean(fileBusy) || cancelling} onChange={(event) => onAttach("mtr", event)} />
              </div>
            )}
            {item.anexos.length === 0 && !canEdit && <p className="sub">Nenhum arquivo anexado.</p>}
          </div>
          {canEdit && item.status !== "CANCELADO" && <div className="residuo-card-actions"><button type="button" className="btn residuo-danger" onClick={onCancel} disabled={cancelling}>{cancelling ? "Cancelando..." : "Cancelar troca"}</button></div>}
        </div>
      )}
    </article>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return <div className={wide ? "residuo-detail-wide" : ""}><small>{label}</small><b>{value || "Não informado"}</b></div>;
}

function ResiduoAttachment({ anexo }: { anexo: ResiduoAnexo }) {
  const isImage = Boolean(anexo.url && anexo.mime_type?.startsWith("image/"));
  if (!anexo.url) {
    return <span className="residuo-anexo indisponivel"><span className="residuo-anexo-icone">{anexo.tipo === "mtr" ? "MTR" : "IMG"}</span><span><b>{anexo.nome_arquivo}</b><small>Salvo; visualização indisponível. Recarregue a tela.</small></span></span>;
  }
  if (isImage) {
    return (
      <a className="residuo-anexo imagem" href={anexo.url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={anexo.url} alt={anexo.nome_arquivo} />
      </a>
    );
  }
  return <a className="residuo-anexo" href={anexo.url} target="_blank" rel="noreferrer"><span className="residuo-anexo-icone">MTR</span><span><b>{anexo.nome_arquivo}</b><small>{anexo.mime_type || "Arquivo"} · {anexo.tamanho_bytes == null ? "" : tamanhoLegivel(anexo.tamanho_bytes)}</small></span></a>;
}

function UploadButton({ label, accept, disabled, onChange }: { label: string; accept: string; disabled: boolean; onChange: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <label className={"btn residuo-upload " + (disabled ? "disabled" : "")}><span>{label}</span><input type="file" accept={accept} disabled={disabled} onChange={onChange} /></label>;
}

function ResiduoForm({
  draft,
  saving,
  onChange,
  onSubmit,
  onClose,
}: {
  draft: Draft;
  saving: boolean;
  onChange: <K extends keyof Draft>(field: K, value: Draft[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <div className="residuos-modal" role="presentation">
      <div className="residuos-modal-backdrop" onClick={onClose} />
      <section className="cartao residuos-form-modal" role="dialog" aria-modal="true" aria-labelledby="residuo-form-title">
        <div className="residuos-modal-heading"><div><p className="residuos-eyebrow">{draft.id ? "Editar registro" : "Novo registro"}</p><h2 id="residuo-form-title">{draft.id ? "Editar troca de caçamba" : "Registrar troca de caçamba"}</h2></div><button type="button" className="btn residuos-close" onClick={onClose} disabled={saving} aria-label="Fechar">×</button></div>
        <p className="sub">O MTR e as fotos podem ser anexados depois da gravação.</p>
        <form onSubmit={onSubmit} className="residuo-form-grid">
          <label><span className="rotulo">Categoria *</span><select className="campo" value={draft.categoria} onChange={(event) => onChange("categoria", event.target.value as ResiduoCategoria)} required>{RESIDUO_CATEGORIAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span className="rotulo">Data da troca *</span><input className="campo" type="date" value={draft.data_troca} onChange={(event) => onChange("data_troca", event.target.value)} required /></label>
          <label><span className="rotulo">Identificação da caçamba</span><input className="campo" value={draft.identificacao_cacamba} onChange={(event) => onChange("identificacao_cacamba", event.target.value)} maxLength={160} placeholder="Ex.: CCB-014" /></label>
          <label><span className="rotulo">MTR / manifesto</span><input className="campo" value={draft.mtr_numero} onChange={(event) => onChange("mtr_numero", event.target.value)} maxLength={120} /></label>
          <label><span className="rotulo">Empresa coletora</span><input className="campo" value={draft.empresa_coletora} onChange={(event) => onChange("empresa_coletora", event.target.value)} maxLength={160} /></label>
          <label><span className="rotulo">Transportadora / destino</span><input className="campo" value={draft.transportadora_destino} onChange={(event) => onChange("transportadora_destino", event.target.value)} maxLength={160} /></label>
          <label><span className="rotulo">Peso (kg)</span><input className="campo" type="number" min="0" step="0.01" value={draft.peso_kg} onChange={(event) => onChange("peso_kg", event.target.value)} /></label>
          <label><span className="rotulo">Custo (R$)</span><input className="campo" type="number" min="0" step="0.01" value={draft.custo} onChange={(event) => onChange("custo", event.target.value)} /></label>
          <label><span className="rotulo">Placa do caminhão</span><input className="campo" value={draft.placa_caminhao} onChange={(event) => onChange("placa_caminhao", event.target.value)} maxLength={20} /></label>
          <label><span className="rotulo">Motorista</span><input className="campo" value={draft.motorista} onChange={(event) => onChange("motorista", event.target.value)} maxLength={160} /></label>
          <label><span className="rotulo">Horário da retirada</span><input className="campo" type="time" value={draft.horario_retirada} onChange={(event) => onChange("horario_retirada", event.target.value)} /></label>
          <label><span className="rotulo">Status</span><select className="campo" value={draft.status} onChange={(event) => onChange("status", event.target.value as ResiduoStatus)}>{RESIDUO_STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="residuo-form-wide"><span className="rotulo">Destinação final</span><input className="campo" value={draft.destino_final} onChange={(event) => onChange("destino_final", event.target.value)} maxLength={240} placeholder="Aterro, recicladora ou unidade receptora" /></label>
          <label className="residuo-form-wide"><span className="rotulo">Observação</span><textarea className="campo" value={draft.observacao} onChange={(event) => onChange("observacao", event.target.value)} maxLength={4000} rows={3} /></label>
          <div className="residuos-modal-actions"><button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="btn btn-forte" disabled={saving}>{saving ? "Salvando..." : draft.id ? "Salvar alterações" : "Salvar troca"}</button></div>
        </form>
      </section>
    </div>
  );
}
