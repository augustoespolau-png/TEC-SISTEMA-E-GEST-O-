import { META, type EstadoParede } from "@/lib/painel2";

/*
 * As cores dos quatro estados de parede.
 *
 * São três matizes, não quatro. A quarta cor precisaria caber entre o
 * azul e o vermelho, e roxo, rosa e magenta todos ficam a ΔE 1–4 do azul
 * em deuteranopia — indistinguíveis lado a lado. Testado nos dois temas
 * no script da skill dataviz; não é limitação de fundo, é a natureza da
 * confusão azul/roxo para quem não separa verde e vermelho.
 *
 * Então "aguardando aprovação" usa o MESMO azul de "retrabalhada", com
 * hachura. Além de resolver a distinção, diz a coisa certa: é um
 * retrabalho, só que ainda não confirmado. Listrado = provisório.
 */

export const COR_ESTADO: Record<EstadoParede, string> = {
  ACEITA: "var(--color-baixa)",
  RETRABALHADA: "var(--color-info)",
  AGUARDA_APROVACAO: "var(--color-info)",
  EM_RETRABALHO: "var(--color-alta)",
};

/** Preenchimento pronto para o style, já com a hachura quando é o caso. */
export function fundoEstado(e: EstadoParede): string {
  if (e !== "AGUARDA_APROVACAO") return COR_ESTADO[e];
  return `repeating-linear-gradient(135deg, var(--color-info) 0 4px, color-mix(in srgb, var(--color-info) 45%, var(--color-papel)) 4px 8px)`;
}

/** Ordem de leitura: do resolvido ao pendente, sempre a mesma. */
export const ORDEM_ESTADOS: EstadoParede[] = [
  "ACEITA",
  "RETRABALHADA",
  "AGUARDA_APROVACAO",
  "EM_RETRABALHO",
];

/*
 * A meta tem UM dono: META.fpy, em lib/painel2.ts, alimentado pelo
 * parâmetro fpy_meta do banco. Antes existiam duas — 95% aqui e 70% no
 * gráfico de evolução — e o painel se contradizia na mesma tela.
 *
 * Quem tem a meta carregada do banco passa no segundo argumento; quem
 * não tem cai no padrão, que é o mesmo valor.
 */
export function corDoFpy(fpy: number | null, meta = META.fpy): string {
  if (fpy === null) return "var(--color-ink-3)";
  if (fpy >= meta) return "var(--color-baixa)";
  // 3/4 do caminho até a meta: perto, mas ainda não é verde
  if (fpy >= meta * 0.75) return "var(--color-media)";
  return "var(--color-alta)";
}
