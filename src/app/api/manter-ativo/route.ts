import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/*
 * Batimento diário: mantém o projeto do Supabase acordado.
 *
 * O plano gratuito pausa o banco após 7 dias sem atividade. Uma tarefa
 * agendada no Vercel (ver vercel.json) chama esta rota todo dia, que por
 * sua vez faz uma consulta real ao banco. Com uso normal da fábrica isso
 * nem seria necessário — é a garantia para férias coletivas e feriados
 * prolongados.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) {
    return NextResponse.json(
      { ok: false, erro: "variáveis do Supabase ausentes" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, chave, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("manter_ativo");

  if (error) {
    return NextResponse.json(
      { ok: false, erro: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    bancoRespondeuEm: data,
    mensagem: "Projeto mantido ativo.",
  });
}
