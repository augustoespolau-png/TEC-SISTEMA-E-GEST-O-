"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  canModule,
  type GovernanceModule,
  type GovernancePermission,
} from "@/lib/governanca-types";
import type { Role } from "@/lib/types";
import { CADEIA_MADEIRA_MODULOS } from "@/lib/cadeiaMadeira";

/*
 * Navegação de celular: barra fixa na base, ao alcance do polegar.
 * No PC ela some — lá as abas ficam no cabeçalho, junto do logo.
 */

const ITENS: {
  href: string;
  rotulo: string;
  papeis: Role[];
  modulo: GovernanceModule;
  icone: React.ReactNode;
}[] = [
  {
    href: "/auditoria",
    rotulo: "Auditoria",
    // o operador ficou só com a consulta, a pedido (ver TabBar.tsx)
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
    modulo: "CONSULTA",
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
    /* FPY, desvios e comparativo mensal: leitura de diretoria. O
       CONSULTOR entra aqui: no celular ele não tinha esta aba e ficava
       preso na consulta, sem alcançar o painel de jeito nenhum.
       O OPERADOR entra na folha de FPY e só nela (ver TabBar). */
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
    modulo: "HISTORICO",
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
    modulo: "CONFIGURACOES",
    icone: (
      <Icone>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
      </Icone>
    ),
  },
];

const ADMIN_ITEM = {
  href: "/cadastros",
  rotulo: "Cadastros",
  papeis: ["gestao"] as Role[],
  modulo: "CADASTROS" as GovernanceModule,
};

const RESIDUOS_ITEM = {
  href: "/residuos",
  rotulo: "Resíduos",
  papeis: ["operador", "consultor", "gestao"] as Role[],
  modulo: "RESÍDUOS" as GovernanceModule,
};

const CADEIA_MADEIRA_ITEM = {
  href: "/cadeia-madeira",
  rotulo: "Cadeia da Madeira",
  papeis: ["operador", "consultor", "gestao"] as Role[],
  modulo: "CADEIA_MADEIRA" as GovernanceModule,
};

export default function NavInferior({
  role,
  permissions,
}: {
  role: Role;
  permissions: GovernancePermission[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const busca = useSearchParams();
  const itens = ITENS.filter(
    (i) => i.papeis.includes(role) && canModule(permissions, i.modulo),
  );
  const cadastrosVisivel =
    ADMIN_ITEM.papeis.includes(role) && canModule(permissions, ADMIN_ITEM.modulo);
  const residuosVisivel =
    RESIDUOS_ITEM.papeis.includes(role) && canModule(permissions, RESIDUOS_ITEM.modulo);
  const cadeiaMadeiraVisivel =
    CADEIA_MADEIRA_ITEM.papeis.includes(role) &&
    canModule(permissions, CADEIA_MADEIRA_ITEM.modulo);
  const [aberto, setAberto] = useState(false);
  const [cadeiaAberta, setCadeiaAberta] = useState(false);
  const moduloAtivo = itens.some((i) => pathname === i.href);
  const cadeiaNaRota = pathname === CADEIA_MADEIRA_ITEM.href;
  const cadeiaModuloAtual = busca.get("modulo") ?? CADEIA_MADEIRA_MODULOS[0].id;

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

      {cadastrosVisivel && (
        <Link
          href={ADMIN_ITEM.href}
          className={`nav-admin-cadastros ${pathname === ADMIN_ITEM.href ? "on" : ""}`}
          aria-current={pathname === ADMIN_ITEM.href ? "page" : undefined}
        >
          <Icone>
            <path d="M4 5.5h16v13H4z" />
            <path d="M8 9h8M8 13h5M8 17h3" />
          </Icone>
          {ADMIN_ITEM.rotulo}
        </Link>
      )}

      {residuosVisivel && (
        <Link
          href={RESIDUOS_ITEM.href}
          className={`nav-admin-cadastros ${pathname === RESIDUOS_ITEM.href ? "on" : ""}`}
          aria-current={pathname === RESIDUOS_ITEM.href ? "page" : undefined}
        >
          <Icone>
            <path d="M5 5h14v14H5z" />
            <path d="M8 9h8M8 13h5M8 17h4" />
          </Icone>
          {RESIDUOS_ITEM.rotulo}
        </Link>
      )}

      {cadeiaMadeiraVisivel && cadeiaAberta && (
        <div id="menu-cadeia-mobile" className="menu-cadeia-mobile" role="menu" aria-label="Módulos da Cadeia da Madeira">
          <div className="menu-cadeia-mobile-titulo">CADEIA DA MADEIRA</div>
          {CADEIA_MADEIRA_MODULOS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cadeiaNaRota && cadeiaModuloAtual === item.id ? "on" : ""}
              aria-current={cadeiaNaRota && cadeiaModuloAtual === item.id ? "page" : undefined}
              onClick={() => setCadeiaAberta(false)}
              role="menuitem"
            >
              {item.rotulo}
            </Link>
          ))}
        </div>
      )}

      {cadeiaMadeiraVisivel && (
        <button
          type="button"
          className={`nav-admin-cadastros nav-cadeia-toggle ${cadeiaNaRota ? "on" : ""}`}
          onClick={() => {
            const proximo = !cadeiaAberta;
            setCadeiaAberta(proximo);
            setAberto(false);
            if (proximo && !cadeiaNaRota) router.push(CADEIA_MADEIRA_MODULOS[0].href);
          }}
          aria-expanded={cadeiaAberta}
          aria-controls="menu-cadeia-mobile"
        >
          <Icone>
            <path d="M12 21V8" />
            <path d="m12 13-5-5M12 16l6-6M8.5 21h7" />
            <path d="M8 8.5 5.5 5 9 5.5 11 2l2 3.5L16.5 5 14 8.5" />
          </Icone>
          {CADEIA_MADEIRA_ITEM.rotulo}
        </button>
      )}

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
