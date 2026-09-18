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
import { CADEIA_MADEIRA_MODULOS } from "@/lib/cadeiaMadeira";

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

/* Resíduos é um módulo operacional independente, fora do grupo WEINMANN. */
const RESIDUOS_NAV = {
  href: "/residuos",
  rotulo: "Resíduos",
  papeis: ["operador", "consultor", "gestao"] as Role[],
  modulo: "RESÍDUOS" as GovernanceModule,
};

const CADEIA_MADEIRA_NAV = {
  href: "/cadeia-madeira",
  rotulo: "Cadeia da Madeira",
  papeis: ["operador", "consultor", "gestao"] as Role[],
  modulo: "CADEIA_MADEIRA" as GovernanceModule,
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
  const residuosVisivel =
    RESIDUOS_NAV.papeis.includes(role) && canModule(permissions, RESIDUOS_NAV.modulo);
  const cadeiaMadeiraVisivel =
    CADEIA_MADEIRA_NAV.papeis.includes(role) &&
    canModule(permissions, CADEIA_MADEIRA_NAV.modulo);
  const folhaAtual = busca.get("folha") ?? "fpy";
  const cadeiaModuloParam = busca.get("modulo");
  const cadeiaModuloAtual = cadeiaModuloParam === "recebimento"
    ? "auditoria"
    : cadeiaModuloParam ?? CADEIA_MADEIRA_MODULOS[0].id;
  const cadeiaNaRota = pathname === CADEIA_MADEIRA_NAV.href;
  const [weinmannAberto, setWeinmannAberto] = useState(!cadeiaNaRota);
  const [cadeiaMadeiraAberta, setCadeiaMadeiraAberta] = useState(cadeiaNaRota);
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
            onClick={() => setWeinmannAberto((aberto) => {
              const proximo = !aberto;
              if (proximo) setCadeiaMadeiraAberta(false);
              return proximo;
            })}
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

        {residuosVisivel && (
          <Link
            href={RESIDUOS_NAV.href}
            className={`aba aba-admin ${pathname === RESIDUOS_NAV.href ? "on" : ""}`}
            aria-current={pathname === RESIDUOS_NAV.href ? "page" : undefined}
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
              <path d="M5 5h14v14H5z" />
              <path d="M8 9h8M8 13h5M8 17h4" />
            </svg>
            <span>{RESIDUOS_NAV.rotulo}</span>
          </Link>
        )}

        {cadeiaMadeiraVisivel && (
          <div className="cadeia-lateral">
            <button
              type="button"
              className={`aba aba-admin cadeia-lateral-toggle ${cadeiaNaRota ? "on" : ""}`}
              onClick={() => {
                const proximo = !cadeiaMadeiraAberta;
                setCadeiaMadeiraAberta(proximo);
                if (proximo) {
                  setWeinmannAberto(false);
                  if (!cadeiaNaRota) router.push(CADEIA_MADEIRA_MODULOS[0].href);
                }
              }}
              aria-expanded={cadeiaMadeiraAberta}
              aria-controls="menu-cadeia-madeira"
            >
              <span className="cadeia-lateral-label">
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
                  <path d="M12 21V8" />
                  <path d="m12 13-5-5" />
                  <path d="m12 16 6-6" />
                  <path d="M8.5 21h7" />
                  <path d="M8 8.5 5.5 5 9 5.5 11 2l2 3.5L16.5 5 14 8.5" />
                  <path d="m14 15 3.5-3 1.5 3.5" />
                </svg>
                <span>{CADEIA_MADEIRA_NAV.rotulo}</span>
              </span>
              <svg className={cadeiaMadeiraAberta ? "aberto" : ""} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {cadeiaMadeiraAberta && (
              <div id="menu-cadeia-madeira" className="menu-cadeia-lateral" role="group" aria-label="Módulos da Cadeia da Madeira">
                {CADEIA_MADEIRA_MODULOS.map((item) => (
                  <Link key={item.id} href={item.href} className={`aba aba-filha ${cadeiaNaRota && cadeiaModuloAtual === item.id ? "on" : ""}`}>
                    {item.rotulo}
                  </Link>
                ))}
              </div>
            )}
          </div>
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
