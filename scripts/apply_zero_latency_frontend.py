from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperado 1 trecho, encontrado {count}")
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    i = text.find(start)
    if i < 0:
        raise RuntimeError(f"{label}: início não encontrado")
    j = text.find(end, i)
    if j < 0:
        raise RuntimeError(f"{label}: fim não encontrado")
    return text[:i] + replacement + text[j:]


# ---------------------------------------------------------------------------
# AuditoriaCasa: cache estático + optimistic UI + trava síncrona de submit.
# ---------------------------------------------------------------------------
path = Path("src/components/auditoria/AuditoriaCasa.tsx")
text = path.read_text()

loader = r'''async function carregarConfigEstaticaAuditoria() {
  const supabase = createClient();
  const [p, w, s, t, o, regras] = await Promise.all([
    supabase.from("projetos").select("*").eq("ativo", true).order("ordem"),
    supabase.from("paredes").select("*").eq("ativo", true).order("ordem"),
    supabase.from("setores").select("*").eq("ativo", true).order("ordem"),
    supabase.from("tipos_erro").select("*").eq("ativo", true).order("ordem"),
    supabase.from("qualidade_obras").select("id, codigo, nome").order("nome"),
    carregarRegras(),
  ]);
  const falha = p.error || w.error || s.error || t.error || o.error;
  if (falha) {
    throw new Error("Falha ao carregar as listas da auditoria: " + falha.message);
  }

  return {
    cfg: {
      projetos: p.data ?? [],
      paredes: (w.data ?? []) as Parede[],
      setores: s.data ?? [],
      tipos: t.data ?? [],
      obras: (o.data ?? []) as ObraItem[],
    } satisfies Config,
    regras,
    projetoInicial: p.data?.[0]?.nome ?? null,
  };
}

async function carregarEstadoAuditoria() {
  const supabase = createClient();
  const [auditorias, resumo] = await Promise.all([
    supabase
      .from("qualidade_auditorias")
      .select("id, projeto, casa, obra, created_at, observacao")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase.rpc("qualidade_resumo_auditorias"),
  ]);
  const falha = auditorias.error || resumo.error;
  if (falha) {
    throw new Error("Falha ao carregar o estado da auditoria: " + falha.message);
  }
  return {
    todas: (auditorias.data ?? []) as Auditoria[],
    resumo: resumo.data ?? [],
  };
}

async function carregarDadosIniciaisAuditoria(): Promise<DadosIniciaisAuditoria> {
  /* Catálogos mudam raramente e sobrevivem às mutações operacionais. O
     estado das casas continua com TTL curto e é invalidado a cada escrita. */
  const [estatico, estado] = await Promise.all([
    cachedClientRequest(
      "static:auditoria:config",
      carregarConfigEstaticaAuditoria,
      10 * 60_000
    ),
    cachedClientRequest("auditoria:estado", carregarEstadoAuditoria, 15_000),
  ]);

  const acc: Record<string, ResumoDaCasa> = {};
  const projetoDaCasa = new Map<string, string>();
  for (const linha of estado.resumo) {
    const id = String(linha.auditoria_id ?? "");
    if (!id) continue;
    projetoDaCasa.set(id, String(linha.projeto ?? ""));
    acc[id] = {
      conferidas: Number(linha.conferidas ?? 0),
      ok: Number(linha.ok ?? 0),
      erros: Number(linha.erros ?? 0),
      naoConformidades: Number(linha.nao_conformidades ?? 0),
      fpy: null,
      zeradaPelaRegra: false,
    };
  }

  for (const [id, a] of Object.entries(acc)) {
    const afetadas = a.conferidas - a.ok;
    const regra = regraDoProjeto(estatico.regras, projetoDaCasa.get(id));
    a.fpy = fpyDaCasa(a.conferidas, afetadas, regra);
    a.zeradaPelaRegra = a.ok > 0 && casaZeraOFpy(afetadas, regra);
  }

  return {
    cfg: estatico.cfg,
    todas: estado.todas,
    resumos: acc,
    regras: estatico.regras,
    projetoInicial: estatico.projetoInicial,
  };
}
'''

