"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  alternarEquipeAction,
  alternarProjetoAction,
  convidarUsuarioAction,
  excluirUsuarioAction,
  removerMembroAction,
  salvarEquipeAction,
  salvarProjetoAction,
  salvarUsuarioAction,
  vincularMembroAction,
} from "@/app/(app)/cadastros/actions";
import type { EquipeRow, ObraProjetoRow, PerfilAcessoRow } from "@/lib/governanca";

type Aba = "usuarios" | "equipes" | "projetos";
type Membro = { equipe_id: string; user_id: string; papel_equipe: string };
type ActionResult = { ok: boolean; message: string };

const MODULOS = [
  "AUDITORIA",
  "INDICADORES",
  "HISTÓRICO",
  "FORNECEDORES",
  "DOCUMENTOS",
  "NÃO CONFORMIDADES",
  "PLANOS DE AÇÃO",
  "CONTROLE DE PRODUÇÃO",
  "SUPORTE",
  "CONFIGURAÇÃO",
  "CADASTROS",
] as const;

const PRESETS = [
  ["GESTAO", "Gestão", "Acesso completo e governança."],
  ["LEITURA_GERAL", "Leitura geral", "Todos os dados e relatórios, sem edição."],
  ["INDICADORES", "Somente indicadores", "FPY/Indicadores, sem auditoria ou mutações."],
  ["INSPETOR", "Inspetor", "Auditoria e rotinas operacionais autorizadas."],
  ["PERSONALIZADO", "Personalizado", "Permissões módulo a módulo."],
] as const;

function normalizarPermissoes(raw: PerfilAcessoRow["permissions"]) {
  return Object.fromEntries(
    MODULOS.map((modulo) => [
      modulo,
      {
        ver: Boolean(raw?.[modulo]?.ver),
        editar: Boolean(raw?.[modulo]?.editar),
      },
    ])
  ) as Record<(typeof MODULOS)[number], { ver: boolean; editar: boolean }>;
}

