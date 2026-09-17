"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MODULOS_GOVERNANCA,
  PRESETS_ACESSO,
  normalizarPermissoes,
  requireGestao,
  type PermissoesGovernanca,
  type PresetAcesso,
} from "@/lib/governanca";

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

function erroMensagem(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}

function texto(formData: FormData, chave: string) {
  return String(formData.get(chave) ?? "").trim();
}

function presetValido(valor: string): valor is PresetAcesso {
  return PRESETS_ACESSO.some((preset) => preset.id === valor);
}

async function permissoesDoPreset(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  preset: PresetAcesso,
  rawPersonalizado?: string
): Promise<PermissoesGovernanca> {
  if (preset === "PERSONALIZADO") {
    let raw: unknown;
    try {
      raw = JSON.parse(rawPersonalizado || "{}");
    } catch {
      throw new Error("As permissões personalizadas são inválidas.");
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("As permissões personalizadas são inválidas.");
    }

    return normalizarPermissoes(
      raw as Record<string, { ver?: boolean; editar?: boolean }>
    );
  }

  const { data, error } = await supabase.rpc("tecverde_permissions_for_role", {
    p_role: preset,
  });
  if (error) throw new Error("Não foi possível resolver o perfil de acesso: " + error.message);
  return normalizarPermissoes(
    data as Record<string, { ver?: boolean; editar?: boolean }> | null
  );
}

