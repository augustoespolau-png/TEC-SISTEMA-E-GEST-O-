from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"Trecho não encontrado: {label}")
    p.write_text(s.replace(old, new, 1))


# 1) REMOVER_DESVIO e ZERAR_INSPECAO_PAREDE passam pelo fast-path.
replace_once(
    "src/lib/qualidadeCompat.ts",
    '  "ATUALIZAR_DESVIO",\n]);',
    '  "ATUALIZAR_DESVIO",\n  "REMOVER_DESVIO",\n  "ZERAR_INSPECAO_PAREDE",\n]);',
    "fast-path das operações destrutivas da parede",
)

# 2) Remoção do erro sem consulta prévia e novo reset otimista da parede.
p = Path("src/components/auditoria/AuditoriaCasa.tsx")
s = p.read_text()
pattern = re.compile(
    r"  async function removerErro\(id: string\) \{.*?\n  \}\n\n  /\* ---------- render ---------- \*/",
    re.S,
)
replacement = r'''  async function removerErro(id: string) {
    if (!auditoria || !iniciarSalvamento()) return;
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
    atualizarResumoLocal(auditoria, datasRef.current, proximosErros);

    try {
      const { error } = await mutarQualidade("REMOVER_DESVIO", { id });
      if (error) {
        errosRef.current = errosAnteriores;
        setErros(errosAnteriores);
        atualizarResumoLocal(auditoria, datasRef.current, errosAnteriores);
        toast.error("Não foi possível remover: " + error.message);
        return;
      }

      void removerArquivosDoStorage(supabase, anexosDoErro).then((falhasStorage) => {
        toast.success(
          falhasStorage.length
            ? "Erro removido. Algumas fotos não puderam ser removidas do Storage."
            : "Erro removido."
        );
      });
    } catch (caught) {
      errosRef.current = errosAnteriores;
      setErros(errosAnteriores);
      atualizarResumoLocal(auditoria, datasRef.current, errosAnteriores);
      toast.error(
        "Não foi possível remover: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }

  async function zerarInspecaoParede(parede: string) {
    if (!auditoria) return;

    const errosDaParede = errosRef.current.filter((e) => e.parede === parede);
    const nasDaParede = nasRef.current.filter((n) => n.parede === parede);
    const tinhaData = Boolean(datasRef.current[parede]);
    if (!tinhaData && errosDaParede.length === 0 && nasDaParede.length === 0) {
      toast.info(`Parede ${parede} já está sem inspeção.`);
      return;
    }

    const detalhe = [
      tinhaData ? "a data da inspeção" : null,
      errosDaParede.length ? `${errosDaParede.length} ${errosDaParede.length === 1 ? "erro" : "erros"}` : null,
      nasDaParede.length ? `${nasDaParede.length} ${nasDaParede.length === 1 ? "NA" : "NAs"}` : null,
      errosDaParede.some((e) => (e.anexos?.length ?? 0) > 0) ? "as fotos vinculadas" : null,
    ].filter(Boolean).join(", ");

    const confirmou = window.confirm(
      `Zerar a inspeção da parede ${parede}?\n\nIsso remove ${detalhe || "todos os registros"} e a parede volta para “ainda não conferida”.`
    );
    if (!confirmou || !iniciarSalvamento()) return;

    const auditoriaAtual = auditoria;
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

    const rollback = (mensagem: string) => {
      datasRef.current = datasAnteriores;
      errosRef.current = errosAnteriores;
      nasRef.current = nasAnteriores;
      setDatas(datasAnteriores);
      setErros(errosAnteriores);
      setNas(nasAnteriores);
      atualizarResumoLocal(auditoriaAtual, datasAnteriores, errosAnteriores);
      toast.error(mensagem);
    };

    try {
      const { data, error } = await mutarQualidade("ZERAR_INSPECAO_PAREDE", {
        auditoria_id: auditoriaAtual.id,
        parede,
      });
      if (error) {
        rollback("Não foi possível zerar a inspeção: " + error.message);
        return;
      }

      const retorno = data as { arquivos_removidos?: unknown } | null;
      const caminhos = Array.isArray(retorno?.arquivos_removidos)
        ? retorno.arquivos_removidos.filter((item): item is string => typeof item === "string" && item.length > 0)
        : [];

      toast.success(`Parede ${parede} zerada. Ela voltou para “ainda não conferida”.`);
      if (caminhos.length > 0) {
        void removerArquivosDoStorage(
          createClient(),
          caminhos.map((storage_path) => ({
            storage_bucket: BUCKET_AUDITORIA,
            storage_path,
          }))
        ).then((falhasStorage) => {
          if (falhasStorage.length) {
            toast.error("A inspeção foi zerada, mas alguns arquivos não puderam ser removidos do Storage.");
          }
        });
      }
    } catch (caught) {
      rollback(
        "Não foi possível zerar a inspeção: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }

  /* ---------- render ---------- */'''
