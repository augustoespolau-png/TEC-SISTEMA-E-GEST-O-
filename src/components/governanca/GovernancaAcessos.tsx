"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import {
  createGovernanceTeam,
  createGovernanceUser,
  deleteGovernanceTeam,
  deleteGovernanceUser,
  loadGovernancePage,
  saveGovernanceTeamMembers,
  sendGovernancePasswordReset,
  updateGovernanceTeam,
  updateGovernanceUser,
  type CreateGovernanceTeamInput,
  type CreateGovernanceUserInput,
  type UpdateGovernanceTeamInput,
  type UpdateGovernanceUserInput,
} from "@/app/actions/governanca";
import {
  GOVERNANCE_MODULES,
  permissionRowsForRole,
  roleLabel,
  statusLabel,
  type AccountStatus,
  type GovernancePermission,
  type GovernanceProject,
  type GovernanceSnapshot,
  type GovernanceTeam,
  type GovernanceUser,
} from "@/lib/governanca-types";

type Tab = "usuarios" | "equipes";

type UserDraft = Pick<
  GovernanceUser,
  | "id"
  | "nome"
  | "email"
  | "role"
  | "status"
  | "suspenso_ate"
  | "permissions"
  | "project_scope"
  | "project_ids"
>;

type TeamDraft = Pick<
  GovernanceTeam,
  "id" | "nome" | "descricao" | "projeto_id" | "codigo" | "ativo"
>;

function draftFromUser(user: GovernanceUser): UserDraft {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    role: user.role,
    status: user.status,
    suspenso_ate: user.suspenso_ate,
    permissions: user.permissions.map((permission) => ({ ...permission })),
    project_scope: user.project_scope,
    project_ids: [...user.project_ids],
  };
}

function emptyUserDraft(): UserDraft {
  return {
    id: "",
    nome: "",
    email: "",
    role: "consultor",
    status: "active",
    suspenso_ate: null,
    permissions: permissionRowsForRole("consultor"),
    project_scope: "all",
    project_ids: [],
  };
}

function draftFromTeam(team: GovernanceTeam): TeamDraft {
  return {
    id: team.id,
    nome: team.nome,
    descricao: team.descricao,
    projeto_id: team.projeto_id,
    codigo: team.codigo,
    ativo: team.ativo,
  };
}

function emptyTeamDraft(): TeamDraft {
  return {
    id: "",
    nome: "",
    descricao: "",
    projeto_id: null,
    codigo: null,
    ativo: true,
  };
}

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function statusClass(status: AccountStatus) {
  return `gov-status gov-status-${status}`;
}

