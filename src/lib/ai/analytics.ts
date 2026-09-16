import type { HealthDiagnostico } from "@/lib/diagnostico";

export type AiIntent =
  | "top_casas_desvios"
  | "fpy_consolidado"
  | "top_tipos_desvio"
  | "tendencia_semanal"
  | "equipes_setores"
  | "resumo_periodo"
  | "status_sistema"
  | "nao_suportado";

export type AiPlan = {
  intent: AiIntent;
  project: string | null;
  days: number | null;
  limit: number;
};

export type InsightPreditivo = {
  nivel: "ESTAVEL" | "ATENCAO" | "PRIORIDADE";
  titulo: string;
  resumo: string;
  sinais: string[];
  acoes: string[];
};

export type DigestExecutivo = {
  titulo: string;
  periodo: string;
  resumo_executivo: string;
  destaques: string[];
  riscos: string[];
  acoes: string[];
  saude_sistema: string;
};

type Registro = Record<string, unknown>;

const normalizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function projetoNaPergunta(pergunta: string, projetos: string[]) {
  const q = normalizar(pergunta);
  return (
    projetos.find((projeto) => {
      const p = normalizar(projeto);
      return p.length >= 2 && q.includes(p);
    }) ?? null
  );
}

function diasNaPergunta(pergunta: string) {
  const q = normalizar(pergunta);
  const explicito = q.match(/(?:ultim[oa]s?\s+)?(\d{1,4})\s+dias?/);
  if (explicito) return Math.min(3660, Math.max(1, Number(explicito[1])));
  if (/ultima semana|ultimos 7 dias|semana passada/.test(q)) return 7;
  if (/ultimo mes|ultimos 30 dias|mes passado/.test(q)) return 30;
  if (/ultimo trimestre|ultimos 90 dias/.test(q)) return 90;
  if (/ultimo ano|ultimos 12 meses/.test(q)) return 365;
  return null;
}

function limiteNaPergunta(pergunta: string) {
  const m = normalizar(pergunta).match(/top\s+(\d{1,2})/);
  return m ? Math.min(20, Math.max(1, Number(m[1]))) : 5;
}

export function planoDeterministico(
  pergunta: string,
  projetos: string[]
): AiPlan {
  const q = normalizar(pergunta);
  const project = projetoNaPergunta(pergunta, projetos);
  const explicitDays = diasNaPergunta(pergunta);
  const limit = limiteNaPergunta(pergunta);

  if (/health|diagnost|integridade|saude do sistema|banco/.test(q)) {
    return { intent: "status_sistema", project: null, days: null, limit };
  }
  if (/\bfpy\b|first pass/.test(q)) {
    return {
      intent: "fpy_consolidado",
      project,
      days: explicitDays,
      limit,
    };
  }
  if (/equipe|setor/.test(q)) {
    return {
      intent: "equipes_setores",
      project,
      days: explicitDays ?? 56,
      limit,
    };
  }
  if ((/tipo|recorr|frequente/.test(q) && /desvio|falha|erro/.test(q))) {
    return {
      intent: "top_tipos_desvio",
      project,
      days: explicitDays ?? 30,
      limit,
    };
  }
  if (/tendenc|evolu|seman/.test(q)) {
    return {
      intent: "tendencia_semanal",
      project,
      days: explicitDays ?? 56,
      limit,
    };
  }
  if (/casa/.test(q) && /desvio|falha|erro/.test(q)) {
    return {
      intent: "top_casas_desvios",
      project,
      days: explicitDays ?? 7,
      limit,
    };
  }
  if (/resumo|panorama|visao|qualidade|periodo|semana/.test(q)) {
    return {
      intent: "resumo_periodo",
      project,
      days: explicitDays ?? 7,
      limit,
    };
  }

  return { intent: "nao_suportado", project, days: explicitDays, limit };
}

export function sanitizarPlano(
  bruto: Partial<AiPlan> | null | undefined,
  fallback: AiPlan,
  projetos: string[]
): AiPlan {
  const permitidas: AiIntent[] = [
    "top_casas_desvios",
    "fpy_consolidado",
    "top_tipos_desvio",
    "tendencia_semanal",
    "equipes_setores",
    "resumo_periodo",
    "status_sistema",
    "nao_suportado",
  ];
  const intent = permitidas.includes(bruto?.intent as AiIntent)
    ? (bruto?.intent as AiIntent)
    : fallback.intent;

  const candidato = typeof bruto?.project === "string" ? bruto.project.trim() : "";
  const normalizado = normalizar(candidato);
  const project = candidato
    ? projetos.find((p) => normalizar(p) === normalizado) ?? fallback.project
    : null;

  const daysRaw = Number(bruto?.days);
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0
      ? Math.min(3660, Math.max(1, Math.round(daysRaw)))
      : fallback.days;
  const limitRaw = Number(bruto?.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(20, Math.max(1, Math.round(limitRaw)))
    : fallback.limit;

  return { intent, project, days, limit };
}

const numero = (valor: unknown) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

const texto = (valor: unknown) => (valor == null ? "" : String(valor));

const percentual = (valor: unknown) => {
  const n = Number(valor);
  return Number.isFinite(n) ? `${n.toFixed(1).replace(".", ",")}%` : "—";
};

const dados = (valor: unknown): Registro =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Registro)
    : {};

