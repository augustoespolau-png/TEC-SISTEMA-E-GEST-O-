"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import LogoTecverde from "@/components/LogoTecverde";
import { NOME_SISTEMA } from "@/components/NomeSistema";
import BotaoTema from "@/components/BotaoTema";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    if (error) {
      toast.error("E-mail ou senha inválidos.");
      setEnviando(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-5">
      <div className="absolute top-4 right-4">
        <BotaoTema />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <LogoTecverde className="grande" />
          <p className="mt-4 text-center text-[15px] font-semibold tracking-[0.02em] text-ink">
            {NOME_SISTEMA}
          </p>
        </div>

        <form onSubmit={entrar} className="cartao grid gap-3.5">
          <div>
            <label className="rotulo">E-mail</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="campo"
              placeholder="voce@empresa.com.br"
            />
          </div>

          <div>
            <label className="rotulo">Senha</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="campo"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="btn btn-forte mt-1 w-full"
            style={{ padding: "12px 16px", fontSize: 14.5 }}
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11.5px] text-ink-3">
          Acesso restrito. Solicite sua conta à gestão.
        </p>
      </div>
    </main>
  );
}