text = replace_between(
    text,
    "async function carregarDadosIniciaisAuditoria(): Promise<DadosIniciaisAuditoria> {",
    "\n/* A tinta de dentro do chip preenchido",
    loader,
    "loader",
)

text = replace_once(
    text,
    '''    void cachedClientRequest(
      "auditoria:base",
      carregarDadosIniciaisAuditoria
    )''',
    '''    void carregarDadosIniciaisAuditoria()''',
    "effect-cache",
)

text = replace_once(
    text,
    '''  const [salvando, setSalvando] = useState(false);
  const [salvandoObra, setSalvandoObra] = useState(false);''',
    '''  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
  const [salvandoObra, setSalvandoObra] = useState(false);''',
    "salvando-ref",
)

text = replace_once(
    text,
    '''  const paredesDoProjeto = useMemo(() => {
    if (!cfg) return [];
    const proj = cfg.projetos.find((p) => p.nome === projeto);
    if (!proj) return [];
    return cfg.paredes
      .filter((p) => p.projeto_id === proj.id)
      .map((p) => p.nome);
  }, [cfg, projeto]);
''',
    '''  const paredesDoProjeto = useMemo(() => {
    if (!cfg) return [];
    const proj = cfg.projetos.find((p) => p.nome === projeto);
    if (!proj) return [];
    return cfg.paredes
      .filter((p) => p.projeto_id === proj.id)
      .map((p) => p.nome);
  }, [cfg, projeto]);

  const atualizarResumoLocal = useCallback(
    (
      a: Auditoria,
      datasAtuais: Record<string, string>,
      errosAtuais: ErroDaAuditoria[]
    ) => {
      const local = resumoAuditoria(
        paredesDoProjeto,
        new Set(Object.keys(datasAtuais)),
        errosAtuais,
        regraDoProjeto(regras, a.projeto)
      );
      setResumos((anteriores) => ({
        ...anteriores,
        [a.id]: {
          conferidas: local.inspecionadas,
          ok: local.ok,
          erros: local.erros,
          naoConformidades: errosAtuais.filter(
            (erro) => erro.status === "NAO_CONFORMIDADE"
          ).length,
          fpy: local.fpy,
          zeradaPelaRegra: local.zeradaPelaRegra,
        },
      }));
    },
    [paredesDoProjeto, regras]
  );

  function iniciarSalvamento() {
    if (salvandoRef.current) return false;
    salvandoRef.current = true;
    setSalvando(true);
    return true;
  }

  function encerrarSalvamento() {
    salvandoRef.current = false;
    setSalvando(false);
  }
''',
    "resumo-local",
)

marcar_ok = r'''  async function marcarOk(parede: string, dia: string) {
    if (!auditoria || !iniciarSalvamento()) return;

    const datasAnteriores = datas;
    const paredeAnterior = paredeAberta;
    const novasDatas = { ...datas, [parede]: dia };
    setDatas(novasDatas);
    atualizarResumoLocal(auditoria, novasDatas, erros);

    const proxima = paredesDoProjeto.find(
      (p) =>
        p !== parede &&
        !(p in novasDatas) &&
        !erros.some((e) => e.parede === p)
    );
    setParedeAberta(proxima ?? null);

    try {
      const { error } = await mutarQualidade("MARCAR_PAREDE_OK", {
        auditoria_id: auditoria.id,
        parede,
        data: dia,
      });
      if (error && error.code !== "23505") {
        setDatas(datasAnteriores);
        setParedeAberta(paredeAnterior ?? parede);
        atualizarResumoLocal(auditoria, datasAnteriores, erros);
        toast.error("Não foi possível salvar: " + error.message);
      }
    } catch (caught) {
      setDatas(datasAnteriores);
      setParedeAberta(paredeAnterior ?? parede);
      atualizarResumoLocal(auditoria, datasAnteriores, erros);
      toast.error(
        "Não foi possível salvar: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }
'''
text = replace_between(
    text,
    "  async function marcarOk(parede: string, dia: string) {",
    "\n  /* Trocar a data de uma parede já conferida.",
    marcar_ok,
    "marcar-ok",
)