const linhas = (valor: unknown): Registro[] =>
  Array.isArray(valor)
    ? valor.filter((x): x is Registro => Boolean(x) && typeof x === "object")
    : [];

function periodoDoResultado(result: Registro, plan: AiPlan) {
  if (plan.days) return `nos últimos ${plan.days} dias`;
  const inicio = texto(result.inicio);
  const fim = texto(result.fim);
  if (inicio && fim) return `de ${inicio} a ${fim}`;
  return "na base consolidada";
}

export function formatarRespostaAnalitica(plan: AiPlan, bruto: unknown) {
  const result = dados(bruto);
  const escopo = plan.project ? ` do projeto ${plan.project}` : " consolidado";
  const periodo = periodoDoResultado(result, plan);

  if (plan.intent === "fpy_consolidado") {
    const m = dados(result.metrics);
    if (numero(m.paredes) === 0) {
      return `Não encontrei paredes auditadas${escopo} ${periodo}.`;
    }
    return `O FPY${escopo} está em ${percentual(m.fpy)} ${periodo}: ${numero(m.primeira_passagem)} de ${numero(m.paredes)} paredes passaram de primeira. No mesmo recorte há ${numero(m.desvios)} desvios registrados e ${numero(m.nao_aplicaveis)} itens N/A.`;
  }

  if (plan.intent === "top_casas_desvios") {
    const rows = linhas(result.rows);
    if (!rows.length) return `Não encontrei desvios por casa${escopo} ${periodo}.`;
    const ranking = rows
      .map(
        (r, i) =>
          `${i + 1}. ${texto(r.projeto)} · Casa ${texto(r.casa)} — ${numero(r.desvios)} desvios (${numero(r.criticos)} críticos, ${numero(r.paredes_afetadas)} paredes afetadas)`
      )
      .join("\n");
    return `Casas com mais desvios${escopo} ${periodo}:\n${ranking}`;
  }

  if (plan.intent === "top_tipos_desvio") {
    const rows = linhas(result.rows);
    if (!rows.length) return `Não encontrei tipos de desvio${escopo} ${periodo}.`;
    return `Tipos de desvio mais recorrentes${escopo} ${periodo}:\n${rows
      .map(
        (r, i) =>
          `${i + 1}. ${texto(r.tipo)} — ${numero(r.desvios)} registros, ${numero(r.criticos)} críticos, em ${numero(r.casas_afetadas)} casas`
      )
      .join("\n")}`;
  }

  if (plan.intent === "equipes_setores") {
    const rows = linhas(result.rows);
    if (!rows.length) return `Não encontrei desvios por equipe/setor${escopo} ${periodo}.`;
    return `Equipes/setores com maior concentração de desvios${escopo} ${periodo}:\n${rows
      .map(
        (r, i) =>
          `${i + 1}. ${texto(r.equipe)} — ${numero(r.desvios)} desvios, ${numero(r.criticos)} críticos, ${numero(r.casas_afetadas)} casas afetadas`
      )
      .join("\n")}`;
  }

  if (plan.intent === "tendencia_semanal") {
    const rows = linhas(result.rows);
    if (!rows.length) return `Não há série semanal suficiente${escopo} ${periodo}.`;
    const recentes = rows.slice(-6);
    return `Evolução semanal${escopo} ${periodo}:\n${recentes
      .map(
        (r) =>
          `• Semana ${texto(r.semana)}: FPY ${percentual(r.fpy)}, ${numero(r.desvios)} desvios (${numero(r.criticos)} críticos), ${numero(r.paredes)} paredes`
      )
      .join("\n")}`;
  }

  const m = dados(result.metrics);
  return `Resumo${escopo} ${periodo}: FPY ${percentual(m.fpy)}, ${numero(m.paredes)} paredes auditadas, ${numero(m.desvios)} desvios, ${numero(m.criticos)} críticos e ${numero(m.casas_afetadas)} casas afetadas.`;
}

