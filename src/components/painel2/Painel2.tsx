"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  COLUNAS_DASH,
  PERIODOS,
  hojeSaoPaulo,
  intervaloDe,
  ordemNaturalCasa,
  rotuloIntervalo,
  type DatasEscolhidas,
  type LinhaDash,
  type ParedeConferida,
  type Periodo,
} from "@/lib/dashboard";
import {
  aplicarRecorte2,
  aplicarRegraDaCasa,
  casasComFpyZero,
  coberturaInspecao,
  contarPorCriticidade,
  descreverRecorte,
  estadoDasParedes,
  fpyPorCasa,
  fpyPorSemana,
  recorteVazio,
  resumoPorCasa,
  resumoPorPosicao,
  resumoProjeto,
  retrabalhosPorDia,
  retrabalhosPorSemana,
  tiposDoRecorte,
  topCasasCriticas,
  topPorCriticidade,
  META,
  type EstadoParede,
  type Recorte2,
} from "@/lib/painel2";
import {
  carregarRegras,
  regraDoProjeto,
  REGRAS_PADRAO,
  type Regras,
} from "@/lib/regras";
import type { Role } from "@/lib/types";
import LogoTecverde from "@/components/LogoTecverde";
import BotaoTema from "@/components/BotaoTema";
import NomeSistema from "@/components/NomeSistema";
import Numeros from "./Numeros";
import Diretoria from "./Diretoria";
import EvolucaoFpy from "./EvolucaoFpy";
import {
  CasasCriticas,
  COR_CRITICIDADE,
  RetrabalhosNoTempo,
  TopRanking,
} from "./Rankings";
import Progresso from "./Progresso";
import Casas from "./Casas";
import Posicoes from "./Posicoes";
import Relatorio from "./Relatorio";

const RECARGA_SEGURANCA_MS = 300_000;

const LINKS: { href: string; rotulo: string; papeis: Role[] }[] = [
  { href: "/auditoria", rotulo: "Auditoria", papeis: ["operador", "gestao"] },
  {
    href: "/consultar",
    rotulo: "Consultar",
    papeis: ["operador", "consultor", "gestao"],
  },
  { href: "/indicadores", rotulo: "Indicadores", papeis: ["gestao"] },
  { href: "/historico", rotulo: "Histórico", papeis: ["gestao"] },
  { href: "/configuracoes", rotulo: "Config.", papeis: ["gestao"] },
];

/*
 * PAINEL 2.0 — a tela desce do macro ao micro, nesta ordem:
 *   1. quatro números          o projeto está bem ou mal?
 *   2. execução do projeto     quanto já foi resolvido?
 *   3. casas                   qual casa está travando?
 *   4. posições de parede      onde está o gargalo?
 *   5. relatório de erros      que problema é, exatamente?
 *
 * O projeto é SEMPRE um só. Projetos têm número de paredes diferente, e
 * somar dois deles produziria um FPY que não descreve nenhuma fábrica.
 * Por isso o seletor não tem "todos".
 */
/**
 * @param embutido true quando o painel e uma FOLHA de Indicadores em vez
 * de tela propria. Nesse modo ele nao desenha cabecalho nem barra de
 * filtro — quem manda no projeto e no periodo e a tela de fora — e o
 * modo TV some, porque nao existe TV dentro de aba.
 */
