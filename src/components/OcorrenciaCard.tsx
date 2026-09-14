"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  adicionarAnexoRetrabalho,
  mutarQualidade,
} from "@/lib/qualidadeCompat";
import ChipGroup from "@/components/ChipGroup";
import HistoricoRegistro from "@/components/HistoricoRegistro";
import { SeloCriticidade, SeloStatus } from "@/components/Selo";
import SeletorFoto from "@/components/auditoria/SeletorFoto";
import { BUCKET_AUDITORIA, enviarFotoAuditoria } from "@/lib/anexos";
import type { AnexoOcorrencia, Ocorrencia, Role, Status } from "@/lib/types";
import { ROTULO_STATUS } from "@/lib/types";

/* O status RETRABALHO_PENDENTE não é escolhido: ele é a consequência de
   marcar retrabalho sem ser da gestão. Por isso fica fora do seletor. */
const ESCOLHIVEIS: Status[] = [
  "AGUARDANDO",
  "RETRABALHO",
  "NAO_CONFORMIDADE",
  "BLOQUEADA",
];

function formatarData(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

type FotoPosRetrabalhoPendente = {
  id: string;
  path: string;
  dados: Record<string, unknown>;
};

/** Envia somente o JPEG já comprimido; o vínculo ainda será gravado no RPC. */
async function prepararFotoPosRetrabalho(
  supabase: ReturnType<typeof createClient>,
  item: Ocorrencia,
  arquivo: File
): Promise<FotoPosRetrabalhoPendente> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sua sessão expirou. Entre novamente.");

  const anexoUid = crypto.randomUUID();
  const anexoId = `rework_${anexoUid}`;
  const projetoId =
    item.projeto_id || item.auditoria_id?.split("|")[0] || item.projeto;
  const paredeId = item.parede_id || item.parede;
  const path = await enviarFotoAuditoria(supabase, {
    usuarioId: data.user.id,
    projetoId,
    casaId: item.casa,
    paredeId,
    anexoId: anexoUid,
    extensao: "jpg",
    arquivo,
  });

  return {
    id: anexoId,
    path,
    dados: {
      id: anexoId,
      name: arquivo.name || "foto-pos-retrabalho.jpg",
      type: "image/jpeg",
      size: arquivo.size,
      path,
      deviationId: String(item.id),
      wallId: paredeId,
      wallName: item.parede,
      projectId: projetoId,
      uploadedAt: new Date().toISOString(),
    },
  };
}