export function formatarStatusSistema(health: HealthDiagnostico) {
  const ativos = health.issues.filter((issue) => Number(issue.count) > 0);
  const base = `Health-check ${health.status}: integridade ${health.integrity_percent}%, ${health.critical_count} ocorrência(s) crítica(s) e ${health.warning_count} alerta(s).`;
  if (!ativos.length) return `${base} Nenhuma anomalia ativa foi detectada.`;
  return `${base}\n${ativos
    .map((issue) => `• ${issue.code}: ${issue.count} ocorrência(s) — ${issue.message}`)
    .join("\n")}`;
}

function inicioSemana(data: string) {
  const d = new Date(`${data}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const deslocamento = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - deslocamento);
  return d.toISOString().slice(0, 10);
}

export function criarInsightDeterministico({
  tendencia,
  equipes,
  tipos,
}: {
  tendencia: unknown;
  equipes: unknown;
  tipos: unknown;
}): InsightPreditivo {
  const tendenciaObj = dados(tendencia);
  const todas = linhas(tendenciaObj.rows);
  const semanaAtual = inicioSemana(texto(tendenciaObj.fim));
  const completas = todas.filter((r) => texto(r.semana) !== semanaAtual);
  const base = completas.length >= 2 ? completas : todas;
  const ultimas = base.slice(-3);
  const atual = ultimas.at(-1) ?? {};
  const anterior = ultimas.at(-2) ?? {};
  const antepenultima = ultimas.at(-3) ?? {};

  const fpyAtual = Number(atual.fpy);
  const fpyAnterior = Number(anterior.fpy);
  const fpyAntepenultima = Number(antepenultima.fpy);
  const deltaFpy = Number.isFinite(fpyAtual) && Number.isFinite(fpyAnterior)
    ? fpyAtual - fpyAnterior
    : 0;
  const desviosAtual = numero(atual.desvios);
  const desviosAnterior = numero(anterior.desvios);
  const variacaoDesvios = desviosAnterior > 0
    ? ((desviosAtual - desviosAnterior) / desviosAnterior) * 100
    : desviosAtual > 0
      ? 100
      : 0;
  const quedaConsecutiva =
    Number.isFinite(fpyAntepenultima) &&
    Number.isFinite(fpyAnterior) &&
    Number.isFinite(fpyAtual) &&
    fpyAntepenultima > fpyAnterior &&
    fpyAnterior > fpyAtual;

  let nivel: InsightPreditivo["nivel"] = "ESTAVEL";
  if (deltaFpy <= -5 || variacaoDesvios >= 30 || quedaConsecutiva) nivel = "ATENCAO";
  if ((deltaFpy <= -10 && variacaoDesvios >= 30) || (quedaConsecutiva && numero(atual.criticos) >= 3)) {
    nivel = "PRIORIDADE";
  }

  const sinais: string[] = [];
  if (Number.isFinite(fpyAtual)) {
    sinais.push(
      `Última semana completa: FPY ${percentual(fpyAtual)} (${deltaFpy >= 0 ? "+" : ""}${deltaFpy.toFixed(1).replace(".", ",")} p.p. versus a anterior).`
    );
  }
  sinais.push(
    `Desvios na última semana completa: ${desviosAtual} (${variacaoDesvios >= 0 ? "+" : ""}${variacaoDesvios.toFixed(0)}% versus a anterior).`
  );
  if (quedaConsecutiva) sinais.push("O FPY caiu em duas semanas completas consecutivas.");

  const topTipo = linhas(dados(tipos).rows)[0];
  if (topTipo) {
    sinais.push(
      `Recorrência dominante no horizonte: ${texto(topTipo.tipo)} com ${numero(topTipo.desvios)} desvios.`
    );
  }
  const topEquipe = linhas(dados(equipes).rows)[0];
  if (topEquipe) {
    sinais.push(
      `Maior concentração por equipe/setor: ${texto(topEquipe.equipe)} com ${numero(topEquipe.desvios)} desvios.`
    );
  }

  const acoes = [
    topTipo
      ? `Revisar preventivamente o processo associado a ${texto(topTipo.tipo)} antes do próximo ciclo de produção.`
      : "Manter acompanhamento semanal dos tipos de desvio mais recorrentes.",
    topEquipe
      ? `Cruzar ${texto(topEquipe.equipe)} com as casas afetadas para confirmar se a concentração é operacional ou apenas efeito de volume.`
      : "Comparar concentração por equipe/setor com o volume auditado antes de atribuir causa.",
  ];

  return {
    nivel,
    titulo:
      nivel === "PRIORIDADE"
        ? "Tendência preventiva exige atenção"
        : nivel === "ATENCAO"
          ? "Sinais de deterioração merecem acompanhamento"
          : "Tendência recente está estável",
    resumo:
      "Leitura preditiva baseada em tendência histórica agregada. O sinal indica onde investigar primeiro; não representa causalidade nem previsão garantida.",
    sinais: sinais.slice(0, 5),
    acoes,
  };
}

export function criarDigestDeterministico(
  resumoSemanal: unknown,
  health: HealthDiagnostico
): DigestExecutivo {
  const r = dados(resumoSemanal);
  const atual = dados(r.atual);
  const anterior = dados(r.anterior);
  const fpyAtual = Number(atual.fpy);
  const fpyAnterior = Number(anterior.fpy);
  const deltaFpy = Number.isFinite(fpyAtual) && Number.isFinite(fpyAnterior)
    ? fpyAtual - fpyAnterior
    : 0;
  const desviosAtual = numero(atual.desvios);
  const desviosAnterior = numero(anterior.desvios);
  const deltaDesvios = desviosAtual - desviosAnterior;
  const topCasa = linhas(r.top_casas)[0];
  const topTipo = linhas(r.top_tipos)[0];
  const topEquipe = linhas(r.top_equipes)[0];

  const destaques = [
    `FPY semanal: ${percentual(atual.fpy)} (${deltaFpy >= 0 ? "+" : ""}${deltaFpy.toFixed(1).replace(".", ",")} p.p. versus a semana anterior).`,
    `${desviosAtual} desvios na janela atual (${deltaDesvios >= 0 ? "+" : ""}${deltaDesvios} versus a anterior), sendo ${numero(atual.criticos)} críticos.`,
  ];
  if (topCasa) destaques.push(`Casa com maior concentração: ${texto(topCasa.projeto)} · ${texto(topCasa.casa)} (${numero(topCasa.desvios)} desvios).`);
  if (topTipo) destaques.push(`Tipo mais recorrente: ${texto(topTipo.tipo)} (${numero(topTipo.desvios)} desvios).`);

  const riscos: string[] = [];
  if (deltaFpy < -5) riscos.push(`Queda de ${Math.abs(deltaFpy).toFixed(1).replace(".", ",")} p.p. no FPY semanal.`);
  if (deltaDesvios > 0) riscos.push(`Aumento de ${deltaDesvios} desvio(s) em relação à janela anterior.`);
  if (health.critical_count > 0) riscos.push(`Health-check registra ${health.critical_count} ocorrência(s) crítica(s).`);
  if (health.warning_count > 0) riscos.push(`Health-check registra ${health.warning_count} alerta(s) não crítico(s).`);
  if (!riscos.length) riscos.push("Nenhum agravamento estrutural relevante foi identificado nos agregados semanais.");

  const acoes = [
    topTipo
      ? `Priorizar revisão preventiva de ${texto(topTipo.tipo)} nas próximas inspeções.`
      : "Manter o acompanhamento do Pareto de desvios.",
    topEquipe
      ? `Validar a concentração em ${texto(topEquipe.equipe)} contra o volume produzido/auditado antes de concluir causa.`
      : "Comparar desvios por equipe/setor com o volume auditado.",
    health.warning_count > 0 || health.critical_count > 0
      ? "Revisar as evidências do Health-Check antes de qualquer auto-reparo ou alteração histórica."
      : "Manter o ciclo normal de Health-Check e observabilidade.",
  ];

  return {
    titulo: "Relatório Executivo Semanal de Qualidade",
    periodo: `${texto(r.inicio)} a ${texto(r.fim)}`,
    resumo_executivo: `Na janela semanal, o FPY ficou em ${percentual(atual.fpy)} com ${numero(atual.paredes)} paredes auditadas e ${desviosAtual} desvios. O estado do sistema no último Health-Check é ${health.status}, com integridade de ${health.integrity_percent}%.`,
    destaques,
    riscos,
    acoes,
    saude_sistema: `Health-Check ${health.status}: ${health.integrity_percent}% de integridade, ${health.critical_count} ocorrência(s) crítica(s), ${health.warning_count} alerta(s), verificado em ${health.checked_at}.`,
  };
}

export function digestParaTexto(digest: DigestExecutivo) {
  const bullets = (itens: string[]) => itens.map((item) => `- ${item}`).join("\n");
  return [
    `# ${digest.titulo}`,
    `Período: ${digest.periodo}`,
    "",
    "## Resumo executivo",
    digest.resumo_executivo,
    "",
    "## Destaques",
    bullets(digest.destaques),
    "",
    "## Riscos e pontos de atenção",
    bullets(digest.riscos),
    "",
    "## Ações recomendadas",
    bullets(digest.acoes),
    "",
    "## Saúde do sistema",
    digest.saude_sistema,
  ].join("\n");
}