export default function GovernancaAcessos({
  initialSnapshot,
}: {
  initialSnapshot: GovernanceSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [tab, setTab] = useState<Tab>("usuarios");
  const [pageLoading, setPageLoading] = useState(false);
  const [pageSearch, setPageSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSnapshot.users[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<UserDraft | null>(
    initialSnapshot.users[0] ? draftFromUser(initialSnapshot.users[0]) : null,
  );
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const selectedUser = snapshot.users.find((user) => user.id === selectedId) ?? null;
  const shownUsers = useMemo(() => {
    const query = pageSearch.trim().toLowerCase();
    if (!query) return snapshot.users;
    return snapshot.users.filter((user) =>
      `${user.nome} ${user.email} ${roleLabel(user.role)}`
        .toLowerCase()
        .includes(query),
    );
  }, [pageSearch, snapshot.users]);

  const activeUsers = snapshot.users.filter((user) => user.status === "active").length;
  const managers = snapshot.users.filter((user) => user.role === "gestao").length;
  const restrictedUsers = snapshot.users.filter(
    (user) => user.project_scope === "selected",
  ).length;
  const kpiValue = (value: number) => (snapshot.configured ? value : "—");

  function selectUser(user: GovernanceUser) {
    setCreating(false);
    setSelectedId(user.id);
    setDraft(draftFromUser(user));
  }

  function startNewUser() {
    setCreating(true);
    setSelectedId(null);
    setDraft(emptyUserDraft());
    setTab("usuarios");
  }

  function applyUser(user: GovernanceUser, wasNew = false) {
    setSnapshot((current) => {
      const exists = current.users.some((item) => item.id === user.id);
      const users = exists
        ? current.users.map((item) => (item.id === user.id ? user : item))
        : current.page === 1
          ? [user, ...current.users].slice(0, current.pageSize)
          : current.users;
      const directoryExists = current.directory_users.some(
        (item) => item.id === user.id,
      );
      return {
        ...current,
        users: [...users].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        directory_users: directoryExists
          ? current.directory_users.map((item) =>
              item.id === user.id
                ? { id: user.id, nome: user.nome, email: user.email }
                : item,
            )
          : wasNew
            ? [
                ...current.directory_users,
                { id: user.id, nome: user.nome, email: user.email },
              ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
            : current.directory_users,
      };
    });
    setSelectedId(user.id);
    setDraft(draftFromUser(user));
    setCreating(false);
  }

  async function saveUser() {
    if (!draft || busy) return;
    setBusy(draft.id ? `usuario:${draft.id}` : "usuario:novo");
    const result = draft.id
      ? await updateGovernanceUser({
          id: draft.id,
          nome: draft.nome,
          email: draft.email,
          role: draft.role,
          status: draft.status,
          suspenso_ate: draft.suspenso_ate,
          permissions: draft.permissions,
          project_scope: draft.project_scope,
          project_ids: draft.project_ids,
        } satisfies UpdateGovernanceUserInput)
      : await createGovernanceUser({
          nome: draft.nome,
          email: draft.email,
          role: draft.role,
          permissions: draft.permissions,
          project_scope: draft.project_scope,
          project_ids: draft.project_ids,
        } satisfies CreateGovernanceUserInput);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    applyUser(result.data, !draft.id);
    toast.success(draft.id ? "Usuário atualizado." : "Convite enviado por e-mail.");
  }

  async function resetPassword(user: GovernanceUser) {
    if (busy) return;
    setBusy(`reset:${user.id}`);
    const result = await sendGovernancePasswordReset(user.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Link de redefinição enviado para o e-mail do usuário.");
  }

  async function removeUser(user: GovernanceUser) {
    if (busy) return;
    if (
      !window.confirm(
        `Excluir a conta de ${user.nome || user.email}? Esta ação remove o acesso e não pode ser desfeita.`,
      )
    ) {
      return;
    }
    setBusy(`delete:${user.id}`);
    const result = await deleteGovernanceUser(user.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const remaining = snapshot.users.filter((item) => item.id !== user.id);
    setSnapshot((current) => ({
      ...current,
      users: current.users.filter((item) => item.id !== user.id),
      directory_users: current.directory_users.filter((item) => item.id !== user.id),
    }));
    const next = remaining[0] ?? null;
    setSelectedId(next?.id ?? null);
    setDraft(next ? draftFromUser(next) : null);
    toast.success("Usuário excluído.");
  }

  async function changePage(nextPage: number) {
    if (nextPage < 1 || pageLoading || busy) return;
    setPageLoading(true);
    const result = await loadGovernancePage(nextPage);
    setPageLoading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setSnapshot(result.data);
    const first = result.data.users[0] ?? null;
    setSelectedId(first?.id ?? null);
    setDraft(first ? draftFromUser(first) : null);
    setCreating(false);
    setPageSearch("");
  }

  function replaceTeam(team: GovernanceTeam, wasNew = false) {
    setSnapshot((current) => ({
      ...current,
      teams: wasNew
        ? [...current.teams, team].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        : current.teams.map((item) => (item.id === team.id ? team : item)),
    }));
  }

  return (
    <main className="tela governanca-tela">
      <section className="cartao gov-hero">
        <div>
          <p className="gov-eyebrow">Governança de acessos</p>
          <h1 className="gov-title">Cadastros e permissões</h1>
          <p className="sub gov-lead">
            Convide usuários, organize equipes e determine exatamente quais
            módulos e projetos cada pessoa pode consultar ou alterar.
          </p>
        </div>
        <div className="gov-kpis" aria-label="Resumo da governança">
          <div><b>{kpiValue(snapshot.users.length)}</b><span>nesta página</span></div>
          <div><b>{kpiValue(activeUsers)}</b><span>ativos</span></div>
          <div><b>{kpiValue(managers)}</b><span>gestores</span></div>
          <div><b>{kpiValue(restrictedUsers)}</b><span>com escopo</span></div>
        </div>
      </section>

      {snapshot.error && (
        <section className="cartao gov-alert" role="alert">
          <strong>Ativação do cadastro pendente</strong>
          <p>{snapshot.error}</p>
          <span>
            Configure a chave administrativa somente no servidor e aplique as
            migrations <code>050_governanca_acessos.sql</code> e
            <code>051_equipes_cadastros.sql</code>. Depois, recarregue esta
            tela para liberar o CRUD.
          </span>
        </section>
      )}

      <div className="gov-tabs" role="tablist" aria-label="Seções de governança">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "usuarios"}
          className={tab === "usuarios" ? "on" : ""}
          onClick={() => setTab("usuarios")}
        >
          Usuários
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "equipes"}
          className={tab === "equipes" ? "on" : ""}
          onClick={() => setTab("equipes")}
        >
          Equipes
        </button>
      </div>

      {!snapshot.configured ? (
        <section className="cartao gov-empty">
          <h2>Cadastro administrativo ainda não ativado</h2>
          <p>
            A interface já está protegida para Gestão. Falta apenas a ativação
            única do serviço administrativo para que você possa criar contas,
            equipes e permissões diretamente aqui. Nenhuma operação é simulada.
          </p>
        </section>
      ) : tab === "usuarios" ? (
        <div className="gov-layout">
          <section className="cartao gov-list-card">
            <div className="gov-card-heading">
              <div>
                <h2>Usuários do sistema</h2>
                <p className="sub">Selecione uma conta para editar acesso, status e escopo.</p>
              </div>
              <button type="button" className="btn btn-forte" onClick={startNewUser} disabled={Boolean(busy)}>
                + Novo usuário
              </button>
            </div>
            <div className="gov-list-toolbar">
              <input
                className="campo"
                value={pageSearch}
                onChange={(event) => setPageSearch(event.target.value)}
                placeholder="Buscar nome, e-mail ou perfil"
                aria-label="Buscar usuário"
              />
              <span className="gov-page-label">Página {snapshot.page}</span>
            </div>
            <div className="gov-user-table" aria-live="polite">
              <div className="gov-user-head"><span>Conta</span><span>Perfil</span><span>Status</span><span>Último acesso</span></div>
              {shownUsers.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  className={`gov-user-row ${selectedId === user.id && !creating ? "on" : ""}`}
                  onClick={() => selectUser(user)}
                >
                  <span className="gov-user-main"><b>{user.nome || "Sem nome"}</b><small>{user.email}</small></span>
                  <span>{roleLabel(user.role)}</span>
                  <span><i className={statusClass(user.status)}>{statusLabel(user.status)}</i></span>
                  <span className="gov-last-access">{formatDate(user.last_sign_in_at)}</span>
                </button>
              ))}
              {shownUsers.length === 0 && <p className="gov-no-results">Nenhum usuário nesta página.</p>}
            </div>
            <div className="gov-pagination">
              <button type="button" className="btn" disabled={snapshot.page <= 1 || pageLoading || Boolean(busy)} onClick={() => void changePage(snapshot.page - 1)}>← Anterior</button>
              <span>{pageLoading ? "Carregando…" : `Página ${snapshot.page}`}</span>
              <button type="button" className="btn" disabled={!snapshot.hasNextPage || pageLoading || Boolean(busy)} onClick={() => void changePage(snapshot.page + 1)}>Próxima →</button>
            </div>
          </section>

          <UserEditor
            draft={draft}
            creating={creating}
            projects={snapshot.projects}
            teams={snapshot.teams}
            busy={busy}
            onChange={setDraft}
            onSave={() => void saveUser()}
            onCancel={() => {
              const current = selectedUser;
              setCreating(false);
              setDraft(current ? draftFromUser(current) : null);
            }}
            onReset={selectedUser ? () => void resetPassword(selectedUser) : undefined}
            onDelete={selectedUser ? () => void removeUser(selectedUser) : undefined}
          />
        </div>
      ) : (
        <TeamsPanel
          snapshot={snapshot}
          busy={busy}
          setBusy={setBusy}
          onTeamChange={replaceTeam}
          onSnapshot={setSnapshot}
        />
      )}
    </main>
  );
}

function UserEditor({
  draft,
  creating,
  projects,
  teams,
  busy,
  onChange,
  onSave,
  onCancel,
  onReset,
  onDelete,
}: {
  draft: UserDraft | null;
  creating: boolean;
  projects: GovernanceProject[];
  teams: GovernanceTeam[];
  busy: string | null;
  onChange: Dispatch<SetStateAction<UserDraft | null>>;
  onSave: () => void;
  onCancel: () => void;
  onReset?: () => void;
  onDelete?: () => void;
}) {
  if (!draft) {
    return (
      <section className="cartao gov-editor gov-editor-empty">
        <h2>Detalhes do usuário</h2>
        <p className="sub">Escolha uma conta na lista ou crie um novo usuário.</p>
      </section>
    );
  }

  const isSaving = busy === (draft.id ? `usuario:${draft.id}` : "usuario:novo");
  const isResetting = busy === (draft.id ? `reset:${draft.id}` : "");
  const isDeleting = busy === (draft.id ? `delete:${draft.id}` : "");

  function changePermission(
    modulo: GovernancePermission["modulo"],
    field: "pode_visualizar" | "pode_editar" | "pode_gerenciar",
    value: boolean,
  ) {
    onChange((current) => {
      if (!current) return current;
      return {
        ...current,
        permissions: current.permissions.map((permission) => {
          if (permission.modulo !== modulo || current.role === "gestao") return permission;
          if (field === "pode_visualizar") {
            return {
              ...permission,
              pode_visualizar: value,
              pode_editar: value && permission.pode_editar,
              pode_gerenciar: value && permission.pode_gerenciar,
            };
          }
          if (field === "pode_editar") {
            return {
              ...permission,
              pode_visualizar: value || permission.pode_visualizar,
              pode_editar: value,
              pode_gerenciar: value && permission.pode_gerenciar,
            };
          }
          return {
            ...permission,
            pode_visualizar: value || permission.pode_visualizar,
            pode_editar: value || permission.pode_editar,
            pode_gerenciar: value,
          };
        }),
      };
    });
  }

  return (
    <section className="cartao gov-editor">
      <div className="gov-card-heading">
        <div>
          <p className="gov-eyebrow">{creating ? "Novo cadastro" : "Editar cadastro"}</p>
          <h2>{creating ? "Convidar usuário" : draft.nome || draft.email}</h2>
        </div>
        {!creating && <i className={statusClass(draft.status)}>{statusLabel(draft.status)}</i>}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); onSave(); }}>
        <div className="gov-form-grid">
          <label><span className="rotulo">Nome completo</span><input className="campo" value={draft.nome} onChange={(event) => onChange((current) => current ? { ...current, nome: event.target.value } : current)} required maxLength={120} /></label>
          <label><span className="rotulo">E-mail de acesso</span><input className="campo" type="email" value={draft.email} onChange={(event) => onChange((current) => current ? { ...current, email: event.target.value } : current)} required maxLength={254} /></label>
          <label><span className="rotulo">Perfil-base</span><select className="campo" value={draft.role} onChange={(event) => { const role = event.target.value as GovernanceUser["role"]; onChange((current) => current ? { ...current, role, permissions: permissionRowsForRole(role) } : current); }}><option value="consultor">Consultor · leitura</option><option value="operador">Operador · auditoria</option><option value="gestao">Gestão · completo</option></select></label>
          {!creating && (
            <label><span className="rotulo">Status da conta</span><select className="campo" value={draft.status} onChange={(event) => onChange((current) => current ? { ...current, status: event.target.value as AccountStatus, suspenso_ate: event.target.value === "suspended" ? current.suspenso_ate : null } : current)}><option value="active">Ativo</option><option value="suspended">Suspenso até uma data</option><option value="blocked">Bloqueado sem prazo</option></select></label>
          )}
        </div>

        {!creating && draft.status === "suspended" && (
          <label className="gov-suspension"><span className="rotulo">Suspender até</span><input className="campo" type="datetime-local" value={toDateTimeLocal(draft.suspenso_ate)} onChange={(event) => onChange((current) => current ? { ...current, suspenso_ate: fromDateTimeLocal(event.target.value) } : current)} required /></label>
        )}

        <>
            <fieldset className="gov-fieldset">
              <legend>Permissões por módulo</legend>
              <p className="sub">Marque visualizar, editar ou gerenciar. A hierarquia é aplicada automaticamente.</p>
              <div className="gov-permissions">
                <div className="gov-permission-head"><span>Módulo</span><span>Ver</span><span>Editar</span><span>Gerenciar</span></div>
                {GOVERNANCE_MODULES.map((module) => {
                  const permission = draft.permissions.find((row) => row.modulo === module.id);
                  if (!permission) return null;
                  const locked = draft.role === "gestao" || module.id === "CADASTROS";
                  return (
                    <div className="gov-permission-row" key={module.id}>
                      <span><b>{module.label}</b><small>{module.description}</small></span>
                      <input type="checkbox" checked={permission.pode_visualizar} disabled={locked} aria-label={`${module.label}: visualizar`} onChange={(event) => changePermission(module.id, "pode_visualizar", event.target.checked)} />
                      <input type="checkbox" checked={permission.pode_editar} disabled={locked} aria-label={`${module.label}: editar`} onChange={(event) => changePermission(module.id, "pode_editar", event.target.checked)} />
                      <input type="checkbox" checked={permission.pode_gerenciar} disabled={locked} aria-label={`${module.label}: gerenciar`} onChange={(event) => changePermission(module.id, "pode_gerenciar", event.target.checked)} />
                    </div>
                  );
                })}
              </div>
              {draft.role === "gestao" && <p className="gov-lock-note">Gestão possui todos os módulos por regra e não pode ser reduzida por override.</p>}
            </fieldset>

            <fieldset className="gov-fieldset">
              <legend>Visibilidade por projeto</legend>
              <p className="sub">O usuário pode enxergar todos os projetos ou somente os selecionados.</p>
              <div className="gov-scope-options">
                <label><input type="radio" name={`scope-${draft.id || "new"}`} checked={draft.project_scope === "all"} onChange={() => onChange((current) => current ? { ...current, project_scope: "all" } : current)} /> Todos os projetos</label>
                <label><input type="radio" name={`scope-${draft.id || "new"}`} checked={draft.project_scope === "selected"} onChange={() => onChange((current) => current ? { ...current, project_scope: "selected" } : current)} /> Somente selecionados</label>
              </div>
              {draft.project_scope === "selected" && (
                <div className="gov-projects">
                  {projects.map((project) => (
                    <label key={project.id} className={!project.ativo ? "inactive" : ""}><input type="checkbox" checked={draft.project_ids.includes(project.id)} onChange={(event) => onChange((current) => { if (!current) return current; const ids = event.target.checked ? [...new Set([...current.project_ids, project.id])] : current.project_ids.filter((id) => id !== project.id); return { ...current, project_ids: ids }; })} />{project.nome}{!project.ativo && " · inativo"}</label>
                  ))}
                  {projects.length === 0 && <span className="sub">Nenhum projeto cadastrado.</span>}
                </div>
              )}
            </fieldset>

            {!creating && <fieldset className="gov-fieldset">
              <legend>Equipes</legend>
              <p className="sub">A composição das equipes é editada na aba Equipes.</p>
              <div className="gov-team-pills">{teams.filter((team) => team.member_ids.includes(draft.id)).map((team) => <span key={team.id}>{team.nome}</span>)}{teams.every((team) => !team.member_ids.includes(draft.id)) && <span className="sub">Sem equipe vinculada.</span>}</div>
            </fieldset>}
        </>

        {creating && <p className="gov-invite-note">O usuário receberá um convite seguro para definir a própria senha. O convite é enviado pelo Supabase Auth.</p>}

        <div className="gov-editor-actions">
          <button type="submit" className="btn btn-forte" disabled={Boolean(busy)}>{isSaving ? "Salvando…" : creating ? "Enviar convite" : "Salvar alterações"}</button>
          {!creating && <button type="button" className="btn" onClick={onCancel} disabled={Boolean(busy)}>Desfazer</button>}
          {!creating && onReset && <button type="button" className="btn" onClick={onReset} disabled={Boolean(busy)}>{isResetting ? "Enviando…" : "Redefinir senha"}</button>}
          {!creating && onDelete && <button type="button" className="btn gov-danger" onClick={onDelete} disabled={Boolean(busy)}>{isDeleting ? "Excluindo…" : "Excluir conta"}</button>}
        </div>
      </form>
    </section>
  );
}

