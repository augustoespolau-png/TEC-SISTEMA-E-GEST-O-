export type SeveridadeDiagnostico = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";

export type ExemploDiagnostico = Record<string, unknown>;

export type IssueDiagnostico = {
  code: string;
  severity: SeveridadeDiagnostico;
  count: number;
  message: string;
  auto_repair_safe: boolean;
  missing_wall_count?: number;
  examples: ExemploDiagnostico[];
};

export type HealthDiagnostico = {
  versao: number;
  checked_at: string;
  status: "SAUDAVEL" | "ATENCAO" | "CRITICO";
  integrity_percent: number;
  critical_count: number;
  warning_count: number;
  anomaly_count: number;
  totals: {
    auditorias: number;
    paredes_no_esqueleto: number;
    paredes_inspecionadas: number;
    desvios: number;
    fpy_rows: number;
    na_itens: number;
  };
  metrics: {
    orphan_deviations: number;
    orphan_attachments: number;
    duplicate_relational_walls: number;
    duplicate_canonical_walls: number;
    duplicate_quality_logs: number;
    incomplete_houses: number;
    missing_required_walls: number;
    fpy_inconsistencies: number;
    temporal_anomalies: number;
  };
  issues: IssueDiagnostico[];
};

export type ProblemaIaDiagnostica = {
  codigo: string;
  criticidade: "CRITICA" | "ALTA" | "MEDIA" | "BAIXA";
  causa_raiz: string;
  impacto: string;
  acao_recomendada: string;
  reparo_seguro_disponivel: boolean;
  repair_code: string;
  comando_sugerido: string;
};

export type RelatorioIaDiagnostica = {
  resumo: string;
  criticidade_geral: "SAUDAVEL" | "ATENCAO" | "CRITICO";
  problemas: ProblemaIaDiagnostica[];
};

const CAUSAS: Record<string, { causa: string; impacto: string; acao: string }> = {
  ORPHAN_DEVIATIONS: {
    causa: "Há desvio relacional apontando para uma auditoria/parede que não existe mais.",
    impacto: "Pode quebrar rastreabilidade, consultas e reconciliações do histórico.",
    acao: "Revisar a origem do desvio e reconciliar com a auditoria correta antes de qualquer exclusão.",
  },
  ORPHAN_ATTACHMENTS: {
    causa: "Metadados de anexos permaneceram após tentativas ou desvios que não estão mais no relacional.",
    impacto: "Não altera FPY, mas pode deixar metadados e arquivos sem vínculo funcional.",
    acao: "Revisar os arquivos órfãos e decidir entre reanexar ao desvio correto ou limpar metadados/Storage com backup.",
  },
  DUPLICATE_WALLS: {
    causa: "A mesma combinação projeto/casa/parede aparece mais de uma vez no estado canônico ou relacional.",
    impacto: "Pode duplicar indicadores, eventos de auditoria e contagens por parede.",
    acao: "Comparar os registros duplicados e consolidar somente após identificar qual é a fonte de verdade.",
  },
  DUPLICATE_QUALITY_LOGS: {
    causa: "Existem eventos de histórico semanticamente idênticos no mesmo instante.",
    impacto: "Polui a trilha de auditoria e pode distorcer métricas baseadas em eventos.",
    acao: "Validar se os eventos são repetição técnica ou ações distintas antes de remover qualquer linha.",
  },
  SKELETON_MISSING_WALLS: {
    causa: "A casa foi criada com menos paredes no estado canônico do que o cadastro atual do projeto exige.",
    impacto: "A auditoria pode deixar de oferecer paredes obrigatórias e ficar estruturalmente incompleta.",
    acao: "Usar o reparo transacional allowlisted para acrescentar somente paredes pendentes, preservando as existentes.",
  },
  FPY_INCONSISTENCY: {
    causa: "A projeção de FPY não corresponde à parede inspecionada, à data ou à contagem real de desvios.",
    impacto: "Pode alterar FPY diário, semanal, mensal e consolidado.",
    acao: "Interromper correções manuais e reconciliar primeiro parede, ocorrência e origem canônica.",
  },
  TEMPORAL_ANOMALY: {
    causa: "Há inspeção registrada antes da data de criação da própria casa.",
    impacto: "Compromete a cronologia e filtros por período.",
    acao: "Conferir a fonte histórica da data antes de ajustar qualquer registro.",
  },
};

export function criarRelatorioDeterministico(
  health: HealthDiagnostico
): RelatorioIaDiagnostica {
  const ativos = health.issues.filter((issue) => Number(issue.count) > 0);

  return {
    resumo:
      ativos.length === 0
        ? "Nenhuma anomalia estrutural foi detectada no health-check atual."
        : `O health-check encontrou ${health.anomaly_count} ocorrência(s) distribuída(s) em ${ativos.length} categoria(s). O motor determinístico manteve qualquer reparo destrutivo bloqueado.`,
    criticidade_geral: health.status,
    problemas: ativos.map((issue) => {
      const base = CAUSAS[issue.code] ?? {
        causa: issue.message,
        impacto: "Requer revisão técnica para estimar o impacto.",
        acao: "Revisar o exemplo retornado pelo health-check antes de alterar dados.",
      };
      const reparavel =
        issue.code === "SKELETON_MISSING_WALLS" && issue.auto_repair_safe;
      return {
        codigo: issue.code,
        criticidade: issue.severity,
        causa_raiz: base.causa,
        impacto: base.impacto,
        acao_recomendada: base.acao,
        reparo_seguro_disponivel: reparavel,
        repair_code: reparavel ? "SKELETON_MISSING_WALLS" : "",
        comando_sugerido: reparavel
          ? "POST /api/diagnostico com action=repair. O servidor valida o alvo, cria backup e chama somente a rotina allowlisted."
          : "Sem auto-reparo: revisar a evidência e aplicar correção dirigida somente após validação da fonte de verdade.",
      };
    }),
  };
}
