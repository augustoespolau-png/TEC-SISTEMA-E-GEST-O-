"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Mantém a folha aberta atualizada sem desmontar o componente e sem perder
 * período, projeto ou filtros escolhidos. Indicadores já recarrega no evento
 * de foco; aqui reutilizamos esse mesmo caminho quando a base muda e mantemos
 * um polling leve como fallback caso Realtime não esteja publicado para uma
 * das tabelas.
 */
export default function IndicadoresSincronizacao() {
  useEffect(() => {
    const supabase = createClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const atualizar = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        if (document.visibilityState === "visible") {
          window.dispatchEvent(new Event("focus"));
        }
      }, 350);
    };

    const canal = supabase
      .channel("indicadores-auditoria-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "produto_auditorias" },
        atualizar
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "produto_desvios" },
        atualizar
      )
      .subscribe();

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, 15000);

    return () => {
      if (debounce) clearTimeout(debounce);
      window.clearInterval(intervalo);
      void supabase.removeChannel(canal);
    };
  }, []);

  return null;
}
