"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  alternarRecorte,
  aplicarRecortes,
  aplicarRecortesEmParedes,
  COLUNAS_DASH,
  hojeSaoPaulo,
  intervaloDe,
  PERIODOS,
  temRecorte,
  type CampoRecorte,
  type DatasEscolhidas,
  type LinhaDash,
  type ParedeConferida,
  type Periodo,
  type Recorte,
} from "@/lib/dashboard";
import BarraRecortes from "@/components/painel/BarraRecortes";
import { folhasDoPapel } from "@/components/TabBar";
import type { Role } from "@/lib/types";
import {
  carregarRegras,
  regraDoProjeto,
  REGRAS_PADRAO,
  type Regras,
} from "@/lib/regras";
import FolhaFpy from "./FolhaFpy";
import FolhaDesvios from "./FolhaDesvios";
import FolhaComparativos from "./FolhaComparativos";
import FolhaFluxo from "./FolhaFluxo";
import EscolhaDeDatas from "@/components/EscolhaDeDatas";

type Folha = "fpy" | "desvios" | "fluxo" | "comparativos";

export const PROJETO_CONSOLIDADO = "all";
export const ROTULO_PROJETO_CONSOLIDADO = "Todos os Projetos (Consolidado)";

const ROTULO_FOLHA: Record<Folha, string> = {
  fpy: "FPY",
  desvios: "Qualidade",
  fluxo: "Fluxo",
  comparativos: "Comparativos",
};

interface DadosIndicadores {
  paredes: ParedeConferida[];
  erros: LinhaDash[];
  projetos: string[];
  itensPorPainel: number;
  regras: Regras;
}

/*
 * Indicadores não usam o cache de 30 s da navegação. Esta base muda no chão
 * de fábrica enquanto a própria tela está aberta; um snapshot reaproveitado
 * fez as casas 149/150 existirem na Auditoria e ainda não aparecerem aqui.
 * A consulta é pequena para o volume atual e é refeita ao entrar/focar a aba.
 */
async function carregarDadosIndicadores(): Promise<DadosIndicadores> {
  const supabase = createClient();
  const [rp, re, rj, rt] = await Promise.all([
    supabase.from("fpy_paredes").select("*").limit(50000),
    supabase.from("ocorrencias").select(COLUNAS_DASH).limit(50000),
    supabase.from("projetos").select("nome").eq("ativo", true).order("ordem"),
    supabase.from("tipos_erro").select("id").eq("ativo", true).order("ordem"),
  ]);
  const falha = re.error ?? rp.error ?? rj.error ?? rt.error;
  if (falha) throw new Error("Erro ao carregar: " + falha.message);

  const projetos = [
    ...new Set(
      (rj.data ?? [])
        .map((p) => (p.nome as string).trim())
        .filter(Boolean)
    ),
  ];
  return {
    paredes: (rp.data ?? []) as ParedeConferida[],
    erros: (re.data ?? []) as LinhaDash[],
    projetos,
    itensPorPainel: (rt.data ?? []).length,
    regras: await carregarRegras(),
  };
}

