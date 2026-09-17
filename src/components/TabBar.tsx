"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LogoTecverde from "@/components/LogoTecverde";
import BotaoTema from "@/components/BotaoTema";
import NomeSistema from "@/components/NomeSistema";
import {
  pode,
  type ModuloAcesso,
  type PermissoesUsuario,
} from "@/lib/permissoes";
import type { Role } from "@/lib/types";

const TABS: {
  href: string;
  rotulo: string;
  papeis: Role[];
  modulo: ModuloAcesso;
}[] = [
  {
    href: "/auditoria",
    rotulo: "Auditoria",
    papeis: ["gestao"],
    modulo: "AUDITORIA",
  },
  {
    href: "/consultar",
    rotulo: "Consultar",
    papeis: ["operador", "consultor", "gestao"],
    modulo: "AUDITORIA",
  },
  {
    href: "/indicadores",
    rotulo: "Indicadores",
    papeis: ["consultor", "gestao"],
    modulo: "INDICADORES",
  },
  {
    href: "/historico",
    rotulo: "Histórico",
    papeis: ["gestao"],
    modulo: "HISTÓRICO",
  },
  {
    href: "/configuracoes",
    rotulo: "Config.",
    papeis: ["gestao"],
    modulo: "CONFIGURAÇÃO",
  },
  {
    href: "/usuarios",
    rotulo: "Usuários",
    papeis: ["gestao"],
    modulo: "CADASTROS",
  },
];

export const FOLHAS_INDICADORES: { id: string; rotulo: string }[] = [
  { id: "fpy", rotulo: "FPY" },
  { id: "desvios", rotulo: "Qualidade" },
  { id: "fluxo", rotulo: "Fluxo" },
  { id: "comparativos", rotulo: "Comparativos" },
];

export function folhasDoPapel(role: Role) {
  return role === "operador"
    ? FOLHAS_INDICADORES.filter((f) => f.id === "fpy")
    : FOLHAS_INDICADORES;
}

export default function TabBar({
  role,
  nome,
  permissoes,
}: {
  role: Role;
  nome: string;
  permissoes?: PermissoesUsuario;
}) {
  const pathname = usePathname();
  const busca = useSearchParams();
  const router = useRouter();
  const abas = TABS.filter((t) =>
    permissoes ? pode(permissoes, t.modulo, "ver") : t.papeis.includes(role)
  );
  const folhaAtual = busca.get("folha") ?? "fpy";
  const [weinmannAberto, setWeinmannAberto] = useState(true);
  const moduloAtivo = abas.some((t) => pathname === t.href);

  if (pathname === "/painel") return null;

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="topo">
      <div className="topo-linha">
        <Link href="/consultar" className="flex min-w-0 items-center gap-2">
          <LogoTecverde />
          <NomeSistema />
        </Link>

        <nav className="abas flex-1">
          <button
            type="button"
            className={`modulo-weinmann ${moduloAtivo ? "on" : ""}`}
            onClick={() => setWeinmannAberto((aberto) => !aberto)}
            aria-expanded={weinmannAberto}
            aria-controls="menu-weinmann"
          >
            <span>WEINMANN</span>
            <svg
              className={weinmannAberto ? "aberto" : ""}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {weinmannAberto && (
            <div id="menu-weinmann" className="menu-weinmann" role="group">
              {abas.map((t) => (
                <Fragment key={t.href}>
                  <Link
                    href={t.href}
                    className={`aba ${pathname === t.href ? "on" : ""}`}
                  >
                    {t.rotulo}
                  </Link>
                  {t.href === "/indicadores" &&
                    pathname === "/indicadores" &&
                    folhasDoPapel(role).length > 1 &&
                    folhasDoPapel(role).map((f) => (
                      <Link
                        key={f.id}
                        href={`/indicadores?folha=${f.id}`}
                        className={`aba aba-filha ${folhaAtual === f.id ? "on" : ""}`}
                      >
                        {f.rotulo}
                      </Link>
                    ))}
                </Fragment>
              ))}
            </div>
          )}
        </nav>

        <div className="rodape-topo">
          <span className="hidden text-[11px] text-ink-3 sm:inline">{nome}</span>
          <BotaoTema />
          <button onClick={sair} className="btn">
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
