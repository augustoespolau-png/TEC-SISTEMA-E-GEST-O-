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

/*
 * INDICADORES — três folhas para a diretoria: FPY, Qualidade e
 * Comparativos.
 *
 * A folha de Qualidade se chamava Desvios. O nome na URL continua
 * `desvios` de propósito: endereço já salvo por alguém não pode virar
 * página em branco por causa de uma troca de rótulo.
 *
 * Convive com o Painel, não o substitui. O Painel acompanha a EXECUÇÃO
 * da obra (quantas paredes já foram resolvidas, o que trava). Aqui a
 * pergunta é de qualidade ao longo do tempo: quanto se erra, de que
 * gravidade, e a fábrica está melhorando ou piorando.
 *
 * O projeto é sempre um só. Projetos têm quantidade de paredes por casa
 * muito diferente — 12 no C4A, 101 na escola —, e uma média entre eles
 * não descreveria nenhuma fábrica.
 */

/* A folha EXECUÇÃO saiu: era o Painel 2.0 inteiro embutido aqui, e
   deixou de ser usado. O componente continua no repositório e a rota
   /painel continua de pé para quem tiver o endereço salvo. */
type Folha = "fpy" | "desvios" | "fluxo" | "comparativos";

/* A lista das folhas mora no TabBar (FOLHAS_INDICADORES), junto com a
   regra de quem alcança quais. Duas listas em dois arquivos sempre
   acabam discordando uma da outra. */

const ROTULO_FOLHA: Record<Folha, string> = {
  fpy: "FPY",
  desvios: "Qualidade",
  fluxo: "Fluxo",
  comparativos: "Comparativos",
};

