import Link from "next/link";
import type { Kpis } from "@/lib/dashboard";
import { PRAZO_HORAS, type Role } from "@/lib/types";

export default function BarraKpis({ kpis, role }: { kpis: Kpis; role?: Role }) {
  return (
    <>
      {/* A gestão é a única que aprova: se a fila não a procurar, o
          retrabalho fica parado sem ninguém notar. */}
      {role === "gestao" && kpis.pendentesAprovacao > 0 && (
        <Link
          href="/consultar"
          className="cartao mb-2.5 block"
          style={{
            borderColor: "var(--color-espera)",
            background:
              "color-mix(in srgb, var(--color-espera) 7%, var(--color-papel))",
          }}
        >
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0">
              <span
                className="block text-[13.5px] font-bold"
                style={{ color: "var(--color-espera)" }}
              >
                {kpis.pendentesAprovacao}{" "}
                {kpis.pendentesAprovacao === 1
                  ? "retrabalho aguarda sua aprovação"
                  : "retrabalhos aguardam sua aprovação"}
              </span>
              <span className="sub block">
                Até você aprovar, eles não contam como resolvidos em nenhum
                indicador desta tela.
              </span>
            </span>
            <span className="btn btn-forte shrink-0">Abrir a fila</span>
          </span>
        </Link>
      )}
      <div className="kpis">
        <Kpi
          rotulo="Aguardando"
          valor={kpis.aguardando}
          cor="var(--color-media)"
          detalhe={`dentro do prazo de ${PRAZO_HORAS} h`}
        />
        <Kpi
          rotulo="Aguardando aprovação"
          valor={kpis.pendentesAprovacao}
          cor="var(--color-espera)"
          detalhe="retrabalho feito, falta a gestão aprovar"
        />
        <Kpi
          rotulo="Sem devolutiva"
          valor={kpis.naoConformidades}
          cor="var(--color-alta)"
          detalhe={`passaram de ${PRAZO_HORAS} h sem retrabalho`}
        />
        <Kpi
          rotulo="Críticas em aberto"
          valor={kpis.criticosEmAberto}
          cor="var(--color-alta)"
          detalhe={
            kpis.bloqueadas > 0
              ? `${kpis.bloqueadas} parede${kpis.bloqueadas > 1 ? "s" : ""} bloqueada${kpis.bloqueadas > 1 ? "s" : ""}`
              : "nenhuma parede bloqueada"
          }
        />
        <Kpi
          rotulo="Retrabalhadas"
          valor={kpis.retrabalhadasPeriodo}
          cor="var(--color-baixa)"
          detalhe="no período"
        />
        <Kpi
          rotulo="Taxa de resolução"
          valor={kpis.taxaResolucao}
          sufixo="%"
          detalhe={`${kpis.retrabalhadasPeriodo} de ${kpis.totalPeriodo}`}
        />
        <Kpi
          rotulo="Tempo de retrabalho"
          valor={kpis.tempoMedianoRetrabalho}
          sufixo=" d"
          detalhe="mediana registro→conclusão"
        />
        <Kpi
          rotulo="Em aberto há mais"
          valor={kpis.maisAntigoDias}
          sufixo=" d"
          cor={
            kpis.maisAntigoDias !== null && kpis.maisAntigoDias > 14
              ? "var(--color-alta)"
              : undefined
          }
          detalhe="o registro mais antigo sem solução"
        />
        <Kpi
          rotulo="Casa resolvida em"
          valor={kpis.medianaCasaCompleta}
          sufixo=" d"
          detalhe="mediana 1º desvio→zerar"
        />
      </div>
    </>
  );
}

function Kpi({
  rotulo,
  valor,
  sufixo,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: number | null;
  sufixo?: string;
  detalhe?: string;
  cor?: string;
}) {
  const vazio = valor === null;
  return (
    <div className="kpi">
      <div className="r">{rotulo}</div>
      <div
        className="v mono"
        style={{ color: vazio || valor === 0 ? "var(--color-ink-3)" : cor }}
      >
        {vazio ? "—" : valor.toLocaleString("pt-BR")}
        {!vazio && sufixo && <small>{sufixo}</small>}
      </div>
      <div className="d">{vazio ? "aguardando dados" : detalhe}</div>
    </div>
  );
}