export default function Painel2({
  role,
  embutido = false,
  projetoExterno,
  intervaloExterno,
}: {
  role: Role;
  embutido?: boolean;
  projetoExterno?: string | null;
  intervaloExterno?: { inicio: string | null; fim: string | null };
}) {
  const [projetoLocal, setProjeto] = useState<string | null>(null);
  const projeto = embutido ? projetoExterno ?? null : projetoLocal;
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [datas, setDatas] = useState<DatasEscolhidas>({ de: "", ate: "" });
  const [recorte, setRecorte] = useState<Recorte2>({});

  const [linhas, setLinhas] = useState<LinhaDash[] | null>(null);
  const [paredes, setParedes] = useState<ParedeConferida[]>([]);
  // quantas paredes cada casa do projeto deveria ter, da tela de Config.
  const [paredesPorProjeto, setParedesPorProjeto] = useState<
    Record<string, number>
  >({});
  // regras de negócio editáveis pela gestão em Configurações
  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);
  const [meta, setMeta] = useState(META.fpy);
  const [erro, setErro] = useState("");
  const [atualizado, setAtualizado] = useState("");
  const [aoVivo, setAoVivo] = useState(false);
  const [tv, setTv] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  /* O painel mostra UM projeto por vez, então a regra dele vale para a
     tela inteira. Projetos com casas de tamanhos diferentes não dividem
     a mesma regra de zeramento — ver migration 022. */
  const regra = useMemo(
    () => regraDoProjeto(regras, projeto),
    [regras, projeto]
  );

  const hoje = useMemo(() => hojeSaoPaulo(), []);
  const intervaloLocal = useMemo(
    () => intervaloDe(periodo, hoje, datas),
    [periodo, hoje, datas]
  );
  const intervalo = embutido && intervaloExterno ? intervaloExterno : intervaloLocal;
  const { inicio, fim } = intervalo;

  const carregar = useCallback(
    async (inicio: string | null, fim: string | null) => {
      const supabase = createClient();
      let q = supabase.from("ocorrencias").select(COLUNAS_DASH).limit(20000);
      let qf = supabase.from("fpy_paredes").select("*").limit(30000);
      if (inicio) {
        q = q.gte("data", inicio);
        qf = qf.gte("data", inicio);
      }
      if (fim) {
        q = q.lte("data", fim);
        qf = qf.lte("data", fim);
      }
      const [re, rp] = await Promise.all([q, qf]);
      if (re.error) {
        setErro("Erro ao carregar: " + re.error.message);
        return;
      }
      setErro("");
      setLinhas((re.data ?? []) as LinhaDash[]);
      setParedes((rp.data ?? []) as ParedeConferida[]);
      setAtualizado(
        new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date())
      );
    },
    []
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca de rede; o estado só muda depois do await
    carregar(inicio, fim);
  }, [inicio, fim, carregar]);

  // o denominador da cobertura: paredes cadastradas de cada projeto
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      /* A base legada expõe projetos e paredes por views compatíveis, sem
         uma FK Postgres entre elas. Consultar uma relação embutida aqui
         fazia o painel falhar mesmo quando as duas listas existiam. */
      const [{ data: projetos }, { data: paredes }] = await Promise.all([
        supabase.from("projetos").select("id, nome").eq("ativo", true),
        supabase.from("paredes").select("projeto_id").eq("ativo", true),
      ]);
      const mapa: Record<string, number> = {};
      const quantidadePorProjeto = new Map<number, number>();
      for (const parede of paredes ?? []) {
        const projetoId = Number(parede.projeto_id);
        quantidadePorProjeto.set(
          projetoId,
          (quantidadePorProjeto.get(projetoId) ?? 0) + 1
        );
      }
      for (const p of projetos ?? []) {
        mapa[p.nome.trim()] = quantidadePorProjeto.get(Number(p.id)) ?? 0;
      }
      setParedesPorProjeto(mapa);

      /* Uma função só para as três telas que mostram FPY — foi assim que
         a divergência da casa 142 apareceu e foi corrigida. */
      const r = await carregarRegras();
      setRegras(r);
      setMeta(r.meta);
    })();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout>;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let vivo = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (!vivo) return;
      canal = supabase
        .channel("painel2-ocorrencias")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ocorrencias" },
          () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => carregar(inicio, fim), 800);
          }
        )
        .subscribe((s) => setAoVivo(s === "SUBSCRIBED"));
    })();
    const relogio = setInterval(
      () => carregar(inicio, fim),
      RECARGA_SEGURANCA_MS
    );
    return () => {
      vivo = false;
      clearTimeout(debounce);
      clearInterval(relogio);
      if (canal) supabase.removeChannel(canal);
    };
  }, [inicio, fim, carregar]);

  async function alternarTv() {
    const alvo = raiz.current;
    if (!alvo) return;
    try {
      if (!document.fullscreenElement) {
        await alvo.requestFullscreen();
        setTv(true);
      } else {
        await document.exitFullscreen();
        setTv(false);
      }
    } catch {
      setTv((v) => !v);
    }
  }

  useEffect(() => {
    const sair = () => {
      if (!document.fullscreenElement) setTv(false);
    };
    document.addEventListener("fullscreenchange", sair);
    return () => document.removeEventListener("fullscreenchange", sair);
  }, []);

  /* ---------------- projetos disponíveis ---------------- */
  const projetos = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhas ?? []) if (l.projeto?.trim()) s.add(l.projeto.trim());
    for (const p of paredes) if (p.projeto?.trim()) s.add(p.projeto.trim());
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [linhas, paredes]);

  // o projeto com mais paredes conferidas é o que a fábrica está rodando
  useEffect(() => {
    if (embutido || projetoLocal !== null || projetos.length === 0) return;
    const contagem = new Map<string, number>();
    for (const p of paredes)
      contagem.set(p.projeto, (contagem.get(p.projeto) ?? 0) + 1);
    const maior = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- escolha inicial, uma vez só
    setProjeto(maior ?? projetos[0]);
  }, [embutido, projetoLocal, projetos, paredes]);

  const dados = useMemo(() => {
    if (!linhas || !projeto) return null;
    const errosDoProjeto = linhas.filter((l) => l.projeto?.trim() === projeto);
    const paredesDoProjeto = paredes.filter((p) => p.projeto?.trim() === projeto);

    // a casa recorta os dois lados; assim o FPY da casa não mente
    const filtroCasa = recorte.casa
      ? (c: string) => c.trim() === recorte.casa
      : () => true;
    /* A regra da casa precisa enxergar a casa INTEIRA, então é aplicada
       sobre as paredes do projeto antes de qualquer recorte — senão
       filtrar uma parede mudaria a contagem de erros da casa e a casa
       deixaria de ser penalizada. */
    const todasComRegra = aplicarRegraDaCasa(
      estadoDasParedes(paredesDoProjeto, errosDoProjeto),
      regra
    );
    const pe = todasComRegra.filter((p) => filtroCasa(p.casa));
    const errosNoEscopo = errosDoProjeto.filter((e) => filtroCasa(e.casa));

    const doRecorte = aplicarRecorte2(errosNoEscopo, recorte, pe);
    const casas = resumoPorCasa(todasComRegra);
    return {
      projetoResumo: resumoProjeto(pe),
      casas,
      posicoes: resumoPorPosicao(pe, errosNoEscopo),
      errosDoRecorte: doRecorte,
      tipos: tiposDoRecorte(doRecorte),
      // leitura da diretoria
      criticidade: contarPorCriticidade(errosNoEscopo),
      cobertura: coberturaInspecao(pe, paredesPorProjeto[projeto] ?? 12),
      casasZeradas: casasComFpyZero(casas).length,
      fpySemanas: fpyPorSemana(pe),
      fpyCasas: fpyPorCasa(pe),
      dias: retrabalhosPorDia(errosNoEscopo),
      semanasRetrabalho: retrabalhosPorSemana(errosNoEscopo),
      casasCriticas: topCasasCriticas(pe, errosNoEscopo),
      tiposCriticos: topPorCriticidade(errosNoEscopo, "tipo_erro", "CRITICO"),
      tiposMedios: topPorCriticidade(errosNoEscopo, "tipo_erro", "MEDIO"),
      setoresCriticos: topPorCriticidade(errosNoEscopo, "setor", "CRITICO"),
      setoresMedios: topPorCriticidade(errosNoEscopo, "setor", "MEDIO"),
      casasDisponiveis: [
        ...new Set(paredesDoProjeto.map((p) => p.casa.trim()).filter(Boolean)),
      ].sort((a, b) => ordemNaturalCasa(b, a)),
    };
  }, [linhas, paredes, projeto, recorte, paredesPorProjeto, regra]);

  const mudarRecorte = (novo: Partial<Recorte2>) =>
    setRecorte((r) => {
      const v = { ...r, ...novo };
      // clicar de novo no mesmo alvo desfaz
      for (const k of Object.keys(novo) as (keyof Recorte2)[])
        if (r[k] === novo[k]) delete v[k];
      return v;
    });

  return (
    <div ref={raiz} className={`pn ${tv ? "tv" : ""} ${embutido ? "embutido" : ""}`}>
      {/* Embutido em Indicadores, quem desenha o topo e a tela de
          fora: dois cabecalhos empilhados seria so ruido. */}
      {!embutido && (
        <header className="pn-topo">
          <span className="flex min-w-0 items-center gap-2">
            <LogoTecverde />
            <NomeSistema />
          </span>

          <span
            className={`vivo mono ${aoVivo ? "" : "parado"}`}
            title={
              aoVivo
                ? "Conectado ao banco: a tela se atualiza sozinha"
                : "Sem conexão ao vivo — atualizando a cada 5 minutos"
            }
          >
            <i />
            {/* no celular sobra o ponto verde e a hora: a palavra custa
                65 px, que e o espaco de que o nome do sistema precisa */}
            <span className="hidden sm:inline">
              {aoVivo ? "AO VIVO" : "RECONECTANDO"}
              {atualizado && " · "}
            </span>
            {atualizado}
          </span>

          <nav className="esconde-tv hidden items-center gap-1 lg:flex">
            {LINKS.filter((l) => l.papeis.includes(role)).map((l) => (
              <Link key={l.href} href={l.href} className="btn">
                {l.rotulo}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <BotaoTema />
            <button className="btn hidden lg:block" onClick={alternarTv}>
              {tv ? "Sair do modo TV" : "Modo TV"}
            </button>
          </div>
        </header>
      )}

      {/* projeto e periodo vem da tela de fora quando embutido */}
      {!embutido && (
        <div className="pn-barra">
          {/* projeto primeiro: é o escopo de tudo o que vem depois */}
          <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
            projeto
            <select
              value={projeto ?? ""}
              onChange={(e) => {
                setProjeto(e.target.value);
                setRecorte({});
              }}
              className="campo"
              style={{
                width: "auto",
                padding: "6px 30px 6px 9px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {projetos.length === 0 && <option value="">—</option>}
              {projetos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
            casa
            <select
              value={recorte.casa ?? ""}
              onChange={(e) =>
                setRecorte((r) => ({ ...r, casa: e.target.value || undefined }))
              }
              className="campo"
              style={{ width: "auto", padding: "6px 30px 6px 9px", fontSize: 13 }}
            >
              <option value="">
                Todas
                {dados ? ` (${dados.casasDisponiveis.length})` : ""}
              </option>
              {dados?.casasDisponiveis.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <div className="segm rolar">
            {PERIODOS.map((p) => (
              <button
                key={p.valor}
                className={periodo === p.valor ? "on" : ""}
                onClick={() => setPeriodo(p.valor)}
                title={p.dica}
              >
                {p.rotulo}
              </button>
            ))}
          </div>

          {periodo === "custom" && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
                de
                <input
                  type="date"
                  value={datas.de}
                  max={datas.ate || hoje}
                  onChange={(e) => setDatas((d) => ({ ...d, de: e.target.value }))}
                  className="campo"
                  style={{ width: 150, padding: "6px 9px", fontSize: 13 }}
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
                até
                <input
                  type="date"
                  value={datas.ate}
                  min={datas.de || undefined}
                  onChange={(e) =>
                    setDatas((d) => ({ ...d, ate: e.target.value }))
                  }
                  className="campo"
                  style={{ width: 150, padding: "6px 9px", fontSize: 13 }}
                />
              </label>
            </div>
          )}

          <span
            className={`num text-[11px] text-ink-3 ${
              periodo === "custom" ? "" : "hidden lg:inline"
            }`}
          >
            {rotuloIntervalo(intervalo)}
          </span>

          {!recorteVazio(recorte) && (
            <button
              className="recorte"
              onClick={() => setRecorte({})}
              title="Limpar o recorte"
            >
              {descreverRecorte(recorte)}
              <span className="x" aria-hidden>
                ×
              </span>
            </button>
          )}
        </div>
      )}

      {erro && (
        <p
          className="px-4 py-8 text-center text-sm"
          style={{ color: "var(--color-alta)" }}
        >
          {erro}
        </p>
      )}

      {!erro && !dados && (
        <p
          className="px-4 py-8 text-center text-sm"
          style={{ color: "var(--color-ink-3)" }}
        >
          Carregando…
        </p>
      )}

      {!erro && dados && (
        <div className="pn2-grade">
          <Numeros
            r={dados.projetoResumo}
            regra={regra}
            meta={meta}
            aoVerEmRetrabalho={() =>
              mudarRecorte({ estado: "EM_RETRABALHO" })
            }
          />

          <Progresso
            r={dados.projetoResumo}
            estadoAtivo={recorte.estado}
            aoEscolher={(e: EstadoParede) => mudarRecorte({ estado: e })}
          />

          <Diretoria
            r={dados.projetoResumo}
            crit={dados.criticidade}
            cobertura={dados.cobertura}
            casasZeradas={dados.casasZeradas}
            criticidadeAtiva={recorte.criticidade}
            aoFiltrarCriticidade={(c) => mudarRecorte({ criticidade: c })}
          />

          <EvolucaoFpy
            semanas={dados.fpySemanas}
            casas={dados.fpyCasas}
            casaAtiva={recorte.casa}
            aoEscolherCasa={(casa) => mudarRecorte({ casa })}
          />

          <RetrabalhosNoTempo
            dias={dados.dias}
            semanas={dados.semanasRetrabalho}
            total={dados.criticidade.total}
          />

          <CasasCriticas
            casas={dados.casasCriticas}
            casaAtiva={recorte.casa}
            aoEscolher={(casa) => mudarRecorte({ casa })}
          />

          <div className="pn2-par">
            <TopRanking
              titulo="Top 5 erros críticos"
              subtitulo="Itens de inspeção que mais geram erro crítico"
              itens={dados.tiposCriticos.itens}
              outros={dados.tiposCriticos.outros}
              total={dados.tiposCriticos.total}
              cor={COR_CRITICIDADE.CRITICO}
              ativo={recorte.tipo}
              aoEscolher={(t) => mudarRecorte({ tipo: t })}
            />
            <TopRanking
              titulo="Top 5 erros médios"
              subtitulo="Itens de inspeção de gravidade média"
              itens={dados.tiposMedios.itens}
              outros={dados.tiposMedios.outros}
              total={dados.tiposMedios.total}
              cor={COR_CRITICIDADE.MEDIO}
              ativo={recorte.tipo}
              aoEscolher={(t) => mudarRecorte({ tipo: t })}
            />
            <TopRanking
              titulo="Setores com mais erros críticos"
              subtitulo="Setor onde o erro foi detectado"
              itens={dados.setoresCriticos.itens}
              outros={dados.setoresCriticos.outros}
              total={dados.setoresCriticos.total}
              cor={COR_CRITICIDADE.CRITICO}
              ativo={recorte.setor}
              aoEscolher={(s) => mudarRecorte({ setor: s })}
            />
            <TopRanking
              titulo="Setores com mais erros médios"
              subtitulo="Setor onde o erro foi detectado"
              itens={dados.setoresMedios.itens}
              outros={dados.setoresMedios.outros}
              total={dados.setoresMedios.total}
              cor={COR_CRITICIDADE.MEDIO}
              ativo={recorte.setor}
              aoEscolher={(s) => mudarRecorte({ setor: s })}
            />
          </div>

          <Casas
            casas={dados.casas}
            casaAtiva={recorte.casa}
            aoEscolherCasa={(casa) => mudarRecorte({ casa })}
            aoEscolherEstado={(casa, estado) =>
              setRecorte((r) => ({ ...r, casa, estado }))
            }
          />

          <Posicoes
            posicoes={dados.posicoes}
            paredeAtiva={recorte.parede}
            aoEscolher={(parede) => mudarRecorte({ parede })}
          />

          <Relatorio
            erros={dados.errosDoRecorte}
            tipos={dados.tipos}
            recorte={recorte}
            aoFiltrarTipo={(tipo) => mudarRecorte({ tipo })}
            aoLimpar={() => setRecorte({})}
          />
        </div>
      )}
    </div>
  );
}
