from pathlib import Path
import re

repo = Path('.')

aud_path = repo / 'src/components/auditoria/AuditoriaCasa.tsx'
painel_path = repo / 'src/components/auditoria/PainelParede.tsx'

# -------- AuditoriaCasa --------
aud = aud_path.read_text(encoding='utf-8')

needle = '  const salvandoRef = useRef(false);\n'
if 'zerandoParedesRef' not in aud:
    aud = aud.replace(
        needle,
        needle + '  const zerandoParedesRef = useRef(new Set<string>());\n  const removendoErrosRef = useRef(new Set<string>());\n',
        1,
    )

foto_inicio = aud.index('  async function salvarFotoDoDesvio(')
foto_fim = aud.index('\n  function adicionarErro(', foto_inicio)
novo_foto = r'''  async function prepararFotoDoDesvio(
    supabase: ReturnType<typeof createClient>,
    auditoriaFoto: Auditoria,
    parede: string,
    arquivo: File
  ) {
    const anexoUid = crypto.randomUUID();
    const anexoId = `attachment_${anexoUid}`;
    const { data: sessao } = await supabase.auth.getSession();
    const usuario = sessao.session?.user;
    if (!usuario) {
      return {
        error: new Error("Sua sessão expirou. Entre novamente para anexar a foto."),
        caminho: null,
        anexo: null,
      };
    }

    const projetoCfg = cfg?.projetos.find((item) => item.nome === auditoriaFoto.projeto);
    const projetoId =
      projetoCfg?.id?.toString() ??
      (auditoriaFoto.id.split("|", 1)[0] || auditoriaFoto.projeto);
    const paredeId =
      cfg?.paredes.find(
        (item) => item.projeto_id === projetoCfg?.id && item.nome === parede
      )?.id?.toString() ?? parede;

    try {
      /* Compressão + upload começam em paralelo com o RPC que cria o desvio.
         Assim a foto não adiciona espera ao gesto do inspetor. */
      const arquivoOtimizado = await otimizarFoto(arquivo);
      const caminho = await enviarFotoAuditoria(supabase, {
        usuarioId: usuario.id,
        projetoId,
        casaId: auditoriaFoto.casa,
        paredeId,
        anexoId: anexoUid,
        extensao: "jpg",
        arquivo: arquivoOtimizado,
      });
      return {
        error: null,
        caminho,
        anexo: {
          id: anexoId,
          name: arquivoOtimizado.name,
          type: "image/jpeg",
          size: arquivoOtimizado.size,
          path: caminho,
          wallId: paredeId,
        },
      };
    } catch (caught) {
      return {
        error:
          caught instanceof Error
            ? caught
            : new Error("Não foi possível enviar a foto."),
        caminho: null,
        anexo: null,
      };
    }
  }

  async function vincularFotoAoDesvio(
    supabase: ReturnType<typeof createClient>,
    auditoriaFoto: Auditoria,
    parede: string,
    desvioId: string,
    preparada: Awaited<ReturnType<typeof prepararFotoDoDesvio>>
  ) {
    if (preparada.error || !preparada.anexo || !preparada.caminho) {
      return { error: preparada.error ?? new Error("Foto não preparada.") };
    }

    const { error } = await mutarQualidade("ADICIONAR_ANEXO", {
      auditoria_id: auditoriaFoto.id,
      parede,
      deviation_id: desvioId,
      anexo: {
        ...preparada.anexo,
        deviationId: desvioId,
      },
    });

    if (error) {
      await supabase.storage.from(BUCKET_AUDITORIA).remove([preparada.caminho]);
      return { error };
    }
    return { error: null };
  }
'''
aud = aud[:foto_inicio] + novo_foto + aud[foto_fim:]

