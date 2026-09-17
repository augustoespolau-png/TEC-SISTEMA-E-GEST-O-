"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LogoTecverde from "@/components/LogoTecverde";
import BotaoTema from "@/components/BotaoTema";
import NomeSistema from "@/components/NomeSistema";
import { canAccess, isManagement, type AccessSnapshot } from "@/lib/access";
import type { Role } from "@/lib/types";

const TABS = [
  { href: "/auditoria", rotulo: "Auditoria", modulo: "AUDITORIA" },
  { href: "/consultar", rotulo: "Consultar", modulo: "AUDITORIA" },
  { href: "/indicadores", rotulo: "Indicadores", modulo: "INDICADORES" },
  { href: "/historico", rotulo: "Histórico", modulo: "HISTÓRICO" },
  { href: "/configuracoes", rotulo: "Config.", modulo: "CONFIGURAÇÃO", gestao: true },
  { href: "/cadastros", rotulo: "Cadastros", modulo: "ADMINISTRAÇÃO", gestao: true },
] as const;

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
  access,
}: {
  role: Role;
  nome: string;
  access: AccessSnapshot;
}) {
  const pathname = usePathname();
  const busca = useSearchParams();
  const router = useRouter();
  const abas = TABS.filter((t) =>
    t.gestao ? isManagement(access) : canAccess(access, t.modulo, "ver")
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
                  {t.href === "/indicadores" && pathname === "/indicadores" &&
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
          <button onClick={sair} className="btn">Sair</button>
        </div>
      </div>
    </header>
  );
}