export default function GovernancaCadastros({
  usuarios,
  equipes,
  membros,
  projetos,
  pagina,
  totalPaginas,
  busca,
}: {
  usuarios: PerfilAcessoRow[];
  equipes: EquipeRow[];
  membros: Membro[];
  projetos: ObraProjetoRow[];
  pagina: number;
  totalPaginas: number;
  busca: string;
}) {
  const [aba, setAba] = useState<Aba>("usuarios");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-line bg-papel p-2 shadow-sm">
        {([
          ["usuarios", "Usuários e permissões"],
          ["equipes", "Equipes"],
          ["projetos", "Projetos / entidades"],
        ] as const).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            className={`btn ${aba === id ? "btn-forte" : ""}`}
            onClick={() => setAba(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "usuarios" && (
        <UsuariosTab
          usuarios={usuarios}
          pagina={pagina}
          totalPaginas={totalPaginas}
          busca={busca}
        />
      )}
      {aba === "equipes" && <EquipesTab equipes={equipes} membros={membros} usuarios={usuarios} />}
      {aba === "projetos" && <ProjetosTab projetos={projetos} />}
    </div>
  );
}

function UsuariosTab({
  usuarios,
  pagina,
  totalPaginas,
  busca,
}: {
  usuarios: PerfilAcessoRow[];
  pagina: number;
  totalPaginas: number;
  busca: string;
}) {
  const router = useRouter();
  const [termo, setTermo] = useState(busca);

  function navegar(proximaPagina: number, novaBusca = termo) {
    const params = new URLSearchParams();
    if (novaBusca.trim()) params.set("busca", novaBusca.trim());
    if (proximaPagina > 1) params.set("pagina", String(proximaPagina));
    router.push(`/cadastros${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <>
      <section className="rounded-2xl border border-line bg-papel p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div>
            <h2 className="text-base font-semibold text-ink">Governança de usuários</h2>
            <p className="mt-1 text-sm leading-6 text-ink-2">
              A permissão de tela é refletida no backend. Gestão é o único perfil que administra esta área.
            </p>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                navegar(1);
              }}
            >
              <input
                className="campo flex-1"
                placeholder="Buscar por nome ou e-mail"
                value={termo}
                onChange={(event) => setTermo(event.target.value)}
              />
              <button className="btn" type="submit">Buscar</button>
              {busca && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setTermo("");
                    navegar(1, "");
                  }}
                >
                  Limpar
                </button>
              )}
            </form>
          </div>
          <ConviteUsuario />
        </div>
      </section>

      <div className="grid gap-3">
        {usuarios.length === 0 ? (
          <div className="rounded-2xl border border-line bg-papel p-6 text-sm text-ink-2">
            Nenhum usuário encontrado.
          </div>
        ) : (
          usuarios.map((usuario) => (
            <UsuarioCard key={usuario.user_id ?? usuario.email} usuario={usuario} />
          ))
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn" disabled={pagina <= 1} onClick={() => navegar(pagina - 1)}>
            Anterior
          </button>
          <span className="px-2 text-xs text-ink-3">{pagina} / {totalPaginas}</span>
          <button className="btn" disabled={pagina >= totalPaginas} onClick={() => navegar(pagina + 1)}>
            Próxima
          </button>
        </div>
      )}
    </>
  );
}

function ConviteUsuario() {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [preset, setPreset] = useState("LEITURA_GERAL");

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData();
    form.set("nome", nome);
    form.set("email", email);
    form.set("preset", preset);
    executar(startTransition, convidarUsuarioAction, form, () => {
      setNome("");
      setEmail("");
    });
  }

  return (
    <form onSubmit={enviar} className="rounded-xl border border-line bg-papel-2 p-3">
      <div className="text-xs font-semibold text-ink">Convidar usuário</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input className="campo" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input className="campo" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="mt-2 flex gap-2">
        <select className="campo min-w-0 flex-1" value={preset} onChange={(e) => setPreset(e.target.value)}>
          {PRESETS.filter(([id]) => id !== "PERSONALIZADO").map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <button className="btn btn-forte" disabled={pending || !nome.trim() || !email.trim()}>
          {pending ? "Enviando…" : "Convidar"}
        </button>
      </div>
    </form>
  );
}

function UsuarioCard({ usuario }: { usuario: PerfilAcessoRow }) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(usuario.full_name ?? "");
  const presetInicial = PRESETS.some(([id]) => id === usuario.role)
    ? usuario.role
    : "PERSONALIZADO";
  const [preset, setPreset] = useState(presetInicial);
  const [status, setStatus] = useState(usuario.status || "APROVADO");
  const [suspensoAte, setSuspensoAte] = useState(() =>
    usuario.suspended_until ? usuario.suspended_until.slice(0, 16) : ""
  );
  const [permissions, setPermissions] = useState(() => normalizarPermissoes(usuario.permissions));

  const statusRotulo = status === "APROVADO" ? "Ativo" : status === "SUSPENSO" ? "Suspenso" : "Bloqueado";

  function salvar() {
    if (!usuario.user_id) return toast.error("Esse perfil ainda não está vinculado ao Auth.");
    const form = new FormData();
    form.set("user_id", usuario.user_id);
    form.set("nome", nome);
    form.set("preset", preset);
    form.set("status", status);
    form.set("version", String(usuario.version));
    form.set("suspended_until", suspensoAte);
    form.set("permissions", JSON.stringify(permissions));
    executar(startTransition, salvarUsuarioAction, form);
  }

  function excluir() {
    if (!usuario.user_id) return;
    if (!window.confirm(`Excluir o acesso de ${usuario.email}? A exclusão no Auth será recuperável.`)) return;
    const form = new FormData();
    form.set("user_id", usuario.user_id);
    executar(startTransition, excluirUsuarioAction, form);
  }

  return (
    <details className="group rounded-2xl border border-line bg-papel shadow-sm open:border-brand/60">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{usuario.full_name || usuario.email}</div>
          <div className="truncate text-xs text-ink-3">{usuario.email}</div>
        </div>
        <span className="rounded-full border border-line bg-papel-2 px-2.5 py-1 text-[10px] font-medium text-ink-2">
          {PRESETS.find(([id]) => id === preset)?.[1] ?? "Personalizado"}
        </span>
        <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-ink-2">{statusRotulo}</span>
        <span className="text-xs text-ink-3 transition group-open:rotate-180">⌄</span>
      </summary>

      <div className="border-t border-line p-4">
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="text-xs text-ink-2">
            Nome
            <input className="campo mt-1 w-full" value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="text-xs text-ink-2">
            Perfil
            <select className="campo mt-1 w-full" value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-2">
            Estado do acesso
            <select className="campo mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="APROVADO">Ativo</option>
              <option value="SUSPENSO">Suspenso temporariamente</option>
              <option value="BLOQUEADO">Bloqueado</option>
            </select>
          </label>
        </div>

        {status === "SUSPENSO" && (
          <label className="mt-3 block max-w-sm text-xs text-ink-2">
            Suspenso até
            <input
              className="campo mt-1 w-full"
              type="datetime-local"
              value={suspensoAte}
              onChange={(e) => setSuspensoAte(e.target.value)}
            />
          </label>
        )}

        {preset === "PERSONALIZADO" && (
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] bg-papel-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
              <span>Módulo</span><span className="text-center">Ver</span><span className="text-center">Editar</span>
            </div>
            {MODULOS.map((modulo) => (
              <div key={modulo} className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center border-t border-line px-3 py-2 text-xs text-ink-2">
                <span>{modulo}</span>
                <input
                  aria-label={`Ver ${modulo}`}
                  type="checkbox"
                  checked={permissions[modulo].ver}
                  onChange={(e) => setPermissions((atual) => ({
                    ...atual,
                    [modulo]: { ...atual[modulo], ver: e.target.checked, editar: e.target.checked ? atual[modulo].editar : false },
                  }))}
                />
                <input
                  aria-label={`Editar ${modulo}`}
                  type="checkbox"
                  checked={permissions[modulo].editar}
                  onChange={(e) => setPermissions((atual) => ({
                    ...atual,
                    [modulo]: { ver: e.target.checked ? true : atual[modulo].ver, editar: e.target.checked },
                  }))}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-ink-3">
            Versão {usuario.version}. Se outro gestor salvar primeiro, esta edição é recusada para evitar sobrescrita silenciosa.
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={pending} onClick={excluir}>Excluir</button>
            <button type="button" className="btn btn-forte" disabled={pending || !nome.trim()} onClick={salvar}>
              {pending ? "Salvando…" : "Salvar acesso"}
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}

function EquipesTab({ equipes, membros, usuarios }: { equipes: EquipeRow[]; membros: Membro[]; usuarios: PerfilAcessoRow[] }) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const usuariosVinculaveis = usuarios.filter((u): u is PerfilAcessoRow & { user_id: string } => Boolean(u.user_id));

  function criar(event: React.FormEvent) {
    event.preventDefault();
    const form = new FormData();
    form.set("nome", nome);
    form.set("descricao", descricao);
    executar(startTransition, salvarEquipeAction, form, () => {
      setNome("");
      setDescricao("");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form onSubmit={criar} className="h-fit rounded-2xl border border-line bg-papel p-4 shadow-sm">
        <h2 className="text-base font-semibold text-ink">Nova equipe</h2>
        <input className="campo mt-3 w-full" placeholder="Nome da equipe" value={nome} onChange={(e) => setNome(e.target.value)} />
        <textarea className="campo mt-2 min-h-20 w-full" placeholder="Descrição (opcional)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <button className="btn btn-forte mt-2" disabled={pending || !nome.trim()}>Criar equipe</button>
      </form>

      <div className="grid gap-3">
        {equipes.map((equipe) => (
          <EquipeCard
            key={equipe.id}
            equipe={equipe}
            membros={membros.filter((m) => m.equipe_id === equipe.id)}
            usuarios={usuariosVinculaveis}
          />
        ))}
        {equipes.length === 0 && <Vazio texto="Nenhuma equipe cadastrada." />}
      </div>
    </div>
  );
}

function EquipeCard({
  equipe,
  membros,
  usuarios,
}: {
  equipe: EquipeRow;
  membros: Membro[];
  usuarios: Array<PerfilAcessoRow & { user_id: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(equipe.nome);
  const [descricao, setDescricao] = useState(equipe.descricao ?? "");
  const [novoMembro, setNovoMembro] = useState("");
  const porId = useMemo(() => new Map(usuarios.map((u) => [u.user_id, u])), [usuarios]);

  function salvar() {
    const form = new FormData();
    form.set("id", equipe.id);
    form.set("nome", nome);
    form.set("descricao", descricao);
    executar(startTransition, salvarEquipeAction, form);
  }

  function alternar() {
    const form = new FormData();
    form.set("id", equipe.id);
    form.set("ativo", String(equipe.ativo));
    executar(startTransition, alternarEquipeAction, form);
  }

  function adicionarMembro() {
    if (!novoMembro) return;
    const form = new FormData();
    form.set("equipe_id", equipe.id);
    form.set("user_id", novoMembro);
    executar(startTransition, vincularMembroAction, form, () => setNovoMembro(""));
  }

  return (
    <section className="rounded-2xl border border-line bg-papel p-4 shadow-sm" style={{ opacity: equipe.ativo ? 1 : 0.65 }}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input className="campo" value={descricao} placeholder="Descrição" onChange={(e) => setDescricao(e.target.value)} />
        <div className="flex gap-2">
          <button type="button" className="btn" disabled={pending} onClick={salvar}>Salvar</button>
          <button type="button" className="btn" disabled={pending} onClick={alternar}>{equipe.ativo ? "Desativar" : "Reativar"}</button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {membros.map((membro) => {
          const usuario = porId.get(membro.user_id);
          return (
            <span key={membro.user_id} className="inline-flex items-center gap-1 rounded-full border border-line bg-papel-2 px-2.5 py-1 text-xs text-ink-2">
              {usuario?.full_name || usuario?.email || membro.user_id.slice(0, 8)}
              <button
                type="button"
                aria-label="Remover da equipe"
                className="ml-1 text-ink-3 hover:text-ink"
                onClick={() => {
                  const form = new FormData();
                  form.set("equipe_id", equipe.id);
                  form.set("user_id", membro.user_id);
                  executar(startTransition, removerMembroAction, form);
                }}
              >×</button>
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <select className="campo min-w-0 flex-1" value={novoMembro} onChange={(e) => setNovoMembro(e.target.value)}>
          <option value="">Adicionar usuário desta página…</option>
          {usuarios
            .filter((u) => !membros.some((m) => m.user_id === u.user_id))
            .map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name || u.email}</option>)}
        </select>
        <button type="button" className="btn" disabled={!novoMembro || pending} onClick={adicionarMembro}>Adicionar</button>
      </div>
    </section>
  );
}

function ProjetosTab({ projetos }: { projetos: ObraProjetoRow[] }) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState("");

  function criar(event: React.FormEvent) {
    event.preventDefault();
    const form = new FormData();
    form.set("nome", nome);
    form.set("origem", "CADASTROS");
    executar(startTransition, salvarProjetoAction, form, () => setNome(""));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={criar} className="flex flex-wrap gap-2 rounded-2xl border border-line bg-papel p-4 shadow-sm">
        <input className="campo min-w-64 flex-1" placeholder="Novo projeto / entidade" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="btn btn-forte" disabled={pending || !nome.trim()}>Cadastrar</button>
      </form>

      <div className="grid gap-2 md:grid-cols-2">
        {projetos.map((projeto) => <ProjetoCard key={projeto.id} projeto={projeto} />)}
        {projetos.length === 0 && <Vazio texto="Nenhum projeto / entidade cadastrado." />}
      </div>
    </div>
  );
}

function ProjetoCard({ projeto }: { projeto: ObraProjetoRow }) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(projeto.nome ?? projeto.codigo);

  return (
    <section className="rounded-2xl border border-line bg-papel p-3 shadow-sm" style={{ opacity: projeto.status === "ativo" ? 1 : 0.65 }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input className="campo w-full" value={nome} onChange={(e) => setNome(e.target.value)} />
          <div className="mt-1 text-[10px] text-ink-3">{projeto.codigo} · {projeto.origem || "sem origem"}</div>
        </div>
        <button
          type="button"
          className="btn"
          disabled={pending || !nome.trim()}
          onClick={() => {
            const form = new FormData();
            form.set("id", projeto.id);
            form.set("nome", nome);
            executar(startTransition, salvarProjetoAction, form);
          }}
        >Salvar</button>
        <button
          type="button"
          className="btn"
          disabled={pending}
          onClick={() => {
            const form = new FormData();
            form.set("id", projeto.id);
            form.set("status", projeto.status);
            executar(startTransition, alternarProjetoAction, form);
          }}
        >{projeto.status === "ativo" ? "Desativar" : "Reativar"}</button>
      </div>
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="rounded-2xl border border-line bg-papel p-6 text-sm text-ink-2">{texto}</div>;
}

function executar(
  startTransition: React.TransitionStartFunction,
  action: (formData: FormData) => Promise<ActionResult>,
  formData: FormData,
  onSuccess?: () => void
) {
  startTransition(async () => {
    const resultado = await action(formData);
    if (resultado.ok) {
      toast.success(resultado.message);
      onSuccess?.();
    } else {
      toast.error(resultado.message);
    }
  });
}
