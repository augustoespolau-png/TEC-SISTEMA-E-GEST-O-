"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  assinarAnexosEmLote,
  BUCKET_AUDITORIA,
  criarUrlAssinadaOpcional,
  caminhoAnexoAuditoria,
  ErroAnexo,
  mimeArquivo,
  registrarErroSupabase,
  textoErroSupabase,
  enviarFotoAuditoria,
  otimizarFoto,
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

interface ObraItem {
  id: string;
  codigo: string;
  nome: string;
}

interface Config {
  projetos: ConfigItem[];
  paredes: Parede[];
  setores: ConfigItem[];
  tipos: ConfigItem[];
  obras: ObraItem[];
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

function obraPadrao(projeto: string, casa: string) {
  const p = projeto.trim().toLocaleUpperCase("pt-BR");
  const numero = Number(casa.trim().match(/^\d+/)?.[0] ?? NaN);
  if (p === "C4A")
    return Number.isFinite(numero) && numero <= 149 ? "Morro Verde" : "";
  if (p.includes("SÃO BERN") && p.includes("DO CAMPO - SP"))
    return "São Bernardo";
  if (p === "ESCOLA ZACARIAS PR") return "Zacarias";
  return "";
}

interface DadosIniciaisAuditoria {
  cfg: Config;
  todas: Auditoria[];
  resumos: Record<string, ResumoDaCasa>;
  regras: Regras;
  projetoInicial: string | null;
}

async function carregarConfigEstaticaAuditoria() {
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
  const [obra, setObra] = useState("");

  const [auditoria, setAuditoria] = useState<Auditoria | null>(null);
  /* parede -> dia em que ela foi conferida. Era um Set só com os nomes;
     agora cada parede carrega a própria data (migration 020). */
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<ErroDaAuditoria[]>([]);
  const [nas, setNas] = useState<NaDaAuditoria[]>([]);
  const datasRef = useRef<Record<string, string>>({});
  const errosRef = useRef<ErroDaAuditoria[]>([]);
  const nasRef = useRef<NaDaAuditoria[]>([]);
  const auditoriaIdRef = useRef<string | null>(null);
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
  const salvandoRef = useRef(false);
  const zerandoParedesRef = useRef(new Set<string>());
  const removendoErrosRef = useRef(new Set<string>());
  const [salvandoObra, setSalvandoObra] = useState(false);
  const [todas, setTodas] = useState<Auditoria[]>([]);
  const [resumos, setResumos] = useState<Record<string, ResumoDaCasa>>({});
  const [anexosProjetoParede, setAnexosProjetoParede] = useState<
    Record<string, AnexoProjetoParede>
  >({});
  // regras da qualidade vindas de Configurações; o FPY desta tela obedece
  // exatamente as mesmas do painel
  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);

  useEffect(() => {
    datasRef.current = datas;
  }, [datas]);
  useEffect(() => {
    errosRef.current = erros;
  }, [erros]);
  useEffect(() => {
    nasRef.current = nas;
  }, [nas]);
  useEffect(() => {
    auditoriaIdRef.current = auditoria?.id ?? null;
  }, [auditoria?.id]);

