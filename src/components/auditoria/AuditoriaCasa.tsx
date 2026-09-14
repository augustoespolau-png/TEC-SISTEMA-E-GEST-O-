"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  assinarAnexosEmLote,
  BUCKET_AUDITORIA,
  enviarFotoAuditoria,
} from "@/lib/anexos";
import { cachedClientRequest } from "@/lib/clientCache";
import { carregarAnexosProjetoParede } from "@/lib/anexosProjetoParede";
import { mutarQualidade } from "@/lib/qualidadeCompat";
import PainelParede from "./PainelParede";
import ListaAuditorias, { type ResumoDaCasa } from "./ListaAuditorias";
import ResumoDeNas from "./ResumoDeNas";
import type { NovoErro } from "./FormularioErro";
import type { NovoNa } from "./FormularioNa";
import {
  resumoAuditoria,
  situacaoDaParede,
  type AnexoDaAuditoria,
  type Auditoria,
  type ErroDaAuditoria,
  type NaDaAuditoria,
  type SituacaoParede,
} from "@/lib/auditoria";
import type {
  AnexoProjetoParede,
  ConfigItem,
  Parede,
  Role,
} from "@/lib/types";
import {
  carregarRegras,
  casaZeraOFpy,
  fpyDaCasa,
  regraDoProjeto,
  REGRAS_PADRAO,
  type Regras,
} from "@/lib/regras";

interface Config {
  projetos: ConfigItem[];
  paredes: Parede[];
  setores: ConfigItem[];
  tipos: ConfigItem[];
}

interface AnexoRow {
  id: string;
  desvio_id: string | null;
  nome_arquivo: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  storage_bucket: string;
  storage_path: string | null;
}

interface AnexoStorageRow {
  storage_bucket: string;
  storage_path: string | null;
}

async function removerArquivosDoStorage(
  supabase: ReturnType<typeof createClient>,
  anexos: AnexoStorageRow[]
) {
  const porBucket = new Map<string, string[]>();
  for (const anexo of anexos) {
    if (!anexo.storage_path) continue;
    const bucket = anexo.storage_bucket || BUCKET_AUDITORIA;
    const caminhos = porBucket.get(bucket) ?? [];
    caminhos.push(anexo.storage_path);
    porBucket.set(bucket, caminhos);
  }

  const resultados = await Promise.all(
    [...porBucket].map(async ([bucket, caminhos]) => {
      const { error } = await supabase.storage.from(bucket).remove(caminhos);
      return error;
    })
  );
  return resultados.filter((error) => Boolean(error));
}

function hojeISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function chaveDaAuditoria(projeto: string, casa: string) {
  return `${projeto.trim().toLocaleLowerCase("pt-BR")}|${casa.trim()}`;
}

interface DadosIniciaisAuditoria {
  cfg: Config;
  todas: Auditoria[];
  resumos: Record<string, ResumoDaCasa>;
  regras: Regras;
  projetoInicial: string | null;
}

