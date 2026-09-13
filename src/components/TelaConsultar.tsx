"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import OcorrenciaCard from "@/components/OcorrenciaCard";
import PainelFiltros from "@/components/PainelFiltros";
import {
  DIAS_PADRAO,
  FILTROS_PADRAO,
  contarFiltrosExtras,
  PAREDE_OK,
  querParedesOk,
  statusDeErro,
  type Filtros,
  type ListasConfig,
  type OrdemKey,
} from "@/lib/filtros";
import type { ParedeConferida } from "@/lib/dashboard";
import {
  ROTULO_STATUS,
  type AnexoOcorrencia,
  type Ocorrencia,
  type Role,
  type Status,
} from "@/lib/types";
import { baixar, montarCsv, nomeDoArquivo } from "@/lib/exportar";
import { hojeSaoPaulo } from "@/lib/dashboard";
import { BUCKET_AUDITORIA } from "@/lib/anexos";

const PAGINA = 50;
/* Teto da exportação. A base tem centenas de linhas hoje; o teto existe
   para que um dia com dezenas de milhares não trave o navegador de quem
   clicou sem filtro nenhum. Quando bate no teto, a tela avisa. */
const TETO_EXPORTACAO = 10000;

/**
 * Os filtros da tela aplicados a uma consulta de ocorrências.
 *
 * Existe porque a EXPORTAÇÃO tem de trazer exatamente o que a lista
 * mostra. Com a montagem repetida em dois lugares, bastava alguém
 * acrescentar um filtro num deles para a planilha passar a dizer outra
 * coisa que a tela — e o erro só apareceria depois, na mão de quem
 * recebesse o arquivo.
 */
type Consulta = {
  eq: (c: string, v: string) => Consulta;
  in: (c: string, v: string[]) => Consulta;
  ilike: (c: string, v: string) => Consulta;
  gte: (c: string, v: string) => Consulta;
  lte: (c: string, v: string) => Consulta;
};

function filtrar<T extends { eq: unknown }>(q: T, f: Filtros): T {
  let c = q as unknown as Consulta;
  c = c.in("status", statusDeErro(f));
  if (f.projeto) c = c.eq("projeto", f.projeto);
  if (f.criticidade) c = c.eq("criticidade", f.criticidade);
  if (f.setor) c = c.eq("setor", f.setor);
  if (f.tipo) c = c.eq("tipo_erro", f.tipo);
  if (f.parede) c = c.eq("parede", f.parede);
  if (f.casa.trim()) c = c.ilike("casa", `%${f.casa.trim()}%`);
  if (f.de) c = c.gte("data", f.de);
  if (f.ate) c = c.lte("data", f.ate);
  return c as unknown as T;
}

/*
 * A LISTA TEM DUAS ESPÉCIES DE LINHA.
 *
 * O erro tem id, gravidade, situação e história; a parede OK tem só
 * projeto, casa, posição e o dia em que foi conferida — ela não é um
 * registro que alguém abriu, é a ausência de um. Elas convivem na mesma
 * lista sem virar o mesmo tipo, e cada uma desenha o seu cartão.
 */
type ItemLista =
  | { especie: "erro"; erro: Ocorrencia }
  | { especie: "ok"; parede: ParedeConferida };

/* A tela está mostrando SÓ a fila de aprovação? É o que decide entre o
   aviso "há retrabalho esperando" e a mensagem de fila zerada — com o
   status virando lista, "é a fila" passou a ser "é só ela e mais nada". */
const soAFila = (f: Filtros) =>
  f.status.length === 1 && f.status[0] === "RETRABALHO_PENDENTE";

const rotuloDoStatus = (s: string) =>
  s === PAREDE_OK ? "parede-ok" : (ROTULO_STATUS[s as Status] ?? s);

const chaveDoItem = (i: ItemLista) =>
  i.especie === "erro"
    ? `e${i.erro.id}`
    : `p${i.parede.projeto}|${i.parede.casa}|${i.parede.parede}|${i.parede.data}`;