export default function Indicadores({ role }: { role: Role }) {
  const folhasVisiveis = useMemo(
    () => folhasDoPapel(role).map((f) => f.id as Folha),
    [role]
  );
  const [projetos, setProjetos] = useState<string[]>([]);
  const [projeto, setProjeto] = useState(PROJETO_CONSOLIDADO);
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [datas, setDatas] = useState<DatasEscolhidas>({ de: "", ate: "" });
  const busca = useSearchParams();
  const pedida = busca.get("folha") as Folha | null;
  const folha: Folha =
    pedida && folhasVisiveis.includes(pedida) ? pedida : "fpy";

  const [tv, setTv] = useState(false);
  useEffect(() => {
    if (!tv) return;
    const sair = (e: KeyboardEvent) => e.key === "Escape" && setTv(false);
    document.body.classList.add("modo-tv");
    window.addEventListener("keydown", sair);
    return () => {
      document.body.classList.remove("modo-tv");
      window.removeEventListener("keydown", sair);
    };
  }, [tv]);

  const [recortes, setRecortes] = useState<Recorte[]>([]);
  const aoRecortar = useCallback((campo: CampoRecorte, valor: string) => {
    setRecortes((rs) => alternarRecorte(rs, campo, valor));
  }, []);
  const aceso = useCallback(
    (campo: CampoRecorte, valor: string) => temRecorte(recortes, campo, valor),
    [recortes]
  );

  const [paredes, setParedes] = useState<ParedeConferida[] | null>(null);
  const [erros, setErros] = useState<LinhaDash[]>([]);
  const [itensPorPainel, setItensPorPainel] = useState(0);
  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);
  const [erro, setErro] = useState("");

  const projetosAtivos = useMemo(() => new Set(projetos), [projetos]);
  const pertenceAoEscopo = useCallback(
    (nome: string | null | undefined) => {
      const normalizado = nome?.trim() ?? "";
      return projeto === PROJETO_CONSOLIDADO
        ? projetosAtivos.has(normalizado)
        : normalizado === projeto;
    },
    [projeto, projetosAtivos]
  );

  const hoje = useMemo(() => hojeSaoPaulo(), []);
  const intervalo = useMemo(
    () => intervaloDe(periodo, hoje, datas),
    [periodo, hoje, datas]
  );

  const carregar = useCallback(async () => {
    try {
      const dados = await carregarDadosIndicadores();
      setErro("");
      setParedes(dados.paredes);
      setErros(dados.erros);
      setItensPorPainel(dados.itensPorPainel);
      setProjetos(dados.projetos);
      setProjeto((p) =>
        p === PROJETO_CONSOLIDADO || dados.projetos.includes(p)
          ? p
          : PROJETO_CONSOLIDADO
      );
      setRegras(dados.regras);
    } catch (caught) {
      setErro(
        caught instanceof Error ? caught.message : "Erro ao carregar os indicadores."
      );
    }
  }, []);

  useEffect(() => {
    void carregar();

    const aoFocar = () => void carregar();
    const aoVisivel = () => {
      if (document.visibilityState === "visible") void carregar();
    };
    window.addEventListener("focus", aoFocar);
    document.addEventListener("visibilitychange", aoVisivel);
    return () => {
      window.removeEventListener("focus", aoFocar);
      document.removeEventListener("visibilitychange", aoVisivel);
    };
  }, [carregar]);

  const recorte = useMemo(() => {
    if (!paredes) return null;
    const { inicio, fim } = intervalo;
    const dentro = (d: string) =>
      (!inicio || d >= inicio) && (!fim || d <= fim);
    return {
      paredes: aplicarRecortesEmParedes(
        paredes.filter((p) => pertenceAoEscopo(p.projeto) && dentro(p.data)),
        recortes
      ),
      erros: aplicarRecortes(
        erros.filter((e) => pertenceAoEscopo(e.projeto) && dentro(e.data)),
        recortes
      ),
    };
  }, [paredes, erros, intervalo, recortes, pertenceAoEscopo]);

  const anoCorrente = useMemo(() => {
    if (!paredes) return null;
    const primeiroDeJaneiro = `${hoje.slice(0, 4)}-01-01`;
    const noAno = (d: string) => d >= primeiroDeJaneiro && d <= hoje;
    return {
      paredes: paredes.filter(
        (p) => pertenceAoEscopo(p.projeto) && noAno(p.data)
      ),
      erros: erros.filter(
        (e) => pertenceAoEscopo(e.projeto) && noAno(e.data)
      ),
    };
  }, [paredes, erros, hoje, pertenceAoEscopo]);

  const doProjeto = useMemo(
    () => (paredes ?? []).filter((p) => pertenceAoEscopo(p.projeto)),
    [paredes, pertenceAoEscopo]
  );

  const regra = useMemo(
    () =>
      regraDoProjeto(
        regras,
        projeto === PROJETO_CONSOLIDADO ? null : projeto
      ),
    [regras, projeto]
  );
  const regraPorProjeto = useCallback(
    (nome: string) => regraDoProjeto(regras, nome),
    [regras]
  );
  const escopoRotulo =
    projeto === PROJETO_CONSOLIDADO ? "todos os projetos" : projeto;

  if (erro)
    return (
      <div className="tela">
        <p className="ind-erro">{erro}</p>
      </div>
    );
  if (!recorte)
    return (
      <div className="tela">
        <p className="text-sm text-ink-3">Carregando…</p>
      </div>
    );

  return (
    <div className="tela ind-tela">
      {tv && (
        <button
          type="button"
          onClick={() => setTv(false)}
          className="btn ind-tv-sai"
          title="Sair do modo TV (Esc)"
        >
          ✕ Sair do modo TV
        </button>
      )}
      <div className="ind-topo">
        <div className="ind-topo-linha">
          <h1 className="ind-titulo">Indicadores</h1>
          <select
            className="campo ind-projeto"
            value={projeto}
            onChange={(e) => setProjeto(e.target.value)}
            aria-label="Projeto"
          >
            <option value={PROJETO_CONSOLIDADO}>
              {ROTULO_PROJETO_CONSOLIDADO}
            </option>
            {projetos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="ind-periodos" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              type="button"
              title={p.dica}
              aria-pressed={periodo === p.valor}
              onClick={() => setPeriodo(p.valor)}
            >
              {p.rotulo}
            </button>
          ))}
          {periodo === "custom" && (
            <EscolhaDeDatas
              de={datas.de}
              ate={datas.ate}
              max={hoje}
              aoEscolher={(de, ate) => setDatas({ de, ate })}
            />
          )}
          <span className="ind-resumo">{descrever(periodo, intervalo)}</span>
          <button
            type="button"
            onClick={() => setTv(true)}
            className="btn ind-tv-liga"
            title="Modo TV: só os gráficos, sem menus nem filtros"
          >
            Modo TV
          </button>
        </div>

        {recortes.length > 0 && (
          <div className="ind-periodos ind-recortes">
            <BarraRecortes
              recortes={recortes}
              aoRemover={(r) => aoRecortar(r.campo, r.valor)}
              aoLimpar={() => setRecortes([])}
              resultado={recorte.erros.length}
            />
          </div>
        )}

        {folhasVisiveis.length > 1 && (
          <nav className="ind-abas ind-abas-celular" role="tablist">
            {folhasVisiveis.map((f) => (
              <Link
                key={f}
                href={`/indicadores?folha=${f}`}
                role="tab"
                aria-selected={folha === f}
                scroll={false}
              >
                {ROTULO_FOLHA[f]}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {folha === "fpy" && (
        <FolhaFpy
          paredes={recorte.paredes}
          erros={recorte.erros}
          paredesDoAno={anoCorrente?.paredes ?? []}
          paredesDoProjeto={doProjeto}
          mesSelecionado={(intervalo.fim ?? hoje).slice(0, 7)}
          ano={hoje.slice(0, 4)}
          periodoRotulo={descrever(periodo, intervalo)}
          escopoRotulo={escopoRotulo}
          consolidado={projeto === PROJETO_CONSOLIDADO}
          regra={regra}
          regraPorProjeto={regraPorProjeto}
          meta={regras.meta}
          limiteRegra={regra.minParedesAfetadas}
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      )}
      {folha === "desvios" && (
        <FolhaDesvios
          paredes={recorte.paredes}
          erros={recorte.erros}
          regra={regra}
          regraPorProjeto={regraPorProjeto}
          mostrarProjeto={projeto === PROJETO_CONSOLIDADO}
          itensPorPainel={itensPorPainel}
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      )}
      {folha === "fluxo" && (
        <FolhaFluxo paredes={recorte.paredes} erros={recorte.erros} />
      )}
      {folha === "comparativos" && (
        <FolhaComparativos
          paredes={recorte.paredes}
          erros={recorte.erros}
          regra={regra}
          regraPorProjeto={regraPorProjeto}
          hoje={hoje}
          aoRecortar={aoRecortar}
          aceso={aceso}
        />
      )}
    </div>
  );
}

const dataBR = (d: string) => d.split("-").reverse().join("/");

function descrever(
  periodo: Periodo,
  i: { inicio: string | null; fim: string | null }
) {
  if (periodo === "tudo") return "toda a base";
  if (!i.inicio && !i.fim) return "sem corte de data";
  if (i.inicio && i.inicio === i.fim) return dataBR(i.inicio);
  if (i.inicio && i.fim) return `${dataBR(i.inicio)} a ${dataBR(i.fim)}`;
  return i.inicio ? `de ${dataBR(i.inicio)}` : `até ${dataBR(i.fim!)}`;
}