  /* ---------- listas de configuração ---------- */
  useEffect(() => {
    let ativo = true;
    void carregarDadosIniciaisAuditoria()
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

  async function persistirObra(a: Auditoria, novaObra: string) {
  const valor = novaObra.trim() || null;
  const { error } = await createClient()
    .from("qualidade_casas")
    .upsert(
      {
        auditoria_id: a.id,
        projeto: a.projeto,
        casa: a.casa,
        obra: valor,
        updated_by: "app:auditoria",
      },
      { onConflict: "auditoria_id" }
    );
  if (error) return error;
  const atualizada: Auditoria = { ...a, obra: valor };
  setTodas((lista) =>
    lista.map((item) => (item.id === a.id ? atualizada : item))
  );
  return null;
}

  async function alterarObra(novaObra: string) {
    if (!auditoria || salvandoObra || somenteLeitura) return;
    setSalvandoObra(true);
    const error = await persistirObra(auditoria, novaObra);
    setSalvandoObra(false);
    if (error) {
      toast.error("Não foi possível alterar a obra: " + error.message);
      return;
    }
    const valor = novaObra.trim() || null;
    setAuditoria((atual) => (atual ? { ...atual, obra: valor } : atual));
    setObra(novaObra);
    toast.success(valor ? `Obra alterada para ${valor}.` : "Casa marcada como Sem Obra.");
  }

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

    const { data: existente, error: erroConsulta } = await supabase
      .from("qualidade_auditorias")
      .select("*")
      .eq("projeto", projeto)
      .eq("casa", numero)
      .maybeSingle();

    if (erroConsulta) {
      setAbrindo(false);
      toast.error("Não foi possível verificar esta casa: " + erroConsulta.message);
      return;
    }

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
    const erroObra = await persistirObra(a, obra);
    if (erroObra) {
      toast.error("A auditoria foi criada, mas a obra não pôde ser salva: " + erroObra.message);
    } else {
      a = { ...a, obra: obra.trim() || null };
    }
    setTodas((lista) => [a as Auditoria, ...lista.filter((item) => item.id !== a?.id)]);
    toast.success(`Auditoria da casa ${numero} aberta.`);
  } else {
    setObra(a.obra ?? "");
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

  /* Trocar a data de uma parede já conferida. O erro registrado nela
     acompanha: para a fábrica, os dois são o mesmo acontecimento. */
  async function mudarDataDaParede(parede: string, dia: string) {
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

  async function prepararFotoDoDesvio(
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
        url: null,
        anexo: null,
      };
    }

    const projetoCfg = cfg?.projetos.find((item) => item.nome === auditoriaFoto.projeto);
    const projetoId =
      projetoCfg?.origem_id ||
      auditoriaFoto.id.split("|", 1)[0] ||
      auditoriaFoto.projeto;
    const paredeCfg = cfg?.paredes.find(
      (item) => item.projeto_id === projetoCfg?.id && item.nome === parede
    );
    const paredeId = paredeCfg?.origem_id ?? parede;

    let caminho: string | null = null;
    try {
      /* O caminho é calculado com os IDs canônicos que também aparecem em
         produto_auditorias/produto_paredes. Isso evita misturar os IDs
         numéricos do catálogo legado com as linhas relacionais. */
      const agora = new Date();
      caminho = caminhoAnexoAuditoria({
        usuarioId: usuario.id,
        projetoId,
        casaId: auditoriaFoto.casa,
        paredeId,
        anexoId: anexoUid,
        extensao: "jpg",
        agora,
      });
      const arquivoOtimizado = await otimizarFoto(arquivo);
      caminho = await enviarFotoAuditoria(supabase, {
        usuarioId: usuario.id,
        projetoId,
        casaId: auditoriaFoto.casa,
        paredeId,
        anexoId: anexoUid,
        extensao: "jpg",
        agora,
        caminho,
        arquivo: arquivoOtimizado,
      });
      const url = await criarUrlAssinadaOpcional(
        supabase,
        BUCKET_AUDITORIA,
        caminho,
        60 * 60,
      );
      return {
        error: null,
        caminho,
        url,
        anexo: {
          id: anexoId,
          name: arquivoOtimizado.name,
          type: mimeArquivo(arquivoOtimizado),
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
        caminho,
        url: null,
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

    try {
      const { error } = await supabase.rpc("qualidade_adicionar_anexo_fast", {
        p_auditoria_id: auditoriaFoto.id,
        p_parede: parede,
        p_desvio_id: desvioId,
        p_anexo: {
          ...preparada.anexo,
          deviationId: desvioId,
        },
      });

      if (error) {
        registrarErroSupabase("auditoria/vincular-foto", error);
        return { error };
      }
      return { error: null };
    } catch (error) {
      registrarErroSupabase("auditoria/vincular-foto", error);
      return {
        error: new ErroAnexo("Não foi possível vincular a foto", error),
      };
    }
  }

  function adicionarErro(parede: string, novo: NovoErro, dia: string) {
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

        if (!anexo) return;

        /* A foto só começa depois de o RPC acima confirmar o ID real do
           desvio. Assim o Storage e a tabela relacional nunca correm em
           paralelo com a criação do registro. A falha do anexo fica isolada
           nesta etapa: o desvio já salvo não sofre rollback. */
        try {
          const preparada = await prepararFotoDoDesvio(
            supabase,
            auditoriaAtual,
            parede,
            anexo,
          );
          if (preparada.error) {
            if (preparada.caminho) {
              const limpeza = await supabase.storage
                .from(BUCKET_AUDITORIA)
                .remove([preparada.caminho]);
              if (limpeza.error) {
                registrarErroSupabase("auditoria/limpeza-foto", limpeza.error);
              }
            }
            marcarFoto("ERRO");
            registrarErroSupabase("auditoria/preparar-foto", preparada.error);
            toast.error(
              "O erro foi salvo, mas a foto não foi enviada: " +
                textoErroSupabase(preparada.error),
            );
            return;
        }

          const anexoPreparado = preparada.anexo;
          const caminhoPreparado = preparada.caminho;
          if (!anexoPreparado || !caminhoPreparado) {
            marcarFoto("ERRO");
            const falha = new ErroAnexo(
              "A foto não ficou pronta para vincular",
              new Error("o upload não retornou um caminho"),
            );
            registrarErroSupabase("auditoria/preparar-foto", falha);
            toast.error(
              "O erro foi salvo, mas a foto não foi enviada: " +
                textoErroSupabase(falha),
            );
            return;
          }

          /* O vínculo também é idempotente. Se a rede oscilar depois do
             upload, repetimos somente o metadado, sem criar outro desvio. */
          let vinculo = await vincularFotoAoDesvio(
            supabase,
            auditoriaAtual,
            parede,
            id,
            preparada,
          );
          if (vinculo.error) {
            await new Promise((resolve) => window.setTimeout(resolve, 450));
            vinculo = await vincularFotoAoDesvio(
              supabase,
              auditoriaAtual,
              parede,
              id,
              preparada,
            );
          }

          if (vinculo.error) {
            marcarFoto("ERRO");
            const limpeza = await supabase.storage
              .from(BUCKET_AUDITORIA)
              .remove([caminhoPreparado]);
            if (limpeza.error) {
              registrarErroSupabase("auditoria/limpeza-foto", limpeza.error);
            }
            toast.error(
              "O erro foi salvo, mas a foto não foi vinculada: " +
                textoErroSupabase(vinculo.error),
            );
            return;
          }

          if (auditoriaIdRef.current === auditoriaId) {
            const anexoLocal: AnexoDaAuditoria = {
              id: anexoPreparado.id,
              nome_arquivo: anexoPreparado.name,
              mime_type: anexoPreparado.type,
              tamanho_bytes: anexoPreparado.size,
              storage_bucket: BUCKET_AUDITORIA,
              storage_path: caminhoPreparado,
              url:
                preparada.url ??
                (anexo ? URL.createObjectURL(anexo) : null),
            };
            const atualizados = errosRef.current.map((item) =>
              item.id === id || item.id === idOtimista
                ? {
                    ...item,
                    fotoStatus: undefined,
                    anexos: [
                      ...(item.anexos ?? []).filter(
                        (existente) => existente.id !== anexoLocal.id
                      ),
                      anexoLocal,
                    ],
                  }
                : item
            );
            errosRef.current = atualizados;
            setErros(atualizados);
          } else {
            marcarFoto(undefined);
          }
          toast.success("Foto anexada ao desvio.");
        } catch (caught) {
          /* Nunca desfazemos o desvio por uma falha posterior de Storage ou
             de rede. O diagnóstico completo fica no console e no toast. */
          marcarFoto("ERRO");
          registrarErroSupabase("auditoria/anexo-desvio", caught);
          toast.error(
            "O erro foi salvo, mas a foto não foi vinculada: " +
              textoErroSupabase(caught),
          );
        }
      } catch (caught) {
        rollback(
          "Não foi possível sincronizar o erro: " +
            (caught instanceof Error ? caught.message : "falha de conexão")
        );
      }
    })();
  }

  /* NA não confere a parede: quem confere é "Parede sem erros" ou o
     registro de um erro. Um item que não se aplica pode ser anotado no
     meio da conferência, e marcar a parede como conferida aqui poria no
     denominador do FPY uma parede que talvez nem tenha sido olhada
     inteira. */
  function adicionarNa(parede: string, novo: NovoNa) {
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
        const persistidos = (leitura.data ?? []) as NaDaAuditoria[];
        const tiposPersistidos = new Set(persistidos.map((item) => item.tipo_erro));
        const pendentesPosteriores = nasRef.current.filter(
          (item) =>
            item.parede === parede &&
            item.id.startsWith("optimistic-na-") &&
            !idsOtimistas.includes(item.id) &&
            !tiposPersistidos.has(item.tipo_erro)
        );
        const reconciliados = [
          ...nasRef.current.filter((item) => item.parede !== parede),
          ...persistidos,
          ...pendentesPosteriores,
        ];
        nasRef.current = reconciliados;
        setNas(reconciliados);
      } catch (caught) {
        rollback("Não foi possível sincronizar os NAs: " + (caught instanceof Error ? caught.message : "falha de conexão"));
      }
    })();
  }

  async function removerNa(id: string) {
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

  function removerErro(id: string) {
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
                  onChange={(e) => {
                    const numero = e.target.value;
                    setCasa(numero);
                    setObra(obraPadrao(projeto, numero));
                  }}
                  onKeyDown={(e) => e.key === "Enter" && abrirCasa()}
                  placeholder="Número da casa"
                  className="campo"
                />
              </div>
              <div className="min-w-0">
                <label className="rotulo">Projeto</label>
                <select
                  value={projeto}
                  onChange={(e) => {
                    const novoProjeto = e.target.value;
                    setProjeto(novoProjeto);
                    setObra(obraPadrao(novoProjeto, casa));
                  }}
                  className="campo"
                >
                  {cfg.projetos.map((p) => (
                    <option key={p.id} value={p.nome}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0">
                <label className="rotulo">Obra / Empreendimento</label>
                <select value={obra} onChange={(e) => setObra(e.target.value)} className="campo">
                  <option value="">Sem Obra / A definir</option>
                  {cfg.obras.map((item) => (
                    <option key={item.id} value={item.nome}>{item.nome}</option>
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

            <div className="mt-3 max-w-[420px]">
            <label className="rotulo">Obra / Empreendimento</label>
            <select
              className="campo"
              value={auditoria.obra ?? ""}
              disabled={somenteLeitura || salvandoObra}
              onChange={(e) => void alterarObra(e.target.value)}
            >
              <option value="">Sem Obra / A definir</option>
              {cfg.obras.map((item) => (
                <option key={item.id} value={item.nome}>{item.nome}</option>
              ))}
            </select>
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
              })}
            </div>

            {paredeAberta && (
              <PainelParede
                /* a chave força o campo de data a recarregar ao trocar de
                   parede; sem ela o rascunho da anterior ficaria na tela */
                key={paredeAberta}
                parede={paredeAberta}
                erros={errosDaParedeAberta}
                nas={nasDaParedeAberta}
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
                aoZerarInspecao={() => zerarInspecaoParede(paredeAberta)}
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
            setObra(a.obra ?? "");
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

const ParedeChip = memo(function ParedeChip({
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