ns, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit("Não foi possível substituir removerErro/reset")
p.write_text(ns)

# 3) Passa a ação de reset para o painel da parede.
replace_once(
    "src/components/auditoria/AuditoriaCasa.tsx",
    '                aoMudarData={(dia) => mudarDataDaParede(paredeAberta, dia)}\n',
    '                aoMudarData={(dia) => mudarDataDaParede(paredeAberta, dia)}\n                aoZerarInspecao={() => zerarInspecaoParede(paredeAberta)}\n',
    "prop aoZerarInspecao",
)

# 4) Painel: recebe a ação e mostra um card pequeno de reset.
replace_once(
    "src/components/auditoria/PainelParede.tsx",
    '  aoMudarData,\n  projetoAnexo,',
    '  aoMudarData,\n  aoZerarInspecao,\n  projetoAnexo,',
    "desestruturação aoZerarInspecao",
)
replace_once(
    "src/components/auditoria/PainelParede.tsx",
    '  aoMudarData: (dia: string) => void;\n  /** desenho técnico',
    '  aoMudarData: (dia: string) => void;\n  /** volta a parede ao estado ainda não conferida e remove os registros da inspeção */\n  aoZerarInspecao: () => void;\n  /** desenho técnico',
    "tipo aoZerarInspecao",
)
replace_once(
    "src/components/auditoria/PainelParede.tsx",
    '''      {semErros && !inspecionada && !somenteLeitura && (\n        <p className="sub">\n          Marque “Parede sem erros” para registrar que ela foi conferida — é\n          isso que faz a parede contar no FPY.\n        </p>\n      )}\n''',
    '''      {!somenteLeitura && (inspecionada || erros.length > 0 || nas.length > 0) && (\n        <button\n          type="button"\n          onClick={aoZerarInspecao}\n          disabled={salvando}\n          className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition"\n          style={{\n            borderColor: "color-mix(in srgb, var(--color-alta) 38%, var(--color-line))",\n            background: "color-mix(in srgb, var(--color-alta) 5%, var(--color-papel))",\n          }}\n          title="Apagar a inspeção desta parede e voltar para ainda não conferida"\n        >\n          <span\n            aria-hidden="true"\n            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[17px]"\n            style={{\n              color: "var(--color-alta)",\n              background: "color-mix(in srgb, var(--color-alta) 10%, transparent)",\n            }}\n          >\n            ↺\n          </span>\n          <span className="min-w-0">\n            <b className="block text-[12.5px]" style={{ color: "var(--color-alta)" }}>\n              Zerar inspeção\n            </b>\n            <small className="block text-[11px] leading-snug text-ink-3">\n              Remove data, erros, N/A e fotos desta parede. Ela volta para “ainda não conferida”.\n            </small>\n          </span>\n        </button>\n      )}\n\n      {semErros && !inspecionada && !somenteLeitura && (\n        <p className="sub">\n          Marque “Parede sem erros” para registrar que ela foi conferida — é\n          isso que faz a parede contar no FPY.\n        </p>\n      )}\n''',
    "card Zerar inspeção",
)

print("Patch de reset/remocao aplicado.")