mudar_data = r'''  async function mudarDataDaParede(parede: string, dia: string) {
    if (!auditoria || !iniciarSalvamento()) return;
    const datasAnteriores = datas;
    const novasDatas = { ...datas, [parede]: dia };
    setDatas(novasDatas);

    try {
      const { error } = await mutarQualidade("ALTERAR_DATA_PAREDE", {
        auditoria_id: auditoria.id,
        parede,
        data: dia,
      });
      if (error) {
        setDatas(datasAnteriores);
        toast.error("Não foi possível mudar a data: " + error.message);
        return;
      }
      toast.success(`Parede ${parede}: data atualizada.`);
    } catch (caught) {
      setDatas(datasAnteriores);
      toast.error(
        "Não foi possível mudar a data: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }
'''
text = replace_between(
    text,
    "  async function mudarDataDaParede(parede: string, dia: string) {",
    "\n  async function salvarFotoDoDesvio(",
    mudar_data,
    "mudar-data",
)

adicionar_erro = r'''  async function adicionarErro(parede: string, novo: NovoErro, dia: string) {
    if (!auditoria || !iniciarSalvamento()) return;
    const supabase = createClient();
    const { anexo, ...dadosErro } = novo;
    const idOtimista = `optimistic-error-${crypto.randomUUID()}`;
    const datasAnteriores = datas;
    const errosAnteriores = erros;
    const novasDatas = { ...datas, [parede]: dia };
    const erroOtimista: ErroDaAuditoria = {
      id: idOtimista,
      parede,
      setor: dadosErro.setor,
      tipo_erro: dadosErro.tipo_erro,
      ocorrencia: dadosErro.ocorrencia,
      criticidade: dadosErro.criticidade,
      status: "AGUARDANDO",
      anexos: [],
    };
    const novosErros = [...erros, erroOtimista];

    setDatas(novasDatas);
    setErros(novosErros);
    atualizarResumoLocal(auditoria, novasDatas, novosErros);

    try {
      const { data: criacao, error } = await mutarQualidade("REGISTRAR_DESVIO", {
        data: dia,
        projeto: auditoria.projeto,
        casa: auditoria.casa,
        parede,
        auditoria_id: auditoria.id,
        ...dadosErro,
      });

      const id = (criacao as { id?: string } | null)?.id;
      if (error || !id) {
        setDatas(datasAnteriores);
        setErros(errosAnteriores);
        atualizarResumoLocal(auditoria, datasAnteriores, errosAnteriores);
        toast.error(
          "Não foi possível salvar o erro: " +
            (error?.message ?? "a operação não retornou um identificador")
        );
        return;
      }

      setErros((lista) =>
        lista.map((item) =>
          item.id === idOtimista ? { ...item, id } : item
        )
      );

      toast.success(
        anexo
          ? "Erro registrado. A foto está sendo enviada em segundo plano."
          : "Erro registrado. Já aparece na tela Consultar."
      );

      /* Reconciliamos só o desvio criado, sem recarregar a casa inteira. */
      void (async () => {
        const leitura = await supabase
          .from("ocorrencias")
          .select("id, parede, setor, tipo_erro, ocorrencia, criticidade, status")
          .eq("id", id)
          .single();
        if (!leitura.error && leitura.data) {
          setErros((lista) =>
            lista.map((item) =>
              item.id === id
                ? {
                    ...(leitura.data as ErroDaAuditoria),
                    anexos: item.anexos ?? [],
                  }
                : item
            )
          );
        }
      })();

      if (anexo) {
        void (async () => {
          const anexoSalvo = await salvarFotoDoDesvio(
            supabase,
            parede,
            id,
            anexo
          );
          if (anexoSalvo.error) {
            toast.error(
              "O erro foi salvo, mas a foto não pôde ser vinculada: " +
                anexoSalvo.error.message
            );
            return;
          }
          toast.success("Foto anexada ao desvio.");
        })();
      }
    } catch (caught) {
      setDatas(datasAnteriores);
      setErros(errosAnteriores);
      atualizarResumoLocal(auditoria, datasAnteriores, errosAnteriores);
      toast.error(
        "Não foi possível salvar o erro: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }
'''
text = replace_between(
    text,
    "  async function adicionarErro(parede: string, novo: NovoErro, dia: string) {",
    "\n  /* NA não confere a parede:",
    adicionar_erro,
    "adicionar-erro",
)