add_inicio = aud.index('  function adicionarErro(')
add_fim = aud.index('\n  /* NA não confere a parede:', add_inicio)
novo_adicionar = r'''  function adicionarErro(parede: string, novo: NovoErro, dia: string) {
    if (!auditoria) return;
    const auditoriaAtual = auditoria;
    const auditoriaId = auditoriaAtual.id;
    const supabase = createClient();
    const { anexo, ...dadosErro } = novo;
    const fotoEmSegundoPlano = anexo
      ? prepararFotoDoDesvio(supabase, auditoriaAtual, parede, anexo)
      : null;
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
    toast.success(
      anexo
        ? "Erro adicionado. Foto enviando em segundo plano."
        : "Erro adicionado. Sincronizando em segundo plano."
    );

    const marcarFoto = (status: "ERRO" | undefined) => {
      if (auditoriaIdRef.current !== auditoriaId) return;
      const atualizados = errosRef.current.map((item) =>
        item.id === idOtimista || item.id === idPersistido
          ? { ...item, fotoStatus: status }
          : item
      );
      errosRef.current = atualizados;
      setErros(atualizados);
    };

    const rollback = (mensagem: string) => {
      if (auditoriaIdRef.current !== auditoriaId) {
        toast.error(mensagem);
        return;
      }
      const errosAtuais = errosRef.current.filter(
        (item) => item.id !== idOtimista && item.id !== idPersistido
      );
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

    let idPersistido = "";

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
          if (fotoEmSegundoPlano) {
            void fotoEmSegundoPlano.then((preparada) => {
              if (preparada.caminho) {
                return supabase.storage
                  .from(BUCKET_AUDITORIA)
                  .remove([preparada.caminho]);
              }
            });
          }
          rollback(
            "Não foi possível sincronizar o erro: " +
              (error?.message ?? "sem identificador retornado")
          );
          return;
        }
        idPersistido = id;

        if (auditoriaIdRef.current === auditoriaId) {
          const atualizados = errosRef.current.map((item) =>
            item.id === idOtimista ? { ...item, id } : item
          );
          errosRef.current = atualizados;
          setErros(atualizados);
        }

        void (async () => {
          const leitura = await supabase
            .from("ocorrencias")
            .select("id, parede, setor, tipo_erro, ocorrencia, criticidade, status")
            .eq("id", id)
            .single();
          if (leitura.error || !leitura.data || auditoriaIdRef.current !== auditoriaId)
            return;
          const reconciliados = errosRef.current.map((item) =>
            item.id === id
              ? {
                  ...(leitura.data as ErroDaAuditoria),
                  anexos: item.anexos ?? [],
                  fotoStatus: item.fotoStatus,
                }
              : item
          );
          errosRef.current = reconciliados;
          setErros(reconciliados);
        })();

        if (!fotoEmSegundoPlano) return;
        const preparada = await fotoEmSegundoPlano;
        if (preparada.error) {
          marcarFoto("ERRO");
          toast.error(
            "O erro foi salvo, mas a foto não foi enviada: " +
              preparada.error.message
          );
          return;
        }

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

        marcarFoto(undefined);
        toast.success("Foto anexada ao desvio.");
      } catch (caught) {
        if (fotoEmSegundoPlano) {
          void fotoEmSegundoPlano.then((preparada) => {
            if (preparada.caminho) {
              return supabase.storage
                .from(BUCKET_AUDITORIA)
                .remove([preparada.caminho]);
            }
          });
        }
        rollback(
          "Não foi possível sincronizar o erro: " +
            (caught instanceof Error ? caught.message : "falha de conexão")
        );
      }
    })();
  }
'''
aud = aud[:add_inicio] + novo_adicionar + aud[add_fim:]