export async function convidarUsuarioAction(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireGestao();
    const nome = texto(formData, "nome");
    const email = texto(formData, "email").toLowerCase();
    const preset = texto(formData, "preset");

    if (!nome || nome.length < 2) throw new Error("Informe o nome do usuário.");
    if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");
    if (!presetValido(preset) || preset === "PERSONALIZADO") {
      throw new Error("Escolha um perfil inicial válido.");
    }

    const permissions = await permissoesDoPreset(supabase, preset);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { nome },
    });
    if (error) throw new Error("Não foi possível enviar o convite: " + error.message);

    const userId = data.user?.id;
    if (!userId) throw new Error("O Supabase não retornou o identificador do usuário.");

    const { error: profileError } = await supabase.from("perfis_acesso").upsert(
      {
        user_id: userId,
        email,
        full_name: nome,
        role: preset,
        status: "APROVADO",
        permissions,
        suspended_until: null,
      },
      { onConflict: "email" }
    );
    if (profileError) {
      // O Auth já foi criado; bloqueia imediatamente para não deixar uma conta
      // convidada sem perfil de autorização válido.
      await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      throw new Error("Convite criado, mas o perfil de acesso falhou: " + profileError.message);
    }

    revalidatePath("/cadastros");
    return { ok: true, message: `Convite enviado para ${email}.` };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function salvarUsuarioAction(formData: FormData): Promise<ActionResult> {
  try {
    const { contexto, supabase } = await requireGestao();
    const userId = texto(formData, "user_id");
    const nome = texto(formData, "nome");
    const preset = texto(formData, "preset");
    const status = texto(formData, "status").toUpperCase();
    const version = Number(texto(formData, "version"));
    const suspendedUntilRaw = texto(formData, "suspended_until");

    if (!userId) throw new Error("Usuário inválido.");
    if (!nome) throw new Error("O nome é obrigatório.");
    if (!presetValido(preset)) throw new Error("Perfil de acesso inválido.");
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error("Versão do cadastro inválida. Atualize a página.");
    }
    if (!['APROVADO', 'SUSPENSO', 'BLOQUEADO'].includes(status)) {
      throw new Error("Status de acesso inválido.");
    }

    if (contexto.user.id === userId && (preset !== "GESTAO" || status !== "APROVADO")) {
      throw new Error("A Gestão não pode remover ou bloquear o próprio acesso.");
    }

    const permissions = await permissoesDoPreset(
      supabase,
      preset,
      texto(formData, "permissions")
    );

    let suspendedUntil: string | null = null;
    if (status === "SUSPENSO") {
      const date = new Date(suspendedUntilRaw);
      if (!suspendedUntilRaw || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
        throw new Error("Informe uma data futura para a suspensão.");
      }
      suspendedUntil = date.toISOString();
    }

    const { data, error } = await supabase
      .from("perfis_acesso")
      .update({
        full_name: nome,
        role: preset,
        status,
        permissions,
        suspended_until: suspendedUntil,
      })
      .eq("user_id", userId)
      .eq("version", version)
      .select("user_id")
      .maybeSingle();

    if (error) throw new Error("Não foi possível salvar o acesso: " + error.message);
    if (!data) {
      throw new Error("Esse cadastro foi alterado por outra pessoa. Atualize a página antes de salvar.");
    }

    // Bloqueio no Auth é uma segunda barreira. RLS continua sendo a barreira
    // de autorização para qualquer token já emitido.
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: status === "APROVADO" ? "none" : "876000h",
    });
    if (authError) throw new Error("Perfil salvo, mas o estado do login não foi atualizado: " + authError.message);

    revalidatePath("/cadastros");
    return { ok: true, message: "Permissões atualizadas com segurança." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function excluirUsuarioAction(formData: FormData): Promise<ActionResult> {
  try {
    const { contexto, supabase } = await requireGestao();
    const userId = texto(formData, "user_id");
    if (!userId) throw new Error("Usuário inválido.");
    if (contexto.user.id === userId) throw new Error("A Gestão não pode excluir a própria conta.");

    const { data: antes } = await supabase
      .from("perfis_acesso")
      .select("user_id,email,full_name,role,status,permissions")
      .eq("user_id", userId)
      .maybeSingle();

    const admin = createAdminClient();
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, true);
    if (deleteError) throw new Error("Não foi possível excluir o usuário: " + deleteError.message);

    await supabase.rpc("governanca_registrar_evento", {
      p_acao: "SOFT_DELETE_AUTH_USER",
      p_entidade: "auth.users",
      p_entidade_id: userId,
      p_antes: antes ?? null,
      p_depois: null,
    });

    revalidatePath("/cadastros");
    return { ok: true, message: "Usuário excluído de forma recuperável no Auth." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function salvarEquipeAction(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireGestao();
    const id = texto(formData, "id");
    const nome = texto(formData, "nome");
    const descricao = texto(formData, "descricao") || null;
    if (!nome) throw new Error("O nome da equipe é obrigatório.");

    if (id) {
      const { error } = await supabase
        .from("equipes")
        .update({ nome, descricao })
        .eq("id", id);
      if (error) throw new Error("Não foi possível editar a equipe: " + error.message);
    } else {
      const { error } = await supabase.from("equipes").insert({ nome, descricao });
      if (error) throw new Error("Não foi possível criar a equipe: " + error.message);
    }

    revalidatePath("/cadastros");
    return { ok: true, message: id ? "Equipe atualizada." : "Equipe criada." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function alternarEquipeAction(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireGestao();
    const id = texto(formData, "id");
    const ativo = texto(formData, "ativo") === "true";
    if (!id) throw new Error("Equipe inválida.");

    const { error } = await supabase.from("equipes").update({ ativo: !ativo }).eq("id", id);
    if (error) throw new Error("Não foi possível alterar a equipe: " + error.message);

    revalidatePath("/cadastros");
    return { ok: true, message: ativo ? "Equipe desativada." : "Equipe reativada." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function vincularMembroAction(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireGestao();
    const equipeId = texto(formData, "equipe_id");
    const userId = texto(formData, "user_id");
    if (!equipeId || !userId) throw new Error("Equipe e usuário são obrigatórios.");

    const { error } = await supabase.from("equipe_membros").upsert({
      equipe_id: equipeId,
      user_id: userId,
      papel_equipe: "MEMBRO",
    });
    if (error) throw new Error("Não foi possível vincular o usuário: " + error.message);

    revalidatePath("/cadastros");
    return { ok: true, message: "Usuário vinculado à equipe." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function removerMembroAction(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireGestao();
    const equipeId = texto(formData, "equipe_id");
    const userId = texto(formData, "user_id");
    if (!equipeId || !userId) throw new Error("Vínculo inválido.");

    const { error } = await supabase
      .from("equipe_membros")
      .delete()
      .eq("equipe_id", equipeId)
      .eq("user_id", userId);
    if (error) throw new Error("Não foi possível remover o vínculo: " + error.message);

    revalidatePath("/cadastros");
    return { ok: true, message: "Usuário removido da equipe." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function salvarProjetoAction(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireGestao();
    const id = texto(formData, "id");
    const nome = texto(formData, "nome");
    const codigoInformado = texto(formData, "codigo");
    const origem = texto(formData, "origem") || "CADASTROS";
    if (!nome) throw new Error("O nome do projeto é obrigatório.");

    if (id) {
      const { error } = await supabase
        .from("obras_projetos")
        .update({ nome, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error("Não foi possível editar o projeto: " + error.message);
    } else {
      const codigo =
        codigoInformado ||
        `CAD_${nome
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 30)}_${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const { error } = await supabase.from("obras_projetos").insert({
        codigo,
        nome,
        origem,
        status: "ativo",
      });
      if (error) throw new Error("Não foi possível criar o projeto: " + error.message);
    }

    revalidatePath("/cadastros");
    return { ok: true, message: id ? "Projeto atualizado." : "Projeto criado." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

export async function alternarProjetoAction(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await requireGestao();
    const id = texto(formData, "id");
    const status = texto(formData, "status");
    if (!id) throw new Error("Projeto inválido.");

    const { error } = await supabase
      .from("obras_projetos")
      .update({
        status: status === "ativo" ? "inativo" : "ativo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw new Error("Não foi possível alterar o projeto: " + error.message);

    revalidatePath("/cadastros");
    return { ok: true, message: status === "ativo" ? "Projeto desativado." : "Projeto reativado." };
  } catch (error) {
    return { ok: false, message: erroMensagem(error) };
  }
}

// Mantém a lista de módulos referenciada no bundle do servidor e impede que
// uma permissão arbitrária fora da allowlist seja persistida por payload manual.
void MODULOS_GOVERNANCA;
