"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET_AUDITORIA,
  caminhoProjetoParede,
  criarUrlAssinadaOpcional,
  MAX_FOTO_BYTES,
  otimizarFoto,
  segmentoSeguro,
} from "@/lib/anexos";
import { carregarAnexosProjetoParede } from "@/lib/anexosProjetoParede";
import { mutarQualidade, salvarProjetoParedeAnexo } from "@/lib/qualidadeCompat";
import LinhaConfig from "@/components/config/LinhaConfig";
import RegrasQualidade from "@/components/config/RegrasQualidade";
import type { AnexoProjetoParede, ConfigItem, Parede } from "@/lib/types";

type Tabela = "projetos" | "setores" | "tipos_erro";

/*
 * Editar × excluir
 *
 * Editar renomeia o item; excluir remove a linha.
 *
 * As duas são seguras para o histórico pela mesma razão de projeto: as
 * ocorrências gravam projeto, parede, setor e tipo como TEXTO copiado no
 * momento do registro. A lista é só a fonte das opções, não o dono do
 * dado — então renomear vale para o que vier depois, e apagar não apaga
 * nem altera nenhum registro antigo.
 *
 * A única coisa que a exclusão realmente arrasta é a relação
 * projeto → paredes: apagar um projeto apaga as paredes dele (é o que
 * o banco faz por cascata, e a confirmação avisa quantas são).
 *
 * "Desativar" saiu da tela: com exclusão de verdade disponível, esconder
 * pela metade só criava item fantasma. O botão Reativar sobrevive apenas
 * para item que já esteja inativo, senão ele ficaria preso fora do
 * formulário para sempre.
 */