async function carregarDadosIniciaisAuditoria(): Promise<DadosIniciaisAuditoria> {
  const supabase = createClient();
  const [p, w, s, t, r] = await Promise.all([
    supabase.from("projetos").select("*").eq("ativo", true).order("ordem"),
    supabase.from("paredes").select("*").eq("ativo", true).order("ordem"),
    supabase.from("setores").select("*").eq("ativo", true).order("ordem"),
    supabase.from("tipos_erro").select("*").eq("ativo", true).order("ordem"),
    // The production database keeps the original quality data in the
    // produto_* tables. This compatibility view groups its wall rows
    // into the same house-level records used by this screen.
    supabase
      .from("qualidade_auditorias")
      .select("id, projeto, casa, created_at, observacao")
      .order("created_at", { ascending: false })
      .limit(5000),
  ]);
  const falha = p.error || w.error || s.error || t.error || r.error;
  if (falha) {
    throw new Error("Falha ao carregar os dados da auditoria: " + falha.message);
  }

  const auditoriasCarregadas = (r.data ?? []) as Auditoria[];
  const auditoriaPorChave = new Map(
    auditoriasCarregadas.map((a) => [chaveDaAuditoria(a.projeto, a.casa), a.id])
  );

  // resumo de cada casa (FPY, erros, NC) para a lista de auditorias
  const [fp, oc] = await Promise.all([
    supabase
      .from("fpy_paredes")
      .select("projeto, casa, erros, passou_de_primeira")
      .limit(50000),
    supabase
      .from("ocorrencias")
      .select("auditoria_id, status")
      .not("auditoria_id", "is", null)
      .limit(50000),
  ]);
  const falhaResumo = fp.error || oc.error;
  if (falhaResumo) {
    throw new Error(
      "Falha ao calcular o resumo das casas: " + falhaResumo.message
    );
  }
  const regras = await carregarRegras();

  const acc: Record<string, ResumoDaCasa> = {};
  // a regra do zeramento é por projeto, então a lista precisa saber
  // de que projeto é cada casa (migration 022)
  const projetoDaCasa = new Map<string, string>();
  for (const l of fp.data ?? []) {
    const id = auditoriaPorChave.get(
      chaveDaAuditoria(String(l.projeto ?? ""), String(l.casa ?? ""))
    );
    if (!id) continue;
    projetoDaCasa.set(id, String(l.projeto ?? ""));
    const a = (acc[id] ??= {
      conferidas: 0,
      ok: 0,
      erros: 0,
      naoConformidades: 0,
      fpy: null,
      zeradaPelaRegra: false,
    });
    a.conferidas++;
    if (l.passou_de_primeira) a.ok++;
    a.erros += l.erros as number;
  }
  for (const o of oc.data ?? []) {
    const a = acc[String(o.auditoria_id)];
    if (a && o.status === "NAO_CONFORMIDADE") a.naoConformidades++;
  }
  /* Mesma função do painel. Antes esta lista calculava o FPY por
     conta própria e ignorava a regra da casa — a casa 142 aparecia
     zerada no painel e com 50% aqui, ao mesmo tempo. */
  for (const [id, a] of Object.entries(acc)) {
    const afetadas = a.conferidas - a.ok;
    const regra = regraDoProjeto(regras, projetoDaCasa.get(id));
    a.fpy = fpyDaCasa(a.conferidas, afetadas, regra);
    a.zeradaPelaRegra = a.ok > 0 && casaZeraOFpy(afetadas, regra);
  }

  return {
    cfg: {
      projetos: p.data ?? [],
      paredes: (w.data ?? []) as Parede[],
      setores: s.data ?? [],
      tipos: t.data ?? [],
    },
    todas: auditoriasCarregadas,
    resumos: acc,
    regras,
    projetoInicial: p.data?.[0]?.nome ?? null,
  };
}

/* A tinta de dentro do chip preenchido é decisão do tema (classes
   .preenche-*), não deste componente: o vermelho pede branco e o verde
   pede tinta escura no modo escuro. */
const CLASSE_SITUACAO: Record<SituacaoParede, string> = {
  NAO_INSPECIONADA: "",
  OK: "preenche-baixa",
  COM_ERROS: "preenche-alta",
};

