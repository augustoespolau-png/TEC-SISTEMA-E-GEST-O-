"use client";

import { useRef, useState } from "react";
import FormularioErro, { type NovoErro } from "./FormularioErro";
import FormularioNa, { type NovoNa } from "./FormularioNa";
import { SeloCriticidade, SeloStatus } from "@/components/Selo";
import type { ErroDaAuditoria, NaDaAuditoria } from "@/lib/auditoria";
import type { AnexoProjetoParede, ConfigItem } from "@/lib/types";

/** O que abre embaixo quando o auditor toca numa parede. */
export default function PainelParede({
  parede,
  erros,
  nas,
  temNa,
  somenteLeitura,
  inspecionada,
  data,
  hoje,
  tipos,
  setores,
  aoMarcarOk,
  aoAdicionarErro,
  aoRemoverErro,
  aoAdicionarNa,
  aoRemoverNa,
  aoMudarData,
  aoZerarInspecao,
  projetoAnexo,
  salvando,
}: {
  parede: string;
  erros: ErroDaAuditoria[];
  nas: NaDaAuditoria[];
  /** false enquanto a migration do NA não rodou; esconde a função */
  temNa: boolean;
  /** consultor: vê a parede conferida e não altera nada */
  somenteLeitura: boolean;
  inspecionada: boolean;
  /** dia desta parede; vazio enquanto ela não foi conferida */
  data: string;
  hoje: string;
  tipos: ConfigItem[];
  setores: ConfigItem[];
  aoMarcarOk: (dia: string) => void;
  aoAdicionarErro: (e: NovoErro, dia: string) => void;
  aoRemoverErro: (id: string) => void;
  /* sem dia: o NA não é acontecimento de um dia, é característica da
     parede — ela não leva aquele item, e isso não muda de data para data */
  aoAdicionarNa: (n: NovoNa) => void;
  aoRemoverNa: (id: string) => void;
  /** só é chamado quando a parede JÁ está conferida */
  aoMudarData: (dia: string) => void;
  /** volta a parede ao estado ainda não conferida e remove os registros da inspeção */
  aoZerarInspecao: () => void;
  /** desenho técnico da posição, com URL assinada da sessão atual */
  projetoAnexo?: AnexoProjetoParede | null;
  salvando: boolean;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [adicionandoNa, setAdicionandoNa] = useState(false);
  const resetDialogo = useRef<HTMLDialogElement>(null);
  /* Enquanto a parede não foi conferida, a data fica só aqui: nada foi
     gravado ainda. Depois de conferida, mexer no campo salva na hora. */
  const [rascunho, setRascunho] = useState(data || hoje);
  const dia = inspecionada ? data : rascunho;
  const semErros = erros.length === 0;

  return (
    <div
      className="grid gap-3 rounded-lg border p-3.5"
      style={{
        borderColor: "var(--color-line-2)",
        background: "var(--color-papel-2)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="titulo-secao">Parede {parede}</h3>
        {inspecionada && semErros && (
          <span className="chip ok">SEM ERROS</span>
        )}
        {!semErros && (
          <span className="chip bloqueada">
            {erros.length} {erros.length === 1 ? "ERRO" : "ERROS"}
          </span>
        )}
        {nas.length > 0 && (
          <span className="chip" title="Itens não aplicáveis a esta parede">
            {nas.length} NA
          </span>
        )}
      </div>

      {projetoAnexo && (
        <div className="projeto-parede-acesso">
          {projetoAnexo.url ? (
            <a
              href={projetoAnexo.url}
              target="_blank"
              rel="noreferrer"
              className="projeto-parede-link"
            >
              <span className="projeto-parede-icone" aria-hidden="true">
                ▣
              </span>
              <span className="min-w-0 flex-1">
                <b>Ver Projeto da Parede</b>
                <small>{projetoAnexo.nome_arquivo}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span className="projeto-parede-indisponivel">
              Projeto da parede cadastrado, mas indisponível no momento.
            </span>
          )}
        </div>
      )}

      {/* A data é DESTA parede: a casa inteira leva dias para passar por
          todas as estações, e o erro encontrado aqui é do dia em que esta
          parede foi olhada. */}
      <div>
        <label className="rotulo">Dia em que esta parede foi conferida</label>
        {somenteLeitura ? (
          <p className="num text-[13px]">
            {dia ? dia.split("-").reverse().join("/") : "ainda não conferida"}
          </p>
        ) : (
        <input
          type="date"
          value={dia}
          max={hoje}
          disabled={salvando}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setRascunho(v);
            if (inspecionada) aoMudarData(v);
          }}
          className="campo"
        />
        )}
        {!somenteLeitura && (
          <p className="sub">
            {inspecionada
              ? "Mudar aqui move também os erros já registrados nesta parede."
              : "Vale para o que for registrado nesta parede."}
          </p>
        )}
      </div>

      {/* erros já registrados nesta parede */}
      {erros.length > 0 && (
        <ul className="grid gap-2">
          {erros.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border p-2.5"
              style={{
                borderColor: "var(--color-line)",
                background: "var(--color-papel)",
              }}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <b className="text-[13px]">{e.tipo_erro}</b>
                <SeloCriticidade criticidade={e.criticidade} />
                <SeloStatus status={e.status} />
                {e.fotoStatus === "ENVIANDO" && (
                  <span className="chip" title="Foto sendo compactada/enviada em segundo plano">◌ Foto enviando…</span>
                )}
                {e.fotoStatus === "ERRO" && (
                  <span className="chip" style={{ color: "var(--color-alta)" }} title="O desvio foi salvo, mas a foto não sincronizou">⚠ Foto pendente</span>
                )}
                <span className="ml-auto text-[11px] text-ink-3">
                  {e.setor}
                </span>
              </div>
              <p className="text-[12.5px] text-ink-2">{e.ocorrencia}</p>
              {e.anexos && e.anexos.length > 0 && (
                <div className="anexos-erro" aria-label="Fotos anexadas ao erro">
                  {e.anexos.map((anexo) =>
                    anexo.url ? (
                      <a
                        key={anexo.id}
                        href={anexo.url}
                        target="_blank"
                        rel="noreferrer"
                        className="anexo-miniatura"
                        title={`${anexo.nome_arquivo ?? "Foto do desvio"} · abrir foto`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={anexo.url}
                          alt={`Foto anexada ao desvio ${e.tipo_erro}`}
                        />
                      </a>
                    ) : (
                      <span key={anexo.id} className="anexo-indisponivel">
                        Foto anexada
                      </span>
                    )
                  )}
                </div>
              )}
              {!somenteLeitura && (
              <button
                onClick={() => aoRemoverErro(e.id)}
                disabled={salvando || e.status !== "AGUARDANDO"}
                className="btn mt-2"
                style={{ fontSize: 11, padding: "5px 10px" }}
                title={
                  e.status !== "AGUARDANDO"
                    ? "Só é possível remover enquanto ninguém tratou o erro"
                    : "Remover este erro"
                }
              >
                Remover
              </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* NA — itens que não se aplicam a esta parede.
          Ficam abaixo dos erros e com moldura tracejada porque não são
          defeito: nada aqui muda o FPY nem entra em indicador de erro. */}
      {nas.length > 0 && (
        <ul className="grid gap-2">
          {nas.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-dashed p-2.5"
              style={{
                borderColor: "var(--color-line-2)",
                background: "var(--color-papel)",
              }}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="chip">NA</span>
                <b className="text-[13px]">{n.tipo_erro}</b>
              </div>
              {n.observacao && (
                <p className="text-[12.5px] text-ink-2">{n.observacao}</p>
              )}
              {!somenteLeitura && (
                <button
                  onClick={() => aoRemoverNa(n.id)}
                  disabled={salvando}
                  className="btn mt-2"
                  style={{ fontSize: 11, padding: "5px 10px" }}
                >
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {somenteLeitura ? null : adicionando ? (
        <FormularioErro
          tipos={tipos}
          setores={setores}
          salvando={salvando}
          aoCancelar={() => setAdicionando(false)}
          aoAdicionar={(e) => {
            setAdicionando(false);
            aoAdicionarErro(e, dia);
          }}
        />
      ) : adicionandoNa ? (
        <FormularioNa
          tipos={tipos}
          tiposJaAdicionados={nas.map((n) => n.tipo_erro)}
          salvando={salvando}
          aoCancelar={() => setAdicionandoNa(false)}
          aoAdicionar={(n) => {
            setAdicionandoNa(false);
            aoAdicionarNa(n);
          }}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAdicionando(true)}
            className="btn btn-forte flex-1"
            style={{ minWidth: 150 }}
            disabled={salvando}
          >
            + Adicionar erro
          </button>
          {temNa && (
            <button
              onClick={() => setAdicionandoNa(true)}
              className="btn flex-1"
              style={{ minWidth: 150 }}
              disabled={salvando}
              title="Item que não se aplica a esta parede. Não conta como erro."
            >
              + Adicionar NA
            </button>
          )}
          {semErros && !inspecionada && (
            <button
              onClick={() => aoMarcarOk(dia)}
              className="btn flex-1"
              style={{ minWidth: 150 }}
              disabled={salvando}
            >
              Parede sem erros
            </button>
          )}
        </div>
      )}

      {!somenteLeitura && (inspecionada || erros.length > 0 || nas.length > 0) && (
        <>
          <button
            type="button"
            onClick={() => resetDialogo.current?.showModal()}
            className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition"
            style={{
              borderColor: "color-mix(in srgb, var(--color-media) 30%, var(--color-line))",
              background: "color-mix(in srgb, var(--color-media) 7%, var(--color-papel))",
            }}
            title="Apagar a inspeção desta parede e voltar para ainda não conferida"
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[17px]"
              style={{
                color: "var(--color-media)",
                background: "color-mix(in srgb, var(--color-media) 12%, transparent)",
              }}
            >
              ↺
            </span>
            <span className="min-w-0">
              <b className="block text-[12.5px]" style={{ color: "var(--color-media)" }}>
                Zerar inspeção
              </b>
              <small className="block text-[11px] leading-snug text-ink-3">
                Volta esta parede para “ainda não conferida”.
              </small>
            </span>
          </button>

          <dialog ref={resetDialogo} className="janela">
            <h2>Zerar inspeção da parede {parede}?</h2>
            <p className="sub">
              A parede voltará para “ainda não conferida”. Serão removidos a data da inspeção,
              {erros.length > 0 ? ` ${erros.length} ${erros.length === 1 ? "erro" : "erros"}` : " nenhum erro"},
              {nas.length > 0 ? ` ${nas.length} ${nas.length === 1 ? "NA" : "NAs"}` : " nenhum NA"}
              {erros.some((erro) => (erro.anexos?.length ?? 0) > 0) ? " e as fotos vinculadas" : ""}.
            </p>
            <div className="corpo flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => resetDialogo.current?.close()}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  color: "var(--color-media)",
                  borderColor: "color-mix(in srgb, var(--color-media) 55%, var(--color-line))",
                  background: "color-mix(in srgb, var(--color-media) 8%, var(--color-papel))",
                }}
                onClick={() => {
                  resetDialogo.current?.close();
                  aoZerarInspecao();
                }}
              >
                Zerar inspeção
              </button>
            </div>
          </dialog>
        </>
      )}

      {semErros && !inspecionada && !somenteLeitura && (
        <p className="sub">
          Marque “Parede sem erros” para registrar que ela foi conferida — é
          isso que faz a parede contar no FPY.
        </p>
      )}
    </div>
  );
}