rem_inicio = aud.index('  async function removerErro(')
rem_fim = aud.index('\n  /* ---------- render ---------- */', rem_inicio)
novo_rem_reset = r'''  function removerErro(id: string) {
    if (!auditoria || removendoErrosRef.current.has(id)) return;
    removendoErrosRef.current.add(id);

    const auditoriaAtual = auditoria;
    const auditoriaId = auditoriaAtual.id;
    const supabase = createClient();
    const errosAnteriores = errosRef.current;
    const erroAlvo = errosAnteriores.find((e) => e.id === id);
    const proximosErros = errosAnteriores.filter((e) => e.id !== id);
    const anexosDoErro: AnexoStorageRow[] = (erroAlvo?.anexos ?? []).map((anexo) => ({
      storage_bucket: anexo.storage_bucket || BUCKET_AUDITORIA,
      storage_path: anexo.storage_path,
    }));

    errosRef.current = proximosErros;
    setErros(proximosErros);
    atualizarResumoLocal(auditoriaAtual, datasRef.current, proximosErros);
    toast.success("Erro removido.");

    const rollback = (mensagem: string) => {
      if (auditoriaIdRef.current === auditoriaId) {
        errosRef.current = errosAnteriores;
        setErros(errosAnteriores);
        atualizarResumoLocal(auditoriaAtual, datasRef.current, errosAnteriores);
      }
      toast.error(mensagem);
    };

    void (async () => {
      try {
        const { error } = await mutarQualidade("REMOVER_DESVIO", { id });
        if (error) {
          rollback("Não foi possível remover o erro. A alteração foi restaurada: " + error.message);
          return;
        }

        const falhasStorage = await removerArquivosDoStorage(supabase, anexosDoErro);
        if (falhasStorage.length) {
          toast.error("O erro foi removido, mas algumas fotos não puderam ser apagadas do Storage.");
        }
      } catch (caught) {
        rollback(
          "Não foi possível remover o erro. A alteração foi restaurada: " +
            (caught instanceof Error ? caught.message : "falha de conexão")
        );
      } finally {
        removendoErrosRef.current.delete(id);
      }
    })();
  }

  function zerarInspecaoParede(parede: string) {
    if (!auditoria || zerandoParedesRef.current.has(parede)) return;

    const errosDaParede = errosRef.current.filter((e) => e.parede === parede);
    const nasDaParede = nasRef.current.filter((n) => n.parede === parede);
    const tinhaData = Boolean(datasRef.current[parede]);
    if (!tinhaData && errosDaParede.length === 0 && nasDaParede.length === 0) {
      toast.info(`Parede ${parede} já está sem inspeção.`);
      return;
    }

    zerandoParedesRef.current.add(parede);
    const auditoriaAtual = auditoria;
    const auditoriaId = auditoriaAtual.id;
    const datasAnteriores = datasRef.current;
    const errosAnteriores = errosRef.current;
    const nasAnteriores = nasRef.current;

    const novasDatas = { ...datasAnteriores };
    delete novasDatas[parede];
    const novosErros = errosAnteriores.filter((e) => e.parede !== parede);
    const novosNas = nasAnteriores.filter((n) => n.parede !== parede);

    datasRef.current = novasDatas;
    errosRef.current = novosErros;
    nasRef.current = novosNas;
    setDatas(novasDatas);
    setErros(novosErros);
    setNas(novosNas);
    atualizarResumoLocal(auditoriaAtual, novasDatas, novosErros);
    toast.success(`Inspeção da parede ${parede} zerada.`);

    const rollback = (mensagem: string) => {
      if (auditoriaIdRef.current === auditoriaId) {
        datasRef.current = datasAnteriores;
        errosRef.current = errosAnteriores;
        nasRef.current = nasAnteriores;
        setDatas(datasAnteriores);
        setErros(errosAnteriores);
        setNas(nasAnteriores);
        atualizarResumoLocal(auditoriaAtual, datasAnteriores, errosAnteriores);
      }
      toast.error(mensagem);
    };

    void (async () => {
      try {
        const { data, error } = await mutarQualidade("ZERAR_INSPECAO_PAREDE", {
          auditoria_id: auditoriaId,
          parede,
        });
        if (error) {
          rollback(
            "Não foi possível zerar a inspeção. A parede foi restaurada: " +
              error.message
          );
          return;
        }

        const retorno = data as { arquivos_removidos?: unknown } | null;
        const caminhos = Array.isArray(retorno?.arquivos_removidos)
          ? retorno.arquivos_removidos.filter(
              (item): item is string => typeof item === "string" && item.length > 0
            )
          : [];

        if (caminhos.length > 0) {
          const falhasStorage = await removerArquivosDoStorage(
            createClient(),
            caminhos.map((storage_path) => ({
              storage_bucket: BUCKET_AUDITORIA,
              storage_path,
            }))
          );
          if (falhasStorage.length) {
            toast.error(
              "A inspeção foi zerada, mas alguns arquivos não puderam ser removidos do Storage."
            );
          }
        }
      } catch (caught) {
        rollback(
          "Não foi possível zerar a inspeção. A parede foi restaurada: " +
            (caught instanceof Error ? caught.message : "falha de conexão")
        );
      } finally {
        zerandoParedesRef.current.delete(parede);
      }
    })();
  }
'''
aud = aud[:rem_inicio] + novo_rem_reset + aud[rem_fim:]

aud_path.write_text(aud, encoding='utf-8')

# -------- PainelParede --------
painel = painel_path.read_text(encoding='utf-8')
painel = painel.replace(
    'import { useState } from "react";',
    'import { useRef, useState } from "react";',
    1,
)
needle = '  const [adicionandoNa, setAdicionandoNa] = useState(false);\n'
if 'resetDialogo' not in painel:
    painel = painel.replace(
        needle,
        needle + '  const resetDialogo = useRef<HTMLDialogElement>(null);\n',
        1,
    )

old_card = r'''      {!somenteLeitura && (inspecionada || erros.length > 0 || nas.length > 0) && (
        <button
          type="button"
          onClick={aoZerarInspecao}
          disabled={salvando}
          className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition"
          style={{
            borderColor: "color-mix(in srgb, var(--color-alta) 38%, var(--color-line))",
            background: "color-mix(in srgb, var(--color-alta) 5%, var(--color-papel))",
          }}
          title="Apagar a inspeção desta parede e voltar para ainda não conferida"
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[17px]"
            style={{
              color: "var(--color-alta)",
              background: "color-mix(in srgb, var(--color-alta) 10%, transparent)",
            }}
          >
            ↺
          </span>
          <span className="min-w-0">
            <b className="block text-[12.5px]" style={{ color: "var(--color-alta)" }}>
              Zerar inspeção
            </b>
            <small className="block text-[11px] leading-snug text-ink-3">
              Remove data, erros, N/A e fotos desta parede. Ela volta para “ainda não conferida”.
            </small>
          </span>
        </button>
      )}
'''
new_card = r'''      {!somenteLeitura && (inspecionada || erros.length > 0 || nas.length > 0) && (
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
'''
if old_card not in painel:
    raise SystemExit('Bloco do card Zerar inspeção não encontrado')
painel = painel.replace(old_card, new_card, 1)
painel_path.write_text(painel, encoding='utf-8')

print('Patch aplicado em AuditoriaCasa.tsx e PainelParede.tsx')
