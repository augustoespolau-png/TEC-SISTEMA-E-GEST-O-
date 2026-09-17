import { withSupabase } from "npm:@supabase/server@1.6.1";

type Permissao = {
  ver?: boolean;
  editar?: boolean;
  folhas?: string[];
};

type MapaPermissoes = Record<string, Permissao>;

const MODULOS_EDITAVEIS = [
  "AUDITORIA",
  "INDICADORES",
  "HISTÓRICO",
  "CONFIGURAÇÃO",
  "CADASTROS",
] as const;

const FOLHAS_INDICADORES = ["fpy", "desvios", "fluxo", "comparativos"];

function resposta(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

function normalizarPermissoes(
  entrada: unknown,
  atuais: MapaPermissoes = {}
): MapaPermissoes {
  const origem =
    entrada && typeof entrada === "object"
      ? (entrada as Record<string, unknown>)
      : {};
  const saida: MapaPermissoes = structuredClone(atuais ?? {});

  for (const modulo of MODULOS_EDITAVEIS) {
    const recebido =
      origem[modulo] && typeof origem[modulo] === "object"
        ? (origem[modulo] as Record<string, unknown>)
        : {};
    const editar = recebido.editar === true;
    const ver = recebido.ver === true || editar;
    const anterior = saida[modulo] ?? {};

    const folhasRecebidas = Array.isArray(recebido.folhas)
      ? recebido.folhas
          .map((item) => String(item))
          .filter((item) => FOLHAS_INDICADORES.includes(item))
      : [];
    const folhasAnteriores = Array.isArray(anterior.folhas)
      ? anterior.folhas.filter((item) => FOLHAS_INDICADORES.includes(item))
      : [];

    saida[modulo] = {
      ...anterior,
      ver,
      editar,
      ...(modulo === "INDICADORES"
        ? {
            folhas: ver
              ? folhasRecebidas.length
                ? folhasRecebidas
                : folhasAnteriores.length
                  ? folhasAnteriores
                  : FOLHAS_INDICADORES
              : [],
          }
        : {}),
    };
  }

  return saida;
}

function statusValido(valor: string) {
  return ["APROVADO", "BLOQUEADO", "SUSPENSO"].includes(valor);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") {
      return resposta({ error: "Método não permitido." }, 405);
    }

    const callerId = String(ctx.jwtClaims?.sub ?? "");
    const callerEmail = String(ctx.userClaims?.email ?? "");
    if (!callerId) return resposta({ error: "Sessão inválida." }, 401);

    const { data: podeVer, error: erroVer } = await ctx.supabase.rpc(
      "tecverde_can",
      { p_modulo: "CADASTROS", p_acao: "ver" }
    );
    if (erroVer || !podeVer) {
      return resposta({ error: "Sem permissão para acessar usuários." }, 403);
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return resposta({ error: "Requisição inválida." }, 400);
    }

    const action = texto(body.action).toLowerCase();
    const admin = ctx.supabaseAdmin;

    if (action === "list") {
      const [authResult, perfisResult] = await Promise.all([
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        admin
          .from("perfis_acesso")
          .select(
            "user_id, email, full_name, role, status, permissions, suspended_until, created_at, updated_at"
          )
          .neq("status", "EXCLUIDO")
          .order("full_name", { ascending: true }),
      ]);

      if (authResult.error) return resposta({ error: authResult.error.message }, 500);
      if (perfisResult.error) return resposta({ error: perfisResult.error.message }, 500);

      const perfis = new Map(
        (perfisResult.data ?? [])
          .filter((item) => item.user_id)
          .map((item) => [String(item.user_id), item])
      );

      const users = (authResult.data.users ?? [])
        .map((user) => {
          const perfil = perfis.get(user.id);
          if (!perfil) return null;
          return {
            id: user.id,
            nome: perfil.full_name || user.user_metadata?.full_name || "",
            email: perfil.email || user.email || "",
            role: perfil.role,
            status: perfil.status,
            permissions: perfil.permissions ?? {},
            suspendedUntil: perfil.suspended_until,
            createdAt: user.created_at ?? perfil.created_at,
            lastSignInAt: user.last_sign_in_at ?? null,
            currentUser: user.id === callerId,
            protectedAdmin:
              String(perfil.role ?? "").toUpperCase() === "ADMINISTRADOR",
          };
        })
        .filter(Boolean);

      return resposta({ users });
    }

    const { data: podeEditar, error: erroEditar } = await ctx.supabase.rpc(
      "tecverde_can",
      { p_modulo: "CADASTROS", p_acao: "editar" }
    );
    if (erroEditar || !podeEditar) {
      return resposta({ error: "Sem permissão para alterar usuários." }, 403);
    }

    if (action === "create") {
      const nome = texto(body.nome);
      const email = texto(body.email).toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";
      const permissions = normalizarPermissoes(body.permissions);

      if (nome.length < 2) return resposta({ error: "Informe o nome do usuário." }, 400);
      if (!email || !email.includes("@")) return resposta({ error: "Informe um e-mail válido." }, 400);
      if (password.length < 8) {
        return resposta({ error: "A senha inicial precisa ter ao menos 8 caracteres." }, 400);
      }

      const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: nome,
          perfil_solicitado: "PERSONALIZADO",
        },
      });

      if (erroCriar || !criado.user) {
        return resposta(
          { error: erroCriar?.message ?? "Não foi possível criar o usuário." },
          400
        );
      }

      const userId = criado.user.id;
      const agora = new Date().toISOString();
      const [perfilAcesso, perfilLegado] = await Promise.all([
        admin.from("perfis_acesso").upsert(
          {
            user_id: userId,
            email,
            full_name: nome,
            role: "PERSONALIZADO",
            status: "APROVADO",
            permissions,
            suspended_until: null,
            approved_by: callerEmail || callerId,
            approved_at: agora,
            updated_at: agora,
          },
          { onConflict: "email" }
        ),
        admin.from("profiles").upsert({
          id: userId,
          nome,
          role: "consultor",
        }),
      ]);

      const falha = perfilAcesso.error ?? perfilLegado.error;
      if (falha) {
        await admin.auth.admin.deleteUser(userId, true);
        return resposta({ error: "Conta revertida: " + falha.message }, 500);
      }

      return resposta({ ok: true, userId }, 201);
    }

    if (action === "update") {
      const userId = texto(body.userId);
      const nome = texto(body.nome);
      const status = texto(body.status).toUpperCase();
      const suspendedUntil = texto(body.suspendedUntil) || null;

      if (!userId || userId === callerId) {
        return resposta(
          { error: "A própria conta administradora não pode ser alterada por esta tela." },
          400
        );
      }
      if (nome.length < 2 || !statusValido(status)) {
        return resposta({ error: "Dados do usuário inválidos." }, 400);
      }
      if (status === "SUSPENSO") {
        const ate = suspendedUntil ? new Date(suspendedUntil) : null;
        if (!ate || Number.isNaN(ate.getTime()) || ate.getTime() <= Date.now()) {
          return resposta({ error: "Informe uma data futura para a suspensão." }, 400);
        }
      }

      const { data: atual, error: erroAtual } = await admin
        .from("perfis_acesso")
        .select("role, permissions")
        .eq("user_id", userId)
        .maybeSingle();
      if (erroAtual || !atual) return resposta({ error: "Usuário não encontrado." }, 404);
      if (String(atual.role).toUpperCase() === "ADMINISTRADOR") {
        return resposta({ error: "Conta administradora protegida." }, 403);
      }

      const permissions = normalizarPermissoes(
        body.permissions,
        (atual.permissions ?? {}) as MapaPermissoes
      );
      const agora = new Date().toISOString();

      const [perfilAcesso, perfilLegado, authUpdate] = await Promise.all([
        admin
          .from("perfis_acesso")
          .update({
            full_name: nome,
            role: "PERSONALIZADO",
            status,
            permissions,
            suspended_until: status === "SUSPENSO" ? suspendedUntil : null,
            approved_by: callerEmail || callerId,
            approved_at: status === "APROVADO" ? agora : null,
            updated_at: agora,
          })
          .eq("user_id", userId),
        admin.from("profiles").upsert({
          id: userId,
          nome,
          role: "consultor",
        }),
        admin.auth.admin.updateUserById(userId, {
          user_metadata: { full_name: nome },
        }),
      ]);

      const falha = perfilAcesso.error ?? perfilLegado.error ?? authUpdate.error;
      if (falha) return resposta({ error: falha.message }, 500);

      return resposta({ ok: true });
    }

    if (action === "delete") {
      const userId = texto(body.userId);
      if (!userId || userId === callerId) {
        return resposta({ error: "Você não pode excluir a própria conta." }, 400);
      }

      const { data: atual, error: erroAtual } = await admin
        .from("perfis_acesso")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      if (erroAtual || !atual) return resposta({ error: "Usuário não encontrado." }, 404);
      if (String(atual.role).toUpperCase() === "ADMINISTRADOR") {
        return resposta({ error: "Conta administradora protegida." }, 403);
      }

      const { error: erroBloqueio } = await admin
        .from("perfis_acesso")
        .update({
          status: "EXCLUIDO",
          permissions: {},
          suspended_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (erroBloqueio) return resposta({ error: erroBloqueio.message }, 500);

      await admin.from("profiles").delete().eq("id", userId);

      const { error: erroExcluir } = await admin.auth.admin.deleteUser(userId, true);
      if (erroExcluir) return resposta({ error: erroExcluir.message }, 500);

      return resposta({ ok: true });
    }

    return resposta({ error: "Ação não reconhecida." }, 400);
  }),
};
