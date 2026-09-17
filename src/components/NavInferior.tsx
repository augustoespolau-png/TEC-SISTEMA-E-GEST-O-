"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  pode,
  type ModuloAcesso,
  type PermissoesUsuario,
} from "@/lib/permissoes";
import type { Role } from "@/lib/types";

const ITENS: {
  href: string;
  rotulo: string;
  papeis: Role[];
  modulo: ModuloAcesso;
  icone: React.ReactNode;
}[] = [
  {
    href: "/auditoria",
    rotulo: "Auditoria",
    papeis: ["gestao"],
    modulo: "AUDITORIA",
    icone: (
      <Icone>
        <path d="M4 4h13l3 3v13H4z" />
        <path d="m8.5 12.5 2.5 2.5 4.5-5" />
      </Icone>
    ),
  },
  {
    href: "/consultar",
    rotulo: "Consultar",
    papeis: ["operador", "consultor", "gestao"],
    modulo: "AUDITORIA",
    icone: (
      <Icone>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.5 4.5" />
      </Icone>
    ),
  },
  {
    href: "/indicadores",
    rotulo: "Indicadores",
    papeis: ["operador", "consultor", "gestao"],
    modulo: "INDICADORES",
    icone: (
      <Icone>
        <path d="M3 17.5 9 11l4 4 8-8.5" />
        <path d="M15.5 6.5H21v5.5" />
      </Icone>
    ),
  },
  {
    href: "/historico",
    rotulo: "Histórico",
    papeis: ["gestao"],
    modulo: "HISTÓRICO",
    icone: (
      <Icone>
        <path d="M12 8v4.5l3 2" />
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
        <path d="M3 4.5V9h4.5" />
      </Icone>
    ),
  },
  {
    href: "/configuracoes",
    rotulo: "Config.",
    papeis: ["gestao"],
    modulo: "CONFIGURAÇÃO",
    icone: (
      <Icone>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
      </Icone>
    ),
  },
  {
    href: "/usuarios",
    rotulo: "Usuários",
    papeis: ["gestao"],
    modulo: "CADASTROS",
    icone: (
      <Icone>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19c.6-3.4 2.5-5 5.5-5s4.9 1.6 5.5 5" />
        <path d="M17 8h4M19 6v4" />
      </Icone>
    ),
  },
];

export default function NavInferior({
  role,
  permissoes,
}: {
  role: Role;
  permissoes?: PermissoesUsuario;
}) {
  const pathname = usePathname();
  const itens = ITENS.filter((i) =>
    permissoes ? pode(permissoes, i.modulo, "ver") : i.papeis.includes(role)
  );
  const [aberto, setAberto] = useState(false);
  const moduloAtivo = itens.some((i) => pathname === i.href);

  return (
    <nav className="nav-inferior" aria-label="Navegação principal">
      {aberto && (
        <div
          id="menu-weinmann-mobile"
          className="menu-weinmann-mobile"
          role="menu"
          aria-label="Módulo WEINMANN"
        >
          <div className="menu-weinmann-mobile-titulo">WEINMANN</div>
          {itens.map((i) => {
            const ativo = pathname === i.href;
            return (
              <Link
                key={i.href}
                href={i.href}
                className={ativo ? "on" : ""}
                aria-current={ativo ? "page" : undefined}
                onClick={() => setAberto(false)}
                role="menuitem"
              >
                {i.icone}
                {i.rotulo}
              </Link>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className={`nav-modulo-weinmann ${moduloAtivo ? "on" : ""}`}
        onClick={() => setAberto((valor) => !valor)}
        aria-expanded={aberto}
        aria-controls="menu-weinmann-mobile"
      >
        <Icone>
          <path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z" />
          <path d="m4 12 8 4.5 8-4.5" />
          <path d="m4 16.5 8 4.5 8-4.5" />
        </Icone>
        WEINMANN
      </button>
    </nav>
  );
}

function Icone({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}
