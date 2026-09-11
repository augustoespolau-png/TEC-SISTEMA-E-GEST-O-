"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STATUS_ABERTOS, STATUS_NAO_RESOLVIDOS, type Role } from "@/lib/types";
import {
  COLUNAS_DASH,
  PERIODOS,
  alternarRecorte,
  aplicarRecortes,
  aplicarRecortesEmParedes,
  calcularFpy,
  calcularKpis,
  contagemPorSetor,
  definirRecorte,
  densidadeErros,
  diagnosticoPorParede,
  opcoesDeRecorte,
  fpySemanal,
  eficienciaPorCampo,
  evolucaoSetores,
  faixasIdade,
  filaPrioritaria,
  fluxoSemanal,
  hojeSaoPaulo,
  intervaloDe,
  mapaSetorTipo,
  paretoTipos,
  rotuloIntervalo,
  situacaoCasas,
  temRecorte,
  tempoRetrabalhoPorSetor,
  tendenciaSemanal,
  valorDoRecorte,
  type CampoRecorte,
  type DatasEscolhidas,
  type LinhaDash,
  type ParedeConferida,
  type Periodo,
  type Recorte,
} from "@/lib/dashboard";
import LogoTecverde from "@/components/LogoTecverde";
import BotaoTema from "@/components/BotaoTema";
import NomeSistema from "@/components/NomeSistema";
import BarraKpis from "@/components/painel/BarraKpis";
import BarraRecortes from "@/components/painel/BarraRecortes";
import GraficoFluxo from "@/components/painel/GraficoFluxo";
import GraficoTendencia from "@/components/painel/GraficoTendencia";
import TempoRetrabalho from "@/components/painel/TempoRetrabalho";
import IdadePendencias from "@/components/painel/IdadePendencias";
import TabelaCasas from "@/components/painel/TabelaCasas";
import FilaPendencias from "@/components/painel/FilaPendencias";
import GraficoPareto from "@/components/painel/GraficoPareto";
import GraficoEficiencia from "@/components/painel/GraficoEficiencia";
import MapaCalor from "@/components/painel/MapaCalor";
import EvolucaoSetores from "@/components/painel/EvolucaoSetores";
import CartaoFpy from "@/components/painel/CartaoFpy";
import CartaoDensidade from "@/components/painel/CartaoDensidade";
import DiagnosticoParedes from "@/components/painel/DiagnosticoParedes";
import VolumeSetores from "@/components/painel/VolumeSetores";

const RECARGA_SEGURANCA_MS = 300_000;

const LINKS: { href: string; rotulo: string; papeis: Role[] }[] = [
  { href: "/auditoria", rotulo: "Auditoria", papeis: ["operador", "gestao"] },
  {
    href: "/consultar",
    rotulo: "Consultar",
    papeis: ["operador", "consultor", "gestao"],
  },
  { href: "/historico", rotulo: "Histórico", papeis: ["gestao"] },
  { href: "/configuracoes", rotulo: "Config.", papeis: ["gestao"] },
];

/*
 * PAINEL APOSENTADO — fora do ar desde 30/07/2026.
 *
 * A rota /dashboard virou redirect para /painel. Este componente ficou
 * inteiro de propósito: são análises que custaram para ficar de pé e que
 * podem voltar, juntas ou em pedaços. O que vive aqui e NÃO existe no
 * painel atual: Pareto de tipos, mapa de calor setor × tipo, densidade
 * de erros com limiar ajustável, fila de pendências priorizada, evolução
 * semanal por setor, eficiência de tratativa por setor e por parede,
 * tendência por criticidade, idade das pendências e fluxo entram ×
 * resolvidas.
 *
 * Para religar, veja o comentário em src/app/(app)/dashboard/page.tsx.
 */
