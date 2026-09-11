"use client";

import { useState } from "react";
import FormularioErro, { type NovoErro } from "./FormularioErro";
import FormularioNa, { type NovoNa } from "./FormularioNa";
import { SeloCriticidade, SeloStatus } from "@/components/Selo";
import type { ErroDaAuditoria, NaDaAuditoria } from "@/lib/auditoria";
import type { ConfigItem } from "@/lib/types";

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
  aoAdicionarErro: (e: NovoErro, dia: string) => Promise<void>;
  aoRemoverErro: (id: string) => void;
  /* sem dia: o NA não é acontecimento de um dia, é característica da
     parede — ela não leva aquele item, e isso não muda de data para data */
  aoAdicionarNa: (n: NovoNa) => Promise<void>;
  aoRemoverNa: (id: string) => void;
  /** só é chamado quando a parede JÁ está conferida */
  aoMudarData: (dia: string) => void;
  salvando: boolean;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [adicionandoNa, setAdicionandoNa] = useState(false);
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
          aoAdicionar={async (e) => {
            await aoAdicionarErro(e, dia);
            setAdicionando(false);
          }}
        />
      ) : adicionandoNa ? (
        <FormularioNa
          tipos={tipos}
          tiposJaAdicionados={nas.map((n) => n.tipo_erro)}
          salvando={salvando}
          aoCancelar={() => setAdicionandoNa(false)}
          aoAdicionar={async (n) => {
            await aoAdicionarNa(n);
            setAdicionandoNa(false);
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

      {semErros && !inspecionada && !somenteLeitura && (
        <p className="sub">
          Marque “Parede sem erros” para registrar que ela foi conferida — é
          isso que faz a parede contar no FPY.
        </p>
      )}
    </div>
  );
}