export default function ConfigManager() {
  // apagar ou criar projeto muda a lista da seção de paredes
  const [versaoProjetos, setVersaoProjetos] = useState(0);

  return (
    <main className="tela tela-2col">
      <div className="cartao" style={{ gridColumn: "1 / -1" }}>
        <h2>Listas do formulário</h2>
        <p className="sub">
          Estas listas alimentam as telas de registro e auditoria. Cada item
          tem duas ações: <b>editar</b> renomeia e <b>excluir</b> remove a
          linha. As duas valem só de agora em diante — cada ocorrência guarda
          o nome como texto copiado no momento em que foi lançada, então
          nenhum registro antigo muda de nome nem desaparece.
        </p>
      </div>

      <RegrasQualidade />

      <ConfigSection
        tabela="projetos"
        titulo="Projetos"
        aoMudar={() => setVersaoProjetos((v) => v + 1)}
      />
      <ParedesSection versaoProjetos={versaoProjetos} />
      <ConfigSection tabela="setores" titulo="Setores" />
      <ConfigSection tabela="tipos_erro" titulo="Tipos de erro" />

      <div className="cartao" style={{ gridColumn: "1 / -1" }}>
        <h2>Governança de acessos</h2>
        <p className="sub">
          Convide usuários, bloqueie ou suspenda contas e aplique permissões
          por módulo e projeto na tela nativa de Cadastros.
        </p>
        <Link href="/cadastros" className="btn btn-forte mt-3 inline-flex">
          Abrir Cadastros e acessos
        </Link>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function ConfigSection({
  tabela,
  titulo,
  aoMudar,
}: {
  tabela: Tabela;
  titulo: string;
  aoMudar?: () => void;
}) {
  const [itens, setItens] = useState<ConfigItem[] | null>(null);
  const [novo, setNovo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from(tabela)
      .select("*")
      .order("ordem")
      .order("nome");
    if (error) toast.error(`Erro ao carregar ${titulo}: ` + error.message);
    setItens(data ?? []);
  }, [tabela, titulo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial; só resolve após o await
    carregar();
  }, [carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novo.trim().toUpperCase();
    if (!nome || ocupado) return;
    setOcupado(true);
    const ordem = Math.max(0, ...(itens ?? []).map((i) => i.ordem)) + 1;
    const { error } = await mutarQualidade("CONFIG_ADICIONAR_ITEM", {
      tabela,
      nome,
      ordem,
    });
    setOcupado(false);
    if (error) {
      toast.error(
        error.code === "23505" ? "Esse item já existe." : error.message
      );
      return;
    }
    setNovo("");
    carregar();
    aoMudar?.();
  }

  async function renomear(item: ConfigItem, nome: string) {
    const { error } = await mutarQualidade("CONFIG_RENOMEAR_ITEM", {
      tabela,
      nome_atual: item.nome,
      nome_novo: nome,
    });
    if (error) {
      toast.error(
        error.code === "23505"
          ? `Já existe um item chamado ${nome}.`
          : error.message
      );
      return;
    }
    toast.success(`${item.nome} agora é ${nome}.`);
    await carregar();
    aoMudar?.();
  }

  async function reativar(item: ConfigItem) {
    const { error } = await mutarQualidade("CONFIG_REATIVAR_ITEM", {
      tabela,
      nome_atual: item.nome,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    carregar();
    aoMudar?.();
  }

  async function excluir(item: ConfigItem) {
    const { error } = await mutarQualidade("CONFIG_EXCLUIR_ITEM", {
      tabela,
      nome_atual: item.nome,
    });
    if (error) {
      toast.error("Não foi possível excluir: " + error.message);
      return;
    }
    toast.success(`${item.nome} excluído.`);
    carregar();
    aoMudar?.();
  }

  const ativos = (itens ?? []).filter((i) => i.ativo).length;

  return (
    <section className="cartao">
      <h2>{titulo}</h2>
      <p className="sub">
        {itens === null
          ? "Carregando…"
          : `${itens.length} ${itens.length === 1 ? "item" : "itens"}` +
            // só vira assunto quando existe item inativo para reativar
            (ativos < itens.length ? ` · ${itens.length - ativos} inativo(s)` : "")}
      </p>
      <div className="corpo">
        {itens && (
          <ul
            className="mb-3 max-h-72 overflow-y-auto"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            {itens.map((i) => (
              <LinhaConfig
                key={i.id}
                item={i}
                tabela={tabela}
                onRenomear={(nome) => renomear(i, nome)}
                onReativar={() => reativar(i)}
                onExcluir={() => excluir(i)}
              />
            ))}
            {itens.length === 0 && (
              <li className="py-3 text-xs text-ink-3">Nenhum item.</li>
            )}
          </ul>
        )}
        <form onSubmit={adicionar} className="flex gap-2">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Adicionar item"
            className="campo min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={ocupado || !novo.trim()}
            className="btn btn-forte"
          >
            Adicionar
          </button>
        </form>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const MAX_SEQUENCIA = 300;

function ParedesSection({ versaoProjetos }: { versaoProjetos: number }) {
  const [projetos, setProjetos] = useState<ConfigItem[]>([]);
  const [projetoId, setProjetoId] = useState<number | null>(null);
  const [paredes, setParedes] = useState<Parede[] | null>(null);
  const [anexosProjeto, setAnexosProjeto] = useState<
    Record<string, AnexoProjetoParede>
  >({});
  const [anexandoProjeto, setAnexandoProjeto] = useState<Record<string, boolean>>(
    {}
  );
  const [novo, setNovo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // gerador de sequência: projeto de 90 paredes não se digita à mão
  const [emLote, setEmLote] = useState(false);
  const [prefixo, setPrefixo] = useState("P");
  const [de, setDe] = useState("1");
  const [ate, setAte] = useState("12");
  const [comZero, setComZero] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("projetos")
        .select("*")
        .order("ordem")
        .order("nome");
      const lista = data ?? [];
      setProjetos(lista);
      // o projeto escolhido pode ter sido excluído na outra seção
      setProjetoId((atual) =>
        atual != null && lista.some((p) => p.id === atual)
          ? atual
          : (lista[0]?.id ?? null)
      );
    })();
  }, [versaoProjetos]);

  const carregar = useCallback(async () => {
    if (projetoId == null) {
      setParedes([]);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("paredes")
      .select("*")
      .eq("projeto_id", projetoId)
      .order("ordem")
      .order("nome");
    if (error) toast.error("Erro ao carregar paredes: " + error.message);
    setParedes((data ?? []) as Parede[]);
  }, [projetoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recarrega ao trocar de projeto; só resolve após o await
    carregar();
  }, [carregar]);

  useEffect(() => {
    let ativo = true;
    const ids = (paredes ?? [])
      .map((parede) => parede.origem_id)
      .filter((id): id is string => Boolean(id));

    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o projeto anterior antes da leitura assíncrona
    setAnexosProjeto({});
    if (ids.length === 0) return () => { ativo = false; };

    carregarAnexosProjetoParede(ids).then(({ data, error }) => {
      if (!ativo) return;
      if (error) {
        toast.error("Não foi possível carregar os projetos das paredes: " + error.message);
        return;
      }
      setAnexosProjeto(data);
    });

    return () => {
      ativo = false;
    };
  }, [paredes]);

  const projeto = projetos.find((p) => p.id === projetoId);

  async function anexarProjetoParede(item: Parede, arquivo: File) {
    const projetoOrigem = projeto?.origem_id;
    const paredeOrigem = item.origem_id;
    const chave = String(paredeOrigem ?? item.id);
    if (!projetoOrigem || !paredeOrigem) {
      toast.error("Não foi possível identificar esta parede no cadastro canônico.");
      return;
    }

    setAnexandoProjeto((estado) => ({ ...estado, [chave]: true }));
    const supabase = createClient();
    let caminho = "";
    let enviado = false;
    let metadadoSalvo = false;

    try {
      if (arquivo.size <= 0 || arquivo.size > MAX_FOTO_BYTES) {
        throw new Error("O arquivo precisa ter no máximo 20 MB.");
      }
      const ehPdf = arquivo.type === "application/pdf";
      if (!ehPdf && !arquivo.type.startsWith("image/")) {
        throw new Error("Escolha um PDF ou uma imagem técnica.");
      }

      const pronto = ehPdf ? arquivo : await otimizarFoto(arquivo);
      const extensao = pronto.type === "application/pdf" ? "pdf" : "jpg";
      const arquivoId = crypto.randomUUID();
      const metadadoId = crypto.randomUUID();
      const { data: sessao } = await supabase.auth.getUser();
      if (!sessao.user) {
        throw new Error("Sua sessão expirou. Entre novamente para anexar o projeto.");
      }

      caminho = caminhoProjetoParede({
        usuarioId: sessao.user.id,
        projetoId: projetoOrigem,
        paredeId: paredeOrigem,
        anexoId: arquivoId,
        extensao,
      });
      const envio = await supabase.storage.from(BUCKET_AUDITORIA).upload(caminho, pronto, {
        cacheControl: "3600",
        contentType: pronto.type,
        upsert: false,
      });
      if (envio.error) throw new Error("Não foi possível enviar o projeto: " + envio.error.message);
      enviado = true;

      const { data, error } = await salvarProjetoParedeAnexo({
        projeto_id: projetoOrigem,
        parede_id: paredeOrigem,
        anexo: {
          id: metadadoId,
          name: pronto.name,
          type: pronto.type,
          size: pronto.size,
          path: caminho,
        },
      });
      if (error) throw error;
      metadadoSalvo = true;

      const resultado = (data ?? {}) as {
        id?: string;
        old_path?: string | null;
        storage_bucket?: string;
        storage_path?: string;
        nome_arquivo?: string;
        mime_type?: string;
        tamanho_bytes?: number;
      };
      const url = await criarUrlAssinadaOpcional(
        supabase,
        BUCKET_AUDITORIA,
        caminho,
        60 * 60,
      );
      const caminhoDoUsuario = `produto/${segmentoSeguro(sessao.user.id)}/`;
      const caminhoLegadoDoUsuario = `${segmentoSeguro(sessao.user.id)}/`;
      if (
        resultado.old_path &&
        (resultado.old_path.startsWith(caminhoDoUsuario) ||
          resultado.old_path.startsWith(caminhoLegadoDoUsuario))
      ) {
        await supabase.storage.from(BUCKET_AUDITORIA).remove([resultado.old_path]);
      }

      setAnexosProjeto((estado) => ({
        ...estado,
        [chave]: {
          id: resultado.id ?? metadadoId,
          nome_arquivo: resultado.nome_arquivo ?? pronto.name,
          mime_type: resultado.mime_type ?? pronto.type,
          tamanho_bytes: resultado.tamanho_bytes ?? pronto.size,
          storage_bucket: resultado.storage_bucket ?? BUCKET_AUDITORIA,
          storage_path: resultado.storage_path ?? caminho,
          url,
        },
      }));
      toast.success(
        url
          ? `Projeto da ${item.nome} salvo.`
          : `Projeto da ${item.nome} salvo. A visualização será preparada ao recarregar.`,
      );
    } catch (caught) {
      if (enviado && !metadadoSalvo && caminho) {
        await supabase.storage.from(BUCKET_AUDITORIA).remove([caminho]);
      }
      toast.error(
        "Não foi possível salvar o projeto da parede: " +
          (caught instanceof Error ? caught.message : "erro inesperado")
      );
    } finally {
      setAnexandoProjeto((estado) => ({ ...estado, [chave]: false }));
    }
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novo.trim().toUpperCase();
    if (!nome || ocupado || projetoId == null) return;
    setOcupado(true);
    const ordem = Math.max(0, ...(paredes ?? []).map((i) => i.ordem)) + 1;
    const { error } = await mutarQualidade("CONFIG_ADICIONAR_PAREDE", {
      projeto: projeto?.nome,
      nome,
      ordem,
    });
    setOcupado(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "Essa parede já existe nesse projeto."
          : error.message
      );
      return;
    }
    setNovo("");
    carregar();
  }

  /** Os nomes que a sequência atual geraria, já formatados. */
  function nomesDaSequencia(): string[] {
    const a = parseInt(de, 10);
    const b = parseInt(ate, 10);
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return [];
    const largura = comZero ? String(b).length : 0;
    const pre = prefixo.trim().toUpperCase();
    const out: string[] = [];
    for (let n = a; n <= b && out.length <= MAX_SEQUENCIA; n++)
      out.push(pre + String(n).padStart(largura, "0"));
    return out;
  }

  async function criarSequencia() {
    if (ocupado || projetoId == null) return;
    const nomes = nomesDaSequencia();
    if (nomes.length === 0) {
      toast.error("Confira os números: o final tem de ser maior que o inicial.");
      return;
    }
    if (nomes.length > MAX_SEQUENCIA) {
      toast.error(`Máximo de ${MAX_SEQUENCIA} paredes por vez.`);
      return;
    }

    // o que já existe é ignorado em silêncio, senão o banco recusa o lote
    const existentes = new Set((paredes ?? []).map((p) => p.nome.toUpperCase()));
    const criar = nomes.filter((n) => !existentes.has(n));
    if (criar.length === 0) {
      toast.error("Todas essas paredes já existem nesse projeto.");
      return;
    }

    setOcupado(true);
    const { error } = await mutarQualidade("CONFIG_ADICIONAR_PAREDES", {
      projeto: projeto?.nome,
      nomes: criar,
    });
    setOcupado(false);
    if (error) {
      toast.error("Não foi possível criar: " + error.message);
      return;
    }
    const jaTinha = nomes.length - criar.length;
    toast.success(
      `${criar.length} parede${criar.length === 1 ? "" : "s"} criada${
        criar.length === 1 ? "" : "s"
      }` + (jaTinha > 0 ? ` · ${jaTinha} já existia${jaTinha === 1 ? "" : "m"}` : "")
    );
    carregar();
  }

  async function renomear(item: Parede, nome: string) {
    const { error } = await mutarQualidade("CONFIG_RENOMEAR_PAREDE", {
      projeto: projeto?.nome,
      nome_atual: item.nome,
      parede_ordem: item.ordem,
      nome_novo: nome,
    });
    if (error) {
      toast.error(
        error.code === "23505"
          ? `Já existe uma parede ${nome} nesse projeto.`
          : error.message
      );
      return;
    }
    toast.success(`${item.nome} agora é ${nome}.`);
    await carregar();
  }

  /* A metragem é da POSIÇÃO no projeto: mudar aqui vale para todas as
     casas, inclusive as já auditadas. É o comportamento certo — se a
     área mudou, foi o desenho da parede que mudou, não o de uma casa. */
  async function salvarArea(item: Parede, m2: number | null) {
    const { error } = await mutarQualidade("CONFIG_ALTERAR_AREA_PAREDE", {
      projeto: projeto?.nome,
      nome_atual: item.nome,
      parede_ordem: item.ordem,
      area_m2: m2,
    });
    if (error) {
      toast.error("Não foi possível salvar a metragem: " + error.message);
      return;
    }
    toast.success(
      m2 == null
        ? `Metragem de ${item.nome} apagada.`
        : `${item.nome}: ${m2.toLocaleString("pt-BR")} m².`
    );
    await carregar();
  }

  async function reativar(item: Parede) {
    const { error } = await mutarQualidade("CONFIG_REATIVAR_PAREDE", {
      projeto: projeto?.nome,
      nome_atual: item.nome,
      parede_ordem: item.ordem,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    carregar();
  }

  async function excluir(item: Parede) {
    const { error } = await mutarQualidade("CONFIG_EXCLUIR_PAREDE", {
      projeto: projeto?.nome,
      nome_atual: item.nome,
      parede_ordem: item.ordem,
    });
    if (error) {
      toast.error("Não foi possível excluir: " + error.message);
      return;
    }
    toast.success(`${item.nome} excluída.`);
    carregar();
  }

  const previa = nomesDaSequencia();
  const novasDaPrevia = previa.filter(
    (n) => !(paredes ?? []).some((p) => p.nome.toUpperCase() === n)
  ).length;

  return (
    <section className="cartao">
      <h2>Paredes</h2>
      <p className="sub">Cada projeto tem suas próprias posições de parede</p>
      <div className="corpo">
        <select
          value={projetoId ?? ""}
          onChange={(e) => setProjetoId(Number(e.target.value))}
          className="campo mb-3"
        >
          {projetos.length === 0 && <option value="">Nenhum projeto</option>}
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.ativo ? "" : " (desativado)"}
            </option>
          ))}
        </select>
        {paredes && (
          <ul
            className="mb-3 max-h-72 overflow-y-auto"
            style={{ borderTop: "1px solid var(--color-line)" }}
          >
            {paredes.map((i) => (
              <LinhaConfig
                key={i.id}
                item={i}
                tabela="paredes"
                projetoDaParede={projeto?.nome}
                area={{
                  valor: i.area_m2 == null ? null : Number(i.area_m2),
                  aoSalvar: (m2) => salvarArea(i, m2),
                }}
                anexoProjeto={
                  i.origem_id ? anexosProjeto[String(i.origem_id)] ?? null : null
                }
                anexandoProjeto={
                  Boolean(anexandoProjeto[String(i.origem_id ?? i.id)])
                }
                aoAnexarProjeto={(arquivo) => {
                  void anexarProjetoParede(i, arquivo);
                }}
                onRenomear={(nome) => renomear(i, nome)}
                onReativar={() => reativar(i)}
                onExcluir={() => excluir(i)}
              />
            ))}
            {paredes.length === 0 && (
              <li className="py-3 text-xs text-ink-3">
                Nenhuma parede nesse projeto.
              </li>
            )}
          </ul>
        )}

        <form onSubmit={adicionar} className="flex gap-2">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Adicionar parede (ex.: P13)"
            className="campo min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={ocupado || !novo.trim() || projetoId == null}
            className="btn btn-forte"
          >
            Adicionar
          </button>
        </form>

        <button
          type="button"
          onClick={() => setEmLote(!emLote)}
          className="mt-2.5 text-[11.5px] font-semibold"
          style={{ color: "var(--color-info)" }}
          aria-expanded={emLote}
        >
          {emLote ? "Fechar" : "Criar várias em sequência (P1 até P90)"}
        </button>

        {emLote && (
          <div
            className="mt-2.5 rounded-lg border p-3"
            style={{
              borderColor: "var(--color-line-2)",
              background: "var(--color-papel-2)",
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="rotulo">Prefixo</label>
                <input
                  value={prefixo}
                  onChange={(e) => setPrefixo(e.target.value)}
                  placeholder="P"
                  className="campo"
                />
              </div>
              <div>
                <label className="rotulo">De</label>
                <input
                  type="number"
                  min={0}
                  value={de}
                  onChange={(e) => setDe(e.target.value)}
                  className="campo"
                />
              </div>
              <div>
                <label className="rotulo">Até</label>
                <input
                  type="number"
                  min={0}
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                  className="campo"
                />
              </div>
            </div>

            <label className="mt-2.5 flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={comZero}
                onChange={(e) => setComZero(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              Zero à esquerda (P01, P02… ordena melhor em lista longa)
            </label>

            <p className="sub" style={{ marginTop: 10 }}>
              {previa.length === 0 ? (
                "Confira os números: o final tem de ser maior ou igual ao inicial."
              ) : previa.length > MAX_SEQUENCIA ? (
                `Máximo de ${MAX_SEQUENCIA} paredes por vez.`
              ) : (
                <>
                  Vai criar <b>{novasDaPrevia}</b> de {previa.length}:{" "}
                  <span className="mono">
                    {previa.slice(0, 3).join(", ")}
                    {previa.length > 4 ? " … " : previa.length === 4 ? ", " : ""}
                    {previa.length > 3 ? previa[previa.length - 1] : ""}
                  </span>
                  {novasDaPrevia < previa.length && (
                    <>
                      {" "}
                      · {previa.length - novasDaPrevia} já existe
                      {previa.length - novasDaPrevia === 1 ? "" : "m"} e
                      {previa.length - novasDaPrevia === 1 ? " será" : " serão"}{" "}
                      ignorada
                      {previa.length - novasDaPrevia === 1 ? "" : "s"}
                    </>
                  )}
                </>
              )}
            </p>

            <button
              type="button"
              onClick={criarSequencia}
              disabled={
                ocupado ||
                projetoId == null ||
                novasDaPrevia === 0 ||
                previa.length > MAX_SEQUENCIA
              }
              className="btn btn-forte mt-2.5 w-full"
            >
              {ocupado
                ? "Criando…"
                : `Criar ${novasDaPrevia} parede${novasDaPrevia === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
