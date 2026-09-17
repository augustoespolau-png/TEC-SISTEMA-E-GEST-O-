"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MODULOS_ACESSO,
  type ModuloAcesso,
  type PermissoesUsuario,
} from "@/lib/permissoes";
import {
  atualizarUsuarioAction,
  criarUsuarioAction,
  excluirUsuarioAction,
  listarUsuariosAction,
  type StatusUsuario,
  type UsuarioAdministrado,
} from "@/app/(app)/usuarios/actions";

type Props = {
  initialUsers: UsuarioAdministrado[];
  initialError: string;
  podeEditar: boolean;
};

type Formulario = {
  modo: "novo" | "editar";
  userId: string;
  nome: string;
  email: string;
  password: string;
  status: StatusUsuario;
  suspendedUntil: string;
  permissions: PermissoesUsuario;
};

function permissoesIniciais(): PermissoesUsuario {
  return Object.fromEntries(
    MODULOS_ACESSO.map((modulo) => [
      modulo.id,
      {
        ver: modulo.id === "AUDITORIA",
        editar: false,
        ...(modulo.id === "INDICADORES" ? { folhas: [] } : {}),
      },
    ])
  );
}

function copiarPermissoes(
  origem: PermissoesUsuario | Record<string, unknown> | null | undefined
): PermissoesUsuario {
  const saida = permissoesIniciais();
  if (!origem || typeof origem !== "object") return saida;

  for (const modulo of MODULOS_ACESSO) {
    const bruto = (origem as Record<string, unknown>)[modulo.id];
    if (!bruto || typeof bruto !== "object") continue;
    const item = bruto as { ver?: boolean; editar?: boolean; folhas?: string[] };
    saida[modulo.id] = {
      ver: item.ver === true || item.editar === true,
      editar: item.editar === true,
      ...(modulo.id === "INDICADORES"
        ? { folhas: Array.isArray(item.folhas) ? [...item.folhas] : [] }
        : {}),
    };
  }
  return saida;
}

function novoFormulario(): Formulario {
  return {
    modo: "novo",
    userId: "",
    nome: "",
    email: "",
    password: "",
    status: "APROVADO",
    suspendedUntil: "",
    permissions: permissoesIniciais(),
  };
}

function dataParaInput(iso: string | null) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 16);
}

function dataCurta(iso: string | null) {
  if (!iso) return "—";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(data);
}

function statusVisual(usuario: UsuarioAdministrado) {
  const status = String(usuario.status || "").toUpperCase();
  if (status === "BLOQUEADO") return { texto: "Bloqueado", classe: "bg-red-500/10 text-red-600" };
  if (status === "SUSPENSO") {
    const terminou =
      usuario.suspendedUntil &&
      new Date(usuario.suspendedUntil).getTime() <= Date.now();
    return terminou
      ? { texto: "Suspensão encerrada", classe: "bg-amber-500/10 text-amber-600" }
      : { texto: "Suspenso", classe: "bg-amber-500/10 text-amber-600" };
  }
  return { texto: "Ativo", classe: "bg-emerald-500/10 text-emerald-600" };
}

