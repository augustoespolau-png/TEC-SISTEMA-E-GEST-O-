"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LogoTecverde from "@/components/LogoTecverde";
import BotaoTema from "@/components/BotaoTema";
import NomeSistema from "@/components/NomeSistema";
import {
  canModule,
  type GovernanceModule,
  type GovernancePermission,
} from "@/lib/governanca-types";
import type { Role } from "@/lib/types";

/* A aba Registrar saiu do ar: a auditoria virou o único caminho de
   entrada de erro, porque ela também diz quantas paredes foram
   conferidas — sem isso o FPY não tem denominador. Como religar está
   no comentário de src/app/(app)/page.tsx. */
const TABS: {
  href: string;
  rotulo: string;
  papeis: Role[];
  modulo: GovernanceModule;
}[] = [
  /* O CONSULTOR NÃO ENTRA NA AUDITORIA. Antes ele entrava "só para
     ler" — a tela escondia as ações e o banco recusava a escrita —,
     mas tela de operação com tudo desligado convida a tentar. A
     CONSULTA ele tem, a pedido: lá o cartão aberto mostra o que está
     escrito e o formulário inteiro some (ver OcorrenciaCard).
     E isto NÃO é só menu: a página da auditoria confere o papel no
     servidor e manda o consultor para /indicadores. Esconder aba é
     cortesia; a trava está lá e na RLS. */
  {
    href: "/auditoria",
    rotulo: "Auditoria",
    papeis: ["gestao"],
    modulo: "AUDITORIA",
  },
  {
    href: "/consultar",
    rotulo: "Consultar",
    papeis: ["consultor", "gestao"],
    modulo: "CONSULTA",
  },
  {
    href: "/indicadores",
    rotulo: "Indicadores",
    /* O OPERADOR entra aqui, a pedido, e só na folha de FPY: ele
       precisa ver quanta parede passa de primeira, que é o resultado do
       trabalho dele. As outras três folhas continuam de gestão — ver
       FOLHAS_DO_PAPEL logo abaixo. */
    /* Porta unica dos paineis. O antigo /painel saiu do menu e virou a
       folha "Execucao" daqui — dois botoes levando a leituras da mesma
       coisa so faziam a pessoa escolher errado. A rota continua de pe
       para quem tem o endereco salvo ou uma TV apontada para ela. */
    papeis: ["operador", "consultor", "gestao"],
    modulo: "INDICADORES",
  },
  {
    href: "/historico",
    rotulo: "Histórico",
    papeis: ["gestao"],
    modulo: "HISTORICO",
  },
  {
    href: "/configuracoes",
    rotulo: "Config.",
    papeis: ["gestao"],
    modulo: "CONFIGURACOES",
  },
];

/* Cadastros é Administração: fica fora do agrupamento operacional
   WEINMANN e aparece como uma entrada própria na coluna lateral. */
const ADMIN_NAV = {
  href: "/cadastros",
  rotulo: "Cadastros",
  papeis: ["gestao"] as Role[],
  modulo: "CADASTROS" as GovernanceModule,
};

/* As folhas dos indicadores moram na LATERAL, aninhadas sob a aba
   Indicadores: sao cinco destinos que so existem dentro dela, e como
   abas de uma segunda linha disputavam a largura com o topo. A folha
   escolhida viaja pela URL (?folha=), e nao por estado interno, para o
   link poder ser marcado, compartilhado e aberto direto. */
export const FOLHAS_INDICADORES: { id: string; rotulo: string }[] = [
  { id: "fpy", rotulo: "FPY" },
  { id: "desvios", rotulo: "Qualidade" },
  { id: "fluxo", rotulo: "Fluxo" },
  { id: "comparativos", rotulo: "Comparativos" },
];

/* Quais folhas cada papel alcança. O operador vê o FPY e nada mais: é
   o indicador do trabalho dele. Esconder as outras é só metade — a
   página confere isto de novo, senão bastava digitar ?folha=desvios. */
export function folhasDoPapel(role: Role) {
  return role === "operador"
    ? FOLHAS_INDICADORES.filter((f) => f.id === "fpy")
    : FOLHAS_INDICADORES;
}

export default function TabBar({
  role,
  nome,
  permissions,
}: {
  role: Role;
  nome: string;
  permissions: GovernancePermission[];
}) {
  const pathname = usePathname();
  const busca = useSearchParams();
  const router = useRouter();
  const abas = TABS.filter(
    (t) => t.papeis.includes(role) && canModule(permissions, t.modulo),
  );
  const adminVisivel =
    ADMIN_NAV.papeis.includes(role) && canModule(permissions, ADMIN_NAV.modulo);
  const folhaAtual = busca.get("folha") ?? "fpy";
  const [weinmannAberto, setWeinmannAberto] = useState(true);
  const moduloAtivo = abas.some((t) => pathname === t.href);

  // o Painel tem cabeçalho próprio, com período e modo TV
  // o painel tem cabeçalho próprio, com projeto, período e modo TV
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

        {/* no celular a navegação fica na barra de baixo (NavInferior);
            a própria classe .abas se esconde abaixo de 1024px */}
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
                    /* uma folha só não é escolha: para o operador a lista
                       some, em vez de virar um botão sozinho aceso */
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

        {adminVisivel && (
          <Link
            href={ADMIN_NAV.href}
            className={`aba aba-admin ${pathname === ADMIN_NAV.href ? "on" : ""}`}
            aria-current={pathname === ADMIN_NAV.href ? "page" : undefined}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 5.5h16v13H4z" />
              <path d="M8 9h8M8 13h5M8 17h3" />
            </svg>
            <span>{ADMIN_NAV.rotulo}</span>
          </Link>
        )}

        {/* .rodape-topo empurra para a direita no celular e para o pe
            da coluna quando isto vira barra lateral no PC */}
        <div className="rodape-topo">
          <span className="hidden text-[11px] text-ink-3 sm:inline">
            {nome}
          </span>
          <BotaoTema />
          <button onClick={sair} className="btn">
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