export default function PainelProducao({ role }: { role: Role }) {
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [datas, setDatas] = useState<DatasEscolhidas>({ de: "", ate: "" });
  const [recortes, setRecortes] = useState<Recorte[]>([]);
  const [limiar, setLimiar] = useState(4);

  const [linhas, setLinhas] = useState<LinhaDash[] | null>(null);
  const [naoResolvidos, setNaoResolvidos] = useState<LinhaDash[] | null>(null);
  const [paredesConferidas, setParedesConferidas] = useState<ParedeConferida[]>(
    []
  );
  const [erro, setErro] = useState("");
  const [atualizado, setAtualizado] = useState("");
  const [aoVivo, setAoVivo] = useState(false);
  const [tv, setTv] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  const hoje = useMemo(() => hojeSaoPaulo(), []);
  const intervalo = useMemo(
    () => intervaloDe(periodo, hoje, datas),
    [periodo, hoje, datas]
  );
  const { inicio, fim } = intervalo;

  const carregar = useCallback(
    async (inicio: string | null, fim: string | null) => {
      const supabase = createClient();
      let q = supabase.from("ocorrencias").select(COLUNAS_DASH).limit(10000);
      // paredes conferidas na auditoria: é o denominador do FPY
      let qf = supabase.from("fpy_paredes").select("*").limit(20000);
      if (inicio) {
        q = q.gte("data", inicio);
        qf = qf.gte("data", inicio);
      }
      if (fim) {
        q = q.lte("data", fim);
        qf = qf.lte("data", fim);
      }

      const [periodoRes, abertasRes, fpyRes] = await Promise.all([
        q,
        // pendência é fato do presente: não recebe corte de data
        supabase
          .from("ocorrencias")
          .select(COLUNAS_DASH)
          .in("status", STATUS_NAO_RESOLVIDOS)
          .limit(10000),
        qf,
      ]);
      if (periodoRes.error || abertasRes.error) {
        setErro(
          "Erro ao carregar: " +
            (periodoRes.error?.message ?? abertasRes.error?.message)
        );
        return;
      }
      setErro("");
      setLinhas((periodoRes.data ?? []) as LinhaDash[]);
      setNaoResolvidos((abertasRes.data ?? []) as LinhaDash[]);
      setParedesConferidas((fpyRes.data ?? []) as ParedeConferida[]);
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

  /* Tempo real: o banco avisa por WebSocket assim que alguém registra ou
     trata um erro, em qualquer aparelho. A recarga é agrupada em 800 ms
     para não repetir a consulta quando chegam várias mudanças juntas. */
  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout>;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    let vivo = true;

    (async () => {
      // o socket precisa carregar o token do usuário: sem isso o RLS
      // filtra todos os eventos e a inscrição fica muda
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      if (!vivo) return;

      canal = supabase
        .channel("painel-ocorrencias")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ocorrencias" },
          () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => carregar(inicio, fim), 800);
          }
        )
        .subscribe((status) => setAoVivo(status === "SUBSCRIBED"));
    })();

    // rede de segurança: se o socket cair sem avisar, ainda atualiza sozinho
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
      setTv((v) => !v); // sem permissão de tela cheia: só amplia a escala
    }
  }

  useEffect(() => {
    const sair = () => {
      if (!document.fullscreenElement) setTv(false);
    };
    document.addEventListener("fullscreenchange", sair);
    return () => document.removeEventListener("fullscreenchange", sair);
  }, []);

  /* ---------------- recortes vindos dos cliques nos gráficos ---------------- */
  const filtrar = useCallback((campo: CampoRecorte, valor: string) => {
    setRecortes((rs) => alternarRecorte(rs, campo, valor));
  }, []);
  const ligado = useCallback(
    (campo: CampoRecorte, valor: string) => temRecorte(recortes, campo, valor),
    [recortes]
  );

  /* Projeto e casa ganham seletor próprio: são as duas perguntas que a
     produção faz de cara ("como está o C4A?", "e a casa 118?") e não faz
     sentido depender de encontrar a barra certa num gráfico. */
  const opcoes = useMemo(
    () => opcoesDeRecorte(linhas ?? [], paredesConferidas),
    [linhas, paredesConferidas]
  );
  const projetoSel = valorDoRecorte(recortes, "projeto");
  const casaSel = valorDoRecorte(recortes, "casa");
  const casasVisiveis =
    opcoes.casasPorProjeto.get(projetoSel) ??
    opcoes.casasPorProjeto.get("") ??
    [];

  function escolherProjeto(valor: string) {
    setRecortes((rs) => {
      const comProjeto = definirRecorte(rs, "projeto", valor);
      // a casa escolhida pode não existir no projeto novo
      const casa = valorDoRecorte(comProjeto, "casa");
      const permitidas = valor
        ? (opcoes.casasPorProjeto.get(valor) ?? [])
        : (opcoes.casasPorProjeto.get("") ?? []);
      return casa && !permitidas.includes(casa)
        ? definirRecorte(comProjeto, "casa", "")
        : comProjeto;
    });
  }

  const dados = useMemo(() => {
    if (!linhas || !naoResolvidos) return null;

    const linhasR = aplicarRecortes(linhas, recortes);
    const abertas = aplicarRecortes(
      naoResolvidos.filter((r) => STATUS_ABERTOS.includes(r.status)),
      recortes
    );
    const pendentes = aplicarRecortes(
      naoResolvidos.filter((r) => r.status === "RETRABALHO_PENDENTE"),
      recortes
    );
    const paredes = aplicarRecortesEmParedes(paredesConferidas, recortes);

    const pareto = paretoTipos(linhasR);
    const tiposTop = pareto.filter((i) => !i.outros).map((i) => i.nome);
    const casas = situacaoCasas(linhasR, hoje);
    return {
      total: linhasR.length,
      kpis: calcularKpis(linhasR, abertas, hoje, casas, pendentes),
      fpy: calcularFpy(paredes),
      fpySerie: fpySemanal(paredes),
      densidade: densidadeErros(paredes, linhasR, limiar),
      diagParedes: diagnosticoPorParede(paredes, linhasR),
      fluxo: fluxoSemanal(linhasR),
      tendencia: tendenciaSemanal(linhasR),
      tempos: tempoRetrabalhoPorSetor(linhasR),
      faixas: faixasIdade(abertas, hoje),
      casas,
      fila: filaPrioritaria(abertas, hoje),
      pareto,
      setores: contagemPorSetor(linhasR),
      eficSetores: eficienciaPorCampo(linhasR, "setor"),
      eficParedes: eficienciaPorCampo(linhasR, "parede", 8),
      mapa: mapaSetorTipo(linhasR, tiposTop),
      evolucao: evolucaoSetores(linhasR),
    };
  }, [linhas, naoResolvidos, hoje, paredesConferidas, recortes, limiar]);

  return (
    <div ref={raiz} className={`pn ${tv ? "tv" : ""}`}>
      <header className="pn-topo">
        <span className="flex min-w-0 items-center gap-2">
          <LogoTecverde />
          {/* o rótulo da tela sai no celular: a barra de baixo já mostra
              qual aba está ativa, e aqui ele empurrava o botão de tema
              para uma segunda linha */}
          <NomeSistema />
        </span>

        <span
          className={`vivo mono ${aoVivo ? "" : "parado"}`}
          title={
            aoVivo
              ? "Conectado ao banco: a tela se atualiza sozinha quando alguém registra ou trata um desvio"
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

        {/* no celular a navegação está na barra inferior */}
        <nav className="esconde-tv hidden items-center gap-1 lg:flex">
          {LINKS.filter((l) => l.papeis.includes(role)).map((l) => (
            <Link key={l.href} href={l.href} className="btn">
              {l.rotulo}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <BotaoTema />
          {/* Modo TV é para o monitor da fábrica: não faz sentido no
              celular e ainda espremia o cabeçalho */}
          <button className="btn hidden lg:block" onClick={alternarTv}>
            {tv ? "Sair do modo TV" : "Modo TV"}
          </button>
        </div>
      </header>

      <div className="pn-barra">
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
                onChange={(e) =>
                  setDatas((d) => ({ ...d, de: e.target.value }))
                }
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
            {!datas.de && !datas.ate && (
              <span className="text-[11px]" style={{ color: "var(--color-media)" }}>
                escolha ao menos uma data — sem elas o painel mostra tudo
              </span>
            )}
          </div>
        )}

        <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
          projeto
          <select
            value={projetoSel}
            onChange={(e) => escolherProjeto(e.target.value)}
            className="campo"
            style={{ width: "auto", padding: "6px 30px 6px 9px", fontSize: 13 }}
          >
            <option value="">Todos</option>
            {opcoes.projetos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-ink-3">
          casa
          <select
            value={casaSel}
            onChange={(e) =>
              setRecortes((rs) => definirRecorte(rs, "casa", e.target.value))
            }
            className="campo"
            style={{ width: "auto", padding: "6px 30px 6px 9px", fontSize: 13 }}
          >
            <option value="">
              Todas{casasVisiveis.length ? ` (${casasVisiveis.length})` : ""}
            </option>
            {casasVisiveis.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        {/* no celular o texto do período é redundante com os botões acima e
            custa uma linha inteira de tela; só fica quando é intervalo
            escolhido à mão, aí ele é a única confirmação do que foi pedido */}
        <span
          className={`num text-[11px] text-ink-3 ${
            periodo === "custom" ? "" : "hidden lg:inline"
          }`}
        >
          período: {rotuloIntervalo(intervalo)}
        </span>

        {/* Caminho para o painel novo. Fica na faixa e nao no cabecalho:
            no celular o cabecalho ja esta cheio, e antes este link era
            hidden lg:block -- ou seja, no telefone nao havia como sair
            deste painel para o outro. */}
        <Link
          href="/painel"
          className="esconde-tv text-[11.5px] font-semibold"
          style={{ color: "var(--color-info)" }}
        >
          Ver painel 2.0 →
        </Link>

        {dados && (
          <BarraRecortes
            recortes={recortes}
            resultado={dados.total}
            aoRemover={(r) => filtrar(r.campo, r.valor)}
            aoLimpar={() => setRecortes([])}
          />
        )}
      </div>

      {erro && (
        <p
          className="px-6 py-16 text-center text-sm"
          style={{ color: "var(--color-alta)" }}
        >
          {erro}
        </p>
      )}

      {!erro && !dados && (
        <p
          className="px-6 py-16 text-center text-sm"
          style={{ color: "var(--color-ink-3)" }}
        >
          Carregando indicadores…
        </p>
      )}

      {!erro && dados && (
        <div className="pn-grade">
          <div style={{ gridColumn: "span 12" }}>
            <BarraKpis kpis={dados.kpis} role={role} />
          </div>

          <CartaoFpy fpy={dados.fpy} serie={dados.fpySerie} />
          <TempoRetrabalho setores={dados.tempos} />

          <CartaoDensidade
            d={dados.densidade}
            limiar={limiar}
            aoMudarLimiar={setLimiar}
            aoFiltrarParede={(p) => filtrar("parede", p)}
            aoFiltrarCasa={(c) => filtrar("casa", c)}
          />
          <IdadePendencias faixas={dados.faixas} />

          <GraficoFluxo
            pontos={dados.fluxo}
            aoFiltrar={(s) => filtrar("semana", s)}
            ativo={(s) => ligado("semana", s)}
          />
          <VolumeSetores
            barras={dados.setores}
            aoFiltrar={(s) => filtrar("setor", s)}
            ativo={(s) => ligado("setor", s)}
          />

          <GraficoTendencia
            pontos={dados.tendencia}
            aoFiltrar={(s) => filtrar("semana", s)}
            ativo={(s) => ligado("semana", s)}
          />
          <EvolucaoSetores setores={dados.evolucao} />

          <DiagnosticoParedes
            paredes={dados.diagParedes}
            aoFiltrar={(p) => filtrar("parede", p)}
            ativo={(p) => ligado("parede", p)}
          />

          <TabelaCasas
            casas={dados.casas}
            aoFiltrar={(c) => filtrar("casa", c)}
            ativo={(c) => ligado("casa", c)}
          />

          <GraficoPareto
            itens={dados.pareto}
            total={dados.total}
            aoFiltrar={(t) => filtrar("tipo_erro", t)}
            ativo={(t) => ligado("tipo_erro", t)}
          />
          <GraficoEficiencia
            titulo="Eficiência por setor"
            subtitulo="% já retrabalhado e aprovado — piores primeiro · meta ≥ 90%"
            itens={dados.eficSetores}
            aoFiltrar={(s) => filtrar("setor", s)}
            ativo={(s) => ligado("setor", s)}
          />
          <MapaCalor
            dados={dados.mapa}
            aoFiltrar={(s, t) => {
              setRecortes((rs) =>
                alternarRecorte(
                  alternarRecorte(rs, "setor", s),
                  "tipo_erro",
                  t
                )
              );
            }}
          />

          <FilaPendencias itens={dados.fila} />
          <GraficoEficiencia
            classe="col-5"
            titulo="Eficiência por parede"
            subtitulo="Top 8 posições por volume — parede que trava é problema de gabarito, não de operador"
            itens={dados.eficParedes}
            aoFiltrar={(p) => filtrar("parede", p)}
            ativo={(p) => ligado("parede", p)}
          />

          <p className="sub" style={{ gridColumn: "span 12", paddingTop: 4 }}>
            O FPY e a densidade consideram apenas as casas auditadas pela aba
            Auditoria — é lá que o sistema fica sabendo quais paredes foram
            conferidas e passaram sem erro. Os demais números são contagens
            absolutas de erros registrados. Os indicadores por setor referem-se
            ao setor onde o erro foi <b>detectado</b>, que nem sempre é onde ele
            foi criado. Indicadores de tempo e a coluna de resolvidos contam
            apenas retrabalho <b>aprovado pela gestão</b>: enquanto a aprovação
            não sai, o erro segue como não resolvido.
          </p>
        </div>
      )}
    </div>
  );
}
