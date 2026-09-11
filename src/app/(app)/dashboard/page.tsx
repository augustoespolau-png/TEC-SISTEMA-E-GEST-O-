import { redirect } from "next/navigation";

/*
 * O painel antigo saiu do ar. Quem chegar aqui vai para o painel atual.
 *
 * A rota continua existindo de propósito, em vez de virar 404: existe
 * link salvo e histórico de navegador apontando para /dashboard, e é
 * melhor cair no painel novo do que numa página de erro.
 *
 * O CÓDIGO DELE NÃO FOI APAGADO. Continua inteiro em:
 *
 *   src/components/painel/   14 componentes — Pareto, mapa de calor
 *                            setor × tipo, densidade de erros com limiar
 *                            ajustável, fila de pendências priorizada,
 *                            evolução semanal por setor, diagnóstico por
 *                            posição de parede, eficiência de tratativa,
 *                            tendência por criticidade, idade das
 *                            pendências, fluxo entram × resolvidas.
 *
 *   src/lib/dashboard.ts     as agregações. Este arquivo continua EM USO
 *                            pelo painel atual: tipos, períodos, recortes
 *                            e helpers de data vêm daqui.
 *
 * PARA RELIGAR: troque este redirect pela leitura de perfil que as outras
 * páginas fazem e devolva <PainelProducao role={...} />; depois ponha a
 * rota de volta em TabBar.tsx e NavInferior.tsx. O componente está
 * inteiro e continua compilando.
 */
export default async function DashboardAposentado() {
  /* Vai para Indicadores, nao para /painel: a porta unica dos paineis
     agora e aquela, e o painel antigo virou a folha "Execucao" de la. */
  redirect("/indicadores");
}
