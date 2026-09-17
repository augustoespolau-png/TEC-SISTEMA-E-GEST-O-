"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AcessoNegadoPage() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-5">
      <section className="cartao w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-alta)_14%,transparent)] text-xl text-alta">
          !
        </div>
        <h1 className="text-lg font-semibold text-ink">Acesso temporariamente indisponível</h1>
        <p className="sub mx-auto mt-2 max-w-sm">
          Esta conta está bloqueada ou suspensa. Fale com a Gestão para revisar
          o acesso ao sistema.
        </p>
        <button
          type="button"
          className="btn btn-forte mt-5"
          onClick={sair}
          disabled={saindo}
        >
          {saindo ? "Saindo…" : "Sair desta conta"}
        </button>
      </section>
    </main>
  );
}
