"use server";

import { obterContextoGestao } from "@/lib/ai/auth";
import { createClient } from "@/lib/supabase/server";
import {
  UMIDADE_MADEIRA_MAXIMA,
  UMIDADE_MADEIRA_MINIMA,
} from "@/lib/cadeiaMadeira";

export type IaTecToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type Registro = Record<string, unknown>;

function textoSeguro(value: unknown, label: string, max = 120) {
  if (typeof value !== "string") throw new Error(`${label} inválido.`);
  const valueTrimmed = value.trim().replace(/\s+/g, " ");
  if (!valueTrimmed) throw new Error(`${label} é obrigatório.`);
  if (valueTrimmed.length > max) {
    throw new Error(`${label} deve ter até ${max} caracteres.`);
  }
  return valueTrimmed;
}

function normalizar(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function erroSeguro(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";

  if (/row-level security|permission denied|42501|not authorized/i.test(message)) {
    return "Você não tem permissão para consultar esse conjunto de dados.";
  }

  return message || "Não foi possível consultar os dados do sistema.";
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function projetoCanonico(
  supabase: SupabaseServerClient,
  projetoInput: string,
) {
  const projeto = textoSeguro(projetoInput, "Projeto", 100);
  const { data, error } = await supabase
    .from("projetos")
    .select("nome")
    .order("ordem");

  if (error) throw error;

  const alvo = normalizar(projeto);
  const encontrado = (data ?? []).find(
    (item) => normalizar(String(item.nome ?? "")) === alvo,
  );

  return encontrado ? String(encontrado.nome) : projeto;
}

export async function consultar_fpy_projeto(
  projetoInput: string,
): Promise<IaTecToolResult<unknown>> {
  try {
    const contexto = await obterContextoGestao();
    if (!contexto.ok) return { ok: false, error: contexto.erro };

    const projeto = await projetoCanonico(contexto.supabase, projetoInput);
    const { data, error } = await contexto.supabase.rpc("ai_suite_consulta", {
      p_intent: "fpy_consolidado",
      p_projeto: projeto,
      p_dias: null,
      p_limite: 5,
    });

    if (error) throw error;

    return {
      ok: true,
      data: {
        projeto,
        fonte: "RPC segura ai_suite_consulta",
        resultado: data,
      },
    };
  } catch (error) {
    return { ok: false, error: erroSeguro(error) };
  }
}

export async function buscar_status_casa(
  numeroCasaInput: string,
  projetoInput: string,
): Promise<IaTecToolResult<unknown>> {
  try {
    const contexto = await obterContextoGestao();
    if (!contexto.ok) return { ok: false, error: contexto.erro };

    const casa = textoSeguro(numeroCasaInput, "Número da casa", 40);
    const projeto = await projetoCanonico(contexto.supabase, projetoInput);

    const auditoriasResult = await contexto.supabase
      .from("produto_auditorias")
      .select(
        "id, parede_nome, status, resultado_primeira_passagem, data_inspecao, tipo_desvio_nome, criticalidade, descricao",
      )
      .eq("projeto_nome", projeto)
      .eq("casa", casa)
      .order("parede_nome")
      .limit(250);

    if (auditoriasResult.error) throw auditoriasResult.error;

    const auditorias = (auditoriasResult.data ?? []) as Registro[];
    if (!auditorias.length) {
      return {
        ok: true,
        data: {
          encontrado: false,
          projeto,
          casa,
          mensagem: "Casa não encontrada na base auditada para esse projeto.",
        },
      };
    }

    const auditoriaIds = auditorias
      .map((item) => String(item.id ?? ""))
      .filter(Boolean);

    let desvios: Registro[] = [];
    if (auditoriaIds.length) {
      const desviosResult = await contexto.supabase
        .from("produto_desvios")
        .select(
          "auditoria_id, status, tipo_desvio_nome, criticalidade, descricao, data_inspecao",
        )
        .in("auditoria_id", auditoriaIds)
        .limit(300);

      if (desviosResult.error) throw desviosResult.error;
      desvios = (desviosResult.data ?? []) as Registro[];
    }

    const paredes = Array.from(
      new Map(
        auditorias.map((item) => [
          String(item.parede_nome ?? item.id ?? ""),
          {
            parede: String(item.parede_nome ?? "Não informada"),
            status: String(item.status ?? "NÃO INFORMADO"),
            primeira_passagem: String(
              item.resultado_primeira_passagem ?? "NÃO INFORMADO",
            ),
            data_inspecao: item.data_inspecao ?? null,
            tipo_desvio: item.tipo_desvio_nome ?? null,
            criticalidade: item.criticalidade ?? null,
          },
        ]),
      ).values(),
    );

    const statusCounts = paredes.reduce<Record<string, number>>((acc, item) => {
      const key = item.status || "NÃO INFORMADO";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const primeiraCounts = paredes.reduce<Record<string, number>>((acc, item) => {
      const key = item.primeira_passagem || "NÃO INFORMADO";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const criticos = desvios.filter(
      (item) => normalizar(String(item.criticalidade ?? "")) === "critico",
    ).length;

    return {
      ok: true,
      data: {
        encontrado: true,
        projeto,
        casa,
        total_paredes: paredes.length,
        status_paredes: statusCounts,
        primeira_passagem: primeiraCounts,
        total_desvios: desvios.length,
        desvios_criticos: criticos,
        paredes: paredes.slice(0, 80),
        desvios: desvios.slice(0, 40).map((item) => ({
          parede_auditoria_id: item.auditoria_id ?? null,
          status: item.status ?? null,
          tipo: item.tipo_desvio_nome ?? null,
          criticalidade: item.criticalidade ?? null,
          descricao: item.descricao ?? null,
          data_inspecao: item.data_inspecao ?? null,
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: erroSeguro(error) };
  }
}

export async function listar_residuos_recentes(): Promise<IaTecToolResult<unknown>> {
  try {
    const contexto = await obterContextoGestao();
    if (!contexto.ok) return { ok: false, error: contexto.erro };

    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 30);
    const inicioIso = inicio.toISOString().slice(0, 10);

    const { data, error } = await contexto.supabase
      .from("residuos_trocas")
      .select(
        "id, categoria, data_troca, identificacao_cacamba, transportadora_destino, peso_kg, mtr_numero, empresa_coletora, custo, destino_final, status",
      )
      .gte("data_troca", inicioIso)
      .order("data_troca", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const rows = (data ?? []) as Registro[];
    const comMtr = rows.filter(
      (item) => String(item.mtr_numero ?? "").trim().length > 0,
    ).length;
    const pesoTotal = rows.reduce(
      (sum, item) => sum + (Number(item.peso_kg) || 0),
      0,
    );
    const custoTotal = rows.reduce(
      (sum, item) => sum + (Number(item.custo) || 0),
      0,
    );

    const porCategoria = rows.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.categoria ?? "Sem categoria");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const porStatus = rows.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status ?? "Sem status");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true,
      data: {
        periodo: `últimos 30 dias desde ${inicioIso}`,
        total_trocas: rows.length,
        mtrs_informados: comMtr,
        mtrs_pendentes: rows.length - comMtr,
        peso_total_kg: Number(pesoTotal.toFixed(2)),
        custo_total: Number(custoTotal.toFixed(2)),
        por_categoria: porCategoria,
        por_status: porStatus,
        recentes: rows.slice(0, 12).map((item) => ({
          data: item.data_troca ?? null,
          categoria: item.categoria ?? null,
          cacamba: item.identificacao_cacamba ?? null,
          mtr: item.mtr_numero ?? null,
          peso_kg: Number(item.peso_kg) || 0,
          status: item.status ?? null,
          coletora: item.empresa_coletora ?? null,
          destino: item.destino_final ?? item.transportadora_destino ?? null,
        })),
      },
    };
  } catch (error) {
    return { ok: false, error: erroSeguro(error) };
  }
}

export async function verificar_lotes_madeira(): Promise<IaTecToolResult<unknown>> {
  try {
    const contexto = await obterContextoGestao();
    if (!contexto.ok) return { ok: false, error: contexto.erro };

    const [lotesResult, fornecedoresResult] = await Promise.all([
      contexto.supabase
        .from("cadeia_madeira_lotes")
        .select(
          "id, fornecedor_id, numero_nota_fiscal, data_recebimento, teor_umidade_medio, lote_autoclave, status_liberacao, quantidade_pecas, total_fardos, ativo",
        )
        .eq("ativo", true)
        .order("data_recebimento", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100),
      contexto.supabase
        .from("cadeia_madeira_fornecedores")
        .select("id, razao_social, homologacao_ativa, ativo")
        .eq("ativo", true),
    ]);

    if (lotesResult.error) throw lotesResult.error;
    if (fornecedoresResult.error) throw fornecedoresResult.error;

    const lotes = (lotesResult.data ?? []) as Registro[];
    const fornecedores = new Map(
      ((fornecedoresResult.data ?? []) as Registro[]).map((item) => [
        String(item.id),
        {
          nome: String(item.razao_social ?? "Fornecedor"),
          homologado: Boolean(item.homologacao_ativa),
        },
      ]),
    );

    const foraPadrao = lotes.filter((item) => {
      const umidade = Number(item.teor_umidade_medio);
      return (
        Number.isFinite(umidade) &&
        (umidade < UMIDADE_MADEIRA_MINIMA || umidade > UMIDADE_MADEIRA_MAXIMA)
      );
    });

    const porStatus = lotes.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status_liberacao ?? "Sem status");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      ok: true,
      data: {
        lotes_ativos_considerados: lotes.length,
        faixa_umidade_padrao: {
          minima_percentual: UMIDADE_MADEIRA_MINIMA,
          maxima_percentual: UMIDADE_MADEIRA_MAXIMA,
        },
        lotes_umidade_fora_padrao: foraPadrao.length,
        por_status: porStatus,
        recentes: lotes.slice(0, 12).map((item) => {
          const fornecedor = fornecedores.get(String(item.fornecedor_id));
          const umidade = Number(item.teor_umidade_medio) || 0;
          return {
            data_recebimento: item.data_recebimento ?? null,
            fornecedor: fornecedor?.nome ?? "Fornecedor não localizado",
            fornecedor_homologado: fornecedor?.homologado ?? false,
            nota_fiscal: item.numero_nota_fiscal ?? null,
            lote_autoclave: item.lote_autoclave ?? null,
            umidade_percentual: umidade,
            umidade_no_padrao:
              umidade >= UMIDADE_MADEIRA_MINIMA &&
              umidade <= UMIDADE_MADEIRA_MAXIMA,
            status: item.status_liberacao ?? null,
            quantidade_pecas: Number(item.quantidade_pecas) || 0,
            total_fardos: Number(item.total_fardos) || 0,
          };
        }),
      },
    };
  } catch (error) {
    return { ok: false, error: erroSeguro(error) };
  }
}