/**
 * O cartão da parede que passou de primeira.
 *
 * Deliberadamente pequeno e sem nada para clicar: não há o que corrigir,
 * aprovar ou comentar numa parede boa. Ele existe para dar volume ao que
 * deu certo — quem lê uma tela só de erro acaba achando que a fábrica só
 * erra — e para ser conferido parede a parede quando alguém duvida do
 * FPY.
 */
function ParedeOkCard({ p }: { p: ParedeConferida }) {
  return (
    <article className="cartao cartao-ok">
      <div className="flex items-center gap-2.5">
        <span className="selo-ok">PAREDE OK</span>
        <b className="text-[13.5px]">
          Casa {p.casa} · {p.parede}
        </b>
        <span className="num ml-auto text-[11.5px] text-ink-3">
          {p.data.split("-").reverse().join("/")}
        </span>
      </div>
      <p className="sub">
        {p.projeto} · passou de primeira, sem nenhum erro registrado
        {p.reconstruida ? " · auditoria deduzida do histórico" : ""}
      </p>
    </article>
  );
}

const dataDoItem = (i: ItemLista) =>
  i.especie === "erro" ? i.erro.data : i.parede.data;

const casaDoItem = (i: ItemLista) =>
  i.especie === "erro" ? i.erro.casa : i.parede.casa;

/**
 * Junta as duas listas numa só.
 *
 * A ordenação de cada lado já veio do banco; aqui elas se intercalam
 * pelo critério que faz sentido para os dois. Ordenar por setor ou
 * criticidade não faz: parede OK não tem nem um nem outro, e ela cai no
 * fim, junta, em vez de se espalhar em posições sem significado.
 */
function juntar(
  erros: Ocorrencia[],
  paredes: ParedeConferida[],
  ordem: OrdemKey
): ItemLista[] {
  const itens: ItemLista[] = [
    ...erros.map((erro) => ({ especie: "erro" as const, erro })),
    ...paredes.map((parede) => ({ especie: "ok" as const, parede })),
  ];
  if (!paredes.length) return itens;

  if (ordem === "casa")
    return itens.sort((a, b) =>
      casaDoItem(a).localeCompare(casaDoItem(b), "pt-BR", { numeric: true })
    );
  if (ordem === "data_antiga" || ordem === "antigos")
    return itens.sort((a, b) => dataDoItem(a).localeCompare(dataDoItem(b)));
  if (ordem === "criticidade" || ordem === "setor")
    return itens.sort(
      (a, b) => Number(a.especie === "ok") - Number(b.especie === "ok")
    );
  return itens.sort((a, b) => dataDoItem(b).localeCompare(dataDoItem(a)));
}

/**
 * Os mesmos filtros, na auditoria de paredes.
 *
 * Só os que uma parede sem erro tem: projeto, casa, parede e data. Setor,
 * tipo e criticidade não existem numa parede que passou de primeira — por
 * isso `querParedesOk` já desliga esta busca quando algum deles está
 * ligado, em vez de fingir que o filtro foi respeitado.
 */
function filtrarParedes<T extends { eq: unknown }>(q: T, f: Filtros): T {
  let c = q as unknown as Consulta;
  c = c.eq("passou_de_primeira", "true");
  if (f.projeto) c = c.eq("projeto", f.projeto);
  if (f.parede) c = c.eq("parede", f.parede);
  if (f.casa.trim()) c = c.ilike("casa", `%${f.casa.trim()}%`);
  if (f.de) c = c.gte("data", f.de);
  if (f.ate) c = c.lte("data", f.ate);
  return c as unknown as T;
}

type AnexoConsultaRow = {
  id: string;
  registro_id: string | null;
  tipo: string | null;
  nome_arquivo: string | null;
  mime_type: string | null;
  tamanho_bytes: number | null;
  storage_bucket: string | null;
  storage_path: string | null;
};

type ReferenciaDesvioRow = {
  id: string;
  auditoria_id: string | null;
};

type ReferenciaAuditoriaRow = {
  id: string;
  projeto_id: string | null;
  parede_id: string | null;
};

const DURACAO_URL_ANEXO = 60 * 60;

/**
 * A view de Consulta continua simples e compatível. Os anexos são buscados
 * pela tabela genérica, e só os caminhos estáveis atravessam a fronteira do
 * Storage: a URL assinada nunca é persistida nem enviada ao banco.
 */