export default function AuditoriaCasa({ role }: { role: Role }) {
  /* O consultor VÊ a auditoria e não mexe em nada. A tela esconde as
     ações porque botão que responde com erro é pior do que botão que
     não existe; a recusa de verdade vem da RLS (migration 026). */
  const somenteLeitura = role === "consultor";
  const [cfg, setCfg] = useState<Config | null>(null);
  const [erroCarga, setErroCarga] = useState("");

  const [projeto, setProjeto] = useState("");
  const [casa, setCasa] = useState("");

  const [auditoria, setAuditoria] = useState<Auditoria | null>(null);
  /* parede -> dia em que ela foi conferida. Era um Set só com os nomes;
     agora cada parede carrega a própria data (migration 020). */
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<ErroDaAuditoria[]>([]);
  const [nas, setNas] = useState<NaDaAuditoria[]>([]);
  /* O NA só existe depois da migration 023. Enquanto a tabela não estiver
     no banco, a tela esconde a função inteira em vez de oferecer um botão
     que responde com erro. Assim código e banco podem subir em momentos
     diferentes sem quebrar a auditoria. */
  const [temNa, setTemNa] = useState(true);
  const [paredeAberta, setParedeAberta] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmaExclusao, setConfirmaExclusao] = useState("");
  const dialogo = useRef<HTMLDialogElement>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [todas, setTodas] = useState<Auditoria[]>([]);
  const [resumos, setResumos] = useState<Record<string, ResumoDaCasa>>({});
  const [anexosProjetoParede, setAnexosProjetoParede] = useState<
    Record<string, AnexoProjetoParede>
  >({});
  // regras da qualidade vindas de Configurações; o FPY desta tela obedece
  // exatamente as mesmas do painel
  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);

  /* ---------- listas de configuração ---------- */
  useEffect(() => {
    let ativo = true;
    void cachedClientRequest(
      "auditoria:base",
      carregarDadosIniciaisAuditoria
    )
      .then(({ cfg, todas, resumos, regras, projetoInicial }) => {
        if (!ativo) return;
        setErroCarga("");
        setCfg(cfg);
        setTodas(todas);
        setResumos(resumos);
        setRegras(regras);
        if (projetoInicial) setProjeto(projetoInicial);
      })
      .catch((caught) => {
        if (!ativo) return;
        setErroCarga(
          caught instanceof Error
            ? caught.message
            : "Falha ao carregar os dados da auditoria."
        );
      });

    return () => {
      ativo = false;
    };
  }, []);

  const paredesDoProjeto = useMemo(() => {
    if (!cfg) return [];
    const proj = cfg.projetos.find((p) => p.nome === projeto);
    if (!proj) return [];
    return cfg.paredes
      .filter((p) => p.projeto_id === proj.id)
      .map((p) => p.nome);
  }, [cfg, projeto]);

  /* Os desenhos pertencem à posição da parede, não à casa auditada. Eles
     são lidos uma vez para as paredes visíveis e assinados só na sessão. */
  useEffect(() => {
    if (!cfg) return;
    let ativo = true;
    const ids = cfg.paredes
      .map((parede) => parede.origem_id)
      .filter((id): id is string => Boolean(id));

    // eslint-disable-next-line react-hooks/set-state-in-effect -- troca o mapa ao trocar a configuração carregada
    setAnexosProjetoParede({});
    if (ids.length === 0) return () => { ativo = false; };

    carregarAnexosProjetoParede(ids).then(({ data, error }) => {
      if (!ativo) return;
      if (error) {
        toast.error("Não foi possível carregar os projetos das paredes: " + error.message);
        return;
      }
      setAnexosProjetoParede(data);
    });

    return () => {
      ativo = false;
    };
  }, [cfg]);

  const anexoDaParedeAberta = useMemo(() => {
    if (!cfg || !paredeAberta) return null;
    const projetoAtual = cfg.projetos.find(
      (item) => item.nome === (auditoria?.projeto ?? projeto)
    );
    const paredeAtual = cfg.paredes.find(
      (item) =>
        item.projeto_id === projetoAtual?.id && item.nome === paredeAberta
    );
    return paredeAtual?.origem_id
      ? anexosProjetoParede[String(paredeAtual.origem_id)] ?? null
      : null;
  }, [anexosProjetoParede, auditoria?.projeto, cfg, paredeAberta, projeto]);

  /* ---------- abrir ou retomar a auditoria da casa ---------- */
  const carregarConteudo = useCallback(async (a: Auditoria) => {
    const supabase = createClient();
    const [ps, os, ns] = await Promise.all([
      supabase
          .from("qualidade_auditoria_paredes")
        .select("parede, data")
        .eq("auditoria_id", a.id),
      supabase
        .from("ocorrencias")
        .select("id, parede, setor, tipo_erro, ocorrencia, criticidade, status")
        .eq("auditoria_id", a.id)
        .order("id"),
      supabase
        .from("qualidade_auditoria_nas")
        .select("id, parede, tipo_erro, observacao")
        .eq("auditoria_id", a.id)
        .order("id"),
    ]);
    const errosCarregados = (os.data ?? []) as Array<{ id: string }>;
    const anexosPorDesvio = new Map<string, AnexoDaAuditoria[]>();

    /* O bucket é privado. A tabela relacional guarda somente os metadados e o
       caminho do objeto; a URL assinada é criada só para esta sessão e nunca
       é persistida no banco. */
    if (errosCarregados.length > 0) {
      const anexosConsulta = await supabase
        .from("produto_anexos")
        .select(
          "id, desvio_id, nome_arquivo, mime_type, tamanho_bytes, storage_bucket, storage_path"
        )
        .in(
          "desvio_id",
          errosCarregados.map((e) => e.id)
        )
        .eq("tipo", "desvio")
        .limit(1000);

      if (!anexosConsulta.error) {
        const linhas = (anexosConsulta.data ?? []) as AnexoRow[];
        const urls = await assinarAnexosEmLote(
          supabase,
          linhas.flatMap((row) =>
            row.storage_path
              ? [
                  {
                    bucket: row.storage_bucket || BUCKET_AUDITORIA,
                    path: row.storage_path,
                  },
                ]
              : []
          )
        );

        for (const row of linhas) {
          if (!row.desvio_id) continue;
          const bucket = row.storage_bucket || BUCKET_AUDITORIA;
          const lista = anexosPorDesvio.get(row.desvio_id) ?? [];
          lista.push({
            id: String(row.id),
            nome_arquivo: row.nome_arquivo,
            mime_type: row.mime_type,
            tamanho_bytes: row.tamanho_bytes,
            storage_bucket: bucket,
            storage_path: row.storage_path,
            url: row.storage_path
              ? urls.get(bucket)?.get(row.storage_path) ?? null
              : null,
          });
          anexosPorDesvio.set(row.desvio_id, lista);
        }
      }
    }

    setDatas(
      Object.fromEntries(
        (ps.data ?? []).map((x) => [x.parede as string, x.data as string])
      )
    );
    setErros(
      (os.data ?? []).map((erro) => ({
        ...(erro as ErroDaAuditoria),
        anexos: anexosPorDesvio.get(String((erro as { id: string }).id)) ?? [],
      }))
    );
    /* Qualquer falha ao ler os NAs esconde a função — não só o código de
       tabela inexistente. Eu tinha testado por 42P01, que é o erro do
       Postgres; o PostgREST responde antes disso, com PGRST205 ("could
       not find the table in the schema cache"), então o botão aparecia
       e só falhava na hora de salvar. Falha ao ler = função indisponível,
       seja qual for o motivo. */
    setTemNa(!ns.error);
    setNas((ns.data ?? []) as NaDaAuditoria[]);
  }, []);

  async function abrirCasa() {
    const numero = casa.trim();
    if (!numero || !projeto || abrindo) return;
    setAbrindo(true);
    const supabase = createClient();

    const { data: existente } = await supabase
      .from("qualidade_auditorias")
      .select("*")
      .eq("projeto", projeto)
      .eq("casa", numero)
      .maybeSingle();

    let a = existente as Auditoria | null;
    if (!a) {
      const { data: criacao, error } = await mutarQualidade(
        "ABRIR_AUDITORIA",
        { projeto, casa: numero }
      );
      if (error) {
        setAbrindo(false);
        toast.error("Não foi possível abrir a auditoria: " + error.message);
        return;
      }
      const id = (criacao as { id?: string } | null)?.id;
      const leitura = await supabase
        .from("qualidade_auditorias")
        .select("*")
        .eq("id", id ?? `${projeto}|${numero}`)
        .single();
      if (leitura.error || !leitura.data) {
        setAbrindo(false);
        toast.error(
          "A auditoria foi criada, mas não pôde ser carregada: " +
            (leitura.error?.message ?? "registro não encontrado")
        );
        return;
      }
      a = leitura.data as Auditoria;
      setTodas((lista) => [a as Auditoria, ...lista]);
      toast.success(`Auditoria da casa ${numero} aberta.`);
    } else {
      toast.success(`Auditoria da casa ${numero} retomada.`);
    }
    setAuditoria(a);
    await carregarConteudo(a);
    setParedeAberta(null);
    setAbrindo(false);
  }

  function fechar() {
    setAuditoria(null);
    setDatas({});
    setErros([]);
    setNas([]);
    setParedeAberta(null);
    setConfirmaExclusao("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- ações por parede ---------- */
  async function marcarOk(parede: string, dia: string) {
    if (!auditoria || salvando) return;
    setSalvando(true);
    const { error } = await mutarQualidade("MARCAR_PAREDE_OK", {
      auditoria_id: auditoria.id,
      parede,
      data: dia,
    });
    setSalvando(false);
    if (error && error.code !== "23505") {
      toast.error("Não foi possível salvar: " + error.message);
      return;
    }
    setDatas((d) => ({ ...d, [parede]: dia }));
    // avança sozinho para a próxima parede não conferida
    const proxima = paredesDoProjeto.find(
      (p) =>
        p !== parede &&
        !(p in datas) &&
        !erros.some((e) => e.parede === p)
    );
    setParedeAberta(proxima ?? null);
  }

  /* Trocar a data de uma parede já conferida. O erro registrado nela
     acompanha: para a fábrica, os dois são o mesmo acontecimento. */
  async function mudarDataDaParede(parede: string, dia: string) {
    if (!auditoria || salvando) return;
    setSalvando(true);
    const { error } = await mutarQualidade("ALTERAR_DATA_PAREDE", {
      auditoria_id: auditoria.id,
      parede,
      data: dia,
    });
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível mudar a data: " + error.message);
      return;
    }
    setDatas((d) => ({ ...d, [parede]: dia }));
    toast.success(`Parede ${parede}: data atualizada.`);
  }

  async function salvarFotoDoDesvio(
    supabase: ReturnType<typeof createClient>,
    parede: string,
    desvioId: string,
    arquivo: File
  ) {
    if (!auditoria) return { error: new Error("Auditoria inválida") };

    const anexoUid = crypto.randomUUID();
    const anexoId = `attachment_${anexoUid}`;
    const { data: usuario } = await supabase.auth.getUser();
    if (!usuario.user) {
      return {
        error: new Error("Sua sessão expirou. Entre novamente para anexar a foto."),
      };
    }

    const projetoId =
      cfg?.projetos.find((item) => item.nome === auditoria.projeto)?.id?.toString() ??
      (auditoria.id.split("|", 1)[0] || auditoria.projeto);
    const paredeId =
      cfg?.paredes.find((item) => item.nome === parede)?.id?.toString() ?? parede;
    let caminho: string;
    try {
      caminho = await enviarFotoAuditoria(supabase, {
        usuarioId: usuario.user.id,
        projetoId,
        casaId: auditoria.casa,
        paredeId,
        anexoId: anexoUid,
        extensao: "jpg",
        arquivo,
      });
    } catch (caught) {
      return {
        error:
          caught instanceof Error
            ? caught
            : new Error("Não foi possível enviar a foto."),
      };
    }

    const { error } = await mutarQualidade("ADICIONAR_ANEXO", {
      auditoria_id: auditoria.id,
      parede,
      deviation_id: desvioId,
      anexo: {
        id: anexoId,
        name: arquivo.name,
        type: "image/jpeg",
        size: arquivo.size,
        path: caminho,
        deviationId: desvioId,
        wallId: paredeId,
      },
    });

    if (error) {
      await supabase.storage.from(BUCKET_AUDITORIA).remove([caminho]);
      return { error };
    }
    return { error: null };
  }

  async function adicionarErro(parede: string, novo: NovoErro, dia: string) {
    if (!auditoria || salvando) return;
    setSalvando(true);
    const supabase = createClient();
    const { anexo, ...dadosErro } = novo;

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
        setSalvando(false);
        toast.error(
          "Não foi possível salvar o erro: " +
            (error?.message ?? "a operação não retornou um identificador")
        );
        return;
      }

      if (anexo) {
        const anexoSalvo = await salvarFotoDoDesvio(supabase, parede, id, anexo);
        if (anexoSalvo.error) {
          await carregarConteudo(auditoria);
          setDatas((d) => ({ ...d, [parede]: dia }));
          setSalvando(false);
          toast.error(
            "O erro foi salvo, mas a foto não pôde ser vinculada: " +
              anexoSalvo.error.message
          );
          return;
        }
      }

      const leitura = await supabase
        .from("ocorrencias")
        .select("id, parede, setor, tipo_erro, ocorrencia, criticidade, status")
        .eq("id", id)
        .single();

      if (leitura.error || !leitura.data) {
        await carregarConteudo(auditoria);
        setDatas((d) => ({ ...d, [parede]: dia }));
        setSalvando(false);
        toast.error(
          "O erro foi salvo, mas não pôde ser recarregado: " +
            (leitura.error?.message ?? "registro não encontrado")
        );
        return;
      }

      await carregarConteudo(auditoria);
      setDatas((d) => ({ ...d, [parede]: dia }));
      setSalvando(false);
      toast.success(
        anexo
          ? "Erro e foto registrados. Já aparecem na tela Consultar."
          : "Erro registrado. Já aparece na tela Consultar."
      );
    } catch (caught) {
      setSalvando(false);
      toast.error(
        "Não foi possível salvar o erro: " +
          (caught instanceof Error ? caught.message : "erro inesperado")
      );
    }
  }

  /* NA não confere a parede: quem confere é "Parede sem erros" ou o
     registro de um erro. Um item que não se aplica pode ser anotado no
     meio da conferência, e marcar a parede como conferida aqui poria no
     denominador do FPY uma parede que talvez nem tenha sido olhada
     inteira. */
  async function adicionarNa(parede: string, novo: NovoNa) {
    if (!auditoria || salvando) return;
    setSalvando(true);
    const itens = novo.tipos_erro.map((tipo_erro) => ({
      tipo_erro,
      observacao: novo.observacao || null,
    }));

    try {
      const { data, error } = await mutarQualidade("ADICIONAR_NAS", {
        auditoria_id: auditoria.id,
        parede,
        itens,
      });
      if (error) {
        setSalvando(false);
        toast.error("Não foi possível salvar os NAs: " + error.message);
        return;
      }

      await carregarConteudo(auditoria);
      setSalvando(false);
      const adicionados = Number(
        (data as { adicionados?: number } | null)?.adicionados ?? itens.length
      );
      toast.success(
        `${adicionados} ${adicionados === 1 ? "NA registrado" : "NAs registrados"}. Eles não contam como erro.`
      );
    } catch (caught) {
      setSalvando(false);
      toast.error(
        "Não foi possível salvar os NAs: " +
          (caught instanceof Error ? caught.message : "erro inesperado")
      );
    }
  }

  async function removerNa(id: string) {
    if (salvando) return;
    setSalvando(true);
    const { error } = await mutarQualidade("REMOVER_NA", { id });
    setSalvando(false);
    if (error) {
      toast.error("Não foi possível remover o NA: " + error.message);
      return;
    }
    setNas((lista) => lista.filter((n) => n.id !== id));
    toast.success("NA removido.");
  }

  /* Exclusão da casa inteira. A conta corre no banco, numa função só,
     porque o vínculo do erro com a auditoria é SET NULL: apagar a
     auditoria daqui deixaria os erros soltos na tela Consultar. */
  async function excluirCasa() {
    if (!auditoria || excluindo) return;
    setExcluindo(true);
    const supabase = createClient();
    const anexosConsulta = await supabase
      .from("produto_anexos")
      .select("storage_bucket, storage_path")
      .eq("auditoria_id", auditoria.id)
      .not("storage_path", "is", null);

    if (anexosConsulta.error) {
      setExcluindo(false);
      toast.error(
        "Não foi possível preparar a exclusão dos arquivos da casa: " +
          anexosConsulta.error.message
      );
      return;
    }

    const { data, error } = await mutarQualidade("EXCLUIR_AUDITORIA", {
      auditoria_id: auditoria.id,
    });
    setExcluindo(false);
    if (error) {
      toast.error("Não foi possível excluir: " + error.message);
      return;
    }
    const falhasStorage = await removerArquivosDoStorage(
      supabase,
      (anexosConsulta.data ?? []) as AnexoStorageRow[]
    );
    const r = (Array.isArray(data) ? data[0] : data) as {
      erros_apagados: number;
      paredes_apagadas: number;
      nas_apagados: number;
    } | null;
    const casaApagada = auditoria.casa;
    dialogo.current?.close();
    setTodas((lista) => lista.filter((x) => x.id !== auditoria.id));
    setResumos((m) => {
      const copia = { ...m };
      delete copia[auditoria.id];
      return copia;
    });
    fechar();
    toast.success(
      `Casa ${casaApagada} excluída` +
        (r
          ? `: ${r.erros_apagados} erros, ${r.paredes_apagadas} paredes e ${r.nas_apagados} NAs.`
          : ".") +
        (falhasStorage.length
          ? " Alguns arquivos não puderam ser removidos do Storage."
          : "")
    );
  }

  async function removerErro(id: string) {
    if (!auditoria || salvando) return;
    setSalvando(true);
    const supabase = createClient();
    const anexosConsulta = await supabase
      .from("produto_anexos")
      .select("storage_bucket, storage_path")
      .eq("desvio_id", id)
      .not("storage_path", "is", null);

    if (anexosConsulta.error) {
      setSalvando(false);
      toast.error(
        "Não foi possível preparar a remoção das fotos: " +
          anexosConsulta.error.message
      );
      return;
    }

    const { error } = await mutarQualidade("REMOVER_DESVIO", { id });
    setSalvando(false);
    if (error) {
      toast.error(
        "Não foi possível remover: " +
          error.message +
          " (apenas a gestão pode excluir registros)"
      );
      return;
    }
    const falhasStorage = await removerArquivosDoStorage(
      supabase,
      (anexosConsulta.data ?? []) as AnexoStorageRow[]
    );
    setErros((lista) => lista.filter((e) => e.id !== id));
    toast.success(
      falhasStorage.length
        ? "Erro removido. Algumas fotos não puderam ser removidas do Storage."
        : "Erro removido."
    );
  }

  /* ---------- render ---------- */
  if (erroCarga)
    return (
      <div className="tela">
        <p className="text-sm text-alta">{erroCarga}</p>
      </div>
    );
  if (!cfg)
    return (
      <div className="tela">
        <p className="text-sm text-ink-3">Carregando…</p>
      </div>
    );

  // as funções de resumo trabalham com o conjunto de nomes
  const inspecionadas = new Set(Object.keys(datas));
  const resumo = resumoAuditoria(
    paredesDoProjeto,
    inspecionadas,
    erros,
    // a regra vale por projeto: a escola está fora dela, o C4A dentro
    regraDoProjeto(regras, auditoria?.projeto ?? projeto)
  );
  const diasConferidos = [...new Set(Object.values(datas))].sort();

  return (
    <main className="tela">
      {/* Voltar é a PRIMEIRA coisa da tela quando há casa aberta. Antes o
          único caminho era o botão "Trocar de casa", encostado na direita
          do cabeçalho: quem estava no meio das paredes rolava a tela
          atrás dele e não achava. */}
      {auditoria && (
        <button
          onClick={fechar}
          className="btn"
          style={{ justifySelf: "start" }}
        >
          ← Voltar para as casas
        </button>
      )}

      {/* ---------- cabeçalho: abrir a casa ---------- */}
      <section className="cartao">
        <h2>{auditoria ? "Auditoria de casa" : "Abrir auditoria da casa"}</h2>
        <p className="sub">
          {somenteLeitura
            ? "Acompanhamento: escolha uma casa na lista abaixo para ver o que foi conferido."
            : "Confira a casa parede por parede. As paredes sem erro contam como aprovadas de primeira e alimentam o FPY."}
        </p>

        {!auditoria && somenteLeitura ? null : !auditoria ? (
          <div className="corpo grid gap-2.5">
            {/* Os três numa linha só: são um gesto único — digitar a
                casa, conferir o projeto, abrir. Empilhados, cada um
                parecia um passo separado e a tela custava três alturas
                de campo para o que cabe em uma.
                A casa não tem data: cada parede é conferida no seu dia,
                dentro do painel da parede. */}
            <div className="aud-abrir">
              <div className="min-w-0">
                <label className="rotulo">Casa</label>
                <input
                  type="text"
                  value={casa}
                  onChange={(e) => setCasa(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && abrirCasa()}
                  placeholder="Número da casa"
                  className="campo"
                />
              </div>
              <div className="min-w-0">
                <label className="rotulo">Projeto</label>
                <select
                  value={projeto}
                  onChange={(e) => setProjeto(e.target.value)}
                  className="campo"
                >
                  {cfg.projetos.map((p) => (
                    <option key={p.id} value={p.nome}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={abrirCasa}
                disabled={!casa.trim() || abrindo}
                className="btn btn-forte aud-abrir-botao"
              >
                {abrindo ? "Abrindo…" : "Abrir auditoria da casa"}
                <IconeAbrir />
              </button>
            </div>
            <p className="sub">
              Se essa casa já tiver auditoria, ela é retomada de onde parou.
            </p>
          </div>
        ) : (
          <div className="corpo">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="num text-[19px] font-black">
                  Casa {auditoria.casa}
                </div>
                <div className="text-[11.5px] text-ink-3">
                  {auditoria.projeto}
                  {diasConferidos.length > 0 && (
                    <>
                      {" · "}
                      {diasConferidos.length === 1
                        ? diasConferidos[0].split("-").reverse().join("/")
                        : `${diasConferidos[0]
                            .split("-")
                            .reverse()
                            .join("/")} a ${diasConferidos[diasConferidos.length - 1]
                            .split("-")
                            .reverse()
                            .join("/")}`}
                    </>
                  )}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <button onClick={fechar} className="btn">
                  Trocar de casa
                </button>
                {role === "gestao" && !somenteLeitura && (
                  <button
                    onClick={() => {
                      setConfirmaExclusao("");
                      dialogo.current?.showModal();
                    }}
                    className="btn"
                    style={{ color: "var(--color-alta)" }}
                    title="Excluir esta casa e tudo o que foi registrado nela"
                  >
                    Excluir casa
                  </button>
                )}
              </div>
            </div>

            {/* progresso e FPY da casa */}
            <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Indicador rotulo="Conferidas" valor={`${resumo.inspecionadas}/${resumo.total}`} />
              <Indicador
                rotulo="Sem erros"
                valor={resumo.ok}
                cor="var(--color-baixa)"
              />
              <Indicador
                rotulo="Com erros"
                valor={resumo.comErros}
                cor={resumo.comErros > 0 ? "var(--color-alta)" : undefined}
              />
              <Indicador
                rotulo="FPY da casa"
                valor={resumo.fpy === null ? "—" : `${resumo.fpy}%`}
                cor={
                  resumo.fpy === null
                    ? undefined
                    : resumo.fpy >= regras.meta
                      ? "var(--color-baixa)"
                      : resumo.fpy >= regras.meta * 0.75
                        ? "var(--color-media)"
                        : "var(--color-alta)"
                }
                detalhe={
                  resumo.zeradaPelaRegra
                    ? `zerado: ${resumo.comErros} paredes afetadas`
                    : undefined
                }
              />
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--color-papel-2)" }}>
              <div
                style={{
                  height: "100%",
                  width: `${resumo.total ? (resumo.inspecionadas / resumo.total) * 100 : 0}%`,
                  background: "var(--color-brand)",
                  transition: "width 200ms",
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ---------- paredes ---------- */}
      {auditoria && (
        <section className="cartao">
          <h2>Paredes</h2>
          <p className="sub">
            Verde = sem erros · vermelho = tem erro · branco = ainda não
            conferida.{" "}
            {somenteLeitura
              ? "Toque numa parede para ver o que foi registrado nela."
              : "A parede aberta fica com um contorno azul."}
          </p>
          <div className="corpo grid gap-3">
            <div className="chips grade">
              {paredesDoProjeto.map((p) => {
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
              })}
            </div>

            {paredeAberta && (
              <PainelParede
                /* a chave força o campo de data a recarregar ao trocar de
                   parede; sem ela o rascunho da anterior ficaria na tela */
                key={paredeAberta}
                parede={paredeAberta}
                erros={erros.filter((e) => e.parede === paredeAberta)}
                nas={nas.filter((n) => n.parede === paredeAberta)}
                inspecionada={inspecionadas.has(paredeAberta)}
                data={datas[paredeAberta] ?? ""}
                hoje={hojeISO()}
                tipos={cfg.tipos}
                setores={cfg.setores}
                projetoAnexo={anexoDaParedeAberta}
                salvando={salvando}
                aoMarcarOk={(dia) => marcarOk(paredeAberta, dia)}
                aoAdicionarErro={(e, dia) =>
                  adicionarErro(paredeAberta, e, dia)
                }
                aoRemoverErro={removerErro}
                temNa={temNa}
                somenteLeitura={somenteLeitura}
                aoAdicionarNa={(n) => adicionarNa(paredeAberta, n)}
                aoRemoverNa={removerNa}
                aoMudarData={(dia) => mudarDataDaParede(paredeAberta, dia)}
              />
            )}

            {!paredeAberta && resumo.inspecionadas === resumo.total && (
              <p
                className="rounded-lg p-3 text-center text-[13px]"
                style={{
                  background: "var(--color-brand-suave)",
                  color: "var(--color-brand-forte)",
                }}
              >
                Casa {auditoria.casa} conferida por inteiro — {resumo.ok} de{" "}
                {resumo.total} paredes passaram de primeira.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ---------- o que a casa acumulou de NA ---------- */}
      {auditoria && (
        <ResumoDeNas
          nas={nas}
          aoAbrirParede={(p) => {
            setParedeAberta(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      {/* ---------- excluir a casa ----------
          Em janela, e não numa seção no fim da página: é a única ação da
          tela que não tem volta, e ação assim não fica no caminho de quem
          está só conferindo parede. O <dialog> nativo já traz o foco
          preso dentro dele, o fechar no Esc e o fundo bloqueado. */}
      {auditoria && role === "gestao" && (
        <dialog ref={dialogo} className="janela">
          <h2>Excluir a casa {auditoria.casa}</h2>
          <p className="sub">
            Apaga a auditoria, {resumo.inspecionadas}{" "}
            {resumo.inspecionadas === 1
              ? "parede conferida"
              : "paredes conferidas"}
            , {resumo.erros} {resumo.erros === 1 ? "erro" : "erros"} e{" "}
            {nas.length} {nas.length === 1 ? "NA" : "NAs"}. Serve para casa
            aberta com o número errado. Não tem como desfazer — a trilha do
            histórico guarda o que foi apagado, mas os registros não voltam.
          </p>
          <div className="corpo grid gap-2.5">
            <div>
              <label className="rotulo" htmlFor="confirma-exclusao">
                Digite <b>{auditoria.casa}</b> para liberar o botão
              </label>
              <input
                id="confirma-exclusao"
                type="text"
                value={confirmaExclusao}
                onChange={(e) => setConfirmaExclusao(e.target.value)}
                placeholder={auditoria.casa}
                className="campo"
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => dialogo.current?.close()}
                className="btn"
                disabled={excluindo}
              >
                Cancelar
              </button>
              <button
                onClick={excluirCasa}
                disabled={
                  excluindo || confirmaExclusao.trim() !== auditoria.casa
                }
                className="btn"
                style={{
                  color: "var(--color-alta)",
                  borderColor: "var(--color-alta)",
                }}
              >
                {excluindo ? "Excluindo…" : `Excluir a casa ${auditoria.casa}`}
              </button>
            </div>
          </div>
        </dialog>
      )}

      {/* ---------- todas as casas auditadas ---------- */}
      {!auditoria && (
        <ListaAuditorias
          auditorias={todas}
          resumos={resumos}
          projetos={cfg.projetos}
          projeto={projeto}
          aoTrocarProjeto={setProjeto}
          aoAbrir={async (a) => {
            setProjeto(a.projeto);
            setCasa(a.casa);
            setAuditoria(a);
            setParedeAberta(null);
            await carregarConteudo(a);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}
    </main>
  );
}

/** A seta de "abre em outro lugar", no botão de abrir a casa. */
function IconeAbrir() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

function Indicador({
  rotulo,
  valor,
  cor,
  detalhe,
}: {
  rotulo: string;
  valor: string | number;
  cor?: string;
  detalhe?: string;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="text-[10px] tracking-wider text-ink-3 uppercase">
        {rotulo}
      </div>
      <div className="num text-[19px] font-black" style={{ color: cor }}>
        {valor}
      </div>
      {detalhe && (
        <div className="mt-0.5 text-[10px] leading-tight text-ink-3">
          {detalhe}
        </div>
      )}
    </div>
  );
}
