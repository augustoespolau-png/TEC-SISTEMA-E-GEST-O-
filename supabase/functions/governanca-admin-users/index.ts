import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response(405, { error: "Método não permitido" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return response(401, { error: "Sessão ausente" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return response(500, { error: "Configuração interna indisponível" });
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return response(401, { error: "Sessão inválida" });

  const { data: isGestao, error: permissionError } = await caller.rpc("tecverde_is_gestao");
  if (permissionError || isGestao !== true) {
    return response(403, { error: "Acesso restrito à Gestão" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return response(400, { error: "Payload inválido" });
  }

  const action = String(payload.action ?? "");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    if (action === "invite") {
      const email = String(payload.email ?? "").trim().toLowerCase();
      const fullName = String(payload.fullName ?? "").trim();
      if (!email) return response(400, { error: "E-mail obrigatório" });

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (error) return response(400, { error: error.message });
      return response(200, { user: { id: data.user.id, email: data.user.email } });
    }

    if (action === "update") {
      const userId = String(payload.userId ?? "");
      if (!userId) return response(400, { error: "Usuário obrigatório" });
      const attributes: Record<string, unknown> = {};
      if (typeof payload.email === "string" && payload.email.trim()) {
        attributes.email = payload.email.trim().toLowerCase();
      }
      if (typeof payload.fullName === "string") {
        attributes.user_metadata = { full_name: payload.fullName.trim() };
      }
      const { data, error } = await admin.auth.admin.updateUserById(userId, attributes);
      if (error) return response(400, { error: error.message });
      return response(200, { user: { id: data.user.id, email: data.user.email } });
    }

    if (action === "ban") {
      const userId = String(payload.userId ?? "");
      const active = payload.active === true;
      if (!userId) return response(400, { error: "Usuário obrigatório" });
      if (userId === authData.user.id && !active) {
        return response(400, { error: "Não é permitido desativar o próprio acesso" });
      }
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: active ? "none" : "876000h",
      });
      if (error) return response(400, { error: error.message });
      return response(200, { ok: true });
    }

    if (action === "delete") {
      const userId = String(payload.userId ?? "");
      if (!userId) return response(400, { error: "Usuário obrigatório" });
      if (userId === authData.user.id) {
        return response(400, { error: "Não é permitido excluir o próprio usuário" });
      }
      const { error } = await admin.auth.admin.deleteUser(userId, true);
      if (error) return response(400, { error: error.message });
      return response(200, { ok: true });
    }

    return response(400, { error: "Ação desconhecida" });
  } catch (error) {
    return response(500, {
      error: error instanceof Error ? error.message : "Falha interna de governança",
    });
  }
});