adicionar_na = r'''  async function adicionarNa(parede: string, novo: NovoNa) {
    if (!auditoria || !iniciarSalvamento()) return;
    const supabase = createClient();
    const itens = novo.tipos_erro.map((tipo_erro) => ({
      tipo_erro,
      observacao: novo.observacao || null,
    }));
    const idsOtimistas = itens.map(
      () => `optimistic-na-${crypto.randomUUID()}`
    );
    const nasAnteriores = nas;
    const nasOtimistas: NaDaAuditoria[] = itens.map((item, indice) => ({
      id: idsOtimistas[indice],
      parede,
      tipo_erro: item.tipo_erro,
      observacao: item.observacao,
    }));
    setNas([...nas, ...nasOtimistas]);

    try {
      const { data, error } = await mutarQualidade("ADICIONAR_NAS", {
        auditoria_id: auditoria.id,
        parede,
        itens,
      });
      if (error) {
        setNas(nasAnteriores);
        toast.error("Não foi possível salvar os NAs: " + error.message);
        return;
      }

      const adicionados = Number(
        (data as { adicionados?: number } | null)?.adicionados ?? itens.length
      );
      toast.success(
        `${adicionados} ${adicionados === 1 ? "NA registrado" : "NAs registrados"}. Eles não contam como erro.`
      );

      /* Busca somente a parede alterada para trocar IDs temporários pelos
         IDs reais usados pelo botão Remover. */
      void (async () => {
        const leitura = await supabase
          .from("qualidade_auditoria_nas")
          .select("id, parede, tipo_erro, observacao")
          .eq("auditoria_id", auditoria.id)
          .eq("parede", parede)
          .order("id");
        if (leitura.error) return;
        setNas((lista) => [
          ...lista.filter((item) => item.parede !== parede),
          ...((leitura.data ?? []) as NaDaAuditoria[]),
        ]);
      })();
    } catch (caught) {
      setNas(nasAnteriores);
      toast.error(
        "Não foi possível salvar os NAs: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }
'''
text = replace_between(
    text,
    "  async function adicionarNa(parede: string, novo: NovoNa) {",
    "\n  async function removerNa(id: string) {",
    adicionar_na,
    "adicionar-na",
)

remover_na = r'''  async function removerNa(id: string) {
    if (!iniciarSalvamento()) return;
    const nasAnteriores = nas;
    setNas((lista) => lista.filter((n) => n.id !== id));
    try {
      const { error } = await mutarQualidade("REMOVER_NA", { id });
      if (error) {
        setNas(nasAnteriores);
        toast.error("Não foi possível remover o NA: " + error.message);
        return;
      }
      toast.success("NA removido.");
    } catch (caught) {
      setNas(nasAnteriores);
      toast.error(
        "Não foi possível remover o NA: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }
'''
text = replace_between(
    text,
    "  async function removerNa(id: string) {",
    "\n  /* Exclusão da casa inteira.",
    remover_na,
    "remover-na",
)