export default function Indicadores({ role }: { role: Role }) {
  /* AS FOLHAS QUE ESTE PAPEL ALCANÇA. O operador só tem a de FPY: ele
     precisa do resultado do próprio trabalho, não do painel de gestão.
     A conferência é aqui e não só no menu — sem ela, /indicadores?folha=
     desvios entregaria a folha inteira a quem digitasse o endereço. */
  const folhasVisiveis = useMemo(
    () => folhasDoPapel(role).map((f) => f.id as Folha),
    [role]
  );
  const [projetos, setProjetos] = useState<string[]>([]);
  const [projeto, setProjeto] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [datas, setDatas] = useState<DatasEscolhidas>({ de: "", ate: "" });
  /* A folha vem da URL, escolhida na barra lateral. Estado interno
     daria uma tela que nao se pode marcar nem compartilhar, e a lateral
     nao teria como saber qual esta acesa. */
  const busca = useSearchParams();
  const pedida = busca.get("folha") as Folha | null;
  const folha: Folha =
    pedida && folhasVisiveis.includes(pedida) ? pedida : "fpy";

  /* MODO TV: some tudo que nao e grafico — a lateral, o topo do
     aplicativo e a faixa de filtros — para a tela ficar legivel de
     longe. Sai com Esc ou pelo botao que fica no canto. */
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

  /* O CLIQUE NO GRÁFICO. Cada marca clicada entra aqui, e daqui recorta
     as QUATRO folhas ao mesmo tempo — clicar numa semana no FPY leva a
     mesma semana para os desvios e para os comparativos. Vários recortes
     valem juntos (semana E setor E gravidade), e clicar de novo na mesma
     marca desfaz. A barra logo abaixo dos filtros escreve o que está
     valendo: filtro que não aparece na tela é número mentindo. */
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
  const [regras, setRegras] = useState<Regras>(REGRAS_PADRAO);
  const [erro, setErro] = useState("");

  const hoje = useMemo(() => hojeSaoPaulo(), []);
  const intervalo = useMemo(
    () => intervaloDe(periodo, hoje, datas),
    [periodo, hoje, datas]
  );

  /* Busca a base inteira uma vez e recorta na memória. São centenas de
     linhas, não milhares: ir ao servidor a cada clique de período
     deixaria a tela lenta sem necessidade. */
  const carregar = useCallback(async () => {
    const supabase = createClient();
    const [rp, re, rj] = await Promise.all([
      supabase.from("fpy_paredes").select("*").limit(30000),
      supabase.from("ocorrencias").select(COLUNAS_DASH).limit(30000),
      supabase.from("projetos").select("nome").eq("ativo", true).order("ordem"),
    ]);
    if (re.error || rp.error) {
      setErro("Erro ao carregar: " + (re.error?.message ?? rp.error?.message));
      return;
    }
    setErro("");
    setParedes((rp.data ?? []) as ParedeConferida[]);
    setErros((re.data ?? []) as LinhaDash[]);
    const nomes = (rj.data ?? []).map((p) => (p.nome as string).trim());
    setProjetos(nomes);
    setProjeto((p) => p ?? nomes[0] ?? null);
    setRegras(await carregarRegras());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca de rede
    carregar();
  }, [carregar]);

  const recorte = useMemo(() => {
    if (!paredes || !projeto) return null;
    const { inicio, fim } = intervalo;
    const dentro = (d: string) =>
      (!inicio || d >= inicio) && (!fim || d <= fim);
    /* Duas camadas, nesta ordem: primeiro o filtro de cima (projeto e
       período), depois os recortes vindos dos cliques. E cada lado com a
       sua regra — aplicarRecortesEmParedes ignora de propósito setor,
       tipo e gravidade, porque descartar as paredes sem aquele erro
       tiraria do denominador justamente as que passaram, e o FPY subiria
       sozinho. */
    return {
      paredes: aplicarRecortesEmParedes(
        paredes.filter((p) => p.projeto?.trim() === projeto && dentro(p.data)),
        recortes
      ),
      erros: aplicarRecortes(
        erros.filter((e) => e.projeto?.trim() === projeto && dentro(e.data)),
        recortes
      ),
    };
  }, [paredes, erros, projeto, intervalo, recortes]);

  /* O ANO CORRENTE, do dia 1º de janeiro até hoje.
     Ele ignora o filtro de período de propósito — é o número que a
     fábrica olha para saber onde o ano está, e mudaria de significado se
     acompanhasse o recorte. O filtro de PROJETO ele respeita: misturar
     C4A e escola num só FPY não diria nada sobre nenhum dos dois. */
  const anoCorrente = useMemo(() => {
    if (!paredes || !projeto) return null;
    const primeiroDeJaneiro = `${hoje.slice(0, 4)}-01-01`;
    const noAno = (d: string) => d >= primeiroDeJaneiro && d <= hoje;
    return {
      paredes: paredes.filter(
        (p) => p.projeto?.trim() === projeto && noAno(p.data)
      ),
      erros: erros.filter(
        (e) => e.projeto?.trim() === projeto && noAno(e.data)
      ),
    };
  }, [paredes, erros, projeto, hoje]);

  /* TODAS as paredes do projeto, sem corte de data: o cartão do mês
     anterior precisa alcançar dezembro quando o filtro está em janeiro,
     e o ano corrente pararia em 1º de janeiro. */
  const doProjeto = useMemo(
    () => (paredes ?? []).filter((p) => p.projeto?.trim() === projeto),
    [paredes, projeto]
  );

  const regra = useMemo(
    () => regraDoProjeto(regras, projeto),
    [regras, projeto]
  );

  if (erro)
    return (
      <div className="tela">
        <p className="ind-erro">{erro}</p>
      </div>
    );
  if (!recorte || !projeto)
    return (
      <div className="tela">
        <p className="text-sm text-ink-3">Carregando…</p>
      </div>
    );

  return (
    <div className="tela ind-tela">
      {/* O botao de sair fica FORA do topo, que e justamente o que o
          modo TV esconde — senao nao haveria como voltar sem teclado. */}
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
          {/* O intervalo mora AQUI, na mesma faixa dos botões, e não
              numa linha própria embaixo: sobrava espaço à direita, e a
              linha extra empurrava os gráficos para baixo justamente no
              modo em que a pessoa quer olhar os gráficos. */}
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

        {/* O que os cliques nos gráficos estão recortando agora. Some
            quando não há nenhum. */}
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

        {/* AS FOLHAS NO CELULAR. Elas moram na barra lateral, que só
            existe a partir de 1024px — abaixo disso a lateral vira a
            barra de baixo, que só leva às telas principais. Sem esta
            nav, quem abrisse os indicadores no telefone ficava preso na
            folha de FPY, sem caminho nenhum para as outras três. O CSS
            esconde esta faixa no computador, onde a lateral já as tem. */}
        {/* uma folha só não é escolha: para o operador a faixa some */}
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
          /* o mês que o filtro está mostrando é o do FIM do intervalo;
             em "Tudo", que não tem fim, é o mês de hoje */
          mesSelecionado={(intervalo.fim ?? hoje).slice(0, 7)}
          ano={hoje.slice(0, 4)}
          periodoRotulo={descrever(periodo, intervalo)}
          regra={regra}
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