function TeamsPanel({
  snapshot,
  busy,
  setBusy,
  onTeamChange,
  onSnapshot,
}: {
  snapshot: GovernanceSnapshot;
  busy: string | null;
  setBusy: Dispatch<SetStateAction<string | null>>;
  onTeamChange: (team: GovernanceTeam, wasNew?: boolean) => void;
  onSnapshot: Dispatch<SetStateAction<GovernanceSnapshot>>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    snapshot.teams[0]?.id ?? null,
  );
  const [creating, setCreating] = useState(false);
  const selected = snapshot.teams.find((team) => team.id === selectedId) ?? null;
  const [draft, setDraft] = useState<TeamDraft | null>(
    selected ? draftFromTeam(selected) : null,
  );
  const [memberIds, setMemberIds] = useState<string[]>(selected?.member_ids ?? []);
  const [memberSearch, setMemberSearch] = useState("");

  const namesByUserId = useMemo(
    () =>
      new Map(
        snapshot.directory_users.map((user) => [
          user.id,
          user.nome.trim() || user.email,
        ]),
      ),
    [snapshot.directory_users],
  );
  const projectNamesById = useMemo(
    () => new Map(snapshot.projects.map((project) => [project.id, project.nome])),
    [snapshot.projects],
  );

  function selectTeam(team: GovernanceTeam) {
    setCreating(false);
    setSelectedId(team.id);
    setDraft(draftFromTeam(team));
    setMemberIds([...team.member_ids]);
    setMemberSearch("");
  }

  function newTeam() {
    setCreating(true);
    setSelectedId(null);
    setDraft(emptyTeamDraft());
    setMemberIds([]);
    setMemberSearch("");
  }

  async function saveTeam() {
    if (!draft || busy) return;
    setBusy(draft.id ? `equipe:${draft.id}` : "equipe:nova");
    const result = draft.id
      ? await updateGovernanceTeam({
          ...draft,
        } satisfies UpdateGovernanceTeamInput)
      : await createGovernanceTeam({
          nome: draft.nome,
          descricao: draft.descricao,
          projeto_id: draft.projeto_id,
          codigo: draft.codigo,
        } satisfies CreateGovernanceTeamInput);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onTeamChange(result.data, !draft.id);
    setSelectedId(result.data.id);
    setDraft(draftFromTeam(result.data));
    setCreating(false);
    toast.success(draft.id ? "Equipe atualizada." : "Equipe criada.");
  }

  async function saveMembers() {
    if (!draft?.id || busy) return;
    setBusy(`membros:${draft.id}`);
    const result = await saveGovernanceTeamMembers(draft.id, memberIds);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onTeamChange(result.data);
    toast.success("Membros da equipe atualizados.");
  }

  async function removeTeam() {
    if (!draft?.id || busy) return;
    if (
      !window.confirm(
        `Excluir a equipe ${draft.nome}? Os vínculos dos membros serão removidos.`,
      )
    ) {
      return;
    }
    setBusy(`delete-team:${draft.id}`);
    const result = await deleteGovernanceTeam(draft.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const remaining = snapshot.teams.filter((team) => team.id !== draft.id);
    onSnapshot((current) => ({
      ...current,
      teams: current.teams.filter((team) => team.id !== draft.id),
    }));
    const next = remaining[0] ?? null;
    if (next) selectTeam(next);
    else {
      setSelectedId(null);
      setDraft(null);
      setMemberIds([]);
    }
    toast.success("Equipe excluída.");
  }

  const filteredDirectory = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    return snapshot.directory_users.filter(
      (user) =>
        !query || `${user.nome} ${user.email}`.toLowerCase().includes(query),
    );
  }, [memberSearch, snapshot.directory_users]);

  function memberPreview(team: GovernanceTeam) {
    const names = team.member_ids
      .map((id) => namesByUserId.get(id))
      .filter((name): name is string => Boolean(name));
    if (names.length === 0) return "Sem membros vinculados";
    const visible = names.slice(0, 3).join(", ");
    return names.length > 3 ? `${visible} +${names.length - 3}` : visible;
  }

  function projectLabel(projectId: string | null) {
    if (!projectId) return "Sem projeto associado";
    return `Projeto: ${projectNamesById.get(projectId) ?? projectId}`;
  }

  return (
    <div className="gov-layout gov-layout-teams">
      <section className="cartao gov-list-card">
        <div className="gov-card-heading">
          <div>
            <h2>Equipes</h2>
            <p className="sub">
              Agrupe pessoas, associe um projeto e mantenha os responsáveis
              visíveis em um só lugar.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-forte"
            onClick={newTeam}
            disabled={Boolean(busy)}
          >
            + Nova equipe
          </button>
        </div>
        <div className="gov-team-list">
          {snapshot.teams.map((team) => (
            <button
              type="button"
              key={team.id}
              className={`gov-team-row ${selectedId === team.id && !creating ? "on" : ""}`}
              onClick={() => selectTeam(team)}
              aria-label={`Editar equipe ${team.nome}`}
            >
              <span className="gov-team-primary">
                <b>{team.nome}</b>
                <small>{team.descricao || team.codigo || "Sem descrição"}</small>
                <small>{memberPreview(team)}</small>
              </span>
              <span className="gov-team-count">
                {team.member_ids.length} {team.member_ids.length === 1 ? "membro" : "membros"}
              </span>
              <i className={team.ativo ? "gov-status gov-status-active" : "gov-status gov-status-blocked"}>
                {team.ativo ? "Ativa" : "Inativa"}
              </i>
            </button>
          ))}
          {snapshot.teams.length === 0 && (
            <p className="gov-no-results">
              Nenhuma equipe cadastrada. Clique em “+ Nova equipe” para começar.
            </p>
          )}
        </div>
      </section>

      <section className="cartao gov-editor">
        {!draft ? (
          <>
            <h2>Detalhes da equipe</h2>
            <p className="sub">
              Crie uma equipe para começar a organizar os responsáveis.
            </p>
          </>
        ) : (
          <>
            <div className="gov-card-heading">
              <div>
                <p className="gov-eyebrow">
                  {creating ? "Novo cadastro" : "Editar equipe"}
                </p>
                <h2>{creating ? "Criar equipe" : draft.nome}</h2>
              </div>
              {!creating && (
                <i className={draft.ativo ? "gov-status gov-status-active" : "gov-status gov-status-blocked"}>
                  {draft.ativo ? "Ativa" : "Inativa"}
                </i>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveTeam();
              }}
            >
              <div className="gov-form-grid">
                <label>
                  <span className="rotulo">Nome da equipe</span>
                  <input
                    className="campo"
                    value={draft.nome}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, nome: event.target.value } : current,
                      )
                    }
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  <span className="rotulo">Código curto</span>
                  <input
                    className="campo"
                    value={draft.codigo ?? ""}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, codigo: event.target.value || null }
                          : current,
                      )
                    }
                    maxLength={24}
                    placeholder="Ex.: QUALIDADE"
                  />
                </label>
                <label className="gov-form-wide">
                  <span className="rotulo">Descrição</span>
                  <textarea
                    className="campo"
                    value={draft.descricao}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, descricao: event.target.value }
                          : current,
                      )
                    }
                    maxLength={5000}
                    placeholder="Explique a responsabilidade desta equipe."
                    rows={3}
                  />
                </label>
                <label>
                  <span className="rotulo">Projeto associado</span>
                  <select
                    className="campo"
                    value={draft.projeto_id ?? ""}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              projeto_id: event.target.value || null,
                            }
                          : current,
                      )
                    }
                  >
                    <option value="">Sem projeto específico</option>
                    {snapshot.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.nome}
                        {!project.ativo ? " · inativo" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {!creating && (
                <label className="gov-switch">
                  <input
                    type="checkbox"
                    checked={draft.ativo}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, ativo: event.target.checked } : current,
                      )
                    }
                  />
                  Equipe ativa
                </label>
              )}

              <div className="gov-fieldset gov-members-fieldset">
                <div className="gov-legend-row">
                  <div>
                    <h3>Membros</h3>
                    <p className="sub">
                      Adicione ou remova usuários vinculados a esta equipe.
                    </p>
                  </div>
                  <b>{memberIds.length}</b>
                </div>
                {creating ? (
                  <p className="gov-invite-note">
                    Salve a equipe primeiro. Depois você poderá vincular os
                    usuários nesta mesma aba.
                  </p>
                ) : (
                  <>
                    <input
                      className="campo"
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                      placeholder="Buscar membro por nome ou e-mail"
                      aria-label="Buscar membro"
                    />
                    <div className="gov-member-list">
                      {filteredDirectory.map((user) => (
                        <label key={user.id}>
                          <input
                            type="checkbox"
                            checked={memberIds.includes(user.id)}
                            onChange={(event) =>
                              setMemberIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, user.id])]
                                  : current.filter((id) => id !== user.id),
                              )
                            }
                          />
                          <span>
                            <b>{user.nome || "Sem nome"}</b>
                            <small>{user.email}</small>
                          </span>
                        </label>
                      ))}
                      {filteredDirectory.length === 0 && (
                        <span className="sub">Nenhuma conta encontrada.</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <p className="gov-team-association">
                {projectLabel(draft.projeto_id)}
              </p>

              <div className="gov-editor-actions">
                <button
                  type="submit"
                  className="btn btn-forte"
                  disabled={Boolean(busy)}
                >
                  {busy === (draft.id ? `equipe:${draft.id}` : "equipe:nova")
                    ? "Salvando…"
                    : creating
                      ? "Criar equipe"
                      : "Salvar equipe"}
                </button>
                {!creating && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => selected && selectTeam(selected)}
                    disabled={Boolean(busy)}
                  >
                    Desfazer
                  </button>
                )}
                {!creating && (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void saveMembers()}
                    disabled={Boolean(busy)}
                  >
                    {busy === `membros:${draft.id}`
                      ? "Salvando…"
                      : "Salvar membros"}
                  </button>
                )}
                {!creating && (
                  <button
                    type="button"
                    className="btn gov-danger"
                    onClick={() => void removeTeam()}
                    disabled={Boolean(busy)}
                  >
                    {busy === `delete-team:${draft.id}`
                      ? "Excluindo…"
                      : "Excluir equipe"}
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
