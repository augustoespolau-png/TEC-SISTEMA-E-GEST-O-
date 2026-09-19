"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LogoTecverde from "@/components/LogoTecverde";
import BotaoTema from "@/components/BotaoTema";
import NomeSistema from "@/components/NomeSistema";
import IaTecIcone from "@/components/IaTecIcone";
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

/* A consulta inteligente é um módulo próprio. Ela não é uma aba de
   Cadastros: o gestor chega aqui por esta entrada e a rota continua
   protegida no servidor. */
const IA_TEC_NAV = {
  href: "/ia",
  rotulo: "IA-TEC",
  papeis: ["gestao"] as Role[],
  modulo: "IA" as GovernanceModule,
};

const CADEIA_MADEIRA_NAV = {
  href: "/cadeia-madeira",
  rotulo: "Madeira",
  papeis: ["operador", "consultor", "gestao"] as Role[],
  modulo: "CADEIA_MADEIRA" as GovernanceModule,
};

type ModuloNav = "weinmann" | "cadeia" | "ia" | "residuos" | "cadastros";
type ModuloNavSelecionado = { path: string; modulo: ModuloNav } | null;

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
  permissions,
}: {
  role: Role;
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
  const iaTecVisivel =
    IA_TEC_NAV.papeis.includes(role) && canModule(permissions, IA_TEC_NAV.modulo);
  const cadeiaMadeiraVisivel =
    CADEIA_MADEIRA_NAV.papeis.includes(role) &&
    canModule(permissions, CADEIA_MADEIRA_NAV.modulo);
  const folhaAtual = busca.get("folha") ?? "fpy";
  const cadeiaModuloParam = busca.get("modulo");
  const cadeiaModuloAtual = cadeiaModuloParam === "recebimento"
    ? "auditoria"
    : cadeiaModuloParam ?? CADEIA_MADEIRA_MODULOS[0].id;
  const cadeiaNaRota = pathname === CADEIA_MADEIRA_NAV.href;
  const [weinmannAberto, setWeinmannAberto] = useState(false);
  const [cadeiaMadeiraAberta, setCadeiaMadeiraAberta] = useState(false);
  const moduloAtivo = abas.some((t) => pathname === t.href);
  const [moduloSelecionado, setModuloSelecionado] = useState<ModuloNavSelecionado>(null);
  const moduloAtual = moduloSelecionado?.path === pathname
    ? moduloSelecionado.modulo
    : null;
  const selecionarModulo = (modulo: ModuloNav) => {
    setModuloSelecionado({ path: pathname, modulo });
  };
  const limparSelecao = () => setModuloSelecionado(null);

  const weinmannAtivo =
    moduloAtual === "weinmann" ||
    (moduloAtual === null && moduloAtivo && !cadeiaMadeiraAberta);
  const cadeiaAtiva =
    moduloAtual === "cadeia" ||
    (moduloAtual === null && cadeiaNaRota && !weinmannAberto);
  const iaTecAtivo =
    moduloAtual === "ia" ||
    (moduloAtual === null && pathname === IA_TEC_NAV.href);
  const residuosAtivo =
    moduloAtual === "residuos" ||
    (moduloAtual === null && pathname === RESIDUOS_NAV.href);
  const cadastrosAtivo =
    moduloAtual === "cadastros" ||
    (moduloAtual === null && pathname === ADMIN_NAV.href);

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
        <div className="topo-identidade">
          <Link href="/consultar" className="topo-marca">
            <LogoTecverde />
            <NomeSistema />
          </Link>
          {iaTecVisivel && (
            <Link
              href={IA_TEC_NAV.href}
              className={`ia-tec-topo ${iaTecAtivo ? "on" : ""}`}
              aria-current={iaTecAtivo ? "page" : undefined}
              aria-label="Abrir IA-TEC"
              onClick={() => {
                selecionarModulo("ia");
                setWeinmannAberto(false);
                setCadeiaMadeiraAberta(false);
              }}
            >
              <IaTecIcone size={15} />
              <span>IA-TEC</span>
            </Link>
          )}
        </div>

        <div className="topo-navegacao">
        {/* no celular a navegação fica na barra de baixo (NavInferior);
            a própria classe .abas se esconde abaixo de 1024px */}
        <nav className="abas flex-1">
          <button
            type="button"
            className={`modulo-weinmann ${weinmannAtivo ? "on" : ""}`}
            onClick={() => {
              if (!moduloAtivo) {
                const destinoPadrao = abas[0]?.href;
                setWeinmannAberto(false);
                setCadeiaMadeiraAberta(false);
                limparSelecao();
                if (destinoPadrao) router.push(destinoPadrao);
                return;
              }

              const proximo = !weinmannAberto;
              if (proximo) selecionarModulo("weinmann");
              else limparSelecao();
              setWeinmannAberto(proximo);
              setCadeiaMadeiraAberta(false);
            }}
            aria-expanded={weinmannAberto}
            aria-current={weinmannAtivo ? "page" : undefined}
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
                    onClick={() => {
                      selecionarModulo("weinmann");
                      setWeinmannAberto(false);
                      setCadeiaMadeiraAberta(false);
                    }}
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

        {residuosVisivel && (
          <Link
            href={RESIDUOS_NAV.href}
            className={`aba aba-admin ${residuosAtivo ? "on" : ""}`}
            aria-current={residuosAtivo ? "page" : undefined}
            onClick={() => {
              selecionarModulo("residuos");
              setWeinmannAberto(false);
              setCadeiaMadeiraAberta(false);
            }}
          >
            <span>{RESIDUOS_NAV.rotulo}</span>
          </Link>
        )}

        {cadeiaMadeiraVisivel && (
          <div className="cadeia-lateral">
            <button
              type="button"
              className={`aba aba-admin cadeia-lateral-toggle ${cadeiaAtiva ? "on" : ""}`}
              onClick={() => {
                if (!cadeiaNaRota) {
                  setCadeiaMadeiraAberta(false);
                  setWeinmannAberto(false);
                  limparSelecao();
                  router.push(CADEIA_MADEIRA_MODULOS[0].href);
                  return;
                }

                const proximo = !cadeiaMadeiraAberta;
                if (proximo) selecionarModulo("cadeia");
                else limparSelecao();
                setCadeiaMadeiraAberta(proximo);
                setWeinmannAberto(false);
              }}
              aria-expanded={cadeiaMadeiraAberta}
              aria-current={cadeiaAtiva ? "page" : undefined}
              aria-controls="menu-cadeia-madeira"
            >
              <span className="cadeia-lateral-label">
                <span>{CADEIA_MADEIRA_NAV.rotulo}</span>
              </span>
              <svg className={cadeiaMadeiraAberta ? "aberto" : ""} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {cadeiaMadeiraAberta && (
              <div id="menu-cadeia-madeira" className="menu-cadeia-lateral" role="group" aria-label="Módulos da Cadeia da Madeira">
                {CADEIA_MADEIRA_MODULOS.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`aba aba-filha ${cadeiaNaRota && cadeiaModuloAtual === item.id ? "on" : ""}`}
                    onClick={(event) => {
                      if (cadeiaNaRota) {
                        event.preventDefault();
                        window.history.pushState(null, "", item.href);
                      }
                      selecionarModulo("cadeia");
                      setCadeiaMadeiraAberta(false);
                      setWeinmannAberto(false);
                    }}
                  >
                    {item.rotulo}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        </div>

        {/* .rodape-topo empurra as ações para a direita no celular e para o
            pé da coluna quando isto vira barra lateral no PC. */}
        <div className="rodape-topo">
          {adminVisivel && (
            <Link
              href={ADMIN_NAV.href}
              className={`aba aba-admin cadastros-fixo ${cadastrosAtivo ? "on" : ""}`}
              aria-current={cadastrosAtivo ? "page" : undefined}
              onClick={() => {
                selecionarModulo("cadastros");
                setWeinmannAberto(false);
                setCadeiaMadeiraAberta(false);
              }}
            >
              <span>{ADMIN_NAV.rotulo}</span>
            </Link>
          )}
          <BotaoTema />
          <button onClick={sair} className="btn">
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