async function carregarAnexosDaConsulta(
  supabase: ReturnType<typeof createClient>,
  ocorrencias: Ocorrencia[]
): Promise<{ data: Ocorrencia[]; error: string | null }> {
  const ids = [...new Set(ocorrencias.map((item) => String(item.id)))];
  if (!ids.length) return { data: ocorrencias, error: null };

  const [anexosConsulta, desviosConsulta] = await Promise.all([
    supabase
      .from("sistema_anexos")
      .select(
        "id, registro_id, tipo, nome_arquivo, mime_type, tamanho_bytes, storage_bucket, storage_path"
      )
      .in("registro_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("produto_desvios")
      .select("id, auditoria_id")
      .in("id", ids),
  ]);

  if (anexosConsulta.error) {
    return { data: ocorrencias, error: anexosConsulta.error.message };
  }

  const anexosPorDesvio = new Map<string, AnexoOcorrencia[]>();
  await Promise.all(
    ((anexosConsulta.data ?? []) as AnexoConsultaRow[]).map(async (row) => {
      // Consulta é uma tela de fotos: documentos ou metadados incompletos não
      // entram na galeria, mas continuam preservados no Storage e no banco.
      if (!row.registro_id) return;
      if (row.mime_type && !row.mime_type.startsWith("image/")) return;

      const anexo: AnexoOcorrencia = {
        id: row.id,
        tipo: row.tipo,
        nome_arquivo: row.nome_arquivo,
        mime_type: row.mime_type,
        tamanho_bytes: row.tamanho_bytes,
        storage_bucket: row.storage_bucket || BUCKET_AUDITORIA,
        storage_path: row.storage_path,
        url: null,
      };

      if (anexo.storage_path) {
        const assinado = await supabase.storage
          .from(anexo.storage_bucket)
          .createSignedUrl(anexo.storage_path, DURACAO_URL_ANEXO);
        anexo.url = assinado.data?.signedUrl ?? null;
      }

      const lista = anexosPorDesvio.get(row.registro_id) ?? [];
      lista.push(anexo);
      anexosPorDesvio.set(row.registro_id, lista);
    })
  );

  /* A view legada não expõe os IDs canônicos do projeto e da parede. Eles
     são carregados somente para o caminho de um eventual novo anexo; se uma
     linha histórica não possuir a projeção, o cartão usa seus identificadores
     de compatibilidade como fallback determinístico. */
  const referencias = (desviosConsulta.data ?? []) as ReferenciaDesvioRow[];
  const auditoriaIds = [
    ...new Set(
      referencias
        .map((item) => item.auditoria_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const auditoriasConsulta = auditoriaIds.length
    ? await supabase
        .from("produto_auditorias")
        .select("id, projeto_id, parede_id")
        .in("id", auditoriaIds)
    : { data: [], error: null };
  const auditorias = new Map(
    ((auditoriasConsulta.data ?? []) as ReferenciaAuditoriaRow[]).map((row) => [
      row.id,
      row,
    ])
  );
  const auditoriaPorDesvio = new Map(
    referencias.map((row) => [row.id, auditorias.get(row.auditoria_id ?? "")])
  );

  return {
    data: ocorrencias.map((item) => {
      const referencia = auditoriaPorDesvio.get(String(item.id));
      return {
        ...item,
        anexos: anexosPorDesvio.get(String(item.id)) ?? [],
        projeto_id:
          referencia?.projeto_id ?? item.auditoria_id?.split("|")[0] ?? null,
        parede_id: referencia?.parede_id ?? null,
      };
    }),
    error: null,
  };
}

export default function TelaConsultar({ role }: { role: Role }) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [gaveta, setGaveta] = useState(false);
  const [listas, setListas] = useState<ListasConfig | null>(null);

  const [itens, setItens] = useState<ItemLista[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [aguardandoAprovacao, setAguardandoAprovacao] = useState(0);
  const [limite, setLimite] = useState(PAGINA);
  const [buscando, setBuscando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState("");

  const primeiraCarga = useRef(true);

  // listas para os seletores da gaveta
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [s, t, p, j] = await Promise.all([
        supabase.from("setores").select("*").eq("ativo", true).order("ordem"),
        supabase
          .from("tipos_erro")
          .select("*")
          .eq("ativo", true)
          .order("ordem"),
        supabase.from("paredes").select("*").eq("ativo", true).order("ordem"),
        supabase.from("projetos").select("*").eq("ativo", true).order("ordem"),
      ]);
      setListas({
        setores: s.data ?? [],
        tipos: t.data ?? [],
        paredes: p.data ?? [],
        projetos: j.data ?? [],
      });
    })();
  }, []);

  const buscar = useCallback(async (f: Filtros, lim: number) => {
    setBuscando(true);
    setErro("");
    const supabase = createClient();

    let q = filtrar(
      supabase
        .from("ocorrencias")
        // The legacy compatibility view intentionally has no synthetic
        // foreign key. Author names remain optional in the card.
        .select("*", { count: "exact" }),
      f
    );

    switch (f.ordem) {
      case "antigos":
        q = q.order("created_at", { ascending: true });
        break;
      case "data_nova":
        q = q
          .order("data", { ascending: false })
          .order("created_at", { ascending: false });
        break;
      case "data_antiga":
        q = q.order("data", { ascending: true });
        break;
      // o enum no banco está declarado como CRITICO, MEDIO, BAIXO —
      // ordenar por ele já traz os mais graves primeiro
      case "criticidade":
        q = q
          .order("criticidade", { ascending: true })
          .order("data", { ascending: false });
        break;
      case "casa":
        q = q
          .order("casa", { ascending: true })
          .order("data", { ascending: false });
        break;
      case "setor":
        q = q
          .order("setor", { ascending: true })
          .order("data", { ascending: false });
        break;
      default:
        q = q.order("created_at", { ascending: false });
    }

    /* As PAREDES OK vêm de outra tabela — a auditoria —, e só quando
       pedidas. As duas listas se juntam na memória e são cortadas no
       mesmo limite: pedir "as 50 primeiras" ao banco duas vezes e
       mostrar as 100 daria uma página que cresce sozinha. */
    const buscaParedes = querParedesOk(f)
      ? filtrarParedes(
          supabase.from("fpy_paredes").select("*", { count: "exact" }),
          f
        )
          .order("data", { ascending: f.ordem === "data_antiga" })
          .limit(lim)
      : null;

    // fila de aprovação: contada sem filtro nenhum, porque é uma
    // pendência da gestão e não pode depender do recorte da tela
    const [erros, paredesOk, fila] = await Promise.all([
      /* Sem nenhum status de erro marcado não há o que perguntar ao
         banco: `in("status", [])` devolveria zero de qualquer forma, mas
         gastando uma ida à rede. */
      statusDeErro(f).length
        ? q.limit(lim)
        : Promise.resolve({ data: [], error: null, count: 0 }),
      buscaParedes ?? Promise.resolve({ data: [], error: null, count: 0 }),
      supabase
        .from("ocorrencias")
        .select("id", { count: "exact", head: true })
        .eq("status", "RETRABALHO_PENDENTE"),
    ]);

    const falha = erros.error ?? paredesOk.error;
    if (falha) {
      setBuscando(false);
      setErro("Erro ao buscar: " + falha.message);
      return;
    }

    let errosComAnexos: Ocorrencia[];
    try {
      const resultado = await carregarAnexosDaConsulta(
        supabase,
        (erros.data ?? []) as Ocorrencia[]
      );
      if (resultado.error) {
        setBuscando(false);
        setErro("Erro ao buscar fotos: " + resultado.error);
        return;
      }
      errosComAnexos = resultado.data;
    } catch (error) {
      setBuscando(false);
      setErro(
        "Erro ao buscar fotos: " +
          (error instanceof Error ? error.message : "tente novamente")
      );
      return;
    }

    setBuscando(false);
    setItens(
      juntar(
        errosComAnexos,
        (paredesOk.data ?? []) as ParedeConferida[],
        f.ordem
      ).slice(0, lim)
    );
    setTotal((erros.count ?? 0) + (paredesOk.count ?? 0));
    setAguardandoAprovacao(fila.count ?? 0);
  }, []);

  // busca ao abrir e sempre que um filtro muda (com respiro para digitação)
  useEffect(() => {
    const atraso = primeiraCarga.current ? 0 : 300;
    primeiraCarga.current = false;
    const t = setTimeout(() => buscar(filtros, limite), atraso);
    return () => clearTimeout(t);
  }, [filtros, limite, buscar]);

  function mudar(novo: Partial<Filtros>) {
    setLimite(PAGINA);
    setFiltros((f) => ({ ...f, ...novo }));
  }

  /* EXPORTAR busca de novo em vez de usar o que está na tela: a lista
     mostra 50 por vez, e uma planilha com as 50 primeiras de 800 seria
     um recorte que ninguém pediu e que nada na tela avisaria. */
  async function exportar() {
    setExportando(true);
    setErro("");
    const supabase = createClient();
    /* A planilha traz as MESMAS duas espécies da lista, e no mesmo
       recorte — inclusive as paredes OK quando elas estão ligadas. */
    const [erros, paredesOk] = await Promise.all([
      statusDeErro(filtros).length
        ? filtrar(
            supabase
              .from("ocorrencias")
              .select("*"),
            filtros
          )
            .order("data", { ascending: false })
            .order("id", { ascending: false })
            .limit(TETO_EXPORTACAO)
        : Promise.resolve({ data: [], error: null }),
      querParedesOk(filtros)
        ? filtrarParedes(supabase.from("fpy_paredes").select("*"), filtros)
            .order("data", { ascending: false })
            .limit(TETO_EXPORTACAO)
        : Promise.resolve({ data: [], error: null }),
    ]);
    setExportando(false);

    const falha = erros.error ?? paredesOk.error;
    if (falha) {
      setErro("Erro ao exportar: " + falha.message);
      return;
    }
    const linhas = juntar(
      (erros.data ?? []) as Ocorrencia[],
      (paredesOk.data ?? []) as ParedeConferida[],
      filtros.ordem
    );
    if (!linhas.length) {
      setErro("Nada para exportar neste filtro.");
      return;
    }
    baixar(
      nomeDoArquivo(
        [
          filtros.projeto,
          filtros.casa && `casa-${filtros.casa}`,
          filtros.status.length === 1 && rotuloDoStatus(filtros.status[0]),
          filtros.setor,
        ].filter(Boolean) as string[],
        hojeSaoPaulo()
      ),
      montarCsv(linhas)
    );
    if (linhas.length === TETO_EXPORTACAO)
      setErro(
        `A planilha saiu com as ${TETO_EXPORTACAO} primeiras linhas, que é o limite. Estreite o filtro para levar o resto.`
      );
  }

  const extras = contarFiltrosExtras(filtros);
  // a tela está no recorte padrão de 30 dias, sem ninguém ter mexido?
  const noPadrao =
    filtros.de === FILTROS_PADRAO.de && filtros.ate === FILTROS_PADRAO.ate;
  const filaZerada =
    role === "gestao" &&
    soAFila(filtros) &&
    aguardandoAprovacao === 0 &&
    itens.length === 0 &&
    !buscando;

  return (
    <main className="tela tela-filtros">
      <PainelFiltros
        filtros={filtros}
        aoMudar={mudar}
        listas={listas}
        aberto={gaveta}
        aoAbrir={() => setGaveta(true)}
        aoFechar={() => setGaveta(false)}
        extras={extras}
        aoLimpar={() =>
          mudar(FILTROS_PADRAO)
        }
        totalResultados={total}
      />

      <div className="min-w-0">
        {/* A fila de aprovação é trabalho da gestão e ninguém mais pode
            fazer por ela: se não aparecer sozinha, o retrabalho fica
            parado sem que ninguém perceba. */}
        {role === "gestao" &&
          aguardandoAprovacao > 0 &&
          !soAFila(filtros) && (
            <div
              className="cartao mb-2.5"
              style={{
                borderColor: "var(--color-espera)",
                background:
                  "color-mix(in srgb, var(--color-espera) 7%, var(--color-papel))",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="text-[13.5px] font-bold"
                    style={{ color: "var(--color-espera)" }}
                  >
                    {aguardandoAprovacao}{" "}
                    {aguardandoAprovacao === 1
                      ? "retrabalho aguarda sua aprovação"
                      : "retrabalhos aguardam sua aprovação"}
                  </p>
                  <p className="sub">
                    Só a gestão aprova. Enquanto não aprovar, esses erros não
                    contam como resolvidos em nenhum indicador do painel.
                  </p>
                </div>
                <button
                  className="btn btn-forte shrink-0"
                  onClick={() =>
                    /* de/ate vazios de propósito: a contagem do aviso
                       varre a base inteira, e a fila tem de mostrar as
                       mesmas pendências — inclusive as de meses atrás. */
                    mudar({
                      ...FILTROS_PADRAO,
                      status: ["RETRABALHO_PENDENTE"],
                      ordem: "antigos",
                      de: "",
                      ate: "",
                    })
                  }
                >
                  Abrir a fila
                </button>
              </div>
            </div>
          )}

        {filaZerada && (
          <div className="cartao mb-2.5 py-6 text-center">
            <p
              className="text-[13.5px] font-bold"
              style={{ color: "var(--color-baixa)" }}
            >
              Fila de aprovação zerada.
            </p>
            <p className="sub">
              Nenhum retrabalho esperando você. Bom trabalho.
            </p>
          </div>
        )}

        {erro && <p className="py-10 text-center text-sm text-alta">{erro}</p>}

        {!erro && buscando && itens.length === 0 && (
          <p className="py-10 text-center text-sm text-ink-3">Buscando…</p>
        )}

        {!erro && !buscando && itens.length === 0 && !filaZerada && (
          <div className="cartao py-10 text-center">
            <p className="text-sm text-ink-3">
              {filtros.status.length === 0
                ? "Nenhuma situação marcada — marque ao menos uma para a lista ter o que mostrar."
                : "Nenhum registro encontrado."}
            </p>
            {extras > 0 && (
              <button
                onClick={() =>
                  mudar(FILTROS_PADRAO)
                }
                className="btn mt-3"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {itens.length > 0 && (
          <>
            {/* EXPORTAR mora aqui, colado na contagem, e não na coluna de
                filtros: é aqui que a pessoa lê "245 registros" e decide
                que quer aqueles 245 numa planilha. */}
            <button
              onClick={exportar}
              disabled={exportando || total === 0}
              className="btn mb-2.5 float-right"
              title="Baixar uma planilha com todos os registros deste filtro"
            >
              {exportando ? "Gerando…" : "Exportar"}
            </button>
            <p className="num mb-2.5 text-[11.5px] text-ink-3">
              {total} {total === 1 ? "registro" : "registros"}
              {total !== null && itens.length < total
                ? ` · mostrando ${itens.length}`
                : ""}
              {buscando ? " · atualizando…" : ""}
              {/* sem isto, quem abre a tela acha que sumiram registros */}
              {noPadrao && (
                <>
                  {" · "}
                  <button
                    onClick={() => mudar({ de: "", ate: "" })}
                    className="underline underline-offset-2"
                    title="Mostrar todos os registros, sem recorte de data"
                  >
                    últimos {DIAS_PADRAO} dias
                  </button>
                </>
              )}
            </p>

            <div className="grid gap-2.5 xl:grid-cols-2">
              {itens.map((it) =>
                it.especie === "erro" ? (
                  <OcorrenciaCard
                    key={chaveDoItem(it)}
                    item={it.erro}
                    role={role}
                    onSalvo={(novo) =>
                      setItens((lista) =>
                        lista.map((x) =>
                          x.especie === "erro" && x.erro.id === novo.id
                            ? { especie: "erro", erro: novo }
                            : x
                        )
                      )
                    }
                  />
                ) : (
                  <ParedeOkCard key={chaveDoItem(it)} p={it.parede} />
                )
              )}
            </div>

            {total !== null && itens.length < total && (
              <button
                onClick={() => setLimite((l) => l + PAGINA)}
                disabled={buscando}
                className="btn mt-3 w-full"
                style={{ padding: "12px 16px" }}
              >
                {buscando
                  ? "Carregando…"
                  : `Carregar mais ${Math.min(PAGINA, total - itens.length)}`}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