function FotosDaOcorrencia({ anexos }: { anexos?: AnexoOcorrencia[] }) {
  if (!anexos?.length) return null;

  const grupos = [
    {
      titulo: "Foto original do desvio",
      itens: anexos.filter((anexo) => anexo.tipo !== "retrabalho"),
    },
    {
      titulo: "Foto pós-retrabalho",
      itens: anexos.filter((anexo) => anexo.tipo === "retrabalho"),
    },
  ].filter((grupo) => grupo.itens.length > 0);

  return (
    <section className="ocorrencia-fotos" aria-label="Fotos da ocorrência">
      <p className="rotulo">Evidências fotográficas</p>
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="ocorrencia-fotos-titulo">{grupo.titulo}</p>
          <div className="ocorrencia-fotos-lista">
            {grupo.itens.map((anexo) =>
              anexo.url ? (
                <a
                  key={anexo.id}
                  href={anexo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ocorrencia-foto"
                  title={`${anexo.nome_arquivo ?? grupo.titulo} · abrir foto`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={anexo.url}
                    alt={`${grupo.titulo} — ${anexo.nome_arquivo ?? "imagem"}`}
                  />
                  <span>{anexo.nome_arquivo ?? "Abrir foto"}</span>
                </a>
              ) : (
                <span key={anexo.id} className="anexo-indisponivel">
                  {anexo.nome_arquivo ?? "Foto sem visualização"}
                </span>
              )
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function OcorrenciaCard({
  item,
  role,
  onSalvo,
}: {
  item: Ocorrencia;
  role: Role;
  onSalvo: (novo: Ocorrencia) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [novoStatus, setNovoStatus] = useState<string>(
    item.status === "RETRABALHO_PENDENTE"
      ? role === "gestao"
        ? "RETRABALHO"
        : "" // quem não é gestão não tem como concluir: nada pré-selecionado
      : item.status
  );
  const [obs, setObs] = useState(item.observacao ?? "");
  const [dataRetrabalho, setDataRetrabalho] = useState(
    item.resolved_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [salvando, setSalvando] = useState(false);
  const [faltaObs, setFaltaObs] = useState(false);
  const [fotoPosRetrabalho, setFotoPosRetrabalho] = useState<File | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const campoObs = useRef<HTMLTextAreaElement>(null);

  const gestao = role === "gestao";
  /* Consultor acompanha e não altera. Aberto o cartão, ele vê a
     observação escrita e os carimbos de data; o formulário inteiro some.
     A recusa de verdade está na RLS (migration 026) — isto aqui é só
     não oferecer o que vai ser negado. */
  const somenteLeitura = role === "consultor";
  /* a parede saiu daqui e ganhou selo próprio: este texto é o que pode
     encurtar quando a linha aperta */
  const contexto = [item.projeto, item.setor].filter(Boolean).join(" · ");

  /* Sem RETRABALHO no seletor de quem não aprova: o registro já está na
     fila e insistir só levaria a uma recusa do banco. */
  const opcoes =
    !gestao && item.status === "RETRABALHO_PENDENTE"
      ? ESCOLHIVEIS.filter((s) => s !== "RETRABALHO")
      : ESCOLHIVEIS;

  const mudouStatus = novoStatus !== "" && novoStatus !== item.status;
  /* Marcar retrabalho sem ser gestão não fecha o erro: ele entra na fila
     de aprovação. A tela avisa antes, para ninguém achar que resolveu. */
  const viraPendente =
    !gestao && novoStatus === "RETRABALHO" && item.status !== "RETRABALHO";

  async function enviar(status: string, observacao: string, avisoOk: string) {
    if (salvando) return;
    setSalvando(true);
    const supabase = createClient();
    let fotoPendente: FotoPosRetrabalhoPendente | null = null;
    let fotoRemovida = false;

    const limparFotoPendente = async () => {
      if (!fotoPendente || fotoRemovida) return;
      fotoRemovida = true;
      const { error } = await supabase.storage
        .from(BUCKET_AUDITORIA)
        .remove([fotoPendente.path]);
      if (error) {
        toast.error(
          "Não foi possível limpar a foto enviada. O arquivo ficou preservado para revisão."
        );
      }
    };

    try {
      if (
        fotoPosRetrabalho &&
        (status === "RETRABALHO" || status === "RETRABALHO_PENDENTE")
      ) {
        fotoPendente = await prepararFotoPosRetrabalho(
          supabase,
          item,
          fotoPosRetrabalho
        );
      }

      // Meio-dia em São Paulo: a data não desliza de fuso em nenhuma direção.
      const resolvedAt =
        (status === "RETRABALHO" || status === "RETRABALHO_PENDENTE") &&
        dataRetrabalho
          ? `${dataRetrabalho}T12:00:00-03:00`
          : null;

      const { data, error } = await mutarQualidade("ATUALIZAR_DESVIO", {
        id: item.id,
        status,
        observacao: observacao.trim() || null,
        resolved_at: resolvedAt,
      });
      if (error) {
        await limparFotoPendente();
        toast.error(error.message);
        return;
      }

      let novo =
        (data as Ocorrencia | null) ??
        ({
          ...item,
          status: status as Status,
          observacao: observacao.trim() || null,
        } as Ocorrencia);

      if (fotoPendente) {
        const { error: vinculoError } = await adicionarAnexoRetrabalho({
          deviation_id: String(item.id),
          anexo: fotoPendente.dados,
        });

        if (vinculoError) {
          await limparFotoPendente();
          toast.error(
            "O status foi salvo, mas não foi possível vincular a foto pós-retrabalho. Tente anexá-la novamente."
          );
        } else {
          const assinado = await supabase.storage
            .from(BUCKET_AUDITORIA)
            .createSignedUrl(fotoPendente.path, 60 * 60);
          const anexo: AnexoOcorrencia = {
            id: fotoPendente.id,
            tipo: "retrabalho",
            nome_arquivo: String(fotoPendente.dados.name),
            mime_type: "image/jpeg",
            tamanho_bytes: Number(fotoPendente.dados.size),
            storage_bucket: BUCKET_AUDITORIA,
            storage_path: fotoPendente.path,
            url: assinado.data?.signedUrl ?? null,
          };
          novo = {
            ...novo,
            anexos: [...(item.anexos ?? []), anexo],
          };
        }
      }

      toast.success(avisoOk);
      setAberto(false);
      onSalvo(novo);
    } catch (error) {
      await limparFotoPendente();
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a alteração."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    if (salvando) return;
    if (!novoStatus) {
      toast.error("Escolha o novo status.");
      return;
    }

    // regra do negócio, repetida aqui só para avisar antes de gastar a viagem
    if (mudouStatus && obs.trim() === "") {
      setFaltaObs(true);
      campoObs.current?.focus();
      toast.error(
        "Escreva uma observação: sem ela não é possível alterar o status."
      );
      return;
    }
    setFaltaObs(false);
    await enviar(
      novoStatus,
      obs,
      viraPendente
        ? "Retrabalho registrado. Aguardando aprovação da gestão."
        : "Alteração salva."
    );
  }

  async function aprovar() {
    if (salvando) return;
    const texto =
      obs.trim() ||
      `${item.observacao ?? ""}${item.observacao ? " · " : ""}Retrabalho aprovado.`;
    await enviar("RETRABALHO", texto, "Retrabalho aprovado.");
  }

  async function recusar() {
    if (salvando) return;
    if (obs.trim() === "") {
      setFaltaObs(true);
      campoObs.current?.focus();
      toast.error("Explique na observação por que o retrabalho foi recusado.");
      return;
    }
    setFaltaObs(false);
    await enviar(
      "AGUARDANDO",
      obs,
      "Retrabalho recusado. O erro voltou para a fila."
    );
  }

  return (
    <div className="cartao" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="block w-full px-4 py-3.5 text-left transition"
      >
        {/* CASA e PAREDE identificam o painel no chão de fábrica; o resto
            é contexto. A parede vinha junto do projeto num texto que
            encurta quando falta espaço, e em "ESCOLA ZACARIAS PR" o nome
            do projeto sozinho já estourava a linha — o PT era a primeira
            coisa a sumir, justamente a que se procura. Agora ela tem
            selo próprio e não encurta nunca. */}
        <div className="mb-1.5 flex items-center gap-2">
          <span className="num min-w-0 truncate text-[14.5px] font-bold">
            Casa {item.casa}
          </span>
          {item.parede && (
            <span className="num selo-parede" title={`Parede ${item.parede}`}>
              {item.parede}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-3">
            {contexto}
          </span>
          <span className="num shrink-0 text-[11px] text-ink-3">
            {formatarData(item.data)}
          </span>
        </div>
        <div className="mb-1 flex items-center gap-2 text-[13px] font-medium">
          {item.tipo_erro} <SeloCriticidade criticidade={item.criticidade} />
        </div>
        <div className="text-[12.5px] leading-snug text-ink-2">
          {item.ocorrencia}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SeloStatus status={item.status} />
          {(item.status === "RETRABALHO" ||
            item.status === "RETRABALHO_PENDENTE") &&
            item.resolved_at && (
              <span
                className="num text-[11px]"
                style={{
                  color:
                    item.status === "RETRABALHO"
                      ? "var(--color-baixa)"
                      : "var(--color-ink-3)",
                }}
              >
                em {formatarData(item.resolved_at)}
              </span>
            )}
          {item.criador?.nome && (
            <span className="text-[11px] text-ink-3">
              por {item.criador.nome}
            </span>
          )}
        </div>
      </button>

      {aberto && (
        <div
          className="border-t px-4 py-3.5"
          style={{
            borderColor: "var(--color-line)",
            background: "var(--color-papel-2)",
          }}
        >
          <FotosDaOcorrencia anexos={item.anexos} />

          {item.status === "RETRABALHO_PENDENTE" && (
            <div
              className="mb-3.5 rounded-lg border p-3"
              style={{
                borderColor: "var(--color-info)",
                background: "color-mix(in srgb, var(--color-info) 8%, transparent)",
              }}
            >
              <p className="text-[12.5px] font-bold" style={{ color: "var(--color-info)" }}>
                Retrabalho aguardando aprovação
              </p>
              <p className="sub">
                {gestao
                  ? "Confirme que o serviço foi executado. Enquanto não for aprovado, este erro não conta como resolvido em nenhum indicador."
                  : "Somente a gestão pode aprovar. Até lá o erro segue como não resolvido nos indicadores."}
              </p>
              {gestao && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={aprovar}
                    disabled={salvando}
                    className="btn btn-forte"
                    style={{ padding: "10px 14px" }}
                  >
                    {salvando ? "…" : "Aprovar retrabalho"}
                  </button>
                  <button
                    onClick={recusar}
                    disabled={salvando}
                    className="btn"
                    style={{ padding: "10px 14px" }}
                  >
                    Recusar e devolver
                  </button>
                </div>
              )}
            </div>
          )}

          {somenteLeitura ? (
            <>
              <label className="rotulo">Observação</label>
              <p className="text-[12.5px] text-ink-2">
                {item.observacao?.trim() || "— sem observação registrada —"}
              </p>
            </>
          ) : (
          <>
          <label className="rotulo">Novo status</label>
          <div className="mb-3">
            <ChipGroup
              opcoes={opcoes}
              rotulos={ROTULO_STATUS}
              valor={novoStatus}
              onChange={(v) => {
                setNovoStatus(v);
                if (v !== "RETRABALHO") {
                  setFotoPosRetrabalho(null);
                  setProcessandoFoto(false);
                }
              }}
            />
          </div>

          {item.status === "NAO_CONFORMIDADE" && novoStatus === "RETRABALHO" && (
            <p className="sub" style={{ marginTop: -8, marginBottom: 10 }}>
              Corrigindo um registro sem devolutiva: informe a data em que o
              retrabalho foi realmente feito.
            </p>
          )}

          {viraPendente && (
            <p
              className="mb-2.5 text-[11.5px] leading-snug"
              style={{ color: "var(--color-info)" }}
            >
              Ao salvar, o registro fica como <b>RETRABALHO PENDENTE</b> até a
              gestão aprovar.
            </p>
          )}

          {novoStatus === "RETRABALHO" && (
            <>
              <label className="rotulo">Data do retrabalho</label>
              <input
                type="date"
                value={dataRetrabalho}
                onChange={(e) => setDataRetrabalho(e.target.value)}
                className="campo mb-3"
              />
            </>
          )}

          <label className="rotulo">
            Observação
            {mudouStatus && (
              <span style={{ color: "var(--color-alta)" }}> · obrigatória</span>
            )}
          </label>
          <textarea
            ref={campoObs}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              if (faltaObs && e.target.value.trim() !== "") setFaltaObs(false);
            }}
            aria-invalid={faltaObs}
            placeholder={
              mudouStatus
                ? "O que foi feito? Quem executou? Ficou algo pendente?"
                : "Opcional enquanto o status não muda"
            }
            className={`campo ${faltaObs ? "invalido" : ""}`}
          />
          {faltaObs && (
            <p
              className="mt-1.5 text-[11.5px] font-semibold"
              style={{ color: "var(--color-alta)" }}
              role="alert"
            >
              Você precisa escrever uma observação para alterar o status.
            </p>
          )}

          {novoStatus === "RETRABALHO" && (
            <div className="mt-3">
              <SeletorFoto
                id={`foto-pos-retrabalho-${String(item.id)}`}
                titulo="Foto pós-retrabalho (opcional)"
                descricao="A evidência será compactada e vinculada a este desvio no Storage privado."
                salvando={salvando}
                onArquivoPronto={setFotoPosRetrabalho}
                onProcessando={setProcessandoFoto}
              />
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando || processandoFoto}
            className="btn btn-forte mt-3 w-full"
            style={{ padding: "11px 16px", fontSize: 14.5 }}
          >
            {salvando ? "Salvando…" : "Salvar alteração"}
          </button>
          </>
          )}

          {item.status === "RETRABALHO" && item.aprovado_em && (
            <p className="num mt-2 text-center text-[10.5px] text-ink-3">
              retrabalho aprovado em {formatarData(item.aprovado_em)}
            </p>
          )}
          {item.updated_at && (
            <p className="num mt-1 text-center text-[10.5px] text-ink-3">
              última atualização em {formatarData(item.updated_at)}
            </p>
          )}

          {gestao && <HistoricoRegistro tabela="ocorrencias" id={item.id} />}
        </div>
      )}
    </div>
  );
}