remover_erro = r'''  async function removerErro(id: string) {
    if (!auditoria || !iniciarSalvamento()) return;
    const supabase = createClient();
    const errosAnteriores = erros;
    const proximosErros = erros.filter((e) => e.id !== id);
    setErros(proximosErros);
    atualizarResumoLocal(auditoria, datas, proximosErros);

    try {
      const anexosConsulta = await supabase
        .from("produto_anexos")
        .select("storage_bucket, storage_path")
        .eq("desvio_id", id)
        .not("storage_path", "is", null);

      if (anexosConsulta.error) {
        setErros(errosAnteriores);
        atualizarResumoLocal(auditoria, datas, errosAnteriores);
        toast.error(
          "Não foi possível preparar a remoção das fotos: " +
            anexosConsulta.error.message
        );
        return;
      }

      const { error } = await mutarQualidade("REMOVER_DESVIO", { id });
      if (error) {
        setErros(errosAnteriores);
        atualizarResumoLocal(auditoria, datas, errosAnteriores);
        toast.error(
          "Não foi possível remover: " +
            error.message +
            " (apenas a gestão pode excluir registros)"
        );
        return;
      }

      void removerArquivosDoStorage(
        supabase,
        (anexosConsulta.data ?? []) as AnexoStorageRow[]
      ).then((falhasStorage) => {
        toast.success(
          falhasStorage.length
            ? "Erro removido. Algumas fotos não puderam ser removidas do Storage."
            : "Erro removido."
        );
      });
    } catch (caught) {
      setErros(errosAnteriores);
      atualizarResumoLocal(auditoria, datas, errosAnteriores);
      toast.error(
        "Não foi possível remover: " +
          (caught instanceof Error ? caught.message : "falha de conexão")
      );
    } finally {
      encerrarSalvamento();
    }
  }
'''
text = replace_between(
    text,
    "  async function removerErro(id: string) {",
    "\n  /* ---------- render ---------- */",
    remover_erro,
    "remover-erro",
)

path.write_text(text)


# ---------------------------------------------------------------------------
# PainelParede: fecha o formulário imediatamente após disparar a ação.
# ---------------------------------------------------------------------------
path = Path("src/components/auditoria/PainelParede.tsx")
text = path.read_text()
text = replace_once(
    text,
    '''          aoAdicionar={async (e) => {
            await aoAdicionarErro(e, dia);
            setAdicionando(false);
          }}''',
    '''          aoAdicionar={async (e) => {
            const envio = aoAdicionarErro(e, dia);
            setAdicionando(false);
            await envio;
          }}''',
    "painel-erro",
)
text = replace_once(
    text,
    '''          aoAdicionar={async (n) => {
            await aoAdicionarNa(n);
            setAdicionandoNa(false);
          }}''',
    '''          aoAdicionar={async (n) => {
            const envio = aoAdicionarNa(n);
            setAdicionandoNa(false);
            await envio;
          }}''',
    "painel-na",
)
path.write_text(text)


# ---------------------------------------------------------------------------
# ListaAuditorias: remove a segunda carga massiva de FPY/ocorrências.
# O pai já entrega resumo agregado e o atualiza otimisticamente.
# ---------------------------------------------------------------------------
path = Path("src/components/auditoria/ListaAuditorias.tsx")
text = path.read_text()
text = replace_once(
    text,
    'import { useEffect, useMemo, useState } from "react";',
    'import { useMemo, useState } from "react";',
    "lista-react-import",
)
text = replace_once(
    text,
    'import { createClient } from "@/lib/supabase/client";\n',
    '',
    "lista-supabase-import",
)
text = replace_once(
    text,
    '''import {
  carregarRegras,
  casaZeraOFpy,
  fpyDaCasa,
  regraDoProjeto,
} from "@/lib/regras";
''',
    '',
    "lista-regras-import",
)
text = replace_once(
    text,
    '''function chaveDaAuditoria(projeto: string, casa: string) {
  return `${projeto.trim().toLocaleLowerCase("pt-BR")}|${casa.trim()}`;
}

''',
    '',
    "lista-chave",
)

start = '''  const [resumosAtuais, setResumosAtuais] = useState<
    Record<string, ResumoDaCasa>
  >({});

  useEffect(() => {'''
end = '''  }, [auditorias, projeto]);

'''
i = text.find(start)
if i < 0:
    raise RuntimeError("lista-resumos: início não encontrado")
j = text.find(end, i)
if j < 0:
    raise RuntimeError("lista-resumos: fim não encontrado")
text = text[:i] + text[j + len(end):]
text = replace_once(
    text,
    '                const r = resumosAtuais[a.id] ?? resumos[a.id];',
    '                const r = resumos[a.id];',
    "lista-render",
)
path.write_text(text)

print("Patch zero-latency aplicado com sucesso.")