export default function UsuariosPermissoes({
  initialUsers,
  initialError,
  podeEditar,
}: Props) {
  const [usuarios, setUsuarios] = useState(initialUsers);
  const [erro, setErro] = useState(initialError);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [excluir, setExcluir] = useState<UsuarioAdministrado | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const resumo = useMemo(() => {
    let ativos = 0;
    let bloqueados = 0;
    let suspensos = 0;
    for (const usuario of usuarios) {
      const status = String(usuario.status || "").toUpperCase();
      if (status === "BLOQUEADO") bloqueados += 1;
      else if (
        status === "SUSPENSO" &&
        usuario.suspendedUntil &&
        new Date(usuario.suspendedUntil).getTime() > Date.now()
      )
        suspensos += 1;
      else ativos += 1;
    }
    return { total: usuarios.length, ativos, bloqueados, suspensos };
  }, [usuarios]);

  async function recarregar() {
    const resultado = await listarUsuariosAction();
    if (!resultado.ok) {
      setErro(resultado.error);
      return false;
    }
    setUsuarios(resultado.data);
    setErro("");
    return true;
  }

  function abrirEdicao(usuario: UsuarioAdministrado) {
    setFormulario({
      modo: "editar",
      userId: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      password: "",
      status: (String(usuario.status || "APROVADO").toUpperCase() === "BLOQUEADO"
        ? "BLOQUEADO"
        : String(usuario.status || "APROVADO").toUpperCase() === "SUSPENSO"
          ? "SUSPENSO"
          : "APROVADO") as StatusUsuario,
      suspendedUntil: dataParaInput(usuario.suspendedUntil),
      permissions: copiarPermissoes(usuario.permissions),
    });
  }

  function alternarPermissao(modulo: ModuloAcesso, campo: "ver" | "editar") {
    setFormulario((atual) => {
      if (!atual) return atual;
      const anterior = atual.permissions[modulo] ?? { ver: false, editar: false };
      let ver = anterior.ver;
      let editar = anterior.editar;

      if (campo === "editar") {
        editar = !editar;
        if (editar) ver = true;
      } else {
        ver = !ver;
        if (!ver) editar = false;
      }

      return {
        ...atual,
        permissions: {
          ...atual.permissions,
          [modulo]: {
            ...anterior,
            ver,
            editar,
          },
        },
      };
    });
  }

  async function salvar() {
    if (!formulario || ocupado) return;
    if (!formulario.nome.trim()) {
      toast.error("Informe o nome do usuário.");
      return;
    }
    if (
      formulario.status === "SUSPENSO" &&
      !formulario.suspendedUntil
    ) {
      toast.error("Informe até quando o acesso ficará suspenso.");
      return;
    }

    setOcupado(true);
    const resultado =
      formulario.modo === "novo"
        ? await criarUsuarioAction({
            nome: formulario.nome.trim(),
            email: formulario.email.trim().toLowerCase(),
            password: formulario.password,
            permissions: formulario.permissions,
          })
        : await atualizarUsuarioAction({
            userId: formulario.userId,
            nome: formulario.nome.trim(),
            status: formulario.status,
            suspendedUntil:
              formulario.status === "SUSPENSO" && formulario.suspendedUntil
                ? new Date(formulario.suspendedUntil).toISOString()
                : null,
            permissions: formulario.permissions,
          });

    if (!resultado.ok) {
      setOcupado(false);
      toast.error(resultado.error);
      return;
    }

    const ok = await recarregar();
    setOcupado(false);
    if (!ok) return;
    setFormulario(null);
    toast.success(
      formulario.modo === "novo"
        ? "Usuário criado e liberado."
        : "Permissões atualizadas."
    );
  }

  async function alternarBloqueio(usuario: UsuarioAdministrado) {
    if (ocupado || usuario.currentUser || usuario.protectedAdmin) return;
    const bloquear = String(usuario.status).toUpperCase() !== "BLOQUEADO";
    setOcupado(true);
    const resultado = await atualizarUsuarioAction({
      userId: usuario.id,
      nome: usuario.nome,
      status: bloquear ? "BLOQUEADO" : "APROVADO",
      suspendedUntil: null,
      permissions: copiarPermissoes(usuario.permissions),
    });
    if (!resultado.ok) {
      setOcupado(false);
      toast.error(resultado.error);
      return;
    }
    await recarregar();
    setOcupado(false);
    toast.success(bloquear ? "Usuário bloqueado." : "Usuário reativado.");
  }

  async function confirmarExclusao() {
    if (!excluir || ocupado) return;
    setOcupado(true);
    const resultado = await excluirUsuarioAction(excluir.id);
    if (!resultado.ok) {
      setOcupado(false);
      toast.error(resultado.error);
      return;
    }
    await recarregar();
    setOcupado(false);
    setExcluir(null);
    toast.success("Usuário excluído do acesso ao sistema.");
  }

  return (
    <main className="tela pb-24">
      <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
            Administração
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">Usuários e Permissões</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-2">
            Acesso individual por módulo. Visualização e edição são controladas separadamente e validadas também no banco.
          </p>
        </div>
        {podeEditar && (
          <button
            type="button"
            className="btn bg-brand text-white hover:bg-brand-forte"
            onClick={() => setFormulario(novoFormulario())}
          >
            + Novo usuário
          </button>
        )}
      </section>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ResumoCard rotulo="Usuários" valor={resumo.total} />
        <ResumoCard rotulo="Ativos" valor={resumo.ativos} />
        <ResumoCard rotulo="Suspensos" valor={resumo.suspensos} />
        <ResumoCard rotulo="Bloqueados" valor={resumo.bloqueados} />
      </section>

      {erro && (
        <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600">
          {erro}
        </div>
      )}

      <section className="space-y-3">
        {usuarios.map((usuario) => {
          const status = statusVisual(usuario);
          const travado = usuario.currentUser || usuario.protectedAdmin;
          return (
            <article
              key={usuario.id}
              className="rounded-2xl border border-line bg-papel p-4 shadow-sm transition hover:border-brand"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-ink">
                      {usuario.nome || usuario.email}
                    </h2>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${status.classe}`}>
                      {status.texto}
                    </span>
                    {usuario.currentUser && (
                      <span className="rounded-full border border-brand/40 px-2.5 py-1 text-[10px] font-medium text-brand">
                        sua conta
                      </span>
                    )}
                    {usuario.protectedAdmin && (
                      <span className="rounded-full border border-line px-2.5 py-1 text-[10px] text-ink-2">
                        administrador protegido
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-ink-2">{usuario.email}</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-3">
                    <span>Último acesso: {dataCurta(usuario.lastSignInAt)}</span>
                    {String(usuario.status).toUpperCase() === "SUSPENSO" && usuario.suspendedUntil && (
                      <span>Suspenso até: {dataCurta(usuario.suspendedUntil)}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {MODULOS_ACESSO.filter(
                      (modulo) => usuario.permissions?.[modulo.id]?.ver
                    ).map((modulo) => (
                      <span
                        key={modulo.id}
                        className="rounded-lg border border-line bg-papel-2 px-2 py-1 text-[10px] text-ink-2"
                      >
                        {modulo.nome}
                        {usuario.permissions?.[modulo.id]?.editar ? " · editar" : ""}
                      </span>
                    ))}
                  </div>
                </div>

                {podeEditar && (
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      className="btn"
                      disabled={travado || ocupado}
                      onClick={() => abrirEdicao(usuario)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={travado || ocupado}
                      onClick={() => void alternarBloqueio(usuario)}
                    >
                      {String(usuario.status).toUpperCase() === "BLOQUEADO"
                        ? "Reativar"
                        : "Bloquear"}
                    </button>
                    <button
                      type="button"
                      className="btn border-red-500/30 text-red-600 hover:border-red-500"
                      disabled={travado || ocupado}
                      onClick={() => setExcluir(usuario)}
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {!usuarios.length && !erro && (
          <div className="rounded-2xl border border-dashed border-line bg-papel p-8 text-center text-sm text-ink-2">
            Nenhum usuário encontrado.
          </div>
        )}
      </section>

      {formulario && (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/45 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-line bg-papel shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-line bg-papel px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">
                  {formulario.modo === "novo" ? "Novo acesso" : "Acesso individual"}
                </p>
                <h2 className="mt-1 text-base font-semibold text-ink">
                  {formulario.modo === "novo" ? "Criar usuário" : formulario.nome}
                </h2>
              </div>
              <button
                type="button"
                className="btn"
                disabled={ocupado}
                onClick={() => setFormulario(null)}
              >
                Fechar
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Campo rotulo="Nome">
                  <input
                    className="input w-full"
                    value={formulario.nome}
                    autoComplete="name"
                    onChange={(e) =>
                      setFormulario((f) => (f ? { ...f, nome: e.target.value } : f))
                    }
                  />
                </Campo>

                <Campo rotulo="E-mail">
                  <input
                    className="input w-full"
                    type="email"
                    value={formulario.email}
                    disabled={formulario.modo === "editar"}
                    autoComplete="email"
                    onChange={(e) =>
                      setFormulario((f) => (f ? { ...f, email: e.target.value } : f))
                    }
                  />
                </Campo>

                {formulario.modo === "novo" && (
                  <Campo rotulo="Senha inicial">
                    <input
                      className="input w-full"
                      type="password"
                      minLength={8}
                      value={formulario.password}
                      autoComplete="new-password"
                      onChange={(e) =>
                        setFormulario((f) =>
                          f ? { ...f, password: e.target.value } : f
                        )
                      }
                    />
                    <p className="mt-1 text-[10px] text-ink-3">Mínimo de 8 caracteres.</p>
                  </Campo>
                )}

                {formulario.modo === "editar" && (
                  <Campo rotulo="Situação do acesso">
                    <select
                      className="input w-full"
                      value={formulario.status}
                      onChange={(e) =>
                        setFormulario((f) =>
                          f
                            ? {
                                ...f,
                                status: e.target.value as StatusUsuario,
                                suspendedUntil:
                                  e.target.value === "SUSPENSO"
                                    ? f.suspendedUntil
                                    : "",
                              }
                            : f
                        )
                      }
                    >
                      <option value="APROVADO">Ativo</option>
                      <option value="SUSPENSO">Suspenso temporariamente</option>
                      <option value="BLOQUEADO">Bloqueado</option>
                    </select>
                  </Campo>
                )}

                {formulario.modo === "editar" && formulario.status === "SUSPENSO" && (
                  <Campo rotulo="Suspenso até">
                    <input
                      className="input w-full"
                      type="datetime-local"
                      value={formulario.suspendedUntil}
                      onChange={(e) =>
                        setFormulario((f) =>
                          f ? { ...f, suspendedUntil: e.target.value } : f
                        )
                      }
                    />
                  </Campo>
                )}
              </div>

              <div>
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-ink">Permissões por módulo</h3>
                  <p className="mt-1 text-xs text-ink-2">
                    “Visualizar” libera a tela. “Editar” libera gravações e também mantém a visualização ligada.
                  </p>
                </div>

                <div className="space-y-2">
                  {MODULOS_ACESSO.map((modulo) => {
                    const permissao = formulario.permissions[modulo.id] ?? {
                      ver: false,
                      editar: false,
                    };
                    return (
                      <div
                        key={modulo.id}
                        className="flex flex-col gap-3 rounded-2xl border border-line bg-papel-2 p-3.5 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-ink">{modulo.nome}</div>
                          <div className="mt-0.5 text-[11px] leading-5 text-ink-3">
                            {modulo.descricao}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <PermissaoBotao
                            ativo={permissao.ver}
                            rotulo="Visualizar"
                            onClick={() => alternarPermissao(modulo.id, "ver")}
                          />
                          <PermissaoBotao
                            ativo={permissao.editar}
                            rotulo="Editar"
                            onClick={() => alternarPermissao(modulo.id, "editar")}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-papel px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn"
                disabled={ocupado}
                onClick={() => setFormulario(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn bg-brand text-white hover:bg-brand-forte"
                disabled={ocupado}
                onClick={() => void salvar()}
              >
                {ocupado
                  ? "Salvando…"
                  : formulario.modo === "novo"
                    ? "Criar usuário"
                    : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {excluir && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-line bg-papel p-5 shadow-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-600">Excluir acesso</p>
            <h2 className="mt-1 text-base font-semibold text-ink">{excluir.nome}</h2>
            <p className="mt-3 text-sm leading-6 text-ink-2">
              A conta deixará de acessar o sistema. Os registros históricos feitos por esse usuário são preservados.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn"
                disabled={ocupado}
                onClick={() => setExcluir(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn border-red-500 bg-red-600 text-white hover:bg-red-700"
                disabled={ocupado}
                onClick={() => void confirmarExclusao()}
              >
                {ocupado ? "Excluindo…" : "Excluir usuário"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ResumoCard({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-2xl border border-line bg-papel px-4 py-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-3">{rotulo}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{valor}</div>
    </div>
  );
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-ink-2">
      <span className="mb-1.5 block">{rotulo}</span>
      {children}
    </label>
  );
}

function PermissaoBotao({
  ativo,
  rotulo,
  onClick,
}: {
  ativo: boolean;
  rotulo: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
        ativo
          ? "border-brand bg-brand text-white"
          : "border-line bg-papel text-ink-2 hover:border-brand"
      }`}
      aria-pressed={ativo}
    >
      {rotulo}
    </button>
  );
}
